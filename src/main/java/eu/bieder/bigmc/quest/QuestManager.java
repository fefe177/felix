package eu.bieder.bigmc.quest;

import eu.bieder.bigmc.BigMC;
import org.bukkit.Bukkit;
import org.bukkit.Material;
import org.bukkit.configuration.ConfigurationSection;
import org.bukkit.entity.Player;

import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.Statement;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Random;
import java.util.Set;
import java.util.UUID;

/**
 * Verwaltet Daily- und Weekly-Quests.
 *
 * Leistung & Sicherheit:
 * - Fortschritt wird im Arbeitsspeicher gehalten (kein DB-Zugriff im Hot-Path
 *   wie BlockBreak); persistiert wird asynchron (alle 60s, beim Quit, beim Claim).
 * - Aktive Quests werden deterministisch aus einem Pool gewaehlt (Seed = Tag/Woche),
 *   sodass alle Spieler dieselben Quests haben und sie automatisch rotieren/zuruecksetzen.
 * - Claim ist dupe-sicher: "claimed" wird vor der Belohnung gesetzt (Hauptthread).
 */
public class QuestManager {

    /** Fortschrittsdaten eines Spielers fuer die aktuellen Perioden. */
    private static class PlayerData {
        String dailyKey, weeklyKey;
        final Map<String, Integer> progress = new HashMap<>();
        final Set<String> claimed = new HashSet<>();
        boolean dirty;
        boolean loaded;
    }

    private final BigMC plugin;

    private final List<Quest> dailyPool = new ArrayList<>();
    private final List<Quest> weeklyPool = new ArrayList<>();
    private final Map<String, Quest> byId = new HashMap<>();
    private int dailyCount, weeklyCount;

    private final Map<UUID, PlayerData> data = new HashMap<>();

    public QuestManager(BigMC plugin) {
        this.plugin = plugin;
        createTable();
        loadQuests();
    }

    private void createTable() {
        plugin.getDatabaseExecutor().execute(conn -> {
            try (Statement st = conn.createStatement()) {
                st.execute("""
                    CREATE TABLE IF NOT EXISTS quest_progress (
                        uuid       TEXT    NOT NULL,
                        quest_id   TEXT    NOT NULL,
                        period_key TEXT    NOT NULL,
                        progress   INTEGER NOT NULL DEFAULT 0,
                        claimed    INTEGER NOT NULL DEFAULT 0,
                        PRIMARY KEY (uuid, quest_id, period_key)
                    );
                """);
            }
        });
    }

    /** Liest die Quest-Pools aus der config.yml. */
    public void loadQuests() {
        dailyPool.clear();
        weeklyPool.clear();
        byId.clear();

        ConfigurationSection root = plugin.getConfigManager().getConfig().getConfigurationSection("quests");
        if (root == null) {
            plugin.getLogger().warning("Kein 'quests'-Abschnitt in der config.yml gefunden.");
            return;
        }
        dailyCount = root.getInt("daily-count", 3);
        weeklyCount = root.getInt("weekly-count", 2);

        loadPool(root.getConfigurationSection("daily"), QuestPeriod.DAILY, dailyPool);
        loadPool(root.getConfigurationSection("weekly"), QuestPeriod.WEEKLY, weeklyPool);
        plugin.getLogger().info("Quests geladen: " + dailyPool.size() + " Daily, " + weeklyPool.size() + " Weekly.");
    }

    private void loadPool(ConfigurationSection sec, QuestPeriod period, List<Quest> target) {
        if (sec == null) return;
        for (String id : sec.getKeys(false)) {
            ConfigurationSection q = sec.getConfigurationSection(id);
            if (q == null) continue;
            QuestObjective objective;
            try {
                objective = QuestObjective.valueOf(q.getString("objective", "BREAK").toUpperCase());
            } catch (IllegalArgumentException e) {
                plugin.getLogger().warning("Quest '" + id + "': unbekanntes objective - uebersprungen.");
                continue;
            }
            Material icon = Material.matchMaterial(q.getString("icon", "PAPER"));
            if (icon == null) icon = Material.PAPER;

            Quest quest = new Quest(id, period, objective,
                    q.getString("filter", ""),
                    Math.max(1, q.getInt("amount", 1)),
                    q.getString("display", id),
                    icon,
                    q.getDouble("reward-money", 0),
                    q.getLong("reward-shards", 0),
                    q.getInt("reward-xp", 0));
            target.add(quest);
            byId.put(id, quest);
        }
    }

    // ----- Perioden-Schluessel -----

    private long epochDay() {
        return LocalDate.now().toEpochDay();
    }

    public String dailyKey() {
        return "D" + epochDay();
    }

    public String weeklyKey() {
        return "W" + (epochDay() / 7);
    }

    // ----- Aktive Quests (deterministisch pro Periode) -----

    public List<Quest> getActive(QuestPeriod period) {
        List<Quest> pool = period == QuestPeriod.DAILY ? dailyPool : weeklyPool;
        int count = period == QuestPeriod.DAILY ? dailyCount : weeklyCount;
        if (pool.size() <= count) return List.copyOf(pool);
        List<Quest> copy = new ArrayList<>(pool);
        long seed = period == QuestPeriod.DAILY ? epochDay() : (epochDay() / 7);
        Collections.shuffle(copy, new Random(seed));
        return List.copyOf(copy.subList(0, count));
    }

    /** Alle aktuell aktiven Quests (Daily + Weekly). */
    public List<Quest> getActiveAll() {
        List<Quest> all = new ArrayList<>(getActive(QuestPeriod.DAILY));
        all.addAll(getActive(QuestPeriod.WEEKLY));
        return all;
    }

    // ----- Spieler laden / entladen -----

    /** Beim Join: sofort leeren Datensatz anlegen, dann async aus DB mergen. */
    public void loadPlayer(UUID uuid) {
        PlayerData d = new PlayerData();
        d.dailyKey = dailyKey();
        d.weeklyKey = weeklyKey();
        data.put(uuid, d);

        final String dk = d.dailyKey, wk = d.weeklyKey;
        plugin.getDatabaseExecutor().query(conn -> {
            Map<String, int[]> rows = new HashMap<>(); // questId -> [progress, claimed]
            try (PreparedStatement ps = conn.prepareStatement(
                    "SELECT quest_id, progress, claimed FROM quest_progress WHERE uuid = ? AND period_key IN (?, ?);")) {
                ps.setString(1, uuid.toString());
                ps.setString(2, dk);
                ps.setString(3, wk);
                try (ResultSet rs = ps.executeQuery()) {
                    while (rs.next()) {
                        rows.put(rs.getString("quest_id"),
                                new int[]{rs.getInt("progress"), rs.getInt("claimed")});
                    }
                }
            }
            return rows;
        }, rows -> {
            PlayerData cur = data.get(uuid);
            if (cur == null || rows == null) return;
            rows.forEach((qid, vals) -> {
                cur.progress.merge(qid, vals[0], Math::max);
                if (vals[1] == 1) cur.claimed.add(qid);
            });
            cur.loaded = true;
        });
    }

    public void unloadPlayer(UUID uuid) {
        flush(uuid);
        data.remove(uuid);
    }

    // ----- Fortschritt -----

    /**
     * Meldet ein Ereignis. Erhoeht den Fortschritt aller passenden aktiven Quests.
     */
    public void handle(Player player, QuestObjective objective, String value, int amount) {
        PlayerData d = data.get(player.getUniqueId());
        if (d == null) return;

        for (Quest q : getActiveAll()) {
            if (!q.matches(objective, value)) continue;
            if (d.claimed.contains(q.id())) continue;
            int cur = d.progress.getOrDefault(q.id(), 0);
            if (cur >= q.amount()) continue;
            int now = Math.min(q.amount(), cur + amount);
            if (now != cur) {
                d.progress.put(q.id(), now);
                d.dirty = true;
                if (now >= q.amount()) {
                    plugin.getMessageManager().send(player, "quests.completed",
                            "%quest%", eu.bieder.bigmc.config.MessageManager.color(q.display()));
                    player.playSound(player.getLocation(), org.bukkit.Sound.ENTITY_PLAYER_LEVELUP, 0.6f, 1.4f);
                }
            }
        }
    }

    public int getProgress(UUID uuid, Quest q) {
        PlayerData d = data.get(uuid);
        return d == null ? 0 : d.progress.getOrDefault(q.id(), 0);
    }

    public boolean isClaimed(UUID uuid, Quest q) {
        PlayerData d = data.get(uuid);
        return d != null && d.claimed.contains(q.id());
    }

    public boolean isComplete(UUID uuid, Quest q) {
        return getProgress(uuid, q) >= q.amount();
    }

    /**
     * Loest die Belohnung einer abgeschlossenen Quest ein (dupe-sicher).
     */
    public boolean claim(Player player, Quest q) {
        PlayerData d = data.get(player.getUniqueId());
        if (d == null) return false;
        if (d.claimed.contains(q.id())) return false;
        if (d.progress.getOrDefault(q.id(), 0) < q.amount()) return false;

        d.claimed.add(q.id());   // zuerst sperren -> kein Doppel-Claim moeglich
        d.dirty = true;

        if (q.rewardMoney() > 0) plugin.getEconomyManager().deposit(player.getUniqueId(), q.rewardMoney());
        if (q.rewardShards() > 0) plugin.getShardsManager().addShards(player.getUniqueId(), q.rewardShards());

        flush(player.getUniqueId());
        return true;
    }

    // ----- Persistenz -----

    /** Schreibt den Fortschritt eines Spielers asynchron in die DB. */
    public void flush(UUID uuid) {
        PlayerData d = data.get(uuid);
        if (d == null || !d.dirty) return;

        // Snapshot fuer den DB-Thread erstellen (Datenstruktur nicht teilen)
        Map<String, int[]> snapshot = new LinkedHashMap<>();
        for (Map.Entry<String, Integer> e : d.progress.entrySet()) {
            snapshot.put(e.getKey(), new int[]{e.getValue(), d.claimed.contains(e.getKey()) ? 1 : 0});
        }
        for (String claimedId : d.claimed) {
            snapshot.computeIfAbsent(claimedId, k -> new int[]{0, 1})[1] = 1;
        }
        final String dk = d.dailyKey, wk = d.weeklyKey;
        final String uuidStr = uuid.toString();
        d.dirty = false;

        plugin.getDatabaseExecutor().execute(conn -> {
            try (PreparedStatement ps = conn.prepareStatement("""
                    INSERT INTO quest_progress (uuid, quest_id, period_key, progress, claimed)
                    VALUES (?, ?, ?, ?, ?)
                    ON CONFLICT(uuid, quest_id, period_key)
                    DO UPDATE SET progress = excluded.progress, claimed = excluded.claimed;
                """)) {
                for (Map.Entry<String, int[]> e : snapshot.entrySet()) {
                    Quest q = byId.get(e.getKey());
                    String key = (q != null && q.period() == QuestPeriod.WEEKLY) ? wk : dk;
                    ps.setString(1, uuidStr);
                    ps.setString(2, e.getKey());
                    ps.setString(3, key);
                    ps.setInt(4, e.getValue()[0]);
                    ps.setInt(5, e.getValue()[1]);
                    ps.addBatch();
                }
                ps.executeBatch();
            }
        });
    }

    /**
     * Periodische Aufgabe: bei Tages-/Wochenwechsel neu laden, sonst speichern.
     */
    public void tick() {
        String curDaily = dailyKey(), curWeek = weeklyKey();
        for (Player p : Bukkit.getOnlinePlayers()) {
            PlayerData d = data.get(p.getUniqueId());
            if (d == null) {
                loadPlayer(p.getUniqueId());
                continue;
            }
            if (!curDaily.equals(d.dailyKey) || !curWeek.equals(d.weeklyKey)) {
                flush(p.getUniqueId());
                loadPlayer(p.getUniqueId()); // ueberschreibt mit frischen Perioden
            } else if (d.dirty) {
                flush(p.getUniqueId());
            }
        }
    }

    /** Beim Plugin-Stop: alle Online-Spieler speichern. */
    public void shutdown() {
        for (Player p : Bukkit.getOnlinePlayers()) {
            flush(p.getUniqueId());
        }
    }

    public Optional<Quest> getQuest(String id) {
        return Optional.ofNullable(byId.get(id));
    }
}
