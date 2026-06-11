package eu.bieder.bigmc.spawn;

import eu.bieder.bigmc.BigMC;
import org.bukkit.Location;
import org.bukkit.Material;
import org.bukkit.World;
import org.bukkit.block.Block;
import org.bukkit.block.data.BlockData;

/**
 * Baut prozedural eine detaillierte Spawn-Area in die Welt - das konkrete
 * Aussehen kommt aus einem {@link SpawnTheme} (5 verschiedene Designs).
 *
 * Layout (fuer alle Themes gleich):
 * - runde Plaza mit Wegen + Akzentringen
 * - Mittelpunkt-Brunnen (Wasser/Lava/fester Block je Theme) mit Leuchtspitze
 * - 4 Haeuser mit Fachwerk-Look + Walmdach, Tuer, Fenstern, Inneneinrichtung
 * - 4 ueberdachte Marktstaende
 * - Lampenpfosten + Stadtmauer mit 4 Toren
 *
 * Nach dem Bau werden Spawnpunkt + Schutzzone automatisch gesetzt.
 * ACHTUNG: ueberschreibt vorhandene Bloecke (kein Undo)!
 */
public class SpawnAreaBuilder {

    public static final int RADIUS = 24;
    public static final int PROTECTION = RADIUS + 6;
    private static final int CLEAR_HEIGHT = 16;

    private final BigMC plugin;
    private SpawnTheme t;
    private World world;
    private int cx, cy, cz;

    public SpawnAreaBuilder(BigMC plugin) {
        this.plugin = plugin;
    }

    /** Baut die Spawn-Area mit dem gewaehlten Theme um die Position. */
    public void build(Location center, SpawnTheme theme) {
        this.t = theme;
        this.world = center.getWorld();
        this.cx = center.getBlockX();
        this.cy = center.getBlockY();
        this.cz = center.getBlockZ();

        buildPlazaAndGround();
        buildOuterWall();
        buildFountain();
        buildLampPosts();

        buildHouse(cx - 11, cz - 11, 3, "east");
        buildHouse(cx + 11, cz - 11, 3, "west");
        buildHouse(cx - 11, cz + 11, 3, "east");
        buildHouse(cx + 11, cz + 11, 3, "west");

        buildStall(cx - 6, cz - 6, t.stall1);
        buildStall(cx + 6, cz - 6, t.stall2);
        buildStall(cx - 6, cz + 6, t.stall3);
        buildStall(cx + 6, cz + 6, t.stall4);

        Location spawn = new Location(world, cx + 0.5, cy, cz + 5.5, 180f, 0f);
        plugin.getSpawnManager().setSpawn(spawn);
        plugin.getConfigManager().getConfig().set("spawn.protection-radius", PROTECTION);
        plugin.saveConfig();
    }

    // ----- Plaza / Boden -----

    private void buildPlazaAndGround() {
        for (int dx = -RADIUS; dx <= RADIUS; dx++) {
            for (int dz = -RADIUS; dz <= RADIUS; dz++) {
                double dist = Math.sqrt(dx * dx + (double) dz * dz);
                if (dist > RADIUS) continue;
                int x = cx + dx, z = cz + dz;

                for (int dy = 2; dy <= 4; dy++) set(x, cy - dy, z, t.foundation);
                set(x, cy - 1, z, floorMaterial(dx, dz, dist));
                for (int dy = 0; dy < CLEAR_HEIGHT; dy++) set(x, cy + dy, z, Material.AIR);
            }
        }
    }

    private Material floorMaterial(int dx, int dz, double dist) {
        if ((Math.abs(dx) <= 1 || Math.abs(dz) <= 1) && dist > 4) {
            return ((dx + dz) % 2 == 0) ? t.pathA : t.pathB;
        }
        long ring = Math.round(dist);
        if (ring == 5 || ring == RADIUS - 1) return t.ring;
        int h = Math.floorMod(dx * 73 + dz * 19, 5);
        if (h == 0) return t.floor2;
        if (h == 1) return t.floor3;
        return t.floor1;
    }

    // ----- Stadtmauer mit Toren -----

    private void buildOuterWall() {
        for (int dx = -RADIUS; dx <= RADIUS; dx++) {
            for (int dz = -RADIUS; dz <= RADIUS; dz++) {
                if (Math.round(Math.sqrt(dx * dx + (double) dz * dz)) != RADIUS) continue;
                if (Math.abs(dx) <= 2 || Math.abs(dz) <= 2) continue; // Tore offen lassen
                int x = cx + dx, z = cz + dz;

                set(x, cy, z, t.wallBase);
                set(x, cy + 1, z, t.wallTop);
                if (Math.floorMod(dx + dz, 6) == 0) {
                    set(x, cy + 1, z, t.wallPillar);
                    set(x, cy + 2, z, t.wallPillar);
                    set(x, cy + 3, z, t.light);
                }
            }
        }
    }

    // ----- Mittelpunkt (Brunnen) -----

    private void buildFountain() {
        Material pool = (t.liquid != null) ? t.liquid : t.floor3;
        for (int dx = -2; dx <= 2; dx++) {
            for (int dz = -2; dz <= 2; dz++) {
                boolean rim = Math.abs(dx) == 2 || Math.abs(dz) == 2;
                if (rim) {
                    set(cx + dx, cy, cz + dz, t.wallBase);
                    set(cx + dx, cy + 1, cz + dz, t.wallTop);
                } else {
                    set(cx + dx, cy, cz + dz, pool);
                }
            }
        }
        set(cx, cy, cz, t.wallPillar);
        set(cx, cy + 1, cz, t.wallTop);
        set(cx, cy + 2, cz, pool);
        set(cx, cy + 3, cz, t.centerTop);
    }

    // ----- Lampenpfosten -----

    private void buildLampPosts() {
        int[][] pos = {{4, 4}, {4, -4}, {-4, 4}, {-4, -4}};
        for (int[] p : pos) {
            int x = cx + p[0], z = cz + p[1];
            set(x, cy - 1, z, t.ring);
            for (int dy = 0; dy <= 2; dy++) set(x, cy + dy, z, t.lampPost);
            set(x, cy + 3, z, t.light);
        }
    }

    // ----- Haus -----

    private void buildHouse(int ccx, int ccz, int half, String doorFacing) {
        int x0 = ccx - half, x1 = ccx + half, z0 = ccz - half, z1 = ccz + half, wallH = 4;

        for (int x = x0; x <= x1; x++) {
            for (int z = z0; z <= z1; z++) {
                set(x, cy - 1, z, t.houseFloor);
                for (int dy = 0; dy < wallH + half + 2; dy++) set(x, cy + dy, z, Material.AIR);
            }
        }
        for (int y = 0; y < wallH; y++) {
            for (int x = x0; x <= x1; x++) {
                for (int z = z0; z <= z1; z++) {
                    boolean edge = (x == x0 || x == x1 || z == z0 || z == z1);
                    if (!edge) continue;
                    boolean corner = (x == x0 || x == x1) && (z == z0 || z == z1);
                    if (corner || y == wallH - 1) set(x, cy + y, z, t.houseBeam);
                    else set(x, cy + y, z, t.houseFill);
                }
            }
        }
        for (int y = 1; y <= 2; y++) {
            set(ccx, cy + y, z0, Material.GLASS_PANE);
            set(ccx, cy + y, z1, Material.GLASS_PANE);
            set(x0, cy + y, ccz, Material.GLASS_PANE);
            set(x1, cy + y, ccz, Material.GLASS_PANE);
        }
        placeDoor(ccx, ccz, x0, x1, z0, z1, doorFacing);
        buildHipRoof(x0, x1, z0, z1, cy + wallH);

        set(x0 + 1, cy, z0 + 1, Material.BARREL);
        set(x1 - 1, cy, z0 + 1, Material.CRAFTING_TABLE);
        set(x0 + 1, cy + wallH - 1, ccz, t.light);
    }

    private void placeDoor(int ccx, int ccz, int x0, int x1, int z0, int z1, String facing) {
        int dx = ccx, dz = ccz;
        switch (facing) {
            case "east" -> dx = x1;
            case "west" -> dx = x0;
            case "north" -> dz = z0;
            case "south" -> dz = z1;
        }
        setData(dx, cy, dz, t.door, "[facing=" + facing + ",half=lower,hinge=left]");
        setData(dx, cy + 1, dz, t.door, "[facing=" + facing + ",half=upper,hinge=left]");
    }

    private void buildHipRoof(int x0, int x1, int z0, int z1, int baseY) {
        int rx0 = x0 - 1, rx1 = x1 + 1, rz0 = z0 - 1, rz1 = z1 + 1, level = 0;
        while (rx0 <= rx1 && rz0 <= rz1) {
            int y = baseY + level;
            for (int x = rx0; x <= rx1; x++) {
                for (int z = rz0; z <= rz1; z++) {
                    boolean edge = (x == rx0 || x == rx1 || z == rz0 || z == rz1);
                    if (!edge) continue;
                    if (rx0 == rx1 || rz0 == rz1) { set(x, y, z, t.roofFill); continue; }
                    boolean cornerX = (x == rx0 || x == rx1), cornerZ = (z == rz0 || z == rz1);
                    if (cornerX && cornerZ) set(x, y, z, t.roofFill);
                    else if (x == rx0) setData(x, y, z, t.roofStair, "[facing=west,half=bottom]");
                    else if (x == rx1) setData(x, y, z, t.roofStair, "[facing=east,half=bottom]");
                    else if (z == rz0) setData(x, y, z, t.roofStair, "[facing=north,half=bottom]");
                    else setData(x, y, z, t.roofStair, "[facing=south,half=bottom]");
                }
            }
            rx0++; rx1--; rz0++; rz1--; level++;
        }
    }

    // ----- Marktstand -----

    private void buildStall(int ccx, int ccz, Material canopy) {
        int[][] corners = {{-1, -1}, {-1, 1}, {1, -1}, {1, 1}};
        for (int[] c : corners) {
            int x = ccx + c[0], z = ccz + c[1];
            for (int dy = 0; dy <= 1; dy++) set(x, cy + dy, z, Material.OAK_FENCE);
        }
        for (int dx = -1; dx <= 1; dx++) {
            for (int dz = -1; dz <= 1; dz++) set(ccx + dx, cy + 2, ccz + dz, canopy);
        }
        set(ccx - 1, cy, ccz, Material.BARREL);
        set(ccx + 1, cy, ccz, Material.BARREL);
        set(ccx, cy, ccz - 1, Material.SMOOTH_STONE_SLAB);
        set(ccx + 1, cy, ccz + 1, Material.HAY_BLOCK);
        setData(ccx, cy + 1, ccz, Material.LANTERN, "[hanging=true]");
    }

    // ----- Block-Helfer (ohne Physik = schneller) -----

    private void set(int x, int y, int z, Material material) {
        // Laub als "persistent" setzen, damit es nicht verrottet
        if (material.name().endsWith("_LEAVES")) {
            setData(x, y, z, material, "[persistent=true]");
            return;
        }
        world.getBlockAt(x, y, z).setType(material, false);
    }

    private void setData(int x, int y, int z, Material material, String states) {
        Block block = world.getBlockAt(x, y, z);
        try {
            BlockData data = material.createBlockData(states);
            block.setBlockData(data, false);
        } catch (IllegalArgumentException e) {
            block.setType(material, false);
        }
    }
}
