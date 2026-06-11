package eu.bieder.bigmc.spawn;

import eu.bieder.bigmc.BigMC;
import org.bukkit.Location;
import org.bukkit.Material;
import org.bukkit.World;
import org.bukkit.block.Block;

/**
 * Baut eine komplette Spawn-Area direkt in die Welt (prozedural):
 *
 * - runder Platz mit Schachbrett-Boden und Akzent-Ringen
 * - Aussenmauer mit Laternen, unterbrochen von 4 Wegen (N/O/S/W)
 * - Leucht-Saeule als Mittelpunkt
 * - 4 Laternenpfosten auf den Diagonalen
 * - Fundament unter dem Platz, freigeraeumter Luftraum darueber
 *
 * Nach dem Bau werden Spawnpunkt und Schutzzone automatisch gesetzt.
 * ACHTUNG: ueberschreibt vorhandene Bloecke im Baubereich (kein Undo)!
 */
public class SpawnAreaBuilder {

    /** Radius des Platzes (Bloecke vom Zentrum). */
    public static final int RADIUS = 15;

    /** Hoehe des freigeraeumten Luftraums ueber dem Boden. */
    private static final int CLEAR_HEIGHT = 8;

    private final BigMC plugin;

    public SpawnAreaBuilder(BigMC plugin) {
        this.plugin = plugin;
    }

    /**
     * Baut die Spawn-Area um die angegebene Position (Bodenhoehe = Fuesse).
     */
    public void build(Location center) {
        World world = center.getWorld();
        int cx = center.getBlockX();
        int cy = center.getBlockY();
        int cz = center.getBlockZ();

        for (int dx = -RADIUS - 1; dx <= RADIUS + 1; dx++) {
            for (int dz = -RADIUS - 1; dz <= RADIUS + 1; dz++) {
                double dist = Math.sqrt(dx * dx + (double) dz * dz);
                if (dist > RADIUS + 1) continue;

                int x = cx + dx;
                int z = cz + dz;

                // 1. Fundament (3 Schichten unter dem Boden, gegen "schwebenden" Platz)
                for (int dy = 2; dy <= 4; dy++) {
                    world.getBlockAt(x, cy - dy, z).setType(Material.STONE_BRICKS);
                }

                // 2. Boden
                world.getBlockAt(x, cy - 1, z).setType(floorMaterial(dx, dz, dist));

                // 3. Luftraum freiraeumen
                for (int dy = 0; dy < CLEAR_HEIGHT; dy++) {
                    world.getBlockAt(x, cy + dy, z).setType(Material.AIR);
                }

                // 4. Aussenmauer mit Laternen (Wege bleiben offen)
                if (Math.round(dist) == RADIUS && !isPath(dx, dz)) {
                    Block wall = world.getBlockAt(x, cy, z);
                    wall.setType(Material.STONE_BRICK_WALL);
                    // alle paar Bloecke eine Laterne auf die Mauer
                    if ((dx + dz) % 4 == 0) {
                        world.getBlockAt(x, cy + 1, z).setType(Material.LANTERN);
                    }
                }
            }
        }

        buildCenterPillar(world, cx, cy, cz);
        buildLampPosts(world, cx, cy, cz);

        // Spawnpunkt + Schutzzone automatisch setzen
        Location spawn = new Location(world, cx + 0.5, cy, cz + 0.5,
                center.getYaw(), center.getPitch());
        plugin.getSpawnManager().setSpawn(spawn);
        plugin.getConfigManager().getConfig().set("spawn.protection-radius", RADIUS + 5);
        plugin.saveConfig();
    }

    /** Bodenmaterial je nach Position (Muster + Akzent-Ringe + Wege). */
    private Material floorMaterial(int dx, int dz, double dist) {
        // Wege in alle 4 Richtungen (3 Bloecke breit, ausserhalb des Zentrums)
        if (isPath(dx, dz) && dist > 3) {
            return Material.POLISHED_DIORITE;
        }
        // Zentrum: Quarz-Plateau
        if (dist <= 2.5) {
            return Material.SMOOTH_QUARTZ;
        }
        // Akzent-Ringe
        if (Math.round(dist) == 3 || Math.round(dist) == RADIUS - 1) {
            return Material.POLISHED_DEEPSLATE;
        }
        // Schachbrett-Muster
        return (dx + dz) % 2 == 0 ? Material.POLISHED_ANDESITE : Material.STONE_BRICKS;
    }

    /** Liegt die Position auf einem der 4 Wege (N/O/S/W)? */
    private boolean isPath(int dx, int dz) {
        return Math.abs(dx) <= 1 || Math.abs(dz) <= 1;
    }

    /** Leucht-Saeule in der Mitte des Platzes. */
    private void buildCenterPillar(World world, int cx, int cy, int cz) {
        // 3x3 Sockel aus poliertem Deepslate
        for (int dx = -1; dx <= 1; dx++) {
            for (int dz = -1; dz <= 1; dz++) {
                world.getBlockAt(cx + dx, cy, cz + dz).setType(Material.POLISHED_DEEPSLATE);
            }
        }
        // Quarz-Saeule mit Seelaterne als Spitze
        for (int dy = 1; dy <= 3; dy++) {
            world.getBlockAt(cx, cy + dy, cz).setType(Material.QUARTZ_PILLAR);
        }
        world.getBlockAt(cx, cy + 4, cz).setType(Material.SEA_LANTERN);
    }

    /** 4 Laternenpfosten auf den Diagonalen. */
    private void buildLampPosts(World world, int cx, int cy, int cz) {
        int offset = (int) Math.round((RADIUS - 4) / Math.sqrt(2));
        int[][] positions = {
                {offset, offset}, {offset, -offset},
                {-offset, offset}, {-offset, -offset}
        };
        for (int[] pos : positions) {
            int x = cx + pos[0];
            int z = cz + pos[1];
            world.getBlockAt(x, cy - 1, z).setType(Material.POLISHED_DEEPSLATE);
            for (int dy = 0; dy <= 2; dy++) {
                world.getBlockAt(x, cy + dy, z).setType(Material.SPRUCE_FENCE);
            }
            world.getBlockAt(x, cy + 3, z).setType(Material.LANTERN);
        }
    }
}
