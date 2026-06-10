package eu.bieder.bigmc.shop;

import eu.bieder.bigmc.BigMC;
import eu.bieder.bigmc.config.MessageManager;
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
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Baut die Shop-GUIs (Hauptmenue + Kategorien) und verarbeitet alle Klicks.
 *
 * Bedienung in einer Kategorie:
 * - Linksklick          -> 1x kaufen
 * - Shift + Linksklick  -> 64x kaufen
 * - Rechtsklick         -> 1x verkaufen
 * - Shift + Rechtsklick -> 64x verkaufen
 *
 * Die GUIs werden ueber einen eigenen InventoryHolder erkannt - das ist
 * sicherer als ein Titel-Vergleich und verhindert, dass Spieler Items
 * aus dem Shop herausnehmen koennen.
 */
public class ShopGUI implements Listener {

    /**
     * Marker-Holder: speichert, welche Shop-Seite ein Inventar darstellt.
     * categoryId == null bedeutet Hauptmenue.
     */
    public static class ShopHolder implements InventoryHolder {
        private final String categoryId;
        private Inventory inventory;

        public ShopHolder(String categoryId) {
            this.categoryId = categoryId;
        }

        public String getCategoryId() {
            return categoryId;
        }

        @Override
        public Inventory getInventory() {
            return inventory;
        }
    }

    private final BigMC plugin;

    public ShopGUI(BigMC plugin) {
        this.plugin = plugin;
    }

    // ----- GUI-Aufbau -----

    /**
     * Oeffnet das Hauptmenue mit allen Kategorien.
     */
    public void openMain(Player player) {
        MessageManager msg = plugin.getMessageManager();
        List<ShopManager.Category> categories = plugin.getShopManager().getCategories();

        // Groesse: volle Reihen, mindestens 1 Reihe, maximal 6
        int rows = Math.min(6, Math.max(1, (categories.size() + 8) / 9));
        ShopHolder holder = new ShopHolder(null);
        Inventory inv = Bukkit.createInventory(holder, rows * 9, msg.getRaw("shop.gui-main-title"));
        holder.inventory = inv;

        int slot = 0;
        for (ShopManager.Category cat : categories) {
            if (slot >= inv.getSize()) break;
            ItemStack icon = named(cat.icon(), MessageManager.color(cat.displayName()),
                    List.of(msg.getRaw("shop.gui-category-lore")));
            inv.setItem(slot++, icon);
        }
        player.openInventory(inv);
    }

    /**
     * Oeffnet eine Kategorie-Seite mit allen Items und Preisen.
     */
    public void openCategory(Player player, ShopManager.Category category) {
        MessageManager msg = plugin.getMessageManager();

        // 5 Reihen Items + 1 Reihe Navigation
        ShopHolder holder = new ShopHolder(category.id());
        Inventory inv = Bukkit.createInventory(holder, 54,
                msg.getRaw("shop.gui-category-title").replace("%category%",
                        MessageManager.color(category.displayName())));
        holder.inventory = inv;

        int slot = 0;
        for (ShopManager.ShopItem item : category.items()) {
            if (slot >= 45) break; // letzte Reihe bleibt fuer Navigation frei

            List<String> lore = new ArrayList<>();
            if (item.canBuy()) {
                lore.add(msg.getRaw("shop.gui-lore-buy")
                        .replace("%price%", plugin.getEconomyManager().formatMoney(item.buyPrice())));
            }
            if (item.canSell()) {
                lore.add(msg.getRaw("shop.gui-lore-sell")
                        .replace("%price%", plugin.getEconomyManager().formatMoney(item.sellPrice())));
            }
            lore.add("");
            if (item.canBuy())  lore.add(msg.getRaw("shop.gui-lore-click-buy"));
            if (item.canSell()) lore.add(msg.getRaw("shop.gui-lore-click-sell"));

            inv.setItem(slot++, named(item.material(), null, lore));
        }

        // Zurueck-Button unten in der Mitte
        inv.setItem(49, named(Material.BARRIER, msg.getRaw("shop.gui-back"), List.of()));

        player.openInventory(inv);
    }

    /** Hilfsmethode: ItemStack mit Name + Lore bauen. */
    private ItemStack named(Material material, String name, List<String> lore) {
        ItemStack stack = new ItemStack(material);
        ItemMeta meta = stack.getItemMeta();
        if (meta != null) {
            if (name != null) meta.setDisplayName(name);
            if (!lore.isEmpty()) meta.setLore(lore);
            stack.setItemMeta(meta);
        }
        return stack;
    }

    // ----- Klick-Verarbeitung -----

    @EventHandler
    public void onClick(InventoryClickEvent event) {
        if (!(event.getView().getTopInventory().getHolder() instanceof ShopHolder holder)) {
            return;
        }
        // Im Shop ist jede Inventar-Aktion gesperrt (kein Item-Entnehmen moeglich)
        event.setCancelled(true);

        if (!(event.getWhoClicked() instanceof Player player)) return;
        // Nur Klicks ins obere (Shop-)Inventar auswerten
        if (event.getClickedInventory() != event.getView().getTopInventory()) return;

        ItemStack clicked = event.getCurrentItem();
        if (clicked == null || clicked.getType() == Material.AIR) return;

        // --- Hauptmenue: Kategorie oeffnen ---
        if (holder.getCategoryId() == null) {
            int index = event.getSlot();
            List<ShopManager.Category> categories = plugin.getShopManager().getCategories();
            if (index >= 0 && index < categories.size()) {
                openCategory(player, categories.get(index));
            }
            return;
        }

        // --- Kategorie-Seite ---
        // Zurueck-Button
        if (event.getSlot() == 49 && clicked.getType() == Material.BARRIER) {
            openMain(player);
            return;
        }

        ShopManager.Category category = plugin.getShopManager()
                .getCategory(holder.getCategoryId()).orElse(null);
        if (category == null) return;

        // Das angeklickte Shop-Item anhand des Slots finden
        int index = event.getSlot();
        if (index < 0 || index >= 45 || index >= category.items().size()) return;
        ShopManager.ShopItem item = category.items().get(index);

        int amount = event.isShiftClick() ? 64 : 1;
        if (event.isLeftClick()) {
            buy(player, item, amount);
        } else if (event.isRightClick()) {
            sell(player, item, amount);
        }
    }

    @EventHandler
    public void onDrag(InventoryDragEvent event) {
        // Auch Drag-Aktionen im Shop komplett blockieren
        if (event.getView().getTopInventory().getHolder() instanceof ShopHolder) {
            event.setCancelled(true);
        }
    }

    // ----- Kauf / Verkauf -----

    /**
     * Kauft eine Anzahl eines Items: erst Geld abbuchen, dann Items geben.
     * Passt nicht alles ins Inventar, wird der Rest automatisch erstattet.
     */
    private void buy(Player player, ShopManager.ShopItem item, int amount) {
        MessageManager msg = plugin.getMessageManager();
        if (!item.canBuy()) {
            msg.send(player, "shop.cannot-buy");
            return;
        }

        double total = item.buyPrice() * amount;
        if (!plugin.getEconomyManager().withdraw(player.getUniqueId(), total)) {
            msg.send(player, "economy.not-enough-money");
            return;
        }

        // Items geben; was nicht passt, kommt als "Rest" zurueck
        Map<Integer, ItemStack> leftover = player.getInventory()
                .addItem(new ItemStack(item.material(), amount));

        int notAdded = leftover.values().stream().mapToInt(ItemStack::getAmount).sum();
        int added = amount - notAdded;

        if (notAdded > 0) {
            // Geld fuer nicht uebergebene Items zurueckerstatten
            plugin.getEconomyManager().deposit(player.getUniqueId(), item.buyPrice() * notAdded);
            msg.send(player, "shop.inventory-full");
        }
        if (added > 0) {
            msg.send(player, "shop.bought",
                    "%amount%", String.valueOf(added),
                    "%item%", prettyName(item.material()),
                    "%price%", plugin.getEconomyManager().formatMoney(item.buyPrice() * added));
        }
    }

    /**
     * Verkauft eine Anzahl eines Items: erst Items einziehen, dann Geld gutschreiben.
     * Hat der Spieler weniger als gewuenscht, wird nur der vorhandene Teil verkauft.
     */
    private void sell(Player player, ShopManager.ShopItem item, int amount) {
        MessageManager msg = plugin.getMessageManager();
        if (!item.canSell()) {
            msg.send(player, "shop.cannot-sell");
            return;
        }

        int removed = removeItems(player, item.material(), amount);
        if (removed <= 0) {
            msg.send(player, "shop.nothing-to-sell", "%item%", prettyName(item.material()));
            return;
        }

        double total = item.sellPrice() * removed;
        plugin.getEconomyManager().deposit(player.getUniqueId(), total);
        msg.send(player, "shop.sold",
                "%amount%", String.valueOf(removed),
                "%item%", prettyName(item.material()),
                "%price%", plugin.getEconomyManager().formatMoney(total));
    }

    /**
     * Entfernt bis zu "amount" Items eines Materials aus dem Spieler-Inventar.
     * Es werden nur "einfache" Items eingezogen (keine umbenannten/verzauberten),
     * damit niemand versehentlich wertvolle Spezial-Items verkauft.
     *
     * @return wie viele Items tatsaechlich entfernt wurden
     */
    public static int removeItems(Player player, Material material, int amount) {
        int remaining = amount;
        ItemStack[] contents = player.getInventory().getStorageContents();
        for (int i = 0; i < contents.length && remaining > 0; i++) {
            ItemStack stack = contents[i];
            if (stack == null || stack.getType() != material) continue;
            if (stack.hasItemMeta()) continue; // Spezial-Items ueberspringen

            int take = Math.min(stack.getAmount(), remaining);
            remaining -= take;
            if (take >= stack.getAmount()) {
                contents[i] = null;
            } else {
                stack.setAmount(stack.getAmount() - take);
            }
        }
        player.getInventory().setStorageContents(contents);
        return amount - remaining;
    }

    /**
     * Macht aus "IRON_INGOT" den lesbaren Namen "Iron Ingot".
     */
    public static String prettyName(Material material) {
        String[] parts = material.name().toLowerCase().split("_");
        StringBuilder sb = new StringBuilder();
        for (String part : parts) {
            if (!sb.isEmpty()) sb.append(' ');
            sb.append(Character.toUpperCase(part.charAt(0))).append(part.substring(1));
        }
        return sb.toString();
    }
}
