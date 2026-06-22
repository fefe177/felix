package eu.bieder.bigmc.stats.command;

import eu.bieder.bigmc.BigMC;
import eu.bieder.bigmc.config.MessageManager;
import eu.bieder.bigmc.stats.StatsManager;
import org.bukkit.Bukkit;
import org.bukkit.command.Command;
import org.bukkit.command.CommandExecutor;
import org.bukkit.command.CommandSender;
import org.bukkit.command.TabCompleter;
import org.bukkit.entity.Player;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Optional;

/**
 * /stats           -> eigene Statistiken anzeigen
 * /stats <spieler> -> Statistiken eines anderen Spielers anzeigen
 */
public class StatsCommand implements CommandExecutor, TabCompleter {

    private final BigMC plugin;

    public StatsCommand(BigMC plugin) {
        this.plugin = plugin;
    }

    @Override
    public boolean onCommand(CommandSender sender, Command command, String label, String[] args) {
        MessageManager msg = plugin.getMessageManager();

        Optional<StatsManager.PlayerStats> stats;
        if (args.length == 0) {
            if (!(sender instanceof Player player)) {
                msg.send(sender, "general.player-only");
                return true;
            }
            stats = plugin.getStatsManager().getStats(player.getUniqueId());
        } else {
            stats = plugin.getStatsManager().getStatsByName(args[0]);
        }

        if (stats.isEmpty()) {
            msg.send(sender, "general.player-not-found");
            return true;
        }
        StatsManager.PlayerStats s = stats.get();

        // Spieler bekommen ein GUI; die Konsole weiterhin die Text-Ausgabe.
        if (sender instanceof Player viewer) {
            plugin.getStatsGUI().open(viewer, s);
            return true;
        }

        // K/D berechnen (bei 0 Toden zaehlen die Kills direkt)
        double kd = s.deaths() == 0 ? s.kills() : (double) s.kills() / s.deaths();
        double balance = plugin.getEconomyManager().getBalance(s.uuid());

        sender.sendMessage(msg.getRaw("stats.header").replace("%player%", s.name()));
        sender.sendMessage(msg.getRaw("stats.kills").replace("%value%", String.valueOf(s.kills())));
        sender.sendMessage(msg.getRaw("stats.deaths").replace("%value%", String.valueOf(s.deaths())));
        sender.sendMessage(msg.getRaw("stats.kd").replace("%value%", String.format(Locale.GERMANY, "%.2f", kd)));
        sender.sendMessage(msg.getRaw("stats.duel-wins").replace("%value%", String.valueOf(s.duelWins())));
        sender.sendMessage(msg.getRaw("stats.playtime")
                .replace("%value%", StatsManager.formatPlaytime(s.playtimeSeconds())));
        sender.sendMessage(msg.getRaw("stats.money")
                .replace("%value%", plugin.getEconomyManager().formatMoney(balance)));
        sender.sendMessage(msg.getRaw("stats.shards")
                .replace("%value%", plugin.getShardsManager()
                        .formatShards(plugin.getShardsManager().getShards(s.uuid()))));
        return true;
    }

    @Override
    public List<String> onTabComplete(CommandSender sender, Command command, String alias, String[] args) {
        List<String> result = new ArrayList<>();
        if (args.length == 1) {
            Bukkit.getOnlinePlayers().forEach(p -> result.add(p.getName()));
            result.removeIf(s -> !s.toLowerCase().startsWith(args[0].toLowerCase()));
        }
        return result;
    }
}
