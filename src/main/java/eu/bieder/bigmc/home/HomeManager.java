package eu.bieder.bigmc.home;

import eu.bieder.bigmc.BigMC;
import org.bukkit.Location;
import org.bukkit.entity.Player;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Verwaltet persoenliche Teleport-Punkte (Homes) der Spieler.
 *
 * Jeder Spieler hat ein Limit (Standard 3, Premium 6 - siehe PremiumService).
 * Die Homes liegen in der Tabelle "homes" (eindeutig pro Spieler + Name).
 */
public class HomeManager {

    /** Ein einzelnes Home. */
    public record Home(String name, String world, double x, double y, double z,
                       float yaw, float pitch) {
    }

    private final BigMC plugin;

    public HomeManager(BigMC plugin) {
        this.plugin = plugin;
        createTable();
    }

    private void createTable() {
        try (Statement st = connection().createStatement()) {
            st.execute("""
                CREATE TABLE IF NOT EXISTS homes (
                    uuid  TEXT NOT NULL,
                    name  TEXT NOT NULL,
                    world TEXT NOT NULL,
                    x REAL NOT NULL, y REAL NOT NULL, z REAL NOT NULL,
                    yaw REAL NOT NULL, pitch REAL NOT NULL,
                    PRIMARY KEY (uuid, name)
                );
            """);
        } catch (SQLException e) {
            plugin.getLogger().severe("Homes-Tabelle konnte nicht erstellt werden: " + e.getMessage());
        }
    }

    /** Liefert alle Homes eines Spielers (alphabetisch). */
    public List<Home> getHomes(UUID uuid) {
        List<Home> result = new ArrayList<>();
        try (PreparedStatement ps = connection().prepareStatement(
                "SELECT * FROM homes WHERE uuid = ? ORDER BY name COLLATE NOCASE;")) {
            ps.setString(1, uuid.toString());
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) result.add(read(rs));
            }
        } catch (SQLException e) {
            plugin.getLogger().severe("Homes konnten nicht geladen werden: " + e.getMessage());
        }
        return result;
    }

    /** Liefert ein bestimmtes Home (Gross-/Kleinschreibung egal). */
    public Optional<Home> getHome(UUID uuid, String name) {
        try (PreparedStatement ps = connection().prepareStatement(
                "SELECT * FROM homes WHERE uuid = ? AND name = ? COLLATE NOCASE;")) {
            ps.setString(1, uuid.toString());
            ps.setString(2, name);
            try (ResultSet rs = ps.executeQuery()) {
                if (rs.next()) return Optional.of(read(rs));
            }
        } catch (SQLException e) {
            plugin.getLogger().severe("Home konnte nicht geladen werden: " + e.getMessage());
        }
        return Optional.empty();
    }

    public int countHomes(UUID uuid) {
        try (PreparedStatement ps = connection().prepareStatement(
                "SELECT COUNT(*) FROM homes WHERE uuid = ?;")) {
            ps.setString(1, uuid.toString());
            try (ResultSet rs = ps.executeQuery()) {
                if (rs.next()) return rs.getInt(1);
            }
        } catch (SQLException e) {
            plugin.getLogger().severe("Home-Anzahl konnte nicht ermittelt werden: " + e.getMessage());
        }
        return 0;
    }

    /**
     * Setzt ein Home. Ergebnis sagt, was passiert ist (fuer passende Meldung).
     */
    public enum SetResult { CREATED, UPDATED, LIMIT_REACHED }

    public SetResult setHome(Player player, String name) {
        UUID uuid = player.getUniqueId();
        boolean exists = getHome(uuid, name).isPresent();
        if (!exists) {
            int limit = plugin.getPremiumService().getHomeLimit(player);
            if (countHomes(uuid) >= limit) {
                return SetResult.LIMIT_REACHED;
            }
        }
        Location loc = player.getLocation();
        try (PreparedStatement ps = connection().prepareStatement("""
                INSERT INTO homes (uuid, name, world, x, y, z, yaw, pitch)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(uuid, name) DO UPDATE SET
                    world = excluded.world, x = excluded.x, y = excluded.y, z = excluded.z,
                    yaw = excluded.yaw, pitch = excluded.pitch;
            """)) {
            ps.setString(1, uuid.toString());
            ps.setString(2, name);
            ps.setString(3, loc.getWorld().getName());
            ps.setDouble(4, loc.getX());
            ps.setDouble(5, loc.getY());
            ps.setDouble(6, loc.getZ());
            ps.setDouble(7, loc.getYaw());
            ps.setDouble(8, loc.getPitch());
            ps.executeUpdate();
        } catch (SQLException e) {
            plugin.getLogger().severe("Home konnte nicht gespeichert werden: " + e.getMessage());
        }
        return exists ? SetResult.UPDATED : SetResult.CREATED;
    }

    public boolean deleteHome(UUID uuid, String name) {
        try (PreparedStatement ps = connection().prepareStatement(
                "DELETE FROM homes WHERE uuid = ? AND name = ? COLLATE NOCASE;")) {
            ps.setString(1, uuid.toString());
            ps.setString(2, name);
            return ps.executeUpdate() > 0;
        } catch (SQLException e) {
            plugin.getLogger().severe("Home konnte nicht geloescht werden: " + e.getMessage());
            return false;
        }
    }

    /** Wandelt ein Home in eine Location (oder leer, falls die Welt fehlt). */
    public Optional<Location> toLocation(Home home) {
        var world = plugin.getServer().getWorld(home.world());
        if (world == null) return Optional.empty();
        return Optional.of(new Location(world, home.x(), home.y(), home.z(), home.yaw(), home.pitch()));
    }

    private Home read(ResultSet rs) throws SQLException {
        return new Home(
                rs.getString("name"),
                rs.getString("world"),
                rs.getDouble("x"), rs.getDouble("y"), rs.getDouble("z"),
                (float) rs.getDouble("yaw"), (float) rs.getDouble("pitch"));
    }

    private Connection connection() {
        return plugin.getDatabase().getConnection();
    }
}
