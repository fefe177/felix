package eu.bieder.bigmc.admin.command;

import eu.bieder.bigmc.BigMC;
import eu.bieder.bigmc.clan.Clan;
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
 * Zentrales Admin-Werkzeug fuer alle Systeme.
 *
 * /bigmcadmin season end
 * /bigmcadmin battlepass setlevel|addxp|premium <spieler> <wert>
 * /bigmcadmin quest reset <spieler> | complete <spieler> <questId>
 * /bigmcadmin crate givekey <spieler> <crate> <anzahl>
 * /bigmcadmin clan disband <name> | setpoints <name> <punkte>
 * /bigmcadmin prestige set <spieler> <level>
 * /bigmcadmin reload
 */
public class AdminCommand implements CommandExecutor, TabCompleter {

    private final BigMC plugin;

    public AdminCommand(BigMC plugin) {
        this.plugin = plugin;
    }

    @Override
    public boolean onCommand(CommandSender sender, Command command, String label, String[] args) {
        MessageManager msg = plugin.getMessageManager();
        if (!sender.hasPermission("bigmc.admin")) {
            msg.send(sender, "general.no-permission");
            return true;
        }
        if (args.length == 0) {
            sendHelp(sender);
            return true;
        }
        switch (args[0].toLowerCase()) {
            case "season" -> season(sender, args);
            case "battlepass", "bp" -> battlepass(sender, args);
            case "quest" -> quest(sender, args);
            case "crate" -> crate(sender, args);
            case "clan" -> clan(sender, args);
            case "prestige" -> prestige(sender, args);
            case "reload" -> {
                plugin.getConfigManager().reload();
                plugin.getMessageManager().reload();
                plugin.getShopManager().loadFromConfig();
                plugin.getRankManager().loadRanks();
                plugin.getSpawnerManager().loadTypes();
                plugin.getQuestManager().loadQuests();
                plugin.getBattlePassManager().loadConfig();
                plugin.getCrateManager().loadCrates();
                plugin.getBossManager().loadBosses();
                plugin.getCosmeticsManager().loadCosmetics();
                msg.send(sender, "general.reloaded");
            }
            default -> sendHelp(sender);
        }
        return true;
    }

    // ----- Season -----
    private void season(CommandSender sender, String[] args) {
        if (args.length >= 2 && args[1].equalsIgnoreCase("end")) {
            plugin.getSeasonManager().endSeason(sender);
        } else {
            sender.sendMessage(MessageManager.color("&cVerwendung: /bigmcadmin season end"));
        }
    }

    // ----- Battle Pass -----
    private void battlepass(CommandSender sender, String[] args) {
        MessageManager msg = plugin.getMessageManager();
        if (args.length < 3) {
            sender.sendMessage(MessageManager.color("&cVerwendung: /bigmcadmin battlepass setlevel|addxp|premium <spieler> <wert>"));
            return;
        }
        Player target = Bukkit.getPlayerExact(args[2]);
        if (target == null) { msg.send(sender, "admin.player-online-required"); return; }
        switch (args[1].toLowerCase()) {
            case "setlevel" -> {
                int level = parseInt(args, 3);
                if (level < 0) { msg.send(sender, "general.invalid-number"); return; }
                plugin.getBattlePassManager().adminSetLevel(target.getUniqueId(), level);
                msg.send(sender, "admin.done");
            }
            case "addxp" -> {
                int xp = parseInt(args, 3);
                if (xp <= 0) { msg.send(sender, "general.invalid-number"); return; }
                plugin.getBattlePassManager().adminAddXp(target, xp);
                msg.send(sender, "admin.done");
            }
            case "premium" -> {
                boolean val = args.length >= 4 && args[3].equalsIgnoreCase("true");
                plugin.getBattlePassManager().setPremium(target.getUniqueId(), val);
                msg.send(sender, "admin.done");
            }
            default -> sender.sendMessage(MessageManager.color("&cUnbekannte Aktion."));
        }
    }

    // ----- Quests -----
    private void quest(CommandSender sender, String[] args) {
        MessageManager msg = plugin.getMessageManager();
        if (args.length < 3) {
            sender.sendMessage(MessageManager.color("&cVerwendung: /bigmcadmin quest reset|complete <spieler> [questId]"));
            return;
        }
        Player target = Bukkit.getPlayerExact(args[2]);
        if (target == null) { msg.send(sender, "admin.player-online-required"); return; }
        switch (args[1].toLowerCase()) {
            case "reset" -> {
                plugin.getQuestManager().adminReset(target.getUniqueId());
                msg.send(sender, "admin.done");
            }
            case "complete" -> {
                if (args.length < 4) { sender.sendMessage(MessageManager.color("&cQuest-ID fehlt.")); return; }
                if (plugin.getQuestManager().adminComplete(target.getUniqueId(), args[3])) msg.send(sender, "admin.done");
                else sender.sendMessage(MessageManager.color("&cUnbekannte Quest oder Spieler nicht geladen."));
            }
            default -> sender.sendMessage(MessageManager.color("&cUnbekannte Aktion."));
        }
    }

    // ----- Crates -----
    private void crate(CommandSender sender, String[] args) {
        MessageManager msg = plugin.getMessageManager();
        if (args.length != 5 || !args[1].equalsIgnoreCase("givekey")) {
            sender.sendMessage(MessageManager.color("&cVerwendung: /bigmcadmin crate givekey <spieler> <crate> <anzahl>"));
            return;
        }
        Optional<Crate> crate = plugin.getCrateManager().getCrate(args[3]);
        if (crate.isEmpty()) { msg.send(sender, "crate.unknown", "%crate%", args[3]); return; }
        int amount = parseInt(args, 4);
        if (amount <= 0) { msg.send(sender, "general.invalid-number"); return; }
        @SuppressWarnings("deprecation")
        OfflinePlayer target = Bukkit.getOfflinePlayer(args[2]);
        plugin.getCrateManager().giveKeys(target.getUniqueId(), crate.get().id(), amount);
        msg.send(sender, "admin.done");
    }

    // ----- Clans -----
    private void clan(CommandSender sender, String[] args) {
        MessageManager msg = plugin.getMessageManager();
        if (args.length < 3) {
            sender.sendMessage(MessageManager.color("&cVerwendung: /bigmcadmin clan disband|setpoints <name> [punkte]"));
            return;
        }
        Optional<Clan> clan = plugin.getClanManager().getClanByName(args[2]);
        if (clan.isEmpty()) { msg.send(sender, "clan.not-found"); return; }
        switch (args[1].toLowerCase()) {
            case "disband" -> {
                plugin.getClanManager().disband(clan.get());
                msg.send(sender, "admin.done");
            }
            case "setpoints" -> {
                if (args.length < 4) { sender.sendMessage(MessageManager.color("&cPunktezahl fehlt.")); return; }
                long points = parseLong(args, 3);
                if (points < 0) { msg.send(sender, "general.invalid-number"); return; }
                plugin.getClanManager().setPoints(clan.get(), points);
                msg.send(sender, "admin.done");
            }
            default -> sender.sendMessage(MessageManager.color("&cUnbekannte Aktion."));
        }
    }

    // ----- Prestige -----
    private void prestige(CommandSender sender, String[] args) {
        MessageManager msg = plugin.getMessageManager();
        if (args.length != 4 || !args[1].equalsIgnoreCase("set")) {
            sender.sendMessage(MessageManager.color("&cVerwendung: /bigmcadmin prestige set <spieler> <level>"));
            return;
        }
        int level = parseInt(args, 3);
        if (level < 0) { msg.send(sender, "general.invalid-number"); return; }
        @SuppressWarnings("deprecation")
        OfflinePlayer target = Bukkit.getOfflinePlayer(args[2]);
        String name = target.getName() != null ? target.getName() : args[2];
        plugin.getPrestigeManager().setLevel(target.getUniqueId(), name, level);
        msg.send(sender, "admin.done");
    }

    // ----- Helfer -----
    private void sendHelp(CommandSender sender) {
        for (String line : new String[]{
                "&8&m----&r &c&lBigMC Admin &8&m----",
                "&e/bigmcadmin season end",
                "&e/bigmcadmin battlepass setlevel|addxp|premium <spieler> <wert>",
                "&e/bigmcadmin quest reset|complete <spieler> [questId]",
                "&e/bigmcadmin crate givekey <spieler> <crate> <anzahl>",
                "&e/bigmcadmin clan disband|setpoints <name> [punkte]",
                "&e/bigmcadmin prestige set <spieler> <level>",
                "&e/bigmcadmin reload"}) {
            sender.sendMessage(MessageManager.color(line));
        }
    }

    private int parseInt(String[] args, int idx) {
        if (idx >= args.length) return -1;
        try { return Integer.parseInt(args[idx]); } catch (NumberFormatException e) { return -1; }
    }

    private long parseLong(String[] args, int idx) {
        if (idx >= args.length) return -1;
        try { return Long.parseLong(args[idx]); } catch (NumberFormatException e) { return -1; }
    }

    @Override
    public List<String> onTabComplete(CommandSender sender, Command command, String alias, String[] args) {
        List<String> result = new ArrayList<>();
        if (!sender.hasPermission("bigmc.admin")) return result;
        if (args.length == 1) {
            for (String s : List.of("season", "battlepass", "quest", "crate", "clan", "prestige", "reload")) {
                if (s.startsWith(args[0].toLowerCase())) result.add(s);
            }
        } else if (args.length == 2) {
            switch (args[0].toLowerCase()) {
                case "season" -> result.add("end");
                case "battlepass" -> result.addAll(List.of("setlevel", "addxp", "premium"));
                case "quest" -> result.addAll(List.of("reset", "complete"));
                case "crate" -> result.add("givekey");
                case "clan" -> result.addAll(List.of("disband", "setpoints"));
                case "prestige" -> result.add("set");
            }
        }
        return result;
    }
}
