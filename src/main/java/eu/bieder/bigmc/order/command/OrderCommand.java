package eu.bieder.bigmc.order.command;

import eu.bieder.bigmc.BigMC;
import eu.bieder.bigmc.config.MessageManager;
import eu.bieder.bigmc.order.OrderManager;
import eu.bieder.bigmc.shop.ShopGUI;
import org.bukkit.Bukkit;
import org.bukkit.Material;
import org.bukkit.command.Command;
import org.bukkit.command.CommandExecutor;
import org.bukkit.command.CommandSender;
import org.bukkit.command.TabCompleter;
import org.bukkit.entity.Player;
import org.bukkit.inventory.ItemStack;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * /order create <material> <anzahl> <preisProStueck> -> Auftrag erstellen (Pfand wird hinterlegt)
 * /order list                                        -> offene Auftraege anzeigen
 * /order fulfill <id> [anzahl]                       -> Items liefern, sofort Geld erhalten
 * /order collect                                     -> gelieferte Items abholen
 * /order cancel <id>                                 -> eigenen Auftrag abbrechen (Rest-Pfand zurueck)
 */
public class OrderCommand implements CommandExecutor, TabCompleter {

    private final BigMC plugin;

    public OrderCommand(BigMC plugin) {
        this.plugin = plugin;
    }

    @Override
    public boolean onCommand(CommandSender sender, Command command, String label, String[] args) {
        MessageManager msg = plugin.getMessageManager();

        if (!(sender instanceof Player player)) {
            msg.send(sender, "general.player-only");
            return true;
        }

        if (args.length == 0) {
            msg.send(player, "order.usage");
            return true;
        }

        switch (args[0].toLowerCase()) {
            case "create" -> create(player, args);
            case "list" -> list(player);
            case "fulfill" -> fulfill(player, args);
            case "collect" -> collect(player);
            case "cancel" -> cancel(player, args);
            default -> msg.send(player, "order.usage");
        }
        return true;
    }

    // ----- /order create -----

    private void create(Player player, String[] args) {
        MessageManager msg = plugin.getMessageManager();
        OrderManager om = plugin.getOrderManager();

        if (args.length != 4) {
            msg.send(player, "order.create-usage");
            return;
        }

        // Material pruefen (nur normale Items, keine Bloecke aus dem Creative-Menue o.ae.)
        Material material = Material.matchMaterial(args[1]);
        if (material == null || !material.isItem()) {
            msg.send(player, "order.invalid-material", "%input%", args[1]);
            return;
        }

        // Anzahl pruefen
        int amount;
        try {
            amount = Integer.parseInt(args[2]);
        } catch (NumberFormatException e) {
            msg.send(player, "general.invalid-number");
            return;
        }
        if (amount < 1 || amount > om.maxAmount()) {
            msg.send(player, "order.amount-out-of-range", "%max%", String.valueOf(om.maxAmount()));
            return;
        }

        // Stueckpreis pruefen
        double price;
        try {
            price = Double.parseDouble(args[3].replace(',', '.'));
        } catch (NumberFormatException e) {
            msg.send(player, "general.invalid-number");
            return;
        }
        if (!Double.isFinite(price) || price < om.minPricePerItem()) {
            msg.send(player, "order.price-too-low",
                    "%min%", plugin.getEconomyManager().formatMoney(om.minPricePerItem()));
            return;
        }

        // Limit pruefen
        if (om.countByCreator(player.getUniqueId()) >= om.maxOrders()) {
            msg.send(player, "order.too-many-orders", "%max%", String.valueOf(om.maxOrders()));
            return;
        }

        // Pfand abbuchen - garantiert, dass jeder Lieferant bezahlt werden kann
        double escrow = Math.round(amount * price * 100.0) / 100.0;
        if (!plugin.getEconomyManager().withdraw(player.getUniqueId(), escrow)) {
            msg.send(player, "economy.not-enough-money");
            return;
        }

        if (!om.createOrder(player.getUniqueId(), player.getName(), material, amount, price)) {
            // DB-Fehler -> Pfand zurueck
            plugin.getEconomyManager().deposit(player.getUniqueId(), escrow);
            msg.send(player, "order.create-failed");
            return;
        }

        msg.send(player, "order.created",
                "%amount%", String.valueOf(amount),
                "%item%", ShopGUI.prettyName(material),
                "%price%", plugin.getEconomyManager().formatMoney(price),
                "%total%", plugin.getEconomyManager().formatMoney(escrow));
    }

    // ----- /order list -----

    private void list(Player player) {
        MessageManager msg = plugin.getMessageManager();
        List<OrderManager.Order> orders = plugin.getOrderManager().getOpenOrders();

        if (orders.isEmpty()) {
            msg.send(player, "order.list-empty");
            return;
        }

        player.sendMessage(msg.getRaw("order.list-header"));
        for (OrderManager.Order order : orders) {
            player.sendMessage(msg.getRaw("order.list-entry")
                    .replace("%id%", String.valueOf(order.id()))
                    .replace("%item%", ShopGUI.prettyName(order.material()))
                    .replace("%remaining%", String.valueOf(order.amountRemaining()))
                    .replace("%total%", String.valueOf(order.amountTotal()))
                    .replace("%price%", plugin.getEconomyManager().formatMoney(order.pricePerItem()))
                    .replace("%creator%", order.creatorName()));
        }
        player.sendMessage(msg.getRaw("order.list-footer"));
    }

    // ----- /order fulfill -----

    private void fulfill(Player player, String[] args) {
        MessageManager msg = plugin.getMessageManager();
        OrderManager om = plugin.getOrderManager();

        if (args.length < 2 || args.length > 3) {
            msg.send(player, "order.fulfill-usage");
            return;
        }

        int id;
        try {
            id = Integer.parseInt(args[1]);
        } catch (NumberFormatException e) {
            msg.send(player, "general.invalid-number");
            return;
        }

        OrderManager.Order order = om.getOrder(id).orElse(null);
        if (order == null) {
            msg.send(player, "order.not-found");
            return;
        }
        if (order.creatorUuid().equals(player.getUniqueId())) {
            msg.send(player, "order.cannot-fulfill-own");
            return;
        }

        // Gewuenschte Liefermenge (Standard: so viel wie moeglich)
        int wanted = order.amountRemaining();
        if (args.length == 3) {
            try {
                wanted = Integer.parseInt(args[2]);
            } catch (NumberFormatException e) {
                msg.send(player, "general.invalid-number");
                return;
            }
            if (wanted < 1) {
                msg.send(player, "general.invalid-number");
                return;
            }
            wanted = Math.min(wanted, order.amountRemaining());
        }

        // Zaehlen, wie viele passende (einfache) Items der Spieler dabei hat
        int available = countPlainItems(player, order.material());
        if (available <= 0) {
            msg.send(player, "order.no-items", "%item%", ShopGUI.prettyName(order.material()));
            return;
        }
        int deliver = Math.min(wanted, available);

        // Restmenge atomar reduzieren - schuetzt davor, dass zwei Lieferanten
        // gleichzeitig mehr liefern, als der Auftrag noch braucht
        if (!om.reduceRemaining(order.id(), deliver)) {
            msg.send(player, "order.not-found");
            return;
        }

        // Items einziehen (erst nach erfolgreicher Reservierung)
        int removed = ShopGUI.removeItems(player, order.material(), deliver);
        if (removed < deliver) {
            // Sollte nicht passieren (vorher gezaehlt) - Differenz zurueckbuchen
            int diff = deliver - removed;
            try (var ps = plugin.getDatabase().getConnection().prepareStatement(
                    "UPDATE orders SET amount_remaining = amount_remaining + ? WHERE id = ?;")) {
                ps.setInt(1, diff);
                ps.setInt(2, order.id());
                ps.executeUpdate();
            } catch (Exception e) {
                plugin.getLogger().severe("Auftrags-Korrektur fehlgeschlagen: " + e.getMessage());
            }
            deliver = removed;
            if (deliver <= 0) {
                msg.send(player, "order.no-items", "%item%", ShopGUI.prettyName(order.material()));
                return;
            }
        }

        // Lieferant sofort aus dem Pfand bezahlen
        double payout = Math.round(deliver * order.pricePerItem() * 100.0) / 100.0;
        plugin.getEconomyManager().deposit(player.getUniqueId(), payout);

        // Items ins Lieferfach des Auftraggebers
        om.addDelivery(order.creatorUuid(), order.material(), deliver);

        msg.send(player, "order.fulfilled",
                "%amount%", String.valueOf(deliver),
                "%item%", ShopGUI.prettyName(order.material()),
                "%price%", plugin.getEconomyManager().formatMoney(payout));

        // Auftraggeber benachrichtigen, falls online
        Player creator = Bukkit.getPlayer(order.creatorUuid());
        if (creator != null) {
            msg.send(creator, "order.fulfilled-notify",
                    "%amount%", String.valueOf(deliver),
                    "%item%", ShopGUI.prettyName(order.material()),
                    "%player%", player.getName());
        }

        // Auftrag komplett? -> aufraeumen
        if (order.amountRemaining() - deliver <= 0) {
            om.deleteOrder(order.id());
            if (creator != null) {
                msg.send(creator, "order.completed-notify",
                        "%item%", ShopGUI.prettyName(order.material()));
            }
        }
    }

    /** Zaehlt einfache Items (ohne Meta) eines Materials im Inventar. */
    private int countPlainItems(Player player, Material material) {
        int count = 0;
        for (ItemStack stack : player.getInventory().getStorageContents()) {
            if (stack == null || stack.getType() != material || stack.hasItemMeta()) continue;
            count += stack.getAmount();
        }
        return count;
    }

    // ----- /order collect -----

    private void collect(Player player) {
        MessageManager msg = plugin.getMessageManager();
        OrderManager om = plugin.getOrderManager();

        List<OrderManager.Delivery> deliveries = om.getDeliveries(player.getUniqueId());
        if (deliveries.isEmpty()) {
            msg.send(player, "order.collect-empty");
            return;
        }

        int collected = 0;
        boolean full = false;
        for (OrderManager.Delivery delivery : deliveries) {
            int remaining = delivery.amount();
            int maxStack = delivery.material().getMaxStackSize();

            // Stapelweise ins Inventar legen, bis alles drin ist oder es voll ist
            while (remaining > 0) {
                int chunk = Math.min(remaining, maxStack);
                Map<Integer, ItemStack> leftover = player.getInventory()
                        .addItem(new ItemStack(delivery.material(), chunk));
                int notAdded = leftover.values().stream().mapToInt(ItemStack::getAmount).sum();
                int added = chunk - notAdded;
                remaining -= added;
                collected += added;
                if (notAdded > 0) {
                    full = true;
                    break;
                }
            }

            if (remaining <= 0) {
                om.deleteDelivery(delivery.id());
            } else {
                om.updateDeliveryAmount(delivery.id(), remaining);
                break; // Inventar voll - Rest bleibt im Lieferfach
            }
        }

        if (collected > 0) {
            msg.send(player, "order.collected", "%count%", String.valueOf(collected));
        }
        if (full) {
            msg.send(player, "order.collect-inventory-full");
        }
    }

    // ----- /order cancel -----

    private void cancel(Player player, String[] args) {
        MessageManager msg = plugin.getMessageManager();
        OrderManager om = plugin.getOrderManager();

        if (args.length != 2) {
            msg.send(player, "order.cancel-usage");
            return;
        }

        int id;
        try {
            id = Integer.parseInt(args[1]);
        } catch (NumberFormatException e) {
            msg.send(player, "general.invalid-number");
            return;
        }

        OrderManager.Order order = om.getOrder(id).orElse(null);
        if (order == null) {
            msg.send(player, "order.not-found");
            return;
        }
        if (!order.creatorUuid().equals(player.getUniqueId())) {
            msg.send(player, "order.not-yours");
            return;
        }

        // Restmenge atomar auf 0 setzen (= beanspruchen), dann Pfand erstatten
        if (!om.reduceRemaining(order.id(), order.amountRemaining())) {
            msg.send(player, "order.not-found");
            return;
        }
        om.deleteOrder(order.id());

        double refund = Math.round(order.amountRemaining() * order.pricePerItem() * 100.0) / 100.0;
        plugin.getEconomyManager().deposit(player.getUniqueId(), refund);

        msg.send(player, "order.cancelled",
                "%refund%", plugin.getEconomyManager().formatMoney(refund));
    }

    // ----- Tab-Completion -----

    @Override
    public List<String> onTabComplete(CommandSender sender, Command command, String alias, String[] args) {
        List<String> result = new ArrayList<>();
        if (args.length == 1) {
            for (String sub : List.of("create", "list", "fulfill", "collect", "cancel")) {
                if (sub.startsWith(args[0].toLowerCase())) result.add(sub);
            }
        } else if (args.length == 2 && args[0].equalsIgnoreCase("create")) {
            // Material-Vorschlaege (erst ab 2 Buchstaben, sonst zu viele)
            String input = args[1].toUpperCase();
            if (input.length() >= 2) {
                for (Material mat : Material.values()) {
                    if (mat.isItem() && mat.name().startsWith(input)) {
                        result.add(mat.name());
                        if (result.size() >= 50) break;
                    }
                }
            }
        }
        return result;
    }
}
