package eu.bieder.bigmc.tpa.command;

import eu.bieder.bigmc.BigMC;
import eu.bieder.bigmc.config.MessageManager;
import org.bukkit.Bukkit;
import org.bukkit.command.Command;
import org.bukkit.command.CommandExecutor;
import org.bukkit.command.CommandSender;
import org.bukkit.command.TabCompleter;
import org.bukkit.entity.Player;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/**
 * Behandelt alle drei TPA-Befehle:
 * /tpa <spieler> -> Anfrage senden
 * /tpaccept      -> Anfrage annehmen (der Anfragende wird zu dir teleportiert)
 * /tpadeny       -> Anfrage ablehnen
 */
public class TpaCommand implements CommandExecutor, TabCompleter {

    private final BigMC plugin;

    public TpaCommand(BigMC plugin) {
        this.plugin = plugin;
    }

    @Override
    public boolean onCommand(CommandSender sender, Command command, String label, String[] args) {
        MessageManager msg = plugin.getMessageManager();

        if (!(sender instanceof Player player)) {
            msg.send(sender, "general.player-only");
            return true;
        }

        switch (command.getName().toLowerCase()) {
            case "tpa" -> request(player, args);
            case "tpaccept" -> accept(player);
            case "tpadeny" -> deny(player);
        }
        return true;
    }

    private void request(Player player, String[] args) {
        MessageManager msg = plugin.getMessageManager();

        if (args.length != 1) {
            msg.send(player, "tpa.usage");
            return;
        }
        Player target = Bukkit.getPlayerExact(args[0]);
        if (target == null) {
            msg.send(player, "general.player-not-found");
            return;
        }
        if (target.getUniqueId().equals(player.getUniqueId())) {
            msg.send(player, "tpa.cannot-self");
            return;
        }

        plugin.getTpaManager().addRequest(player, target);
        msg.send(player, "tpa.sent", "%player%", target.getName());
        msg.send(target, "tpa.received", "%player%", player.getName());
    }

    private void accept(Player player) {
        MessageManager msg = plugin.getMessageManager();

        if (!plugin.getTpaManager().hasRequest(player.getUniqueId())) {
            msg.send(player, "tpa.none");
            return;
        }
        UUID requesterId = plugin.getTpaManager().getRequester(player.getUniqueId());
        plugin.getTpaManager().removeRequest(player.getUniqueId());

        Player requester = Bukkit.getPlayer(requesterId);
        if (requester == null) {
            msg.send(player, "tpa.requester-offline");
            return;
        }

        requester.teleport(player.getLocation());
        msg.send(player, "tpa.accepted", "%player%", requester.getName());
        msg.send(requester, "tpa.accepted-notify", "%player%", player.getName());
    }

    private void deny(Player player) {
        MessageManager msg = plugin.getMessageManager();

        if (!plugin.getTpaManager().hasRequest(player.getUniqueId())) {
            msg.send(player, "tpa.none");
            return;
        }
        UUID requesterId = plugin.getTpaManager().getRequester(player.getUniqueId());
        plugin.getTpaManager().removeRequest(player.getUniqueId());

        msg.send(player, "tpa.denied");
        Player requester = Bukkit.getPlayer(requesterId);
        if (requester != null) {
            msg.send(requester, "tpa.denied-notify", "%player%", player.getName());
        }
    }

    @Override
    public List<String> onTabComplete(CommandSender sender, Command command, String alias, String[] args) {
        List<String> result = new ArrayList<>();
        if (command.getName().equalsIgnoreCase("tpa") && args.length == 1) {
            Bukkit.getOnlinePlayers().forEach(p -> {
                if (!p.getName().equals(sender.getName())) result.add(p.getName());
            });
            result.removeIf(s -> !s.toLowerCase().startsWith(args[0].toLowerCase()));
        }
        return result;
    }
}
