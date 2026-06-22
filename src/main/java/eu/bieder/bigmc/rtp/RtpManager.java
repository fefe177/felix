package eu.bieder.bigmc.rtp;

import eu.bieder.bigmc.BigMC;
import org.bukkit.Bukkit;
import org.bukkit.Location;
import org.bukkit.Material;
import org.bukkit.World;
import org.bukkit.block.Block;
import org.bukkit.configuration.file.FileConfiguration;
import org.bukkit.entity.Player;

import java.util.HashMap;
import java.util.Map;
import java.util.Random;
import java.util.Set;
import java.util.UUID;

/**
 * Custom Random-Teleport (RTP) - jetzt dimensionsbewusst.
 *
 * Teleportiert Spieler an eine zufaellige, SICHERE Position in der gewaehlten
 * Dimension (Overworld / Nether / End). Gefaehrliche Landeplaetze (Lava, Wasser,
 * Kaktus, Void, Bedrock, Portale ...) werden uebersprungen. Im Nether wird unter
 * dem Bedrock-Dach gesucht; in Overworld/End vom obersten Block abwaerts.
 * Cooldown und optionale Kosten kommen aus der config.
 */
public class RtpManager {

    /** Zieldimensionen fuer den Random-Teleport (mit Config-Schluesseln + Defaults). */
    public enum Dimension {
        OVERWORLD(World.Environment.NORMAL, "rtp.world", "world",
                "rtp.min-radius", 500, "rtp.max-radius", 5000),
        NETHER(World.Environment.NETHER, "rtp.nether-world", "world_nether",
                "rtp.nether-min-radius", 100, "rtp.nether-max-radius", 1500),
        END(World.Environment.THE_END, "rtp.end-world", "world_the_end",
                "rtp.end-min-radius", 100, "rtp.end-max-radius", 1500);

        public final World.Environment environment;
        public final String worldKey;
        public final String worldDefault;
        public final String minKey;
        public final int minDefault;
        public final String maxKey;
        public final int maxDefault;

        Dimension(World.Environment environment, String worldKey, String worldDefault,
                  String minKey, int minDefault, String maxKey, int maxDefault) {
            this.environment = environment;
            this.worldKey = worldKey;
            this.worldDefault = worldDefault;
            this.minKey = minKey;
            this.minDefault = minDefault;
            this.maxKey = maxKey;
            this.maxDefault = maxDefault;
        }

        /** Wandelt ein Befehls-Argument in eine Dimension um (Default: Overworld). */
        public static Dimension fromArg(String input) {
            if (input == null) return OVERWORLD;
            return switch (input.toLowerCase()) {
                case "nether", "hell", "unterwelt" -> NETHER;
                case "end", "ende", "the_end", "theend" -> END;
                default -> OVERWORLD;
            };
        }
    }

    /** Bloecke, auf denen niemand landen sollte. */
    private static final Set<Material> UNSAFE_GROUND = Set.of(
            Material.LAVA, Material.WATER, Material.MAGMA_BLOCK, Material.CACTUS,
            Material.POWDER_SNOW, Material.FIRE, Material.SOUL_FIRE,
            Material.POINTED_DRIPSTONE, Material.SWEET_BERRY_BUSH, Material.BEDROCK,
            Material.NETHER_PORTAL, Material.END_PORTAL, Material.END_GATEWAY);

    private final BigMC plugin;
    private final Random random = new Random();

    /** Letzter RTP-Zeitpunkt pro Spieler (fuer den Cooldown). */
    private final Map<UUID, Long> lastUse = new HashMap<>();

    public RtpManager(BigMC plugin) {
        this.plugin = plugin;
    }

    // ----- Konfiguration -----

    public int getCooldownSeconds() {
        return cfg().getInt("rtp.cooldown-seconds", 60);
    }

    public double getCost() {
        return cfg().getDouble("rtp.cost", 0.0);
    }

    /** Liefert die geladene Zielwelt der Dimension (oder null, wenn nicht vorhanden). */
    public World getWorld(Dimension dim) {
        String name = cfg().getString(dim.worldKey, dim.worldDefault);
        World world = (name == null || name.isEmpty()) ? null : Bukkit.getWorld(name);
        if (world != null) return world;
        // Fallback: erste geladene Welt mit passender Umgebung
        for (World w : Bukkit.getWorlds()) {
            if (w.getEnvironment() == dim.environment) return w;
        }
        // Fuer die Overworld notfalls die Hauptwelt nehmen
        if (dim == Dimension.OVERWORLD && !Bukkit.getWorlds().isEmpty()) {
            return Bukkit.getWorlds().get(0);
        }
        return null;
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

    // ----- Kompletter Teleport-Ablauf -----

    /**
     * Fuehrt einen vollstaendigen RTP-Versuch aus: Cooldown- und Kosten-Pruefung,
     * sichere Position suchen, teleportieren und passende Nachrichten senden.
     * Wird von /rtp und vom RtpGUI genutzt.
     *
     * @return true, wenn der Spieler teleportiert wurde
     */
    public boolean attemptTeleport(Player player, Dimension dim) {
        var msg = plugin.getMessageManager();

        long remaining = getRemainingCooldown(player.getUniqueId());
        if (remaining > 0 && !player.hasPermission("bigmc.rtp.bypass")) {
            msg.send(player, "rtp.cooldown", "%seconds%", String.valueOf(remaining));
            return false;
        }

        World world = getWorld(dim);
        if (world == null) {
            msg.send(player, "rtp.world-missing");
            return false;
        }

        double cost = getCost();
        if (cost > 0 && !plugin.getEconomyManager().withdraw(player.getUniqueId(), cost)) {
            msg.send(player, "economy.not-enough-money");
            return false;
        }

        msg.send(player, "rtp.searching");
        Location target = findSafeLocation(dim);
        if (target == null) {
            if (cost > 0) {
                plugin.getEconomyManager().deposit(player.getUniqueId(), cost);
            }
            msg.send(player, "rtp.no-location");
            return false;
        }

        markUsed(player.getUniqueId());
        player.setFallDistance(0f);
        player.teleport(target);
        msg.send(player, "rtp.teleported",
                "%x%", String.valueOf(target.getBlockX()),
                "%z%", String.valueOf(target.getBlockZ()));
        return true;
    }

    // ----- Zufalls-Position -----

    /**
     * Sucht eine sichere Zufallsposition in der RTP-Area der Dimension.
     * @return null, wenn nach allen Versuchen keine gefunden wurde
     */
    public Location findSafeLocation(Dimension dim) {
        World world = getWorld(dim);
        if (world == null) return null;

        FileConfiguration c = cfg();
        int centerX = c.getInt("rtp.center-x", 0);
        int centerZ = c.getInt("rtp.center-z", 0);
        int minRadius = Math.max(0, c.getInt(dim.minKey, dim.minDefault));
        int maxRadius = Math.max(minRadius + 1, c.getInt(dim.maxKey, dim.maxDefault));
        int attempts = Math.max(1, c.getInt("rtp.max-attempts", 25));
        boolean nether = world.getEnvironment() == World.Environment.NETHER;

        for (int i = 0; i < attempts; i++) {
            // Zufaelliger Punkt im Ring zwischen min- und max-Radius
            double angle = random.nextDouble() * 2 * Math.PI;
            double distance = minRadius + random.nextDouble() * (maxRadius - minRadius);
            int x = centerX + (int) Math.round(Math.cos(angle) * distance);
            int z = centerZ + (int) Math.round(Math.sin(angle) * distance);

            // Im Nether unter dem Bedrock-Dach abwaerts suchen, sonst vom obersten Block.
            Location loc = nether ? scanDown(world, x, z, 118) : scanFromHighest(world, x, z);
            if (loc != null) return loc;
        }
        return null;
    }

    /** Overworld/End: zuerst den obersten Block, sonst die Spalte abwaerts pruefen. */
    private Location scanFromHighest(World world, int x, int z) {
        Block highest = world.getHighestBlockAt(x, z);
        if (isSafe(world, x, highest.getY(), z)) {
            return at(world, x, highest.getY(), z);
        }
        return scanDown(world, x, z, world.getMaxHeight() - 2);
    }

    /** Sucht von startY abwaerts den ersten sicheren Stehplatz. */
    private Location scanDown(World world, int x, int z, int startY) {
        int top = Math.min(startY, world.getMaxHeight() - 2);
        int bottom = world.getMinHeight() + 2;
        for (int y = top; y >= bottom; y--) {
            if (isSafe(world, x, y, z)) {
                return at(world, x, y, z);
            }
        }
        return null;
    }

    /** Fester Boden + zwei freie Bloecke darueber + ungefaehrlicher Untergrund. */
    private boolean isSafe(World world, int x, int y, int z) {
        Material ground = world.getBlockAt(x, y, z).getType();
        if (!ground.isSolid() || UNSAFE_GROUND.contains(ground)) return false;
        Material feet = world.getBlockAt(x, y + 1, z).getType();
        Material head = world.getBlockAt(x, y + 2, z).getType();
        return isPassable(feet) && isPassable(head);
    }

    /** Bloecke, durch die man problemlos stehen kann. */
    private boolean isPassable(Material m) {
        return m == Material.AIR || m == Material.CAVE_AIR || m == Material.VOID_AIR
                || m == Material.SHORT_GRASS || m == Material.SNOW;
    }

    private Location at(World world, int x, int y, int z) {
        return new Location(world, x + 0.5, y + 1.0, z + 0.5);
    }

    private FileConfiguration cfg() {
        return plugin.getConfigManager().getConfig();
    }
}
