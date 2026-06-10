package eu.bieder.bigmc.rank;

import eu.bieder.bigmc.BigMC;
import org.bukkit.configuration.ConfigurationSection;
import org.bukkit.entity.Player;
import org.bukkit.permissions.PermissionAttachment;

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
 * Verwaltet das leiter-basierte Rangsystem.
 *
 * Die Raenge werden in fester Reihenfolge aus der config.yml geladen. Jeder
 * Spieler startet auf dem ersten Rang und kann den jeweils naechsten Rang mit
 * Ingame-Geld (und optionalen Fortschritts-Voraussetzungen wie Spielzeit oder
 * Kills) freischalten. Permissions sind kumulativ: ein hoeherer Rang erhaelt
 * automatisch auch alle Rechte der darunterliegenden Raenge.
 */
public class RankManager {

    /** Ein einzelner Rang in der Leiter. */
    public record Rank(String id, String displayName, String prefix, int order,
                       double cost, long requiredPlaytimeSeconds, int requiredKills,
                       List<String> permissions) {
    }

    private final BigMC plugin;

    /** Alle Raenge in Config-Reihenfolge (id -> Rang). */
    private final List<Rank> ranks = new ArrayList<>();

    /** Aktive Permission-Attachments pro Online-Spieler. */
    private final Map<UUID, PermissionAttachment> attachments = new HashMap<>();

    public RankManager(BigMC plugin) {
        this.plugin = plugin;
        createTable();
        loadRanks();
    }

    private void createTable() {
        try (Statement st = connection().createStatement()) {
            st.execute("""
                CREATE TABLE IF NOT EXISTS player_ranks (
                    uuid    TEXT PRIMARY KEY,
                    name    TEXT NOT NULL,
                    rank_id TEXT NOT NULL
                );
            """);
        } catch (SQLException e) {
            plugin.getLogger().severe("Rang-Tabelle konnte nicht erstellt werden: " + e.getMessage());
        }
    }

    /** Liest alle Raenge aus der config.yml in fester Reihenfolge ein. */
    public void loadRanks() {
        ranks.clear();
        ConfigurationSection root = plugin.getConfigManager().getConfig()
                .getConfigurationSection("ranks.list");
        if (root == null) {
            plugin.getLogger().warning("Keine Raenge in der config.yml gefunden (ranks.list).");
            return;
        }

        int order = 0;
        for (String id : root.getKeys(false)) {
            ConfigurationSection sec = root.getConfigurationSection(id);
            if (sec == null) continue;
            Rank rank = new Rank(
                    id,
                    sec.getString("name", id),
                    sec.getString("prefix", ""),
                    order++,
                    sec.getDouble("cost", 0),
                    sec.getLong("required-playtime-hours", 0) * 3600L,
                    sec.getInt("required-kills", 0),
                    sec.getStringList("permissions"));
            ranks.add(rank);
        }
        plugin.getLogger().info("Raenge geladen: " + ranks.size());
    }

    // ----- Rang-Abfragen -----

    public List<Rank> getRanks() {
        return List.copyOf(ranks);
    }

    /** Der unterste (Start-)Rang, oder leer wenn keine Raenge konfiguriert sind. */
    public Optional<Rank> getFirstRank() {
        return ranks.isEmpty() ? Optional.empty() : Optional.of(ranks.get(0));
    }

    public Optional<Rank> getRankById(String id) {
        return ranks.stream().filter(r -> r.id().equalsIgnoreCase(id)).findFirst();
    }

    /** Der naechsthoehere Rang nach dem angegebenen (leer = bereits maximal). */
    public Optional<Rank> getNextRank(Rank current) {
        int next = current.order() + 1;
        return next < ranks.size() ? Optional.of(ranks.get(next)) : Optional.empty();
    }

    /** Aktueller Rang eines Spielers (faellt auf den Start-Rang zurueck). */
    public Rank getPlayerRank(UUID uuid) {
        String rankId = null;
        try (PreparedStatement ps = connection().prepareStatement(
                "SELECT rank_id FROM player_ranks WHERE uuid = ?;")) {
            ps.setString(1, uuid.toString());
            try (ResultSet rs = ps.executeQuery()) {
                if (rs.next()) rankId = rs.getString("rank_id");
            }
        } catch (SQLException e) {
            plugin.getLogger().severe("Rang konnte nicht geladen werden: " + e.getMessage());
        }
        if (rankId != null) {
            Optional<Rank> rank = getRankById(rankId);
            if (rank.isPresent()) return rank.get();
        }
        // Kein/unbekannter Rang -> Start-Rang
        return getFirstRank().orElse(null);
    }

    /** Setzt den Rang eines Spielers (in DB) und aktualisiert Permissions/Anzeige. */
    public void setPlayerRank(UUID uuid, String name, Rank rank) {
        try (PreparedStatement ps = connection().prepareStatement("""
                INSERT INTO player_ranks (uuid, name, rank_id) VALUES (?, ?, ?)
                ON CONFLICT(uuid) DO UPDATE SET name = excluded.name, rank_id = excluded.rank_id;
            """)) {
            ps.setString(1, uuid.toString());
            ps.setString(2, name);
            ps.setString(3, rank.id());
            ps.executeUpdate();
        } catch (SQLException e) {
            plugin.getLogger().severe("Rang konnte nicht gespeichert werden: " + e.getMessage());
        }

        Player online = plugin.getServer().getPlayer(uuid);
        if (online != null) {
            applyPermissions(online);
        }
    }

    // ----- Permissions -----

    /**
     * Setzt die Permissions eines Spielers neu: alle Rechte seines Rangs und
     * aller darunterliegenden Raenge (kumulativ).
     */
    public void applyPermissions(Player player) {
        // Altes Attachment entfernen, damit nichts doppelt haengen bleibt
        PermissionAttachment old = attachments.remove(player.getUniqueId());
        if (old != null) {
            try {
                player.removeAttachment(old);
            } catch (IllegalArgumentException ignored) {
                // Attachment war nicht mehr gueltig - egal
            }
        }

        Rank rank = getPlayerRank(player.getUniqueId());
        if (rank == null) return;

        PermissionAttachment attachment = player.addAttachment(plugin);
        for (Rank r : ranks) {
            if (r.order() > rank.order()) break; // nur bis zum aktuellen Rang
            for (String perm : r.permissions()) {
                attachment.setPermission(perm, true);
            }
        }
        attachments.put(player.getUniqueId(), attachment);
        player.recalculatePermissions();
    }

    /** Beim Quit das Attachment aufraeumen. */
    public void clearPermissions(UUID uuid) {
        attachments.remove(uuid);
    }

    // ----- Hilfen -----

    private Connection connection() {
        return plugin.getDatabase().getConnection();
    }
}
