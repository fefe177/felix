package eu.bieder.bigmc.cosmetics;

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

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Cosmetics-GUI: Hauptmenue mit Kategorien und Kategorie-Ansichten zum
 * Ausruesten/Entfernen einzelner Cosmetics.
 */
public class CosmeticsGUI implements Listener {

    public static class MainHolder implements InventoryHolder {
        private final Map<Integer, CosmeticCategory> slots = new HashMap<>();
        private Inventory inventory;
        @Override public Inventory getInventory() { return inventory; }
    }

    public static class CategoryHolder implements InventoryHolder {
        private final CosmeticCategory category;
        private final Map<Integer, String> slotCosmetic = new HashMap<>(); // slot -> id (null = entfernen)
        private int backSlot = -1;
        private Inventory inventory;
        CategoryHolder(CosmeticCategory category) { this.category = category; }
        @Override public Inventory getInventory() { return inventory; }
    }

    private final BigMC plugin;

    public CosmeticsGUI(BigMC plugin) {
        this.plugin = plugin;
    }

    public void openMain(Player player) {
        MessageManager msg = plugin.getMessageManager();
        MainHolder holder = new MainHolder();
        Inventory inv = Bukkit.createInventory(holder, 27, msg.getRaw("cosmetics.gui-title"));
        holder.inventory = inv;
        GuiDesign.fillBorder(inv);

        CosmeticCategory[] cats = CosmeticCategory.values();
        int[] slots = GuiDesign.centeredSlots(1, cats.length);
        for (int i = 0; i < cats.length; i++) {
            CosmeticCategory cat = cats[i];
            inv.setItem(slots[i], GuiDesign.named(cat.icon, cat.display,
                    List.of(msg.getRaw("cosmetics.category-lore"))));
            holder.slots.put(slots[i], cat);
        }
        player.openInventory(inv);
    }

    public void openCategory(Player player, CosmeticCategory category) {
        MessageManager msg = plugin.getMessageManager();
        List<Cosmetic> list = plugin.getCosmeticsManager().getCosmetics(category);
        int innerRows = Math.max(1, (list.size() + 1 + 6) / 7);
        int rows = Math.min(6, innerRows + 2);

        CategoryHolder holder = new CategoryHolder(category);
        Inventory inv = Bukkit.createInventory(holder, rows * 9,
                msg.getRaw("cosmetics.category-title").replace("%category%", MessageManager.color(category.display)));
        holder.inventory = inv;
        GuiDesign.fillBorder(inv);

        String equipped = plugin.getCosmeticsManager().getEquippedId(player.getUniqueId(), category);

        // "Entfernen"-Option als ersten Slot der ersten Reihe
        int[] firstRow = GuiDesign.centeredSlots(1, Math.min(7, list.size() + 1));
        int slot0 = firstRow[0];
        ItemStack noneItem = GuiDesign.named(Material.BARRIER, msg.getRaw("cosmetics.none"),
                List.of(equipped == null ? msg.getRaw("cosmetics.equipped") : msg.getRaw("cosmetics.click-equip")));
        if (equipped == null) GuiDesign.glow(noneItem); // aktuell "nichts ausgeruestet" hervorheben
        inv.setItem(slot0, noneItem);
        holder.slotCosmetic.put(slot0, null);

        // Cosmetics ab dem zweiten Slot der ersten Reihe, dann weitere Reihen
        int index = 0;
        outer:
        for (int row = 1; row <= innerRows; row++) {
            int[] rowSlots = GuiDesign.centeredSlots(row, 7);
            for (int rs : rowSlots) {
                if (row == 1 && rs == slot0) continue; // None-Slot ueberspringen
                if (index >= list.size()) break outer;
                Cosmetic cosmetic = list.get(index++);
                boolean isEquipped = cosmetic.id().equals(equipped);
                List<String> lore = new ArrayList<>();
                lore.add(isEquipped ? msg.getRaw("cosmetics.equipped") : msg.getRaw("cosmetics.click-equip"));
                ItemStack item = GuiDesign.named(cosmetic.icon(), cosmetic.display(), lore);
                if (isEquipped) GuiDesign.glow(item); // ausgeruestetes Cosmetic leuchtet
                inv.setItem(rs, item);
                holder.slotCosmetic.put(rs, cosmetic.id());
            }
        }

        holder.backSlot = inv.getSize() - 5;
        inv.setItem(holder.backSlot, GuiDesign.named(Material.ARROW, msg.getRaw("cosmetics.back"), List.of()));
        player.openInventory(inv);
    }

    @EventHandler
    public void onClick(InventoryClickEvent event) {
        InventoryHolder h = event.getView().getTopInventory().getHolder();
        if (!(h instanceof MainHolder || h instanceof CategoryHolder)) return;
        event.setCancelled(true);
        if (!(event.getWhoClicked() instanceof Player player)) return;
        if (event.getClickedInventory() != event.getView().getTopInventory()) return;

        if (h instanceof MainHolder main) {
            CosmeticCategory cat = main.slots.get(event.getSlot());
            if (cat != null) {
                GuiDesign.soundClick(player);
                openCategory(player, cat);
            }
            return;
        }

        CategoryHolder cat = (CategoryHolder) h;
        if (event.getSlot() == cat.backSlot) {
            GuiDesign.soundClick(player);
            openMain(player);
            return;
        }
        if (!cat.slotCosmetic.containsKey(event.getSlot())) return;
        String id = cat.slotCosmetic.get(event.getSlot());
        plugin.getCosmeticsManager().equip(player.getUniqueId(), cat.category, id);
        GuiDesign.soundSuccess(player);
        plugin.getMessageManager().send(player, "cosmetics.applied");
        openCategory(player, cat.category);
    }

    @EventHandler
    public void onDrag(InventoryDragEvent event) {
        InventoryHolder h = event.getView().getTopInventory().getHolder();
        if (h instanceof MainHolder || h instanceof CategoryHolder) {
            event.setCancelled(true);
        }
    }
}
