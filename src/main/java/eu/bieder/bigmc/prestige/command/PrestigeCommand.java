package eu.bieder.bigmc.prestige.command;

import eu.bieder.bigmc.BigMC;
import org.bukkit.command.Command;
import org.bukkit.command.CommandExecutor;
import org.bukkit.command.CommandSender;
import org.bukkit.entity.Player;

/**
 * /prestige         -> Prestige-GUI oeffnen
 * /prestige confirm -> direkt Prestige durchfuehren
 */
public class PrestigeCommand implements CommandExecutor {

    private final BigMC plugin;

    public PrestigeCommand(BigMC plugin) {
        this.plugin = plugin;
    }

    @Override
    public boolean onCommand(CommandSender sender, Command command, String label, String[] args) {
        if (!(sender instanceof Player player)) {
            plugin.getMessageManager().send(sender, "general.player-only");
            return true;
        }
        if (args.length == 1 && args[0].equalsIgnoreCase("confirm")) {
            plugin.getPrestigeManager().prestige(player);
            return true;
        }
        plugin.getPrestigeGUI().open(player);
        return true;
    }
}
