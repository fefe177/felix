package eu.bieder.bigmc.crate;

import eu.bieder.bigmc.BigMC;
import eu.bieder.bigmc.config.MessageManager;
import eu.bieder.bigmc.util.GuiDesign;
import org.bukkit.Bukkit;
import org.bukkit.Material;
import org.bukkit.Sound;
import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.Listener;
import org.bukkit.event.inventory.InventoryClickEvent;
import org.bukkit.event.inventory.InventoryCloseEvent;
import org.bukkit.event.inventory.InventoryDragEvent;
import org.bukkit.inventory.Inventory;
import org.bukkit.inventory.InventoryHolder;
import org.bukkit.inventory.ItemStack;
import org.bukkit.scheduler.BukkitRunnable;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ThreadLocalRandom;

/**
 * Crate-GUIs: Hauptmenue (Crates + eigene Schluessel), Vorschau (Belohnungen +
 * Chancen) und die Oeffnungs-Animation mit Reveal.
 *
 * Sicherheit: Die Belohnung wird VOR der Animation ausgelost und der Schluessel
 * abgezogen; sie wird genau einmal vergeben (auch wenn der Spieler das Fenster
 * frueh schliesst).
 */
public class CrateGUI implements Listener {

    public static class MainHolder implements InventoryHolder {
        private final Map<Integer, Crate> slots = new HashMap<>();
        private Inventory inventory;
        @Override public Inventory getInventory() { return inventory; }
    }

    public static class PreviewHolder implements InventoryHolder {
        private Inventory inventory;
        @Override public Inventory getInventory() { return inventory; }
    }

    public static class AnimationHolder implements InventoryHolder {
        private final Crate crate;
        private final CrateReward reward;
        private boolean rewarded;
        private BukkitRunnable task;
        private Inventory inventory;
        AnimationHolder(Crate crate, CrateReward reward) { this.crate = crate; this.reward = reward; }
        @Override public Inventory getInventory() { return inventory; }
    }

    private static final int ANIM_SLOT = 13;

    private final BigMC plugin;

    public CrateGUI(BigMC plugin) {
        this.plugin = plugin;
    }

    // ----- Hauptmenue -----

    public void openMain(Player player) {
        MessageManager msg = plugin.getMessageManager();
        List<Crate> list = plugin.getCrateManager().getCrates();
        int innerRows = Math.max(1, (list.size() + 6) / 7);
        int rows = Math.min(6, innerRows + 2);

        MainHolder holder = new MainHolder();
        Inventory inv = Bukkit.createInventory(holder, rows * 9, msg.getRaw("crate.gui-title"));
        holder.inventory = inv;
        GuiDesign.fillBorder(inv);

        int index = 0;
        for (int row = 1; row <= innerRows && index < list.size(); row++) {
            int inRow = Math.min(7, list.size() - index);
            int[] slots = GuiDesign.centeredSlots(row, inRow);
            for (int slot : slots) {
                Crate crate = list.get(index++);
                int keys = plugin.getCrateManager().getKeys(player.getUniqueId(), crate.id());
                List<String> lore = List.of(
                        msg.getRaw("crate.gui-keys").replace("%keys%", String.valueOf(keys)),
                        "",
                        msg.getRaw("crate.gui-open"),
                        msg.getRaw("crate.gui-preview"));
                ItemStack crateItem = GuiDesign.named(crate.icon(), crate.display(), lore);
                if (keys > 0) GuiDesign.glow(crateItem); // Crate mit Schluessel leuchtet
                inv.setItem(slot, crateItem);
                holder.slots.put(slot, crate);
            }
        }
        player.openInventory(inv);
    }

    // ----- Vorschau -----

    public void openPreview(Player player, Crate crate) {
        MessageManager msg = plugin.getMessageManager();
        int rows = Math.min(6, Math.max(3, (crate.rewards().size() + 8) / 9 + 2));
        PreviewHolder holder = new PreviewHolder();
        Inventory inv = Bukkit.createInventory(holder, rows * 9,
                msg.getRaw("crate.preview-title").replace("%crate%", MessageManager.color(crate.display())));
        holder.inventory = inv;
        GuiDesign.fillBorder(inv);

        int slot = 10;
        for (CrateReward reward : crate.rewards()) {
            double chance = crate.totalWeight() > 0 ? (reward.weight() * 100.0 / crate.totalWeight()) : 0;
            List<String> lore = new ArrayList<>();
            lore.add(rarityColor(reward.rarity()) + reward.rarity());
            lore.add(msg.getRaw("crate.preview-chance").replace("%chance%", String.format("%.1f", chance)));
            inv.setItem(slot, GuiDesign.named(rewardIcon(reward), reward.display(), lore));
            slot++;
            if (slot % 9 == 8) slot += 2; // Rand ueberspringen
            if (slot >= inv.getSize() - 9) break;
        }
        inv.setItem(inv.getSize() - 5, GuiDesign.named(Material.BARRIER, msg.getRaw("crate.back"), List.of()));
        player.openInventory(inv);
    }

    // ----- Oeffnen mit Animation -----

    public void open(Player player, Crate crate) {
        MessageManager msg = plugin.getMessageManager();
        if (!plugin.getCrateManager().takeKey(player.getUniqueId(), crate.id())) {
            GuiDesign.soundError(player);
            msg.send(player, "crate.no-key", "%crate%", MessageManager.color(crate.display()));
            return;
        }
        CrateReward reward = plugin.getCrateManager().roll(crate);
        if (reward == null) {
            // Sollte nicht passieren - Schluessel zurueckgeben
            plugin.getCrateManager().giveKeys(player.getUniqueId(), crate.id(), 1);
            return;
        }

        AnimationHolder holder = new AnimationHolder(crate, reward);
        Inventory inv = Bukkit.createInventory(holder, 27, msg.getRaw("crate.anim-title"));
        holder.inventory = inv;
        GuiDesign.fillAll(inv);
        inv.setItem(ANIM_SLOT, GuiDesign.named(Material.GRAY_STAINED_GLASS_PANE, " ", List.of()));
        player.openInventory(inv);

        holder.task = new BukkitRunnable() {
            int ticks = 0;
            @Override
            public void run() {
                if (holder.rewarded) { cancel(); return; }
                if (ticks >= 28) {
                    finish(player, holder);
                    cancel();
                    return;
                }
                CrateReward random = crate.rewards().get(ThreadLocalRandom.current().nextInt(crate.rewards().size()));
                inv.setItem(ANIM_SLOT, GuiDesign.named(rewardIcon(random),
                        rarityColor(random.rarity()) + random.display(), List.of()));
                player.playSound(player.getLocation(), Sound.UI_BUTTON_CLICK, 0.3f, 1.2f);
                ticks++;
            }
        };
        holder.task.runTaskTimer(plugin, 4L, 3L);
    }

    /** Reveal + Belohnung vergeben (genau einmal). */
    private void finish(Player player, AnimationHolder holder) {
        if (holder.rewarded) return;
        holder.rewarded = true;
        if (holder.task != null) holder.task.cancel();

        MessageManager msg = plugin.getMessageManager();
        if (holder.inventory.getViewers().contains(player)) {
            holder.inventory.setItem(ANIM_SLOT, GuiDesign.named(rewardIcon(holder.reward),
                    rarityColor(holder.reward.rarity()) + holder.reward.display(), List.of()));
        }
        plugin.getCrateManager().giveReward(player, holder.reward);
        player.playSound(player.getLocation(), Sound.UI_TOAST_CHALLENGE_COMPLETE, 0.8f, 1.0f);
        msg.send(player, "crate.won",
                "%crate%", MessageManager.color(holder.crate.display()),
                "%reward%", MessageManager.color(holder.reward.display()));
    }

    // ----- Klicks / Schliessen -----

    @EventHandler
    public void onClick(InventoryClickEvent event) {
        InventoryHolder h = event.getView().getTopInventory().getHolder();
        if (!(h instanceof MainHolder || h instanceof PreviewHolder || h instanceof AnimationHolder)) return;
        event.setCancelled(true);
        if (!(event.getWhoClicked() instanceof Player player)) return;
        if (event.getClickedInventory() != event.getView().getTopInventory()) return;

        if (h instanceof MainHolder main) {
            Crate crate = main.slots.get(event.getSlot());
            if (crate == null) return;
            if (event.isRightClick()) {
                GuiDesign.soundClick(player);
                openPreview(player, crate);
            } else {
                open(player, crate);
            }
        } else if (h instanceof PreviewHolder) {
            if (event.getSlot() == event.getView().getTopInventory().getSize() - 5) {
                GuiDesign.soundClick(player);
                openMain(player);
            }
        }
        // AnimationHolder: Klicks ignorieren (nur cancel)
    }

    @EventHandler
    public void onClose(InventoryCloseEvent event) {
        if (event.getView().getTopInventory().getHolder() instanceof AnimationHolder holder && !holder.rewarded) {
            // Frueh geschlossen -> Belohnung trotzdem vergeben (kein Verlust)
            if (event.getPlayer() instanceof Player player) {
                finish(player, holder);
            }
        }
    }

    @EventHandler
    public void onDrag(InventoryDragEvent event) {
        InventoryHolder h = event.getView().getTopInventory().getHolder();
        if (h instanceof MainHolder || h instanceof PreviewHolder || h instanceof AnimationHolder) {
            event.setCancelled(true);
        }
    }

    // ----- Helfer -----

    private Material rewardIcon(CrateReward reward) {
        if (!reward.items().isEmpty()) return reward.items().keySet().iterator().next();
        if (reward.shards() > 0) return Material.AMETHYST_SHARD;
        if (reward.money() > 0) return Material.GOLD_INGOT;
        return Material.PAPER;
    }

    private String rarityColor(String rarity) {
        return switch (rarity == null ? "" : rarity.toUpperCase()) {
            case "RARE" -> "&b";
            case "EPIC" -> "&5";
            case "LEGENDARY" -> "&6";
            default -> "&f";
        };
    }
}
