package eu.bieder.bigmc.rank.command;

import eu.bieder.bigmc.BigMC;
import eu.bieder.bigmc.config.MessageManager;
import eu.bieder.bigmc.rank.RankManager;
import org.bukkit.command.Command;
import org.bukkit.command.CommandExecutor;
import org.bukkit.command.CommandSender;

import java.util.List;

/**
 * /ranks -> listet alle Raenge der Leiter mit Preis und Voraussetzungen auf.
 */
public class RanksCommand implements CommandExecutor {

    private final BigMC plugin;

    public RanksCommand(BigMC plugin) {
        this.plugin = plugin;
    }

    @Override
    public boolean onCommand(CommandSender sender, Command command, String label, String[] args) {
        MessageManager msg = plugin.getMessageManager();
        List<RankManager.Rank> ranks = plugin.getRankManager().getRanks();

        if (ranks.isEmpty()) {
            msg.send(sender, "ranks.none-configured");
            return true;
        }

        sender.sendMessage(msg.getRaw("ranks.list-header"));
        for (RankManager.Rank rank : ranks) {
            String costText = rank.cost() <= 0
                    ? msg.getRaw("ranks.list-free")
                    : plugin.getEconomyManager().formatMoney(rank.cost());
            sender.sendMessage(msg.getRaw("ranks.list-entry")
                    .replace("%rank%", MessageManager.color(rank.displayName()))
                    .replace("%cost%", costText));
        }
        return true;
    }
}
