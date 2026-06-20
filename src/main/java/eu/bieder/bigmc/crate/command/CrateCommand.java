package eu.bieder.bigmc.crate.command;

import eu.bieder.bigmc.BigMC;
import eu.bieder.bigmc.config.MessageManager;
import eu.bieder.bigmc.crate.Crate;
import org.bukkit.Bukkit;
import org.bukkit.OfflinePlayer;
import org.bukkit.command.Command;
import org.bukkit.command.CommandExecutor;
import org.bukkit.command.CommandSender;
import org.bukkit.command.TabCompleter;
import org.bukkit.entity.Player;

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

/**
 * /crate                              -> Crate-Menue
 * /crate preview <crate>              -> Belohnungs-Vorschau
 * /crate open <crate>                 -> Crate oeffnen
 * /crate givekey <spieler> <crate> <n> -> Schluessel geben (Admin)
 */
public class CrateCommand implements CommandExecutor, TabCompleter {

    private final BigMC plugin;

    public CrateCommand(BigMC plugin) {
        this.plugin = plugin;
    }

    @Override
    public boolean onCommand(CommandSender sender, Command command, String label, String[] args) {
        MessageManager msg = plugin.getMessageManager();

        // /crate givekey <spieler> <crate> <anzahl>  (Admin, auch von Konsole)
        if (args.length >= 1 && args[0].equalsIgnoreCase("givekey")) {
            if (!sender.hasPermission("bigmc.crate.admin")) {
                msg.send(sender, "general.no-permission");
                return true;
            }
            if (args.length != 4) {
                msg.send(sender, "crate.givekey-usage");
                return true;
            }
            Optional<Crate> crate = plugin.getCrateManager().getCrate(args[2]);
            if (crate.isEmpty()) {
                msg.send(sender, "crate.unknown", "%crate%", args[2]);
                return true;
            }
            int amount;
            try {
                amount = Integer.parseInt(args[3]);
            } catch (NumberFormatException e) {
                msg.send(sender, "general.invalid-number");
                return true;
            }
            if (amount <= 0) {
                msg.send(sender, "general.invalid-number");
                return true;
            }
            @SuppressWarnings("deprecation")
            OfflinePlayer target = Bukkit.getOfflinePlayer(args[1]);
            plugin.getCrateManager().giveKeys(target.getUniqueId(), crate.get().id(), amount);
            msg.send(sender, "crate.key-given",
                    "%amount%", String.valueOf(amount), "%crate%", crate.get().id(), "%player%", args[1]);
            Player online = Bukkit.getPlayerExact(args[1]);
            if (online != null) {
                msg.send(online, "crate.key-received",
                        "%amount%", String.valueOf(amount), "%crate%", MessageManager.color(crate.get().display()));
            }
            return true;
        }

        if (!(sender instanceof Player player)) {
            msg.send(sender, "general.player-only");
            return true;
        }

        if (args.length == 0) {
            plugin.getCrateGUI().openMain(player);
            return true;
        }
        if (args.length == 2 && (args[0].equalsIgnoreCase("open") || args[0].equalsIgnoreCase("preview"))) {
            Optional<Crate> crate = plugin.getCrateManager().getCrate(args[1]);
            if (crate.isEmpty()) {
                msg.send(player, "crate.unknown", "%crate%", args[1]);
                return true;
            }
            if (args[0].equalsIgnoreCase("preview")) plugin.getCrateGUI().openPreview(player, crate.get());
            else plugin.getCrateGUI().open(player, crate.get());
            return true;
        }

        plugin.getCrateGUI().openMain(player);
        return true;
    }

    @Override
    public List<String> onTabComplete(CommandSender sender, Command command, String alias, String[] args) {
        List<String> result = new ArrayList<>();
        if (args.length == 1) {
            for (String s : List.of("open", "preview")) if (s.startsWith(args[0].toLowerCase())) result.add(s);
            if (sender.hasPermission("bigmc.crate.admin") && "givekey".startsWith(args[0].toLowerCase())) result.add("givekey");
        } else if (args.length == 2 && (args[0].equalsIgnoreCase("open") || args[0].equalsIgnoreCase("preview"))) {
            plugin.getCrateManager().getCrates().forEach(c -> result.add(c.id()));
        } else if (args.length == 3 && args[0].equalsIgnoreCase("givekey")) {
            plugin.getCrateManager().getCrates().forEach(c -> result.add(c.id()));
        }
        return result;
    }
}
