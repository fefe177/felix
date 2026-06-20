package eu.bieder.bigmc.clan.command;

import eu.bieder.bigmc.BigMC;
import eu.bieder.bigmc.clan.Clan;
import eu.bieder.bigmc.clan.ClanManager;
import eu.bieder.bigmc.clan.ClanRank;
import eu.bieder.bigmc.config.MessageManager;
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
import java.util.UUID;

/**
 * /clan create|disband|leave|invite|accept|deny|kick|promote|demote|transfer|info|top|chat
 */
public class ClanCommand implements CommandExecutor, TabCompleter {

    private final BigMC plugin;

    public ClanCommand(BigMC plugin) {
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
            msg.send(player, "clan.usage");
            return true;
        }
        switch (args[0].toLowerCase()) {
            case "create" -> create(player, args);
            case "disband" -> disband(player);
            case "leave" -> leave(player);
            case "invite" -> invite(player, args);
            case "accept" -> accept(player);
            case "deny" -> deny(player);
            case "kick" -> kick(player, args);
            case "promote" -> setRank(player, args, true);
            case "demote" -> setRank(player, args, false);
            case "transfer" -> transfer(player, args);
            case "info" -> info(player, args);
            case "top" -> top(player);
            case "chat" -> chat(player);
            default -> msg.send(player, "clan.usage");
        }
        return true;
    }

    private void create(Player player, String[] args) {
        MessageManager msg = plugin.getMessageManager();
        ClanManager cm = plugin.getClanManager();
        if (args.length != 2) { msg.send(player, "clan.create-usage"); return; }
        if (cm.isInClan(player.getUniqueId())) { msg.send(player, "clan.already-in-clan"); return; }

        String name = args[1];
        if (name.length() < cm.minNameLength() || name.length() > cm.maxNameLength()
                || !name.matches("[A-Za-z0-9]+")) {
            msg.send(player, "clan.invalid-name",
                    "%min%", String.valueOf(cm.minNameLength()), "%max%", String.valueOf(cm.maxNameLength()));
            return;
        }
        if (cm.getClanByName(name).isPresent()) { msg.send(player, "clan.name-taken"); return; }

        cm.create(player, name);
        msg.send(player, "clan.created", "%clan%", name);
    }

    private void disband(Player player) {
        MessageManager msg = plugin.getMessageManager();
        Clan clan = requireOwner(player);
        if (clan == null) return;
        // alle Mitglieder benachrichtigen
        broadcast(clan, msg.get("clan.disbanded", "%clan%", clan.getName()));
        plugin.getClanManager().disband(clan);
    }

    private void leave(Player player) {
        MessageManager msg = plugin.getMessageManager();
        ClanManager cm = plugin.getClanManager();
        Clan clan = cm.getClanOf(player.getUniqueId());
        if (clan == null) { msg.send(player, "clan.not-in-clan"); return; }

        if (clan.getOwner().equals(player.getUniqueId())) {
            if (clan.memberCount() > 1) { msg.send(player, "clan.owner-must-transfer"); return; }
            cm.disband(clan);
            msg.send(player, "clan.left-own");
            return;
        }
        cm.removeMember(player.getUniqueId());
        msg.send(player, "clan.left", "%clan%", clan.getName());
        broadcast(clan, msg.get("clan.member-left", "%player%", player.getName()));
    }

    private void invite(Player player, String[] args) {
        MessageManager msg = plugin.getMessageManager();
        ClanManager cm = plugin.getClanManager();
        if (args.length != 2) { msg.send(player, "clan.invite-usage"); return; }
        Clan clan = requireRank(player, ClanRank.ADMIN);
        if (clan == null) return;
        if (clan.memberCount() >= cm.maxMembers()) { msg.send(player, "clan.full"); return; }

        Player target = Bukkit.getPlayerExact(args[1]);
        if (target == null) { msg.send(player, "general.player-not-found"); return; }
        if (cm.isInClan(target.getUniqueId())) { msg.send(player, "clan.target-in-clan"); return; }

        cm.invite(target, clan);
        msg.send(player, "clan.invited", "%player%", target.getName());
        msg.send(target, "clan.invite-received", "%clan%", clan.getName());
    }

    private void accept(Player player) {
        MessageManager msg = plugin.getMessageManager();
        ClanManager cm = plugin.getClanManager();
        if (cm.isInClan(player.getUniqueId())) { msg.send(player, "clan.already-in-clan"); return; }
        Optional<Clan> inv = cm.getInvite(player.getUniqueId());
        if (inv.isEmpty()) { msg.send(player, "clan.no-invite"); return; }
        Clan clan = inv.get();
        if (clan.memberCount() >= cm.maxMembers()) { msg.send(player, "clan.full"); return; }

        cm.clearInvite(player.getUniqueId());
        cm.addMember(clan, player.getUniqueId(), player.getName(), ClanRank.MEMBER);
        msg.send(player, "clan.joined", "%clan%", clan.getName());
        broadcast(clan, msg.get("clan.member-joined", "%player%", player.getName()));
    }

    private void deny(Player player) {
        MessageManager msg = plugin.getMessageManager();
        plugin.getClanManager().clearInvite(player.getUniqueId());
        msg.send(player, "clan.invite-denied");
    }

    private void kick(Player player, String[] args) {
        MessageManager msg = plugin.getMessageManager();
        ClanManager cm = plugin.getClanManager();
        if (args.length != 2) { msg.send(player, "clan.kick-usage"); return; }
        Clan clan = requireRank(player, ClanRank.ADMIN);
        if (clan == null) return;

        UUID targetId = resolveMember(clan, args[1]);
        if (targetId == null) { msg.send(player, "clan.not-member"); return; }
        if (targetId.equals(player.getUniqueId())) { msg.send(player, "clan.cannot-kick-self"); return; }
        ClanRank actorRank = clan.rankOf(player.getUniqueId());
        ClanRank targetRank = clan.rankOf(targetId);
        if (targetRank.weight() >= actorRank.weight()) { msg.send(player, "clan.cannot-kick-higher"); return; }

        cm.removeMember(targetId);
        msg.send(player, "clan.kicked", "%player%", args[1]);
        broadcast(clan, msg.get("clan.member-kicked", "%player%", args[1]));
        Player online = Bukkit.getPlayer(targetId);
        if (online != null) msg.send(online, "clan.you-were-kicked", "%clan%", clan.getName());
    }

    private void setRank(Player player, String[] args, boolean promote) {
        MessageManager msg = plugin.getMessageManager();
        ClanManager cm = plugin.getClanManager();
        if (args.length != 2) { msg.send(player, "clan.rank-usage"); return; }
        Clan clan = requireOwner(player);
        if (clan == null) return;

        UUID targetId = resolveMember(clan, args[1]);
        if (targetId == null) { msg.send(player, "clan.not-member"); return; }
        if (targetId.equals(player.getUniqueId())) { msg.send(player, "clan.cannot-rank-self"); return; }

        ClanRank current = clan.rankOf(targetId);
        ClanRank newRank;
        if (promote) {
            if (current == ClanRank.MEMBER) newRank = ClanRank.ADMIN;
            else { msg.send(player, "clan.already-max-rank"); return; }
        } else {
            if (current == ClanRank.ADMIN) newRank = ClanRank.MEMBER;
            else { msg.send(player, "clan.already-min-rank"); return; }
        }
        cm.setRank(clan, targetId, newRank);
        msg.send(player, "clan.rank-changed", "%player%", args[1], "%rank%", newRank.name());
    }

    private void transfer(Player player, String[] args) {
        MessageManager msg = plugin.getMessageManager();
        ClanManager cm = plugin.getClanManager();
        if (args.length != 2) { msg.send(player, "clan.transfer-usage"); return; }
        Clan clan = requireOwner(player);
        if (clan == null) return;
        UUID targetId = resolveMember(clan, args[1]);
        if (targetId == null || targetId.equals(player.getUniqueId())) { msg.send(player, "clan.not-member"); return; }

        cm.setRank(clan, player.getUniqueId(), ClanRank.ADMIN);
        cm.setRank(clan, targetId, ClanRank.OWNER);
        clan.setOwner(targetId);
        // Besitzer in der DB aktualisieren
        plugin.getDatabaseExecutor().execute(conn -> {
            try (var ps = conn.prepareStatement("UPDATE clans SET owner = ? WHERE id = ?;")) {
                ps.setString(1, targetId.toString());
                ps.setInt(2, clan.getId());
                ps.executeUpdate();
            }
        });
        msg.send(player, "clan.transferred", "%player%", args[1]);
        broadcast(clan, msg.get("clan.new-owner", "%player%", args[1]));
    }

    private void info(Player player, String[] args) {
        MessageManager msg = plugin.getMessageManager();
        ClanManager cm = plugin.getClanManager();
        Clan clan;
        if (args.length == 2) {
            clan = cm.getClanByName(args[1]).orElse(null);
        } else {
            clan = cm.getClanOf(player.getUniqueId());
        }
        if (clan == null) { msg.send(player, "clan.not-found"); return; }

        String ownerName = clan.getMembers().getOrDefault(clan.getOwner(),
                new Clan.Member(ClanRank.OWNER, "?")).name;
        player.sendMessage(msg.getRaw("clan.info-header").replace("%clan%", clan.getName()));
        player.sendMessage(msg.getRaw("clan.info-owner").replace("%owner%", ownerName));
        player.sendMessage(msg.getRaw("clan.info-points").replace("%points%", String.valueOf(clan.getPoints())));
        player.sendMessage(msg.getRaw("clan.info-members")
                .replace("%count%", String.valueOf(clan.memberCount()))
                .replace("%max%", String.valueOf(cm.maxMembers())));
        for (var entry : clan.getMembers().entrySet()) {
            boolean online = Bukkit.getPlayer(entry.getKey()) != null;
            player.sendMessage(msg.getRaw("clan.info-member-line")
                    .replace("%player%", entry.getValue().name)
                    .replace("%rank%", entry.getValue().rank.name())
                    .replace("%status%", online ? msg.getRaw("clan.online") : msg.getRaw("clan.offline")));
        }
    }

    private void top(Player player) {
        MessageManager msg = plugin.getMessageManager();
        List<Clan> top = plugin.getClanManager().getTop(10);
        if (top.isEmpty()) { msg.send(player, "clan.top-empty"); return; }
        player.sendMessage(msg.getRaw("clan.top-header"));
        int place = 1;
        for (Clan clan : top) {
            player.sendMessage(msg.getRaw("clan.top-entry")
                    .replace("%place%", String.valueOf(place++))
                    .replace("%clan%", clan.getName())
                    .replace("%points%", String.valueOf(clan.getPoints()))
                    .replace("%members%", String.valueOf(clan.memberCount())));
        }
    }

    private void chat(Player player) {
        MessageManager msg = plugin.getMessageManager();
        if (!plugin.getClanManager().isInClan(player.getUniqueId())) { msg.send(player, "clan.not-in-clan"); return; }
        boolean on = plugin.getClanManager().toggleChat(player.getUniqueId());
        msg.send(player, on ? "clan.chat-on" : "clan.chat-off");
    }

    // ----- Helfer -----

    private Clan requireOwner(Player player) {
        Clan clan = plugin.getClanManager().getClanOf(player.getUniqueId());
        if (clan == null) { plugin.getMessageManager().send(player, "clan.not-in-clan"); return null; }
        if (!clan.getOwner().equals(player.getUniqueId())) {
            plugin.getMessageManager().send(player, "clan.not-owner");
            return null;
        }
        return clan;
    }

    private Clan requireRank(Player player, ClanRank min) {
        Clan clan = plugin.getClanManager().getClanOf(player.getUniqueId());
        if (clan == null) { plugin.getMessageManager().send(player, "clan.not-in-clan"); return null; }
        ClanRank rank = clan.rankOf(player.getUniqueId());
        if (rank == null || rank.weight() < min.weight()) {
            plugin.getMessageManager().send(player, "clan.no-permission");
            return null;
        }
        return clan;
    }

    /** Findet ein Mitglied im Clan anhand des Namens. */
    private UUID resolveMember(Clan clan, String name) {
        for (var entry : clan.getMembers().entrySet()) {
            if (entry.getValue().name.equalsIgnoreCase(name)) return entry.getKey();
        }
        // Fallback ueber OfflinePlayer-UUID
        @SuppressWarnings("deprecation")
        OfflinePlayer off = Bukkit.getOfflinePlayer(name);
        return clan.getMembers().containsKey(off.getUniqueId()) ? off.getUniqueId() : null;
    }

    private void broadcast(Clan clan, String message) {
        for (UUID uuid : clan.getMembers().keySet()) {
            Player p = Bukkit.getPlayer(uuid);
            if (p != null) p.sendMessage(message);
        }
    }

    @Override
    public List<String> onTabComplete(CommandSender sender, Command command, String alias, String[] args) {
        List<String> result = new ArrayList<>();
        if (args.length == 1) {
            for (String s : List.of("create", "disband", "leave", "invite", "accept", "deny",
                    "kick", "promote", "demote", "transfer", "info", "top", "chat")) {
                if (s.startsWith(args[0].toLowerCase())) result.add(s);
            }
        } else if (args.length == 2 && List.of("invite").contains(args[0].toLowerCase())) {
            Bukkit.getOnlinePlayers().forEach(p -> result.add(p.getName()));
        }
        return result;
    }
}
