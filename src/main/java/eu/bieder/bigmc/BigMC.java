package eu.bieder.bigmc;

import eu.bieder.bigmc.auction.AuctionHouseGUI;
import eu.bieder.bigmc.auction.AuctionManager;
import eu.bieder.bigmc.afk.AfkListener;
import eu.bieder.bigmc.afk.AfkManager;
import eu.bieder.bigmc.afk.command.AfkCommand;
import eu.bieder.bigmc.auction.command.AhCommand;
import eu.bieder.bigmc.command.BigMcCommand;
import eu.bieder.bigmc.config.ConfigManager;
import eu.bieder.bigmc.config.MessageManager;
import eu.bieder.bigmc.database.Database;
import eu.bieder.bigmc.database.DatabaseExecutor;
import eu.bieder.bigmc.quest.QuestGUI;
import eu.bieder.bigmc.quest.QuestListener;
import eu.bieder.bigmc.quest.QuestManager;
import eu.bieder.bigmc.quest.command.QuestCommand;
import eu.bieder.bigmc.duel.DuelKit;
import eu.bieder.bigmc.duel.DuelListener;
import eu.bieder.bigmc.duel.DuelManager;
import eu.bieder.bigmc.duel.command.DuelCommand;
import eu.bieder.bigmc.drill.DrillListener;
import eu.bieder.bigmc.drill.DrillManager;
import eu.bieder.bigmc.drill.command.DrillCommand;
import eu.bieder.bigmc.event.EventManager;
import eu.bieder.bigmc.event.command.EventCommand;
import eu.bieder.bigmc.economy.EconomyManager;
import eu.bieder.bigmc.economy.PlayerJoinListener;
import eu.bieder.bigmc.economy.command.BaltopCommand;
import eu.bieder.bigmc.fly.FlyListener;
import eu.bieder.bigmc.fly.FlyManager;
import eu.bieder.bigmc.fly.command.FlyCommand;
import eu.bieder.bigmc.order.OrderManager;
import eu.bieder.bigmc.order.command.OrderCommand;
import eu.bieder.bigmc.rank.RankListener;
import eu.bieder.bigmc.rank.RankManager;
import eu.bieder.bigmc.rank.command.RankCommand;
import eu.bieder.bigmc.rank.command.RanksCommand;
import eu.bieder.bigmc.rtp.RtpManager;
import eu.bieder.bigmc.rtp.command.RtpCommand;
import eu.bieder.bigmc.scoreboard.SidebarListener;
import eu.bieder.bigmc.scoreboard.SidebarManager;
import eu.bieder.bigmc.scoreboard.command.BoardCommand;
import eu.bieder.bigmc.shards.ShardListener;
import eu.bieder.bigmc.shards.ShardsManager;
import eu.bieder.bigmc.shards.command.ShardsCommand;
import eu.bieder.bigmc.economy.command.MoneyCommand;
import eu.bieder.bigmc.economy.command.PayCommand;
import eu.bieder.bigmc.shop.ShopGUI;
import eu.bieder.bigmc.spawn.SpawnBuildGUI;
import eu.bieder.bigmc.spawn.SpawnListener;
import eu.bieder.bigmc.spawn.SpawnManager;
import eu.bieder.bigmc.spawn.command.SpawnBuildCommand;
import eu.bieder.bigmc.spawn.command.SpawnCommand;
import eu.bieder.bigmc.spawner.SpawnerCollectGUI;
import eu.bieder.bigmc.spawner.SpawnerListener;
import eu.bieder.bigmc.spawner.SpawnerManager;
import eu.bieder.bigmc.spawner.SpawnerShopGUI;
import eu.bieder.bigmc.spawner.command.SpawnerShopCommand;
import eu.bieder.bigmc.stats.StatsListener;
import eu.bieder.bigmc.stats.StatsManager;
import eu.bieder.bigmc.stats.command.StatsCommand;
import eu.bieder.bigmc.stats.command.TopCommand;
import eu.bieder.bigmc.tpa.TpaListener;
import eu.bieder.bigmc.tpa.TpaManager;
import eu.bieder.bigmc.tpa.command.TpaCommand;
import eu.bieder.bigmc.vote.VoteJoinListener;
import eu.bieder.bigmc.vote.VoteRewardManager;
import eu.bieder.bigmc.vote.VotifierHook;
import eu.bieder.bigmc.vote.command.VoteCommand;
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
    private DatabaseExecutor databaseExecutor;
    private EconomyManager economyManager;
    private ShopManager shopManager;
    private ShopGUI shopGUI;
    private AuctionManager auctionManager;
    private AuctionHouseGUI auctionHouseGUI;
    private OrderManager orderManager;
    private StatsManager statsManager;
    private DuelManager duelManager;
    private DuelKit duelKit;
    private RankManager rankManager;
    private FlyManager flyManager;
    private VoteRewardManager voteRewardManager;
    private EventManager eventManager;
    private SpawnerManager spawnerManager;
    private SpawnerCollectGUI spawnerCollectGUI;
    private SpawnerShopGUI spawnerShopGUI;
    private DrillManager drillManager;
    private SidebarManager sidebarManager;
    private ShardsManager shardsManager;
    private AfkManager afkManager;
    private SpawnManager spawnManager;
    private SpawnBuildGUI spawnBuildGUI;
    private RtpManager rtpManager;
    private TpaManager tpaManager;
    private QuestManager questManager;
    private QuestGUI questGUI;

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

        // 3b. Asynchroner DB-Executor (eigene Verbindung) fuer neue Systeme
        this.databaseExecutor = new DatabaseExecutor(this);
        try {
            this.databaseExecutor.start();
        } catch (Exception e) {
            getLogger().severe("Async-DB-Executor konnte nicht gestartet werden: " + e.getMessage());
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
        this.rankManager = new RankManager(this);         // Phase 7: Raenge
        this.flyManager = new FlyManager(this);           // Phase 8: Fliegen
        this.voteRewardManager = new VoteRewardManager(this); // Phase 9: Votes
        this.eventManager = new EventManager(this);           // Phase 10: Events
        this.spawnerManager = new SpawnerManager(this);       // Custom-Spawner
        this.spawnerCollectGUI = new SpawnerCollectGUI(this);
        this.spawnerShopGUI = new SpawnerShopGUI(this);
        this.drillManager = new DrillManager(this);           // Drill-Spitzhacke
        this.shardsManager = new ShardsManager(this);         // Shards (2. Waehrung)
        this.afkManager = new AfkManager(this);               // AFK-Zone
        this.spawnManager = new SpawnManager(this);           // Spawn + Schutzzone
        this.spawnBuildGUI = new SpawnBuildGUI(this);         // Spawn-Design-Auswahl
        this.rtpManager = new RtpManager(this);               // Random-Teleport
        this.tpaManager = new TpaManager(this);               // TPA-Anfragen
        this.sidebarManager = new SidebarManager(this);       // Sidebar-Scoreboard
        this.questManager = new QuestManager(this);           // Daily/Weekly Quests
        this.questGUI = new QuestGUI(this);

        // 5. Listener registrieren
        getServer().getPluginManager().registerEvents(new PlayerJoinListener(this), this);
        getServer().getPluginManager().registerEvents(shopGUI, this);
        getServer().getPluginManager().registerEvents(auctionHouseGUI, this);
        getServer().getPluginManager().registerEvents(new StatsListener(this), this);
        getServer().getPluginManager().registerEvents(new DuelListener(this), this);
        getServer().getPluginManager().registerEvents(new RankListener(this), this);
        getServer().getPluginManager().registerEvents(new FlyListener(this), this);
        getServer().getPluginManager().registerEvents(new VoteJoinListener(this), this);
        getServer().getPluginManager().registerEvents(new SpawnerListener(this), this);
        getServer().getPluginManager().registerEvents(spawnerCollectGUI, this);
        getServer().getPluginManager().registerEvents(spawnerShopGUI, this);
        getServer().getPluginManager().registerEvents(new DrillListener(this), this);
        getServer().getPluginManager().registerEvents(new SidebarListener(this), this);
        getServer().getPluginManager().registerEvents(new ShardListener(this), this);
        getServer().getPluginManager().registerEvents(new AfkListener(this), this);
        getServer().getPluginManager().registerEvents(new SpawnListener(this), this);
        getServer().getPluginManager().registerEvents(spawnBuildGUI, this);
        getServer().getPluginManager().registerEvents(new TpaListener(this), this);
        getServer().getPluginManager().registerEvents(new QuestListener(this), this);
        getServer().getPluginManager().registerEvents(questGUI, this);

        // Votifier per Reflection anbinden (kein Compile-Bedarf, Soft-Depend).
        if (VotifierHook.register(this)) {
            getLogger().info("NuVotifier erkannt - Vote-Belohnungen sind aktiv.");
        } else {
            getLogger().info("Kein Votifier gefunden - Vote-Belohnungen laufen nur ueber /vote test.");
        }

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
        RankCommand rankCommand = new RankCommand(this);
        getCommand("rank").setExecutor(rankCommand);
        getCommand("rank").setTabCompleter(rankCommand);
        getCommand("ranks").setExecutor(new RanksCommand(this));
        getCommand("fly").setExecutor(new FlyCommand(this));
        VoteCommand voteCommand = new VoteCommand(this);
        getCommand("vote").setExecutor(voteCommand);
        getCommand("vote").setTabCompleter(voteCommand);
        EventCommand eventCommand = new EventCommand(this);
        getCommand("event").setExecutor(eventCommand);
        getCommand("event").setTabCompleter(eventCommand);
        getCommand("spawnershop").setExecutor(new SpawnerShopCommand(this));
        DrillCommand drillCommand = new DrillCommand(this);
        getCommand("drill").setExecutor(drillCommand);
        getCommand("drill").setTabCompleter(drillCommand);
        BigMcCommand bigMcCommand = new BigMcCommand(this);
        getCommand("bigmc").setExecutor(bigMcCommand);
        getCommand("bigmc").setTabCompleter(bigMcCommand);
        getCommand("board").setExecutor(new BoardCommand(this));
        ShardsCommand shardsCommand = new ShardsCommand(this);
        getCommand("shards").setExecutor(shardsCommand);
        getCommand("shards").setTabCompleter(shardsCommand);
        AfkCommand afkCommand = new AfkCommand(this);
        getCommand("afk").setExecutor(afkCommand);
        getCommand("afk").setTabCompleter(afkCommand);
        SpawnCommand spawnCommand = new SpawnCommand(this);
        getCommand("spawn").setExecutor(spawnCommand);
        getCommand("setspawn").setExecutor(spawnCommand);
        getCommand("spawnbuild").setExecutor(new SpawnBuildCommand(this));
        getCommand("rtp").setExecutor(new RtpCommand(this));
        TpaCommand tpaCommand = new TpaCommand(this);
        getCommand("tpa").setExecutor(tpaCommand);
        getCommand("tpa").setTabCompleter(tpaCommand);
        getCommand("tpaccept").setExecutor(tpaCommand);
        getCommand("tpadeny").setExecutor(tpaCommand);
        getCommand("quests").setExecutor(new QuestCommand(this));

        // Bereits online befindliche Spieler laden (z.B. nach /reload)
        getServer().getOnlinePlayers().forEach(p -> questManager.loadPlayer(p.getUniqueId()));

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

        // Custom-Spawner produzieren regelmaessig Items in ihren Speicher
        long spawnerTicks = 20L * getConfig().getLong("spawners.production-check-seconds", 10);
        getServer().getScheduler().runTaskTimer(this,
                () -> spawnerManager.produceAll(), spawnerTicks, spawnerTicks);

        // Sidebar-Scoreboard regelmaessig aktualisieren
        sidebarManager.start();

        // AFK-Zone: regelmaessige Shards-Belohnung fuer AFK-Spieler
        afkManager.start();

        // Quests: alle 60s speichern + Tages-/Wochenwechsel pruefen
        getServer().getScheduler().runTaskTimer(this, () -> questManager.tick(), 20L * 60, 20L * 60);

        getLogger().info("BigMC v" + getDescription().getVersion() + " wurde aktiviert.");
    }

    @Override
    public void onDisable() {
        // Laufendes Event ohne Belohnung abbrechen
        if (this.eventManager != null) {
            this.eventManager.cancel();
        }
        // Flug-Tasks beenden
        if (this.flyManager != null) {
            this.flyManager.shutdown();
        }
        // Laufende Duelle beenden und Inventare wiederherstellen
        if (this.duelManager != null) {
            this.duelManager.endAllDuels();
        }
        // Offene Spielzeit-Sessions speichern
        if (this.statsManager != null) {
            this.statsManager.flushAllPlaytime();
        }
        // Quest-Fortschritt speichern
        if (this.questManager != null) {
            this.questManager.shutdown();
        }
        // Async-DB-Executor beenden (verarbeitet ausstehende Schreibvorgaenge)
        if (this.databaseExecutor != null) {
            this.databaseExecutor.shutdown();
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

    public DatabaseExecutor getDatabaseExecutor() {
        return databaseExecutor;
    }

    public QuestManager getQuestManager() {
        return questManager;
    }

    public QuestGUI getQuestGUI() {
        return questGUI;
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

    public RankManager getRankManager() {
        return rankManager;
    }

    public FlyManager getFlyManager() {
        return flyManager;
    }

    public VoteRewardManager getVoteRewardManager() {
        return voteRewardManager;
    }

    public EventManager getEventManager() {
        return eventManager;
    }

    public SpawnerManager getSpawnerManager() {
        return spawnerManager;
    }

    public SpawnerCollectGUI getSpawnerCollectGUI() {
        return spawnerCollectGUI;
    }

    public SpawnerShopGUI getSpawnerShopGUI() {
        return spawnerShopGUI;
    }

    public DrillManager getDrillManager() {
        return drillManager;
    }

    public SidebarManager getSidebarManager() {
        return sidebarManager;
    }

    public ShardsManager getShardsManager() {
        return shardsManager;
    }

    public AfkManager getAfkManager() {
        return afkManager;
    }

    public SpawnManager getSpawnManager() {
        return spawnManager;
    }

    public SpawnBuildGUI getSpawnBuildGUI() {
        return spawnBuildGUI;
    }

    public RtpManager getRtpManager() {
        return rtpManager;
    }

    public TpaManager getTpaManager() {
        return tpaManager;
    }
}
