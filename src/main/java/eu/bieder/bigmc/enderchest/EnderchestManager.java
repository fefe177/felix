package eu.bieder.bigmc.enderchest;

import eu.bieder.bigmc.BigMC;
import eu.bieder.bigmc.core.ItemSerializer;
import org.bukkit.inventory.Inventory;
import org.bukkit.inventory.ItemStack;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.Arrays;
import java.util.UUID;

/**
 * Virtuelle Enderchest: Inhalt wird in der DB gespeichert (Tabelle
 * "enderchests"), damit Premium-Spieler 54 statt 27 Slots haben koennen.
 */
public class EnderchestManager {

    private final BigMC plugin;

    public EnderchestManager(BigMC plugin) {
        this.plugin = plugin;
        createTable();
    }

    private void createTable() {
        try (Statement st = connection().createStatement()) {
            st.execute("""
                CREATE TABLE IF NOT EXISTS enderchests (
                    uuid     TEXT PRIMARY KEY,
                    contents BLOB
                );
            """);
        } catch (SQLException e) {
            plugin.getLogger().severe("Enderchest-Tabelle konnte nicht erstellt werden: " + e.getMessage());
        }
    }

    /** Laedt den gespeicherten Inhalt in ein Inventar passender Groesse. */
    public void load(UUID uuid, Inventory inventory) {
        byte[] data = null;
        try (PreparedStatement ps = connection().prepareStatement(
                "SELECT contents FROM enderchests WHERE uuid = ?;")) {
            ps.setString(1, uuid.toString());
            try (ResultSet rs = ps.executeQuery()) {
                if (rs.next()) data = rs.getBytes("contents");
            }
        } catch (SQLException e) {
            plugin.getLogger().severe("Enderchest konnte nicht geladen werden: " + e.getMessage());
        }
        if (data == null || data.length == 0) return;

        try {
            ItemStack[] stored = ItemSerializer.fromBytes(data);
            // Nur so viele Slots uebernehmen, wie das aktuelle Inventar bietet
            int size = inventory.getSize();
            ItemStack[] contents = Arrays.copyOf(stored, size);
            inventory.setContents(contents);
            // Items, die wegen kleinerer Groesse abgeschnitten wurden, gehen NICHT
            // verloren: sie bleiben in der DB, bis wieder genug Platz da ist.
            if (stored.length > size) {
                plugin.getLogger().info("Enderchest von " + uuid + " hat mehr Items als Slots - Rest bleibt gespeichert.");
            }
        } catch (Exception e) {
            plugin.getLogger().warning("Enderchest-Inhalt von " + uuid + " konnte nicht gelesen werden: " + e.getMessage());
        }
    }

    /** Speichert den Inhalt eines Inventars in die DB. */
    public void save(UUID uuid, Inventory inventory) {
        try {
            byte[] data = ItemSerializer.toBytes(inventory.getContents());
            try (PreparedStatement ps = connection().prepareStatement("""
                    INSERT INTO enderchests (uuid, contents) VALUES (?, ?)
                    ON CONFLICT(uuid) DO UPDATE SET contents = excluded.contents;
                """)) {
                ps.setString(1, uuid.toString());
                ps.setBytes(2, data);
                ps.executeUpdate();
            }
        } catch (Exception e) {
            plugin.getLogger().severe("Enderchest konnte nicht gespeichert werden: " + e.getMessage());
        }
    }

    private Connection connection() {
        return plugin.getDatabase().getConnection();
    }
}
