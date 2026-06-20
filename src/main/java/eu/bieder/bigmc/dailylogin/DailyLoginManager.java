package eu.bieder.bigmc.dailylogin;

import eu.bieder.bigmc.BigMC;
import org.bukkit.Material;
import org.bukkit.configuration.ConfigurationSection;
import org.bukkit.entity.Player;
import org.bukkit.inventory.ItemStack;

import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.Statement;
import java.time.LocalDate;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

/**
 * Daily-Login-Rewards mit Login-Serie (Streak).
 *
 * Jeder Tag (lokale Zeit) kann genau einmal abgeholt werden. Aufeinanderfolgende
 * Tage erhoehen die Serie; ein verpasster Tag setzt sie zurueck. Der Tag im
 * Zyklus bestimmt die Belohnung (z.B. groesster Bonus am letzten Tag).
 *
 * In-Memory-Cache + async-Persistenz. Dupe-sicher: ein Tag wird vor der
 * Belohnung als abgeholt markiert.
 */
public class DailyLoginManager {

    private final BigMC plugin;

    /** uuid -> [lastClaimedEpochDay, streak]. */
    private final Map<UUID, long[]> data = new HashMap<>();

    public DailyLoginManager(BigMC plugin) {
        this.plugin = plugin;
        createTable();
    }

    private void createTable() {
        plugin.getDatabaseExecutor().execute(conn -> {
            try (Statement st = conn.createStatement()) {
                st.execute("""
                    CREATE TABLE IF NOT EXISTS login_rewards (
                        uuid     TEXT PRIMARY KEY,
                        last_day INTEGER NOT NULL DEFAULT -1,
                        streak   INTEGER NOT NULL DEFAULT 0
                    );
                """);
            }
        });
    }

    private long today() {
        return LocalDate.now().toEpochDay();
    }

    public int getCycle() {
        return Math.max(1, plugin.getConfigManager().getConfig().getInt("dailylogin.cycle", 7));
    }

    // ----- Laden / Speichern -----

    public void loadPlayer(UUID uuid) {
        data.put(uuid, new long[]{-1, 0});
        plugin.getDatabaseExecutor().query(conn -> {
            long[] vals = {-1, 0};
            try (PreparedStatement ps = conn.prepareStatement(
                    "SELECT last_day, streak FROM login_rewards WHERE uuid = ?;")) {
                ps.setString(1, uuid.toString());
                try (ResultSet rs = ps.executeQuery()) {
                    if (rs.next()) { vals[0] = rs.getLong("last_day"); vals[1] = rs.getLong("streak"); }
                }
            }
            return vals;
        }, vals -> {
            if (vals != null) data.put(uuid, vals);
        });
    }

    public void unloadPlayer(UUID uuid) {
        data.remove(uuid);
    }

    private void persist(UUID uuid, long lastDay, long streak) {
        plugin.getDatabaseExecutor().execute(conn -> {
            try (PreparedStatement ps = conn.prepareStatement("""
                    INSERT INTO login_rewards (uuid, last_day, streak) VALUES (?, ?, ?)
                    ON CONFLICT(uuid) DO UPDATE SET last_day = excluded.last_day, streak = excluded.streak;
                """)) {
                ps.setString(1, uuid.toString());
                ps.setLong(2, lastDay);
                ps.setLong(3, streak);
                ps.executeUpdate();
            }
        });
    }

    // ----- Status -----

    public boolean canClaim(UUID uuid) {
        long[] d = data.get(uuid);
        return d != null && d[0] != today();
    }

    public long getStreak(UUID uuid) {
        long[] d = data.get(uuid);
        return d == null ? 0 : d[1];
    }

    /** Tag im Zyklus, der beim naechsten Claim faellig ist (1..cycle). */
    public int getCurrentDay(UUID uuid) {
        long[] d = data.get(uuid);
        if (d == null) return 1;
        long today = today();
        long nextStreak;
        if (d[0] == today) {
            nextStreak = d[1];                    // heute schon abgeholt -> aktueller Tag
        } else {
            nextStreak = (d[0] == today - 1) ? d[1] + 1 : 1;
        }
        if (nextStreak < 1) nextStreak = 1;
        return (int) (((nextStreak - 1) % getCycle()) + 1);
    }

    // ----- Belohnung -----

    public DailyReward rewardFor(int dayInCycle) {
        ConfigurationSection sec = plugin.getConfigManager().getConfig()
                .getConfigurationSection("dailylogin.rewards." + dayInCycle);
        if (sec == null) {
            return new DailyReward(dayInCycle * 250.0, dayInCycle, Map.of());
        }
        Map<Material, Integer> items = new HashMap<>();
        ConfigurationSection is = sec.getConfigurationSection("items");
        if (is != null) {
            for (String m : is.getKeys(false)) {
                Material mat = Material.matchMaterial(m);
                if (mat != null) items.put(mat, is.getInt(m));
            }
        }
        return new DailyReward(sec.getDouble("money", 0), sec.getLong("shards", 0), items);
    }

    public boolean claim(Player player) {
        long[] d = data.get(player.getUniqueId());
        if (d == null) return false;
        long today = today();
        if (d[0] == today) {
            plugin.getMessageManager().send(player, "dailylogin.already-claimed");
            return false;
        }
        long newStreak = (d[0] == today - 1) ? d[1] + 1 : 1;
        int day = (int) (((newStreak - 1) % getCycle()) + 1);

        // zuerst markieren (dupe-sicher), dann Belohnung geben
        d[0] = today;
        d[1] = newStreak;
        persist(player.getUniqueId(), today, newStreak);

        DailyReward reward = rewardFor(day);
        if (reward.money() > 0) plugin.getEconomyManager().deposit(player.getUniqueId(), reward.money());
        if (reward.shards() > 0) plugin.getShardsManager().addShards(player.getUniqueId(), reward.shards());
        for (Map.Entry<Material, Integer> e : reward.items().entrySet()) {
            Map<Integer, ItemStack> leftover = player.getInventory().addItem(new ItemStack(e.getKey(), e.getValue()));
            leftover.values().forEach(rest -> player.getWorld().dropItemNaturally(player.getLocation(), rest));
        }
        plugin.getMessageManager().send(player, "dailylogin.claimed",
                "%day%", String.valueOf(day), "%streak%", String.valueOf(newStreak));
        return true;
    }
}
