package eu.bieder.bigmc.shards.command;

import eu.bieder.bigmc.BigMC;
import eu.bieder.bigmc.config.MessageManager;
import eu.bieder.bigmc.shards.ShardsManager;
import org.bukkit.Bukkit;
import org.bukkit.command.Command;
import org.bukkit.command.CommandExecutor;
import org.bukkit.command.CommandSender;
import org.bukkit.command.TabCompleter;
import org.bukkit.entity.Player;

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

/**
 * /shards                          -> eigenen Shards-Stand anzeigen
 * /shards <spieler>                -> Stand eines anderen anzeigen
 * /shards pay <spieler> <anzahl>   -> Shards ueberweisen
 * /shards give|take|set <spieler> <anzahl> -> verwalten (Admin)
 */
public class ShardsCommand implements CommandExecutor, TabCompleter {

    private final BigMC plugin;

    public ShardsCommand(BigMC plugin) {
        this.plugin = plugin;
    }

    @Override
    public boolean onCommand(CommandSender sender, Command command, String label, String[] args) {
        MessageManager msg = plugin.getMessageManager();
        ShardsManager shards = plugin.getShardsManager();

        // /shards -> eigener Stand
        if (args.length == 0) {
            if (!(sender instanceof Player player)) {
                msg.send(sender, "general.player-only");
                return true;
            }
            msg.send(player, "shards.balance-own",
                    "%amount%", shards.formatShards(shards.getShards(player.getUniqueId())));
            return true;
        }

        // /shards pay <spieler> <anzahl>
        if (args.length == 3 && args[0].equalsIgnoreCase("pay")) {
            pay(sender, args);
            return true;
        }

        // /shards give|take|set <spieler> <anzahl> (Admin)
        if (args.length == 3 && isAdminAction(args[0])) {
            admin(sender, args);
            return true;
        }

        // /shards <spieler>
        if (args.length == 1) {
            Optional<ShardsManager.Account> target = shards.findAccount(args[0]);
            if (target.isEmpty()) {
                msg.send(sender, "general.player-not-found");
                return true;
            }
            msg.send(sender, "shards.balance-other",
                    "%player%", target.get().name(),
                    "%amount%", shards.formatShards(target.get().amount()));
            return true;
        }

        msg.send(sender, "shards.usage");
        return true;
    }

    private void pay(CommandSender sender, String[] args) {
        MessageManager msg = plugin.getMessageManager();
        ShardsManager shards = plugin.getShardsManager();

        if (!(sender instanceof Player player)) {
            msg.send(sender, "general.player-only");
            return;
        }
        Optional<ShardsManager.Account> target = shards.findAccount(args[1]);
        if (target.isEmpty()) {
            msg.send(player, "general.player-not-found");
            return;
        }
        if (target.get().uuid().equals(player.getUniqueId())) {
            msg.send(player, "shards.pay-self");
            return;
        }
        long amount = parseAmount(args[2]);
        if (amount <= 0) {
            msg.send(player, "general.invalid-number");
            return;
        }
        if (!shards.transfer(player.getUniqueId(), target.get().uuid(), amount)) {
            msg.send(player, "shards.not-enough");
            return;
        }
        msg.send(player, "shards.pay-sent",
                "%amount%", shards.formatShards(amount), "%player%", target.get().name());
        Player online = Bukkit.getPlayer(target.get().uuid());
        if (online != null) {
            msg.send(online, "shards.pay-received",
                    "%amount%", shards.formatShards(amount), "%player%", player.getName());
        }
    }

    private void admin(CommandSender sender, String[] args) {
        MessageManager msg = plugin.getMessageManager();
        ShardsManager shards = plugin.getShardsManager();

        if (!sender.hasPermission("bigmc.shards.admin")) {
            msg.send(sender, "general.no-permission");
            return;
        }
        Optional<ShardsManager.Account> target = shards.findAccount(args[1]);
        if (target.isEmpty()) {
            msg.send(sender, "general.player-not-found");
            return;
        }
        long amount = parseAmount(args[2]);
        if (amount < 0) {
            msg.send(sender, "general.invalid-number");
            return;
        }
        ShardsManager.Account acc = target.get();
        switch (args[0].toLowerCase()) {
            case "give" -> {
                shards.addShards(acc.uuid(), amount);
                msg.send(sender, "shards.admin-given",
                        "%amount%", shards.formatShards(amount), "%player%", acc.name());
            }
            case "take" -> {
                if (!shards.takeShards(acc.uuid(), amount)) {
                    msg.send(sender, "shards.admin-take-failed", "%player%", acc.name());
                    return;
                }
                msg.send(sender, "shards.admin-taken",
                        "%amount%", shards.formatShards(amount), "%player%", acc.name());
            }
            case "set" -> {
                shards.setShards(acc.uuid(), amount);
                msg.send(sender, "shards.admin-set",
                        "%player%", acc.name(), "%amount%", shards.formatShards(amount));
            }
        }
    }

    private boolean isAdminAction(String arg) {
        String a = arg.toLowerCase();
        return a.equals("give") || a.equals("take") || a.equals("set");
    }

    private long parseAmount(String input) {
        try {
            return Long.parseLong(input);
        } catch (NumberFormatException e) {
            return -1;
        }
    }

    @Override
    public List<String> onTabComplete(CommandSender sender, Command command, String alias, String[] args) {
        List<String> result = new ArrayList<>();
        if (args.length == 1) {
            result.add("pay");
            if (sender.hasPermission("bigmc.shards.admin")) {
                result.add("give");
                result.add("take");
                result.add("set");
            }
            Bukkit.getOnlinePlayers().forEach(p -> result.add(p.getName()));
            result.removeIf(s -> !s.toLowerCase().startsWith(args[0].toLowerCase()));
        } else if (args.length == 2 && (args[0].equalsIgnoreCase("pay") || isAdminAction(args[0]))) {
            Bukkit.getOnlinePlayers().forEach(p -> result.add(p.getName()));
            result.removeIf(s -> !s.toLowerCase().startsWith(args[1].toLowerCase()));
        }
        return result;
    }
}
