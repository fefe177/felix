package eu.bieder.bigmc.tpa;

import eu.bieder.bigmc.BigMC;
import org.bukkit.event.EventHandler;
import org.bukkit.event.Listener;
import org.bukkit.event.player.PlayerQuitEvent;

/**
 * Raeumt offene TPA-Anfragen beim Verlassen des Servers auf.
 */
public class TpaListener implements Listener {

    private final BigMC plugin;

    public TpaListener(BigMC plugin) {
        this.plugin = plugin;
    }

    @EventHandler
    public void onQuit(PlayerQuitEvent event) {
        plugin.getTpaManager().handleQuit(event.getPlayer().getUniqueId());
    }
}
