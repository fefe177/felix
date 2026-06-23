package eu.bieder.bigmc.tpa;

import eu.bieder.bigmc.BigMC;
import org.bukkit.Bukkit;
import org.bukkit.entity.Player;

import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * Teleport-Anfragen (/tpa) zwischen Spielern.
 *
 * Wichtig auf einem gefaehrlichen SMP: Niemand wird ohne Zustimmung
 * teleportiert - der Zielspieler muss mit /tpaccept annehmen.
 * Anfragen verfallen nach einem konfigurierbaren Timeout.
 */
public class TpaManager {

    private final BigMC plugin;

    /** Offene Anfragen: Ziel-UUID -> Anfragender. */
    private final Map<UUID, UUID> requests = new HashMap<>();

    /** Spieler, die eingehende Anfragen automatisch annehmen (/tpauto). */
    private final Set<UUID> autoAccept = new HashSet<>();

    public TpaManager(BigMC plugin) {
        this.plugin = plugin;
    }

    /** Schaltet Auto-Accept fuer einen Spieler um. @return neuer Zustand. */
    public boolean toggleAuto(UUID uuid) {
        if (autoAccept.contains(uuid)) {
            autoAccept.remove(uuid);
            return false;
        }
        autoAccept.add(uuid);
        return true;
    }

    public boolean isAuto(UUID uuid) {
        return autoAccept.contains(uuid);
    }

    /** Speichert eine Anfrage und laesst sie nach dem Timeout verfallen. */
    public void addRequest(Player requester, Player target) {
        // Auto-Accept: sofort teleportieren, keine Anfrage noetig
        if (autoAccept.contains(target.getUniqueId())) {
            requester.setFallDistance(0f);
            requester.teleport(target.getLocation());
            plugin.getMessageManager().send(requester, "tpa.accepted-notify", "%player%", target.getName());
            plugin.getMessageManager().send(target, "tpa.auto-accepted", "%player%", requester.getName());
            return;
        }
        requests.put(target.getUniqueId(), requester.getUniqueId());

        int timeout = plugin.getConfigManager().getConfig().getInt("tpa.timeout-seconds", 60);
        UUID targetId = target.getUniqueId();
        UUID requesterId = requester.getUniqueId();

        Bukkit.getScheduler().runTaskLater(plugin, () -> {
            // Nur entfernen, wenn es noch dieselbe Anfrage ist
            if (requesterId.equals(requests.get(targetId))) {
                requests.remove(targetId);
                Player r = Bukkit.getPlayer(requesterId);
                if (r != null) {
                    plugin.getMessageManager().send(r, "tpa.expired");
                }
            }
        }, 20L * timeout);
    }

    public UUID getRequester(UUID target) {
        return requests.get(target);
    }

    public boolean hasRequest(UUID target) {
        return requests.containsKey(target);
    }

    public void removeRequest(UUID target) {
        requests.remove(target);
    }

    /** Beim Quit alle Anfragen dieses Spielers (als Ziel) entfernen. */
    public void handleQuit(UUID uuid) {
        requests.remove(uuid);
        // Auch Anfragen entfernen, die dieser Spieler gestellt hat
        requests.values().removeIf(requester -> requester.equals(uuid));
    }
}
