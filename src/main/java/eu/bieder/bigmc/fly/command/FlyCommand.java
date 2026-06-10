package eu.bieder.bigmc.fly.command;

import eu.bieder.bigmc.BigMC;
import eu.bieder.bigmc.config.MessageManager;
import eu.bieder.bigmc.fly.FlyManager;
import eu.bieder.bigmc.stats.StatsManager;
import org.bukkit.command.Command;
import org.bukkit.command.CommandExecutor;
import org.bukkit.command.CommandSender;
import org.bukkit.entity.Player;

/**
 * /fly        -> kauft befristete Flugzeit (Preis & Dauer aus config)
 * /fly off    -> beendet den Flug vorzeitig (keine Erstattung)
 * /fly time   -> zeigt die verbleibende Flugzeit
 */
public class FlyCommand implements CommandExecutor {

    private final BigMC plugin;

    public FlyCommand(BigMC plugin) {
        this.plugin = plugin;
    }

    @Override
    public boolean onCommand(CommandSender sender, Command command, String label, String[] args) {
        MessageManager msg = plugin.getMessageManager();
        FlyManager fm = plugin.getFlyManager();

        if (!(sender instanceof Player player)) {
            msg.send(sender, "general.player-only");
            return true;
        }

        // /fly off -> vorzeitig beenden
        if (args.length == 1 && args[0].equalsIgnoreCase("off")) {
            if (!fm.isFlying(player.getUniqueId())) {
                msg.send(player, "fly.not-active");
                return true;
            }
            fm.disableFly(player.getUniqueId(), true);
            msg.send(player, "fly.disabled");
            return true;
        }

        // /fly time -> Restzeit anzeigen
        if (args.length == 1 && args[0].equalsIgnoreCase("time")) {
            if (!fm.isFlying(player.getUniqueId())) {
                msg.send(player, "fly.not-active");
                return true;
            }
            msg.send(player, "fly.remaining",
                    "%time%", StatsManager.formatPlaytime(fm.getRemainingSeconds(player.getUniqueId())));
            return true;
        }

        // /fly -> Flugzeit kaufen
        double price = plugin.getConfigManager().getConfig().getDouble("fly.price", 1000.0);
        int durationSeconds = plugin.getConfigManager().getConfig().getInt("fly.duration-seconds", 300);

        if (!plugin.getEconomyManager().withdraw(player.getUniqueId(), price)) {
            msg.send(player, "economy.not-enough-money");
            return true;
        }

        boolean wasFlying = fm.isFlying(player.getUniqueId());
        fm.enableFly(player);

        msg.send(player, wasFlying ? "fly.extended" : "fly.enabled",
                "%price%", plugin.getEconomyManager().formatMoney(price),
                "%time%", StatsManager.formatPlaytime(durationSeconds),
                "%total%", StatsManager.formatPlaytime(fm.getRemainingSeconds(player.getUniqueId())));
        return true;
    }
}
