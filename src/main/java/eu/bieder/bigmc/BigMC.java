package eu.bieder.bigmc;

import eu.bieder.bigmc.config.ConfigManager;
import eu.bieder.bigmc.config.MessageManager;
import eu.bieder.bigmc.database.Database;
import eu.bieder.bigmc.economy.EconomyManager;
import eu.bieder.bigmc.economy.PlayerJoinListener;
import eu.bieder.bigmc.economy.command.BaltopCommand;
import eu.bieder.bigmc.economy.command.MoneyCommand;
import eu.bieder.bigmc.economy.command.PayCommand;
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

        // 4. Feature-Manager initialisieren (Phase 1: Wirtschaft)
        this.economyManager = new EconomyManager(this);

        // 5. Listener registrieren
        getServer().getPluginManager().registerEvents(new PlayerJoinListener(this), this);

        // 6. Commands registrieren
        MoneyCommand moneyCommand = new MoneyCommand(this);
        getCommand("money").setExecutor(moneyCommand);
        getCommand("money").setTabCompleter(moneyCommand);
        PayCommand payCommand = new PayCommand(this);
        getCommand("pay").setExecutor(payCommand);
        getCommand("pay").setTabCompleter(payCommand);
        getCommand("baltop").setExecutor(new BaltopCommand(this));

        getLogger().info("BigMC v" + getDescription().getVersion() + " wurde aktiviert.");
    }

    @Override
    public void onDisable() {
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
}
