package eu.bieder.bigmc.shop;

import eu.bieder.bigmc.BigMC;
import eu.bieder.bigmc.config.MessageManager;
import eu.bieder.bigmc.util.GuiDesign;
import org.bukkit.Bukkit;
import org.bukkit.Material;
import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.Listener;
import org.bukkit.event.inventory.InventoryClickEvent;
import org.bukkit.event.inventory.InventoryCloseEvent;
import org.bukkit.event.inventory.InventoryDragEvent;
import org.bukkit.inventory.Inventory;
import org.bukkit.inventory.InventoryHolder;
import org.bukkit.inventory.ItemStack;

import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * Verkaufs-GUI: der Spieler legt Items in die obere Flaeche (Slots 0-44), die
 * untere Reihe zeigt die Live-Summe und bietet "Verkaufen" / "Abbrechen".
 *
 * Wichtig (Item-Loss-Schutz): Beim Schliessen werden alle eingelegten Items
 * zurueckgegeben. Verkauft werden nur "einfache" (nicht umbenannte/verzauberte)
 * Items, fuer die es einen Verkaufspreis gibt - der Rest bleibt liegen.
 */
public class SellGUI implements Listener {

    private static final int DROP_ZONE = 45;   // Slots 0..44 sind Ablage
    private static final int SLOT_TOTAL = 45;
    private static final int SLOT_CONFIRM = 48;
    private static final int SLOT_CANCEL = 50;

    public static class Holder implements InventoryHolder {
        private Inventory inventory;
        @Override public Inventory getInventory() { return inventory; }
    }

    private final BigMC plugin;

    public SellGUI(BigMC plugin) {
        this.plugin = plugin;
    }

    public void open(Player player) {
        MessageManager msg = plugin.getMessageManager();
        Holder holder = new Holder();
        Inventory inv = Bukkit.createInventory(holder, 54, msg.getRaw("sellgui.gui-title"));
        holder.inventory = inv;

        ItemStack frame = GuiDesign.pane(GuiDesign.FRAME);
        for (int i = DROP_ZONE; i < 54; i++) inv.setItem(i, frame);
        inv.setItem(SLOT_TOTAL, totalItem(0));
        inv.setItem(SLOT_CONFIRM, confirmItem(0));
        inv.setItem(SLOT_CANCEL, GuiDesign.named(Material.BARRIER, msg.getRaw("sellgui.cancel"), List.of()));

        player.openInventory(inv);
    }

    private ItemStack totalItem(double total) {
        MessageManager msg = plugin.getMessageManager();
        return GuiDesign.named(Material.GOLD_INGOT, msg.getRaw("sellgui.total-name"),
                List.of(msg.getRaw("sellgui.total-value")
                        .replace("%price%", plugin.getEconomyManager().formatMoney(total))));
    }

    private ItemStack confirmItem(double total) {
        MessageManager msg = plugin.getMessageManager();
        ItemStack item = GuiDesign.named(Material.LIME_DYE, msg.getRaw("sellgui.confirm"),
                List.of(msg.getRaw("sellgui.total-value")
                        .replace("%price%", plugin.getEconomyManager().formatMoney(total))));
        if (total > 0) GuiDesign.glow(item);
        return item;
    }

    /** Vorschau-Summe aller verkaufbaren Items in der Ablage (inkl. Prestige-Bonus). */
    private double previewTotal(Player player, Inventory inv) {
        double total = 0;
        for (int i = 0; i < DROP_ZONE; i++) {
            ItemStack s = inv.getItem(i);
            if (s == null || s.getType() == Material.AIR || s.hasItemMeta()) continue;
            Optional<Double> price = plugin.getShopManager().getSellPrice(s.getType());
            if (price.isPresent()) total += price.get() * s.getAmount();
        }
        return plugin.getPrestigeManager().applySellBonus(player.getUniqueId(), total);
    }

    private void refresh(Player player, Inventory inv) {
        double total = previewTotal(player, inv);
        inv.setItem(SLOT_TOTAL, totalItem(total));
        inv.setItem(SLOT_CONFIRM, confirmItem(total));
    }

    private void scheduleRefresh(Player player, Inventory inv) {
        Bukkit.getScheduler().runTask(plugin, () -> {
            if (player.getOpenInventory().getTopInventory().getHolder() instanceof Holder) {
                refresh(player, inv);
            }
        });
    }

    @EventHandler
    public void onClick(InventoryClickEvent event) {
        if (!(event.getView().getTopInventory().getHolder() instanceof Holder)) return;
        if (!(event.getWhoClicked() instanceof Player player)) return;
        Inventory top = event.getView().getTopInventory();
        int raw = event.getRawSlot();

        // Untere Button-Reihe (im oberen Inventar) -> sperren + behandeln
        if (raw >= DROP_ZONE && raw < top.getSize()) {
            event.setCancelled(true);
            if (raw == SLOT_CONFIRM) doSell(player, top);
            else if (raw == SLOT_CANCEL) player.closeInventory();
            return;
        }
        // Ablage (0-44) oder Spieler-Inventar: Bewegung erlauben, danach Summe neu berechnen
        scheduleRefresh(player, top);
    }

    @EventHandler
    public void onDrag(InventoryDragEvent event) {
        if (!(event.getView().getTopInventory().getHolder() instanceof Holder)) return;
        Inventory top = event.getView().getTopInventory();
        for (int raw : event.getRawSlots()) {
            if (raw >= DROP_ZONE && raw < top.getSize()) {
                event.setCancelled(true); // nicht in die Button-Reihe ziehen
                return;
            }
        }
        if (event.getWhoClicked() instanceof Player player) scheduleRefresh(player, top);
    }

    private void doSell(Player player, Inventory inv) {
        MessageManager msg = plugin.getMessageManager();
        double total = 0;
        int sold = 0;
        for (int i = 0; i < DROP_ZONE; i++) {
            ItemStack s = inv.getItem(i);
            if (s == null || s.getType() == Material.AIR || s.hasItemMeta()) continue;
            Optional<Double> price = plugin.getShopManager().getSellPrice(s.getType());
            if (price.isEmpty()) continue;
            total += price.get() * s.getAmount();
            sold += s.getAmount();
            inv.setItem(i, null);
        }
        if (sold == 0) {
            GuiDesign.soundError(player);
            msg.send(player, "shop.sell-all-nothing");
            return;
        }
        total = plugin.getPrestigeManager().applySellBonus(player.getUniqueId(), total);
        plugin.getEconomyManager().deposit(player.getUniqueId(), total);
        GuiDesign.soundSuccess(player);
        msg.send(player, "shop.sold-all",
                "%amount%", String.valueOf(sold),
                "%price%", plugin.getEconomyManager().formatMoney(total));
        refresh(player, inv);
    }

    @EventHandler
    public void onClose(InventoryCloseEvent event) {
        if (!(event.getView().getTopInventory().getHolder() instanceof Holder)) return;
        if (!(event.getPlayer() instanceof Player player)) return;
        Inventory top = event.getView().getTopInventory();
        // Alle nicht verkauften Items zurueckgeben (kein Item-Loss)
        for (int i = 0; i < DROP_ZONE; i++) {
            ItemStack s = top.getItem(i);
            if (s == null || s.getType() == Material.AIR) continue;
            top.setItem(i, null);
            Map<Integer, ItemStack> leftover = player.getInventory().addItem(s);
            for (ItemStack rest : leftover.values()) {
                player.getWorld().dropItemNaturally(player.getLocation(), rest);
            }
        }
    }
}
