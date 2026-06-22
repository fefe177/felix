package eu.bieder.bigmc.rank;

import eu.bieder.bigmc.BigMC;
import eu.bieder.bigmc.config.MessageManager;
import eu.bieder.bigmc.stats.StatsManager;
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
import java.util.List;

/**
 * Zeigt die Rang-Leiter als GUI: jeder Rang mit Preis und Voraussetzungen,
 * der eigene Rang leuchtet. Unten ein Button zum Kauf des naechsten Rangs.
 */
public class RanksGUI implements Listener {

    /** Icon-Leiter je Rang-Position (wiederholt sich bei mehr Raengen). */
    private static final Material[] ICONS = {
            Material.LEATHER_HELMET, Material.CHAINMAIL_HELMET, Material.IRON_HELMET,
            Material.GOLDEN_HELMET, Material.DIAMOND_HELMET, Material.NETHERITE_HELMET};

    private static final int SLOT_BUY = 49;

    public static class Holder implements InventoryHolder {
        private Inventory inventory;
        @Override public Inventory getInventory() { return inventory; }
    }

    private final BigMC plugin;

    public RanksGUI(BigMC plugin) {
        this.plugin = plugin;
    }

    public void open(Player player) {
        MessageManager msg = plugin.getMessageManager();
        List<RankManager.Rank> ranks = plugin.getRankManager().getRanks();

        Holder holder = new Holder();
        Inventory inv = Bukkit.createInventory(holder, 54, msg.getRaw("ranksgui.gui-title"));
        holder.inventory = inv;
        GuiDesign.fillBorder(inv);

        RankManager.Rank current = plugin.getRankManager().getPlayerRank(player.getUniqueId());
        int currentOrder = current != null ? current.order() : -1;

        int[] slots = innerSlots();
        for (int i = 0; i < ranks.size() && i < slots.length; i++) {
            RankManager.Rank rank = ranks.get(i);
            inv.setItem(slots[i], buildRankItem(rank, currentOrder));
        }

        // Kauf-Button fuer den naechsten Rang
        if (current != null) {
            var next = plugin.getRankManager().getNextRank(current);
            if (next.isPresent()) {
                RankManager.Rank n = next.get();
                inv.setItem(SLOT_BUY, GuiDesign.glow(GuiDesign.named(Material.NETHER_STAR,
                        msg.getRaw("ranksgui.buy-name"),
                        List.of(
                                msg.getRaw("ranksgui.buy-next")
                                        .replace("%rank%", MessageManager.color(n.displayName())),
                                msg.getRaw("ranksgui.buy-cost")
                                        .replace("%cost%", plugin.getEconomyManager().formatMoney(n.cost()))))));
            } else {
                inv.setItem(SLOT_BUY, GuiDesign.named(Material.BARRIER, msg.getRaw("ranksgui.max"), List.of()));
            }
        }

        player.openInventory(inv);
    }

    private ItemStack buildRankItem(RankManager.Rank rank, int currentOrder) {
        MessageManager msg = plugin.getMessageManager();
        List<String> lore = new ArrayList<>();
        if (rank.cost() > 0) {
            lore.add(msg.getRaw("ranksgui.cost")
                    .replace("%cost%", plugin.getEconomyManager().formatMoney(rank.cost())));
        }
        if (rank.requiredPlaytimeSeconds() > 0) {
            lore.add(msg.getRaw("ranksgui.req-playtime")
                    .replace("%time%", StatsManager.formatPlaytime(rank.requiredPlaytimeSeconds())));
        }
        if (rank.requiredKills() > 0) {
            lore.add(msg.getRaw("ranksgui.req-kills")
                    .replace("%kills%", String.valueOf(rank.requiredKills())));
        }
        lore.add("");
        if (rank.order() == currentOrder) {
            lore.add(msg.getRaw("ranksgui.current"));
        } else if (rank.order() < currentOrder) {
            lore.add(msg.getRaw("ranksgui.achieved"));
        } else {
            lore.add(msg.getRaw("ranksgui.locked"));
        }

        Material icon = ICONS[Math.min(rank.order(), ICONS.length - 1)];
        ItemStack item = GuiDesign.named(icon, rank.displayName(), lore);
        if (rank.order() == currentOrder) GuiDesign.glow(item);
        return item;
    }

    /** Innenbereich (Reihen 1-4, Spalten 1-7) = 28 Slots. */
    private int[] innerSlots() {
        int[] slots = new int[28];
        int idx = 0;
        for (int row = 1; row <= 4; row++) {
            for (int col = 1; col <= 7; col++) {
                slots[idx++] = row * 9 + col;
            }
        }
        return slots;
    }

    @EventHandler
    public void onClick(InventoryClickEvent event) {
        if (!(event.getView().getTopInventory().getHolder() instanceof Holder)) return;
        event.setCancelled(true);
        if (!(event.getWhoClicked() instanceof Player player)) return;
        if (event.getClickedInventory() != event.getView().getTopInventory()) return;

        if (event.getSlot() == SLOT_BUY) {
            GuiDesign.soundClick(player);
            player.closeInventory();
            player.performCommand("rank buy");
        }
    }

    @EventHandler
    public void onDrag(InventoryDragEvent event) {
        if (event.getView().getTopInventory().getHolder() instanceof Holder) {
            event.setCancelled(true);
        }
    }
}
