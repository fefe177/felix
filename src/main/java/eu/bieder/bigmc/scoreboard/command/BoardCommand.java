package eu.bieder.bigmc.scoreboard.command;

import eu.bieder.bigmc.BigMC;
import org.bukkit.command.Command;
import org.bukkit.command.CommandExecutor;
import org.bukkit.command.CommandSender;
import org.bukkit.entity.Player;

/**
 * /board -> blendet die Sidebar ein bzw. aus.
 */
public class BoardCommand implements CommandExecutor {

    private final BigMC plugin;

    public BoardCommand(BigMC plugin) {
        this.plugin = plugin;
    }

    @Override
    public boolean onCommand(CommandSender sender, Command command, String label, String[] args) {
        if (!(sender instanceof Player player)) {
            plugin.getMessageManager().send(sender, "general.player-only");
            return true;
        }
        boolean visible = plugin.getSidebarManager().toggle(player);
        plugin.getMessageManager().send(player,
                visible ? "scoreboard.enabled" : "scoreboard.disabled");
        return true;
    }
}
