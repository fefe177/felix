package eu.bieder.bigmc.enderchest.command;

import eu.bieder.bigmc.BigMC;
import eu.bieder.bigmc.enderchest.EnderchestHolder;
import org.bukkit.Bukkit;
import org.bukkit.command.Command;
import org.bukkit.command.CommandExecutor;
import org.bukkit.command.CommandSender;
import org.bukkit.entity.Player;
import org.bukkit.inventory.Inventory;

/**
 * /ec -> oeffnet die virtuelle Enderchest (27 Slots, Premium 54).
 */
public class EnderchestCommand implements CommandExecutor {

    private final BigMC plugin;

    public EnderchestCommand(BigMC plugin) {
        this.plugin = plugin;
    }

    @Override
    public boolean onCommand(CommandSender sender, Command command, String label, String[] args) {
        if (!(sender instanceof Player player)) {
            plugin.getMessageManager().send(sender, "general.player-only");
            return true;
        }

        int size = plugin.getPremiumService().getEnderchestSize(player);
        EnderchestHolder holder = new EnderchestHolder(player.getUniqueId());
        Inventory inv = Bukkit.createInventory(holder, size,
                plugin.getMessageManager().getRaw("enderchest.gui-title"));
        holder.setInventory(inv);
        plugin.getEnderchestManager().load(player.getUniqueId(), inv);
        player.openInventory(inv);
        return true;
    }
}
