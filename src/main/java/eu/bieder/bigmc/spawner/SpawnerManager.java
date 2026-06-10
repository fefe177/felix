package eu.bieder.bigmc.spawner;

import eu.bieder.bigmc.BigMC;
import eu.bieder.bigmc.config.MessageManager;
import org.bukkit.Location;
import org.bukkit.Material;
import org.bukkit.NamespacedKey;
import org.bukkit.configuration.ConfigurationSection;
import org.bukkit.entity.EntityType;
import org.bukkit.entity.Player;
import org.bukkit.inventory.ItemStack;
import org.bukkit.inventory.meta.ItemMeta;
import org.bukkit.persistence.PersistentDataContainer;
import org.bukkit.persistence.PersistentDataType;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

/**
 * Verwaltet die Custom-Spawner:
 * - laedt die Spawner-Typen aus der config.yml
 * - erstellt die speziellen Spawner-Items (mit PDC-Markierung)
 * - speichert platzierte Spawner in SQLite
 * - produziert regelmaessig Items in den internen Speicher
 * - haendelt das Abholen der produzierten Items
 *
 * Die Items werden bewusst NICHT als echte Mob-Spawner genutzt; das Spawnen
 * von Mobs wird im SpawnerListener unterbunden.
 */
public class SpawnerManager {

    private final BigMC plugin;

    /** PDC-Schluessel auf dem Spawner-Item, der den Typ markiert. */
    private final NamespacedKey typeKey;

    /** Alle Spawner-Typen in Config-Reihenfolge. */
    private final Map<String, SpawnerType> types = new LinkedHashMap<>();

    public SpawnerManager(BigMC plugin) {
        this.plugin = plugin;
        this.typeKey = new NamespacedKey(plugin, "spawner_type");
        createTable();
        loadTypes();
    }

    private void createTable() {
        try (Statement st = connection().createStatement()) {
            st.execute("""
                CREATE TABLE IF NOT EXISTS spawners (
                    id           INTEGER PRIMARY KEY AUTOINCREMENT,
                    world        TEXT    NOT NULL,
                    x            INTEGER NOT NULL,
                    y            INTEGER NOT NULL,
                    z            INTEGER NOT NULL,
                    type_id      TEXT    NOT NULL,
                    stack_size   INTEGER NOT NULL DEFAULT 1,
                    stored       INTEGER NOT NULL DEFAULT 0,
                    last_produce INTEGER NOT NULL,
                    owner_uuid   TEXT    NOT NULL,
                    UNIQUE(world, x, y, z)
                );
            """);
        } catch (SQLException e) {
            plugin.getLogger().severe("Spawner-Tabelle konnte nicht erstellt werden: " + e.getMessage());
        }
    }

    /** Liest alle Spawner-Typen aus der config.yml. */
    public void loadTypes() {
        types.clear();
        ConfigurationSection root = plugin.getConfigManager().getConfig()
                .getConfigurationSection("spawners.types");
        if (root == null) {
            plugin.getLogger().warning("Keine Spawner-Typen in der config.yml gefunden (spawners.types).");
            return;
        }
        for (String id : root.getKeys(false)) {
            ConfigurationSection sec = root.getConfigurationSection(id);
            if (sec == null) continue;

            Material product = Material.matchMaterial(sec.getString("product", ""));
            if (product == null) {
                plugin.getLogger().warning("Spawner '" + id + "': unbekanntes product - uebersprungen.");
                continue;
            }
            EntityType display = null;
            String displayName = sec.getString("display-entity", "");
            if (displayName != null && !displayName.isEmpty()) {
                try {
                    display = EntityType.valueOf(displayName.toUpperCase());
                } catch (IllegalArgumentException ex) {
                    plugin.getLogger().warning("Spawner '" + id + "': unbekanntes display-entity '" + displayName + "'.");
                }
            }
            types.put(id, new SpawnerType(
                    id,
                    sec.getString("display-name", id),
                    product,
                    sec.getInt("amount-per-cycle", 1),
                    sec.getInt("interval-seconds", 60),
                    sec.getLong("max-storage-per-stack", 2000),
                    sec.getDouble("price", 10000),
                    display));
        }
        plugin.getLogger().info("Spawner-Typen geladen: " + types.size());
    }

    public List<SpawnerType> getTypes() {
        return List.copyOf(types.values());
    }

    public Optional<SpawnerType> getType(String id) {
        return Optional.ofNullable(types.get(id));
    }

    public int getMaxStack() {
        return plugin.getConfigManager().getConfig().getInt("spawners.max-stack", 500);
    }

    // ----- Spawner-Item erstellen / erkennen -----

    /**
     * Erstellt ein Spawner-Item fuer einen Typ (mit PDC-Markierung, Name, Lore).
     */
    public ItemStack createSpawnerItem(SpawnerType type, int amount) {
        ItemStack item = new ItemStack(Material.SPAWNER, Math.max(1, amount));
        ItemMeta meta = item.getItemMeta();
        if (meta != null) {
            meta.setDisplayName(MessageManager.color(type.displayName()));
            List<String> lore = new ArrayList<>();
            lore.add(MessageManager.color("&7Produziert: &e" + type.amountPerCycle() + "x "
                    + prettyMaterial(type.product())));
            lore.add(MessageManager.color("&7alle &e" + type.intervalSeconds() + "s"));
            lore.add(MessageManager.color("&7Platzieren & per Rechtsklick abholen."));
            lore.add(MessageManager.color("&7Stapelbar bis &e" + getMaxStack() + "&7."));
            meta.setLore(lore);
            meta.getPersistentDataContainer().set(typeKey, PersistentDataType.STRING, type.id());
            item.setItemMeta(meta);
        }
        return item;
    }

    /** Liest den Spawner-Typ aus einem Item (oder leer, wenn es keiner ist). */
    public Optional<SpawnerType> getTypeFromItem(ItemStack item) {
        if (item == null || item.getType() != Material.SPAWNER || !item.hasItemMeta()) {
            return Optional.empty();
        }
        PersistentDataContainer pdc = item.getItemMeta().getPersistentDataContainer();
        String id = pdc.get(typeKey, PersistentDataType.STRING);
        return id == null ? Optional.empty() : getType(id);
    }

    // ----- Platzierte Spawner (DB) -----

    /** Legt einen neuen platzierten Spawner an. */
    public void placeSpawner(Location loc, SpawnerType type, int stackSize, UUID owner) {
        try (PreparedStatement ps = connection().prepareStatement("""
                INSERT INTO spawners (world, x, y, z, type_id, stack_size, stored, last_produce, owner_uuid)
                VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?);
            """)) {
            ps.setString(1, loc.getWorld().getName());
            ps.setInt(2, loc.getBlockX());
            ps.setInt(3, loc.getBlockY());
            ps.setInt(4, loc.getBlockZ());
            ps.setString(5, type.id());
            ps.setInt(6, stackSize);
            ps.setLong(7, System.currentTimeMillis());
            ps.setString(8, owner.toString());
            ps.executeUpdate();
        } catch (SQLException e) {
            plugin.getLogger().severe("Spawner konnte nicht gespeichert werden: " + e.getMessage());
        }
    }

    public Optional<PlacedSpawner> getSpawnerAt(Location loc) {
        try (PreparedStatement ps = connection().prepareStatement(
                "SELECT * FROM spawners WHERE world = ? AND x = ? AND y = ? AND z = ?;")) {
            ps.setString(1, loc.getWorld().getName());
            ps.setInt(2, loc.getBlockX());
            ps.setInt(3, loc.getBlockY());
            ps.setInt(4, loc.getBlockZ());
            try (ResultSet rs = ps.executeQuery()) {
                if (rs.next()) return Optional.of(read(rs));
            }
        } catch (SQLException e) {
            plugin.getLogger().severe("Spawner konnte nicht geladen werden: " + e.getMessage());
        }
        return Optional.empty();
    }

    public Optional<PlacedSpawner> getSpawner(int id) {
        try (PreparedStatement ps = connection().prepareStatement(
                "SELECT * FROM spawners WHERE id = ?;")) {
            ps.setInt(1, id);
            try (ResultSet rs = ps.executeQuery()) {
                if (rs.next()) return Optional.of(read(rs));
            }
        } catch (SQLException e) {
            plugin.getLogger().severe("Spawner konnte nicht geladen werden: " + e.getMessage());
        }
        return Optional.empty();
    }

    /** Erhoeht die Stapelgroesse (z.B. beim Reinpacken weiterer Spawner). */
    public void setStackSize(int id, int stackSize) {
        update("UPDATE spawners SET stack_size = ? WHERE id = ?;", stackSize, id);
    }

    /** Setzt den gespeicherten Vorrat (nach dem Abholen). */
    public void setStored(int id, long stored) {
        try (PreparedStatement ps = connection().prepareStatement(
                "UPDATE spawners SET stored = ? WHERE id = ?;")) {
            ps.setLong(1, stored);
            ps.setInt(2, id);
            ps.executeUpdate();
        } catch (SQLException e) {
            plugin.getLogger().severe("Spawner-Vorrat konnte nicht gesetzt werden: " + e.getMessage());
        }
    }

    public void deleteSpawner(int id) {
        try (PreparedStatement ps = connection().prepareStatement(
                "DELETE FROM spawners WHERE id = ?;")) {
            ps.setInt(1, id);
            ps.executeUpdate();
        } catch (SQLException e) {
            plugin.getLogger().severe("Spawner konnte nicht geloescht werden: " + e.getMessage());
        }
    }

    // ----- Produktion -----

    /**
     * Produziert fuer alle platzierten Spawner die seit der letzten Produktion
     * angefallenen Items (gedeckelt auf den Speicher). Wird vom Scheduler
     * aufgerufen - laeuft auch fuer Spawner in nicht geladenen Chunks.
     */
    public void produceAll() {
        long now = System.currentTimeMillis();
        List<PlacedSpawner> all = new ArrayList<>();
        try (PreparedStatement ps = connection().prepareStatement("SELECT * FROM spawners;");
             ResultSet rs = ps.executeQuery()) {
            while (rs.next()) all.add(read(rs));
        } catch (SQLException e) {
            plugin.getLogger().severe("Spawner konnten nicht geladen werden: " + e.getMessage());
            return;
        }

        for (PlacedSpawner sp : all) {
            SpawnerType type = types.get(sp.typeId());
            if (type == null || type.intervalSeconds() <= 0) continue;

            long intervalMs = type.intervalSeconds() * 1000L;
            long cycles = (now - sp.lastProduce()) / intervalMs;
            if (cycles <= 0) continue;

            long cap = type.maxStoragePerStack() * (long) sp.stackSize();
            long produced = cycles * type.amountPerCycle() * (long) sp.stackSize();
            long newStored = Math.min(cap, sp.stored() + produced);
            long newLast = sp.lastProduce() + cycles * intervalMs;

            try (PreparedStatement ps = connection().prepareStatement(
                    "UPDATE spawners SET stored = ?, last_produce = ? WHERE id = ?;")) {
                ps.setLong(1, newStored);
                ps.setLong(2, newLast);
                ps.setInt(3, sp.id());
                ps.executeUpdate();
            } catch (SQLException e) {
                plugin.getLogger().severe("Spawner-Produktion fehlgeschlagen: " + e.getMessage());
            }
        }
    }

    // ----- Abholen -----

    /**
     * Holt so viele gespeicherte Items wie moeglich ins Inventar des Spielers.
     * @return tatsaechlich abgeholte Menge
     */
    public long collect(Player player, PlacedSpawner spawner) {
        SpawnerType type = types.get(spawner.typeId());
        if (type == null) return 0;

        long stored = spawner.stored();
        if (stored <= 0) return 0;

        long collected = giveItems(player, type.product(), stored);
        if (collected > 0) {
            setStored(spawner.id(), stored - collected);
        }
        return collected;
    }

    /**
     * Gibt bis zu "amount" Items eines Materials stapelweise ins Inventar.
     * @return wie viele tatsaechlich uebergeben wurden
     */
    private long giveItems(Player player, Material material, long amount) {
        long remaining = amount;
        int maxStack = material.getMaxStackSize();
        while (remaining > 0) {
            int chunk = (int) Math.min(remaining, maxStack);
            Map<Integer, ItemStack> leftover =
                    player.getInventory().addItem(new ItemStack(material, chunk));
            int notAdded = leftover.values().stream().mapToInt(ItemStack::getAmount).sum();
            int added = chunk - notAdded;
            remaining -= added;
            if (notAdded > 0) break; // Inventar voll
        }
        return amount - remaining;
    }

    // ----- Hilfen -----

    private PlacedSpawner read(ResultSet rs) throws SQLException {
        return new PlacedSpawner(
                rs.getInt("id"),
                rs.getString("world"),
                rs.getInt("x"), rs.getInt("y"), rs.getInt("z"),
                rs.getString("type_id"),
                rs.getInt("stack_size"),
                rs.getLong("stored"),
                rs.getLong("last_produce"),
                UUID.fromString(rs.getString("owner_uuid")));
    }

    private void update(String sql, int value, int id) {
        try (PreparedStatement ps = connection().prepareStatement(sql)) {
            ps.setInt(1, value);
            ps.setInt(2, id);
            ps.executeUpdate();
        } catch (SQLException e) {
            plugin.getLogger().severe("Spawner-Update fehlgeschlagen: " + e.getMessage());
        }
    }

    private Connection connection() {
        return plugin.getDatabase().getConnection();
    }

    /** Macht aus "BONE" den lesbaren Namen "Bone". */
    public static String prettyMaterial(Material material) {
        String[] parts = material.name().toLowerCase().split("_");
        StringBuilder sb = new StringBuilder();
        for (String p : parts) {
            if (!sb.isEmpty()) sb.append(' ');
            sb.append(Character.toUpperCase(p.charAt(0))).append(p.substring(1));
        }
        return sb.toString();
    }
}
