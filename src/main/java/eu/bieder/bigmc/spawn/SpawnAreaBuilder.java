package eu.bieder.bigmc.spawn;

import eu.bieder.bigmc.BigMC;
import eu.bieder.bigmc.config.MessageManager;
import org.bukkit.Location;
import org.bukkit.Material;
import org.bukkit.World;
import org.bukkit.block.Block;
import org.bukkit.block.data.BlockData;
import org.bukkit.entity.Player;
import org.bukkit.scheduler.BukkitRunnable;

import java.util.ArrayList;
import java.util.List;

/**
 * Baut prozedural eine grosse, detailreiche Spawn-Stadt - das konkrete Aussehen
 * kommt aus einem {@link SpawnTheme} (mehrere Designs, gleiche Architektur).
 *
 * Highlights:
 * - mehrstufiger Prunkbrunnen mit leuchtender Spitze + Beacon-Lichtstrahl
 * - 4 zweistoeckige Fachwerkhaeuser (Vordach, Schornstein, Laternen, Einrichtung)
 * - Stadtmauer mit Zinnen, 4 Ecktuermen und 4 grossen Torbogen
 * - breite, gepflasterte Wege mit Laternenpfosten + Haengelaternen
 * - Marktstaende, Baenke, Fahnenmasten, durchgehende Beleuchtung (mob-sicher)
 *
 * Gebaut wird in kleinen Haeppchen pro Tick (kein Server-Lag). Am Ende werden
 * Spawnpunkt + Schutzzone gesetzt und der Admin dorthin teleportiert.
 * ACHTUNG: ueberschreibt vorhandene Bloecke (kein Undo)!
 */
public class SpawnAreaBuilder {

    public static final int RADIUS = 30;
    public static final int PROTECTION = RADIUS + 8;
    private static final int CLEAR_HEIGHT = 26;
    private static final int BLOCKS_PER_TICK = 4500;

    /** Eine vorgemerkte Block-Platzierung (state == null -> einfacher Typ). */
    private record Op(int x, int y, int z, Material material, String state) {
    }

    private final BigMC plugin;
    private final List<Op> ops = new ArrayList<>();

    private SpawnTheme t;
    private World world;
    private int cx, cy, cz;

    public SpawnAreaBuilder(BigMC plugin) {
        this.plugin = plugin;
    }

    /** Plant und baut die Spawn-Stadt am Standort des Admins (tick-weise). */
    public void build(Player admin, SpawnTheme theme) {
        this.t = theme;
        Location center = admin.getLocation();
        this.world = center.getWorld();
        this.cx = center.getBlockX();
        this.cy = center.getBlockY();
        this.cz = center.getBlockZ();

        // 1. Alle Bloecke planen (noch nichts setzen)
        clearAndGround();
        radialPaths();
        outerWallAndGates();
        cornerTowers();
        centralFountain();
        flagPoles();
        benches();
        lampPosts();

        house(cx - 15, cz - 15, "east");
        house(cx + 15, cz - 15, "west");
        house(cx - 15, cz + 15, "east");
        house(cx + 15, cz + 15, "west");

        stall(cx - 10, cz - 10, t.stall1);
        stall(cx + 10, cz - 10, t.stall2);
        stall(cx - 10, cz + 10, t.stall3);
        stall(cx + 10, cz + 10, t.stall4);

        floorLights();

        // 2. Tick-weise abarbeiten, danach Spawn setzen + Admin teleportieren
        runQueued(admin, theme);
    }

    // ====================================================================
    //  Ausfuehrung (tick-weise)
    // ====================================================================

    private void runQueued(Player admin, SpawnTheme theme) {
        final int total = ops.size();
        new BukkitRunnable() {
            int index = 0;

            @Override
            public void run() {
                int end = Math.min(index + BLOCKS_PER_TICK, total);
                for (; index < end; index++) {
                    apply(ops.get(index));
                }
                if (index >= total) {
                    finish(admin, theme);
                    cancel();
                }
            }
        }.runTaskTimer(plugin, 1L, 1L);
    }

    private void apply(Op op) {
        Block block = world.getBlockAt(op.x(), op.y(), op.z());
        if (op.state() != null) {
            try {
                BlockData data = op.material().createBlockData(op.state());
                block.setBlockData(data, false);
                return;
            } catch (IllegalArgumentException ignored) {
                // ungueltiger State fuer dieses Material -> einfacher Typ
            }
        }
        block.setType(op.material(), false);
    }

    private void finish(Player admin, SpawnTheme theme) {
        Location spawn = new Location(world, cx + 0.5, cy, cz + 8.5, 180f, 0f);
        plugin.getSpawnManager().setSpawn(spawn);
        plugin.getConfigManager().getConfig().set("spawn.protection-radius", PROTECTION);
        plugin.saveConfig();

        if (admin.isOnline()) {
            admin.teleport(spawn);
            plugin.getMessageManager().send(admin, "spawn.build-done",
                    "%theme%", MessageManager.color(theme.name),
                    "%radius%", String.valueOf(PROTECTION));
        }
    }

    // ====================================================================
    //  Boden / Plaza
    // ====================================================================

    private void clearAndGround() {
        for (int dx = -RADIUS; dx <= RADIUS; dx++) {
            for (int dz = -RADIUS; dz <= RADIUS; dz++) {
                double dist = Math.sqrt(dx * dx + (double) dz * dz);
                if (dist > RADIUS) continue;
                int x = cx + dx, z = cz + dz;
                for (int dy = 1; dy <= 4; dy++) set(x, cy - dy, z, t.foundation);
                set(x, cy - 1, z, floorMaterial(dx, dz, dist));
                for (int dy = 0; dy < CLEAR_HEIGHT; dy++) set(x, cy + dy, z, Material.AIR);
            }
        }
    }

    private Material floorMaterial(int dx, int dz, double dist) {
        long ring = Math.round(dist);
        if (ring == 9 || ring == 16 || ring == RADIUS - 1) return t.ring;
        int h = Math.floorMod(dx * 73 + dz * 19, 6);
        if (h == 0) return t.floor2;
        if (h == 1) return t.floor3;
        return t.floor1;
    }

    /** Vier breite Wege (3 Bloecke) vom Zentrum zu den vier Toren. */
    private void radialPaths() {
        for (int d = 4; d <= RADIUS; d++) {
            for (int w = -1; w <= 1; w++) {
                paveCross(cx + d, cz + w, d + w);
                paveCross(cx - d, cz + w, d + w);
                paveCross(cx + w, cz + d, d + w);
                paveCross(cx + w, cz - d, d + w);
            }
        }
    }

    private void paveCross(int x, int z, int parity) {
        set(x, cy - 1, z, (parity % 2 == 0) ? t.pathA : t.pathB);
    }

    /** Eingelassene Bodenlichter im Raster -> garantiert keine dunklen Stellen. */
    private void floorLights() {
        Material light = t.light;
        for (int dx = -RADIUS; dx <= RADIUS; dx += 6) {
            for (int dz = -RADIUS; dz <= RADIUS; dz += 6) {
                if (Math.sqrt(dx * dx + (double) dz * dz) > RADIUS - 2) continue;
                if (Math.abs(dx) <= 6 && Math.abs(dz) <= 6) continue; // Brunnen frei
                set(cx + dx, cy - 1, cz + dz, light);
            }
        }
    }

    // ====================================================================
    //  Stadtmauer + Tore
    // ====================================================================

    private void outerWallAndGates() {
        for (int dx = -RADIUS; dx <= RADIUS; dx++) {
            for (int dz = -RADIUS; dz <= RADIUS; dz++) {
                if (Math.round(Math.sqrt(dx * dx + (double) dz * dz)) != RADIUS) continue;
                if (Math.abs(dx) <= 3 || Math.abs(dz) <= 3) continue; // Toroeffnungen
                int x = cx + dx, z = cz + dz;
                set(x, cy, z, t.wallBase);
                set(x, cy + 1, z, t.wallBase);
                set(x, cy + 2, z, t.wallTop);
                // Zinnen (abwechselnd)
                if (Math.floorMod(dx + dz, 2) == 0) set(x, cy + 3, z, t.wallTop);
                // Pfeiler mit Licht
                if (Math.floorMod(dx + dz, 7) == 0) {
                    set(x, cy + 3, z, t.wallPillar);
                    set(x, cy + 4, z, t.light);
                }
            }
        }
        gateArch(0, -RADIUS, "z");
        gateArch(0, RADIUS, "z");
        gateArch(-RADIUS, 0, "x");
        gateArch(RADIUS, 0, "x");
    }

    /** Grosser Torbogen mit Pfeilern, Bogen, Laternen und Fahne. */
    private void gateArch(int gx, int gz, String axis) {
        int x = cx + gx, z = cz + gz;
        // Zwei Pfeiler links/rechts der Oeffnung
        int[] off = {-3, 3};
        for (int o : off) {
            int px = axis.equals("x") ? x : x + o;
            int pz = axis.equals("x") ? z + o : z;
            for (int dy = 0; dy <= 4; dy++) set(px, cy + dy, pz, t.wallPillar);
            set(px, cy + 5, pz, t.wallTop);
            hangingLantern(px, cy + 3, pz);
        }
        // Bogen oben quer ueber die Oeffnung
        for (int o = -3; o <= 3; o++) {
            int bx = axis.equals("x") ? x : x + o;
            int bz = axis.equals("x") ? z + o : z;
            int y = cy + 5 - (3 - Math.abs(o)); // leicht gewoelbt
            set(bx, y, bz, t.wallTop);
            set(bx, cy + 5, bz, t.wallBase);
        }
        // Fahne aus Stand-Farbe ueber dem Tor
        int fx = axis.equals("x") ? x : x;
        int fz = axis.equals("x") ? z : z;
        set(fx, cy + 6, fz, t.stall1);
    }

    private void cornerTowers() {
        int d = (int) Math.round(RADIUS / Math.sqrt(2)); // Eckpunkt auf dem Mauerkreis
        int[][] corners = {{d, d}, {d, -d}, {-d, d}, {-d, -d}};
        for (int[] c : corners) tower(cx + c[0], cz + c[1]);
    }

    private void tower(int tx, int tz) {
        int r = 2, h = 8;
        for (int dy = 0; dy <= h; dy++) {
            for (int dx = -r; dx <= r; dx++) {
                for (int dz = -r; dz <= r; dz++) {
                    double dist = Math.sqrt(dx * dx + (double) dz * dz);
                    if (dist > r + 0.3) continue;
                    boolean edge = dist > r - 0.6;
                    if (edge) {
                        Material m = (dy == h) ? t.wallTop : t.wallBase;
                        if (dy == h && Math.floorMod(dx + dz, 2) == 0) m = t.wallPillar; // Zinnen
                        set(tx + dx, cy + dy, tz + dz, m);
                    } else if (dy == 0) {
                        set(tx + dx, cy + dy, tz + dz, t.floor1);
                    } else {
                        set(tx + dx, cy + dy, tz + dz, Material.AIR);
                    }
                }
            }
        }
        set(tx, cy + h, tz, t.light);              // Turmspitze leuchtet
        hangingLantern(tx, cy + h - 1, tz);
    }

    // ====================================================================
    //  Prunkbrunnen mit Beacon-Spitze
    // ====================================================================

    private void centralFountain() {
        Material pool = (t.liquid != null) ? t.liquid : t.centerTop;

        // Tier 0 - grosses Becken (Radius 5)
        basin(5, cy, pool);
        // Tier 1 - mittleres Becken (Radius 3, eine Stufe hoeher)
        column3x3Base(cy, t.wallBase);
        basin(3, cy + 1, pool);
        // Tier 2 - kleines Becken (Radius 1)
        for (int dy = cy; dy <= cy + 2; dy++) fill3x3(dy, t.wallPillar);
        basin(1, cy + 3, pool);

        // Spitze (Saeule) + Beacon-Lichtstrahl
        for (int dy = cy + 4; dy <= cy + 7; dy++) set(cx, dy, cz, t.wallPillar);
        // 3x3 Eisen-Basis (Beacon-Pyramide Stufe 1) - muss vollstaendig aus
        // gueltigen Bloecken bestehen, damit der Lichtstrahl aktiv wird.
        for (int dx = -1; dx <= 1; dx++) {
            for (int dz = -1; dz <= 1; dz++) {
                set(cx + dx, cy + 8, cz + dz, Material.IRON_BLOCK);
            }
        }
        set(cx, cy + 9, cz, Material.BEACON);      // -> Lichtstrahl in den Himmel
        // Glanz-Akzente unter der Krone
        set(cx + 1, cy + 7, cz, t.light);
        set(cx - 1, cy + 7, cz, t.light);
        set(cx, cy + 7, cz + 1, t.light);
        set(cx, cy + 7, cz - 1, t.light);
        // 4 Eck-Lampen am grossen Becken
        int[][] corners = {{4, 4}, {4, -4}, {-4, 4}, {-4, -4}};
        for (int[] c : corners) {
            int x = cx + c[0], z = cz + c[1];
            for (int dy = 0; dy <= 2; dy++) set(x, cy + dy, z, t.lampPost);
            set(x, cy + 3, z, t.light);
        }
    }

    /** Ein rundes Becken: Rand als niedrige Mauer, Innenflaeche als Pool. */
    private void basin(int radius, int surfaceY, Material pool) {
        for (int dx = -radius; dx <= radius; dx++) {
            for (int dz = -radius; dz <= radius; dz++) {
                double dist = Math.sqrt(dx * dx + (double) dz * dz);
                if (dist > radius + 0.3) continue;
                int x = cx + dx, z = cz + dz;
                set(x, surfaceY - 1, z, t.wallBase); // Beckenboden
                if (dist > radius - 0.6) {
                    set(x, surfaceY, z, t.wallBase);     // Rand
                    set(x, surfaceY + 1, z, t.wallTop);  // Gelaender
                } else {
                    set(x, surfaceY, z, pool);           // Wasser/Lava/Block
                }
            }
        }
    }

    private void column3x3Base(int y, Material m) {
        for (int dx = -3; dx <= 3; dx++) {
            for (int dz = -3; dz <= 3; dz++) {
                if (Math.abs(dx) == 3 || Math.abs(dz) == 3) set(cx + dx, y - 1, cz + dz, m);
            }
        }
    }

    private void fill3x3(int y, Material m) {
        for (int dx = -1; dx <= 1; dx++) {
            for (int dz = -1; dz <= 1; dz++) set(cx + dx, y, cz + dz, m);
        }
    }

    // ====================================================================
    //  Haeuser (zweistoeckig, detailreich)
    // ====================================================================

    private void house(int hx, int hz, String doorFacing) {
        int half = 4;
        int x0 = hx - half, x1 = hx + half, z0 = hz - half, z1 = hz + half;
        int floor1H = 4, floor2H = 3;
        int wallH = floor1H + floor2H;

        // Boden + Innenraum freiraeumen
        for (int x = x0; x <= x1; x++) {
            for (int z = z0; z <= z1; z++) {
                set(x, cy - 1, z, t.houseFloor);
                for (int dy = 0; dy < wallH + half + 2; dy++) set(x, cy + dy, z, Material.AIR);
            }
        }
        // Sockel-Ring
        for (int x = x0; x <= x1; x++) {
            for (int z = z0; z <= z1; z++) {
                if (x == x0 || x == x1 || z == z0 || z == z1) set(x, cy, z, t.foundation);
            }
        }
        // Fachwerk-Waende
        for (int y = 1; y < wallH; y++) {
            for (int x = x0; x <= x1; x++) {
                for (int z = z0; z <= z1; z++) {
                    if (x != x0 && x != x1 && z != z0 && z != z1) continue;
                    boolean corner = (x == x0 || x == x1) && (z == z0 || z == z1);
                    boolean beamRow = (y == floor1H) || (y == wallH - 1);
                    boolean post = ((x + z) % 2 == 0);
                    if (corner || beamRow || post) set(x, cy + y, z, t.houseBeam);
                    else set(x, cy + y, z, t.houseFill);
                }
            }
        }
        // Grosse Fenster (2x2) je Stockwerk auf jeder Seite
        windows(hx, hz, x0, x1, z0, z1);
        // Etagen-Innenboden (2. Stock)
        for (int x = x0 + 1; x < x1; x++) {
            for (int z = z0 + 1; z < z1; z++) set(x, cy + floor1H, z, t.houseFloor);
        }
        // Tuer + Vordach + Stufen
        entrance(hx, hz, x0, x1, z0, z1, doorFacing);
        // Walmdach (zwei Lagen hoeher als vorher)
        hipRoof(x0, x1, z0, z1, cy + wallH);
        // Schornstein (an der Hausecke, ragt durchs Dach)
        chimney(x0, z0, cy + wallH);
        // Innenbeleuchtung + Einrichtung
        set(hx, cy + floor1H - 1, hz, t.light);            // Decken-Licht EG
        set(hx, cy + wallH - 1, hz, t.light);              // Decken-Licht OG
        set(x0 + 1, cy + 1, z0 + 1, Material.BARREL);
        set(x1 - 1, cy + 1, z0 + 1, Material.CRAFTING_TABLE);
        set(x0 + 1, cy + 1, z1 - 1, Material.BOOKSHELF);
        setData(x1 - 1, cy + 1, z1 - 2, Material.WHITE_BED, "[facing=south,part=foot]");
        setData(x1 - 1, cy + 1, z1 - 1, Material.WHITE_BED, "[facing=south,part=head]");
    }

    private void windows(int hx, int hz, int x0, int x1, int z0, int z1) {
        int[] ys = {2, 5};
        for (int y : ys) {
            for (int o = -1; o <= 1; o += 2) {
                glassPane(hx + o, y, z0);
                glassPane(hx + o, y, z1);
                glassPane(x0, y, hz + o);
                glassPane(x1, y, hz + o);
            }
        }
    }

    private void glassPane(int x, int yOff, int z) {
        set(x, cy + yOff, z, Material.GLASS_PANE);
        set(x, cy + yOff + 1, z, Material.GLASS_PANE);
    }

    private void entrance(int hx, int hz, int x0, int x1, int z0, int z1, String facing) {
        int dx = hx, dz = hz;
        switch (facing) {
            case "east" -> dx = x1;
            case "west" -> dx = x0;
            case "north" -> dz = z0;
            case "south" -> dz = z1;
        }
        setData(dx, cy + 1, dz, t.door, "[facing=" + facing + ",half=lower,hinge=left]");
        setData(dx, cy + 2, dz, t.door, "[facing=" + facing + ",half=upper,hinge=left]");
        set(dx, cy + 3, dz, t.houseBeam);
        hangingLantern(dx, cy + 3, dz);
        // Vordach + Stufe vor der Tuer (eine Position nach aussen)
        int ox = dx + (facing.equals("east") ? 1 : facing.equals("west") ? -1 : 0);
        int oz = dz + (facing.equals("south") ? 1 : facing.equals("north") ? -1 : 0);
        set(ox, cy - 1, oz, t.ring);
        setData(ox, cy + 3, oz, t.roofStair, "[facing=" + opposite(facing) + ",half=bottom]");
    }

    private String opposite(String facing) {
        return switch (facing) {
            case "east" -> "west";
            case "west" -> "east";
            case "north" -> "south";
            default -> "north";
        };
    }

    private void chimney(int x, int z, int baseY) {
        for (int y = cy + 1; y <= baseY + 3; y++) set(x, y, z, t.foundation);
        set(x, baseY + 4, z, t.light);
    }

    private void hipRoof(int x0, int x1, int z0, int z1, int baseY) {
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

    // ====================================================================
    //  Marktstaende, Baenke, Fahnen, Lampen
    // ====================================================================

    private void stall(int sx, int sz, Material canopy) {
        // 4 Eckpfosten
        int[][] corners = {{-1, -1}, {-1, 1}, {1, -1}, {1, 1}};
        for (int[] c : corners) {
            for (int dy = 0; dy <= 2; dy++) set(sx + c[0], cy + dy, sz + c[1], t.lampPost);
        }
        // Markise (3x3) + ueberstehende Stufen-Kante
        for (int dx = -1; dx <= 1; dx++) {
            for (int dz = -1; dz <= 1; dz++) set(sx + dx, cy + 3, sz + dz, canopy);
        }
        setData(sx - 2, cy + 3, sz, t.roofStair, "[facing=east,half=bottom]");
        setData(sx + 2, cy + 3, sz, t.roofStair, "[facing=west,half=bottom]");
        setData(sx, cy + 3, sz - 2, t.roofStair, "[facing=south,half=bottom]");
        setData(sx, cy + 3, sz + 2, t.roofStair, "[facing=north,half=bottom]");
        // Theke + Waren
        set(sx - 1, cy + 1, sz, Material.BARREL);
        set(sx + 1, cy + 1, sz, Material.BARREL);
        set(sx, cy + 1, sz - 1, Material.HAY_BLOCK);
        set(sx + 1, cy + 1, sz + 1, canopy);
        hangingLantern(sx, cy + 2, sz);
    }

    /** Baenke (zwei Stufen Ruecken an Ruecken) rund um den Brunnen. */
    private void benches() {
        bench(0, 7, "z");
        bench(0, -7, "z");
        bench(7, 0, "x");
        bench(-7, 0, "x");
    }

    private void bench(int ox, int oz, String axis) {
        if (axis.equals("z")) {
            for (int dx = -1; dx <= 1; dx++) {
                setData(cx + ox + dx, cy, cz + oz, t.roofStair, "[facing=north,half=bottom]");
            }
        } else {
            for (int dz = -1; dz <= 1; dz++) {
                setData(cx + ox, cy, cz + oz + dz, t.roofStair, "[facing=west,half=bottom]");
            }
        }
    }

    private void flagPoles() {
        int[][] pos = {{6, 6, 0}, {6, -6, 1}, {-6, 6, 2}, {-6, -6, 3}};
        Material[] colors = {t.stall1, t.stall2, t.stall3, t.stall4};
        for (int[] p : pos) {
            int x = cx + p[0], z = cz + p[1];
            for (int dy = 0; dy <= 4; dy++) set(x, cy + dy, z, t.lampPost);
            set(x, cy + 5, z, colors[p[2]]);
            set(x + 1, cy + 5, z, colors[p[2]]);
            set(x + 1, cy + 4, z, colors[p[2]]);
        }
    }

    private void lampPosts() {
        // Entlang der vier Wege
        for (int d = 8; d <= RADIUS - 4; d += 6) {
            lamp(cx + d, cz + 2);
            lamp(cx - d, cz - 2);
            lamp(cx + 2, cz + d);
            lamp(cx - 2, cz - d);
        }
    }

    private void lamp(int x, int z) {
        set(x, cy - 1, z, t.ring);
        for (int dy = 0; dy <= 3; dy++) set(x, cy + dy, z, t.lampPost);
        set(x, cy + 4, z, t.light);
        hangingLantern(x, cy + 3, z);
    }

    // ====================================================================
    //  Block-Helfer (Operationen werden nur vorgemerkt)
    // ====================================================================

    private void hangingLantern(int x, int y, int z) {
        Material lantern = (t.light == Material.SOUL_LANTERN) ? Material.SOUL_LANTERN : Material.LANTERN;
        setData(x, y, z, lantern, "[hanging=true]");
    }

    private void set(int x, int y, int z, Material material) {
        if (material.name().endsWith("_LEAVES")) {
            ops.add(new Op(x, y, z, material, "[persistent=true]"));
            return;
        }
        ops.add(new Op(x, y, z, material, null));
    }

    private void setData(int x, int y, int z, Material material, String state) {
        ops.add(new Op(x, y, z, material, state));
    }
}
