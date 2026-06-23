package eu.bieder.bigmc.enderchest;

import org.bukkit.inventory.Inventory;
import org.bukkit.inventory.InventoryHolder;

import java.util.UUID;

/**
 * Marker-Holder fuer die virtuelle Enderchest. Merkt sich den Besitzer,
 * damit beim Schliessen der richtige Inhalt gespeichert wird.
 */
public class EnderchestHolder implements InventoryHolder {

    private final UUID owner;
    private Inventory inventory;

    public EnderchestHolder(UUID owner) {
        this.owner = owner;
    }

    public UUID getOwner() {
        return owner;
    }

    public void setInventory(Inventory inventory) {
        this.inventory = inventory;
    }

    @Override
    public Inventory getInventory() {
        return inventory;
    }
}
