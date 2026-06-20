package eu.bieder.bigmc.prestige;

import eu.bieder.bigmc.BigMC;
import org.bukkit.Bukkit;
import org.bukkit.entity.Player;

import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.Statement;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

/**
 * Prestige-System: Spieler investieren Geld, um ihr Prestige-Level zu erhoehen
 * und dauerhaft einen Verkaufs-Bonus (sowie Shards je Prestige) zu erhalten.
 *
 * Level werden im Arbeitsspeicher gehalten und async in SQLite gespiegelt.
 */
public class PrestigeManager {

    private final BigMC plugin;
    private final Map<UUID, Integer> levels = new HashMap<>();

    public PrestigeManager(BigMC plugin) {
        this.plugin = plugin;
        createTable();
    }

    private void createTable() {
        plugin.getDatabaseExecutor().execute(conn -> {
            try (Statement st = conn.createStatement()) {
                st.execute("""
                    CREATE TABLE IF NOT EXISTS prestige (
                        uuid  TEXT PRIMARY KEY,
                        name  TEXT NOT NULL,
                        level INTEGER NOT NULL DEFAULT 0
                    );
                """);
            }
        });
    }

    // ----- Config -----

    public int getMaxPrestige() { return plugin.getConfigManager().getConfig().getInt("prestige.max-prestige", 10); }
    public double getBaseCost() { return plugin.getConfigManager().getConfig().getDouble("prestige.base-cost", 100000); }
    public double getCostMultiplier() { return plugin.getConfigManager().getConfig().getDouble("prestige.cost-multiplier", 2.0); }
    public double getSellBonusPercent() { return plugin.getConfigManager().getConfig().getDouble("prestige.sell-bonus-percent", 5.0); }
    public long getRewardShards() { return plugin.getConfigManager().getConfig().getLong("prestige.reward-shards", 50); }

    /** Kosten fuer den Aufstieg von "level" auf "level+1". */
    public double costFor(int level) {
        return getBaseCost() * Math.pow(getCostMultiplier(), level);
    }

    // ----- Laden / Speichern -----

    public void loadPlayer(UUID uuid) {
        plugin.getDatabaseExecutor().query(conn -> {
            int level = 0;
            try (PreparedStatement ps = conn.prepareStatement("SELECT level FROM prestige WHERE uuid = ?;")) {
                ps.setString(1, uuid.toString());
                try (ResultSet rs = ps.executeQuery()) {
                    if (rs.next()) level = rs.getInt("level");
                }
            }
            return level;
        }, level -> levels.put(uuid, level == null ? 0 : level));
    }

    public void unloadPlayer(UUID uuid) {
        levels.remove(uuid);
    }

    public int getLevel(UUID uuid) {
        return levels.getOrDefault(uuid, 0);
    }

    /** Verkaufs-Multiplikator (1.0 + Bonus). */
    public double getSellMultiplier(UUID uuid) {
        return 1.0 + getLevel(uuid) * (getSellBonusPercent() / 100.0);
    }

    /** Wendet den Prestige-Verkaufsbonus auf einen Betrag an. */
    public double applySellBonus(UUID uuid, double base) {
        return base * getSellMultiplier(uuid);
    }

    private void persist(UUID uuid, String name, int level) {
        plugin.getDatabaseExecutor().execute(conn -> {
            try (PreparedStatement ps = conn.prepareStatement("""
                    INSERT INTO prestige (uuid, name, level) VALUES (?, ?, ?)
                    ON CONFLICT(uuid) DO UPDATE SET name = excluded.name, level = excluded.level;
                """)) {
                ps.setString(1, uuid.toString());
                ps.setString(2, name);
                ps.setInt(3, level);
                ps.executeUpdate();
            }
        });
    }

    // ----- Prestige durchfuehren -----

    public boolean prestige(Player player) {
        int level = getLevel(player.getUniqueId());
        if (level >= getMaxPrestige()) {
            plugin.getMessageManager().send(player, "prestige.max");
            return false;
        }
        double cost = costFor(level);
        if (!plugin.getEconomyManager().withdraw(player.getUniqueId(), cost)) {
            plugin.getMessageManager().send(player, "economy.not-enough-money");
            return false;
        }
        int newLevel = level + 1;
        levels.put(player.getUniqueId(), newLevel);
        persist(player.getUniqueId(), player.getName(), newLevel);

        long rewardShards = getRewardShards();
        if (rewardShards > 0) plugin.getShardsManager().addShards(player.getUniqueId(), rewardShards);

        plugin.getMessageManager().send(player, "prestige.success",
                "%level%", String.valueOf(newLevel),
                "%bonus%", String.format("%.1f", newLevel * getSellBonusPercent()));
        if (plugin.getConfigManager().getConfig().getBoolean("prestige.broadcast", true)) {
            Bukkit.broadcastMessage(plugin.getMessageManager().get("prestige.broadcast",
                    "%player%", player.getName(), "%level%", String.valueOf(newLevel)));
        }
        return true;
    }

    /** Admin: Prestige-Level setzen. */
    public void setLevel(UUID uuid, String name, int level) {
        int clamped = Math.max(0, Math.min(getMaxPrestige(), level));
        levels.put(uuid, clamped);
        persist(uuid, name, clamped);
    }

    /** Top-Spieler nach Prestige (fuer Leaderboards). */
    public void topPrestige(int limit, java.util.function.Consumer<java.util.List<String[]>> callback) {
        plugin.getDatabaseExecutor().query(conn -> {
            java.util.List<String[]> list = new java.util.ArrayList<>();
            try (PreparedStatement ps = conn.prepareStatement(
                    "SELECT name, level FROM prestige WHERE level > 0 ORDER BY level DESC LIMIT ?;")) {
                ps.setInt(1, limit);
                try (ResultSet rs = ps.executeQuery()) {
                    while (rs.next()) list.add(new String[]{rs.getString("name"), String.valueOf(rs.getInt("level"))});
                }
            }
            return list;
        }, callback);
    }
}
