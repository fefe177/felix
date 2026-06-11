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
 * Baut die Shop-GUIs (Hauptmenue + Kategorien) im Kisten-Design:
 * grauer Glas-Rahmen, blaue Akzent-Ecken, zentrierte Inhalte.
 *
 * Bedienung in einer Kategorie:
 * - Linksklick          -> 1x kaufen
 * - Shift + Linksklick  -> 64x kaufen
 * - Rechtsklick         -> 1x verkaufen
 * - Shift + Rechtsklick -> 64x verkaufen
 *
 * Die GUIs werden ueber einen eigenen InventoryHolder erkannt; die Zuordnung
 * Slot -> Inhalt liegt direkt im Holder (keine fehleranfaellige Index-Rechnung).
 */
public class ShopGUI implements Listener {

    /** Slot des Zurueck-Buttons auf Kategorie-Seiten. */
    private static final int SLOT_BACK = 49;

    /**
     * Marker-Holder: merkt sich, welche Slots welche Kategorie bzw.
     * welches Shop-Item anzeigen. categoryId == null bedeutet Hauptmenue.
     */
    public static class ShopHolder implements InventoryHolder {
        private final String categoryId;
        private final Map<Integer, ShopManager.Category> categorySlots = new HashMap<>();
        private final Map<Integer, ShopManager.ShopItem> itemSlots = new HashMap<>();
        private Inventory inventory;

        public ShopHolder(String categoryId) {
            this.categoryId = categoryId;
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
     * Oeffnet das Hauptmenue: Kategorien mittig in den Innenreihen,
     * aussen herum der Rahmen.
     */
    public void openMain(Player player) {
        MessageManager msg = plugin.getMessageManager();
        List<ShopManager.Category> categories = plugin.getShopManager().getCategories();

        // Innenreihen: bis zu 7 Kategorien pro Reihe, plus Rahmen oben/unten
        int innerRows = Math.max(1, (categories.size() + 6) / 7);
        int rows = Math.min(6, innerRows + 2);

        ShopHolder holder = new ShopHolder(null);
        Inventory inv = Bukkit.createInventory(holder, rows * 9, msg.getRaw("shop.gui-main-title"));
        holder.inventory = inv;

        GuiDesign.fillBorder(inv);

        int index = 0;
        for (int row = 1; row <= innerRows && index < categories.size(); row++) {
            int inThisRow = Math.min(7, categories.size() - index);
            int[] slots = GuiDesign.centeredSlots(row, inThisRow);
            for (int slot : slots) {
                ShopManager.Category cat = categories.get(index++);
                inv.setItem(slot, GuiDesign.named(cat.icon(),
                        cat.displayName(),
                        List.of(
                                msg.getRaw("shop.gui-category-count")
                                        .replace("%count%", String.valueOf(cat.items().size())),
                                msg.getRaw("shop.gui-category-lore"))));
                holder.categorySlots.put(slot, cat);
            }
        }

        // Spieler-Kopf mit Live-Kontostand unten in der Mitte
        inv.setItem(inv.getSize() - 5, buildBalanceHead(player));

        player.openInventory(inv);
    }

    /** Spieler-Kopf mit aktuellem Kontostand. */
    private ItemStack buildBalanceHead(Player player) {
        MessageManager msg = plugin.getMessageManager();
        double balance = plugin.getEconomyManager().getBalance(player.getUniqueId());
        return GuiDesign.balanceHead(player,
                msg.getRaw("shop.gui-balance"),
                List.of(msg.getRaw("shop.gui-balance-lore")
                        .replace("%money%", plugin.getEconomyManager().formatMoney(balance))));
    }

    /**
     * Oeffnet eine Kategorie-Seite: Rahmen, Kategorie-Icon oben mittig,
     * Items im Innenbereich, Zurueck-Button unten mittig.
     */
    public void openCategory(Player player, ShopManager.Category category) {
        MessageManager msg = plugin.getMessageManager();

        ShopHolder holder = new ShopHolder(category.id());
        Inventory inv = Bukkit.createInventory(holder, 54,
                msg.getRaw("shop.gui-category-title").replace("%category%",
                        MessageManager.color(category.displayName())));
        holder.inventory = inv;

        GuiDesign.fillBorder(inv);

        // Kategorie-Icon als Ueberschrift oben mittig, Kontostand oben rechts
        inv.setItem(4, GuiDesign.named(category.icon(), category.displayName(),
                List.of(msg.getRaw("shop.gui-category-count")
                        .replace("%count%", String.valueOf(category.items().size())))));
        inv.setItem(8, buildBalanceHead(player));

        // Items in den Innenbereich (4 Reihen x 7 Spalten = 28 Plaetze)
        int index = 0;
        outer:
        for (int row = 1; row <= 4; row++) {
            for (int col = 1; col <= 7; col++) {
                if (index >= category.items().size()) break outer;
                ShopManager.ShopItem item = category.items().get(index++);
                int slot = row * 9 + col;
                inv.setItem(slot, buildItemDisplay(item));
                holder.itemSlots.put(slot, item);
            }
        }

        // Zurueck-Button unten in der Mitte
        inv.setItem(SLOT_BACK, GuiDesign.named(Material.BARRIER,
                msg.getRaw("shop.gui-back"), List.of()));

        player.openInventory(inv);
    }

    /** Baut die Anzeige eines Shop-Items mit Preis- und Klick-Lore. */
    private ItemStack buildItemDisplay(ShopManager.ShopItem item) {
        MessageManager msg = plugin.getMessageManager();
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

        ItemStack stack = new ItemStack(item.material());
        ItemMeta meta = stack.getItemMeta();
        if (meta != null) {
            meta.setLore(lore);
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

        int slot = event.getSlot();

        // --- Hauptmenue: Kategorie oeffnen ---
        if (holder.categoryId == null) {
            ShopManager.Category category = holder.categorySlots.get(slot);
            if (category != null) {
                GuiDesign.soundClick(player);
                openCategory(player, category);
            }
            return;
        }

        // --- Kategorie-Seite ---
        if (slot == SLOT_BACK) {
            GuiDesign.soundClick(player);
            openMain(player);
            return;
        }

        ShopManager.ShopItem item = holder.itemSlots.get(slot);
        if (item == null) return;

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
            GuiDesign.soundError(player);
            msg.send(player, "shop.cannot-buy");
            return;
        }

        double total = item.buyPrice() * amount;
        if (!plugin.getEconomyManager().withdraw(player.getUniqueId(), total)) {
            GuiDesign.soundError(player);
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
            GuiDesign.soundSuccess(player);
            msg.send(player, "shop.bought",
                    "%amount%", String.valueOf(added),
                    "%item%", prettyName(item.material()),
                    "%price%", plugin.getEconomyManager().formatMoney(item.buyPrice() * added));
        }
        // Kontostand-Kopf aktualisieren
        refreshBalanceHead(player);
    }

    /**
     * Verkauft eine Anzahl eines Items: erst Items einziehen, dann Geld gutschreiben.
     * Hat der Spieler weniger als gewuenscht, wird nur der vorhandene Teil verkauft.
     */
    private void sell(Player player, ShopManager.ShopItem item, int amount) {
        MessageManager msg = plugin.getMessageManager();
        if (!item.canSell()) {
            GuiDesign.soundError(player);
            msg.send(player, "shop.cannot-sell");
            return;
        }

        int removed = removeItems(player, item.material(), amount);
        if (removed <= 0) {
            GuiDesign.soundError(player);
            msg.send(player, "shop.nothing-to-sell", "%item%", prettyName(item.material()));
            return;
        }

        double total = item.sellPrice() * removed;
        plugin.getEconomyManager().deposit(player.getUniqueId(), total);
        GuiDesign.soundSuccess(player);
        msg.send(player, "shop.sold",
                "%amount%", String.valueOf(removed),
                "%item%", prettyName(item.material()),
                "%price%", plugin.getEconomyManager().formatMoney(total));
        refreshBalanceHead(player);
    }

    /** Aktualisiert den Kontostand-Kopf im gerade geoeffneten Shop-Fenster. */
    private void refreshBalanceHead(Player player) {
        if (!(player.getOpenInventory().getTopInventory().getHolder() instanceof ShopHolder holder)) {
            return;
        }
        Inventory inv = holder.inventory;
        int slot = holder.categoryId == null ? inv.getSize() - 5 : 8;
        inv.setItem(slot, buildBalanceHead(player));
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
