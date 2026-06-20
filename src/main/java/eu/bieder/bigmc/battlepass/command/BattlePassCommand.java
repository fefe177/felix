package eu.bieder.bigmc.battlepass.command;

import eu.bieder.bigmc.BigMC;
import org.bukkit.command.Command;
import org.bukkit.command.CommandExecutor;
import org.bukkit.command.CommandSender;
import org.bukkit.command.TabCompleter;
import org.bukkit.entity.Player;

import java.util.List;

/**
 * /battlepass        -> Battle-Pass-GUI oeffnen
 * /battlepass buy    -> Premium-Pfad kaufen
 */
public class BattlePassCommand implements CommandExecutor, TabCompleter {

    private final BigMC plugin;

    public BattlePassCommand(BigMC plugin) {
        this.plugin = plugin;
    }

    @Override
    public boolean onCommand(CommandSender sender, Command command, String label, String[] args) {
        if (!(sender instanceof Player player)) {
            plugin.getMessageManager().send(sender, "general.player-only");
            return true;
        }
        if (args.length == 1 && args[0].equalsIgnoreCase("buy")) {
            if (plugin.getBattlePassManager().buyPremium(player)) {
                plugin.getMessageManager().send(player, "battlepass.premium-bought");
            }
            return true;
        }
        plugin.getBattlePassGUI().open(player, 1);
        return true;
    }

    @Override
    public List<String> onTabComplete(CommandSender sender, Command command, String alias, String[] args) {
        if (args.length == 1 && "buy".startsWith(args[0].toLowerCase())) {
            return List.of("buy");
        }
        return List.of();
    }
}
