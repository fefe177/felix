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
 * /pay <spieler> <betrag> -> ueberweist Geld an einen anderen Spieler.
 * Funktioniert auch, wenn der Empfaenger gerade offline ist
 * (solange er schon einmal auf dem Server war).
 */
public class PayCommand implements CommandExecutor, TabCompleter {

    private final BigMC plugin;

    public PayCommand(BigMC plugin) {
        this.plugin = plugin;
    }

    @Override
    public boolean onCommand(CommandSender sender, Command command, String label, String[] args) {
        MessageManager msg = plugin.getMessageManager();
        EconomyManager eco = plugin.getEconomyManager();

        if (!(sender instanceof Player player)) {
            msg.send(sender, "general.player-only");
            return true;
        }

        if (args.length != 2) {
            msg.send(sender, "economy.pay-usage");
            return true;
        }

        // Empfaenger suchen (muss schon mal auf dem Server gewesen sein)
        Optional<EconomyManager.Account> target = eco.findAccount(args[0]);
        if (target.isEmpty()) {
            msg.send(sender, "general.player-not-found");
            return true;
        }
        EconomyManager.Account receiver = target.get();

        // Sich selbst Geld schicken ist sinnlos -> blockieren
        if (receiver.uuid().equals(player.getUniqueId())) {
            msg.send(sender, "economy.pay-self");
            return true;
        }

        // Betrag parsen und pruefen
        double amount;
        try {
            amount = Double.parseDouble(args[1].replace(',', '.'));
        } catch (NumberFormatException e) {
            msg.send(sender, "general.invalid-number");
            return true;
        }
        double minAmount = plugin.getConfigManager().getConfig()
                .getDouble("economy.pay-min-amount", 0.01);
        if (!Double.isFinite(amount) || amount < minAmount) {
            msg.send(sender, "economy.pay-too-small",
                    "%min%", eco.formatMoney(minAmount));
            return true;
        }

        // Ueberweisung durchfuehren (mit Deckungspruefung)
        if (!eco.transfer(player.getUniqueId(), receiver.uuid(), amount)) {
            msg.send(sender, "economy.not-enough-money");
            return true;
        }

        msg.send(player, "economy.pay-sent",
                "%amount%", eco.formatMoney(amount), "%player%", receiver.name());

        // Empfaenger benachrichtigen, falls er online ist
        Player online = Bukkit.getPlayer(receiver.uuid());
        if (online != null) {
            msg.send(online, "economy.pay-received",
                    "%amount%", eco.formatMoney(amount), "%player%", player.getName());
        }
        return true;
    }

    @Override
    public List<String> onTabComplete(CommandSender sender, Command command, String alias, String[] args) {
        List<String> result = new ArrayList<>();
        if (args.length == 1) {
            Bukkit.getOnlinePlayers().forEach(p -> {
                if (!p.getName().equals(sender.getName())) {
                    result.add(p.getName());
                }
            });
            result.removeIf(s -> !s.toLowerCase().startsWith(args[0].toLowerCase()));
        }
        return result;
    }
}
