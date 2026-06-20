package eu.bieder.bigmc.cosmetics;

import eu.bieder.bigmc.BigMC;
import org.bukkit.Bukkit;
import org.bukkit.Location;
import org.bukkit.Particle;
import org.bukkit.configuration.ConfigurationSection;
import org.bukkit.entity.Player;

import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.EnumMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Verwaltet Cosmetics (Partikel-Trails, Titel, Join-Nachrichten).
 *
 * Cosmetics werden aus der config geladen; die ausgeruesteten Cosmetics je
 * Spieler liegen im Arbeitsspeicher (ConcurrentHashMap, da beim Login bereits
 * im AsyncPreLogin-Thread vorgeladen) und werden async in SQLite gespiegelt.
 */
public class CosmeticsManager {

    private final BigMC plugin;

    /** Alle Cosmetics je Kategorie (id -> Cosmetic). */
    private final Map<CosmeticCategory, Map<String, Cosmetic>> cosmetics = new EnumMap<>(CosmeticCategory.class);

    /** Ausgeruestete Cosmetics: uuid -> (Kategorie -> id). */
    private final Map<UUID, Map<CosmeticCategory, String>> equipped = new ConcurrentHashMap<>();

    public CosmeticsManager(BigMC plugin) {
        this.plugin = plugin;
        createTable();
        loadCosmetics();
    }

    private void createTable() {
        plugin.getDatabaseExecutor().execute(conn -> {
            try (Statement st = conn.createStatement()) {
                st.execute("""
                    CREATE TABLE IF NOT EXISTS cosmetics (
                        uuid        TEXT NOT NULL,
                        category    TEXT NOT NULL,
                        cosmetic_id TEXT NOT NULL,
                        PRIMARY KEY (uuid, category)
                    );
                """);
            }
        });
    }

    public void loadCosmetics() {
        cosmetics.clear();
        for (CosmeticCategory cat : CosmeticCategory.values()) {
            Map<String, Cosmetic> map = new LinkedHashMap<>();
            ConfigurationSection sec = plugin.getConfigManager().getConfig()
                    .getConfigurationSection("cosmetics." + cat.configKey);
            if (sec != null) {
                for (String id : sec.getKeys(false)) {
                    ConfigurationSection c = sec.getConfigurationSection(id);
                    if (c == null) continue;
                    org.bukkit.Material icon = org.bukkit.Material.matchMaterial(c.getString("icon", "PAPER"));
                    if (icon == null) icon = org.bukkit.Material.PAPER;
                    map.put(id, new Cosmetic(id, cat, c.getString("display", id), icon, c.getString("value", "")));
                }
            }
            cosmetics.put(cat, map);
        }
        plugin.getLogger().info("Cosmetics geladen.");
    }

    public List<Cosmetic> getCosmetics(CosmeticCategory category) {
        return new ArrayList<>(cosmetics.getOrDefault(category, Map.of()).values());
    }

    public Optional<Cosmetic> getCosmetic(CosmeticCategory category, String id) {
        return Optional.ofNullable(cosmetics.getOrDefault(category, Map.of()).get(id));
    }

    public int getParticleUpdateTicks() {
        return Math.max(2, plugin.getConfigManager().getConfig().getInt("cosmetics.particle-update-ticks", 5));
    }

    // ----- Laden / Speichern -----

    /** Synchrones Vorladen im AsyncPreLogin-Thread (blockierend, daher dort erlaubt). */
    public void preload(UUID uuid) {
        Map<CosmeticCategory, String> map = plugin.getDatabaseExecutor().querySync(conn -> {
            Map<CosmeticCategory, String> result = new EnumMap<>(CosmeticCategory.class);
            try (PreparedStatement ps = conn.prepareStatement(
                    "SELECT category, cosmetic_id FROM cosmetics WHERE uuid = ?;")) {
                ps.setString(1, uuid.toString());
                try (ResultSet rs = ps.executeQuery()) {
                    while (rs.next()) {
                        try {
                            result.put(CosmeticCategory.valueOf(rs.getString("category")), rs.getString("cosmetic_id"));
                        } catch (IllegalArgumentException ignored) {
                        }
                    }
                }
            }
            return result;
        });
        equipped.put(uuid, map == null ? new EnumMap<>(CosmeticCategory.class) : map);
    }

    /** Asynchrones Laden (fuer bereits online befindliche Spieler nach /reload). */
    public void loadAsync(UUID uuid) {
        plugin.getDatabaseExecutor().query(conn -> {
            Map<CosmeticCategory, String> result = new EnumMap<>(CosmeticCategory.class);
            try (PreparedStatement ps = conn.prepareStatement(
                    "SELECT category, cosmetic_id FROM cosmetics WHERE uuid = ?;")) {
                ps.setString(1, uuid.toString());
                try (ResultSet rs = ps.executeQuery()) {
                    while (rs.next()) {
                        try {
                            result.put(CosmeticCategory.valueOf(rs.getString("category")), rs.getString("cosmetic_id"));
                        } catch (IllegalArgumentException ignored) {
                        }
                    }
                }
            }
            return result;
        }, map -> equipped.put(uuid, map == null ? new EnumMap<>(CosmeticCategory.class) : map));
    }

    public void unloadPlayer(UUID uuid) {
        equipped.remove(uuid);
    }

    public String getEquippedId(UUID uuid, CosmeticCategory category) {
        Map<CosmeticCategory, String> map = equipped.get(uuid);
        return map == null ? null : map.get(category);
    }

    /** Ruestet ein Cosmetic aus (id == null -> entfernen). */
    public void equip(UUID uuid, CosmeticCategory category, String id) {
        Map<CosmeticCategory, String> map = equipped.computeIfAbsent(uuid, k -> new EnumMap<>(CosmeticCategory.class));
        if (id == null) {
            map.remove(category);
            plugin.getDatabaseExecutor().execute(conn -> {
                try (PreparedStatement ps = conn.prepareStatement(
                        "DELETE FROM cosmetics WHERE uuid = ? AND category = ?;")) {
                    ps.setString(1, uuid.toString());
                    ps.setString(2, category.name());
                    ps.executeUpdate();
                }
            });
        } else {
            map.put(category, id);
            plugin.getDatabaseExecutor().execute(conn -> {
                try (PreparedStatement ps = conn.prepareStatement("""
                        INSERT INTO cosmetics (uuid, category, cosmetic_id) VALUES (?, ?, ?)
                        ON CONFLICT(uuid, category) DO UPDATE SET cosmetic_id = excluded.cosmetic_id;
                    """)) {
                    ps.setString(1, uuid.toString());
                    ps.setString(2, category.name());
                    ps.setString(3, id);
                    ps.executeUpdate();
                }
            });
        }
    }

    // ----- Effekt-Zugriffe -----

    /** Der ausgeruestete Chat-Titel (oder leer). */
    public String getEquippedTitle(UUID uuid) {
        String id = getEquippedId(uuid, CosmeticCategory.TITLE);
        if (id == null) return "";
        return getCosmetic(CosmeticCategory.TITLE, id).map(Cosmetic::value).orElse("");
    }

    /** Die ausgeruestete Join-Nachricht-Vorlage (oder null). */
    public String getEquippedJoinMessage(UUID uuid) {
        String id = getEquippedId(uuid, CosmeticCategory.JOIN_MESSAGE);
        if (id == null) return null;
        return getCosmetic(CosmeticCategory.JOIN_MESSAGE, id).map(Cosmetic::value).orElse(null);
    }

    /** Spawnt den ausgeruesteten Partikel-Trail aller Spieler (vom Task aufgerufen). */
    public void spawnParticles() {
        for (Player player : Bukkit.getOnlinePlayers()) {
            String id = getEquippedId(player.getUniqueId(), CosmeticCategory.PARTICLE);
            if (id == null) continue;
            Cosmetic cosmetic = getCosmetic(CosmeticCategory.PARTICLE, id).orElse(null);
            if (cosmetic == null) continue;
            try {
                Particle particle = Particle.valueOf(cosmetic.value().toUpperCase());
                Location loc = player.getLocation().add(0, 0.2, 0);
                player.getWorld().spawnParticle(particle, loc, 6, 0.3, 0.2, 0.3, 0.0);
            } catch (IllegalArgumentException ignored) {
                // unbekannter Partikel -> ueberspringen
            }
        }
    }
}
