package eu.bieder.bigmc.drill.command;

import eu.bieder.bigmc.BigMC;
import eu.bieder.bigmc.config.MessageManager;
import org.bukkit.Bukkit;
import org.bukkit.command.Command;
import org.bukkit.command.CommandExecutor;
import org.bukkit.command.CommandSender;
import org.bukkit.command.TabCompleter;
import org.bukkit.entity.Player;
import org.bukkit.inventory.ItemStack;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * /drill              -> Drill-Spitzhacke fuer Ingame-Geld kaufen
 * /drill give <name>  -> Drill verschenken (Admin)
 */
public class DrillCommand implements CommandExecutor, TabCompleter {

    private final BigMC plugin;

    public DrillCommand(BigMC plugin) {
        this.plugin = plugin;
    }

    @Override
    public boolean onCommand(CommandSender sender, Command command, String label, String[] args) {
        MessageManager msg = plugin.getMessageManager();

        // /drill give <name> -> Admin
        if (args.length >= 1 && args[0].equalsIgnoreCase("give")) {
            if (!sender.hasPermission("bigmc.drill.admin")) {
                msg.send(sender, "general.no-permission");
                return true;
            }
            if (args.length != 2) {
                msg.send(sender, "drill.give-usage");
                return true;
            }
            Player target = Bukkit.getPlayerExact(args[1]);
            if (target == null) {
                msg.send(sender, "general.player-not-found");
                return true;
            }
            giveDrill(target);
            msg.send(sender, "drill.given", "%player%", target.getName());
            msg.send(target, "drill.received");
            return true;
        }

        // /drill -> kaufen
        if (!(sender instanceof Player player)) {
            msg.send(sender, "general.player-only");
            return true;
        }

        double price = plugin.getDrillManager().getPrice();
        if (!plugin.getEconomyManager().withdraw(player.getUniqueId(), price)) {
            msg.send(player, "economy.not-enough-money");
            return true;
        }
        // Passt die Drill nicht ins Inventar -> Geld zurueck
        if (!giveDrill(player)) {
            plugin.getEconomyManager().deposit(player.getUniqueId(), price);
            msg.send(player, "drill.inventory-full");
            return true;
        }
        msg.send(player, "drill.bought",
                "%price%", plugin.getEconomyManager().formatMoney(price));
        return true;
    }

    /** Gibt dem Spieler eine Drill (false, wenn das Inventar voll ist). */
    private boolean giveDrill(Player player) {
        ItemStack drill = plugin.getDrillManager().createDrill();
        Map<Integer, ItemStack> leftover = player.getInventory().addItem(drill);
        return leftover.isEmpty();
    }

    @Override
    public List<String> onTabComplete(CommandSender sender, Command command, String alias, String[] args) {
        List<String> result = new ArrayList<>();
        if (args.length == 1 && sender.hasPermission("bigmc.drill.admin")) {
            if ("give".startsWith(args[0].toLowerCase())) result.add("give");
        } else if (args.length == 2 && args[0].equalsIgnoreCase("give")
                && sender.hasPermission("bigmc.drill.admin")) {
            Bukkit.getOnlinePlayers().forEach(p -> result.add(p.getName()));
            result.removeIf(s -> !s.toLowerCase().startsWith(args[1].toLowerCase()));
        }
        return result;
    }
}
