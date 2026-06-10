package eu.bieder.bigmc;

import eu.bieder.bigmc.auction.AuctionHouseGUI;
import eu.bieder.bigmc.auction.AuctionManager;
import eu.bieder.bigmc.auction.command.AhCommand;
import eu.bieder.bigmc.config.ConfigManager;
import eu.bieder.bigmc.config.MessageManager;
import eu.bieder.bigmc.database.Database;
import eu.bieder.bigmc.duel.DuelKit;
import eu.bieder.bigmc.duel.DuelListener;
import eu.bieder.bigmc.duel.DuelManager;
import eu.bieder.bigmc.duel.command.DuelCommand;
import eu.bieder.bigmc.economy.EconomyManager;
import eu.bieder.bigmc.economy.PlayerJoinListener;
import eu.bieder.bigmc.economy.command.BaltopCommand;
import eu.bieder.bigmc.order.OrderManager;
import eu.bieder.bigmc.order.command.OrderCommand;
import eu.bieder.bigmc.economy.command.MoneyCommand;
import eu.bieder.bigmc.economy.command.PayCommand;
import eu.bieder.bigmc.shop.ShopGUI;
import eu.bieder.bigmc.stats.StatsListener;
import eu.bieder.bigmc.stats.StatsManager;
import eu.bieder.bigmc.stats.command.StatsCommand;
import eu.bieder.bigmc.stats.command.TopCommand;
import eu.bieder.bigmc.shop.ShopManager;
import eu.bieder.bigmc.shop.command.SellCommand;
import eu.bieder.bigmc.shop.command.ShopCommand;
import org.bukkit.plugin.java.JavaPlugin;

/**
 * Hauptklasse des BigMC-Plugins.
 *
 * Dient als zentraler "Service-Locator": jeder Manager wird hier einmal
 * erzeugt und ueber Getter an die uebrigen Features weitergereicht.
 * In Phase 0 sind das nur Config, Messages und die SQLite-Datenbank.
 */
public final class BigMC extends JavaPlugin {

    // Statische Referenz auf die laufende Plugin-Instanz (praktisch fuer Zugriffe)
    private static BigMC instance;

    // Die zentralen Manager des Plugins
    private ConfigManager configManager;
    private MessageManager messageManager;
    private Database database;
    private EconomyManager economyManager;
    private ShopManager shopManager;
    private ShopGUI shopGUI;
    private AuctionManager auctionManager;
    private AuctionHouseGUI auctionHouseGUI;
    private OrderManager orderManager;
    private StatsManager statsManager;
    private DuelManager duelManager;
    private DuelKit duelKit;

    @Override
    public void onEnable() {
        instance = this;

        // 1. Standard-Konfigurationsdateien anlegen, falls noch nicht vorhanden
        saveDefaultConfig();                 // config.yml
        ConfigManager.saveDefaultIfMissing(this, "messages.yml");

        // 2. Manager initialisieren
        this.configManager = new ConfigManager(this);
        this.messageManager = new MessageManager(this);

        // 3. Datenbank verbinden (erstellt die Datei bigmc.db im Plugin-Ordner)
        this.database = new Database(this);
        try {
            this.database.connect();
            getLogger().info("SQLite-Datenbank erfolgreich verbunden.");
        } catch (Exception e) {
            // Bei DB-Fehler das Plugin sauber deaktivieren, statt halb-funktional zu laufen
            getLogger().severe("Konnte die Datenbank nicht initialisieren: " + e.getMessage());
            getServer().getPluginManager().disablePlugin(this);
            return;
        }

        // 4. Feature-Manager initialisieren
        this.economyManager = new EconomyManager(this);   // Phase 1: Wirtschaft
        this.shopManager = new ShopManager(this);         // Phase 2: Shops
        this.shopGUI = new ShopGUI(this);
        this.auctionManager = new AuctionManager(this);   // Phase 3: Auktionshaus
        this.auctionHouseGUI = new AuctionHouseGUI(this);
        this.orderManager = new OrderManager(this);       // Phase 4: Auftraege
        this.statsManager = new StatsManager(this);       // Phase 5: Statistiken
        this.duelKit = new DuelKit(this);                 // Phase 6: Duelle
        this.duelManager = new DuelManager(this);

        // 5. Listener registrieren
        getServer().getPluginManager().registerEvents(new PlayerJoinListener(this), this);
        getServer().getPluginManager().registerEvents(shopGUI, this);
        getServer().getPluginManager().registerEvents(auctionHouseGUI, this);
        getServer().getPluginManager().registerEvents(new StatsListener(this), this);
        getServer().getPluginManager().registerEvents(new DuelListener(this), this);

        // 6. Commands registrieren
        MoneyCommand moneyCommand = new MoneyCommand(this);
        getCommand("money").setExecutor(moneyCommand);
        getCommand("money").setTabCompleter(moneyCommand);
        PayCommand payCommand = new PayCommand(this);
        getCommand("pay").setExecutor(payCommand);
        getCommand("pay").setTabCompleter(payCommand);
        getCommand("baltop").setExecutor(new BaltopCommand(this));
        getCommand("shop").setExecutor(new ShopCommand(this));
        SellCommand sellCommand = new SellCommand(this);
        getCommand("sell").setExecutor(sellCommand);
        getCommand("sell").setTabCompleter(sellCommand);
        AhCommand ahCommand = new AhCommand(this);
        getCommand("ah").setExecutor(ahCommand);
        getCommand("ah").setTabCompleter(ahCommand);
        OrderCommand orderCommand = new OrderCommand(this);
        getCommand("order").setExecutor(orderCommand);
        getCommand("order").setTabCompleter(orderCommand);
        StatsCommand statsCommand = new StatsCommand(this);
        getCommand("stats").setExecutor(statsCommand);
        getCommand("stats").setTabCompleter(statsCommand);
        TopCommand topCommand = new TopCommand(this);
        getCommand("top").setExecutor(topCommand);
        getCommand("top").setTabCompleter(topCommand);
        DuelCommand duelCommand = new DuelCommand(this);
        getCommand("duel").setExecutor(duelCommand);
        getCommand("duel").setTabCompleter(duelCommand);

        // 7. Wiederkehrende Aufgaben: abgelaufene Auktionen ins Abholfach verschieben
        long expiryTicks = 20L * getConfig().getLong("auction.expiry-check-seconds", 60);
        getServer().getScheduler().runTaskTimer(this, () -> {
            int expired = auctionManager.expireListings();
            if (expired > 0) {
                getLogger().info(expired + " Auktion(en) abgelaufen und ins Abholfach verschoben.");
            }
        }, expiryTicks, expiryTicks);

        // Spielzeit jede Minute speichern (Schutz vor Datenverlust bei Crash)
        getServer().getScheduler().runTaskTimer(this,
                () -> statsManager.flushAllPlaytime(), 20L * 60, 20L * 60);

        getLogger().info("BigMC v" + getDescription().getVersion() + " wurde aktiviert.");
    }

    @Override
    public void onDisable() {
        // Laufende Duelle beenden und Inventare wiederherstellen
        if (this.duelManager != null) {
            this.duelManager.endAllDuels();
        }
        // Offene Spielzeit-Sessions speichern
        if (this.statsManager != null) {
            this.statsManager.flushAllPlaytime();
        }
        // Datenbankverbindung sauber schliessen
        if (this.database != null) {
            this.database.disconnect();
        }
        getLogger().info("BigMC wurde deaktiviert.");
    }

    // ----- Getter fuer die Manager -----

    public static BigMC getInstance() {
        return instance;
    }

    public ConfigManager getConfigManager() {
        return configManager;
    }

    public MessageManager getMessageManager() {
        return messageManager;
    }

    public Database getDatabase() {
        return database;
    }

    public EconomyManager getEconomyManager() {
        return economyManager;
    }

    public ShopManager getShopManager() {
        return shopManager;
    }

    public ShopGUI getShopGUI() {
        return shopGUI;
    }

    public AuctionManager getAuctionManager() {
        return auctionManager;
    }

    public AuctionHouseGUI getAuctionHouseGUI() {
        return auctionHouseGUI;
    }

    public OrderManager getOrderManager() {
        return orderManager;
    }

    public StatsManager getStatsManager() {
        return statsManager;
    }

    public DuelManager getDuelManager() {
        return duelManager;
    }

    public DuelKit getDuelKit() {
        return duelKit;
    }
}
