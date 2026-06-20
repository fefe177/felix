package eu.bieder.bigmc.quest;

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
 * GUI fuer Daily- und Weekly-Quests mit Fortschrittsbalken und Claim-Funktion.
 */
public class QuestGUI implements Listener {

    public static class Holder implements InventoryHolder {
        private final Map<Integer, Quest> slots = new HashMap<>();
        private Inventory inventory;
        @Override public Inventory getInventory() { return inventory; }
    }

    private final BigMC plugin;

    public QuestGUI(BigMC plugin) {
        this.plugin = plugin;
    }

    public void open(Player player) {
        MessageManager msg = plugin.getMessageManager();
        Holder holder = new Holder();
        Inventory inv = Bukkit.createInventory(holder, 54, msg.getRaw("quests.gui-title"));
        holder.inventory = inv;
        GuiDesign.fillBorder(inv);

        inv.setItem(4, GuiDesign.named(Material.WRITABLE_BOOK, msg.getRaw("quests.daily-header"), List.of()));
        inv.setItem(31, GuiDesign.named(Material.ENCHANTED_BOOK, msg.getRaw("quests.weekly-header"), List.of()));

        placeRow(player, inv, holder, plugin.getQuestManager().getActive(QuestPeriod.DAILY), 2);
        placeRow(player, inv, holder, plugin.getQuestManager().getActive(QuestPeriod.WEEKLY), 4);

        player.openInventory(inv);
    }

    private void placeRow(Player player, Inventory inv, Holder holder, List<Quest> quests, int row) {
        int[] slots = GuiDesign.centeredSlots(row, quests.size());
        for (int i = 0; i < quests.size(); i++) {
            Quest q = quests.get(i);
            inv.setItem(slots[i], buildItem(player, q));
            holder.slots.put(slots[i], q);
        }
    }

    private ItemStack buildItem(Player player, Quest q) {
        MessageManager msg = plugin.getMessageManager();
        int progress = plugin.getQuestManager().getProgress(player.getUniqueId(), q);
        boolean complete = progress >= q.amount();
        boolean claimed = plugin.getQuestManager().isClaimed(player.getUniqueId(), q);

        List<String> lore = new ArrayList<>();
        lore.add(MessageManager.color("&7" + q.display()));
        lore.add("");
        lore.add(GuiDesign.progressBar(Math.min(progress, q.amount()), q.amount()));
        lore.add(msg.getRaw("quests.lore-progress")
                .replace("%progress%", String.valueOf(Math.min(progress, q.amount())))
                .replace("%amount%", String.valueOf(q.amount())));
        lore.add("");
        if (q.rewardMoney() > 0) {
            lore.add(msg.getRaw("quests.lore-reward-money")
                    .replace("%money%", plugin.getEconomyManager().formatMoney(q.rewardMoney())));
        }
        if (q.rewardShards() > 0) {
            lore.add(msg.getRaw("quests.lore-reward-shards")
                    .replace("%shards%", plugin.getShardsManager().formatShards(q.rewardShards())));
        }
        lore.add("");
        if (claimed) lore.add(msg.getRaw("quests.lore-claimed"));
        else if (complete) lore.add(msg.getRaw("quests.lore-claim"));
        else lore.add(msg.getRaw("quests.lore-incomplete"));

        Material icon = claimed ? Material.LIME_DYE : q.icon();
        return GuiDesign.named(icon, "&a" + q.display(), lore);
    }

    @EventHandler
    public void onClick(InventoryClickEvent event) {
        if (!(event.getView().getTopInventory().getHolder() instanceof Holder holder)) return;
        event.setCancelled(true);
        if (!(event.getWhoClicked() instanceof Player player)) return;
        if (event.getClickedInventory() != event.getView().getTopInventory()) return;

        Quest q = holder.slots.get(event.getSlot());
        if (q == null) return;

        MessageManager msg = plugin.getMessageManager();
        if (plugin.getQuestManager().isClaimed(player.getUniqueId(), q)) {
            GuiDesign.soundError(player);
            return;
        }
        if (!plugin.getQuestManager().isComplete(player.getUniqueId(), q)) {
            GuiDesign.soundError(player);
            msg.send(player, "quests.not-complete");
            return;
        }
        if (plugin.getQuestManager().claim(player, q)) {
            GuiDesign.soundSuccess(player);
            msg.send(player, "quests.reward-received",
                    "%quest%", MessageManager.color(q.display()));
            open(player); // GUI aktualisieren
        }
    }

    @EventHandler
    public void onDrag(InventoryDragEvent event) {
        if (event.getView().getTopInventory().getHolder() instanceof Holder) {
            event.setCancelled(true);
        }
    }
}
