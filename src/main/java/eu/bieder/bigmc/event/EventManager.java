package eu.bieder.bigmc.event;

import eu.bieder.bigmc.BigMC;
import eu.bieder.bigmc.config.MessageManager;
import org.bukkit.Bukkit;
import org.bukkit.Material;
import org.bukkit.configuration.ConfigurationSection;
import org.bukkit.entity.Player;
import org.bukkit.inventory.ItemStack;

import java.util.LinkedHashSet;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * Verwaltet ein einfaches Server-Event.
 *
 * Es gibt immer hoechstens EIN aktives Event. Ein Admin startet es mit
 * /event start <name>, Spieler treten per /event join bei, und beim /event stop
 * erhalten alle Teilnehmer die in der config hinterlegte Belohnung.
 *
 * Das ist bewusst ein schlankes Grundgeruest: konkrete Spielmechaniken
 * (Arena, Minispiel ...) lassen sich darauf aufbauen.
 */
public class EventManager {

    private final BigMC plugin;

    /** Name des laufenden Events, oder null wenn keins laeuft. */
    private String activeEvent;

    /** Teilnehmer des laufenden Events (Reihenfolge bleibt erhalten). */
    private final Set<UUID> participants = new LinkedHashSet<>();

    public EventManager(BigMC plugin) {
        this.plugin = plugin;
    }

    public boolean isRunning() {
        return activeEvent != null;
    }

    public String getActiveEvent() {
        return activeEvent;
    }

    public int getParticipantCount() {
        return participants.size();
    }

    public boolean isParticipant(UUID uuid) {
        return participants.contains(uuid);
    }

    /**
     * Startet ein neues Event. Schlaegt fehl, wenn bereits eins laeuft.
     */
    public boolean start(String name) {
        if (isRunning()) return false;
        this.activeEvent = name;
        this.participants.clear();

        MessageManager msg = plugin.getMessageManager();
        Bukkit.broadcastMessage(msg.get("event.started", "%name%", name));
        Bukkit.broadcastMessage(msg.get("event.join-hint"));
        return true;
    }

    /**
     * Fuegt einen Spieler dem laufenden Event hinzu.
     * @return false, wenn kein Event laeuft oder er schon dabei ist
     */
    public boolean join(Player player) {
        if (!isRunning()) return false;
        return participants.add(player.getUniqueId());
    }

    /**
     * Entfernt einen Spieler aus dem laufenden Event.
     */
    public boolean leave(UUID uuid) {
        return participants.remove(uuid);
    }

    /**
     * Beendet das Event und zahlt allen anwesenden Teilnehmern die Belohnung aus.
     * @return Anzahl der belohnten Spieler
     */
    public int stop() {
        if (!isRunning()) return 0;

        MessageManager msg = plugin.getMessageManager();
        String name = activeEvent;
        int rewarded = 0;

        for (UUID uuid : participants) {
            Player player = Bukkit.getPlayer(uuid);
            if (player == null) continue; // Offline-Teilnehmer ueberspringen
            giveReward(player);
            msg.send(player, "event.reward-received", "%name%", name);
            rewarded++;
        }

        Bukkit.broadcastMessage(msg.get("event.ended", "%name%", name, "%count%", String.valueOf(rewarded)));

        // Zuruecksetzen
        this.activeEvent = null;
        this.participants.clear();
        return rewarded;
    }

    /**
     * Bricht das Event OHNE Belohnung ab (z.B. bei Plugin-Stop).
     */
    public void cancel() {
        if (!isRunning()) return;
        Bukkit.broadcastMessage(plugin.getMessageManager().get("event.cancelled", "%name%", activeEvent));
        this.activeEvent = null;
        this.participants.clear();
    }

    /**
     * Vergibt die Event-Belohnung (Geld + Items) aus der config an einen Spieler.
     */
    private void giveReward(Player player) {
        ConfigurationSection reward = plugin.getConfigManager().getConfig()
                .getConfigurationSection("event.reward");
        if (reward == null) return;

        double money = reward.getDouble("money", 0);
        if (money > 0) {
            plugin.getEconomyManager().deposit(player.getUniqueId(), money);
        }

        ConfigurationSection items = reward.getConfigurationSection("items");
        if (items != null) {
            for (String matName : items.getKeys(false)) {
                Material mat = Material.matchMaterial(matName);
                if (mat == null) {
                    plugin.getLogger().warning("Event-Belohnung: unbekanntes Material '" + matName + "'.");
                    continue;
                }
                int amount = items.getInt(matName, 1);
                Map<Integer, ItemStack> leftover =
                        player.getInventory().addItem(new ItemStack(mat, amount));
                leftover.values().forEach(rest ->
                        player.getWorld().dropItemNaturally(player.getLocation(), rest));
            }
        }
    }
}
