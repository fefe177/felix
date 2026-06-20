package eu.bieder.bigmc.leaderboard.command;

import eu.bieder.bigmc.BigMC;
import eu.bieder.bigmc.config.MessageManager;
import eu.bieder.bigmc.leaderboard.LeaderboardCategory;
import org.bukkit.command.Command;
import org.bukkit.command.CommandExecutor;
import org.bukkit.command.CommandSender;
import org.bukkit.command.TabCompleter;
import org.bukkit.entity.Player;

import java.util.ArrayList;
import java.util.List;

/**
 * /leaderboard            -> GUI mit allen Kategorien
 * /leaderboard <kategorie> -> Top-Liste im Chat
 */
public class LeaderboardCommand implements CommandExecutor, TabCompleter {

    private final BigMC plugin;

    public LeaderboardCommand(BigMC plugin) {
        this.plugin = plugin;
    }

    @Override
    public boolean onCommand(CommandSender sender, Command command, String label, String[] args) {
        MessageManager msg = plugin.getMessageManager();

        if (args.length == 0) {
            if (sender instanceof Player player) {
                plugin.getLeaderboardGUI().openMain(player);
            } else {
                msg.send(sender, "general.player-only");
            }
            return true;
        }

        LeaderboardCategory category = LeaderboardCategory.byId(args[0]);
        if (category == null) {
            StringBuilder cats = new StringBuilder();
            for (LeaderboardCategory c : LeaderboardCategory.values()) {
                if (cats.length() > 0) cats.append(", ");
                cats.append(c.id);
            }
            msg.send(sender, "leaderboard.usage", "%categories%", cats.toString());
            return true;
        }

        plugin.getLeaderboardManager().fetchTop(category, 10, entries -> {
            sender.sendMessage(msg.getRaw("leaderboard.chat-header")
                    .replace("%category%", MessageManager.color(category.display)));
            int place = 1;
            for (String[] e : entries) {
                sender.sendMessage(msg.getRaw("leaderboard.chat-entry")
                        .replace("%place%", String.valueOf(place++))
                        .replace("%player%", e[0])
                        .replace("%value%", e[1]));
            }
            if (entries.isEmpty()) sender.sendMessage(msg.getRaw("leaderboard.empty"));
        });
        return true;
    }

    @Override
    public List<String> onTabComplete(CommandSender sender, Command command, String alias, String[] args) {
        List<String> result = new ArrayList<>();
        if (args.length == 1) {
            for (LeaderboardCategory c : LeaderboardCategory.values()) {
                if (c.id.startsWith(args[0].toLowerCase())) result.add(c.id);
            }
        }
        return result;
    }
}
