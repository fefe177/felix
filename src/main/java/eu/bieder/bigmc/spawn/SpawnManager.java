package eu.bieder.bigmc.spawn;

import eu.bieder.bigmc.BigMC;
import org.bukkit.Bukkit;
import org.bukkit.Location;
import org.bukkit.World;
import org.bukkit.entity.Player;

/**
 * Verwaltet den Server-Spawn und seine Schutzzone.
 *
 * Innerhalb des Schutz-Radius um den Spawn gilt:
 * - kein Blockabbau / kein Platzieren (ausser mit bigmc.spawn.bypass)
 * - kein PvP (sicherer Handels-/Treffpunkt)
 */
public class SpawnManager {

    private final BigMC plugin;

    public SpawnManager(BigMC plugin) {
        this.plugin = plugin;
    }

    /** Liest den Spawnpunkt aus der config (null = nicht gesetzt -> Welt-Spawn). */
    public Location getSpawn() {
        var cfg = plugin.getConfigManager().getConfig();
        String worldName = cfg.getString("spawn.location.world", "");
        if (worldName == null || worldName.isEmpty()) {
            // Fallback: Spawn der Hauptwelt
            World world = Bukkit.getWorlds().isEmpty() ? null : Bukkit.getWorlds().get(0);
            return world != null ? world.getSpawnLocation() : null;
        }
        World world = Bukkit.getWorld(worldName);
        if (world == null) return null;
        return new Location(world,
                cfg.getDouble("spawn.location.x"),
                cfg.getDouble("spawn.location.y"),
                cfg.getDouble("spawn.location.z"),
                (float) cfg.getDouble("spawn.location.yaw"),
                (float) cfg.getDouble("spawn.location.pitch"));
    }

    /** Setzt den Spawnpunkt (fuer /setspawn). */
    public void setSpawn(Location loc) {
        var cfg = plugin.getConfigManager().getConfig();
        cfg.set("spawn.location.world", loc.getWorld().getName());
        cfg.set("spawn.location.x", loc.getX());
        cfg.set("spawn.location.y", loc.getY());
        cfg.set("spawn.location.z", loc.getZ());
        cfg.set("spawn.location.yaw", loc.getYaw());
        cfg.set("spawn.location.pitch", loc.getPitch());
        plugin.saveConfig();
    }

    /** Schutz-Radius um den Spawn (Bloecke, 0 = Schutz aus). */
    public int getProtectionRadius() {
        return plugin.getConfigManager().getConfig().getInt("spawn.protection-radius", 32);
    }

    /**
     * Liegt eine Position innerhalb der Spawn-Schutzzone?
     * (2D-Abstand, gleiche Welt)
     */
    public boolean isProtected(Location loc) {
        int radius = getProtectionRadius();
        if (radius <= 0) return false;
        Location spawn = getSpawn();
        if (spawn == null || loc.getWorld() != spawn.getWorld()) return false;
        double dx = loc.getX() - spawn.getX();
        double dz = loc.getZ() - spawn.getZ();
        return dx * dx + dz * dz <= (double) radius * radius;
    }

    /** Darf dieser Spieler in der Schutzzone bauen/abbauen? */
    public boolean canBypass(Player player) {
        return player.hasPermission("bigmc.spawn.bypass");
    }
}
