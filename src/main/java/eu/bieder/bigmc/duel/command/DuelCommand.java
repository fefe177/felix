package eu.bieder.bigmc.duel.command;

import eu.bieder.bigmc.BigMC;
import eu.bieder.bigmc.config.MessageManager;
import eu.bieder.bigmc.duel.DuelManager;
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
 * /duel <spieler>      -> jemanden herausfordern
 * /duel accept         -> Herausforderung annehmen
 * /duel deny           -> Herausforderung ablehnen
 * /duel setspawn <1|2> -> Arena-Spawn setzen (Admin)
 */
public class DuelCommand implements CommandExecutor, TabCompleter {

    private final BigMC plugin;

    public DuelCommand(BigMC plugin) {
        this.plugin = plugin;
    }

    @Override
    public boolean onCommand(CommandSender sender, Command command, String label, String[] args) {
        MessageManager msg = plugin.getMessageManager();

        if (!(sender instanceof Player player)) {
            msg.send(sender, "general.player-only");
            return true;
        }

        if (args.length == 0) {
            msg.send(player, "duel.usage");
            return true;
        }

        switch (args[0].toLowerCase()) {
            case "accept" -> accept(player);
            case "deny" -> deny(player);
            case "setspawn" -> setSpawn(player, args);
            default -> challenge(player, args[0]);
        }
        return true;
    }

    // ----- Herausfordern -----

    private void challenge(Player player, String targetName) {
        MessageManager msg = plugin.getMessageManager();
        DuelManager dm = plugin.getDuelManager();

        Player target = Bukkit.getPlayerExact(targetName);
        if (target == null) {
            msg.send(player, "general.player-not-found");
            return;
        }
        if (target.getUniqueId().equals(player.getUniqueId())) {
            msg.send(player, "duel.cannot-self");
            return;
        }
        if (dm.isInDuel(player.getUniqueId())) {
            msg.send(player, "duel.already-in-duel");
            return;
        }
        if (dm.isInDuel(target.getUniqueId())) {
            msg.send(player, "duel.target-in-duel", "%player%", target.getName());
            return;
        }
        // Arena muss konfiguriert sein
        if (dm.getArenaSpawn(1) == null || dm.getArenaSpawn(2) == null) {
            msg.send(player, "duel.arena-not-set");
            return;
        }

        dm.addChallenge(player, target);
        msg.send(player, "duel.challenge-sent", "%player%", target.getName());
        msg.send(target, "duel.challenge-received", "%player%", player.getName());
    }

    // ----- Annehmen -----

    private void accept(Player player) {
        MessageManager msg = plugin.getMessageManager();
        DuelManager dm = plugin.getDuelManager();

        if (!dm.hasChallenge(player.getUniqueId())) {
            msg.send(player, "duel.no-challenge");
            return;
        }
        UUID challengerId = dm.getChallenger(player.getUniqueId());
        Player challenger = Bukkit.getPlayer(challengerId);
        if (challenger == null) {
            dm.removeChallenge(player.getUniqueId());
            msg.send(player, "duel.challenger-offline");
            return;
        }
        // Sicherheits-Checks (Status koennte sich geaendert haben)
        if (dm.isInDuel(player.getUniqueId()) || dm.isInDuel(challengerId)) {
            msg.send(player, "duel.already-in-duel");
            return;
        }

        dm.removeChallenge(player.getUniqueId());
        msg.send(challenger, "duel.challenge-accepted", "%player%", player.getName());
        plugin.getDuelManager().startDuel(challenger, player);
    }

    // ----- Ablehnen -----

    private void deny(Player player) {
        MessageManager msg = plugin.getMessageManager();
        DuelManager dm = plugin.getDuelManager();

        if (!dm.hasChallenge(player.getUniqueId())) {
            msg.send(player, "duel.no-challenge");
            return;
        }
        UUID challengerId = dm.getChallenger(player.getUniqueId());
        dm.removeChallenge(player.getUniqueId());

        Player challenger = Bukkit.getPlayer(challengerId);
        if (challenger != null) {
            msg.send(challenger, "duel.challenge-denied", "%player%", player.getName());
        }
        msg.send(player, "duel.denied");
    }

    // ----- Arena-Spawn setzen -----

    private void setSpawn(Player player, String[] args) {
        MessageManager msg = plugin.getMessageManager();

        if (!player.hasPermission("bigmc.duel.admin")) {
            msg.send(player, "general.no-permission");
            return;
        }
        if (args.length != 2 || (!args[1].equals("1") && !args[1].equals("2"))) {
            msg.send(player, "duel.setspawn-usage");
            return;
        }
        int number = Integer.parseInt(args[1]);
        plugin.getDuelManager().setArenaSpawn(number, player.getLocation());
        msg.send(player, "duel.spawn-set", "%number%", String.valueOf(number));
    }

    @Override
    public List<String> onTabComplete(CommandSender sender, Command command, String alias, String[] args) {
        List<String> result = new ArrayList<>();
        if (args.length == 1) {
            result.add("accept");
            result.add("deny");
            if (sender.hasPermission("bigmc.duel.admin")) result.add("setspawn");
            Bukkit.getOnlinePlayers().forEach(p -> {
                if (!p.getName().equals(sender.getName())) result.add(p.getName());
            });
            result.removeIf(s -> !s.toLowerCase().startsWith(args[0].toLowerCase()));
        } else if (args.length == 2 && args[0].equalsIgnoreCase("setspawn")) {
            result.add("1");
            result.add("2");
        }
        return result;
    }
}
