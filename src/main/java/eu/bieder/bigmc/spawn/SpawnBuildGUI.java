package eu.bieder.bigmc.spawn;

import eu.bieder.bigmc.BigMC;
import eu.bieder.bigmc.config.MessageManager;
import eu.bieder.bigmc.util.GuiDesign;
import org.bukkit.Bukkit;
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
 * Auswahl-GUI fuer /spawnbuild: zeigt die 5 Spawn-Designs zur Auswahl.
 * Ein Klick baut das gewaehlte Design an der Position des Spielers.
 */
public class SpawnBuildGUI implements Listener {

    /** Marker-Holder mit Slot -> Theme-Zuordnung. */
    public static class Holder implements InventoryHolder {
        private final Map<Integer, SpawnTheme> slots = new HashMap<>();
        private Inventory inventory;
        @Override public Inventory getInventory() { return inventory; }
    }

    private final BigMC plugin;

    public SpawnBuildGUI(BigMC plugin) {
        this.plugin = plugin;
    }

    public void open(Player player) {
        MessageManager msg = plugin.getMessageManager();
        List<SpawnTheme> themes = SpawnThemes.all();

        // Bis zu 7 Themes pro Reihe; Inventargroesse passt sich an die Anzahl an
        int innerRows = Math.max(1, (themes.size() + 6) / 7);
        int rows = Math.min(6, innerRows + 2);

        Holder holder = new Holder();
        Inventory inv = Bukkit.createInventory(holder, rows * 9, msg.getRaw("spawn.gui-title"));
        holder.inventory = inv;
        GuiDesign.fillBorder(inv);

        int index = 0;
        for (int row = 1; row <= innerRows && index < themes.size(); row++) {
            int inThisRow = Math.min(7, themes.size() - index);
            int[] slots = GuiDesign.centeredSlots(row, inThisRow);
            for (int slot : slots) {
                SpawnTheme theme = themes.get(index++);
                List<String> lore = new ArrayList<>(theme.description);
                lore.add("");
                lore.add(msg.getRaw("spawn.gui-click"));
                lore.add(msg.getRaw("spawn.gui-warn"));
                inv.setItem(slot, GuiDesign.named(theme.icon, theme.name, lore));
                holder.slots.put(slot, theme);
            }
        }
        player.openInventory(inv);
    }

    @EventHandler
    public void onClick(InventoryClickEvent event) {
        if (!(event.getView().getTopInventory().getHolder() instanceof Holder holder)) return;
        event.setCancelled(true);
        if (!(event.getWhoClicked() instanceof Player player)) return;
        if (event.getClickedInventory() != event.getView().getTopInventory()) return;

        SpawnTheme theme = holder.slots.get(event.getSlot());
        if (theme == null) return;

        player.closeInventory();
        MessageManager msg = plugin.getMessageManager();
        msg.send(player, "spawn.build-started");
        GuiDesign.soundSuccess(player);

        // Baut tick-weise; setzt Spawn + Schutzzone und meldet "fertig" selbst.
        new SpawnAreaBuilder(plugin).build(player, theme);
    }

    @EventHandler
    public void onDrag(InventoryDragEvent event) {
        if (event.getView().getTopInventory().getHolder() instanceof Holder) {
            event.setCancelled(true);
        }
    }
}
