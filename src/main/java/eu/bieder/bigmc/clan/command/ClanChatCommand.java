package eu.bieder.bigmc.clan.command;

import eu.bieder.bigmc.BigMC;
import org.bukkit.command.Command;
import org.bukkit.command.CommandExecutor;
import org.bukkit.command.CommandSender;
import org.bukkit.entity.Player;

/**
 * /c &lt;nachricht&gt; -> einmalige Nachricht in den Clan-Chat.
 */
public class ClanChatCommand implements CommandExecutor {

    private final BigMC plugin;

    public ClanChatCommand(BigMC plugin) {
        this.plugin = plugin;
    }

    @Override
    public boolean onCommand(CommandSender sender, Command command, String label, String[] args) {
        if (!(sender instanceof Player player)) {
            plugin.getMessageManager().send(sender, "general.player-only");
            return true;
        }
        if (args.length == 0) {
            plugin.getMessageManager().send(player, "clan.chat-usage");
            return true;
        }
        plugin.getClanManager().sendClanMessage(player, String.join(" ", args));
        return true;
    }
}
