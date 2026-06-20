package eu.bieder.bigmc.boss.command;

import eu.bieder.bigmc.BigMC;
import eu.bieder.bigmc.boss.BossDefinition;
import eu.bieder.bigmc.config.MessageManager;
import org.bukkit.command.Command;
import org.bukkit.command.CommandExecutor;
import org.bukkit.command.CommandSender;
import org.bukkit.command.TabCompleter;

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

/**
 * /bossevent start [boss] -> Boss spawnen (Admin)
 * /bossevent stop         -> aktives Event abbrechen (Admin)
 * /bossevent list         -> verfuegbare Bosse
 */
public class BossCommand implements CommandExecutor, TabCompleter {

    private final BigMC plugin;

    public BossCommand(BigMC plugin) {
        this.plugin = plugin;
    }

    @Override
    public boolean onCommand(CommandSender sender, Command command, String label, String[] args) {
        MessageManager msg = plugin.getMessageManager();

        if (args.length == 0) {
            msg.send(sender, "boss.usage");
            return true;
        }
        switch (args[0].toLowerCase()) {
            case "start" -> {
                if (!sender.hasPermission("bigmc.boss.admin")) { msg.send(sender, "general.no-permission"); return true; }
                if (plugin.getBossManager().isActive()) { msg.send(sender, "boss.already-active"); return true; }
                if (args.length >= 2) {
                    Optional<BossDefinition> def = plugin.getBossManager().getBoss(args[1]);
                    if (def.isEmpty()) { msg.send(sender, "boss.unknown", "%boss%", args[1]); return true; }
                    if (!plugin.getBossManager().spawn(def.get())) msg.send(sender, "boss.spawn-failed");
                } else {
                    plugin.getBossManager().spawnRandom();
                }
            }
            case "stop" -> {
                if (!sender.hasPermission("bigmc.boss.admin")) { msg.send(sender, "general.no-permission"); return true; }
                if (!plugin.getBossManager().isActive()) { msg.send(sender, "boss.none-active"); return true; }
                plugin.getBossManager().stop();
                msg.send(sender, "boss.stopped");
            }
            case "list" -> {
                sender.sendMessage(msg.getRaw("boss.list-header"));
                for (BossDefinition def : plugin.getBossManager().getBosses()) {
                    sender.sendMessage(msg.getRaw("boss.list-entry")
                            .replace("%id%", def.id())
                            .replace("%boss%", MessageManager.color(def.display())));
                }
            }
            default -> msg.send(sender, "boss.usage");
        }
        return true;
    }

    @Override
    public List<String> onTabComplete(CommandSender sender, Command command, String alias, String[] args) {
        List<String> result = new ArrayList<>();
        if (args.length == 1) {
            for (String s : List.of("start", "stop", "list")) if (s.startsWith(args[0].toLowerCase())) result.add(s);
        } else if (args.length == 2 && args[0].equalsIgnoreCase("start")) {
            plugin.getBossManager().getBosses().forEach(b -> result.add(b.id()));
        }
        return result;
    }
}
