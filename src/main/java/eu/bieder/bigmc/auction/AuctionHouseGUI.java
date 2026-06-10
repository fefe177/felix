package eu.bieder.bigmc.auction;

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
import java.util.List;
import java.util.Map;

/**
 * Alle GUIs des Auktionshauses:
 * - Browse-Seite (durchblaettern + Kauf anklicken)
 * - Kauf-Bestaetigung (verhindert teure Fehlklicks)
 * - "Meine Auktionen" (eigene Angebote abbrechen)
 *
 * Wie beim Shop werden die Inventare ueber eigene InventoryHolder erkannt,
 * alle Klicks sind gesperrt - Items koennen nie herausgenommen werden.
 */
public class AuctionHouseGUI implements Listener {

    /** Pro Seite angezeigte Angebote (Reihen 1-5, Reihe 6 = Navigation). */
    private static final int PAGE_SIZE = 45;

    // Slots der Navigationsleiste
    private static final int SLOT_PREV = 45;
    private static final int SLOT_MY = 47;
    private static final int SLOT_INFO = 49;
    private static final int SLOT_COLLECT = 51;
    private static final int SLOT_NEXT = 53;

    // Slots im Bestaetigungs-GUI
    private static final int SLOT_CONFIRM = 11;
    private static final int SLOT_ITEM = 13;
    private static final int SLOT_CANCEL = 15;

    /** Browse-Seite: merkt sich Seitennummer und die angezeigten Angebote. */
    public static class BrowseHolder implements InventoryHolder {
        private final int page;
        private final List<AuctionManager.Listing> listings;
        private Inventory inventory;

        public BrowseHolder(int page, List<AuctionManager.Listing> listings) {
            this.page = page;
            this.listings = listings;
        }

        @Override
        public Inventory getInventory() {
            return inventory;
        }
    }

    /** Kauf-Bestaetigung fuer genau ein Angebot. */
    public static class ConfirmHolder implements InventoryHolder {
        private final int listingId;
        private Inventory inventory;

        public ConfirmHolder(int listingId) {
            this.listingId = listingId;
        }

        @Override
        public Inventory getInventory() {
            return inventory;
        }
    }

    /** "Meine Auktionen": merkt sich die eigenen Angebote. */
    public static class MyAuctionsHolder implements InventoryHolder {
        private final List<AuctionManager.Listing> listings;
        private Inventory inventory;

        public MyAuctionsHolder(List<AuctionManager.Listing> listings) {
            this.listings = listings;
        }

        @Override
        public Inventory getInventory() {
            return inventory;
        }
    }

    private final BigMC plugin;

    public AuctionHouseGUI(BigMC plugin) {
        this.plugin = plugin;
    }

    // ----- GUI-Aufbau -----

    /**
     * Oeffnet die Browse-Seite mit allen aktiven Angeboten.
     */
    public void openBrowse(Player player, int page) {
        MessageManager msg = plugin.getMessageManager();
        AuctionManager am = plugin.getAuctionManager();

        int total = am.countActive();
        int maxPage = Math.max(1, (total + PAGE_SIZE - 1) / PAGE_SIZE);
        page = Math.max(1, Math.min(page, maxPage));

        List<AuctionManager.Listing> listings = am.getActiveListings((page - 1) * PAGE_SIZE, PAGE_SIZE);

        BrowseHolder holder = new BrowseHolder(page, listings);
        Inventory inv = Bukkit.createInventory(holder, 54, msg.getRaw("auction.gui-title"));
        holder.inventory = inv;

        int slot = 0;
        for (AuctionManager.Listing listing : listings) {
            inv.setItem(slot++, displayItem(listing, false));
        }

        // Navigationsleiste
        if (page > 1) {
            inv.setItem(SLOT_PREV, named(Material.ARROW, msg.getRaw("auction.gui-prev"), List.of()));
        }
        if (page < maxPage) {
            inv.setItem(SLOT_NEXT, named(Material.ARROW, msg.getRaw("auction.gui-next"), List.of()));
        }
        inv.setItem(SLOT_INFO, named(Material.BOOK,
                msg.getRaw("auction.gui-page-info")
                        .replace("%page%", String.valueOf(page))
                        .replace("%maxpage%", String.valueOf(maxPage))
                        .replace("%total%", String.valueOf(total)),
                List.of()));
        inv.setItem(SLOT_MY, named(Material.CHEST, msg.getRaw("auction.gui-my-auctions"), List.of()));

        int pending = am.getPending(player.getUniqueId()).size();
        inv.setItem(SLOT_COLLECT, named(Material.ENDER_CHEST,
                msg.getRaw("auction.gui-collect").replace("%count%", String.valueOf(pending)),
                List.of(msg.getRaw("auction.gui-collect-lore"))));

        player.openInventory(inv);
    }

    /**
     * Oeffnet die Kauf-Bestaetigung fuer ein Angebot.
     */
    public void openConfirm(Player player, AuctionManager.Listing listing) {
        MessageManager msg = plugin.getMessageManager();

        ConfirmHolder holder = new ConfirmHolder(listing.id());
        Inventory inv = Bukkit.createInventory(holder, 27, msg.getRaw("auction.gui-confirm-title"));
        holder.inventory = inv;

        inv.setItem(SLOT_CONFIRM, named(Material.LIME_WOOL,
                msg.getRaw("auction.gui-confirm-buy")
                        .replace("%price%", plugin.getEconomyManager().formatMoney(listing.price())),
                List.of()));
        inv.setItem(SLOT_ITEM, displayItem(listing, false));
        inv.setItem(SLOT_CANCEL, named(Material.RED_WOOL, msg.getRaw("auction.gui-confirm-cancel"), List.of()));

        player.openInventory(inv);
    }

    /**
     * Oeffnet "Meine Auktionen" (eigene Angebote, Klick = abbrechen).
     */
    public void openMyAuctions(Player player) {
        MessageManager msg = plugin.getMessageManager();
        List<AuctionManager.Listing> own = plugin.getAuctionManager()
                .getListingsBySeller(player.getUniqueId());

        MyAuctionsHolder holder = new MyAuctionsHolder(own);
        Inventory inv = Bukkit.createInventory(holder, 27, msg.getRaw("auction.gui-my-title"));
        holder.inventory = inv;

        int slot = 0;
        for (AuctionManager.Listing listing : own) {
            if (slot >= 18) break;
            inv.setItem(slot++, displayItem(listing, true));
        }
        inv.setItem(22, named(Material.BARRIER, msg.getRaw("shop.gui-back"), List.of()));

        player.openInventory(inv);
    }

    /**
     * Baut die Anzeige-Kopie eines Angebots: Original-Item + Infozeilen in der Lore.
     * Verkauft wird immer das Original aus der Datenbank, nie diese Kopie.
     */
    private ItemStack displayItem(AuctionManager.Listing listing, boolean ownView) {
        MessageManager msg = plugin.getMessageManager();
        ItemStack copy = listing.item().clone();
        ItemMeta meta = copy.getItemMeta();
        if (meta != null) {
            List<String> lore = meta.hasLore() ? new ArrayList<>(meta.getLore()) : new ArrayList<>();
            lore.add("");
            lore.add(msg.getRaw("auction.gui-lore-price")
                    .replace("%price%", plugin.getEconomyManager().formatMoney(listing.price())));
            lore.add(msg.getRaw("auction.gui-lore-seller")
                    .replace("%seller%", listing.sellerName()));
            lore.add(msg.getRaw("auction.gui-lore-time")
                    .replace("%time%", AuctionManager.formatRemaining(
                            listing.expiresAt() - System.currentTimeMillis())));
            lore.add(ownView
                    ? msg.getRaw("auction.gui-lore-click-cancel")
                    : msg.getRaw("auction.gui-lore-click-buy"));
            meta.setLore(lore);
            copy.setItemMeta(meta);
        }
        return copy;
    }

    private ItemStack named(Material material, String name, List<String> lore) {
        ItemStack stack = new ItemStack(material);
        ItemMeta meta = stack.getItemMeta();
        if (meta != null) {
            meta.setDisplayName(name);
            if (!lore.isEmpty()) meta.setLore(lore);
            stack.setItemMeta(meta);
        }
        return stack;
    }

    // ----- Klick-Verarbeitung -----

    @EventHandler
    public void onClick(InventoryClickEvent event) {
        InventoryHolder holder = event.getView().getTopInventory().getHolder();
        boolean ours = holder instanceof BrowseHolder
                || holder instanceof ConfirmHolder
                || holder instanceof MyAuctionsHolder;
        if (!ours) return;

        event.setCancelled(true);
        if (!(event.getWhoClicked() instanceof Player player)) return;
        if (event.getClickedInventory() != event.getView().getTopInventory()) return;

        ItemStack clicked = event.getCurrentItem();
        if (clicked == null || clicked.getType() == Material.AIR) return;

        if (holder instanceof BrowseHolder browse) {
            handleBrowseClick(player, browse, event.getSlot());
        } else if (holder instanceof ConfirmHolder confirm) {
            handleConfirmClick(player, confirm, event.getSlot());
        } else if (holder instanceof MyAuctionsHolder my) {
            handleMyAuctionsClick(player, my, event.getSlot());
        }
    }

    @EventHandler
    public void onDrag(InventoryDragEvent event) {
        InventoryHolder holder = event.getView().getTopInventory().getHolder();
        if (holder instanceof BrowseHolder || holder instanceof ConfirmHolder
                || holder instanceof MyAuctionsHolder) {
            event.setCancelled(true);
        }
    }

    private void handleBrowseClick(Player player, BrowseHolder browse, int slot) {
        MessageManager msg = plugin.getMessageManager();

        switch (slot) {
            case SLOT_PREV -> { openBrowse(player, browse.page - 1); return; }
            case SLOT_NEXT -> { openBrowse(player, browse.page + 1); return; }
            case SLOT_MY -> { openMyAuctions(player); return; }
            case SLOT_COLLECT -> {
                player.closeInventory();
                collect(player);
                return;
            }
            case SLOT_INFO -> { return; }
        }

        if (slot < 0 || slot >= PAGE_SIZE || slot >= browse.listings.size()) return;
        AuctionManager.Listing listing = browse.listings.get(slot);

        // Nochmal frisch aus der DB laden - koennte inzwischen verkauft sein
        AuctionManager.Listing fresh = plugin.getAuctionManager().getListing(listing.id()).orElse(null);
        if (fresh == null) {
            msg.send(player, "auction.no-longer-available");
            openBrowse(player, browse.page);
            return;
        }
        if (fresh.sellerUuid().equals(player.getUniqueId())) {
            msg.send(player, "auction.cannot-buy-own");
            return;
        }
        openConfirm(player, fresh);
    }

    private void handleConfirmClick(Player player, ConfirmHolder confirm, int slot) {
        if (slot == SLOT_CANCEL) {
            openBrowse(player, 1);
            return;
        }
        if (slot != SLOT_CONFIRM) return;

        buy(player, confirm.listingId);
    }

    private void handleMyAuctionsClick(Player player, MyAuctionsHolder my, int slot) {
        MessageManager msg = plugin.getMessageManager();

        if (slot == 22) {
            openBrowse(player, 1);
            return;
        }
        if (slot < 0 || slot >= 18 || slot >= my.listings.size()) return;

        AuctionManager.Listing listing = my.listings.get(slot);
        // Atomar beanspruchen - falls es gerade jemand kauft, schlaegt das fehl
        if (!plugin.getAuctionManager().claimListing(listing.id())) {
            msg.send(player, "auction.no-longer-available");
            openMyAuctions(player);
            return;
        }
        // Item ins Abholfach legen (nicht direkt geben - Inventar koennte voll sein)
        plugin.getAuctionManager().addPending(player.getUniqueId(), listing.item());
        msg.send(player, "auction.cancelled");
        openMyAuctions(player);
    }

    // ----- Kauf & Abholung -----

    /**
     * Fuehrt den eigentlichen Kauf durch. Reihenfolge (scam-sicher):
     * 1. Angebot atomar aus der DB beanspruchen (kann nur einem gelingen)
     * 2. Geld vom Kaeufer abbuchen - scheitert das, Angebot wiederherstellen
     * 3. Geld dem Verkaeufer gutschreiben
     * 4. Item uebergeben; passt es nicht ins Inventar -> Abholfach
     */
    private void buy(Player buyer, int listingId) {
        MessageManager msg = plugin.getMessageManager();
        AuctionManager am = plugin.getAuctionManager();

        AuctionManager.Listing listing = am.getListing(listingId).orElse(null);
        if (listing == null) {
            msg.send(buyer, "auction.no-longer-available");
            openBrowse(buyer, 1);
            return;
        }
        if (listing.sellerUuid().equals(buyer.getUniqueId())) {
            msg.send(buyer, "auction.cannot-buy-own");
            return;
        }

        // Schritt 1: beanspruchen
        if (!am.claimListing(listingId)) {
            msg.send(buyer, "auction.no-longer-available");
            openBrowse(buyer, 1);
            return;
        }

        // Schritt 2: bezahlen
        if (!plugin.getEconomyManager().withdraw(buyer.getUniqueId(), listing.price())) {
            am.restoreListing(listing);
            msg.send(buyer, "economy.not-enough-money");
            buyer.closeInventory();
            return;
        }

        // Schritt 3: Verkaeufer auszahlen
        plugin.getEconomyManager().deposit(listing.sellerUuid(), listing.price());

        // Schritt 4: Item uebergeben
        String itemName = itemDisplayName(listing.item());
        Map<Integer, ItemStack> leftover = buyer.getInventory().addItem(listing.item());
        if (!leftover.isEmpty()) {
            for (ItemStack rest : leftover.values()) {
                am.addPending(buyer.getUniqueId(), rest);
            }
            msg.send(buyer, "auction.bought-to-pending", "%item%", itemName,
                    "%price%", plugin.getEconomyManager().formatMoney(listing.price()));
        } else {
            msg.send(buyer, "auction.bought", "%item%", itemName,
                    "%price%", plugin.getEconomyManager().formatMoney(listing.price()));
        }

        // Verkaeufer benachrichtigen, falls online
        Player seller = Bukkit.getPlayer(listing.sellerUuid());
        if (seller != null) {
            msg.send(seller, "auction.sold-notify",
                    "%item%", itemName,
                    "%price%", plugin.getEconomyManager().formatMoney(listing.price()),
                    "%player%", buyer.getName());
        }

        openBrowse(buyer, 1);
    }

    /**
     * Gibt dem Spieler alle abholbaren Items, soweit Platz im Inventar ist.
     * Was nicht passt, bleibt im Abholfach.
     */
    public void collect(Player player) {
        MessageManager msg = plugin.getMessageManager();
        AuctionManager am = plugin.getAuctionManager();

        List<AuctionManager.PendingItem> pending = am.getPending(player.getUniqueId());
        if (pending.isEmpty()) {
            msg.send(player, "auction.collect-empty");
            return;
        }

        int collected = 0;
        boolean full = false;
        for (AuctionManager.PendingItem entry : pending) {
            Map<Integer, ItemStack> leftover = player.getInventory().addItem(entry.item());
            if (leftover.isEmpty()) {
                am.deletePending(entry.id());
                collected++;
            } else {
                // Reststack speichern und aufhoeren - Inventar ist voll
                am.updatePending(entry.id(), leftover.values().iterator().next());
                full = true;
                break;
            }
        }

        if (collected > 0) {
            msg.send(player, "auction.collected", "%count%", String.valueOf(collected));
        }
        if (full) {
            msg.send(player, "auction.collect-inventory-full");
        }
    }

    /**
     * Lesbarer Name eines Items: eigener Anzeigename oder Material-Name,
     * inklusive Anzahl (z.B. "64x Cobblestone").
     */
    public static String itemDisplayName(ItemStack item) {
        String name;
        ItemMeta meta = item.getItemMeta();
        if (meta != null && meta.hasDisplayName()) {
            name = meta.getDisplayName();
        } else {
            name = eu.bieder.bigmc.shop.ShopGUI.prettyName(item.getType());
        }
        return item.getAmount() + "x " + name;
    }
}
