package eu.bieder.bigmc.dailylogin.command;

import eu.bieder.bigmc.BigMC;
import org.bukkit.command.Command;
import org.bukkit.command.CommandExecutor;
import org.bukkit.command.CommandSender;
import org.bukkit.entity.Player;

/**
 * /dailyreward        -> Login-Reward-GUI
 * /dailyreward claim  -> heutige Belohnung abholen
 */
public class DailyRewardCommand implements CommandExecutor {

    private final BigMC plugin;

    public DailyRewardCommand(BigMC plugin) {
        this.plugin = plugin;
    }

    @Override
    public boolean onCommand(CommandSender sender, Command command, String label, String[] args) {
        if (!(sender instanceof Player player)) {
            plugin.getMessageManager().send(sender, "general.player-only");
            return true;
        }
        if (args.length == 1 && args[0].equalsIgnoreCase("claim")) {
            plugin.getDailyLoginManager().claim(player);
            return true;
        }
        plugin.getDailyLoginGUI().open(player);
        return true;
    }
}
