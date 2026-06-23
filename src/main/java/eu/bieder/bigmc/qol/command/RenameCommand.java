package eu.bieder.bigmc.qol.command;

import eu.bieder.bigmc.BigMC;
import eu.bieder.bigmc.config.MessageManager;
import org.bukkit.Material;
import org.bukkit.command.Command;
import org.bukkit.command.CommandExecutor;
import org.bukkit.command.CommandSender;
import org.bukkit.entity.Player;
import org.bukkit.inventory.ItemStack;
import org.bukkit.inventory.meta.ItemMeta;

/**
 * /rename <name> -> benennt das Item in der Haupthand um (Farbcodes + Hex/Verlauf
 * erlaubt). Premium-Feature (Permission bigmc.rename).
 */
public class RenameCommand implements CommandExecutor {

    private final BigMC plugin;

    public RenameCommand(BigMC plugin) {
        this.plugin = plugin;
    }

    @Override
    public boolean onCommand(CommandSender sender, Command command, String label, String[] args) {
        MessageManager msg = plugin.getMessageManager();
        if (!(sender instanceof Player player)) {
            msg.send(sender, "general.player-only");
            return true;
        }
        if (!player.hasPermission("bigmc.rename")) {
            msg.send(player, "general.no-permission");
            return true;
        }
        if (args.length == 0) {
            msg.send(player, "qol.rename-usage");
            return true;
        }
        ItemStack hand = player.getInventory().getItemInMainHand();
        if (hand.getType() == Material.AIR) {
            msg.send(player, "qol.rename-empty");
            return true;
        }
        ItemMeta meta = hand.getItemMeta();
        if (meta == null) {
            msg.send(player, "qol.rename-empty");
            return true;
        }
        meta.setDisplayName(MessageManager.color(String.join(" ", args)));
        hand.setItemMeta(meta);
        msg.send(player, "qol.renamed");
        return true;
    }
}
