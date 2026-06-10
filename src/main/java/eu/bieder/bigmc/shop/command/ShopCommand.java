package eu.bieder.bigmc.shop.command;

import eu.bieder.bigmc.BigMC;
import org.bukkit.command.Command;
import org.bukkit.command.CommandExecutor;
import org.bukkit.command.CommandSender;
import org.bukkit.entity.Player;

/**
 * /shop -> oeffnet das Shop-Hauptmenue.
 */
public class ShopCommand implements CommandExecutor {

    private final BigMC plugin;

    public ShopCommand(BigMC plugin) {
        this.plugin = plugin;
    }

    @Override
    public boolean onCommand(CommandSender sender, Command command, String label, String[] args) {
        if (!(sender instanceof Player player)) {
            plugin.getMessageManager().send(sender, "general.player-only");
            return true;
        }
        plugin.getShopGUI().openMain(player);
        return true;
    }
}
