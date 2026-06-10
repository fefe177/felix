package eu.bieder.bigmc.shop.command;

import eu.bieder.bigmc.BigMC;
import eu.bieder.bigmc.config.MessageManager;
import eu.bieder.bigmc.shop.ShopGUI;
import org.bukkit.Material;
import org.bukkit.command.Command;
import org.bukkit.command.CommandExecutor;
import org.bukkit.command.CommandSender;
import org.bukkit.command.TabCompleter;
import org.bukkit.entity.Player;
import org.bukkit.inventory.ItemStack;

import java.util.List;
import java.util.Optional;

/**
 * /sell hand -> verkauft den Stack in der Haupthand
 * /sell all  -> verkauft alles Verkaufbare aus dem Inventar
 *
 * Die Preise kommen aus dem ShopManager (config.yml).
 * Umbenannte/verzauberte Items werden nie automatisch verkauft.
 */
public class SellCommand implements CommandExecutor, TabCompleter {

    private final BigMC plugin;

    public SellCommand(BigMC plugin) {
        this.plugin = plugin;
    }

    @Override
    public boolean onCommand(CommandSender sender, Command command, String label, String[] args) {
        MessageManager msg = plugin.getMessageManager();

        if (!(sender instanceof Player player)) {
            msg.send(sender, "general.player-only");
            return true;
        }

        if (args.length != 1) {
            msg.send(player, "shop.sell-usage");
            return true;
        }

        switch (args[0].toLowerCase()) {
            case "hand" -> sellHand(player);
            case "all" -> sellAll(player);
            default -> msg.send(player, "shop.sell-usage");
        }
        return true;
    }

    /**
     * Verkauft den kompletten Item-Stack in der Haupthand.
     */
    private void sellHand(Player player) {
        MessageManager msg = plugin.getMessageManager();
        ItemStack hand = player.getInventory().getItemInMainHand();

        if (hand.getType() == Material.AIR) {
            msg.send(player, "shop.sell-hand-empty");
            return;
        }
        if (hand.hasItemMeta()) {
            // Spezial-Items (umbenannt/verzaubert) bewusst nicht verkaufen
            msg.send(player, "shop.sell-special-item");
            return;
        }

        Optional<Double> price = plugin.getShopManager().getSellPrice(hand.getType());
        if (price.isEmpty()) {
            msg.send(player, "shop.sell-not-sellable",
                    "%item%", ShopGUI.prettyName(hand.getType()));
            return;
        }

        int amount = hand.getAmount();
        double total = price.get() * amount;

        // Erst Items wegnehmen, dann Geld gutschreiben (scam-sicher)
        player.getInventory().setItemInMainHand(null);
        plugin.getEconomyManager().deposit(player.getUniqueId(), total);

        msg.send(player, "shop.sold",
                "%amount%", String.valueOf(amount),
                "%item%", ShopGUI.prettyName(hand.getType()),
                "%price%", plugin.getEconomyManager().formatMoney(total));
    }

    /**
     * Verkauft alle verkaufbaren Items aus dem gesamten Inventar.
     */
    private void sellAll(Player player) {
        MessageManager msg = plugin.getMessageManager();

        double total = 0;
        int soldItems = 0;

        ItemStack[] contents = player.getInventory().getStorageContents();
        for (int i = 0; i < contents.length; i++) {
            ItemStack stack = contents[i];
            if (stack == null || stack.getType() == Material.AIR) continue;
            if (stack.hasItemMeta()) continue; // Spezial-Items behalten

            Optional<Double> price = plugin.getShopManager().getSellPrice(stack.getType());
            if (price.isEmpty()) continue;

            total += price.get() * stack.getAmount();
            soldItems += stack.getAmount();
            contents[i] = null;
        }

        if (soldItems == 0) {
            msg.send(player, "shop.sell-all-nothing");
            return;
        }

        player.getInventory().setStorageContents(contents);
        plugin.getEconomyManager().deposit(player.getUniqueId(), total);

        msg.send(player, "shop.sold-all",
                "%amount%", String.valueOf(soldItems),
                "%price%", plugin.getEconomyManager().formatMoney(total));
    }

    @Override
    public List<String> onTabComplete(CommandSender sender, Command command, String alias, String[] args) {
        if (args.length == 1) {
            return List.of("hand", "all").stream()
                    .filter(s -> s.startsWith(args[0].toLowerCase()))
                    .toList();
        }
        return List.of();
    }
}
