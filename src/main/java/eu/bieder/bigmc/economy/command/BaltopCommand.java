package eu.bieder.bigmc.economy.command;

import eu.bieder.bigmc.BigMC;
import eu.bieder.bigmc.config.MessageManager;
import eu.bieder.bigmc.economy.EconomyManager;
import org.bukkit.command.Command;
import org.bukkit.command.CommandExecutor;
import org.bukkit.command.CommandSender;

import java.util.List;

/**
 * /baltop -> zeigt die reichsten Spieler des Servers als Rangliste.
 * Die Anzahl der Eintraege ist in der config.yml einstellbar.
 */
public class BaltopCommand implements CommandExecutor {

    private final BigMC plugin;

    public BaltopCommand(BigMC plugin) {
        this.plugin = plugin;
    }

    @Override
    public boolean onCommand(CommandSender sender, Command command, String label, String[] args) {
        MessageManager msg = plugin.getMessageManager();
        EconomyManager eco = plugin.getEconomyManager();

        int size = plugin.getConfigManager().getConfig().getInt("economy.baltop-size", 10);
        List<EconomyManager.Account> top = eco.getTopBalances(size);

        if (top.isEmpty()) {
            msg.send(sender, "economy.baltop-empty");
            return true;
        }

        // Kopfzeile ohne Praefix, dann eine Zeile pro Platz
        sender.sendMessage(msg.getRaw("economy.baltop-header"));
        int place = 1;
        for (EconomyManager.Account acc : top) {
            sender.sendMessage(msg.getRaw("economy.baltop-entry")
                    .replace("%place%", String.valueOf(place))
                    .replace("%player%", acc.name())
                    .replace("%amount%", eco.formatMoney(acc.balance())));
            place++;
        }
        return true;
    }
}
