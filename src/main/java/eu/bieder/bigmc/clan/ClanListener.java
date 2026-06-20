package eu.bieder.bigmc.clan;

import eu.bieder.bigmc.BigMC;
import io.papermc.paper.event.player.AsyncChatEvent;
import net.kyori.adventure.text.serializer.legacy.LegacyComponentSerializer;
import org.bukkit.Bukkit;
import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.EventPriority;
import org.bukkit.event.Listener;
import org.bukkit.event.entity.PlayerDeathEvent;
import org.bukkit.event.player.PlayerQuitEvent;

/**
 * Verbindet Clans mit dem Spielgeschehen:
 * - PvP-Kill -> Punkte fuer den Clan des Killers
 * - aktivierter Clan-Chat -> normale Chat-Nachrichten gehen nur an den Clan
 * - Quit -> Chat-/Invite-Status aufraeumen
 */
public class ClanListener implements Listener {

    private final BigMC plugin;

    public ClanListener(BigMC plugin) {
        this.plugin = plugin;
    }

    @EventHandler
    public void onDeath(PlayerDeathEvent event) {
        Player victim = event.getEntity();
        Player killer = victim.getKiller();
        if (killer == null || killer.getUniqueId().equals(victim.getUniqueId())) return;
        plugin.getClanManager().addPoints(killer.getUniqueId(), plugin.getClanManager().pointsPerKill());
    }

    @EventHandler
    public void onQuit(PlayerQuitEvent event) {
        plugin.getClanManager().handleQuit(event.getPlayer().getUniqueId());
    }

    /** Leitet Chat in den Clan um, wenn der Clan-Chat-Modus aktiv ist. */
    @EventHandler(priority = EventPriority.LOWEST, ignoreCancelled = true)
    public void onChat(AsyncChatEvent event) {
        Player player = event.getPlayer();
        if (!plugin.getClanManager().isChatOn(player.getUniqueId())) return;
        event.setCancelled(true);
        String message = LegacyComponentSerializer.legacySection().serialize(event.message());
        // Chat kommt async -> auf den Hauptthread wechseln
        Bukkit.getScheduler().runTask(plugin, () -> plugin.getClanManager().sendClanMessage(player, message));
    }
}
