package eu.bieder.bigmc.spawner;

import org.bukkit.Location;
import org.bukkit.World;

import java.util.UUID;

/**
 * Ein in der Welt platzierter Custom-Spawner (Datensatz aus der Datenbank).
 *
 * @param id          Datenbank-ID
 * @param world       Weltname
 * @param x,y,z       Blockposition
 * @param typeId      Spawner-Typ (siehe SpawnerType.id)
 * @param stackSize   wie viele Spawner hier zusammengelegt sind (1..max-stack)
 * @param stored      aktuell gespeicherte (abholbare) Item-Menge
 * @param lastProduce Zeitpunkt der letzten Produktion (ms)
 * @param owner       Besitzer (darf abholen, stapeln, abbauen)
 */
public record PlacedSpawner(int id, String world, int x, int y, int z,
                            String typeId, int stackSize, long stored,
                            long lastProduce, UUID owner) {

    /** Liefert die Bukkit-Location (oder null, wenn die Welt nicht geladen ist). */
    public Location toLocation() {
        World w = org.bukkit.Bukkit.getWorld(world);
        if (w == null) return null;
        return new Location(w, x, y, z);
    }
}
