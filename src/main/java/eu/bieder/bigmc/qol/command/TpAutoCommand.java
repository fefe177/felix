package eu.bieder.bigmc.qol.command;

import eu.bieder.bigmc.BigMC;
import org.bukkit.command.Command;
import org.bukkit.command.CommandExecutor;
import org.bukkit.command.CommandSender;
import org.bukkit.entity.Player;

/**
 * /tpauto -> schaltet das automatische Annehmen eingehender TPA-Anfragen an/aus.
 */
public class TpAutoCommand implements CommandExecutor {

    private final BigMC plugin;

    public TpAutoCommand(BigMC plugin) {
        this.plugin = plugin;
    }

    @Override
    public boolean onCommand(CommandSender sender, Command command, String label, String[] args) {
        if (!(sender instanceof Player player)) {
            plugin.getMessageManager().send(sender, "general.player-only");
            return true;
        }
        boolean enabled = plugin.getTpaManager().toggleAuto(player.getUniqueId());
        plugin.getMessageManager().send(player, enabled ? "tpa.auto-on" : "tpa.auto-off");
        return true;
    }
}
