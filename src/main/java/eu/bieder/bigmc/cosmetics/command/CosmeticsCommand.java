package eu.bieder.bigmc.cosmetics.command;

import eu.bieder.bigmc.BigMC;
import org.bukkit.command.Command;
import org.bukkit.command.CommandExecutor;
import org.bukkit.command.CommandSender;
import org.bukkit.entity.Player;

/**
 * /cosmetics -> oeffnet das Cosmetics-Menue.
 */
public class CosmeticsCommand implements CommandExecutor {

    private final BigMC plugin;

    public CosmeticsCommand(BigMC plugin) {
        this.plugin = plugin;
    }

    @Override
    public boolean onCommand(CommandSender sender, Command command, String label, String[] args) {
        if (!(sender instanceof Player player)) {
            plugin.getMessageManager().send(sender, "general.player-only");
            return true;
        }
        plugin.getCosmeticsGUI().openMain(player);
        return true;
    }
}
