package eu.bieder.bigmc.battlepass;

import eu.bieder.bigmc.BigMC;
import org.bukkit.Bukkit;
import org.bukkit.Sound;
import org.bukkit.entity.Player;

import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.Statement;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * Battle-Pass-System mit kostenlosem und Premium-Pfad sowie Season-Unterstuetzung.
 *
 * XP kommt aus Quests, Mining, PvP und Events. Pro Season werden Fortschritt,
 * Premium-Status und abgeholte Belohnungen getrennt gespeichert (Season-Spalte),
 * sodass ein Season-Wechsel automatisch zuruecksetzt.
 *
 * Performance/Sicherheit wie bei den Quests: In-Memory-Fortschritt, async-Persistenz,
 * dupe-sicheres Claim (claimed wird vor der Belohnung gesetzt).
 */
public class BattlePassManager {

    private static class PlayerData {
        int xp;
        boolean premium;
        final Set<String> claims = new HashSet<>(); // "F<level>" / "P<level>"
        boolean dirty;
    }

    public enum Track { FREE, PREMIUM }

    private final BigMC plugin;
    private final Map<UUID, PlayerData> data = new HashMap<>();

    // aus der config zwischengespeichert
    private int season, xpPerLevel, maxLevel, xpPerBlock, xpPerMob, xpPerPlayerKill;
    private double premiumCostMoney;
    private long premiumCostShards;

    public BattlePassManager(BigMC plugin) {
        this.plugin = plugin;
        createTables();
        loadConfig();
    }

    private void createTables() {
        plugin.getDatabaseExecutor().execute(conn -> {
            try (Statement st = conn.createStatement()) {
                st.execute("""
                    CREATE TABLE IF NOT EXISTS battlepass (
                        uuid    TEXT    NOT NULL,
                        season  INTEGER NOT NULL,
                        xp      INTEGER NOT NULL DEFAULT 0,
                        premium INTEGER NOT NULL DEFAULT 0,
                        PRIMARY KEY (uuid, season)
                    );
                """);
                st.execute("""
                    CREATE TABLE IF NOT EXISTS battlepass_claims (
                        uuid   TEXT    NOT NULL,
                        season INTEGER NOT NULL,
                        level  INTEGER NOT NULL,
                        track  TEXT    NOT NULL,
                        PRIMARY KEY (uuid, season, level, track)
                    );
                """);
            }
        });
    }

    public void loadConfig() {
        var cfg = plugin.getConfigManager().getConfig();
        season = cfg.getInt("battlepass.season", 1);
        xpPerLevel = Math.max(1, cfg.getInt("battlepass.xp-per-level", 1000));
        maxLevel = Math.max(1, cfg.getInt("battlepass.max-level", 30));
        xpPerBlock = cfg.getInt("battlepass.xp-per-block-mined", 1);
        xpPerMob = cfg.getInt("battlepass.xp-per-mob-kill", 2);
        xpPerPlayerKill = cfg.getInt("battlepass.xp-per-player-kill", 25);
        premiumCostMoney = cfg.getDouble("battlepass.premium-cost-money", 50000);
        premiumCostShards = cfg.getLong("battlepass.premium-cost-shards", 0);
    }

    public int getSeason() { return season; }
    public int getMaxLevel() { return maxLevel; }
    public int getXpPerLevel() { return xpPerLevel; }
    public double getPremiumCostMoney() { return premiumCostMoney; }
    public long getPremiumCostShards() { return premiumCostShards; }

    // ----- Belohnungen aus der config -----

    public BattlePassReward reward(int level, Track track) {
        var cfg = plugin.getConfigManager().getConfig();
        String base = "battlepass.levels." + level + "." + (track == Track.FREE ? "free" : "premium");
        if (cfg.isConfigurationSection(base)) {
            return new BattlePassReward(cfg.getDouble(base + ".money", 0), cfg.getLong(base + ".shards", 0));
        }
        // Fallback-Formel, falls das Level nicht explizit konfiguriert ist
        if (track == Track.FREE) {
            double money = level * cfg.getDouble("battlepass.fallback.free-money-per-level", 250);
            long shards = (level % 5 == 0) ? cfg.getLong("battlepass.fallback.free-shard-milestone", 10) : 0;
            return new BattlePassReward(money, shards);
        } else {
            double money = level * cfg.getDouble("battlepass.fallback.premium-money-per-level", 600);
            long shards = cfg.getLong("battlepass.fallback.premium-shards-per-level", 5);
            return new BattlePassReward(money, shards);
        }
    }

    // ----- Laden / Entladen -----

    public void loadPlayer(UUID uuid) {
        PlayerData d = new PlayerData();
        data.put(uuid, d);
        final int s = season;
        plugin.getDatabaseExecutor().query(conn -> {
            int[] base = {0, 0};
            try (PreparedStatement ps = conn.prepareStatement(
                    "SELECT xp, premium FROM battlepass WHERE uuid = ? AND season = ?;")) {
                ps.setString(1, uuid.toString());
                ps.setInt(2, s);
                try (ResultSet rs = ps.executeQuery()) {
                    if (rs.next()) { base[0] = rs.getInt("xp"); base[1] = rs.getInt("premium"); }
                }
            }
            Set<String> claims = new HashSet<>();
            try (PreparedStatement ps = conn.prepareStatement(
                    "SELECT level, track FROM battlepass_claims WHERE uuid = ? AND season = ?;")) {
                ps.setString(1, uuid.toString());
                ps.setInt(2, s);
                try (ResultSet rs = ps.executeQuery()) {
                    while (rs.next()) claims.add(rs.getString("track") + rs.getInt("level"));
                }
            }
            return new Object[]{base, claims};
        }, result -> {
            PlayerData cur = data.get(uuid);
            if (cur == null || result == null) return;
            int[] base = (int[]) result[0];
            cur.xp = Math.max(cur.xp, base[0]);
            cur.premium = cur.premium || base[1] == 1;
            @SuppressWarnings("unchecked")
            Set<String> claims = (Set<String>) result[1];
            cur.claims.addAll(claims);
        });
    }

    public void unloadPlayer(UUID uuid) {
        flush(uuid);
        data.remove(uuid);
    }

    // ----- XP / Level -----

    public int getXp(UUID uuid) {
        PlayerData d = data.get(uuid);
        return d == null ? 0 : d.xp;
    }

    public int getLevel(UUID uuid) {
        return Math.min(maxLevel, getXp(uuid) / xpPerLevel);
    }

    public boolean isPremium(UUID uuid) {
        PlayerData d = data.get(uuid);
        return d != null && d.premium;
    }

    /** XP gutschreiben; meldet Level-Aufstiege. */
    public void addXp(Player player, int amount) {
        if (amount <= 0) return;
        PlayerData d = data.get(player.getUniqueId());
        if (d == null) return;
        int oldLevel = Math.min(maxLevel, d.xp / xpPerLevel);
        d.xp += amount;
        d.dirty = true;
        int newLevel = Math.min(maxLevel, d.xp / xpPerLevel);
        if (newLevel > oldLevel) {
            plugin.getMessageManager().send(player, "battlepass.levelup", "%level%", String.valueOf(newLevel));
            player.playSound(player.getLocation(), Sound.UI_TOAST_CHALLENGE_COMPLETE, 0.7f, 1.0f);
        }
    }

    // Bequeme Quellen (Mengen aus config)
    public void onMine(Player p) { addXp(p, xpPerBlock); }
    public void onMobKill(Player p) { addXp(p, xpPerMob); }
    public void onPlayerKill(Player p) { addXp(p, xpPerPlayerKill); }

    // ----- Claim / Premium -----

    public boolean isClaimed(UUID uuid, int level, Track track) {
        PlayerData d = data.get(uuid);
        return d != null && d.claims.contains((track == Track.FREE ? "F" : "P") + level);
    }

    public boolean claim(Player player, int level, Track track) {
        PlayerData d = data.get(player.getUniqueId());
        if (d == null) return false;
        if (level < 1 || level > maxLevel) return false;
        if (getLevel(player.getUniqueId()) < level) return false;
        if (track == Track.PREMIUM && !d.premium) return false;
        String key = (track == Track.FREE ? "F" : "P") + level;
        if (d.claims.contains(key)) return false;

        BattlePassReward reward = reward(level, track);
        d.claims.add(key);   // zuerst sperren -> dupe-sicher
        d.dirty = true;
        if (reward.money() > 0) plugin.getEconomyManager().deposit(player.getUniqueId(), reward.money());
        if (reward.shards() > 0) plugin.getShardsManager().addShards(player.getUniqueId(), reward.shards());
        flush(player.getUniqueId());
        return true;
    }

    /** Schaltet den Premium-Pfad frei (Bezahlung mit Geld + optional Shards). */
    public boolean buyPremium(Player player) {
        PlayerData d = data.get(player.getUniqueId());
        if (d == null || d.premium) return false;

        if (!plugin.getEconomyManager().withdraw(player.getUniqueId(), premiumCostMoney)) {
            plugin.getMessageManager().send(player, "economy.not-enough-money");
            return false;
        }
        if (premiumCostShards > 0 && !plugin.getShardsManager().takeShards(player.getUniqueId(), premiumCostShards)) {
            plugin.getEconomyManager().deposit(player.getUniqueId(), premiumCostMoney); // Rueckerstattung
            plugin.getMessageManager().send(player, "shards.not-enough");
            return false;
        }
        d.premium = true;
        d.dirty = true;
        flush(player.getUniqueId());
        return true;
    }

    /** Admin: Level eines (online) Spielers setzen. */
    public boolean adminSetLevel(UUID uuid, int level) {
        PlayerData d = data.get(uuid);
        if (d == null) return false;
        d.xp = Math.max(0, level) * xpPerLevel;
        d.dirty = true;
        flush(uuid);
        return true;
    }

    /** Admin: XP eines (online) Spielers hinzufuegen. */
    public boolean adminAddXp(Player player, int amount) {
        if (data.get(player.getUniqueId()) == null) return false;
        addXp(player, amount);
        flush(player.getUniqueId());
        return true;
    }

    /** Admin: Premium setzen (z.B. als Belohnung). */
    public void setPremium(UUID uuid, boolean premium) {
        PlayerData d = data.get(uuid);
        if (d == null) return;
        d.premium = premium;
        d.dirty = true;
        flush(uuid);
    }

    // ----- Persistenz -----

    public void flush(UUID uuid) {
        PlayerData d = data.get(uuid);
        if (d == null || !d.dirty) return;
        final int xp = d.xp;
        final int prem = d.premium ? 1 : 0;
        final Set<String> claims = new HashSet<>(d.claims);
        final int s = season;
        final String uuidStr = uuid.toString();
        d.dirty = false;

        plugin.getDatabaseExecutor().execute(conn -> {
            try (PreparedStatement ps = conn.prepareStatement("""
                    INSERT INTO battlepass (uuid, season, xp, premium) VALUES (?, ?, ?, ?)
                    ON CONFLICT(uuid, season) DO UPDATE SET xp = excluded.xp, premium = excluded.premium;
                """)) {
                ps.setString(1, uuidStr);
                ps.setInt(2, s);
                ps.setInt(3, xp);
                ps.setInt(4, prem);
                ps.executeUpdate();
            }
            try (PreparedStatement ps = conn.prepareStatement(
                    "INSERT OR IGNORE INTO battlepass_claims (uuid, season, level, track) VALUES (?, ?, ?, ?);")) {
                for (String key : claims) {
                    String track = key.startsWith("F") ? "F" : "P";
                    int level = Integer.parseInt(key.substring(1));
                    ps.setString(1, uuidStr);
                    ps.setInt(2, s);
                    ps.setInt(3, level);
                    ps.setString(4, track);
                    ps.addBatch();
                }
                ps.executeBatch();
            }
        });
    }

    public void flushAll() {
        for (Player p : Bukkit.getOnlinePlayers()) flush(p.getUniqueId());
    }

    /** Liefert die Top-Spieler nach Battle-Pass-XP (fuer Leaderboards). */
    public void topXp(int limit, java.util.function.Consumer<java.util.List<String[]>> callback) {
        final int s = season;
        plugin.getDatabaseExecutor().query(conn -> {
            java.util.List<String[]> list = new java.util.ArrayList<>();
            try (PreparedStatement ps = conn.prepareStatement(
                    "SELECT uuid, xp FROM battlepass WHERE season = ? ORDER BY xp DESC LIMIT ?;")) {
                ps.setInt(1, s);
                ps.setInt(2, limit);
                try (ResultSet rs = ps.executeQuery()) {
                    while (rs.next()) list.add(new String[]{rs.getString("uuid"), rs.getString("xp")});
                }
            }
            return list;
        }, callback);
    }
}
