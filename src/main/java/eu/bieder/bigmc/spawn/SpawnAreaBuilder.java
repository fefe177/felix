package eu.bieder.bigmc.spawn;

import eu.bieder.bigmc.BigMC;
import org.bukkit.Location;
import org.bukkit.Material;
import org.bukkit.World;
import org.bukkit.block.Block;
import org.bukkit.block.data.BlockData;

/**
 * Baut prozedural einen detaillierten MITTELALTERLICHEN MARKTPLATZ in die Welt.
 *
 * Enthaelt:
 * - runde Kopfsteinpflaster-Plaza mit Wegen und Akzentringen
 * - Brunnen mit Wasser und Laterne im Zentrum
 * - 4 Fachwerkhaeuser (Eichenbalken + Putz, Walmdach, Tuer, Fenster, Inneneinrichtung)
 * - 4 ueberdachte Marktstaende (Theke, Fass, Heuballen, haengende Laterne)
 * - Lampenpfosten rund um den Brunnen
 * - Stadtmauer mit 4 Toren (N/O/S/W)
 *
 * Nach dem Bau werden Spawnpunkt + Schutzzone automatisch gesetzt.
 * ACHTUNG: ueberschreibt vorhandene Bloecke im Baubereich (kein Undo)!
 */
public class SpawnAreaBuilder {

    /** Radius der Plaza/Stadtmauer (Bloecke vom Zentrum). */
    public static final int RADIUS = 24;

    /** Schutzzonen-Radius, der gesetzt wird. */
    public static final int PROTECTION = RADIUS + 6;

    /** Hoehe des freigeraeumten Luftraums ueber dem Boden. */
    private static final int CLEAR_HEIGHT = 16;

    private final BigMC plugin;
    private World world;
    private int cx, cy, cz;

    public SpawnAreaBuilder(BigMC plugin) {
        this.plugin = plugin;
    }

    /** Baut den Marktplatz um die angegebene Position (Bodenhoehe = Fuesse). */
    public void build(Location center) {
        this.world = center.getWorld();
        this.cx = center.getBlockX();
        this.cy = center.getBlockY();
        this.cz = center.getBlockZ();

        buildPlazaAndGround();
        buildOuterWall();
        buildFountain();
        buildLampPosts();

        // 4 Fachwerkhaeuser in den Diagonalen, Tuer zum Zentrum gerichtet
        buildHouse(cx - 11, cz - 11, 3, Material.SPRUCE_STAIRS, Material.SPRUCE_PLANKS, "east");
        buildHouse(cx + 11, cz - 11, 3, Material.DARK_OAK_STAIRS, Material.DARK_OAK_PLANKS, "west");
        buildHouse(cx - 11, cz + 11, 3, Material.DARK_OAK_STAIRS, Material.DARK_OAK_PLANKS, "east");
        buildHouse(cx + 11, cz + 11, 3, Material.SPRUCE_STAIRS, Material.SPRUCE_PLANKS, "west");

        // 4 Marktstaende, jeweils vor einem Haus
        buildStall(cx - 6, cz - 6, Material.RED_WOOL);
        buildStall(cx + 6, cz - 6, Material.YELLOW_WOOL);
        buildStall(cx - 6, cz + 6, Material.BLUE_WOOL);
        buildStall(cx + 6, cz + 6, Material.GREEN_WOOL);

        // Spawnpunkt + Schutzzone setzen
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

                int x = cx + dx;
                int z = cz + dz;

                // Fundament (gegen schwebende Plaza)
                for (int dy = 2; dy <= 4; dy++) {
                    set(x, cy - dy, z, Material.COBBLESTONE);
                }
                // Bodenbelag
                set(x, cy - 1, z, floorMaterial(dx, dz, dist));
                // Luftraum freiraeumen
                for (int dy = 0; dy < CLEAR_HEIGHT; dy++) {
                    set(x, cy + dy, z, Material.AIR);
                }
            }
        }
    }

    /** Bodenmaterial je nach Position (Wege, Ringe, Kopfsteinmuster). */
    private Material floorMaterial(int dx, int dz, double dist) {
        // Wege in alle 4 Richtungen (3 breit)
        if ((Math.abs(dx) <= 1 || Math.abs(dz) <= 1) && dist > 4) {
            return ((dx + dz) % 2 == 0) ? Material.COBBLESTONE : Material.GRAVEL;
        }
        // Akzentringe
        long ring = Math.round(dist);
        if (ring == 5 || ring == RADIUS - 1) {
            return Material.STONE_BRICKS;
        }
        // Kopfsteinpflaster-Muster (deterministisch "zufaellig")
        int h = Math.floorMod(dx * 73 + dz * 19, 5);
        if (h == 0) return Material.MOSSY_COBBLESTONE;
        if (h == 1) return Material.STONE_BRICKS;
        return Material.COBBLESTONE;
    }

    // ----- Stadtmauer mit Toren -----

    private void buildOuterWall() {
        for (int dx = -RADIUS; dx <= RADIUS; dx++) {
            for (int dz = -RADIUS; dz <= RADIUS; dz++) {
                if (Math.round(Math.sqrt(dx * dx + (double) dz * dz)) != RADIUS) continue;
                // Tore (5 breit) in den 4 Himmelsrichtungen offen lassen
                if (Math.abs(dx) <= 2 || Math.abs(dz) <= 2) continue;

                int x = cx + dx;
                int z = cz + dz;
                set(x, cy, z, Material.STONE_BRICKS);
                setData(x, cy + 1, z, Material.STONE_BRICK_WALL);
                // alle paar Bloecke ein Pfeiler mit Laterne
                if (Math.floorMod(dx + dz, 6) == 0) {
                    set(x, cy + 1, z, Material.STONE_BRICKS);
                    set(x, cy + 2, z, Material.STONE_BRICKS);
                    set(x, cy + 3, z, Material.LANTERN);
                }
            }
        }
    }

    // ----- Brunnen -----

    private void buildFountain() {
        // 5x5 Becken aus Steinziegeln, innen Wasser
        for (int dx = -2; dx <= 2; dx++) {
            for (int dz = -2; dz <= 2; dz++) {
                boolean rim = Math.abs(dx) == 2 || Math.abs(dz) == 2;
                if (rim) {
                    set(cx + dx, cy, cz + dz, Material.STONE_BRICKS);
                    setData(cx + dx, cy + 1, cz + dz, Material.STONE_BRICK_WALL);
                } else {
                    set(cx + dx, cy, cz + dz, Material.WATER);
                }
            }
        }
        // Mittelsaeule mit Wasserquelle oben + Laterne als Kroenung
        set(cx, cy, cz, Material.CHISELED_STONE_BRICKS);
        set(cx, cy + 1, cz, Material.STONE_BRICK_WALL);
        set(cx, cy + 2, cz, Material.WATER);
        set(cx, cy + 3, cz, Material.SEA_LANTERN);
    }

    // ----- Lampenpfosten -----

    private void buildLampPosts() {
        int[][] pos = {{4, 4}, {4, -4}, {-4, 4}, {-4, -4}};
        for (int[] p : pos) {
            int x = cx + p[0];
            int z = cz + p[1];
            set(x, cy - 1, z, Material.STONE_BRICKS);
            for (int dy = 0; dy <= 2; dy++) {
                setData(x, cy + dy, z, Material.COBBLESTONE_WALL);
            }
            set(x, cy + 3, z, Material.LANTERN);
        }
    }

    // ----- Fachwerkhaus -----

    /**
     * Baut ein Fachwerkhaus mit Walmdach.
     * @param ccx,ccz   Mittelpunkt des Hauses
     * @param half      halbe Grundflaeche (3 -> 7x7)
     * @param roofStair Treppen-Material des Dachs
     * @param roofFill  Fuell-Material des Dachfirsts
     * @param doorFacing Richtung, in die die Tuer zeigt
     */
    private void buildHouse(int ccx, int ccz, int half, Material roofStair,
                            Material roofFill, String doorFacing) {
        int x0 = ccx - half, x1 = ccx + half;
        int z0 = ccz - half, z1 = ccz + half;
        int wallH = 4;

        // Boden + Innenraum freiraeumen
        for (int x = x0; x <= x1; x++) {
            for (int z = z0; z <= z1; z++) {
                set(x, cy - 1, z, Material.SPRUCE_PLANKS);
                for (int dy = 0; dy < wallH + half + 2; dy++) {
                    set(x, cy + dy, z, Material.AIR);
                }
            }
        }

        // Waende
        for (int y = 0; y < wallH; y++) {
            for (int x = x0; x <= x1; x++) {
                for (int z = z0; z <= z1; z++) {
                    boolean edge = (x == x0 || x == x1 || z == z0 || z == z1);
                    if (!edge) continue;
                    boolean corner = (x == x0 || x == x1) && (z == z0 || z == z1);
                    if (corner) {
                        set(x, cy + y, z, Material.DARK_OAK_LOG); // Eckbalken
                    } else if (y == wallH - 1) {
                        set(x, cy + y, z, Material.DARK_OAK_LOG); // oberer Querbalken
                    } else {
                        set(x, cy + y, z, Material.WHITE_TERRACOTTA); // Putzfuellung
                    }
                }
            }
        }

        // Fenster (Glasscheiben) mittig in jeder Wand auf Hoehe 1-2
        for (int y = 1; y <= 2; y++) {
            setData(ccx, cy + y, z0, Material.GLASS_PANE);
            setData(ccx, cy + y, z1, Material.GLASS_PANE);
            setData(x0, cy + y, ccz, Material.GLASS_PANE);
            setData(x1, cy + y, ccz, Material.GLASS_PANE);
        }

        // Tuer (zum Zentrum gerichtet)
        placeDoor(ccx, ccz, x0, x1, z0, z1, doorFacing);

        // Walmdach
        buildHipRoof(x0, x1, z0, z1, cy + wallH, roofStair, roofFill);

        // Inneneinrichtung: Laterne, Fass, Werkbank
        set(x0 + 1, cy, z0 + 1, Material.BARREL);
        set(x1 - 1, cy, z0 + 1, Material.CRAFTING_TABLE);
        set(x0 + 1, cy + wallH - 1, ccz, Material.LANTERN); // an der Wand
        set(ccx, cy + 2, ccz, Material.AIR);
    }

    /** Setzt eine zweiteilige Tuer in die Wand, passend zur Blickrichtung. */
    private void placeDoor(int ccx, int ccz, int x0, int x1, int z0, int z1, String facing) {
        int dx = ccx, dz = ccz;
        switch (facing) {
            case "east" -> dx = x1;   // Tuer in der Ostwand
            case "west" -> dx = x0;   // Westwand
            case "north" -> dz = z0;  // Nordwand
            case "south" -> dz = z1;  // Suedwand
        }
        Material door = Material.SPRUCE_DOOR;
        setData(dx, cy, dz, door, "[facing=" + facing + ",half=lower,hinge=left]");
        setData(dx, cy + 1, dz, door, "[facing=" + facing + ",half=upper,hinge=left]");
    }

    /**
     * Baut ein Walmdach aus Treppen (mit 1 Block Dachueberstand).
     */
    private void buildHipRoof(int x0, int x1, int z0, int z1, int baseY,
                              Material stair, Material fill) {
        int rx0 = x0 - 1, rx1 = x1 + 1;
        int rz0 = z0 - 1, rz1 = z1 + 1;
        int level = 0;

        while (rx0 <= rx1 && rz0 <= rz1) {
            int y = baseY + level;
            for (int x = rx0; x <= rx1; x++) {
                for (int z = rz0; z <= rz1; z++) {
                    boolean edge = (x == rx0 || x == rx1 || z == rz0 || z == rz1);
                    if (!edge) continue;

                    // First erreicht? -> mit Vollblock auffuellen
                    if (rx0 == rx1 || rz0 == rz1) {
                        set(x, y, z, fill);
                        continue;
                    }
                    boolean cornerX = (x == rx0 || x == rx1);
                    boolean cornerZ = (z == rz0 || z == rz1);
                    if (cornerX && cornerZ) {
                        set(x, y, z, fill); // Dachecke
                    } else if (x == rx0) {
                        setData(x, y, z, stair, "[facing=west,half=bottom]");
                    } else if (x == rx1) {
                        setData(x, y, z, stair, "[facing=east,half=bottom]");
                    } else if (z == rz0) {
                        setData(x, y, z, stair, "[facing=north,half=bottom]");
                    } else {
                        setData(x, y, z, stair, "[facing=south,half=bottom]");
                    }
                }
            }
            rx0++; rx1--; rz0++; rz1--; level++;
        }
    }

    // ----- Marktstand -----

    private void buildStall(int ccx, int ccz, Material wool) {
        // 4 Eckpfosten (Zaun) 2 hoch
        int[][] corners = {{-1, -1}, {-1, 1}, {1, -1}, {1, 1}};
        for (int[] c : corners) {
            int x = ccx + c[0];
            int z = ccz + c[1];
            for (int dy = 0; dy <= 1; dy++) {
                setData(x, cy + dy, z, Material.OAK_FENCE);
            }
        }
        // Markise (3x3 Wolle) auf Hoehe 2
        for (int dx = -1; dx <= 1; dx++) {
            for (int dz = -1; dz <= 1; dz++) {
                set(ccx + dx, cy + 2, ccz + dz, wool);
            }
        }
        // Theke (Fass + Slabs) auf einer Seite
        set(ccx - 1, cy, ccz, Material.BARREL);
        set(ccx + 1, cy, ccz, Material.BARREL);
        setData(ccx, cy, ccz - 1, Material.SMOOTH_STONE_SLAB);
        // Deko: Heuballen + haengende Laterne
        set(ccx + 1, cy, ccz + 1, Material.HAY_BLOCK);
        setData(ccx, cy + 1, ccz, Material.LANTERN, "[hanging=true]");
    }

    // ----- Block-Helfer (ohne Physik = schneller) -----

    private void set(int x, int y, int z, Material material) {
        world.getBlockAt(x, y, z).setType(material, false);
    }

    /** Setzt einen Block mit Standard-BlockData (z.B. Wall verbindet sich automatisch). */
    private void setData(int x, int y, int z, Material material) {
        world.getBlockAt(x, y, z).setType(material, false);
    }

    /** Setzt einen Block mit konkreten BlockData-Zustaenden (Treppen, Tueren ...). */
    private void setData(int x, int y, int z, Material material, String states) {
        Block block = world.getBlockAt(x, y, z);
        try {
            BlockData data = material.createBlockData(states);
            block.setBlockData(data, false);
        } catch (IllegalArgumentException e) {
            // Falls ein Zustand fuer das Material nicht passt: einfach normal setzen
            block.setType(material, false);
        }
    }
}
