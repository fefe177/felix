package eu.bieder.bigmc.leaderboard;

import eu.bieder.bigmc.BigMC;
import eu.bieder.bigmc.clan.Clan;
import eu.bieder.bigmc.economy.EconomyManager;
import eu.bieder.bigmc.shards.ShardsManager;
import eu.bieder.bigmc.stats.StatsManager;
import org.bukkit.Bukkit;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.function.Consumer;

/**
 * Liefert die Top-Listen aller Leaderboard-Kategorien einheitlich als
 * [Name, Wert]-Eintraege. Synchrone Quellen rufen den Callback sofort auf,
 * asynchrone (Prestige, Battle Pass) ueber den DB-Executor mit Hauptthread-Callback.
 */
public class LeaderboardManager {

    private final BigMC plugin;

    public LeaderboardManager(BigMC plugin) {
        this.plugin = plugin;
    }

    /**
     * Holt die Top-Eintraege einer Kategorie und liefert sie (auf dem
     * Hauptthread) als Liste von [Name, Wert].
     */
    public void fetchTop(LeaderboardCategory category, int limit, Consumer<List<String[]>> callback) {
        switch (category) {
            case MONEY -> {
                List<String[]> list = new ArrayList<>();
                for (EconomyManager.Account a : plugin.getEconomyManager().getTopBalances(limit)) {
                    list.add(new String[]{a.name(), plugin.getEconomyManager().formatMoney(a.balance())});
                }
                callback.accept(list);
            }
            case SHARDS -> {
                List<String[]> list = new ArrayList<>();
                for (ShardsManager.Account a : plugin.getShardsManager().getTop(limit)) {
                    list.add(new String[]{a.name(), plugin.getShardsManager().formatShards(a.amount())});
                }
                callback.accept(list);
            }
            case KILLS -> {
                List<String[]> list = new ArrayList<>();
                for (StatsManager.PlayerStats s : plugin.getStatsManager().getTop(StatsManager.Category.KILLS, limit)) {
                    list.add(new String[]{s.name(), String.valueOf(s.kills())});
                }
                callback.accept(list);
            }
            case DEATHS -> {
                List<String[]> list = new ArrayList<>();
                for (StatsManager.PlayerStats s : plugin.getStatsManager().getTop(StatsManager.Category.TODE, limit)) {
                    list.add(new String[]{s.name(), String.valueOf(s.deaths())});
                }
                callback.accept(list);
            }
            case CLAN_POINTS -> {
                List<String[]> list = new ArrayList<>();
                for (Clan c : plugin.getClanManager().getTop(limit)) {
                    list.add(new String[]{c.getName(), String.valueOf(c.getPoints())});
                }
                callback.accept(list);
            }
            case PRESTIGE -> plugin.getPrestigeManager().topPrestige(limit, rows -> {
                List<String[]> list = new ArrayList<>();
                if (rows != null) {
                    for (String[] r : rows) list.add(new String[]{r[0], "Prestige " + r[1]});
                }
                callback.accept(list);
            });
            case BATTLEPASS -> plugin.getBattlePassManager().topXp(limit, rows -> {
                List<String[]> list = new ArrayList<>();
                if (rows != null) {
                    int xpPerLevel = plugin.getBattlePassManager().getXpPerLevel();
                    int maxLevel = plugin.getBattlePassManager().getMaxLevel();
                    for (String[] r : rows) {
                        String name = nameOf(r[0]);
                        int level = Math.min(maxLevel, Integer.parseInt(r[1]) / xpPerLevel);
                        list.add(new String[]{name, "Level " + level});
                    }
                }
                callback.accept(list);
            });
        }
    }

    private String nameOf(String uuidStr) {
        try {
            String name = Bukkit.getOfflinePlayer(UUID.fromString(uuidStr)).getName();
            return name != null ? name : "?";
        } catch (IllegalArgumentException e) {
            return "?";
        }
    }
}
