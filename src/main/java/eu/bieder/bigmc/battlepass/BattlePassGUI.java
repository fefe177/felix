package eu.bieder.bigmc.battlepass;

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
 * Belohnungs-GUI fuer den Battle Pass: zeigt alle Level mit Free- und
 * Premium-Belohnungen, Fortschritt und Claim-Funktion (mit Pagination).
 *
 * Linksklick auf ein Level = Free-Belohnung abholen.
 * Rechtsklick = Premium-Belohnung abholen (nur mit Premium-Pfad).
 */
public class BattlePassGUI implements Listener {

    private static final int PER_PAGE = 28;
    private static final int SLOT_PREV = 48, SLOT_INFO = 49, SLOT_NEXT = 50, SLOT_BUY = 45;

    public static class Holder implements InventoryHolder {
        private int page;
        private final Map<Integer, Integer> slotLevel = new HashMap<>();
        private Inventory inventory;
        @Override public Inventory getInventory() { return inventory; }
    }

    private final BigMC plugin;

    public BattlePassGUI(BigMC plugin) {
        this.plugin = plugin;
    }

    public void open(Player player, int page) {
        MessageManager msg = plugin.getMessageManager();
        BattlePassManager bp = plugin.getBattlePassManager();
        int maxLevel = bp.getMaxLevel();
        int maxPage = Math.max(1, (maxLevel + PER_PAGE - 1) / PER_PAGE);
        page = Math.max(1, Math.min(page, maxPage));

        Holder holder = new Holder();
        holder.page = page;
        Inventory inv = Bukkit.createInventory(holder, 54, msg.getRaw("battlepass.gui-title")
                .replace("%season%", String.valueOf(bp.getSeason())));
        holder.inventory = inv;
        GuiDesign.fillBorder(inv);

        // Kopfzeile: Level + XP + Premium-Status
        int level = bp.getLevel(player.getUniqueId());
        int xp = bp.getXp(player.getUniqueId());
        int into = xp - level * bp.getXpPerLevel();
        List<String> headLore = new ArrayList<>();
        headLore.add(msg.getRaw("battlepass.head-level").replace("%level%", String.valueOf(level))
                .replace("%max%", String.valueOf(maxLevel)));
        if (level < maxLevel) {
            headLore.add(GuiDesign.progressBar(into, bp.getXpPerLevel()));
            headLore.add(msg.getRaw("battlepass.head-xp")
                    .replace("%xp%", String.valueOf(into))
                    .replace("%need%", String.valueOf(bp.getXpPerLevel())));
        }
        headLore.add(bp.isPremium(player.getUniqueId())
                ? msg.getRaw("battlepass.head-premium-yes")
                : msg.getRaw("battlepass.head-premium-no"));
        inv.setItem(4, GuiDesign.named(Material.NETHER_STAR, msg.getRaw("battlepass.head-name"), headLore));

        // Levels dieser Seite
        int start = (page - 1) * PER_PAGE + 1;
        int[] content = innerSlots();
        for (int i = 0; i < PER_PAGE; i++) {
            int lvl = start + i;
            if (lvl > maxLevel) break;
            inv.setItem(content[i], buildLevelItem(player, lvl));
            holder.slotLevel.put(content[i], lvl);
        }

        // Navigation + Premium-Kauf
        if (page > 1) inv.setItem(SLOT_PREV, GuiDesign.named(Material.ARROW, msg.getRaw("battlepass.prev"), List.of()));
        if (page < maxPage) inv.setItem(SLOT_NEXT, GuiDesign.named(Material.ARROW, msg.getRaw("battlepass.next"), List.of()));
        inv.setItem(SLOT_INFO, GuiDesign.named(Material.BOOK, msg.getRaw("battlepass.page-info")
                .replace("%page%", String.valueOf(page)).replace("%max%", String.valueOf(maxPage)), List.of()));
        if (!bp.isPremium(player.getUniqueId())) {
            inv.setItem(SLOT_BUY, GuiDesign.named(Material.EMERALD, msg.getRaw("battlepass.buy-name"),
                    List.of(msg.getRaw("battlepass.buy-lore")
                            .replace("%price%", plugin.getEconomyManager().formatMoney(bp.getPremiumCostMoney())))));
        }

        player.openInventory(inv);
    }

    /** Innenbereich (Reihen 1-4, Spalten 1-7) = 28 Slots. */
    private int[] innerSlots() {
        int[] slots = new int[PER_PAGE];
        int idx = 0;
        for (int row = 1; row <= 4; row++) {
            for (int col = 1; col <= 7; col++) {
                slots[idx++] = row * 9 + col;
            }
        }
        return slots;
    }

    private ItemStack buildLevelItem(Player player, int level) {
        MessageManager msg = plugin.getMessageManager();
        BattlePassManager bp = plugin.getBattlePassManager();
        boolean reached = bp.getLevel(player.getUniqueId()) >= level;
        boolean premium = bp.isPremium(player.getUniqueId());

        BattlePassReward free = bp.reward(level, BattlePassManager.Track.FREE);
        BattlePassReward prem = bp.reward(level, BattlePassManager.Track.PREMIUM);
        boolean freeClaimed = bp.isClaimed(player.getUniqueId(), level, BattlePassManager.Track.FREE);
        boolean premClaimed = bp.isClaimed(player.getUniqueId(), level, BattlePassManager.Track.PREMIUM);

        List<String> lore = new ArrayList<>();
        lore.add(msg.getRaw("battlepass.level-free")
                .replace("%reward%", rewardText(free)));
        lore.add("  " + statusText(reached, freeClaimed));
        lore.add(msg.getRaw("battlepass.level-premium")
                .replace("%reward%", rewardText(prem)));
        lore.add("  " + (premium ? statusText(reached, premClaimed) : msg.getRaw("battlepass.level-need-premium")));
        lore.add("");
        lore.add(msg.getRaw("battlepass.level-click"));

        Material icon;
        if (!reached) icon = Material.GRAY_STAINED_GLASS_PANE;
        else if (freeClaimed && (premClaimed || !premium)) icon = Material.LIME_STAINED_GLASS_PANE;
        else icon = Material.YELLOW_STAINED_GLASS_PANE;

        return GuiDesign.named(icon, msg.getRaw("battlepass.level-name").replace("%level%", String.valueOf(level)), lore);
    }

    private String rewardText(BattlePassReward r) {
        if (r.isEmpty()) return plugin.getMessageManager().getRaw("battlepass.reward-none");
        StringBuilder sb = new StringBuilder();
        if (r.money() > 0) sb.append("&a").append(plugin.getEconomyManager().formatMoney(r.money()));
        if (r.shards() > 0) {
            if (sb.length() > 0) sb.append("&7, ");
            sb.append("&d").append(plugin.getShardsManager().formatShards(r.shards()));
        }
        return MessageManager.color(sb.toString());
    }

    private String statusText(boolean reached, boolean claimed) {
        MessageManager msg = plugin.getMessageManager();
        if (claimed) return msg.getRaw("battlepass.status-claimed");
        if (reached) return msg.getRaw("battlepass.status-claimable");
        return msg.getRaw("battlepass.status-locked");
    }

    @EventHandler
    public void onClick(InventoryClickEvent event) {
        if (!(event.getView().getTopInventory().getHolder() instanceof Holder holder)) return;
        event.setCancelled(true);
        if (!(event.getWhoClicked() instanceof Player player)) return;
        if (event.getClickedInventory() != event.getView().getTopInventory()) return;

        int slot = event.getSlot();
        MessageManager msg = plugin.getMessageManager();

        if (slot == SLOT_PREV) { GuiDesign.soundClick(player); open(player, holder.page - 1); return; }
        if (slot == SLOT_NEXT) { GuiDesign.soundClick(player); open(player, holder.page + 1); return; }
        if (slot == SLOT_BUY) {
            if (plugin.getBattlePassManager().buyPremium(player)) {
                GuiDesign.soundSuccess(player);
                msg.send(player, "battlepass.premium-bought");
                open(player, holder.page);
            } else {
                GuiDesign.soundError(player);
            }
            return;
        }

        Integer level = holder.slotLevel.get(slot);
        if (level == null) return;

        BattlePassManager.Track track = event.isRightClick()
                ? BattlePassManager.Track.PREMIUM : BattlePassManager.Track.FREE;

        if (track == BattlePassManager.Track.PREMIUM && !plugin.getBattlePassManager().isPremium(player.getUniqueId())) {
            GuiDesign.soundError(player);
            msg.send(player, "battlepass.need-premium");
            return;
        }
        if (plugin.getBattlePassManager().claim(player, level, track)) {
            GuiDesign.soundSuccess(player);
            msg.send(player, "battlepass.claimed", "%level%", String.valueOf(level));
            open(player, holder.page);
        } else {
            GuiDesign.soundError(player);
            msg.send(player, "battlepass.cannot-claim");
        }
    }

    @EventHandler
    public void onDrag(InventoryDragEvent event) {
        if (event.getView().getTopInventory().getHolder() instanceof Holder) {
            event.setCancelled(true);
        }
    }
}
