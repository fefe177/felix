package eu.bieder.bigmc.spawn.command;

import eu.bieder.bigmc.BigMC;
import org.bukkit.Location;
import org.bukkit.command.Command;
import org.bukkit.command.CommandExecutor;
import org.bukkit.command.CommandSender;
import org.bukkit.entity.Player;

/**
 * /spawn    -> zum Server-Spawn teleportieren
 * /setspawn -> Spawnpunkt auf die eigene Position setzen (Admin)
 */
public class SpawnCommand implements CommandExecutor {

    private final BigMC plugin;

    public SpawnCommand(BigMC plugin) {
        this.plugin = plugin;
    }

    @Override
    public boolean onCommand(CommandSender sender, Command command, String label, String[] args) {
        var msg = plugin.getMessageManager();

        if (!(sender instanceof Player player)) {
            msg.send(sender, "general.player-only");
            return true;
        }

        // /setspawn (eigener Befehl, Admin)
        if (command.getName().equalsIgnoreCase("setspawn")) {
            if (!player.hasPermission("bigmc.spawn.admin")) {
                msg.send(player, "general.no-permission");
                return true;
            }
            plugin.getSpawnManager().setSpawn(player.getLocation());
            msg.send(player, "spawn.set");
            return true;
        }

        // /spawn
        Location spawn = plugin.getSpawnManager().getSpawn();
        if (spawn == null) {
            msg.send(player, "spawn.not-set");
            return true;
        }
        player.teleport(spawn);
        msg.send(player, "spawn.teleported");
        return true;
    }
}
