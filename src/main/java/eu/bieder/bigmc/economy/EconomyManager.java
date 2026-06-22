package eu.bieder.bigmc.economy;

import eu.bieder.bigmc.BigMC;
import org.bukkit.entity.Player;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.text.NumberFormat;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.UUID;

/**
 * Verwaltet die Ingame-Waehrung aller Spieler.
 *
 * Jeder Spieler hat genau einen Eintrag in der Tabelle "economy"
 * (UUID, letzter bekannter Name, Kontostand). Alle Aenderungen werden
 * sofort in die SQLite-Datenbank geschrieben, damit nichts verloren geht.
 */
public class EconomyManager {

    private final BigMC plugin;

    /** Zahlenformat im deutschen Stil: 1.234,56 */
    private final NumberFormat format;

    public EconomyManager(BigMC plugin) {
        this.plugin = plugin;
        this.format = NumberFormat.getNumberInstance(Locale.GERMANY);
        this.format.setMinimumFractionDigits(2);
        this.format.setMaximumFractionDigits(2);
        createTable();
    }

    /**
     * Legt die Economy-Tabelle an, falls sie noch nicht existiert.
     */
    private void createTable() {
        try (Statement st = connection().createStatement()) {
            st.execute("""
                CREATE TABLE IF NOT EXISTS economy (
                    uuid    TEXT PRIMARY KEY,
                    name    TEXT NOT NULL,
                    balance REAL NOT NULL DEFAULT 0
                );
            """);
        } catch (SQLException e) {
            plugin.getLogger().severe("Economy-Tabelle konnte nicht erstellt werden: " + e.getMessage());
        }
    }

    /**
     * Legt fuer einen Spieler ein Konto mit Startguthaben an (falls neu)
     * und aktualisiert seinen Namen (falls er sich umbenannt hat).
     * Wird beim Join aufgerufen.
     */
    public void createAccountIfMissing(Player player) {
        double start = plugin.getConfigManager().getStartBalance();
        try (PreparedStatement ps = connection().prepareStatement("""
                INSERT INTO economy (uuid, name, balance) VALUES (?, ?, ?)
                ON CONFLICT(uuid) DO UPDATE SET name = excluded.name;
            """)) {
            ps.setString(1, player.getUniqueId().toString());
            ps.setString(2, player.getName());
            ps.setDouble(3, start);
            ps.executeUpdate();
        } catch (SQLException e) {
            plugin.getLogger().severe("Konto fuer " + player.getName() + " konnte nicht angelegt werden: " + e.getMessage());
        }
    }

    /**
     * Liefert den Kontostand eines Spielers (0, falls kein Konto existiert).
     */
    public double getBalance(UUID uuid) {
        try (PreparedStatement ps = connection().prepareStatement(
                "SELECT balance FROM economy WHERE uuid = ?;")) {
            ps.setString(1, uuid.toString());
            try (ResultSet rs = ps.executeQuery()) {
                if (rs.next()) {
                    return rs.getDouble("balance");
                }
            }
        } catch (SQLException e) {
            plugin.getLogger().severe("Kontostand konnte nicht gelesen werden: " + e.getMessage());
        }
        return 0.0;
    }

    /**
     * Setzt den Kontostand eines Spielers auf einen festen Wert.
     */
    public boolean setBalance(UUID uuid, double amount) {
        if (amount < 0) return false;
        try (PreparedStatement ps = connection().prepareStatement(
                "UPDATE economy SET balance = ? WHERE uuid = ?;")) {
            ps.setDouble(1, round(amount));
            ps.setString(2, uuid.toString());
            return ps.executeUpdate() > 0;
        } catch (SQLException e) {
            plugin.getLogger().severe("Kontostand konnte nicht gesetzt werden: " + e.getMessage());
            return false;
        }
    }

    /**
     * Zahlt einem Spieler Geld auf das Konto ein.
     */
    public boolean deposit(UUID uuid, double amount) {
        if (amount <= 0) return false;
        try (PreparedStatement ps = connection().prepareStatement(
                "UPDATE economy SET balance = balance + ? WHERE uuid = ?;")) {
            ps.setDouble(1, round(amount));
            ps.setString(2, uuid.toString());
            return ps.executeUpdate() > 0;
        } catch (SQLException e) {
            plugin.getLogger().severe("Einzahlung fehlgeschlagen: " + e.getMessage());
            return false;
        }
    }

    /**
     * Zieht einem Spieler Geld ab - aber nur, wenn er genug hat.
     * Die Pruefung passiert direkt im SQL (WHERE balance >= ?),
     * dadurch kann das Konto nie ins Minus rutschen.
     */
    public boolean withdraw(UUID uuid, double amount) {
        if (amount <= 0) return false;
        try (PreparedStatement ps = connection().prepareStatement(
                "UPDATE economy SET balance = balance - ? WHERE uuid = ? AND balance >= ?;")) {
            ps.setDouble(1, round(amount));
            ps.setString(2, uuid.toString());
            ps.setDouble(3, round(amount));
            return ps.executeUpdate() > 0;
        } catch (SQLException e) {
            plugin.getLogger().severe("Abbuchung fehlgeschlagen: " + e.getMessage());
            return false;
        }
    }

    /**
     * Ueberweist Geld von einem Spieler zu einem anderen.
     * Erst abbuchen (mit Deckungspruefung), dann gutschreiben.
     */
    public boolean transfer(UUID from, UUID to, double amount) {
        if (amount <= 0) return false;
        if (!withdraw(from, amount)) {
            return false; // nicht genug Geld
        }
        if (!deposit(to, amount)) {
            // Ziel-Konto existiert nicht -> Geld zurueckbuchen
            deposit(from, amount);
            return false;
        }
        return true;
    }

    /**
     * Sucht ein Konto anhand des Spielernamens (Gross-/Kleinschreibung egal).
     */
    public Optional<Account> findAccount(String name) {
        try (PreparedStatement ps = connection().prepareStatement(
                "SELECT uuid, name, balance FROM economy WHERE LOWER(name) = LOWER(?);")) {
            ps.setString(1, name);
            try (ResultSet rs = ps.executeQuery()) {
                if (rs.next()) {
                    return Optional.of(new Account(
                            UUID.fromString(rs.getString("uuid")),
                            rs.getString("name"),
                            rs.getDouble("balance")));
                }
            }
        } catch (SQLException e) {
            plugin.getLogger().severe("Konto-Suche fehlgeschlagen: " + e.getMessage());
        }
        return Optional.empty();
    }

    /**
     * Liefert die reichsten Spieler, absteigend sortiert.
     */
    public List<Account> getTopBalances(int limit) {
        List<Account> result = new ArrayList<>();
        try (PreparedStatement ps = connection().prepareStatement(
                "SELECT uuid, name, balance FROM economy ORDER BY balance DESC LIMIT ?;")) {
            ps.setInt(1, limit);
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) {
                    result.add(new Account(
                            UUID.fromString(rs.getString("uuid")),
                            rs.getString("name"),
                            rs.getDouble("balance")));
                }
            }
        } catch (SQLException e) {
            plugin.getLogger().severe("Baltop konnte nicht geladen werden: " + e.getMessage());
        }
        return result;
    }

    /**
     * Formatiert einen Betrag inkl. Waehrungssymbol, z.B. "1.250,00$".
     */
    public String formatMoney(double amount) {
        String symbol = plugin.getConfigManager().getConfig()
                .getString("economy.currency-symbol", "$");
        return format.format(amount) + symbol;
    }

    /**
     * Kurzes Format im DonutSMP-Stil, z.B. "$1.2k" - ideal fuer GUIs.
     */
    public String formatShort(double amount) {
        String symbol = plugin.getConfigManager().getConfig()
                .getString("economy.currency-symbol", "$");
        return symbol + eu.bieder.bigmc.util.GuiDesign.shortNumber(amount);
    }

    /** Rundet auf 2 Nachkommastellen (Cent-genau). */
    private double round(double value) {
        return Math.round(value * 100.0) / 100.0;
    }

    private Connection connection() {
        return plugin.getDatabase().getConnection();
    }

    /**
     * Einfacher Datensatz fuer ein Spielerkonto.
     */
    public record Account(UUID uuid, String name, double balance) {
    }
}
