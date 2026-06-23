package eu.bieder.bigmc.home.command;

import eu.bieder.bigmc.BigMC;
import eu.bieder.bigmc.config.MessageManager;
import eu.bieder.bigmc.home.HomeManager;
import org.bukkit.command.Command;
import org.bukkit.command.CommandExecutor;
import org.bukkit.command.CommandSender;
import org.bukkit.command.TabCompleter;
import org.bukkit.entity.Player;

import java.util.ArrayList;
import java.util.List;

/**
 * Behandelt /home, /sethome und /delhome (ein Executor fuer alle drei).
 *
 *   /home            -> Homes-GUI
 *   /home <name>     -> direkt teleportieren
 *   /sethome <name>  -> Home an aktueller Position setzen
 *   /delhome <name>  -> Home loeschen
 */
public class HomeCommand implements CommandExecutor, TabCompleter {

    private final BigMC plugin;

    public HomeCommand(BigMC plugin) {
        this.plugin = plugin;
    }

    @Override
    public boolean onCommand(CommandSender sender, Command command, String label, String[] args) {
        MessageManager msg = plugin.getMessageManager();
        if (!(sender instanceof Player player)) {
            msg.send(sender, "general.player-only");
            return true;
        }
        HomeManager homes = plugin.getHomeManager();
        String cmd = command.getName().toLowerCase();

        switch (cmd) {
            case "sethome" -> {
                if (args.length < 1) {
                    msg.send(player, "home.sethome-usage");
                    return true;
                }
                String name = sanitize(args[0]);
                if (name.isEmpty()) {
                    msg.send(player, "home.invalid-name");
                    return true;
                }
                switch (homes.setHome(player, name)) {
                    case CREATED -> msg.send(player, "home.set", "%name%", name);
                    case UPDATED -> msg.send(player, "home.updated", "%name%", name);
                    case LIMIT_REACHED -> msg.send(player, "home.limit-reached",
                            "%limit%", String.valueOf(plugin.getPremiumService().getHomeLimit(player)));
                }
            }
            case "delhome" -> {
                if (args.length < 1) {
                    msg.send(player, "home.delhome-usage");
                    return true;
                }
                if (homes.deleteHome(player.getUniqueId(), args[0])) {
                    msg.send(player, "home.deleted", "%name%", args[0]);
                } else {
                    msg.send(player, "home.not-found", "%name%", args[0]);
                }
            }
            default -> { // /home
                if (args.length == 0) {
                    plugin.getHomesGUI().open(player);
                    return true;
                }
                var home = homes.getHome(player.getUniqueId(), args[0]);
                if (home.isEmpty()) {
                    msg.send(player, "home.not-found", "%name%", args[0]);
                    return true;
                }
                var loc = homes.toLocation(home.get());
                if (loc.isEmpty()) {
                    msg.send(player, "home.world-missing");
                    return true;
                }
                plugin.getHomesGUI().teleport(player, loc.get(), home.get().name());
            }
        }
        return true;
    }

    /** Erlaubt nur einfache Namen (Buchstaben/Zahlen/_/-), max. 16 Zeichen. */
    private String sanitize(String input) {
        String cleaned = input.replaceAll("[^A-Za-z0-9_-]", "");
        return cleaned.length() > 16 ? cleaned.substring(0, 16) : cleaned;
    }

    @Override
    public List<String> onTabComplete(CommandSender sender, Command command, String alias, String[] args) {
        List<String> result = new ArrayList<>();
        if (!(sender instanceof Player player)) return result;
        String cmd = command.getName().toLowerCase();
        // Bei /home und /delhome die eigenen Home-Namen vorschlagen
        if (args.length == 1 && (cmd.equals("home") || cmd.equals("delhome"))) {
            for (HomeManager.Home h : plugin.getHomeManager().getHomes(player.getUniqueId())) {
                if (h.name().toLowerCase().startsWith(args[0].toLowerCase())) result.add(h.name());
            }
        }
        return result;
    }
}
