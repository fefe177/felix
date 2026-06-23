package eu.bieder.bigmc.gems.command;

import eu.bieder.bigmc.BigMC;
import eu.bieder.bigmc.config.MessageManager;
import org.bukkit.Bukkit;
import org.bukkit.command.Command;
import org.bukkit.command.CommandExecutor;
import org.bukkit.command.CommandSender;
import org.bukkit.command.TabCompleter;
import org.bukkit.entity.Player;

import java.util.ArrayList;
import java.util.List;

/**
 * /gems                         -> eigenen Gem-Stand anzeigen
 * /gems <spieler>               -> Gem-Stand eines anderen anzeigen
 * /gems give|take|set <s> <n>   -> Admin/Tebex (Permission bigmc.gems.admin)
 *
 * Die Admin-Unterbefehle sind konsolen-tauglich, damit Tebex sie nach einem
 * Kauf ausfuehren kann (z.B. "gems give {player} 1000").
 */
public class GemsCommand implements CommandExecutor, TabCompleter {

    private final BigMC plugin;

    public GemsCommand(BigMC plugin) {
        this.plugin = plugin;
    }

    @Override
    public boolean onCommand(CommandSender sender, Command command, String label, String[] args) {
        MessageManager msg = plugin.getMessageManager();

        // Admin: give/take/set
        if (args.length >= 1 && isAdminAction(args[0])) {
            if (!sender.hasPermission("bigmc.gems.admin")) {
                msg.send(sender, "general.no-permission");
                return true;
            }
            if (args.length != 3) {
                msg.send(sender, "gems.admin-usage");
                return true;
            }
            String target = args[1];
            long amount;
            try {
                amount = Long.parseLong(args[2]);
            } catch (NumberFormatException e) {
                msg.send(sender, "general.invalid-number");
                return true;
            }
            switch (args[0].toLowerCase()) {
                case "give" -> {
                    plugin.getGemsManager().add(target, amount);
                    msg.send(sender, "gems.admin-given",
                            "%amount%", plugin.getGemsManager().formatGems(amount), "%player%", target);
                    notify(target, "gems.received", "%amount%", plugin.getGemsManager().formatGems(amount));
                }
                case "take" -> {
                    if (plugin.getGemsManager().take(target, amount)) {
                        msg.send(sender, "gems.admin-taken",
                                "%amount%", plugin.getGemsManager().formatGems(amount), "%player%", target);
                    } else {
                        msg.send(sender, "gems.admin-take-failed", "%player%", target);
                    }
                }
                case "set" -> {
                    plugin.getGemsManager().set(target, amount);
                    msg.send(sender, "gems.admin-set",
                            "%amount%", plugin.getGemsManager().formatGems(amount), "%player%", target);
                }
            }
            return true;
        }

        // Anzeige
        if (args.length == 1) {
            long gems = plugin.getGemsManager().getGems(args[0]);
            msg.send(sender, "gems.balance-other",
                    "%player%", args[0], "%amount%", plugin.getGemsManager().formatGems(gems));
            return true;
        }
        if (!(sender instanceof Player player)) {
            msg.send(sender, "gems.admin-usage");
            return true;
        }
        long gems = plugin.getGemsManager().getGems(player.getName());
        msg.send(player, "gems.balance-own", "%amount%", plugin.getGemsManager().formatGems(gems));
        return true;
    }

    private boolean isAdminAction(String s) {
        return s.equalsIgnoreCase("give") || s.equalsIgnoreCase("take") || s.equalsIgnoreCase("set");
    }

    private void notify(String name, String key, String... repl) {
        Player online = Bukkit.getPlayerExact(name);
        if (online != null) plugin.getMessageManager().send(online, key, repl);
    }

    @Override
    public List<String> onTabComplete(CommandSender sender, Command command, String alias, String[] args) {
        List<String> result = new ArrayList<>();
        if (args.length == 1) {
            if (sender.hasPermission("bigmc.gems.admin")) {
                for (String a : List.of("give", "take", "set")) {
                    if (a.startsWith(args[0].toLowerCase())) result.add(a);
                }
            }
            Bukkit.getOnlinePlayers().forEach(p -> {
                if (p.getName().toLowerCase().startsWith(args[0].toLowerCase())) result.add(p.getName());
            });
        } else if (args.length == 2 && isAdminAction(args[0])) {
            Bukkit.getOnlinePlayers().forEach(p -> {
                if (p.getName().toLowerCase().startsWith(args[1].toLowerCase())) result.add(p.getName());
            });
        }
        return result;
    }
}
