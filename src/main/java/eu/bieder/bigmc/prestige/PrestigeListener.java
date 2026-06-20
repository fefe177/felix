package eu.bieder.bigmc.prestige;

import eu.bieder.bigmc.BigMC;
import org.bukkit.event.EventHandler;
import org.bukkit.event.Listener;
import org.bukkit.event.player.PlayerJoinEvent;
import org.bukkit.event.player.PlayerQuitEvent;

/**
 * Laedt/entlaedt das Prestige-Level eines Spielers beim Join/Quit.
 */
public class PrestigeListener implements Listener {

    private final BigMC plugin;

    public PrestigeListener(BigMC plugin) {
        this.plugin = plugin;
    }

    @EventHandler
    public void onJoin(PlayerJoinEvent event) {
        plugin.getPrestigeManager().loadPlayer(event.getPlayer().getUniqueId());
    }

    @EventHandler
    public void onQuit(PlayerQuitEvent event) {
        plugin.getPrestigeManager().unloadPlayer(event.getPlayer().getUniqueId());
    }
}
