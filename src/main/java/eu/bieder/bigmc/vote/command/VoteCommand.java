package eu.bieder.bigmc.vote.command;

import eu.bieder.bigmc.BigMC;
import eu.bieder.bigmc.config.MessageManager;
import org.bukkit.Bukkit;
import org.bukkit.command.Command;
import org.bukkit.command.CommandExecutor;
import org.bukkit.command.CommandSender;
import org.bukkit.command.TabCompleter;
import org.bukkit.entity.Player;

import java.util.ArrayList;
import java.util.List;

/**
 * /vote              -> Vote-Links anzeigen + Anzahl eigener Votes
 * /vote claim        -> ausstehende Belohnungen abholen
 * /vote test [name]  -> Vote simulieren (Admin, zum Testen ohne Votifier)
 */
public class VoteCommand implements CommandExecutor, TabCompleter {

    private final BigMC plugin;

    public VoteCommand(BigMC plugin) {
        this.plugin = plugin;
    }

    @Override
    public boolean onCommand(CommandSender sender, Command command, String label, String[] args) {
        MessageManager msg = plugin.getMessageManager();

        // /vote test [name] -> Vote simulieren (Admin)
        if (args.length >= 1 && args[0].equalsIgnoreCase("test")) {
            if (!sender.hasPermission("bigmc.vote.admin")) {
                msg.send(sender, "general.no-permission");
                return true;
            }
            String name = args.length >= 2 ? args[1]
                    : (sender instanceof Player p ? p.getName() : null);
            if (name == null) {
                msg.send(sender, "vote.test-usage");
                return true;
            }
            plugin.getVoteRewardManager().handleVote(name);
            msg.send(sender, "vote.test-done", "%player%", name);
            return true;
        }

        // /vote claim -> ausstehende Belohnungen abholen
        if (args.length == 1 && args[0].equalsIgnoreCase("claim")) {
            if (!(sender instanceof Player player)) {
                msg.send(sender, "general.player-only");
                return true;
            }
            int claimed = plugin.getVoteRewardManager().claimPending(player);
            if (claimed > 0) {
                msg.send(player, "vote.pending-claimed", "%count%", String.valueOf(claimed));
            } else {
                msg.send(player, "vote.nothing-pending");
            }
            return true;
        }

        // /vote -> Links + Vote-Anzahl
        sender.sendMessage(msg.getRaw("vote.links-header"));
        for (String link : plugin.getConfigManager().getConfig().getStringList("vote.links")) {
            sender.sendMessage(MessageManager.color(link));
        }
        if (sender instanceof Player player) {
            int total = plugin.getVoteRewardManager().getTotal(player.getName());
            int pending = plugin.getVoteRewardManager().getPending(player.getName());
            msg.send(player, "vote.your-votes",
                    "%total%", String.valueOf(total),
                    "%pending%", String.valueOf(pending));
        }
        return true;
    }

    @Override
    public List<String> onTabComplete(CommandSender sender, Command command, String alias, String[] args) {
        List<String> result = new ArrayList<>();
        if (args.length == 1) {
            result.add("claim");
            if (sender.hasPermission("bigmc.vote.admin")) result.add("test");
            result.removeIf(s -> !s.toLowerCase().startsWith(args[0].toLowerCase()));
        } else if (args.length == 2 && args[0].equalsIgnoreCase("test")
                && sender.hasPermission("bigmc.vote.admin")) {
            Bukkit.getOnlinePlayers().forEach(p -> result.add(p.getName()));
            result.removeIf(s -> !s.toLowerCase().startsWith(args[1].toLowerCase()));
        }
        return result;
    }
}
