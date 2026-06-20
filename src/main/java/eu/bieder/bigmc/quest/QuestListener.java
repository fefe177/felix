package eu.bieder.bigmc.quest;

import eu.bieder.bigmc.BigMC;
import org.bukkit.block.Block;
import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.Listener;
import org.bukkit.event.block.BlockBreakEvent;
import org.bukkit.event.block.BlockPlaceEvent;
import org.bukkit.event.entity.EntityDeathEvent;
import org.bukkit.event.entity.PlayerDeathEvent;
import org.bukkit.event.player.PlayerFishEvent;
import org.bukkit.event.player.PlayerJoinEvent;
import org.bukkit.event.player.PlayerQuitEvent;

import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;

/**
 * Meldet Spielereignisse an den QuestManager.
 *
 * Farm-Schutz: Bloecke, die ein Spieler selbst platziert hat, zaehlen beim
 * Abbauen NICHT fuer Quests (verhindert Platzieren-und-Abbauen-Exploits).
 * Die Menge selbst-platzierter Positionen ist gedeckelt, um Speicherwachstum
 * zu vermeiden.
 */
public class QuestListener implements Listener {

    private static final int MAX_TRACKED = 200_000;

    private final BigMC plugin;

    /** Gedeckelte Menge selbst-platzierter Block-Positionen (aelteste werden verworfen). */
    private final Set<Long> playerPlaced = Collections.newSetFromMap(
            new LinkedHashMap<Long, Boolean>(16, 0.75f, false) {
                @Override
                protected boolean removeEldestEntry(Map.Entry<Long, Boolean> eldest) {
                    return size() > MAX_TRACKED;
                }
            });

    public QuestListener(BigMC plugin) {
        this.plugin = plugin;
    }

    private long key(Block b) {
        // Position + Welt grob kodieren (Kollisionen sind fuer den Farm-Schutz unkritisch)
        long base = (((long) b.getX() & 0x3FFFFFFL) << 38)
                | (((long) b.getZ() & 0x3FFFFFFL) << 12)
                | ((long) (b.getY() + 2048) & 0xFFFL);
        return base ^ ((long) b.getWorld().getUID().hashCode() << 1);
    }

    @EventHandler
    public void onJoin(PlayerJoinEvent event) {
        plugin.getQuestManager().loadPlayer(event.getPlayer().getUniqueId());
    }

    @EventHandler
    public void onQuit(PlayerQuitEvent event) {
        plugin.getQuestManager().unloadPlayer(event.getPlayer().getUniqueId());
    }

    @EventHandler(ignoreCancelled = true)
    public void onPlace(BlockPlaceEvent event) {
        playerPlaced.add(key(event.getBlock()));
    }

    @EventHandler(ignoreCancelled = true)
    public void onBreak(BlockBreakEvent event) {
        Player player = event.getPlayer();
        // Selbst platzierte Bloecke nicht werten
        if (playerPlaced.remove(key(event.getBlock()))) return;
        plugin.getQuestManager().handle(player, QuestObjective.BREAK,
                event.getBlock().getType().name(), 1);
    }

    @EventHandler(ignoreCancelled = true)
    public void onPlaceQuest(BlockPlaceEvent event) {
        plugin.getQuestManager().handle(event.getPlayer(), QuestObjective.PLACE,
                event.getBlock().getType().name(), 1);
    }

    @EventHandler
    public void onEntityDeath(EntityDeathEvent event) {
        if (event.getEntity() instanceof Player) return; // PvP via PlayerDeathEvent
        Player killer = event.getEntity().getKiller();
        if (killer == null) return;
        plugin.getQuestManager().handle(killer, QuestObjective.KILL_ENTITY,
                event.getEntityType().name(), 1);
    }

    @EventHandler
    public void onPlayerDeath(PlayerDeathEvent event) {
        Player victim = event.getEntity();
        Player killer = victim.getKiller();
        if (killer == null || killer.getUniqueId().equals(victim.getUniqueId())) return;
        plugin.getQuestManager().handle(killer, QuestObjective.KILL_PLAYER, null, 1);
    }

    @EventHandler(ignoreCancelled = true)
    public void onFish(PlayerFishEvent event) {
        if (event.getState() != PlayerFishEvent.State.CAUGHT_FISH) return;
        plugin.getQuestManager().handle(event.getPlayer(), QuestObjective.FISH, null, 1);
    }
}
