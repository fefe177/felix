package eu.bieder.bigmc.stats.command;

import eu.bieder.bigmc.BigMC;
import eu.bieder.bigmc.config.MessageManager;
import eu.bieder.bigmc.economy.EconomyManager;
import eu.bieder.bigmc.stats.StatsManager;
import org.bukkit.command.Command;
import org.bukkit.command.CommandExecutor;
import org.bukkit.command.CommandSender;
import org.bukkit.command.TabCompleter;

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

/**
 * /top <kills|tode|duelle|spielzeit|geld> -> Rangliste einer Kategorie.
 * "geld" greift auf die Economy-Tabelle zu, der Rest auf die Stats-Tabelle.
 */
public class TopCommand implements CommandExecutor, TabCompleter {

    private static final List<String> CATEGORIES =
            List.of("kills", "tode", "duelle", "spielzeit", "geld");

    private final BigMC plugin;

    public TopCommand(BigMC plugin) {
        this.plugin = plugin;
    }

    @Override
    public boolean onCommand(CommandSender sender, Command command, String label, String[] args) {
        MessageManager msg = plugin.getMessageManager();

        if (args.length != 1) {
            msg.send(sender, "stats.top-usage", "%categories%", String.join(", ", CATEGORIES));
            return true;
        }

        int size = plugin.getConfigManager().getConfig().getInt("stats.top-size", 10);
        String category = args[0].toLowerCase();

        // Geld kommt aus der Economy-Tabelle
        if (category.equals("geld")) {
            List<EconomyManager.Account> top = plugin.getEconomyManager().getTopBalances(size);
            sender.sendMessage(msg.getRaw("stats.top-header").replace("%category%", "Geld"));
            int place = 1;
            for (EconomyManager.Account acc : top) {
                sender.sendMessage(msg.getRaw("stats.top-entry")
                        .replace("%place%", String.valueOf(place++))
                        .replace("%player%", acc.name())
                        .replace("%value%", plugin.getEconomyManager().formatMoney(acc.balance())));
            }
            return true;
        }

        // Alle anderen Kategorien aus der Stats-Tabelle
        Optional<StatsManager.Category> cat = StatsManager.Category.byArg(category);
        if (cat.isEmpty()) {
            msg.send(sender, "stats.top-usage", "%categories%", String.join(", ", CATEGORIES));
            return true;
        }

        List<StatsManager.PlayerStats> top = plugin.getStatsManager().getTop(cat.get(), size);
        if (top.isEmpty()) {
            msg.send(sender, "stats.top-empty");
            return true;
        }

        String categoryName = msg.getRaw("stats.category-" + cat.get().arg);
        sender.sendMessage(msg.getRaw("stats.top-header").replace("%category%", categoryName));
        int place = 1;
        for (StatsManager.PlayerStats s : top) {
            String value = switch (cat.get()) {
                case KILLS -> String.valueOf(s.kills());
                case TODE -> String.valueOf(s.deaths());
                case DUELLE -> String.valueOf(s.duelWins());
                case SPIELZEIT -> StatsManager.formatPlaytime(s.playtimeSeconds());
            };
            sender.sendMessage(msg.getRaw("stats.top-entry")
                    .replace("%place%", String.valueOf(place++))
                    .replace("%player%", s.name())
                    .replace("%value%", value));
        }
        return true;
    }

    @Override
    public List<String> onTabComplete(CommandSender sender, Command command, String alias, String[] args) {
        List<String> result = new ArrayList<>();
        if (args.length == 1) {
            for (String cat : CATEGORIES) {
                if (cat.startsWith(args[0].toLowerCase())) result.add(cat);
            }
        }
        return result;
    }
}
