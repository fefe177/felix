package eu.bieder.bigmc.gems;

import eu.bieder.bigmc.BigMC;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.text.NumberFormat;
import java.util.Locale;

/**
 * Gems = Premium-Waehrung (im Original per Echtgeld ueber Tebex gekauft).
 *
 * Die Kontofuehrung erfolgt - wie bei den Votes - ueber den Spielernamen,
 * damit Tebex auch fuer OFFLINE-Spieler gutschreiben kann
 * (z.B. "gems give {player} 1000" direkt nach dem Kauf).
 */
public class GemsManager {

    private final BigMC plugin;
    private final NumberFormat format;

    public GemsManager(BigMC plugin) {
        this.plugin = plugin;
        this.format = NumberFormat.getIntegerInstance(Locale.GERMANY);
        createTable();
    }

    private void createTable() {
        try (Statement st = connection().createStatement()) {
            st.execute("""
                CREATE TABLE IF NOT EXISTS gems (
                    name   TEXT PRIMARY KEY COLLATE NOCASE,
                    amount INTEGER NOT NULL DEFAULT 0
                );
            """);
        } catch (SQLException e) {
            plugin.getLogger().severe("Gems-Tabelle konnte nicht erstellt werden: " + e.getMessage());
        }
    }

    public long getGems(String name) {
        try (PreparedStatement ps = connection().prepareStatement(
                "SELECT amount FROM gems WHERE name = ? COLLATE NOCASE;")) {
            ps.setString(1, name);
            try (ResultSet rs = ps.executeQuery()) {
                if (rs.next()) return rs.getLong("amount");
            }
        } catch (SQLException e) {
            plugin.getLogger().severe("Gems konnten nicht gelesen werden: " + e.getMessage());
        }
        return 0;
    }

    public void add(String name, long amount) {
        if (amount == 0) return;
        try (PreparedStatement ps = connection().prepareStatement("""
                INSERT INTO gems (name, amount) VALUES (?, ?)
                ON CONFLICT(name) DO UPDATE SET amount = amount + excluded.amount;
            """)) {
            ps.setString(1, name);
            ps.setLong(2, amount);
            ps.executeUpdate();
        } catch (SQLException e) {
            plugin.getLogger().severe("Gems konnten nicht gutgeschrieben werden: " + e.getMessage());
        }
    }

    /** Zieht Gems ab - nur wenn genug vorhanden sind (atomar im SQL). */
    public boolean take(String name, long amount) {
        if (amount <= 0) return false;
        try (PreparedStatement ps = connection().prepareStatement(
                "UPDATE gems SET amount = amount - ? WHERE name = ? COLLATE NOCASE AND amount >= ?;")) {
            ps.setLong(1, amount);
            ps.setString(2, name);
            ps.setLong(3, amount);
            return ps.executeUpdate() > 0;
        } catch (SQLException e) {
            plugin.getLogger().severe("Gems konnten nicht abgezogen werden: " + e.getMessage());
            return false;
        }
    }

    public void set(String name, long amount) {
        if (amount < 0) amount = 0;
        try (PreparedStatement ps = connection().prepareStatement("""
                INSERT INTO gems (name, amount) VALUES (?, ?)
                ON CONFLICT(name) DO UPDATE SET amount = excluded.amount;
            """)) {
            ps.setString(1, name);
            ps.setLong(2, amount);
            ps.executeUpdate();
        } catch (SQLException e) {
            plugin.getLogger().severe("Gems konnten nicht gesetzt werden: " + e.getMessage());
        }
    }

    public String formatGems(long amount) {
        String symbol = plugin.getConfigManager().getConfig().getString("gems.symbol", "✦");
        return format.format(amount) + symbol;
    }

    private Connection connection() {
        return plugin.getDatabase().getConnection();
    }
}
