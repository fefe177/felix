package eu.bieder.bigmc.season;

import eu.bieder.bigmc.BigMC;
import eu.bieder.bigmc.config.MessageManager;
import eu.bieder.bigmc.economy.EconomyManager;
import eu.bieder.bigmc.stats.StatsManager;
import org.bukkit.Bukkit;
import org.bukkit.Material;
import org.bukkit.command.CommandSender;
import org.bukkit.configuration.ConfigurationSection;
import org.bukkit.entity.Player;
import org.bukkit.inventory.ItemStack;

import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Season-System: verwaltet die laufende Season, beendet sie (mit Belohnungen
 * fuer die besten Spieler) und startet die naechste inkl. Reset relevanter
 * Statistiken. Optional automatisches Ende nach einer konfigurierten Dauer.
 */
public class SeasonManager {

    private final BigMC plugin;
    private int season = 1;
    private long started = 0;

    public SeasonManager(BigMC plugin) {
        this.plugin = plugin;
        createTable();
        load();
    }

    private void createTable() {
        plugin.getDatabaseExecutor().execute(conn -> {
            try (Statement st = conn.createStatement()) {
                st.execute("""
                    CREATE TABLE IF NOT EXISTS season_meta (
                        id      INTEGER PRIMARY KEY,
                        season  INTEGER NOT NULL,
                        started INTEGER NOT NULL
                    );
                """);
                st.execute("""
                    INSERT INTO season_meta (id, season, started)
                    VALUES (1, 1, """ + System.currentTimeMillis() + """
                    ) ON CONFLICT(id) DO NOTHING;
                """);
            }
        });
    }

    private void load() {
        plugin.getDatabaseExecutor().query(conn -> {
            long[] vals = {1, System.currentTimeMillis()};
            try (PreparedStatement ps = conn.prepareStatement("SELECT season, started FROM season_meta WHERE id = 1;");
                 ResultSet rs = ps.executeQuery()) {
                if (rs.next()) { vals[0] = rs.getInt("season"); vals[1] = rs.getLong("started"); }
            }
            return vals;
        }, vals -> {
            if (vals != null) { season = (int) vals[0]; started = vals[1]; }
        });
    }

    private void persist() {
        final int s = season;
        final long st = started;
        plugin.getDatabaseExecutor().execute(conn -> {
            try (PreparedStatement ps = conn.prepareStatement(
                    "UPDATE season_meta SET season = ?, started = ? WHERE id = 1;")) {
                ps.setInt(1, s);
                ps.setLong(2, st);
                ps.executeUpdate();
            }
        });
    }

    public int getSeason() { return season; }
    public long getStarted() { return started; }

    public String getRankingCategory() {
        return plugin.getConfigManager().getConfig().getString("season.ranking", "kills").toLowerCase();
    }

    // ----- Rangliste der laufenden Season -----

    /** Liefert die Top-Spieler [uuid, name, wert] nach der Season-Kategorie. */
    public List<String[]> getRanking(int limit) {
        List<String[]> list = new ArrayList<>();
        if (getRankingCategory().equals("money")) {
            for (EconomyManager.Account acc : plugin.getEconomyManager().getTopBalances(limit)) {
                list.add(new String[]{acc.uuid().toString(), acc.name(),
                        plugin.getEconomyManager().formatMoney(acc.balance())});
            }
        } else {
            for (StatsManager.PlayerStats s : plugin.getStatsManager().getTop(StatsManager.Category.KILLS, limit)) {
                list.add(new String[]{s.uuid().toString(), s.name(), String.valueOf(s.kills())});
            }
        }
        return list;
    }

    // ----- Season beenden / starten -----

    /** Beendet die aktuelle Season, vergibt Belohnungen und startet die naechste. */
    public void endSeason(CommandSender initiator) {
        MessageManager msg = plugin.getMessageManager();
        ConfigurationSection rewards = plugin.getConfigManager().getConfig()
                .getConfigurationSection("season.rewards");
        int maxPlace = 3;
        if (rewards != null) {
            for (String k : rewards.getKeys(false)) {
                try { maxPlace = Math.max(maxPlace, Integer.parseInt(k)); } catch (NumberFormatException ignored) {}
            }
        }

        List<String[]> ranking = getRanking(maxPlace);
        Bukkit.broadcastMessage(msg.get("season.ended", "%season%", String.valueOf(season)));

        int place = 1;
        for (String[] row : ranking) {
            UUID uuid = UUID.fromString(row[0]);
            Bukkit.broadcastMessage(msg.get("season.winner",
                    "%place%", String.valueOf(place), "%player%", row[1], "%value%", row[2]));
            if (rewards != null && rewards.isConfigurationSection(String.valueOf(place))) {
                giveReward(uuid, rewards.getConfigurationSection(String.valueOf(place)));
            }
            place++;
        }

        // Relevante Statistiken zuruecksetzen
        List<String> resetStats = plugin.getConfigManager().getConfig().getStringList("season.reset-stats");
        if (!resetStats.isEmpty()) {
            plugin.getStatsManager().resetColumns(resetStats);
        }

        // Naechste Season
        season++;
        started = System.currentTimeMillis();
        persist();
        Bukkit.broadcastMessage(msg.get("season.started", "%season%", String.valueOf(season)));
        if (initiator != null && !(initiator instanceof Player)) {
            initiator.sendMessage(msg.get("season.start-done", "%season%", String.valueOf(season)));
        }
    }

    private void giveReward(UUID uuid, ConfigurationSection sec) {
        double money = sec.getDouble("money", 0);
        long shards = sec.getLong("shards", 0);
        if (money > 0) plugin.getEconomyManager().deposit(uuid, money);
        if (shards > 0) plugin.getShardsManager().addShards(uuid, shards);

        Player online = Bukkit.getPlayer(uuid);
        ConfigurationSection items = sec.getConfigurationSection("items");
        if (online != null && items != null) {
            for (String m : items.getKeys(false)) {
                Material mat = Material.matchMaterial(m);
                if (mat == null) continue;
                Map<Integer, ItemStack> leftover = online.getInventory().addItem(new ItemStack(mat, items.getInt(m)));
                leftover.values().forEach(rest -> online.getWorld().dropItemNaturally(online.getLocation(), rest));
            }
        }
        if (online != null) {
            plugin.getMessageManager().send(online, "season.reward");
        }
    }

    /** Prueft (z.B. stuendlich), ob die Season nach Ablauf der Dauer endet. */
    public void checkAutoEnd() {
        int durationDays = plugin.getConfigManager().getConfig().getInt("season.duration-days", 0);
        if (durationDays <= 0) return;
        long elapsedDays = (System.currentTimeMillis() - started) / (1000L * 60 * 60 * 24);
        if (elapsedDays >= durationDays) {
            endSeason(Bukkit.getConsoleSender());
        }
    }
}
