package eu.bieder.bigmc.order;

import eu.bieder.bigmc.BigMC;
import org.bukkit.Material;

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
 * Verwaltet das Auftragssystem (Buy-Orders wie auf DonutSMP).
 *
 * Ablauf:
 * 1. Ein Spieler erstellt einen Auftrag: "Ich kaufe X mal MATERIAL fuer Y pro Stueck."
 *    Das Geld (X * Y) wird SOFORT vom Konto abgebucht und als Pfand hinterlegt -
 *    dadurch ist garantiert, dass jeder Lieferant bezahlt werden kann.
 * 2. Andere Spieler liefern mit /order fulfill: Items werden eingezogen,
 *    das Geld wird sofort aus dem Pfand ausgezahlt.
 * 3. Die gelieferten Items landen im Lieferfach des Auftraggebers (/order collect).
 * 4. /order cancel zahlt das Pfand fuer die noch offene Restmenge zurueck.
 *
 * Auftraege gelten nur fuer "einfache" Items ohne Meta (keine Verzauberungen),
 * deshalb reicht es, Material + Anzahl zu speichern.
 */
public class OrderManager {

    /** Ein aktiver Auftrag. */
    public record Order(int id, UUID creatorUuid, String creatorName, Material material,
                        int amountTotal, int amountRemaining, double pricePerItem) {
    }

    /** Gelieferte Items, die der Auftraggeber abholen kann. */
    public record Delivery(int id, Material material, int amount) {
    }

    private final BigMC plugin;

    public OrderManager(BigMC plugin) {
        this.plugin = plugin;
        createTables();
    }

    private void createTables() {
        try (Statement st = connection().createStatement()) {
            st.execute("""
                CREATE TABLE IF NOT EXISTS orders (
                    id               INTEGER PRIMARY KEY AUTOINCREMENT,
                    creator_uuid     TEXT    NOT NULL,
                    creator_name     TEXT    NOT NULL,
                    material         TEXT    NOT NULL,
                    amount_total     INTEGER NOT NULL,
                    amount_remaining INTEGER NOT NULL,
                    price_per_item   REAL    NOT NULL
                );
            """);
            st.execute("""
                CREATE TABLE IF NOT EXISTS order_deliveries (
                    id         INTEGER PRIMARY KEY AUTOINCREMENT,
                    owner_uuid TEXT    NOT NULL,
                    material   TEXT    NOT NULL,
                    amount     INTEGER NOT NULL
                );
            """);
        } catch (SQLException e) {
            plugin.getLogger().severe("Auftrags-Tabellen konnten nicht erstellt werden: " + e.getMessage());
        }
    }

    // ----- Auftraege -----

    /**
     * Legt einen neuen Auftrag an. Das Pfand muss vom Aufrufer bereits
     * abgebucht worden sein!
     */
    public boolean createOrder(UUID creator, String creatorName, Material material,
                               int amount, double pricePerItem) {
        try (PreparedStatement ps = connection().prepareStatement("""
                INSERT INTO orders (creator_uuid, creator_name, material,
                                    amount_total, amount_remaining, price_per_item)
                VALUES (?, ?, ?, ?, ?, ?);
            """)) {
            ps.setString(1, creator.toString());
            ps.setString(2, creatorName);
            ps.setString(3, material.name());
            ps.setInt(4, amount);
            ps.setInt(5, amount);
            ps.setDouble(6, pricePerItem);
            ps.executeUpdate();
            return true;
        } catch (SQLException e) {
            plugin.getLogger().severe("Auftrag konnte nicht erstellt werden: " + e.getMessage());
            return false;
        }
    }

    /** Alle offenen Auftraege (hoechster Stueckpreis zuerst = lukrativste oben). */
    public List<Order> getOpenOrders() {
        List<Order> result = new ArrayList<>();
        try (PreparedStatement ps = connection().prepareStatement("""
                SELECT * FROM orders WHERE amount_remaining > 0
                ORDER BY price_per_item DESC, id;
            """)) {
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) {
                    readOrder(rs).ifPresent(result::add);
                }
            }
        } catch (SQLException e) {
            plugin.getLogger().severe("Auftraege konnten nicht geladen werden: " + e.getMessage());
        }
        return result;
    }

    /** Einzelner Auftrag per ID (nur falls noch offen). */
    public Optional<Order> getOrder(int id) {
        try (PreparedStatement ps = connection().prepareStatement(
                "SELECT * FROM orders WHERE id = ? AND amount_remaining > 0;")) {
            ps.setInt(1, id);
            try (ResultSet rs = ps.executeQuery()) {
                if (rs.next()) return readOrder(rs);
            }
        } catch (SQLException e) {
            plugin.getLogger().severe("Auftrag konnte nicht geladen werden: " + e.getMessage());
        }
        return Optional.empty();
    }

    /** Anzahl offener Auftraege eines Spielers. */
    public int countByCreator(UUID creator) {
        try (PreparedStatement ps = connection().prepareStatement(
                "SELECT COUNT(*) FROM orders WHERE creator_uuid = ? AND amount_remaining > 0;")) {
            ps.setString(1, creator.toString());
            try (ResultSet rs = ps.executeQuery()) {
                if (rs.next()) return rs.getInt(1);
            }
        } catch (SQLException e) {
            plugin.getLogger().severe("Auftraege konnten nicht gezaehlt werden: " + e.getMessage());
        }
        return 0;
    }

    /**
     * Reduziert die Restmenge eines Auftrags atomar.
     * Schlaegt fehl, wenn die Restmenge nicht mehr ausreicht
     * (z.B. weil ein anderer Spieler schneller geliefert hat).
     */
    public boolean reduceRemaining(int orderId, int amount) {
        try (PreparedStatement ps = connection().prepareStatement("""
                UPDATE orders SET amount_remaining = amount_remaining - ?
                WHERE id = ? AND amount_remaining >= ?;
            """)) {
            ps.setInt(1, amount);
            ps.setInt(2, orderId);
            ps.setInt(3, amount);
            return ps.executeUpdate() > 0;
        } catch (SQLException e) {
            plugin.getLogger().severe("Auftrag konnte nicht aktualisiert werden: " + e.getMessage());
            return false;
        }
    }

    /** Loescht einen Auftrag (nach Abschluss oder Abbruch). */
    public void deleteOrder(int id) {
        try (PreparedStatement ps = connection().prepareStatement(
                "DELETE FROM orders WHERE id = ?;")) {
            ps.setInt(1, id);
            ps.executeUpdate();
        } catch (SQLException e) {
            plugin.getLogger().severe("Auftrag konnte nicht geloescht werden: " + e.getMessage());
        }
    }

    // ----- Lieferfach -----

    /**
     * Schreibt gelieferte Items ins Lieferfach des Auftraggebers.
     * Gleiche Materialien werden zusammengefasst, damit die Tabelle klein bleibt.
     */
    public void addDelivery(UUID owner, Material material, int amount) {
        try (PreparedStatement ps = connection().prepareStatement("""
                UPDATE order_deliveries SET amount = amount + ?
                WHERE owner_uuid = ? AND material = ?;
            """)) {
            ps.setInt(1, amount);
            ps.setString(2, owner.toString());
            ps.setString(3, material.name());
            if (ps.executeUpdate() > 0) return;
        } catch (SQLException e) {
            plugin.getLogger().severe("Lieferung konnte nicht gespeichert werden: " + e.getMessage());
            return;
        }
        try (PreparedStatement ps = connection().prepareStatement(
                "INSERT INTO order_deliveries (owner_uuid, material, amount) VALUES (?, ?, ?);")) {
            ps.setString(1, owner.toString());
            ps.setString(2, material.name());
            ps.setInt(3, amount);
            ps.executeUpdate();
        } catch (SQLException e) {
            plugin.getLogger().severe("Lieferung konnte nicht gespeichert werden: " + e.getMessage());
        }
    }

    /** Alle abholbaren Lieferungen eines Spielers. */
    public List<Delivery> getDeliveries(UUID owner) {
        List<Delivery> result = new ArrayList<>();
        try (PreparedStatement ps = connection().prepareStatement(
                "SELECT id, material, amount FROM order_deliveries WHERE owner_uuid = ? ORDER BY id;")) {
            ps.setString(1, owner.toString());
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) {
                    Material mat = Material.matchMaterial(rs.getString("material"));
                    if (mat != null) {
                        result.add(new Delivery(rs.getInt("id"), mat, rs.getInt("amount")));
                    }
                }
            }
        } catch (SQLException e) {
            plugin.getLogger().severe("Lieferungen konnten nicht geladen werden: " + e.getMessage());
        }
        return result;
    }

    /** Entfernt eine komplett abgeholte Lieferung. */
    public void deleteDelivery(int id) {
        try (PreparedStatement ps = connection().prepareStatement(
                "DELETE FROM order_deliveries WHERE id = ?;")) {
            ps.setInt(1, id);
            ps.executeUpdate();
        } catch (SQLException e) {
            plugin.getLogger().severe("Lieferung konnte nicht geloescht werden: " + e.getMessage());
        }
    }

    /** Setzt die Restmenge einer teilweise abgeholten Lieferung. */
    public void updateDeliveryAmount(int id, int amount) {
        try (PreparedStatement ps = connection().prepareStatement(
                "UPDATE order_deliveries SET amount = ? WHERE id = ?;")) {
            ps.setInt(1, amount);
            ps.setInt(2, id);
            ps.executeUpdate();
        } catch (SQLException e) {
            plugin.getLogger().severe("Lieferung konnte nicht aktualisiert werden: " + e.getMessage());
        }
    }

    // ----- Konfiguration -----

    public int maxOrders() {
        return plugin.getConfigManager().getConfig().getInt("order.max-orders", 5);
    }

    public double minPricePerItem() {
        return plugin.getConfigManager().getConfig().getDouble("order.min-price-per-item", 0.01);
    }

    public int maxAmount() {
        return plugin.getConfigManager().getConfig().getInt("order.max-amount", 10000);
    }

    // ----- Hilfen -----

    private Optional<Order> readOrder(ResultSet rs) throws SQLException {
        Material mat = Material.matchMaterial(rs.getString("material"));
        if (mat == null) return Optional.empty();
        return Optional.of(new Order(
                rs.getInt("id"),
                UUID.fromString(rs.getString("creator_uuid")),
                rs.getString("creator_name"),
                mat,
                rs.getInt("amount_total"),
                rs.getInt("amount_remaining"),
                rs.getDouble("price_per_item")));
    }

    private Connection connection() {
        return plugin.getDatabase().getConnection();
    }
}
