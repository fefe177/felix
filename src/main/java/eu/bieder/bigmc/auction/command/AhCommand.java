package eu.bieder.bigmc.auction.command;

import eu.bieder.bigmc.BigMC;
import eu.bieder.bigmc.auction.AuctionHouseGUI;
import eu.bieder.bigmc.config.MessageManager;
import org.bukkit.Material;
import org.bukkit.command.Command;
import org.bukkit.command.CommandExecutor;
import org.bukkit.command.CommandSender;
import org.bukkit.command.TabCompleter;
import org.bukkit.entity.Player;
import org.bukkit.inventory.ItemStack;

import java.util.List;

/**
 * /ah               -> Auktionshaus oeffnen (Browse-GUI)
 * /ah sell <preis>  -> Item in der Haupthand einstellen
 * /ah collect       -> abgelaufene/gekaufte Items abholen
 */
public class AhCommand implements CommandExecutor, TabCompleter {

    private final BigMC plugin;

    public AhCommand(BigMC plugin) {
        this.plugin = plugin;
    }

    @Override
    public boolean onCommand(CommandSender sender, Command command, String label, String[] args) {
        MessageManager msg = plugin.getMessageManager();

        if (!(sender instanceof Player player)) {
            msg.send(sender, "general.player-only");
            return true;
        }

        // /ah -> GUI oeffnen
        if (args.length == 0) {
            plugin.getAuctionHouseGUI().openBrowse(player, 1);
            return true;
        }

        switch (args[0].toLowerCase()) {
            case "sell" -> sell(player, args);
            case "collect" -> plugin.getAuctionHouseGUI().collect(player);
            default -> msg.send(player, "auction.usage");
        }
        return true;
    }

    /**
     * Stellt das Item aus der Haupthand ins Auktionshaus.
     * Das Item wird SOFORT aus dem Inventar genommen und in der DB gespeichert.
     */
    private void sell(Player player, String[] args) {
        MessageManager msg = plugin.getMessageManager();

        if (args.length != 2) {
            msg.send(player, "auction.sell-usage");
            return;
        }

        ItemStack hand = player.getInventory().getItemInMainHand();
        if (hand.getType() == Material.AIR) {
            msg.send(player, "auction.sell-hand-empty");
            return;
        }

        // Preis pruefen
        double price;
        try {
            price = Double.parseDouble(args[1].replace(',', '.'));
        } catch (NumberFormatException e) {
            msg.send(player, "general.invalid-number");
            return;
        }
        double min = plugin.getAuctionManager().minPrice();
        double max = plugin.getAuctionManager().maxPrice();
        if (!Double.isFinite(price) || price < min || price > max) {
            msg.send(player, "auction.price-out-of-range",
                    "%min%", plugin.getEconomyManager().formatMoney(min),
                    "%max%", plugin.getEconomyManager().formatMoney(max));
            return;
        }

        // Limit aktiver Auktionen pruefen
        int maxListings = plugin.getAuctionManager().maxListings();
        if (plugin.getAuctionManager().countBySeller(player.getUniqueId()) >= maxListings) {
            msg.send(player, "auction.too-many-listings", "%max%", String.valueOf(maxListings));
            return;
        }

        // Item aus der Hand nehmen und einstellen (scam-sicher: erst weg, dann DB)
        ItemStack toSell = hand.clone();
        player.getInventory().setItemInMainHand(null);

        boolean ok = plugin.getAuctionManager().createListing(
                player.getUniqueId(), player.getName(), toSell, price);
        if (!ok) {
            // DB-Fehler -> Item zurueckgeben, nichts geht verloren
            player.getInventory().addItem(toSell).values()
                    .forEach(rest -> player.getWorld().dropItemNaturally(player.getLocation(), rest));
            msg.send(player, "auction.sell-failed");
            return;
        }

        msg.send(player, "auction.listed",
                "%item%", AuctionHouseGUI.itemDisplayName(toSell),
                "%price%", plugin.getEconomyManager().formatMoney(price),
                "%hours%", String.valueOf(plugin.getAuctionManager().durationHours()));
    }

    @Override
    public List<String> onTabComplete(CommandSender sender, Command command, String alias, String[] args) {
        if (args.length == 1) {
            return List.of("sell", "collect").stream()
                    .filter(s -> s.startsWith(args[0].toLowerCase()))
                    .toList();
        }
        return List.of();
    }
}
