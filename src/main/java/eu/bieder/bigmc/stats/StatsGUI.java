package eu.bieder.bigmc.stats;

import eu.bieder.bigmc.BigMC;
import eu.bieder.bigmc.config.MessageManager;
import eu.bieder.bigmc.util.GuiDesign;
import org.bukkit.Bukkit;
import org.bukkit.Material;
import org.bukkit.OfflinePlayer;
import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.Listener;
import org.bukkit.event.inventory.InventoryClickEvent;
import org.bukkit.event.inventory.InventoryDragEvent;
import org.bukkit.inventory.Inventory;
import org.bukkit.inventory.InventoryHolder;
import org.bukkit.inventory.ItemStack;
import org.bukkit.inventory.meta.SkullMeta;

import java.util.List;
import java.util.Locale;

/**
 * Zeigt die Statistiken eines Spielers als uebersichtliches GUI
 * (Kills, Tode, K/D, Duell-Siege, Spielzeit, Geld, Shards).
 */
public class StatsGUI implements Listener {

    public static class Holder implements InventoryHolder {
        private Inventory inventory;
        @Override public Inventory getInventory() { return inventory; }
    }

    private final BigMC plugin;

    public StatsGUI(BigMC plugin) {
        this.plugin = plugin;
    }

    public void open(Player viewer, StatsManager.PlayerStats s) {
        MessageManager msg = plugin.getMessageManager();
        Holder holder = new Holder();
        Inventory inv = Bukkit.createInventory(holder, 27,
                msg.getRaw("statsgui.gui-title").replace("%player%", s.name()));
        holder.inventory = inv;
        GuiDesign.fillBorder(inv);

        // Kopf: Spieler-Kopf mit Namen
        inv.setItem(4, playerHead(s.name(), s.uuid()));

        double kd = s.deaths() == 0 ? s.kills() : (double) s.kills() / s.deaths();
        long shards = plugin.getShardsManager().getShards(s.uuid());
        double balance = plugin.getEconomyManager().getBalance(s.uuid());

        inv.setItem(10, statItem(Material.DIAMOND_SWORD, "statsgui.kills", String.valueOf(s.kills())));
        inv.setItem(11, statItem(Material.SKELETON_SKULL, "statsgui.deaths", String.valueOf(s.deaths())));
        inv.setItem(12, statItem(Material.NETHERITE_SWORD, "statsgui.kd",
                String.format(Locale.GERMANY, "%.2f", kd)));
        inv.setItem(13, statItem(Material.IRON_SWORD, "statsgui.duelwins", String.valueOf(s.duelWins())));
        inv.setItem(14, statItem(Material.CLOCK, "statsgui.playtime",
                StatsManager.formatPlaytime(s.playtimeSeconds())));
        inv.setItem(15, statItem(Material.GOLD_INGOT, "statsgui.money",
                plugin.getEconomyManager().formatMoney(balance)));
        inv.setItem(16, statItem(Material.AMETHYST_SHARD, "statsgui.shards",
                plugin.getShardsManager().formatShards(shards)));

        viewer.openInventory(inv);
    }

    private ItemStack statItem(Material icon, String nameKey, String value) {
        MessageManager msg = plugin.getMessageManager();
        return GuiDesign.named(icon, msg.getRaw(nameKey),
                List.of(msg.getRaw("statsgui.value").replace("%value%", value)));
    }

    private ItemStack playerHead(String name, java.util.UUID uuid) {
        ItemStack head = new ItemStack(Material.PLAYER_HEAD);
        if (head.getItemMeta() instanceof SkullMeta meta) {
            OfflinePlayer off = Bukkit.getOfflinePlayer(uuid);
            meta.setOwningPlayer(off);
            meta.setDisplayName(MessageManager.color("&e&l" + name));
            head.setItemMeta(meta);
        }
        return head;
    }

    @EventHandler
    public void onClick(InventoryClickEvent event) {
        if (event.getView().getTopInventory().getHolder() instanceof Holder) {
            event.setCancelled(true);
        }
    }

    @EventHandler
    public void onDrag(InventoryDragEvent event) {
        if (event.getView().getTopInventory().getHolder() instanceof Holder) {
            event.setCancelled(true);
        }
    }
}
