package eu.bieder.bigmc.scoreboard;

import eu.bieder.bigmc.BigMC;
import org.bukkit.event.EventHandler;
import org.bukkit.event.Listener;
import org.bukkit.event.player.PlayerJoinEvent;
import org.bukkit.event.player.PlayerQuitEvent;

/**
 * Zeigt die Sidebar beim Join (falls standardmaessig aktiviert)
 * und raeumt beim Quit auf.
 */
public class SidebarListener implements Listener {

    private final BigMC plugin;

    public SidebarListener(BigMC plugin) {
        this.plugin = plugin;
    }

    @EventHandler
    public void onJoin(PlayerJoinEvent event) {
        if (plugin.getSidebarManager().isEnabledByDefault()) {
            // Leicht verzoegert, damit Konto/Rang/Stats schon angelegt sind
            plugin.getServer().getScheduler().runTaskLater(plugin,
                    () -> {
                        if (event.getPlayer().isOnline()) {
                            plugin.getSidebarManager().show(event.getPlayer());
                        }
                    }, 20L);
        }
    }

    @EventHandler
    public void onQuit(PlayerQuitEvent event) {
        plugin.getSidebarManager().remove(event.getPlayer().getUniqueId());
    }
}
