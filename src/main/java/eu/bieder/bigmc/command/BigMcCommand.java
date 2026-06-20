package eu.bieder.bigmc.command;

import eu.bieder.bigmc.BigMC;
import eu.bieder.bigmc.config.MessageManager;
import org.bukkit.Bukkit;
import org.bukkit.command.Command;
import org.bukkit.command.CommandExecutor;
import org.bukkit.command.CommandSender;
import org.bukkit.command.TabCompleter;

import java.util.List;

/**
 * /bigmc          -> zeigt Version und Hilfe
 * /bigmc reload   -> laedt config.yml, messages.yml und die zwischengespeicherten
 *                    Feature-Daten (Shop, Raenge, Spawner) live neu (Admin)
 */
public class BigMcCommand implements CommandExecutor, TabCompleter {

    private final BigMC plugin;

    public BigMcCommand(BigMC plugin) {
        this.plugin = plugin;
    }

    @Override
    public boolean onCommand(CommandSender sender, Command command, String label, String[] args) {
        MessageManager msg = plugin.getMessageManager();

        if (args.length == 1 && args[0].equalsIgnoreCase("reload")) {
            if (!sender.hasPermission("bigmc.admin")) {
                msg.send(sender, "general.no-permission");
                return true;
            }

            // 1. config.yml + messages.yml neu laden
            plugin.getConfigManager().reload();
            plugin.getMessageManager().reload();

            // 2. Feature-Manager, die Werte aus der config zwischenspeichern
            plugin.getShopManager().loadFromConfig();
            plugin.getRankManager().loadRanks();
            plugin.getSpawnerManager().loadTypes();
            plugin.getQuestManager().loadQuests();

            // 3. Rang-Permissions der Online-Spieler neu setzen (falls geaendert)
            Bukkit.getOnlinePlayers().forEach(p -> plugin.getRankManager().applyPermissions(p));

            msg.send(sender, "general.reloaded");
            return true;
        }

        // /bigmc -> Info
        sender.sendMessage(msg.getPrefix() + MessageManager.color(
                "&bBigMC &7v" + plugin.getDescription().getVersion()));
        if (sender.hasPermission("bigmc.admin")) {
            sender.sendMessage(MessageManager.color("&7Befehl: &e/bigmc reload"));
        }
        return true;
    }

    @Override
    public List<String> onTabComplete(CommandSender sender, Command command, String alias, String[] args) {
        if (args.length == 1 && sender.hasPermission("bigmc.admin")
                && "reload".startsWith(args[0].toLowerCase())) {
            return List.of("reload");
        }
        return List.of();
    }
}
