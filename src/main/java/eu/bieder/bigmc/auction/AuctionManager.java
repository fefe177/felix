package eu.bieder.bigmc.auction;

import eu.bieder.bigmc.BigMC;
import org.bukkit.inventory.ItemStack;

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
 * Verwaltet alle Auktionen in der SQLite-Datenbank.
 *
 * Scam-Sicherheit: Das Item wird beim Einstellen sofort aus dem Inventar
 * genommen, serialisiert und liegt ab dann NUR in der Datenbank. Geld und
 * Item wechseln ausschliesslich serverseitig den Besitzer - kein Trade-Fenster,
 * bei dem jemand im letzten Moment etwas austauschen koennte.
 *
 * Tabellen:
 * - auctions:        alle aktiven Angebote
 * - auction_pending: Items, die ein Spieler per /ah collect abholen muss
 *                    (abgelaufene/abgebrochene Auktionen, volles Inventar beim Kauf)
 */
public class AuctionManager {

    /** Ein aktives Angebot im Auktionshaus. */
    public record Listing(int id, UUID sellerUuid, String sellerName,
                          ItemStack item, double price, long expiresAt) {
    }

    /** Ein abholbares Item (per /ah collect). */
    public record PendingItem(int id, ItemStack item) {
    }

    private final BigMC plugin;

    public AuctionManager(BigMC plugin) {
        this.plugin = plugin;
        createTables();
    }

    private void createTables() {
        try (Statement st = connection().createStatement()) {
            st.execute("""
                CREATE TABLE IF NOT EXISTS auctions (
                    id          INTEGER PRIMARY KEY AUTOINCREMENT,
                    seller_uuid TEXT    NOT NULL,
                    seller_name TEXT    NOT NULL,
                    item        BLOB    NOT NULL,
                    price       REAL    NOT NULL,
                    expires_at  INTEGER NOT NULL
                );
            """);
            st.execute("""
                CREATE TABLE IF NOT EXISTS auction_pending (
                    id         INTEGER PRIMARY KEY AUTOINCREMENT,
                    owner_uuid TEXT NOT NULL,
                    item       BLOB NOT NULL
                );
            """);
        } catch (SQLException e) {
            plugin.getLogger().severe("Auktions-Tabellen konnten nicht erstellt werden: " + e.getMessage());
        }
    }

    // ----- Angebote erstellen / lesen -----

    /**
     * Stellt ein Item ins Auktionshaus ein.
     * Das Item muss vom Aufrufer bereits aus dem Inventar entfernt worden sein!
     */
    public boolean createListing(UUID sellerUuid, String sellerName, ItemStack item, double price) {
        long expiresAt = System.currentTimeMillis()
                + durationHours() * 60L * 60L * 1000L;
        try (PreparedStatement ps = connection().prepareStatement("""
                INSERT INTO auctions (seller_uuid, seller_name, item, price, expires_at)
                VALUES (?, ?, ?, ?, ?);
            """)) {
            ps.setString(1, sellerUuid.toString());
            ps.setString(2, sellerName);
            ps.setBytes(3, item.serializeAsBytes());
            ps.setDouble(4, price);
            ps.setLong(5, expiresAt);
            ps.executeUpdate();
            return true;
        } catch (SQLException e) {
            plugin.getLogger().severe("Auktion konnte nicht erstellt werden: " + e.getMessage());
            return false;
        }
    }

    /**
     * Liest eine Seite aktiver Angebote (neueste zuerst).
     */
    public List<Listing> getActiveListings(int offset, int limit) {
        List<Listing> result = new ArrayList<>();
        try (PreparedStatement ps = connection().prepareStatement("""
                SELECT id, seller_uuid, seller_name, item, price, expires_at
                FROM auctions WHERE expires_at > ?
                ORDER BY id DESC LIMIT ? OFFSET ?;
            """)) {
            ps.setLong(1, System.currentTimeMillis());
            ps.setInt(2, limit);
            ps.setInt(3, offset);
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) {
                    readListing(rs).ifPresent(result::add);
                }
            }
        } catch (SQLException e) {
            plugin.getLogger().severe("Auktionen konnten nicht geladen werden: " + e.getMessage());
        }
        return result;
    }

    /** Anzahl aller aktiven (nicht abgelaufenen) Angebote. */
    public int countActive() {
        try (PreparedStatement ps = connection().prepareStatement(
                "SELECT COUNT(*) FROM auctions WHERE expires_at > ?;")) {
            ps.setLong(1, System.currentTimeMillis());
            try (ResultSet rs = ps.executeQuery()) {
                if (rs.next()) return rs.getInt(1);
            }
        } catch (SQLException e) {
            plugin.getLogger().severe("Auktionen konnten nicht gezaehlt werden: " + e.getMessage());
        }
        return 0;
    }

    /** Anzahl aktiver Angebote eines bestimmten Verkaeufers. */
    public int countBySeller(UUID seller) {
        try (PreparedStatement ps = connection().prepareStatement(
                "SELECT COUNT(*) FROM auctions WHERE seller_uuid = ? AND expires_at > ?;")) {
            ps.setString(1, seller.toString());
            ps.setLong(2, System.currentTimeMillis());
            try (ResultSet rs = ps.executeQuery()) {
                if (rs.next()) return rs.getInt(1);
            }
        } catch (SQLException e) {
            plugin.getLogger().severe("Auktionen konnten nicht gezaehlt werden: " + e.getMessage());
        }
        return 0;
    }

    /** Alle aktiven Angebote eines Verkaeufers. */
    public List<Listing> getListingsBySeller(UUID seller) {
        List<Listing> result = new ArrayList<>();
        try (PreparedStatement ps = connection().prepareStatement("""
                SELECT id, seller_uuid, seller_name, item, price, expires_at
                FROM auctions WHERE seller_uuid = ? AND expires_at > ?
                ORDER BY id DESC;
            """)) {
            ps.setString(1, seller.toString());
            ps.setLong(2, System.currentTimeMillis());
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) {
                    readListing(rs).ifPresent(result::add);
                }
            }
        } catch (SQLException e) {
            plugin.getLogger().severe("Auktionen konnten nicht geladen werden: " + e.getMessage());
        }
        return result;
    }

    /** Einzelnes Angebot per ID (nur falls noch aktiv). */
    public Optional<Listing> getListing(int id) {
        try (PreparedStatement ps = connection().prepareStatement("""
                SELECT id, seller_uuid, seller_name, item, price, expires_at
                FROM auctions WHERE id = ? AND expires_at > ?;
            """)) {
            ps.setInt(1, id);
            ps.setLong(2, System.currentTimeMillis());
            try (ResultSet rs = ps.executeQuery()) {
                if (rs.next()) return readListing(rs);
            }
        } catch (SQLException e) {
            plugin.getLogger().severe("Auktion konnte nicht geladen werden: " + e.getMessage());
        }
        return Optional.empty();
    }

    /**
     * "Beansprucht" ein Angebot: loescht es atomar aus der Tabelle.
     * Liefert nur dann true, wenn genau diese Zeile noch existierte -
     * dadurch kann ein Angebot nie doppelt gekauft werden.
     */
    public boolean claimListing(int id) {
        try (PreparedStatement ps = connection().prepareStatement(
                "DELETE FROM auctions WHERE id = ?;")) {
            ps.setInt(1, id);
            return ps.executeUpdate() > 0;
        } catch (SQLException e) {
            plugin.getLogger().severe("Auktion konnte nicht beansprucht werden: " + e.getMessage());
            return false;
        }
    }

    /** Eine Auktion wieder einfuegen (Rollback, falls der Kauf doch scheitert). */
    public void restoreListing(Listing listing) {
        try (PreparedStatement ps = connection().prepareStatement("""
                INSERT INTO auctions (id, seller_uuid, seller_name, item, price, expires_at)
                VALUES (?, ?, ?, ?, ?, ?);
            """)) {
            ps.setInt(1, listing.id());
            ps.setString(2, listing.sellerUuid().toString());
            ps.setString(3, listing.sellerName());
            ps.setBytes(4, listing.item().serializeAsBytes());
            ps.setDouble(5, listing.price());
            ps.setLong(6, listing.expiresAt());
            ps.executeUpdate();
        } catch (SQLException e) {
            plugin.getLogger().severe("Auktion konnte nicht wiederhergestellt werden: " + e.getMessage());
        }
    }

    // ----- Abholfach (/ah collect) -----

    /** Legt ein Item ins Abholfach eines Spielers. */
    public void addPending(UUID owner, ItemStack item) {
        try (PreparedStatement ps = connection().prepareStatement(
                "INSERT INTO auction_pending (owner_uuid, item) VALUES (?, ?);")) {
            ps.setString(1, owner.toString());
            ps.setBytes(2, item.serializeAsBytes());
            ps.executeUpdate();
        } catch (SQLException e) {
            plugin.getLogger().severe("Abhol-Item konnte nicht gespeichert werden: " + e.getMessage());
        }
    }

    /** Alle abholbaren Items eines Spielers. */
    public List<PendingItem> getPending(UUID owner) {
        List<PendingItem> result = new ArrayList<>();
        try (PreparedStatement ps = connection().prepareStatement(
                "SELECT id, item FROM auction_pending WHERE owner_uuid = ? ORDER BY id;")) {
            ps.setString(1, owner.toString());
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) {
                    ItemStack item = deserialize(rs.getBytes("item"));
                    if (item != null) {
                        result.add(new PendingItem(rs.getInt("id"), item));
                    }
                }
            }
        } catch (SQLException e) {
            plugin.getLogger().severe("Abhol-Items konnten nicht geladen werden: " + e.getMessage());
        }
        return result;
    }

    /** Entfernt ein abgeholtes Item aus dem Abholfach. */
    public void deletePending(int id) {
        try (PreparedStatement ps = connection().prepareStatement(
                "DELETE FROM auction_pending WHERE id = ?;")) {
            ps.setInt(1, id);
            ps.executeUpdate();
        } catch (SQLException e) {
            plugin.getLogger().severe("Abhol-Item konnte nicht geloescht werden: " + e.getMessage());
        }
    }

    /** Aktualisiert ein teilweise abgeholtes Item (Reststack). */
    public void updatePending(int id, ItemStack rest) {
        try (PreparedStatement ps = connection().prepareStatement(
                "UPDATE auction_pending SET item = ? WHERE id = ?;")) {
            ps.setBytes(1, rest.serializeAsBytes());
            ps.setInt(2, id);
            ps.executeUpdate();
        } catch (SQLException e) {
            plugin.getLogger().severe("Abhol-Item konnte nicht aktualisiert werden: " + e.getMessage());
        }
    }

    // ----- Ablauf -----

    /**
     * Verschiebt alle abgelaufenen Auktionen ins Abholfach der Verkaeufer.
     * Wird regelmaessig vom Scheduler aufgerufen.
     *
     * @return Anzahl der abgelaufenen Auktionen
     */
    public int expireListings() {
        int expired = 0;
        long now = System.currentTimeMillis();
        try {
            // Erst alle abgelaufenen lesen ...
            List<Listing> old = new ArrayList<>();
            try (PreparedStatement ps = connection().prepareStatement("""
                    SELECT id, seller_uuid, seller_name, item, price, expires_at
                    FROM auctions WHERE expires_at <= ?;
                """)) {
                ps.setLong(1, now);
                try (ResultSet rs = ps.executeQuery()) {
                    while (rs.next()) {
                        readListing(rs).ifPresent(old::add);
                    }
                }
            }
            // ... dann einzeln beanspruchen und ins Abholfach legen
            for (Listing listing : old) {
                if (claimListing(listing.id())) {
                    addPending(listing.sellerUuid(), listing.item());
                    expired++;
                }
            }
        } catch (SQLException e) {
            plugin.getLogger().severe("Abgelaufene Auktionen konnten nicht verarbeitet werden: " + e.getMessage());
        }
        return expired;
    }

    // ----- Konfiguration -----

    public int durationHours() {
        return plugin.getConfigManager().getConfig().getInt("auction.duration-hours", 48);
    }

    public int maxListings() {
        return plugin.getConfigManager().getConfig().getInt("auction.max-listings", 7);
    }

    public double minPrice() {
        return plugin.getConfigManager().getConfig().getDouble("auction.min-price", 1.0);
    }

    public double maxPrice() {
        return plugin.getConfigManager().getConfig().getDouble("auction.max-price", 10_000_000.0);
    }

    // ----- Hilfen -----

    /** Liest eine Listing-Zeile aus dem ResultSet (ueberspringt kaputte Items). */
    private Optional<Listing> readListing(ResultSet rs) throws SQLException {
        ItemStack item = deserialize(rs.getBytes("item"));
        if (item == null) return Optional.empty();
        return Optional.of(new Listing(
                rs.getInt("id"),
                UUID.fromString(rs.getString("seller_uuid")),
                rs.getString("seller_name"),
                item,
                rs.getDouble("price"),
                rs.getLong("expires_at")));
    }

    private ItemStack deserialize(byte[] bytes) {
        try {
            return ItemStack.deserializeBytes(bytes);
        } catch (Exception e) {
            plugin.getLogger().warning("Ein gespeichertes Auktions-Item konnte nicht gelesen werden und wird uebersprungen.");
            return null;
        }
    }

    private Connection connection() {
        return plugin.getDatabase().getConnection();
    }

    /**
     * Formatiert eine Restzeit in Millisekunden lesbar, z.B. "1d 3h" oder "12m".
     */
    public static String formatRemaining(long millis) {
        if (millis <= 0) return "0m";
        long minutes = millis / 60000L;
        long days = minutes / (60 * 24);
        long hours = (minutes / 60) % 24;
        long mins = minutes % 60;
        StringBuilder sb = new StringBuilder();
        if (days > 0) sb.append(days).append("d ");
        if (hours > 0) sb.append(hours).append("h ");
        if (days == 0 && mins > 0) sb.append(mins).append("m");
        if (sb.isEmpty()) sb.append("<1m");
        return sb.toString().trim();
    }
}
