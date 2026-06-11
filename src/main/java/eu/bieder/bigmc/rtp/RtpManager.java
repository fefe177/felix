package eu.bieder.bigmc.rtp;

import eu.bieder.bigmc.BigMC;
import org.bukkit.Bukkit;
import org.bukkit.Location;
import org.bukkit.Material;
import org.bukkit.World;
import org.bukkit.block.Block;

import java.util.HashMap;
import java.util.Map;
import java.util.Random;
import java.util.UUID;

/**
 * Custom Random-Teleport (RTP).
 *
 * Teleportiert Spieler an eine zufaellige, SICHERE Position innerhalb einer
 * konfigurierbaren Area (Welt + Zentrum + Min-/Max-Radius). Gefaehrliche
 * Landeplaetze (Lava, Wasser, Kaktus, Void ...) werden uebersprungen.
 * Cooldown und optionale Kosten kommen aus der config.
 */
public class RtpManager {

    /** Bloecke, auf denen niemand landen sollte. */
    private static final java.util.Set<Material> UNSAFE_GROUND = java.util.Set.of(
            Material.LAVA, Material.WATER, Material.MAGMA_BLOCK, Material.CACTUS,
            Material.POWDER_SNOW, Material.FIRE, Material.SOUL_FIRE,
            Material.POINTED_DRIPSTONE, Material.SWEET_BERRY_BUSH);

    private final BigMC plugin;
    private final Random random = new Random();

    /** Letzter RTP-Zeitpunkt pro Spieler (fuer den Cooldown). */
    private final Map<UUID, Long> lastUse = new HashMap<>();

    public RtpManager(BigMC plugin) {
        this.plugin = plugin;
    }

    // ----- Konfiguration -----

    public World getWorld() {
        String name = plugin.getConfigManager().getConfig().getString("rtp.world", "world");
        World world = Bukkit.getWorld(name);
        // Fallback: Hauptwelt
        if (world == null && !Bukkit.getWorlds().isEmpty()) {
            world = Bukkit.getWorlds().get(0);
        }
        return world;
    }

    public int getCooldownSeconds() {
        return plugin.getConfigManager().getConfig().getInt("rtp.cooldown-seconds", 60);
    }

    public double getCost() {
        return plugin.getConfigManager().getConfig().getDouble("rtp.cost", 0.0);
    }

    // ----- Cooldown -----

    /** Verbleibender Cooldown in Sekunden (0 = bereit). */
    public long getRemainingCooldown(UUID uuid) {
        Long last = lastUse.get(uuid);
        if (last == null) return 0;
        long elapsed = (System.currentTimeMillis() - last) / 1000L;
        return Math.max(0, getCooldownSeconds() - elapsed);
    }

    public void markUsed(UUID uuid) {
        lastUse.put(uuid, System.currentTimeMillis());
    }

    // ----- Zufalls-Position -----

    /**
     * Sucht eine sichere Zufallsposition in der RTP-Area.
     * @return null, wenn nach allen Versuchen keine gefunden wurde
     */
    public Location findSafeLocation() {
        World world = getWorld();
        if (world == null) return null;

        var cfg = plugin.getConfigManager().getConfig();
        int centerX = cfg.getInt("rtp.center-x", 0);
        int centerZ = cfg.getInt("rtp.center-z", 0);
        int minRadius = Math.max(0, cfg.getInt("rtp.min-radius", 500));
        int maxRadius = Math.max(minRadius + 1, cfg.getInt("rtp.max-radius", 5000));
        int attempts = Math.max(1, cfg.getInt("rtp.max-attempts", 25));

        for (int i = 0; i < attempts; i++) {
            // Zufaelliger Punkt im Ring zwischen min- und max-Radius
            double angle = random.nextDouble() * 2 * Math.PI;
            double distance = minRadius + random.nextDouble() * (maxRadius - minRadius);
            int x = centerX + (int) Math.round(Math.cos(angle) * distance);
            int z = centerZ + (int) Math.round(Math.sin(angle) * distance);

            Block ground = world.getHighestBlockAt(x, z);
            Material type = ground.getType();

            // Boden muss fest und ungefaehrlich sein
            if (!type.isSolid() || UNSAFE_GROUND.contains(type)) continue;
            if (ground.getY() <= world.getMinHeight() + 1) continue;
            // Im Nether landet getHighestBlockAt auf dem Dach -> Bedrock ueberspringen
            if (type == Material.BEDROCK) continue;

            return ground.getLocation().add(0.5, 1.0, 0.5);
        }
        return null;
    }
}
