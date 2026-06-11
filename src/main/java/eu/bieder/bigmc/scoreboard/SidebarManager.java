package eu.bieder.bigmc.scoreboard;

import eu.bieder.bigmc.BigMC;
import eu.bieder.bigmc.rank.RankManager;
import eu.bieder.bigmc.stats.StatsManager;
import org.bukkit.Bukkit;
import org.bukkit.ChatColor;
import org.bukkit.entity.Player;
import org.bukkit.scoreboard.DisplaySlot;
import org.bukkit.scoreboard.Objective;
import org.bukkit.scoreboard.Scoreboard;
import org.bukkit.scoreboard.Team;

import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * Verwaltet das Sidebar-Scoreboard (rechts am Bildschirmrand).
 *
 * Design: Titel und Zeilen stehen in der messages.yml und unterstuetzen
 * Platzhalter (%money%, %rank%, %kills%, ...). Die Anzeige wird regelmaessig
 * aktualisiert - flicker-frei, weil jede Zeile ein eigenes Team ist und nur
 * der Team-Prefix neu gesetzt wird (die Eintraege selbst bleiben stehen).
 */
public class SidebarManager {

    private final BigMC plugin;

    /** Scoreboard pro Spieler (jeder hat sein eigenes mit eigenen Werten). */
    private final Map<UUID, Scoreboard> boards = new HashMap<>();

    /** Spieler, die die Sidebar per /board ausgeblendet haben. */
    private final Set<UUID> hidden = new HashSet<>();

    public SidebarManager(BigMC plugin) {
        this.plugin = plugin;
    }

    /** Startet den regelmaessigen Update-Task (Intervall aus der config). */
    public void start() {
        long ticks = 20L * Math.max(1,
                plugin.getConfigManager().getConfig().getInt("scoreboard.update-seconds", 2));
        Bukkit.getScheduler().runTaskTimer(plugin, () -> {
            for (Player player : Bukkit.getOnlinePlayers()) {
                if (!hidden.contains(player.getUniqueId())) {
                    update(player);
                }
            }
        }, ticks, ticks);
    }

    /** Standard-Sichtbarkeit fuer neue Spieler (config). */
    public boolean isEnabledByDefault() {
        return plugin.getConfigManager().getConfig().getBoolean("scoreboard.enabled-by-default", true);
    }

    /**
     * Blendet die Sidebar fuer einen Spieler ein (erstellt sie bei Bedarf).
     */
    public void show(Player player) {
        hidden.remove(player.getUniqueId());
        update(player);
    }

    /** Blendet die Sidebar aus und gibt dem Spieler das Standard-Scoreboard. */
    public void hide(Player player) {
        hidden.add(player.getUniqueId());
        boards.remove(player.getUniqueId());
        player.setScoreboard(Bukkit.getScoreboardManager().getMainScoreboard());
    }

    /** Schaltet die Sidebar um. @return true = jetzt sichtbar */
    public boolean toggle(Player player) {
        if (hidden.contains(player.getUniqueId())) {
            show(player);
            return true;
        }
        hide(player);
        return false;
    }

    /** Beim Quit aufraeumen. */
    public void remove(UUID uuid) {
        boards.remove(uuid);
        hidden.remove(uuid);
    }

    /**
     * Baut bzw. aktualisiert die Sidebar eines Spielers.
     */
    public void update(Player player) {
        List<String> lines = plugin.getMessageManager().getRawList("scoreboard.lines");
        if (lines.isEmpty()) return;

        Scoreboard board = boards.get(player.getUniqueId());
        Objective objective;

        if (board == null) {
            // Neues Scoreboard mit einem Team pro Zeile anlegen
            board = Bukkit.getScoreboardManager().getNewScoreboard();
            objective = board.registerNewObjective("bigmc", "dummy",
                    plugin.getMessageManager().getRaw("scoreboard.title"));
            objective.setDisplaySlot(DisplaySlot.SIDEBAR);

            for (int i = 0; i < lines.size() && i < 15; i++) {
                Team team = board.registerNewTeam("zeile" + i);
                String entry = entryFor(i);
                team.addEntry(entry);
                objective.getScore(entry).setScore(lines.size() - i);
            }
            boards.put(player.getUniqueId(), board);
            player.setScoreboard(board);
        } else {
            objective = board.getObjective("bigmc");
            if (objective == null) return;
            objective.setDisplayName(plugin.getMessageManager().getRaw("scoreboard.title"));
        }

        // Zeileninhalte als Team-Prefix setzen (flicker-frei)
        for (int i = 0; i < lines.size() && i < 15; i++) {
            Team team = board.getTeam("zeile" + i);
            if (team != null) {
                team.setPrefix(render(player, lines.get(i)));
            }
        }
    }

    /**
     * Eindeutiger, unsichtbarer Eintrag pro Zeile (Farbcode-Kombination).
     */
    private String entryFor(int index) {
        ChatColor[] colors = ChatColor.values();
        return colors[index % colors.length].toString() + ChatColor.RESET;
    }

    /**
     * Ersetzt alle Platzhalter einer Zeile mit den Live-Werten des Spielers.
     */
    private String render(Player player, String line) {
        if (line.isEmpty()) return "";

        // Werte nur ermitteln, wenn die Zeile sie wirklich braucht
        if (line.contains("%money%")) {
            line = line.replace("%money%", plugin.getEconomyManager()
                    .formatMoney(plugin.getEconomyManager().getBalance(player.getUniqueId())));
        }
        if (line.contains("%rank%")) {
            RankManager.Rank rank = plugin.getRankManager().getPlayerRank(player.getUniqueId());
            line = line.replace("%rank%", rank != null
                    ? eu.bieder.bigmc.config.MessageManager.color(rank.displayName()) : "");
        }
        if (line.contains("%kills%") || line.contains("%deaths%")
                || line.contains("%playtime%") || line.contains("%duelwins%")) {
            var stats = plugin.getStatsManager().getStats(player.getUniqueId()).orElse(null);
            line = line
                    .replace("%kills%", stats != null ? String.valueOf(stats.kills()) : "0")
                    .replace("%deaths%", stats != null ? String.valueOf(stats.deaths()) : "0")
                    .replace("%duelwins%", stats != null ? String.valueOf(stats.duelWins()) : "0")
                    .replace("%playtime%", stats != null
                            ? StatsManager.formatPlaytime(stats.playtimeSeconds()) : "0m");
        }
        return line
                .replace("%player%", player.getName())
                .replace("%online%", String.valueOf(Bukkit.getOnlinePlayers().size()))
                .replace("%maxonline%", String.valueOf(Bukkit.getMaxPlayers()));
    }
}
