package eu.bieder.bigmc.economy.command;

import eu.bieder.bigmc.BigMC;
import eu.bieder.bigmc.config.MessageManager;
import eu.bieder.bigmc.economy.EconomyManager;
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
 * /money                          -> eigenen Kontostand anzeigen
 * /money <spieler>                -> Kontostand eines anderen anzeigen
 * /money give <spieler> <betrag>  -> Geld geben    (Admin)
 * /money take <spieler> <betrag>  -> Geld abziehen (Admin)
 * /money set  <spieler> <betrag>  -> Geld setzen   (Admin)
 */
public class MoneyCommand implements CommandExecutor, TabCompleter {

    private final BigMC plugin;

    public MoneyCommand(BigMC plugin) {
        this.plugin = plugin;
    }

    @Override
    public boolean onCommand(CommandSender sender, Command command, String label, String[] args) {
        MessageManager msg = plugin.getMessageManager();
        EconomyManager eco = plugin.getEconomyManager();

        // /money -> eigener Kontostand
        if (args.length == 0) {
            if (!(sender instanceof Player player)) {
                msg.send(sender, "general.player-only");
                return true;
            }
            msg.send(sender, "economy.balance-own",
                    "%amount%", eco.formatMoney(eco.getBalance(player.getUniqueId())));
            return true;
        }

        // /money give|take|set <spieler> <betrag> -> Admin-Befehle
        if (args.length == 3 && isAdminAction(args[0])) {
            if (!sender.hasPermission("bigmc.money.admin")) {
                msg.send(sender, "general.no-permission");
                return true;
            }

            Optional<EconomyManager.Account> target = eco.findAccount(args[1]);
            if (target.isEmpty()) {
                msg.send(sender, "general.player-not-found");
                return true;
            }

            double amount;
            try {
                amount = Double.parseDouble(args[2].replace(',', '.'));
            } catch (NumberFormatException e) {
                msg.send(sender, "general.invalid-number");
                return true;
            }
            if (amount < 0 || !Double.isFinite(amount)) {
                msg.send(sender, "general.invalid-number");
                return true;
            }

            EconomyManager.Account acc = target.get();
            switch (args[0].toLowerCase()) {
                case "give" -> {
                    eco.deposit(acc.uuid(), amount);
                    msg.send(sender, "economy.admin-given",
                            "%amount%", eco.formatMoney(amount), "%player%", acc.name());
                }
                case "take" -> {
                    if (!eco.withdraw(acc.uuid(), amount)) {
                        msg.send(sender, "economy.admin-take-failed", "%player%", acc.name());
                        return true;
                    }
                    msg.send(sender, "economy.admin-taken",
                            "%amount%", eco.formatMoney(amount), "%player%", acc.name());
                }
                case "set" -> {
                    eco.setBalance(acc.uuid(), amount);
                    msg.send(sender, "economy.admin-set",
                            "%player%", acc.name(), "%amount%", eco.formatMoney(amount));
                }
            }
            return true;
        }

        // /money <spieler> -> fremden Kontostand anzeigen
        if (args.length == 1) {
            if (!sender.hasPermission("bigmc.money.others")) {
                msg.send(sender, "general.no-permission");
                return true;
            }
            Optional<EconomyManager.Account> target = eco.findAccount(args[0]);
            if (target.isEmpty()) {
                msg.send(sender, "general.player-not-found");
                return true;
            }
            msg.send(sender, "economy.balance-other",
                    "%player%", target.get().name(),
                    "%amount%", eco.formatMoney(target.get().balance()));
            return true;
        }

        msg.send(sender, "economy.money-usage");
        return true;
    }

    private boolean isAdminAction(String arg) {
        String a = arg.toLowerCase();
        return a.equals("give") || a.equals("take") || a.equals("set");
    }

    @Override
    public List<String> onTabComplete(CommandSender sender, Command command, String alias, String[] args) {
        List<String> result = new ArrayList<>();
        if (args.length == 1) {
            // Subcommands fuer Admins + Online-Spielernamen
            if (sender.hasPermission("bigmc.money.admin")) {
                result.add("give");
                result.add("take");
                result.add("set");
            }
            Bukkit.getOnlinePlayers().forEach(p -> result.add(p.getName()));
            result.removeIf(s -> !s.toLowerCase().startsWith(args[0].toLowerCase()));
        } else if (args.length == 2 && isAdminAction(args[0])) {
            Bukkit.getOnlinePlayers().forEach(p -> result.add(p.getName()));
            result.removeIf(s -> !s.toLowerCase().startsWith(args[1].toLowerCase()));
        }
        return result;
    }
}
