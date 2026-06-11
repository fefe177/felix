package eu.bieder.bigmc.spawn.command;

import eu.bieder.bigmc.BigMC;
import eu.bieder.bigmc.spawn.SpawnAreaBuilder;
import org.bukkit.command.Command;
import org.bukkit.command.CommandExecutor;
import org.bukkit.command.CommandSender;
import org.bukkit.entity.Player;

/**
 * /spawnbuild -> oeffnet das Auswahl-GUI mit den 5 Spawn-Designs (Admin).
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
        // Hinweis + GUI oeffnen
        msg.send(player, "spawn.build-warning", "%radius%", String.valueOf(SpawnAreaBuilder.RADIUS));
        plugin.getSpawnBuildGUI().open(player);
        return true;
    }
}
