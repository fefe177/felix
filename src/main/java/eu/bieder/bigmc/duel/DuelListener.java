package eu.bieder.bigmc.duel;

import eu.bieder.bigmc.BigMC;
import org.bukkit.Bukkit;
import org.bukkit.attribute.Attribute;
import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.Listener;
import org.bukkit.event.entity.EntityDamageEvent;
import org.bukkit.event.entity.PlayerDeathEvent;
import org.bukkit.event.player.PlayerMoveEvent;
import org.bukkit.event.player.PlayerQuitEvent;

import java.util.UUID;

/**
 * Verbindet die Duell-Logik mit den Spielereignissen:
 * - Toedlicher Schaden im Duell -> abfangen, Gegner gewinnt (kein Sterben/Drop)
 * - Tod im Duell (Sonderfall, z.B. /kill) -> Sicherheitsnetz: Gegner gewinnt
 * - Quit im Duell -> Gegner gewinnt
 * - Schaden/Bewegung waehrend des Countdowns blockieren
 */
public class DuelListener implements Listener {

    private final BigMC plugin;

    public DuelListener(BigMC plugin) {
        this.plugin = plugin;
    }

    /**
     * Hauptweg fuer den Sieg: Wuerde ein Treffer den Spieler toeten, fangen wir
     * ihn ab, heilen den Spieler und werten ihn als Verlierer. So entsteht nie
     * ein echter Tod (kein Respawn-Bildschirm, keine verlorenen Items).
     */
    @EventHandler(ignoreCancelled = true)
    public void onDamage(EntityDamageEvent event) {
        if (!(event.getEntity() instanceof Player player)) return;
        Duel duel = plugin.getDuelManager().getDuel(player.getUniqueId());
        if (duel == null) return;

        // Waehrend des Countdowns ist niemand verwundbar
        if (duel.isCountdownActive()) {
            event.setCancelled(true);
            return;
        }

        // Toedlicher Schaden? -> abfangen und Duell auswerten
        if (event.getFinalDamage() >= player.getHealth()) {
            event.setCancelled(true);
            double maxHealth = player.getAttribute(Attribute.MAX_HEALTH).getValue();
            player.setHealth(maxHealth);
            player.setFireTicks(0);
            plugin.getDuelManager().finishDuel(player.getUniqueId());
        }
    }

    /**
     * Sicherheitsnetz: Stirbt ein Duellant doch (z.B. durch /kill oder einen
     * Schadens-Sonderfall ohne Event), wandeln wir das in einen Duell-Sieg um.
     */
    @EventHandler
    public void onDeath(PlayerDeathEvent event) {
        Player player = event.getEntity();
        if (!plugin.getDuelManager().isInDuel(player.getUniqueId())) return;

        event.setKeepInventory(true);
        event.setKeepLevel(true);
        event.getDrops().clear();
        event.setDroppedExp(0);
        event.deathMessage(null);

        UUID id = player.getUniqueId();
        // Im naechsten Tick respawnen und auswerten (im Death-Event selbst geht das nicht)
        Bukkit.getScheduler().runTask(plugin, () -> {
            if (player.isDead()) {
                player.spigot().respawn();
            }
            plugin.getDuelManager().finishDuel(id);
        });
    }

    /** Verlaesst ein Duellant den Server, gewinnt der Gegner. */
    @EventHandler
    public void onQuit(PlayerQuitEvent event) {
        Player player = event.getPlayer();
        if (plugin.getDuelManager().isInDuel(player.getUniqueId())) {
            plugin.getDuelManager().handleQuit(player.getUniqueId());
        }
        // Offene Herausforderung dieses Spielers entfernen
        plugin.getDuelManager().removeChallenge(player.getUniqueId());
    }

    /** Waehrend des Countdowns darf man sich nicht von der Stelle bewegen. */
    @EventHandler
    public void onMove(PlayerMoveEvent event) {
        Duel duel = plugin.getDuelManager().getDuel(event.getPlayer().getUniqueId());
        if (duel == null || !duel.isCountdownActive()) return;

        // Nur echten Positionswechsel blockieren, Umschauen erlauben
        if (event.getFrom().getBlockX() != event.getTo().getBlockX()
                || event.getFrom().getBlockZ() != event.getTo().getBlockZ()) {
            org.bukkit.Location stay = event.getFrom().clone();
            stay.setDirection(event.getTo().getDirection());
            event.setTo(stay);
        }
    }
}
