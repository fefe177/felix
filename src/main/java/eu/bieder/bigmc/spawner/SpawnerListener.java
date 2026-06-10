package eu.bieder.bigmc.spawner;

import eu.bieder.bigmc.BigMC;
import eu.bieder.bigmc.config.MessageManager;
import org.bukkit.Location;
import org.bukkit.Material;
import org.bukkit.block.Block;
import org.bukkit.block.CreatureSpawner;
import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.Listener;
import org.bukkit.event.block.BlockBreakEvent;
import org.bukkit.event.block.BlockPlaceEvent;
import org.bukkit.event.block.SpawnerSpawnEvent;
import org.bukkit.event.player.PlayerInteractEvent;
import org.bukkit.inventory.EquipmentSlot;
import org.bukkit.inventory.ItemStack;

import java.util.Map;
import java.util.Optional;

/**
 * Verbindet die Custom-Spawner mit der Welt:
 * - Platzieren: Spawner-Item -> Datenbank-Eintrag, optische Figur, Mob-Spawn aus
 * - Rechtsklick: mit Spawner in der Hand -> stapeln, sonst -> Abhol-GUI
 * - Abbauen: nur Besitzer/Admin, gibt Spawner-Items + Vorrat zurueck
 * - SpawnerSpawnEvent: verhindert, dass Custom-Spawner echte Mobs spawnen
 */
public class SpawnerListener implements Listener {

    private final BigMC plugin;

    public SpawnerListener(BigMC plugin) {
        this.plugin = plugin;
    }

    // ----- Platzieren -----

    @EventHandler
    public void onPlace(BlockPlaceEvent event) {
        ItemStack inHand = event.getItemInHand();
        Optional<SpawnerType> typeOpt = plugin.getSpawnerManager().getTypeFromItem(inHand);
        if (typeOpt.isEmpty()) return; // kein Custom-Spawner

        SpawnerType type = typeOpt.get();
        Player player = event.getPlayer();
        Block block = event.getBlockPlaced();
        Location loc = block.getLocation();

        // In der Datenbank registrieren (Stapelgroesse 1)
        plugin.getSpawnerManager().placeSpawner(loc, type, 1, player.getUniqueId());

        // Optische Figur setzen + Spawn-Delay hoch (Spawnen wird zusaetzlich gecancelt)
        if (block.getState() instanceof CreatureSpawner cs) {
            if (type.displayEntity() != null) {
                cs.setSpawnedType(type.displayEntity());
            }
            cs.setMinSpawnDelay(Integer.MAX_VALUE);
            cs.setMaxSpawnDelay(Integer.MAX_VALUE);
            cs.setRequiredPlayerRange(0);
            cs.update();
        }

        plugin.getMessageManager().send(player, "spawner.placed",
                "%type%", MessageManager.color(type.displayName()));
    }

    // ----- Rechtsklick (stapeln oder abholen) -----

    @EventHandler
    public void onInteract(PlayerInteractEvent event) {
        if (event.getHand() != EquipmentSlot.HAND) return;
        if (event.getClickedBlock() == null) return;
        if (event.getClickedBlock().getType() != Material.SPAWNER) return;
        if (event.getAction() != org.bukkit.event.block.Action.RIGHT_CLICK_BLOCK) return;

        Location loc = event.getClickedBlock().getLocation();
        Optional<PlacedSpawner> spawnerOpt = plugin.getSpawnerManager().getSpawnerAt(loc);
        if (spawnerOpt.isEmpty()) return; // normaler Vanilla-Spawner

        // Ab hier ist es unser Spawner -> Vanilla-Verhalten unterbinden
        event.setCancelled(true);

        Player player = event.getPlayer();
        PlacedSpawner spawner = spawnerOpt.get();
        MessageManager msg = plugin.getMessageManager();

        // Nur der Besitzer (oder Admin) darf interagieren
        if (!isOwnerOrAdmin(player, spawner)) {
            msg.send(player, "spawner.not-owner");
            return;
        }

        // Spawner in der Hand vom gleichen Typ? -> stapeln
        ItemStack hand = player.getInventory().getItemInMainHand();
        Optional<SpawnerType> handType = plugin.getSpawnerManager().getTypeFromItem(hand);
        if (handType.isPresent() && handType.get().id().equals(spawner.typeId())) {
            stack(player, spawner, hand);
            return;
        }

        // Sonst: Abhol-GUI oeffnen
        plugin.getSpawnerCollectGUI().open(player, spawner.id());
    }

    /** Packt Spawner aus der Hand in den platzierten Spawner (bis max-stack). */
    private void stack(Player player, PlacedSpawner spawner, ItemStack hand) {
        MessageManager msg = plugin.getMessageManager();
        int max = plugin.getSpawnerManager().getMaxStack();

        int canAdd = max - spawner.stackSize();
        if (canAdd <= 0) {
            msg.send(player, "spawner.stack-full", "%max%", String.valueOf(max));
            return;
        }
        int adding = Math.min(canAdd, hand.getAmount());

        plugin.getSpawnerManager().setStackSize(spawner.id(), spawner.stackSize() + adding);

        // Verbrauchte Spawner aus der Hand entfernen
        hand.setAmount(hand.getAmount() - adding);
        player.getInventory().setItemInMainHand(hand.getAmount() > 0 ? hand : null);

        msg.send(player, "spawner.stacked",
                "%added%", String.valueOf(adding),
                "%total%", String.valueOf(spawner.stackSize() + adding));
    }

    // ----- Abbauen -----

    @EventHandler
    public void onBreak(BlockBreakEvent event) {
        if (event.getBlock().getType() != Material.SPAWNER) return;
        Location loc = event.getBlock().getLocation();
        Optional<PlacedSpawner> spawnerOpt = plugin.getSpawnerManager().getSpawnerAt(loc);
        if (spawnerOpt.isEmpty()) return;

        Player player = event.getPlayer();
        PlacedSpawner spawner = spawnerOpt.get();
        MessageManager msg = plugin.getMessageManager();

        if (!isOwnerOrAdmin(player, spawner)) {
            event.setCancelled(true);
            msg.send(player, "spawner.not-owner");
            return;
        }

        // Kein Vanilla-Drop (Spawner droppt sonst nichts/Erfahrung)
        event.setDropItems(false);
        event.setExpToDrop(0);

        SpawnerType type = plugin.getSpawnerManager().getType(spawner.typeId()).orElse(null);
        if (type != null) {
            // Spawner-Items zurueckgeben (entsprechend der Stapelgroesse)
            ItemStack giveBack = plugin.getSpawnerManager().createSpawnerItem(type, 1);
            giveBack.setAmount(1);
            for (int i = 0; i < spawner.stackSize(); i++) {
                Map<Integer, ItemStack> left = player.getInventory().addItem(giveBack.clone());
                left.values().forEach(rest ->
                        player.getWorld().dropItemNaturally(loc, rest));
            }
            // Noch gespeicherte Items fallen lassen, damit nichts verloren geht
            if (spawner.stored() > 0) {
                long remaining = spawner.stored();
                int maxStack = type.product().getMaxStackSize();
                while (remaining > 0) {
                    int chunk = (int) Math.min(remaining, maxStack);
                    player.getWorld().dropItemNaturally(loc, new ItemStack(type.product(), chunk));
                    remaining -= chunk;
                }
            }
        }

        plugin.getSpawnerManager().deleteSpawner(spawner.id());
        msg.send(player, "spawner.broken", "%amount%", String.valueOf(spawner.stackSize()));
    }

    // ----- Mob-Spawn unterbinden -----

    @EventHandler
    public void onSpawn(SpawnerSpawnEvent event) {
        if (event.getSpawner() == null) return;
        Location loc = event.getSpawner().getLocation();
        if (plugin.getSpawnerManager().getSpawnerAt(loc).isPresent()) {
            event.setCancelled(true); // Custom-Spawner spawnen keine Mobs
        }
    }

    // ----- Hilfen -----

    private boolean isOwnerOrAdmin(Player player, PlacedSpawner spawner) {
        return player.getUniqueId().equals(spawner.owner())
                || player.hasPermission("bigmc.spawner.admin");
    }
}
