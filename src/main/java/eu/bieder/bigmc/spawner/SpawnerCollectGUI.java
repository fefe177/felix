package eu.bieder.bigmc.spawner;

import eu.bieder.bigmc.BigMC;
import eu.bieder.bigmc.config.MessageManager;
import eu.bieder.bigmc.util.GuiDesign;
import org.bukkit.Bukkit;
import org.bukkit.Material;
import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.Listener;
import org.bukkit.event.inventory.InventoryClickEvent;
import org.bukkit.event.inventory.InventoryDragEvent;
import org.bukkit.inventory.Inventory;
import org.bukkit.inventory.InventoryHolder;
import org.bukkit.inventory.ItemStack;
import org.bukkit.inventory.meta.ItemMeta;

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

/**
 * Das GUI, das beim Rechtsklick auf einen Custom-Spawner aufgeht.
 * Zeigt Infos, den gespeicherten Vorrat und einen Abhol-Button.
 */
public class SpawnerCollectGUI implements Listener {

    private static final int SLOT_INFO = 11;
    private static final int SLOT_PRODUCT = 13;
    private static final int SLOT_COLLECT = 15;

    /** Holder merkt sich, zu welchem Spawner das GUI gehoert. */
    public static class Holder implements InventoryHolder {
        private final int spawnerId;
        private Inventory inventory;

        public Holder(int spawnerId) {
            this.spawnerId = spawnerId;
        }

        @Override
        public Inventory getInventory() {
            return inventory;
        }
    }

    private final BigMC plugin;

    public SpawnerCollectGUI(BigMC plugin) {
        this.plugin = plugin;
    }

    /** Oeffnet das GUI fuer einen platzierten Spawner. */
    public void open(Player player, int spawnerId) {
        Optional<PlacedSpawner> spawnerOpt = plugin.getSpawnerManager().getSpawner(spawnerId);
        if (spawnerOpt.isEmpty()) {
            plugin.getMessageManager().send(player, "spawner.gone");
            return;
        }
        PlacedSpawner spawner = spawnerOpt.get();
        SpawnerType type = plugin.getSpawnerManager().getType(spawner.typeId()).orElse(null);
        if (type == null) return;

        MessageManager msg = plugin.getMessageManager();
        Holder holder = new Holder(spawnerId);
        Inventory inv = Bukkit.createInventory(holder, 27, msg.getRaw("spawner.gui-title"));
        holder.inventory = inv;

        // Hintergrund komplett im Kisten-Design fuellen
        GuiDesign.fillAll(inv);
        inv.setItem(SLOT_COLLECT + 1, GuiDesign.pane(org.bukkit.Material.LIME_STAINED_GLASS_PANE));
        inv.setItem(SLOT_INFO - 1, GuiDesign.pane(GuiDesign.ACCENT));

        // Info-Item (Spawner mit Stack/Produktionsdaten)
        long perCycleTotal = (long) type.amountPerCycle() * spawner.stackSize();
        ItemStack info = named(Material.SPAWNER, MessageManager.color(type.displayName()), List.of(
                msg.getRaw("spawner.gui-stack").replace("%stack%", String.valueOf(spawner.stackSize()))
                        .replace("%max%", String.valueOf(plugin.getSpawnerManager().getMaxStack())),
                msg.getRaw("spawner.gui-rate")
                        .replace("%amount%", String.valueOf(perCycleTotal))
                        .replace("%item%", SpawnerManager.prettyMaterial(type.product()))
                        .replace("%interval%", String.valueOf(type.intervalSeconds()))));
        inv.setItem(SLOT_INFO, info);

        // Produkt mit gespeicherter Menge + Speicher-Fortschrittsbalken
        long cap = type.maxStoragePerStack() * (long) spawner.stackSize();
        ItemStack product = named(type.product(), MessageManager.color(
                "&e" + spawner.stored() + "x " + SpawnerManager.prettyMaterial(type.product())),
                List.of(
                        msg.getRaw("spawner.gui-stored")
                                .replace("%stored%", String.valueOf(spawner.stored())),
                        msg.getRaw("spawner.gui-storage")
                                .replace("%cap%", String.valueOf(cap)),
                        GuiDesign.progressBar(spawner.stored(), cap)));
        inv.setItem(SLOT_PRODUCT, product);

        // Abhol-Button
        inv.setItem(SLOT_COLLECT, named(Material.HOPPER, msg.getRaw("spawner.gui-collect"), List.of()));

        player.openInventory(inv);
    }

    private ItemStack named(Material material, String name, List<String> lore) {
        ItemStack stack = new ItemStack(material);
        ItemMeta meta = stack.getItemMeta();
        if (meta != null) {
            meta.setDisplayName(name);
            if (!lore.isEmpty()) meta.setLore(new ArrayList<>(lore));
            stack.setItemMeta(meta);
        }
        return stack;
    }

    // ----- Klicks -----

    @EventHandler
    public void onClick(InventoryClickEvent event) {
        if (!(event.getView().getTopInventory().getHolder() instanceof Holder holder)) return;
        event.setCancelled(true);
        if (!(event.getWhoClicked() instanceof Player player)) return;
        if (event.getClickedInventory() != event.getView().getTopInventory()) return;

        if (event.getSlot() != SLOT_COLLECT && event.getSlot() != SLOT_PRODUCT) return;

        PlacedSpawner spawner = plugin.getSpawnerManager().getSpawner(holder.spawnerId).orElse(null);
        if (spawner == null) {
            plugin.getMessageManager().send(player, "spawner.gone");
            player.closeInventory();
            return;
        }

        long collected = plugin.getSpawnerManager().collect(player, spawner);
        MessageManager msg = plugin.getMessageManager();
        if (collected <= 0) {
            GuiDesign.soundError(player);
            msg.send(player, "spawner.collect-empty");
        } else {
            GuiDesign.soundSuccess(player);
            msg.send(player, "spawner.collected",
                    "%amount%", String.valueOf(collected),
                    "%item%", SpawnerManager.prettyMaterial(
                            plugin.getSpawnerManager().getType(spawner.typeId())
                                    .map(SpawnerType::product).orElse(Material.BONE)));
        }
        // GUI mit aktualisiertem Vorrat neu aufbauen
        open(player, holder.spawnerId);
    }

    @EventHandler
    public void onDrag(InventoryDragEvent event) {
        if (event.getView().getTopInventory().getHolder() instanceof Holder) {
            event.setCancelled(true);
        }
    }
}
