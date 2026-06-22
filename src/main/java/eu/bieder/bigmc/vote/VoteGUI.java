package eu.bieder.bigmc.vote;

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
import java.util.List;

/**
 * Vote-GUI: zeigt die Vote-Links, die eigene Vote-Anzahl und einen Button
 * zum Abholen ausstehender Belohnungen.
 */
public class VoteGUI implements Listener {

    private static final int SLOT_CLAIM = 15;

    public static class Holder implements InventoryHolder {
        private Inventory inventory;
        @Override public Inventory getInventory() { return inventory; }
    }

    private final BigMC plugin;

    public VoteGUI(BigMC plugin) {
        this.plugin = plugin;
    }

    public void open(Player player) {
        MessageManager msg = plugin.getMessageManager();
        Holder holder = new Holder();
        Inventory inv = Bukkit.createInventory(holder, 27, msg.getRaw("votegui.gui-title"));
        holder.inventory = inv;
        GuiDesign.fillBorder(inv);

        int total = plugin.getVoteRewardManager().getTotal(player.getName());
        int pending = plugin.getVoteRewardManager().getPending(player.getName());

        // Info: eigene Votes
        inv.setItem(11, GuiDesign.named(Material.PLAYER_HEAD, msg.getRaw("votegui.info-name"),
                List.of(
                        msg.getRaw("votegui.total").replace("%total%", String.valueOf(total)),
                        msg.getRaw("votegui.pending").replace("%pending%", String.valueOf(pending)))));

        // Vote-Links aus der config
        List<String> links = new ArrayList<>();
        for (String link : plugin.getConfigManager().getConfig().getStringList("vote.links")) {
            links.add(MessageManager.color(link));
        }
        inv.setItem(13, GuiDesign.named(Material.PAPER, msg.getRaw("votegui.links-name"), links));

        // Abhol-Button
        List<String> claimLore = List.of(pending > 0
                ? msg.getRaw("votegui.claim-lore").replace("%pending%", String.valueOf(pending))
                : msg.getRaw("votegui.claim-none"));
        ItemStack claim = GuiDesign.named(Material.EMERALD, msg.getRaw("votegui.claim-name"), claimLore);
        if (pending > 0) GuiDesign.glow(claim);
        inv.setItem(SLOT_CLAIM, claim);

        player.openInventory(inv);
    }

    @EventHandler
    public void onClick(InventoryClickEvent event) {
        if (!(event.getView().getTopInventory().getHolder() instanceof Holder)) return;
        event.setCancelled(true);
        if (!(event.getWhoClicked() instanceof Player player)) return;
        if (event.getClickedInventory() != event.getView().getTopInventory()) return;

        if (event.getSlot() == SLOT_CLAIM) {
            GuiDesign.soundClick(player);
            player.closeInventory();
            player.performCommand("vote claim");
        }
    }

    @EventHandler
    public void onDrag(InventoryDragEvent event) {
        if (event.getView().getTopInventory().getHolder() instanceof Holder) {
            event.setCancelled(true);
        }
    }
}
