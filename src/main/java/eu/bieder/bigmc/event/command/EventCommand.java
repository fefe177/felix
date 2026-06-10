package eu.bieder.bigmc.event.command;

import eu.bieder.bigmc.BigMC;
import eu.bieder.bigmc.config.MessageManager;
import org.bukkit.command.Command;
import org.bukkit.command.CommandExecutor;
import org.bukkit.command.CommandSender;
import org.bukkit.command.TabCompleter;
import org.bukkit.entity.Player;

import java.util.ArrayList;
import java.util.List;

/**
 * /event start <name> -> Event starten (Admin)
 * /event stop         -> Event beenden und Belohnungen auszahlen (Admin)
 * /event join         -> dem laufenden Event beitreten
 * /event leave        -> das Event verlassen
 * /event info         -> Status des laufenden Events
 */
public class EventCommand implements CommandExecutor, TabCompleter {

    private final BigMC plugin;

    public EventCommand(BigMC plugin) {
        this.plugin = plugin;
    }

    @Override
    public boolean onCommand(CommandSender sender, Command command, String label, String[] args) {
        MessageManager msg = plugin.getMessageManager();

        if (args.length == 0) {
            msg.send(sender, "event.usage");
            return true;
        }

        switch (args[0].toLowerCase()) {
            case "start" -> start(sender, args);
            case "stop" -> stop(sender);
            case "join" -> join(sender);
            case "leave" -> leave(sender);
            case "info" -> info(sender);
            default -> msg.send(sender, "event.usage");
        }
        return true;
    }

    // ----- /event start -----

    private void start(CommandSender sender, String[] args) {
        MessageManager msg = plugin.getMessageManager();
        if (!sender.hasPermission("bigmc.event.admin")) {
            msg.send(sender, "general.no-permission");
            return;
        }
        if (args.length < 2) {
            msg.send(sender, "event.start-usage");
            return;
        }
        // Name kann aus mehreren Woertern bestehen
        String name = String.join(" ", java.util.Arrays.copyOfRange(args, 1, args.length));

        if (!plugin.getEventManager().start(name)) {
            msg.send(sender, "event.already-running");
        }
    }

    // ----- /event stop -----

    private void stop(CommandSender sender) {
        MessageManager msg = plugin.getMessageManager();
        if (!sender.hasPermission("bigmc.event.admin")) {
            msg.send(sender, "general.no-permission");
            return;
        }
        if (!plugin.getEventManager().isRunning()) {
            msg.send(sender, "event.none-running");
            return;
        }
        int rewarded = plugin.getEventManager().stop();
        msg.send(sender, "event.stopped", "%count%", String.valueOf(rewarded));
    }

    // ----- /event join -----

    private void join(CommandSender sender) {
        MessageManager msg = plugin.getMessageManager();
        if (!(sender instanceof Player player)) {
            msg.send(sender, "general.player-only");
            return;
        }
        if (!plugin.getEventManager().isRunning()) {
            msg.send(sender, "event.none-running");
            return;
        }
        if (plugin.getEventManager().join(player)) {
            msg.send(player, "event.joined", "%name%", plugin.getEventManager().getActiveEvent());
        } else {
            msg.send(player, "event.already-joined");
        }
    }

    // ----- /event leave -----

    private void leave(CommandSender sender) {
        MessageManager msg = plugin.getMessageManager();
        if (!(sender instanceof Player player)) {
            msg.send(sender, "general.player-only");
            return;
        }
        if (plugin.getEventManager().leave(player.getUniqueId())) {
            msg.send(player, "event.left");
        } else {
            msg.send(player, "event.not-joined");
        }
    }

    // ----- /event info -----

    private void info(CommandSender sender) {
        MessageManager msg = plugin.getMessageManager();
        if (!plugin.getEventManager().isRunning()) {
            msg.send(sender, "event.none-running");
            return;
        }
        msg.send(sender, "event.info",
                "%name%", plugin.getEventManager().getActiveEvent(),
                "%count%", String.valueOf(plugin.getEventManager().getParticipantCount()));
    }

    @Override
    public List<String> onTabComplete(CommandSender sender, Command command, String alias, String[] args) {
        List<String> result = new ArrayList<>();
        if (args.length == 1) {
            result.add("join");
            result.add("leave");
            result.add("info");
            if (sender.hasPermission("bigmc.event.admin")) {
                result.add("start");
                result.add("stop");
            }
            result.removeIf(s -> !s.toLowerCase().startsWith(args[0].toLowerCase()));
        }
        return result;
    }
}
