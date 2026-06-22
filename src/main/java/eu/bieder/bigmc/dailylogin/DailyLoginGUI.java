package eu.bieder.bigmc.dailylogin;

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
import java.util.Map;

/**
 * GUI fuer Daily-Login-Rewards: zeigt den Zyklus, die aktuelle Serie und einen
 * Abhol-Button fuer den heutigen Tag.
 */
public class DailyLoginGUI implements Listener {

    private static final int SLOT_CLAIM = 49;

    public static class Holder implements InventoryHolder {
        private Inventory inventory;
        @Override public Inventory getInventory() { return inventory; }
    }

    private final BigMC plugin;

    public DailyLoginGUI(BigMC plugin) {
        this.plugin = plugin;
    }

    public void open(Player player) {
        MessageManager msg = plugin.getMessageManager();
        DailyLoginManager dm = plugin.getDailyLoginManager();
        int cycle = dm.getCycle();
        int currentDay = dm.getCurrentDay(player.getUniqueId());
        boolean canClaim = dm.canClaim(player.getUniqueId());

        Holder holder = new Holder();
        Inventory inv = Bukkit.createInventory(holder, 54, msg.getRaw("dailylogin.gui-title"));
        holder.inventory = inv;
        GuiDesign.fillBorder(inv);

        // Bei mehr als 7 Tagen zweite Reihe nutzen
        List<Integer> daySlots = new ArrayList<>();
        for (int s : GuiDesign.centeredSlots(1, Math.min(7, cycle))) daySlots.add(s);
        if (cycle > 7) {
            for (int s : GuiDesign.centeredSlots(2, cycle - 7)) daySlots.add(s);
        } else {
            daySlots.clear();
            for (int s : GuiDesign.centeredSlots(2, cycle)) daySlots.add(s);
        }

        for (int day = 1; day <= cycle && day <= daySlots.size(); day++) {
            DailyReward reward = dm.rewardFor(day);
            List<String> lore = new ArrayList<>();
            if (reward.money() > 0) lore.add(msg.getRaw("dailylogin.reward-money")
                    .replace("%money%", plugin.getEconomyManager().formatMoney(reward.money())));
            if (reward.shards() > 0) lore.add(msg.getRaw("dailylogin.reward-shards")
                    .replace("%shards%", plugin.getShardsManager().formatShards(reward.shards())));
            for (Map.Entry<Material, Integer> e : reward.items().entrySet()) {
                lore.add(msg.getRaw("dailylogin.reward-item")
                        .replace("%amount%", String.valueOf(e.getValue()))
                        .replace("%item%", e.getKey().name()));
            }
            lore.add("");
            if (day == currentDay) lore.add(msg.getRaw("dailylogin.day-current"));
            else if (day < currentDay) lore.add(msg.getRaw("dailylogin.day-past"));
            else lore.add(msg.getRaw("dailylogin.day-future"));

            Material icon = day == currentDay
                    ? (canClaim ? Material.CHEST : Material.ENDER_CHEST)
                    : (day < currentDay ? Material.LIME_STAINED_GLASS_PANE : Material.GRAY_STAINED_GLASS_PANE);
            var dayItem = GuiDesign.named(icon,
                    msg.getRaw("dailylogin.day-name").replace("%day%", String.valueOf(day)), lore);
            if (day == currentDay && canClaim) GuiDesign.glow(dayItem); // heute abholbar -> leuchtet
            inv.setItem(daySlots.get(day - 1), dayItem);
        }

        // Streak-Info + Claim-Button
        inv.setItem(4, GuiDesign.named(Material.NETHER_STAR, msg.getRaw("dailylogin.streak-name"),
                List.of(msg.getRaw("dailylogin.streak-lore")
                        .replace("%streak%", String.valueOf(dm.getStreak(player.getUniqueId()))))));
        if (canClaim) {
            inv.setItem(SLOT_CLAIM, GuiDesign.glow(
                    GuiDesign.named(Material.EMERALD, msg.getRaw("dailylogin.claim-button"), List.of())));
        } else {
            inv.setItem(SLOT_CLAIM, GuiDesign.named(Material.BARRIER, msg.getRaw("dailylogin.claimed-button"), List.of()));
        }
        player.openInventory(inv);
    }

    @EventHandler
    public void onClick(InventoryClickEvent event) {
        if (!(event.getView().getTopInventory().getHolder() instanceof Holder)) return;
        event.setCancelled(true);
        if (!(event.getWhoClicked() instanceof Player player)) return;
        if (event.getClickedInventory() != event.getView().getTopInventory()) return;
        if (event.getSlot() != SLOT_CLAIM) return;

        if (plugin.getDailyLoginManager().claim(player)) {
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
