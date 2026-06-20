package eu.bieder.bigmc.rank;

import eu.bieder.bigmc.BigMC;
import eu.bieder.bigmc.config.MessageManager;
import io.papermc.paper.event.player.AsyncChatEvent;
import net.kyori.adventure.text.Component;
import net.kyori.adventure.text.serializer.legacy.LegacyComponentSerializer;
import org.bukkit.event.EventHandler;
import org.bukkit.event.Listener;
import org.bukkit.event.player.PlayerJoinEvent;
import org.bukkit.event.player.PlayerQuitEvent;

/**
 * Bindet die Raenge in das Spiel ein:
 * - beim Join: Permissions setzen und (falls noch keiner gespeichert) Start-Rang vergeben
 * - im Chat: den Rang-Prefix vor den Spielernamen setzen
 */
public class RankListener implements Listener {

    private final BigMC plugin;

    public RankListener(BigMC plugin) {
        this.plugin = plugin;
    }

    @EventHandler
    public void onJoin(PlayerJoinEvent event) {
        var player = event.getPlayer();
        RankManager rm = plugin.getRankManager();

        // Falls der Spieler noch keinen gespeicherten Rang hat: Start-Rang setzen
        rm.getFirstRank().ifPresent(first -> {
            RankManager.Rank current = rm.getPlayerRank(player.getUniqueId());
            if (current == null || current.id().equals(first.id())) {
                rm.setPlayerRank(player.getUniqueId(), player.getName(), current != null ? current : first);
            }
        });

        // Permissions des aktuellen Rangs anwenden
        rm.applyPermissions(player);
    }

    @EventHandler
    public void onQuit(PlayerQuitEvent event) {
        plugin.getRankManager().clearPermissions(event.getPlayer().getUniqueId());
    }

    /**
     * Stellt den Rang-Prefix im Chat dar (Paper AsyncChatEvent mit Components).
     * Format aus messages.yml: chat-format mit %prefix%, %player%, %message%.
     */
    @EventHandler
    public void onChat(AsyncChatEvent event) {
        RankManager.Rank rank = plugin.getRankManager().getPlayerRank(event.getPlayer().getUniqueId());
        String prefix = rank != null ? rank.prefix() : "";

        // Rohnachricht des Spielers als reinen Text uebernehmen
        String message = LegacyComponentSerializer.legacySection().serialize(event.message());

        // Cosmetic-Titel (falls ausgeruestet)
        String title = "";
        if (plugin.getCosmeticsManager() != null) {
            title = plugin.getCosmeticsManager().getEquippedTitle(event.getPlayer().getUniqueId());
        }

        MessageManager msg = plugin.getMessageManager();
        String format = msg.getRaw("ranks.chat-format")
                .replace("%prefix%", MessageManager.color(prefix))
                .replace("%title%", MessageManager.color(title))
                .replace("%player%", event.getPlayer().getName())
                .replace("%message%", message);

        Component rendered = LegacyComponentSerializer.legacySection().deserialize(format);
        // Renderer ersetzt das komplette Chat-Layout durch unser Format
        event.renderer((source, sourceDisplayName, originalMessage, viewer) -> rendered);
    }
}
