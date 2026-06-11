package eu.bieder.bigmc.spawn.command;

import eu.bieder.bigmc.BigMC;
import eu.bieder.bigmc.spawn.SpawnAreaBuilder;
import org.bukkit.command.Command;
import org.bukkit.command.CommandExecutor;
import org.bukkit.command.CommandSender;
import org.bukkit.entity.Player;

/**
 * /spawnbuild         -> Warnung anzeigen (Bau ueberschreibt Bloecke!)
 * /spawnbuild confirm -> Spawn-Area an der eigenen Position bauen (Admin)
 */
public class SpawnBuildCommand implements CommandExecutor {

    private final BigMC plugin;

    public SpawnBuildCommand(BigMC plugin) {
        this.plugin = plugin;
    }

    @Override
    public boolean onCommand(CommandSender sender, Command command, String label, String[] args) {
        var msg = plugin.getMessageManager();

        if (!(sender instanceof Player player)) {
            msg.send(sender, "general.player-only");
            return true;
        }
        if (!player.hasPermission("bigmc.spawn.admin")) {
            msg.send(player, "general.no-permission");
            return true;
        }

        // Erst bestaetigen lassen - der Bau ueberschreibt die Umgebung!
        if (args.length != 1 || !args[0].equalsIgnoreCase("confirm")) {
            msg.send(player, "spawn.build-warning",
                    "%radius%", String.valueOf(SpawnAreaBuilder.RADIUS));
            return true;
        }

        msg.send(player, "spawn.build-started");
        new SpawnAreaBuilder(plugin).build(player.getLocation());
        msg.send(player, "spawn.build-done",
                "%radius%", String.valueOf(SpawnAreaBuilder.RADIUS + 5));
        return true;
    }
}
