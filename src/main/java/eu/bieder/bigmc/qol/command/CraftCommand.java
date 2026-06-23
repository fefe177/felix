package eu.bieder.bigmc.qol.command;

import eu.bieder.bigmc.BigMC;
import org.bukkit.command.Command;
import org.bukkit.command.CommandExecutor;
import org.bukkit.command.CommandSender;
import org.bukkit.entity.Player;

/**
 * /craft -> oeffnet eine tragbare Werkbank.
 */
public class CraftCommand implements CommandExecutor {

    private final BigMC plugin;

    public CraftCommand(BigMC plugin) {
        this.plugin = plugin;
    }

    @Override
    public boolean onCommand(CommandSender sender, Command command, String label, String[] args) {
        if (!(sender instanceof Player player)) {
            plugin.getMessageManager().send(sender, "general.player-only");
            return true;
        }
        player.openWorkbench(null, true);
        return true;
    }
}
