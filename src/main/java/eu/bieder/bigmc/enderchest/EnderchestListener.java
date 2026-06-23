package eu.bieder.bigmc.enderchest;

import eu.bieder.bigmc.BigMC;
import org.bukkit.event.EventHandler;
import org.bukkit.event.Listener;
import org.bukkit.event.inventory.InventoryCloseEvent;

/**
 * Speichert die virtuelle Enderchest, sobald der Spieler sie schliesst
 * (auch beim Quit, da dann ebenfalls ein Close-Event ausgeloest wird).
 */
public class EnderchestListener implements Listener {

    private final BigMC plugin;

    public EnderchestListener(BigMC plugin) {
        this.plugin = plugin;
    }

    @EventHandler
    public void onClose(InventoryCloseEvent event) {
        if (event.getInventory().getHolder() instanceof EnderchestHolder holder) {
            plugin.getEnderchestManager().save(holder.getOwner(), event.getInventory());
        }
    }
}
