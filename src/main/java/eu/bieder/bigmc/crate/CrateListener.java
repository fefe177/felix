package eu.bieder.bigmc.crate;

import eu.bieder.bigmc.BigMC;
import org.bukkit.event.EventHandler;
import org.bukkit.event.Listener;
import org.bukkit.event.player.PlayerJoinEvent;
import org.bukkit.event.player.PlayerQuitEvent;

/**
 * Laedt/entlaedt den Schluessel-Cache eines Spielers beim Join/Quit.
 */
public class CrateListener implements Listener {

    private final BigMC plugin;

    public CrateListener(BigMC plugin) {
        this.plugin = plugin;
    }

    @EventHandler
    public void onJoin(PlayerJoinEvent event) {
        plugin.getCrateManager().loadPlayer(event.getPlayer().getUniqueId());
    }

    @EventHandler
    public void onQuit(PlayerQuitEvent event) {
        plugin.getCrateManager().unloadPlayer(event.getPlayer().getUniqueId());
    }
}
