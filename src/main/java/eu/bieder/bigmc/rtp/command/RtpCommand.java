package eu.bieder.bigmc.rtp.command;

import eu.bieder.bigmc.BigMC;
import org.bukkit.Location;
import org.bukkit.command.Command;
import org.bukkit.command.CommandExecutor;
import org.bukkit.command.CommandSender;
import org.bukkit.entity.Player;

/**
 * /rtp -> teleportiert an eine zufaellige sichere Position in der RTP-Area.
 * Cooldown und optionale Kosten aus der config.
 */
public class RtpCommand implements CommandExecutor {

    private final BigMC plugin;

    public RtpCommand(BigMC plugin) {
        this.plugin = plugin;
    }

    @Override
    public boolean onCommand(CommandSender sender, Command command, String label, String[] args) {
        var msg = plugin.getMessageManager();

        if (!(sender instanceof Player player)) {
            msg.send(sender, "general.player-only");
            return true;
        }

        // Cooldown pruefen
        long remaining = plugin.getRtpManager().getRemainingCooldown(player.getUniqueId());
        if (remaining > 0 && !player.hasPermission("bigmc.rtp.bypass")) {
            msg.send(player, "rtp.cooldown", "%seconds%", String.valueOf(remaining));
            return true;
        }

        // Optionale Kosten abbuchen
        double cost = plugin.getRtpManager().getCost();
        if (cost > 0 && !plugin.getEconomyManager().withdraw(player.getUniqueId(), cost)) {
            msg.send(player, "economy.not-enough-money");
            return true;
        }

        msg.send(player, "rtp.searching");
        Location target = plugin.getRtpManager().findSafeLocation();
        if (target == null) {
            // Kein sicherer Platz gefunden -> Kosten erstatten
            if (cost > 0) {
                plugin.getEconomyManager().deposit(player.getUniqueId(), cost);
            }
            msg.send(player, "rtp.no-location");
            return true;
        }

        plugin.getRtpManager().markUsed(player.getUniqueId());
        player.setFallDistance(0f);
        player.teleport(target);
        msg.send(player, "rtp.teleported",
                "%x%", String.valueOf(target.getBlockX()),
                "%z%", String.valueOf(target.getBlockZ()));
        return true;
    }
}
