package eu.bieder.bigmc.fly;

import eu.bieder.bigmc.BigMC;
import org.bukkit.Bukkit;
import org.bukkit.entity.Player;
import org.bukkit.scheduler.BukkitTask;

import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

/**
 * Verwaltet das kostenpflichtige, zeitlich befristete Fliegen.
 *
 * Beim Kauf wird der Preis aus der config abgebucht und der Flugmodus fuer
 * eine bestimmte Dauer aktiviert. Ein Timer pro Spieler beendet den Flug nach
 * Ablauf automatisch, warnt kurz vorher und schaltet das Fliegen sicher ab
 * (kurzzeitiger Sturzschutz, damit niemand zu Tode faellt).
 */
public class FlyManager {

    /** Aktive Flug-Sessions: Spieler -> Endzeitpunkt (ms). */
    private final Map<UUID, Long> flyUntil = new HashMap<>();

    /** Laufende Ablauf-Timer pro Spieler. */
    private final Map<UUID, BukkitTask> tasks = new HashMap<>();

    private final BigMC plugin;

    public FlyManager(BigMC plugin) {
        this.plugin = plugin;
    }

    public boolean isFlying(UUID uuid) {
        return flyUntil.containsKey(uuid);
    }

    /** Verbleibende Flugzeit in Sekunden (0, wenn kein Flug aktiv). */
    public long getRemainingSeconds(UUID uuid) {
        Long until = flyUntil.get(uuid);
        if (until == null) return 0;
        return Math.max(0, (until - System.currentTimeMillis()) / 1000L);
    }

    /**
     * Aktiviert das Fliegen fuer die konfigurierte Dauer.
     * Hat der Spieler bereits Flugzeit, wird die neue Dauer aufaddiert.
     */
    public void enableFly(Player player) {
        int durationSeconds = plugin.getConfigManager().getConfig().getInt("fly.duration-seconds", 300);
        long now = System.currentTimeMillis();

        // Bei Verlaengerung auf die Restzeit aufaddieren
        long base = Math.max(now, flyUntil.getOrDefault(player.getUniqueId(), now));
        long until = base + durationSeconds * 1000L;
        flyUntil.put(player.getUniqueId(), until);

        player.setAllowFlight(true);
        player.setFlying(true);

        scheduleExpiry(player.getUniqueId());
    }

    /**
     * Plant/erneuert den Ablauf-Task fuer einen Spieler (jede Sekunde geprueft).
     */
    private void scheduleExpiry(UUID uuid) {
        // Alten Task abbrechen, falls vorhanden
        BukkitTask existing = tasks.remove(uuid);
        if (existing != null) existing.cancel();

        int warnSeconds = plugin.getConfigManager().getConfig().getInt("fly.warn-seconds", 10);

        BukkitTask task = Bukkit.getScheduler().runTaskTimer(plugin, () -> {
            Player player = Bukkit.getPlayer(uuid);
            if (player == null) {
                // Spieler offline -> Flug merken wir uns nicht weiter
                disableFly(uuid, false);
                return;
            }
            long remaining = getRemainingSeconds(uuid);

            // Kurz vor Ablauf einmalig warnen
            if (remaining == warnSeconds) {
                plugin.getMessageManager().send(player, "fly.expiring-soon",
                        "%seconds%", String.valueOf(warnSeconds));
            }

            if (remaining <= 0) {
                disableFly(uuid, true);
                plugin.getMessageManager().send(player, "fly.expired");
            }
        }, 20L, 20L);

        tasks.put(uuid, task);
    }

    /**
     * Schaltet das Fliegen ab.
     * @param applyFallProtection true = kurzer Sturzschutz, damit der Spieler
     *                            nicht durch den ploetzlichen Stopp Schaden nimmt
     */
    public void disableFly(UUID uuid, boolean applyFallProtection) {
        flyUntil.remove(uuid);
        BukkitTask task = tasks.remove(uuid);
        if (task != null) task.cancel();

        Player player = Bukkit.getPlayer(uuid);
        if (player == null) return;

        // Im Kreativ-/Spectator-Modus das Fliegen NICHT wegnehmen
        if (player.getGameMode() == org.bukkit.GameMode.CREATIVE
                || player.getGameMode() == org.bukkit.GameMode.SPECTATOR) {
            return;
        }

        player.setFlying(false);
        player.setAllowFlight(false);

        // Kurzer Schutz vor Sturzschaden nach dem Abschalten
        if (applyFallProtection) {
            int ticks = plugin.getConfigManager().getConfig().getInt("fly.fall-protection-ticks", 100);
            player.setFallDistance(0f);
            FallProtection.protect(plugin, uuid, ticks);
        }
    }

    /** Beim Plugin-Stop alle Tasks sauber beenden. */
    public void shutdown() {
        for (BukkitTask task : tasks.values()) {
            task.cancel();
        }
        tasks.clear();
        flyUntil.clear();
    }
}
