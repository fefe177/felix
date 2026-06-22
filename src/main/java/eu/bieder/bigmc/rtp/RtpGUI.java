package eu.bieder.bigmc.rtp;

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
 * Auswahl-GUI fuer den Random-Teleport: der Spieler waehlt die Zieldimension
 * (Overworld / Nether / End) per Klick. Cooldown wird im Kopf-Item angezeigt.
 */
public class RtpGUI implements Listener {

    public static class Holder implements InventoryHolder {
        private final Map<Integer, RtpManager.Dimension> slots = new HashMap<>();
        private Inventory inventory;
        @Override public Inventory getInventory() { return inventory; }
    }

    private final BigMC plugin;

    public RtpGUI(BigMC plugin) {
        this.plugin = plugin;
    }

    public void open(Player player) {
        MessageManager msg = plugin.getMessageManager();
        Holder holder = new Holder();
        Inventory inv = Bukkit.createInventory(holder, 27, msg.getRaw("rtp.gui-title"));
        holder.inventory = inv;
        GuiDesign.fillBorder(inv);

        // Drei Dimensionen mittig in Reihe 1
        button(inv, holder, 12, RtpManager.Dimension.OVERWORLD, Material.GRASS_BLOCK, "rtp.gui-overworld");
        button(inv, holder, 13, RtpManager.Dimension.NETHER, Material.NETHERRACK, "rtp.gui-nether");
        button(inv, holder, 14, RtpManager.Dimension.END, Material.END_STONE, "rtp.gui-end");

        // Cooldown-Info als Kopf
        long remaining = plugin.getRtpManager().getRemainingCooldown(player.getUniqueId());
        String cd = remaining > 0
                ? msg.getRaw("rtp.gui-cooldown").replace("%seconds%", String.valueOf(remaining))
                : msg.getRaw("rtp.gui-ready");
        inv.setItem(4, GuiDesign.named(Material.CLOCK, msg.getRaw("rtp.gui-info-name"), List.of(cd)));

        player.openInventory(inv);
    }

    private void button(Inventory inv, Holder holder, int slot, RtpManager.Dimension dim,
                        Material icon, String key) {
        MessageManager msg = plugin.getMessageManager();
        // Nur Dimensionen anbieten, deren Welt auch geladen ist
        boolean available = plugin.getRtpManager().getWorld(dim) != null;
        List<String> lore = List.of(available
                ? msg.getRaw("rtp.gui-click")
                : msg.getRaw("rtp.gui-unavailable"));
        var item = GuiDesign.named(available ? icon : Material.BARRIER, msg.getRaw(key), lore);
        if (available) {
            GuiDesign.glow(item);
            holder.slots.put(slot, dim);
        }
        inv.setItem(slot, item);
    }

    @EventHandler
    public void onClick(InventoryClickEvent event) {
        if (!(event.getView().getTopInventory().getHolder() instanceof Holder holder)) return;
        event.setCancelled(true);
        if (!(event.getWhoClicked() instanceof Player player)) return;
        if (event.getClickedInventory() != event.getView().getTopInventory()) return;

        RtpManager.Dimension dim = holder.slots.get(event.getSlot());
        if (dim == null) return;

        GuiDesign.soundClick(player);
        player.closeInventory();
        plugin.getRtpManager().attemptTeleport(player, dim);
    }

    @EventHandler
    public void onDrag(InventoryDragEvent event) {
        if (event.getView().getTopInventory().getHolder() instanceof Holder) {
            event.setCancelled(true);
        }
    }
}
