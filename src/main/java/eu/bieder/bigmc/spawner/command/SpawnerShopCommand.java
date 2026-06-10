package eu.bieder.bigmc.spawner.command;

import eu.bieder.bigmc.BigMC;
import org.bukkit.command.Command;
import org.bukkit.command.CommandExecutor;
import org.bukkit.command.CommandSender;
import org.bukkit.entity.Player;

/**
 * /spawnershop -> oeffnet den Spawner-Shop.
 */
public class SpawnerShopCommand implements CommandExecutor {

    private final BigMC plugin;

    public SpawnerShopCommand(BigMC plugin) {
        this.plugin = plugin;
    }

    @Override
    public boolean onCommand(CommandSender sender, Command command, String label, String[] args) {
        if (!(sender instanceof Player player)) {
            plugin.getMessageManager().send(sender, "general.player-only");
            return true;
        }
        plugin.getSpawnerShopGUI().open(player);
        return true;
    }
}
