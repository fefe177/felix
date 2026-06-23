package eu.bieder.bigmc.qol.command;

import eu.bieder.bigmc.BigMC;
import org.bukkit.Bukkit;
import org.bukkit.command.Command;
import org.bukkit.command.CommandExecutor;
import org.bukkit.command.CommandSender;
import org.bukkit.entity.Player;
import org.bukkit.inventory.Inventory;

/**
 * /trash -> oeffnet einen Muelleimer. Alles, was beim Schliessen drinliegt,
 * wird verworfen (das Inventar hat keinen Holder und wird nicht gespeichert).
 */
public class TrashCommand implements CommandExecutor {

    private final BigMC plugin;

    public TrashCommand(BigMC plugin) {
        this.plugin = plugin;
    }

    @Override
    public boolean onCommand(CommandSender sender, Command command, String label, String[] args) {
        if (!(sender instanceof Player player)) {
            plugin.getMessageManager().send(sender, "general.player-only");
            return true;
        }
        Inventory inv = Bukkit.createInventory(null, 54, plugin.getMessageManager().getRaw("qol.trash-title"));
        player.openInventory(inv);
        plugin.getMessageManager().send(player, "qol.trash-warn");
        return true;
    }
}
