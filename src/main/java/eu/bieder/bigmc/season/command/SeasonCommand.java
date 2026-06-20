package eu.bieder.bigmc.season.command;

import eu.bieder.bigmc.BigMC;
import eu.bieder.bigmc.config.MessageManager;
import org.bukkit.command.Command;
import org.bukkit.command.CommandExecutor;
import org.bukkit.command.CommandSender;
import org.bukkit.command.TabCompleter;

import java.util.ArrayList;
import java.util.List;

/**
 * /season info  -> aktuelle Season + Ranglisten-Spitze
 * /season end   -> Season beenden, Belohnungen vergeben, naechste starten (Admin)
 */
public class SeasonCommand implements CommandExecutor, TabCompleter {

    private final BigMC plugin;

    public SeasonCommand(BigMC plugin) {
        this.plugin = plugin;
    }

    @Override
    public boolean onCommand(CommandSender sender, Command command, String label, String[] args) {
        MessageManager msg = plugin.getMessageManager();

        if (args.length >= 1 && args[0].equalsIgnoreCase("end")) {
            if (!sender.hasPermission("bigmc.season.admin")) {
                msg.send(sender, "general.no-permission");
                return true;
            }
            plugin.getSeasonManager().endSeason(sender);
            return true;
        }

        // /season (info)
        sender.sendMessage(msg.getRaw("season.info-header")
                .replace("%season%", String.valueOf(plugin.getSeasonManager().getSeason())));
        sender.sendMessage(msg.getRaw("season.info-ranking")
                .replace("%category%", plugin.getSeasonManager().getRankingCategory()));
        int place = 1;
        for (String[] row : plugin.getSeasonManager().getRanking(5)) {
            sender.sendMessage(msg.getRaw("season.info-entry")
                    .replace("%place%", String.valueOf(place++))
                    .replace("%player%", row[1])
                    .replace("%value%", row[2]));
        }
        return true;
    }

    @Override
    public List<String> onTabComplete(CommandSender sender, Command command, String alias, String[] args) {
        List<String> result = new ArrayList<>();
        if (args.length == 1) {
            if ("info".startsWith(args[0].toLowerCase())) result.add("info");
            if (sender.hasPermission("bigmc.season.admin") && "end".startsWith(args[0].toLowerCase())) result.add("end");
        }
        return result;
    }
}
