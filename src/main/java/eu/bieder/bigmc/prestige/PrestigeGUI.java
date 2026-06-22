package eu.bieder.bigmc.prestige;

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

import java.util.ArrayList;
import java.util.List;

/**
 * Prestige-GUI: zeigt das aktuelle Prestige-Level, den Verkaufs-Bonus, die
 * naechsten Kosten und einen Prestige-Button.
 */
public class PrestigeGUI implements Listener {

    private static final int SLOT_PRESTIGE = 22;

    public static class Holder implements InventoryHolder {
        private Inventory inventory;
        @Override public Inventory getInventory() { return inventory; }
    }

    private final BigMC plugin;

    public PrestigeGUI(BigMC plugin) {
        this.plugin = plugin;
    }

    public void open(Player player) {
        MessageManager msg = plugin.getMessageManager();
        PrestigeManager pm = plugin.getPrestigeManager();
        int level = pm.getLevel(player.getUniqueId());

        Holder holder = new Holder();
        Inventory inv = Bukkit.createInventory(holder, 27, msg.getRaw("prestige.gui-title"));
        holder.inventory = inv;
        GuiDesign.fillBorder(inv);

        // Info-Item
        List<String> info = new ArrayList<>();
        info.add(msg.getRaw("prestige.info-level").replace("%level%", String.valueOf(level))
                .replace("%max%", String.valueOf(pm.getMaxPrestige())));
        info.add(msg.getRaw("prestige.info-bonus")
                .replace("%bonus%", String.format("%.1f", level * pm.getSellBonusPercent())));
        inv.setItem(13, GuiDesign.named(Material.EXPERIENCE_BOTTLE, msg.getRaw("prestige.info-name"), info));

        // Prestige-Button
        if (level >= pm.getMaxPrestige()) {
            inv.setItem(SLOT_PRESTIGE, GuiDesign.named(Material.BARRIER, msg.getRaw("prestige.max-button"), List.of()));
        } else {
            double cost = pm.costFor(level);
            var button = GuiDesign.named(Material.NETHER_STAR, msg.getRaw("prestige.button-name"),
                    List.of(
                            msg.getRaw("prestige.button-cost")
                                    .replace("%cost%", plugin.getEconomyManager().formatMoney(cost)),
                            msg.getRaw("prestige.button-next")
                                    .replace("%bonus%", String.format("%.1f", (level + 1) * pm.getSellBonusPercent())),
                            "",
                            msg.getRaw("prestige.button-click")));
            // Wenn bezahlbar: Button leuchtet als Hinweis
            if (plugin.getEconomyManager().getBalance(player.getUniqueId()) >= cost) GuiDesign.glow(button);
            inv.setItem(SLOT_PRESTIGE, button);
        }
        player.openInventory(inv);
    }

    @EventHandler
    public void onClick(InventoryClickEvent event) {
        if (!(event.getView().getTopInventory().getHolder() instanceof Holder)) return;
        event.setCancelled(true);
        if (!(event.getWhoClicked() instanceof Player player)) return;
        if (event.getClickedInventory() != event.getView().getTopInventory()) return;
        if (event.getSlot() != SLOT_PRESTIGE) return;

        if (plugin.getPrestigeManager().prestige(player)) {
            GuiDesign.soundSuccess(player);
            open(player);
        } else {
            GuiDesign.soundError(player);
        }
    }

    @EventHandler
    public void onDrag(InventoryDragEvent event) {
        if (event.getView().getTopInventory().getHolder() instanceof Holder) {
            event.setCancelled(true);
        }
    }
}
