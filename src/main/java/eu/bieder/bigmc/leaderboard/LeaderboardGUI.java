package eu.bieder.bigmc.leaderboard;

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

import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Leaderboard-GUIs: Hauptmenue mit Kategorien und eine Kategorie-Ansicht, die
 * die (teilweise asynchron geladenen) Top-Eintraege anzeigt.
 */
public class LeaderboardGUI implements Listener {

    public static class MainHolder implements InventoryHolder {
        private final Map<Integer, LeaderboardCategory> slots = new HashMap<>();
        private Inventory inventory;
        @Override public Inventory getInventory() { return inventory; }
    }

    public static class CategoryHolder implements InventoryHolder {
        private final LeaderboardCategory category;
        private int backSlot = -1;
        private Inventory inventory;
        CategoryHolder(LeaderboardCategory category) { this.category = category; }
        @Override public Inventory getInventory() { return inventory; }
    }

    private final BigMC plugin;

    public LeaderboardGUI(BigMC plugin) {
        this.plugin = plugin;
    }

    public void openMain(Player player) {
        MessageManager msg = plugin.getMessageManager();
        MainHolder holder = new MainHolder();
        Inventory inv = Bukkit.createInventory(holder, 27, msg.getRaw("leaderboard.gui-title"));
        holder.inventory = inv;
        GuiDesign.fillBorder(inv);

        LeaderboardCategory[] cats = LeaderboardCategory.values();
        int[] slots = GuiDesign.centeredSlots(1, cats.length);
        for (int i = 0; i < cats.length; i++) {
            inv.setItem(slots[i], GuiDesign.named(cats[i].icon, cats[i].display,
                    List.of(msg.getRaw("leaderboard.category-lore"))));
            holder.slots.put(slots[i], cats[i]);
        }
        player.openInventory(inv);
    }

    public void openCategory(Player player, LeaderboardCategory category) {
        MessageManager msg = plugin.getMessageManager();
        CategoryHolder holder = new CategoryHolder(category);
        Inventory inv = Bukkit.createInventory(holder, 54,
                msg.getRaw("leaderboard.category-title").replace("%category%", MessageManager.color(category.display)));
        holder.inventory = inv;
        GuiDesign.fillBorder(inv);
        inv.setItem(4, GuiDesign.named(Material.PAPER, msg.getRaw("leaderboard.loading"), List.of()));
        holder.backSlot = inv.getSize() - 5;
        inv.setItem(holder.backSlot, GuiDesign.named(Material.ARROW, msg.getRaw("leaderboard.back"), List.of()));
        player.openInventory(inv);

        plugin.getLeaderboardManager().fetchTop(category, 10, entries -> {
            // Nur fuellen, wenn der Spieler noch genau dieses GUI offen hat
            if (!(player.getOpenInventory().getTopInventory().getHolder() instanceof CategoryHolder h)
                    || h.category != category) {
                return;
            }
            inv.setItem(4, GuiDesign.named(category.icon, category.display, List.of()));
            int[] slots = innerSlots();
            for (int i = 0; i < slots.length; i++) {
                if (i >= entries.size()) {
                    inv.setItem(slots[i], null);
                    continue;
                }
                String[] e = entries.get(i);
                inv.setItem(slots[i], GuiDesign.named(rankIcon(i + 1),
                        msg.getRaw("leaderboard.entry-name").replace("%place%", String.valueOf(i + 1))
                                .replace("%player%", e[0]),
                        List.of(msg.getRaw("leaderboard.entry-value").replace("%value%", e[1]))));
            }
        });
    }

    private int[] innerSlots() {
        int[] slots = new int[10];
        for (int i = 0; i < 10; i++) {
            slots[i] = 19 + i + (i >= 7 ? 2 : 0); // Reihe 2 (19-25), dann Reihe 3 ab 28
        }
        return slots;
    }

    private Material rankIcon(int place) {
        return switch (place) {
            case 1 -> Material.GOLD_BLOCK;
            case 2 -> Material.IRON_BLOCK;
            case 3 -> Material.COPPER_BLOCK;
            default -> Material.PLAYER_HEAD;
        };
    }

    @EventHandler
    public void onClick(InventoryClickEvent event) {
        InventoryHolder h = event.getView().getTopInventory().getHolder();
        if (!(h instanceof MainHolder || h instanceof CategoryHolder)) return;
        event.setCancelled(true);
        if (!(event.getWhoClicked() instanceof Player player)) return;
        if (event.getClickedInventory() != event.getView().getTopInventory()) return;

        if (h instanceof MainHolder main) {
            LeaderboardCategory cat = main.slots.get(event.getSlot());
            if (cat != null) {
                GuiDesign.soundClick(player);
                openCategory(player, cat);
            }
        } else if (h instanceof CategoryHolder cat) {
            if (event.getSlot() == cat.backSlot) {
                GuiDesign.soundClick(player);
                openMain(player);
            }
        }
    }

    @EventHandler
    public void onDrag(InventoryDragEvent event) {
        InventoryHolder h = event.getView().getTopInventory().getHolder();
        if (h instanceof MainHolder || h instanceof CategoryHolder) {
            event.setCancelled(true);
        }
    }
}
