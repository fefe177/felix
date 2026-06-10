package eu.bieder.bigmc.rank.command;

import eu.bieder.bigmc.BigMC;
import eu.bieder.bigmc.config.MessageManager;
import eu.bieder.bigmc.rank.RankManager;
import eu.bieder.bigmc.stats.StatsManager;
import org.bukkit.Bukkit;
import org.bukkit.OfflinePlayer;
import org.bukkit.command.Command;
import org.bukkit.command.CommandExecutor;
import org.bukkit.command.CommandSender;
import org.bukkit.command.TabCompleter;
import org.bukkit.entity.Player;

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

/**
 * /rank                  -> eigenen Rang, naechsten Rang und Voraussetzungen anzeigen
 * /rank buy              -> den naechsten Rang kaufen (Geld + Voraussetzungen)
 * /rank set <spieler> <rang> -> Rang setzen (Admin)
 */
public class RankCommand implements CommandExecutor, TabCompleter {

    private final BigMC plugin;

    public RankCommand(BigMC plugin) {
        this.plugin = plugin;
    }

    @Override
    public boolean onCommand(CommandSender sender, Command command, String label, String[] args) {
        MessageManager msg = plugin.getMessageManager();

        // Admin: /rank set <spieler> <rang>
        if (args.length >= 1 && args[0].equalsIgnoreCase("set")) {
            setRank(sender, args);
            return true;
        }

        if (!(sender instanceof Player player)) {
            msg.send(sender, "general.player-only");
            return true;
        }

        if (args.length == 0) {
            showInfo(player);
            return true;
        }
        if (args[0].equalsIgnoreCase("buy")) {
            buyNext(player);
            return true;
        }

        msg.send(player, "ranks.usage");
        return true;
    }

    // ----- /rank (Info) -----

    private void showInfo(Player player) {
        MessageManager msg = plugin.getMessageManager();
        RankManager rm = plugin.getRankManager();

        RankManager.Rank current = rm.getPlayerRank(player.getUniqueId());
        if (current == null) {
            msg.send(player, "ranks.none-configured");
            return;
        }

        msg.send(player, "ranks.current", "%rank%", MessageManager.color(current.displayName()));

        Optional<RankManager.Rank> next = rm.getNextRank(current);
        if (next.isEmpty()) {
            msg.send(player, "ranks.max-reached");
            return;
        }
        RankManager.Rank n = next.get();
        msg.send(player, "ranks.next",
                "%rank%", MessageManager.color(n.displayName()),
                "%cost%", plugin.getEconomyManager().formatMoney(n.cost()));

        // Voraussetzungen anzeigen
        if (n.requiredPlaytimeSeconds() > 0) {
            msg.send(player, "ranks.req-playtime",
                    "%time%", StatsManager.formatPlaytime(n.requiredPlaytimeSeconds()));
        }
        if (n.requiredKills() > 0) {
            msg.send(player, "ranks.req-kills", "%kills%", String.valueOf(n.requiredKills()));
        }
        msg.send(player, "ranks.buy-hint");
    }

    // ----- /rank buy -----

    private void buyNext(Player player) {
        MessageManager msg = plugin.getMessageManager();
        RankManager rm = plugin.getRankManager();

        RankManager.Rank current = rm.getPlayerRank(player.getUniqueId());
        if (current == null) {
            msg.send(player, "ranks.none-configured");
            return;
        }
        Optional<RankManager.Rank> nextOpt = rm.getNextRank(current);
        if (nextOpt.isEmpty()) {
            msg.send(player, "ranks.max-reached");
            return;
        }
        RankManager.Rank next = nextOpt.get();

        // Fortschritts-Voraussetzungen pruefen (Spielzeit, Kills)
        var statsOpt = plugin.getStatsManager().getStats(player.getUniqueId());
        long playtime = statsOpt.map(StatsManager.PlayerStats::playtimeSeconds).orElse(0L);
        int kills = statsOpt.map(StatsManager.PlayerStats::kills).orElse(0);

        if (playtime < next.requiredPlaytimeSeconds()) {
            msg.send(player, "ranks.req-playtime-missing",
                    "%time%", StatsManager.formatPlaytime(next.requiredPlaytimeSeconds()));
            return;
        }
        if (kills < next.requiredKills()) {
            msg.send(player, "ranks.req-kills-missing", "%kills%", String.valueOf(next.requiredKills()));
            return;
        }

        // Geld abbuchen
        if (!plugin.getEconomyManager().withdraw(player.getUniqueId(), next.cost())) {
            msg.send(player, "economy.not-enough-money");
            return;
        }

        // Rang vergeben (setzt auch Permissions neu)
        rm.setPlayerRank(player.getUniqueId(), player.getName(), next);
        msg.send(player, "ranks.bought",
                "%rank%", MessageManager.color(next.displayName()),
                "%cost%", plugin.getEconomyManager().formatMoney(next.cost()));

        if (plugin.getConfigManager().getConfig().getBoolean("ranks.broadcast-rankup", true)) {
            Bukkit.broadcastMessage(msg.get("ranks.broadcast",
                    "%player%", player.getName(),
                    "%rank%", MessageManager.color(next.displayName())));
        }
    }

    // ----- /rank set (Admin) -----

    private void setRank(CommandSender sender, String[] args) {
        MessageManager msg = plugin.getMessageManager();

        if (!sender.hasPermission("bigmc.rank.admin")) {
            msg.send(sender, "general.no-permission");
            return;
        }
        if (args.length != 3) {
            msg.send(sender, "ranks.set-usage");
            return;
        }

        Optional<RankManager.Rank> rank = plugin.getRankManager().getRankById(args[2]);
        if (rank.isEmpty()) {
            msg.send(sender, "ranks.unknown-rank", "%rank%", args[2]);
            return;
        }

        // Spieler ermitteln (online bevorzugt, sonst Offline-Profil)
        Player online = Bukkit.getPlayerExact(args[1]);
        if (online != null) {
            plugin.getRankManager().setPlayerRank(online.getUniqueId(), online.getName(), rank.get());
            msg.send(sender, "ranks.set-done",
                    "%player%", online.getName(),
                    "%rank%", MessageManager.color(rank.get().displayName()));
            msg.send(online, "ranks.set-received",
                    "%rank%", MessageManager.color(rank.get().displayName()));
            return;
        }

        @SuppressWarnings("deprecation")
        OfflinePlayer offline = Bukkit.getOfflinePlayer(args[1]);
        if (offline.getUniqueId() == null || (!offline.hasPlayedBefore())) {
            msg.send(sender, "general.player-not-found");
            return;
        }
        plugin.getRankManager().setPlayerRank(offline.getUniqueId(),
                offline.getName() != null ? offline.getName() : args[1], rank.get());
        msg.send(sender, "ranks.set-done",
                "%player%", args[1],
                "%rank%", MessageManager.color(rank.get().displayName()));
    }

    @Override
    public List<String> onTabComplete(CommandSender sender, Command command, String alias, String[] args) {
        List<String> result = new ArrayList<>();
        if (args.length == 1) {
            result.add("buy");
            if (sender.hasPermission("bigmc.rank.admin")) result.add("set");
            result.removeIf(s -> !s.toLowerCase().startsWith(args[0].toLowerCase()));
        } else if (args.length == 2 && args[0].equalsIgnoreCase("set")) {
            Bukkit.getOnlinePlayers().forEach(p -> result.add(p.getName()));
            result.removeIf(s -> !s.toLowerCase().startsWith(args[1].toLowerCase()));
        } else if (args.length == 3 && args[0].equalsIgnoreCase("set")) {
            plugin.getRankManager().getRanks().forEach(r -> result.add(r.id()));
            result.removeIf(s -> !s.toLowerCase().startsWith(args[2].toLowerCase()));
        }
        return result;
    }
}
