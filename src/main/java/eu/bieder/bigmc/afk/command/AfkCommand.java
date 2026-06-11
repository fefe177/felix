package eu.bieder.bigmc.afk.command;

import eu.bieder.bigmc.BigMC;
import eu.bieder.bigmc.config.MessageManager;
import org.bukkit.command.Command;
import org.bukkit.command.CommandExecutor;
import org.bukkit.command.CommandSender;
import org.bukkit.command.TabCompleter;
import org.bukkit.entity.Player;

import java.util.List;

/**
 * /afk      -> in die AFK-Zone teleportieren bzw. zurueckkehren
 * /afk set  -> AFK-Zone auf die eigene Position setzen (Admin)
 */
public class AfkCommand implements CommandExecutor, TabCompleter {

    private final BigMC plugin;

    public AfkCommand(BigMC plugin) {
        this.plugin = plugin;
    }

    @Override
    public boolean onCommand(CommandSender sender, Command command, String label, String[] args) {
        MessageManager msg = plugin.getMessageManager();

        if (!(sender instanceof Player player)) {
            msg.send(sender, "general.player-only");
            return true;
        }

        // /afk set -> Zone setzen (Admin)
        if (args.length == 1 && args[0].equalsIgnoreCase("set")) {
            if (!player.hasPermission("bigmc.afk.admin")) {
                msg.send(player, "general.no-permission");
                return true;
            }
            plugin.getAfkManager().setZone(player.getLocation());
            msg.send(player, "afk.zone-set");
            return true;
        }

        // /afk -> rein/raus
        if (plugin.getAfkManager().isAfk(player.getUniqueId())) {
            plugin.getAfkManager().leaveAfk(player);
            msg.send(player, "afk.left");
            return true;
        }

        if (!plugin.getAfkManager().enterAfk(player)) {
            msg.send(player, "afk.zone-not-set");
            return true;
        }
        long interval = plugin.getConfigManager().getConfig().getLong("afk.reward-interval-seconds", 60);
        long amount = plugin.getConfigManager().getConfig().getLong("afk.shards-per-interval", 1);
        msg.send(player, "afk.entered",
                "%amount%", plugin.getShardsManager().formatShards(amount),
                "%interval%", String.valueOf(interval));
        return true;
    }

    @Override
    public List<String> onTabComplete(CommandSender sender, Command command, String alias, String[] args) {
        if (args.length == 1 && sender.hasPermission("bigmc.afk.admin")
                && "set".startsWith(args[0].toLowerCase())) {
            return List.of("set");
        }
        return List.of();
    }
}
