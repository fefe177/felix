package eu.bieder.bigmc.fly;

import eu.bieder.bigmc.BigMC;
import org.bukkit.Bukkit;

import java.util.HashSet;
import java.util.Set;
import java.util.UUID;

/**
 * Kleiner Helfer fuer den kurzzeitigen Sturzschutz nach dem Flug-Ende.
 *
 * Spieler in diesem Set ignorieren fuer eine kurze Zeit Sturzschaden -
 * der FlyListener prueft das beim EntityDamageEvent.
 */
public final class FallProtection {

    private static final Set<UUID> protectedPlayers = new HashSet<>();

    private FallProtection() {
    }

    public static boolean isProtected(UUID uuid) {
        return protectedPlayers.contains(uuid);
    }

    /** Schuetzt einen Spieler fuer "ticks" Server-Ticks vor Sturzschaden. */
    public static void protect(BigMC plugin, UUID uuid, int ticks) {
        protectedPlayers.add(uuid);
        Bukkit.getScheduler().runTaskLater(plugin, () -> protectedPlayers.remove(uuid), ticks);
    }
}
