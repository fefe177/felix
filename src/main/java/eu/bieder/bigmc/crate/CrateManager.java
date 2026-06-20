package eu.bieder.bigmc.crate;

import eu.bieder.bigmc.BigMC;
import org.bukkit.Bukkit;
import org.bukkit.Material;
import org.bukkit.configuration.ConfigurationSection;
import org.bukkit.entity.Player;
import org.bukkit.inventory.ItemStack;

import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.ThreadLocalRandom;

/**
 * Verwaltet Crates und virtuelle Schluessel.
 *
 * Schluessel werden je Spieler pro Crate gezaehlt und persistent gespeichert
 * (jede Aenderung sofort async geschrieben -> restart-/crash-sicher). Belohnungen
 * werden gewichtet ausgelost. Dupe-Schutz: der Schluessel wird VOR der Animation
 * abgezogen, das Ergebnis vorher ermittelt.
 */
public class CrateManager {

    private final BigMC plugin;
    private final Map<String, Crate> crates = new LinkedHashMap<>();

    /** Schluessel-Cache der Online-Spieler: uuid -> (crateId -> anzahl). */
    private final Map<UUID, Map<String, Integer>> keyCache = new HashMap<>();

    public CrateManager(BigMC plugin) {
        this.plugin = plugin;
        createTable();
        loadCrates();
    }

    private void createTable() {
        plugin.getDatabaseExecutor().execute(conn -> {
            try (Statement st = conn.createStatement()) {
                st.execute("""
                    CREATE TABLE IF NOT EXISTS crate_keys (
                        uuid     TEXT    NOT NULL,
                        crate_id TEXT    NOT NULL,
                        amount   INTEGER NOT NULL DEFAULT 0,
                        PRIMARY KEY (uuid, crate_id)
                    );
                """);
            }
        });
    }

    public void loadCrates() {
        crates.clear();
        ConfigurationSection root = plugin.getConfigManager().getConfig().getConfigurationSection("crates");
        if (root == null) {
            plugin.getLogger().warning("Kein 'crates'-Abschnitt in der config.yml gefunden.");
            return;
        }
        for (String id : root.getKeys(false)) {
            ConfigurationSection sec = root.getConfigurationSection(id);
            if (sec == null) continue;
            Material icon = Material.matchMaterial(sec.getString("icon", "CHEST"));
            if (icon == null) icon = Material.CHEST;

            List<CrateReward> rewards = new ArrayList<>();
            int total = 0;
            for (Map<?, ?> raw : sec.getMapList("rewards")) {
                int weight = raw.get("weight") instanceof Number n ? n.intValue() : 1;
                Object rarityObj = raw.get("rarity");
                String rarity = rarityObj != null ? String.valueOf(rarityObj) : "COMMON";
                Object displayObj = raw.get("display");
                String display = displayObj != null ? String.valueOf(displayObj) : "Belohnung";
                double money = raw.get("money") instanceof Number n ? n.doubleValue() : 0;
                long shards = raw.get("shards") instanceof Number n ? n.longValue() : 0;

                Map<Material, Integer> items = new HashMap<>();
                if (raw.get("items") instanceof Map<?, ?> itemMap) {
                    for (Map.Entry<?, ?> e : itemMap.entrySet()) {
                        Material mat = Material.matchMaterial(String.valueOf(e.getKey()));
                        if (mat != null && e.getValue() instanceof Number amt) {
                            items.put(mat, amt.intValue());
                        }
                    }
                }
                List<String> commands = new ArrayList<>();
                if (raw.get("commands") instanceof List<?> cmds) {
                    for (Object c : cmds) commands.add(String.valueOf(c));
                }
                rewards.add(new CrateReward(Math.max(1, weight), rarity, display, money, shards, items, commands));
                total += Math.max(1, weight);
            }
            crates.put(id, new Crate(id, sec.getString("display", id), icon, rewards, total));
        }
        plugin.getLogger().info("Crates geladen: " + crates.size());
    }

    public List<Crate> getCrates() {
        return List.copyOf(crates.values());
    }

    public Optional<Crate> getCrate(String id) {
        return Optional.ofNullable(crates.get(id));
    }

    // ----- Schluessel -----

    public void loadPlayer(UUID uuid) {
        Map<String, Integer> map = new HashMap<>();
        keyCache.put(uuid, map);
        plugin.getDatabaseExecutor().query(conn -> {
            Map<String, Integer> rows = new HashMap<>();
            try (PreparedStatement ps = conn.prepareStatement(
                    "SELECT crate_id, amount FROM crate_keys WHERE uuid = ?;")) {
                ps.setString(1, uuid.toString());
                try (ResultSet rs = ps.executeQuery()) {
                    while (rs.next()) rows.put(rs.getString("crate_id"), rs.getInt("amount"));
                }
            }
            return rows;
        }, rows -> {
            Map<String, Integer> cur = keyCache.get(uuid);
            if (cur != null && rows != null) cur.putAll(rows);
        });
    }

    public void unloadPlayer(UUID uuid) {
        keyCache.remove(uuid);
    }

    public int getKeys(UUID uuid, String crateId) {
        Map<String, Integer> map = keyCache.get(uuid);
        return map == null ? 0 : map.getOrDefault(crateId, 0);
    }

    public void giveKeys(UUID uuid, String crateId, int amount) {
        if (amount <= 0) return;
        Map<String, Integer> map = keyCache.get(uuid);
        if (map != null) map.merge(crateId, amount, Integer::sum);
        plugin.getDatabaseExecutor().execute(conn -> {
            try (PreparedStatement ps = conn.prepareStatement("""
                    INSERT INTO crate_keys (uuid, crate_id, amount) VALUES (?, ?, ?)
                    ON CONFLICT(uuid, crate_id) DO UPDATE SET amount = amount + excluded.amount;
                """)) {
                ps.setString(1, uuid.toString());
                ps.setString(2, crateId);
                ps.setInt(3, amount);
                ps.executeUpdate();
            }
        });
    }

    /** Zieht genau einen Schluessel ab (dupe-sicher). */
    public boolean takeKey(UUID uuid, String crateId) {
        Map<String, Integer> map = keyCache.get(uuid);
        if (map == null) return false;
        int have = map.getOrDefault(crateId, 0);
        if (have <= 0) return false;
        map.put(crateId, have - 1);
        plugin.getDatabaseExecutor().execute(conn -> {
            try (PreparedStatement ps = conn.prepareStatement(
                    "UPDATE crate_keys SET amount = amount - 1 WHERE uuid = ? AND crate_id = ? AND amount > 0;")) {
                ps.setString(1, uuid.toString());
                ps.setString(2, crateId);
                ps.executeUpdate();
            }
        });
        return true;
    }

    // ----- Belohnung -----

    /** Loest eine gewichtete Zufallsbelohnung aus. */
    public CrateReward roll(Crate crate) {
        if (crate.rewards().isEmpty()) return null;
        int r = ThreadLocalRandom.current().nextInt(Math.max(1, crate.totalWeight()));
        int acc = 0;
        for (CrateReward reward : crate.rewards()) {
            acc += reward.weight();
            if (r < acc) return reward;
        }
        return crate.rewards().get(crate.rewards().size() - 1);
    }

    /** Haendigt eine Belohnung aus (Geld, Shards, Items, Befehle). */
    public void giveReward(Player player, CrateReward reward) {
        if (reward.money() > 0) plugin.getEconomyManager().deposit(player.getUniqueId(), reward.money());
        if (reward.shards() > 0) plugin.getShardsManager().addShards(player.getUniqueId(), reward.shards());
        for (Map.Entry<Material, Integer> e : reward.items().entrySet()) {
            Map<Integer, ItemStack> leftover = player.getInventory().addItem(new ItemStack(e.getKey(), e.getValue()));
            leftover.values().forEach(rest -> player.getWorld().dropItemNaturally(player.getLocation(), rest));
        }
        for (String cmd : reward.commands()) {
            Bukkit.dispatchCommand(Bukkit.getConsoleSender(), cmd.replace("%player%", player.getName()));
        }
    }
}
