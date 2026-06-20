package eu.bieder.bigmc.cosmetics;

import eu.bieder.bigmc.BigMC;
import eu.bieder.bigmc.config.MessageManager;
import net.kyori.adventure.text.serializer.legacy.LegacyComponentSerializer;
import org.bukkit.event.EventHandler;
import org.bukkit.event.EventPriority;
import org.bukkit.event.Listener;
import org.bukkit.event.player.AsyncPlayerPreLoginEvent;
import org.bukkit.event.player.PlayerJoinEvent;
import org.bukkit.event.player.PlayerQuitEvent;

/**
 * Laedt Cosmetics vor dem Join (damit die Join-Nachricht sofort verfuegbar ist),
 * wendet die Join-Nachricht an und raeumt beim Quit auf.
 */
public class CosmeticsListener implements Listener {

    private final BigMC plugin;

    public CosmeticsListener(BigMC plugin) {
        this.plugin = plugin;
    }

    @EventHandler
    public void onPreLogin(AsyncPlayerPreLoginEvent event) {
        if (event.getLoginResult() != AsyncPlayerPreLoginEvent.Result.ALLOWED) return;
        // Laeuft async -> blockierendes Vorladen ist hier erlaubt
        plugin.getCosmeticsManager().preload(event.getUniqueId());
    }

    @EventHandler(priority = EventPriority.HIGH)
    public void onJoin(PlayerJoinEvent event) {
        String template = plugin.getCosmeticsManager().getEquippedJoinMessage(event.getPlayer().getUniqueId());
        if (template == null) return;
        String text = MessageManager.color(template.replace("%player%", event.getPlayer().getName()));
        event.joinMessage(LegacyComponentSerializer.legacySection().deserialize(text));
    }

    @EventHandler
    public void onQuit(PlayerQuitEvent event) {
        plugin.getCosmeticsManager().unloadPlayer(event.getPlayer().getUniqueId());
    }
}
