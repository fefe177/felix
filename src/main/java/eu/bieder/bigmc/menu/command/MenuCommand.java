package eu.bieder.bigmc.menu.command;

import eu.bieder.bigmc.BigMC;
import org.bukkit.command.Command;
import org.bukkit.command.CommandExecutor;
import org.bukkit.command.CommandSender;
import org.bukkit.entity.Player;

/**
 * /menu -> oeffnet das zentrale Hauptmenue mit allen Features.
 */
public class MenuCommand implements CommandExecutor {

    private final BigMC plugin;

    public MenuCommand(BigMC plugin) {
        this.plugin = plugin;
    }

    @Override
    public boolean onCommand(CommandSender sender, Command command, String label, String[] args) {
        if (!(sender instanceof Player player)) {
            plugin.getMessageManager().send(sender, "general.player-only");
            return true;
        }
        plugin.getMenuGUI().open(player);
        return true;
    }
}
