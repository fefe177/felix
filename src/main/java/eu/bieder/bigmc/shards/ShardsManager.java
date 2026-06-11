package eu.bieder.bigmc.shards;

import eu.bieder.bigmc.BigMC;
import org.bukkit.entity.Player;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.text.NumberFormat;
import java.util.Locale;
import java.util.Optional;
import java.util.UUID;

/**
 * Verwaltet die zweite Waehrung "Shards" (wie auf DonutSMP).
 *
 * Shards verdient man durch PvP-Kills und in der AFK-Zone - NICHT durch
 * Item-Verkauf. Ausgegeben werden sie hauptsaechlich fuer Spawner.
 * Gespeichert wird ganzzahlig in der Tabelle "shards".
 */
public class ShardsManager {

    /** Ein Shards-Konto (fuer Suchen per Name). */
    public record Account(UUID uuid, String name, long amount) {
    }

    private final BigMC plugin;
    private final NumberFormat format;

    public ShardsManager(BigMC plugin) {
        this.plugin = plugin;
        this.format = NumberFormat.getIntegerInstance(Locale.GERMANY);
        createTable();
    }

    private void createTable() {
        try (Statement st = connection().createStatement()) {
            st.execute("""
                CREATE TABLE IF NOT EXISTS shards (
                    uuid   TEXT PRIMARY KEY,
                    name   TEXT NOT NULL,
                    amount INTEGER NOT NULL DEFAULT 0
                );
            """);
        } catch (SQLException e) {
            plugin.getLogger().severe("Shards-Tabelle konnte nicht erstellt werden: " + e.getMessage());
        }
    }

    /** Legt beim Join ein Konto an bzw. aktualisiert den Namen. */
    public void createAccountIfMissing(Player player) {
        try (PreparedStatement ps = connection().prepareStatement("""
                INSERT INTO shards (uuid, name, amount) VALUES (?, ?, 0)
                ON CONFLICT(uuid) DO UPDATE SET name = excluded.name;
            """)) {
            ps.setString(1, player.getUniqueId().toString());
            ps.setString(2, player.getName());
            ps.executeUpdate();
        } catch (SQLException e) {
            plugin.getLogger().severe("Shards-Konto konnte nicht angelegt werden: " + e.getMessage());
        }
    }

    /** Aktueller Shards-Stand (0, falls kein Konto). */
    public long getShards(UUID uuid) {
        try (PreparedStatement ps = connection().prepareStatement(
                "SELECT amount FROM shards WHERE uuid = ?;")) {
            ps.setString(1, uuid.toString());
            try (ResultSet rs = ps.executeQuery()) {
                if (rs.next()) return rs.getLong("amount");
            }
        } catch (SQLException e) {
            plugin.getLogger().severe("Shards konnten nicht gelesen werden: " + e.getMessage());
        }
        return 0;
    }

    /** Setzt den Stand auf einen festen Wert. */
    public boolean setShards(UUID uuid, long amount) {
        if (amount < 0) return false;
        try (PreparedStatement ps = connection().prepareStatement(
                "UPDATE shards SET amount = ? WHERE uuid = ?;")) {
            ps.setLong(1, amount);
            ps.setString(2, uuid.toString());
            return ps.executeUpdate() > 0;
        } catch (SQLException e) {
            plugin.getLogger().severe("Shards konnten nicht gesetzt werden: " + e.getMessage());
            return false;
        }
    }

    /** Schreibt Shards gut. */
    public boolean addShards(UUID uuid, long amount) {
        if (amount <= 0) return false;
        try (PreparedStatement ps = connection().prepareStatement(
                "UPDATE shards SET amount = amount + ? WHERE uuid = ?;")) {
            ps.setLong(1, amount);
            ps.setString(2, uuid.toString());
            return ps.executeUpdate() > 0;
        } catch (SQLException e) {
            plugin.getLogger().severe("Shards-Gutschrift fehlgeschlagen: " + e.getMessage());
            return false;
        }
    }

    /**
     * Zieht Shards ab - nur bei ausreichender Deckung (Pruefung im SQL,
     * dadurch nie negativ).
     */
    public boolean takeShards(UUID uuid, long amount) {
        if (amount <= 0) return false;
        try (PreparedStatement ps = connection().prepareStatement(
                "UPDATE shards SET amount = amount - ? WHERE uuid = ? AND amount >= ?;")) {
            ps.setLong(1, amount);
            ps.setString(2, uuid.toString());
            ps.setLong(3, amount);
            return ps.executeUpdate() > 0;
        } catch (SQLException e) {
            plugin.getLogger().severe("Shards-Abbuchung fehlgeschlagen: " + e.getMessage());
            return false;
        }
    }

    /** Ueberweist Shards von einem Spieler zum anderen. */
    public boolean transfer(UUID from, UUID to, long amount) {
        if (amount <= 0) return false;
        if (!takeShards(from, amount)) return false;
        if (!addShards(to, amount)) {
            addShards(from, amount); // Ziel existiert nicht -> zurueckbuchen
            return false;
        }
        return true;
    }

    /** Konto per Spielername suchen (Gross-/Kleinschreibung egal). */
    public Optional<Account> findAccount(String name) {
        try (PreparedStatement ps = connection().prepareStatement(
                "SELECT uuid, name, amount FROM shards WHERE LOWER(name) = LOWER(?);")) {
            ps.setString(1, name);
            try (ResultSet rs = ps.executeQuery()) {
                if (rs.next()) {
                    return Optional.of(new Account(
                            UUID.fromString(rs.getString("uuid")),
                            rs.getString("name"),
                            rs.getLong("amount")));
                }
            }
        } catch (SQLException e) {
            plugin.getLogger().severe("Shards-Konto-Suche fehlgeschlagen: " + e.getMessage());
        }
        return Optional.empty();
    }

    /** Shards pro PvP-Kill (config). */
    public long getShardsPerKill() {
        return plugin.getConfigManager().getConfig().getLong("shards.per-kill", 5);
    }

    /** Formatiert einen Betrag inkl. Symbol, z.B. "1.250 ❖". */
    public String formatShards(long amount) {
        String symbol = plugin.getConfigManager().getConfig().getString("shards.symbol", "❖");
        return format.format(amount) + " " + symbol;
    }

    private Connection connection() {
        return plugin.getDatabase().getConnection();
    }
}
