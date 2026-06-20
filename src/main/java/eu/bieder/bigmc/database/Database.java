package eu.bieder.bigmc.database;

import eu.bieder.bigmc.BigMC;

import java.io.File;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.SQLException;
import java.sql.Statement;

/**
 * Zentrale SQLite-Anbindung des Plugins.
 *
 * Haelt eine dauerhafte Verbindung zur Datei bigmc.db im Plugin-Ordner.
 * Andere Manager (Economy, Auktionshaus ...) bekommen ueber getConnection()
 * Zugriff und legen ihre eigenen Tabellen an. In Phase 0 wird nur die
 * Verbindung aufgebaut und eine kleine Meta-Tabelle erstellt, damit man
 * sieht, dass die Datenbank funktioniert.
 */
public class Database {

    private final BigMC plugin;
    private Connection connection;
    private File dbFile;

    public Database(BigMC plugin) {
        this.plugin = plugin;
    }

    /**
     * Baut die Verbindung zur SQLite-Datei auf und legt Basistabellen an.
     */
    public void connect() throws SQLException {
        // Plugin-Ordner sicherstellen
        if (!plugin.getDataFolder().exists()) {
            plugin.getDataFolder().mkdirs();
        }

        String fileName = plugin.getConfigManager().getDatabaseFileName();
        File dbFile = new File(plugin.getDataFolder(), fileName);
        this.dbFile = dbFile;

        // Den geshadeten SQLite-Treiber explizit laden
        try {
            Class.forName("org.sqlite.JDBC");
        } catch (ClassNotFoundException e) {
            throw new SQLException("SQLite-Treiber nicht gefunden (org.sqlite.JDBC).", e);
        }

        // Verbindung aufbauen (Datei wird automatisch erstellt, falls nicht vorhanden)
        String url = "jdbc:sqlite:" + dbFile.getAbsolutePath();
        this.connection = DriverManager.getConnection(url);

        // Empfohlene Pragmas fuer bessere Zuverlaessigkeit/Performance
        try (Statement st = connection.createStatement()) {
            st.execute("PRAGMA foreign_keys = ON;");
            st.execute("PRAGMA journal_mode = WAL;");
        }

        // Meta-Tabelle anlegen (dient als Beleg, dass die DB funktioniert)
        createBaseTables();
    }

    /**
     * Legt die grundlegenden Tabellen an. Spaetere Phasen ergaenzen weitere.
     */
    private void createBaseTables() throws SQLException {
        try (Statement st = connection.createStatement()) {
            st.execute("""
                CREATE TABLE IF NOT EXISTS bigmc_meta (
                    schluessel TEXT PRIMARY KEY,
                    wert       TEXT NOT NULL
                );
            """);
            // Schema-Version hinterlegen (fuer spaetere Migrationen)
            st.execute("""
                INSERT INTO bigmc_meta (schluessel, wert)
                VALUES ('schema_version', '0')
                ON CONFLICT(schluessel) DO NOTHING;
            """);
        }
    }

    /**
     * Liefert die aktive Datenbankverbindung. Stellt bei Bedarf wieder her.
     */
    public Connection getConnection() {
        try {
            if (connection == null || connection.isClosed()) {
                connect();
            }
        } catch (SQLException e) {
            plugin.getLogger().severe("Datenbankverbindung konnte nicht wiederhergestellt werden: " + e.getMessage());
        }
        return connection;
    }

    /**
     * Liefert die SQLite-Datei (fuer den asynchronen Zweit-Connection-Executor).
     */
    public File getDatabaseFile() {
        return dbFile;
    }

    /**
     * Schliesst die Verbindung sauber.
     */
    public void disconnect() {
        if (connection != null) {
            try {
                connection.close();
            } catch (SQLException e) {
                plugin.getLogger().warning("Fehler beim Schliessen der Datenbank: " + e.getMessage());
            }
        }
    }
}
