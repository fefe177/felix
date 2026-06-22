package eu.bieder.bigmc.rtp.command;

import eu.bieder.bigmc.BigMC;
import eu.bieder.bigmc.rtp.RtpManager;
import org.bukkit.command.Command;
import org.bukkit.command.CommandExecutor;
import org.bukkit.command.CommandSender;
import org.bukkit.command.TabCompleter;
import org.bukkit.entity.Player;

import java.util.ArrayList;
import java.util.List;

/**
 * /rtp                       -> oeffnet das Auswahl-GUI (Dimension waehlen)
 * /rtp overworld|nether|end  -> teleportiert direkt in die gewuenschte Dimension
 *
 * Cooldown und optionale Kosten kommen aus der config.
 */
public class RtpCommand implements CommandExecutor, TabCompleter {

    private static final List<String> DIMENSIONS = List.of("overworld", "nether", "end");

    private final BigMC plugin;

    public RtpCommand(BigMC plugin) {
        this.plugin = plugin;
    }

    @Override
    public boolean onCommand(CommandSender sender, Command command, String label, String[] args) {
        if (!(sender instanceof Player player)) {
            plugin.getMessageManager().send(sender, "general.player-only");
            return true;
        }

        // Ohne Argument: GUI zur Dimensionswahl oeffnen
        if (args.length == 0) {
            plugin.getRtpGUI().open(player);
            return true;
        }

        // Mit Argument: direkt in die gewaehlte Dimension teleportieren
        RtpManager.Dimension dim = RtpManager.Dimension.fromArg(args[0]);
        plugin.getRtpManager().attemptTeleport(player, dim);
        return true;
    }

    @Override
    public List<String> onTabComplete(CommandSender sender, Command command, String alias, String[] args) {
        List<String> result = new ArrayList<>();
        if (args.length == 1) {
            for (String dim : DIMENSIONS) {
                if (dim.startsWith(args[0].toLowerCase())) result.add(dim);
            }
        }
        return result;
    }
}
