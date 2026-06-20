package eu.bieder.bigmc.stats;

import eu.bieder.bigmc.BigMC;
import org.bukkit.entity.Player;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

/**
 * Verwaltet die Spieler-Statistiken: Kills, Tode, Duell-Siege und Spielzeit.
 * (Das Geld liegt weiterhin beim EconomyManager - /top geld greift darauf zu.)
 *
 * Spielzeit-Tracking: Beim Join wird der Zeitpunkt gemerkt. Ein Minuten-Task
 * und der Quit-Listener "spuelen" die vergangene Zeit regelmaessig in die
 * Datenbank, damit auch bei einem Server-Crash fast nichts verloren geht.
 */
public class StatsManager {

    /** Statistik-Datensatz eines Spielers. */
    public record PlayerStats(UUID uuid, String name, int kills, int deaths,
                              int duelWins, long playtimeSeconds) {
    }

    /** Kategorien fuer /top (deutsche Namen als Befehls-Argument). */
    public enum Category {
        KILLS("kills", "kills"),
        TODE("tode", "deaths"),
        DUELLE("duelle", "duel_wins"),
        SPIELZEIT("spielzeit", "playtime_seconds");

        public final String arg;     // was der Spieler eintippt
        public final String column;  // Spaltenname in der Tabelle

        Category(String arg, String column) {
            this.arg = arg;
            this.column = column;
        }

        public static Optional<Category> byArg(String input) {
            for (Category c : values()) {
                if (c.arg.equalsIgnoreCase(input)) return Optional.of(c);
            }
            return Optional.empty();
        }
    }

    private final BigMC plugin;

    /** Join-Zeitpunkt der gerade online befindlichen Spieler (fuer Spielzeit). */
    private final Map<UUID, Long> sessionStart = new HashMap<>();

    public StatsManager(BigMC plugin) {
        this.plugin = plugin;
        createTable();
    }

    private void createTable() {
        try (Statement st = connection().createStatement()) {
            st.execute("""
                CREATE TABLE IF NOT EXISTS stats (
                    uuid             TEXT PRIMARY KEY,
                    name             TEXT NOT NULL,
                    kills            INTEGER NOT NULL DEFAULT 0,
                    deaths           INTEGER NOT NULL DEFAULT 0,
                    duel_wins        INTEGER NOT NULL DEFAULT 0,
                    playtime_seconds INTEGER NOT NULL DEFAULT 0
                );
            """);
        } catch (SQLException e) {
            plugin.getLogger().severe("Stats-Tabelle konnte nicht erstellt werden: " + e.getMessage());
        }
    }

    // ----- Session-Verwaltung (Spielzeit) -----

    /** Beim Join: Datensatz anlegen/Namen aktualisieren und Session starten. */
    public void startSession(Player player) {
        try (PreparedStatement ps = connection().prepareStatement("""
                INSERT INTO stats (uuid, name) VALUES (?, ?)
                ON CONFLICT(uuid) DO UPDATE SET name = excluded.name;
            """)) {
            ps.setString(1, player.getUniqueId().toString());
            ps.setString(2, player.getName());
            ps.executeUpdate();
        } catch (SQLException e) {
            plugin.getLogger().severe("Stats-Datensatz konnte nicht angelegt werden: " + e.getMessage());
        }
        sessionStart.put(player.getUniqueId(), System.currentTimeMillis());
    }

    /** Beim Quit: restliche Spielzeit speichern und Session beenden. */
    public void endSession(UUID uuid) {
        flushPlaytime(uuid);
        sessionStart.remove(uuid);
    }

    /**
     * Schreibt die seit dem letzten Flush vergangene Spielzeit in die DB
     * und setzt den Referenzzeitpunkt neu.
     */
    public void flushPlaytime(UUID uuid) {
        Long start = sessionStart.get(uuid);
        if (start == null) return;
        long now = System.currentTimeMillis();
        long seconds = (now - start) / 1000L;
        if (seconds <= 0) return;
        sessionStart.put(uuid, now);
        addToColumn(uuid, "playtime_seconds", (int) seconds);
    }

    /** Spielzeit aller Online-Spieler speichern (Minuten-Task + onDisable). */
    public void flushAllPlaytime() {
        for (UUID uuid : new ArrayList<>(sessionStart.keySet())) {
            flushPlaytime(uuid);
        }
    }

    // ----- Zaehler -----

    public void addKill(UUID uuid) {
        addToColumn(uuid, "kills", 1);
    }

    public void addDeath(UUID uuid) {
        addToColumn(uuid, "deaths", 1);
    }

    public void addDuelWin(UUID uuid) {
        addToColumn(uuid, "duel_wins", 1);
    }

    /** Erhoeht eine Zaehlerspalte. Der Spaltenname kommt NUR aus eigenem Code. */
    private void addToColumn(UUID uuid, String column, int amount) {
        try (PreparedStatement ps = connection().prepareStatement(
                "UPDATE stats SET " + column + " = " + column + " + ? WHERE uuid = ?;")) {
            ps.setInt(1, amount);
            ps.setString(2, uuid.toString());
            ps.executeUpdate();
        } catch (SQLException e) {
            plugin.getLogger().severe("Statistik (" + column + ") konnte nicht erhoeht werden: " + e.getMessage());
        }
    }

    // ----- Abfragen -----

    /** Statistiken eines Spielers per UUID. */
    public Optional<PlayerStats> getStats(UUID uuid) {
        // Vorher die aktuelle Session-Spielzeit speichern, damit der Wert stimmt
        flushPlaytime(uuid);
        try (PreparedStatement ps = connection().prepareStatement(
                "SELECT * FROM stats WHERE uuid = ?;")) {
            ps.setString(1, uuid.toString());
            try (ResultSet rs = ps.executeQuery()) {
                if (rs.next()) return Optional.of(readStats(rs));
            }
        } catch (SQLException e) {
            plugin.getLogger().severe("Statistiken konnten nicht geladen werden: " + e.getMessage());
        }
        return Optional.empty();
    }

    /** Statistiken per Spielername (Gross-/Kleinschreibung egal). */
    public Optional<PlayerStats> getStatsByName(String name) {
        try (PreparedStatement ps = connection().prepareStatement(
                "SELECT * FROM stats WHERE LOWER(name) = LOWER(?);")) {
            ps.setString(1, name);
            try (ResultSet rs = ps.executeQuery()) {
                if (rs.next()) {
                    PlayerStats stats = readStats(rs);
                    // Falls der Spieler online ist: Spielzeit aktualisieren und neu lesen
                    if (sessionStart.containsKey(stats.uuid())) {
                        return getStats(stats.uuid());
                    }
                    return Optional.of(stats);
                }
            }
        } catch (SQLException e) {
            plugin.getLogger().severe("Statistiken konnten nicht geladen werden: " + e.getMessage());
        }
        return Optional.empty();
    }

    /** Rangliste einer Kategorie, absteigend sortiert. */
    public List<PlayerStats> getTop(Category category, int limit) {
        // Bei Spielzeit erst alle Online-Sessions speichern, damit die Liste stimmt
        if (category == Category.SPIELZEIT) {
            flushAllPlaytime();
        }
        List<PlayerStats> result = new ArrayList<>();
        try (PreparedStatement ps = connection().prepareStatement(
                "SELECT * FROM stats ORDER BY " + category.column + " DESC LIMIT ?;")) {
            ps.setInt(1, limit);
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) {
                    result.add(readStats(rs));
                }
            }
        } catch (SQLException e) {
            plugin.getLogger().severe("Rangliste konnte nicht geladen werden: " + e.getMessage());
        }
        return result;
    }

    // ----- Hilfen -----

    private PlayerStats readStats(ResultSet rs) throws SQLException {
        return new PlayerStats(
                UUID.fromString(rs.getString("uuid")),
                rs.getString("name"),
                rs.getInt("kills"),
                rs.getInt("deaths"),
                rs.getInt("duel_wins"),
                rs.getLong("playtime_seconds"));
    }

    /**
     * Setzt ausgewaehlte Statistik-Spalten fuer ALLE Spieler auf 0 zurueck
     * (fuer den Season-Reset). Nur fest erlaubte Spaltennamen werden akzeptiert.
     */
    public void resetColumns(java.util.Collection<String> columns) {
        java.util.Set<String> allowed = java.util.Set.of("kills", "deaths", "duel_wins");
        java.util.List<String> safe = new java.util.ArrayList<>();
        for (String c : columns) {
            if (allowed.contains(c)) safe.add(c + " = 0");
        }
        if (safe.isEmpty()) return;
        String sql = "UPDATE stats SET " + String.join(", ", safe) + ";";
        try (Statement st = connection().createStatement()) {
            st.executeUpdate(sql);
        } catch (SQLException e) {
            plugin.getLogger().severe("Season-Stat-Reset fehlgeschlagen: " + e.getMessage());
        }
    }

    private Connection connection() {
        return plugin.getDatabase().getConnection();
    }

    /**
     * Formatiert Spielzeit lesbar, z.B. "3d 4h 12m" oder "45m".
     */
    public static String formatPlaytime(long seconds) {
        long minutes = seconds / 60;
        long days = minutes / (60 * 24);
        long hours = (minutes / 60) % 24;
        long mins = minutes % 60;
        StringBuilder sb = new StringBuilder();
        if (days > 0) sb.append(days).append("d ");
        if (hours > 0 || days > 0) sb.append(hours).append("h ");
        sb.append(mins).append("m");
        return sb.toString();
    }
}
