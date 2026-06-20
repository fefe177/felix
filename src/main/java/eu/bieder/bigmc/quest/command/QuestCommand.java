package eu.bieder.bigmc.quest.command;

import eu.bieder.bigmc.BigMC;
import org.bukkit.command.Command;
import org.bukkit.command.CommandExecutor;
import org.bukkit.command.CommandSender;
import org.bukkit.entity.Player;

/**
 * /quests -> oeffnet das Quest-GUI.
 */
public class QuestCommand implements CommandExecutor {

    private final BigMC plugin;

    public QuestCommand(BigMC plugin) {
        this.plugin = plugin;
    }

    @Override
    public boolean onCommand(CommandSender sender, Command command, String label, String[] args) {
        if (!(sender instanceof Player player)) {
            plugin.getMessageManager().send(sender, "general.player-only");
            return true;
        }
        plugin.getQuestGUI().open(player);
        return true;
    }
}
