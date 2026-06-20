package eu.bieder.bigmc.database;

import eu.bieder.bigmc.BigMC;
import org.bukkit.Bukkit;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.concurrent.Executors;
import java.util.concurrent.ThreadFactory;
import java.util.concurrent.ExecutorService;
import java.util.function.Consumer;
import java.util.function.Function;

/**
 * Asynchroner Datenbank-Zugriff fuer die neuen Feature-Systeme.
 *
 * Haelt eine EIGENE SQLite-Verbindung zur selben Datei und fuehrt alle
 * Operationen auf einem dedizierten Hintergrund-Thread aus. Dadurch blockiert
 * kein Datenbankzugriff den Server-Hauptthread. Dank WAL-Modus (in Database
 * aktiviert) koennen Haupt- und Hintergrund-Verbindung gefahrlos parallel
 * auf dieselbe Datei zugreifen.
 *
 * Wichtig: Bukkit-API niemals vom Hintergrund-Thread aufrufen - dafuer gibt
 * es {@link #query(SqlFunction, Consumer)}, das das Ergebnis zurueck auf den
 * Hauptthread bringt.
 */
public class DatabaseExecutor {

    /** SQL-Funktion, die eine Verbindung nutzt und ein Ergebnis liefert. */
    @FunctionalInterface
    public interface SqlFunction<T> {
        T apply(Connection connection) throws SQLException;
    }

    /** SQL-Aktion ohne Rueckgabewert. */
    @FunctionalInterface
    public interface SqlConsumer {
        void accept(Connection connection) throws SQLException;
    }

    private final BigMC plugin;
    private final ExecutorService executor;
    private Connection connection;

    public DatabaseExecutor(BigMC plugin) {
        this.plugin = plugin;
        ThreadFactory factory = r -> {
            Thread t = new Thread(r, "BigMC-DB");
            t.setDaemon(true);
            return t;
        };
        this.executor = Executors.newSingleThreadExecutor(factory);
    }

    /** Oeffnet die Hintergrund-Verbindung (einmalig beim Start). */
    public void start() throws SQLException {
        String url = "jdbc:sqlite:" + plugin.getDatabase().getDatabaseFile().getAbsolutePath();
        this.connection = DriverManager.getConnection(url);
        try (Statement st = connection.createStatement()) {
            st.execute("PRAGMA foreign_keys = ON;");
            st.execute("PRAGMA journal_mode = WAL;");
            st.execute("PRAGMA busy_timeout = 5000;");
        }
    }

    /**
     * Fuehrt eine schreibende Aktion asynchron aus (Fehler werden geloggt).
     */
    public void execute(SqlConsumer action) {
        executor.submit(() -> {
            try {
                action.accept(connection);
            } catch (SQLException e) {
                plugin.getLogger().severe("Async-DB-Schreibvorgang fehlgeschlagen: " + e.getMessage());
            }
        });
    }

    /**
     * Fuehrt eine lesende Abfrage asynchron aus und liefert das Ergebnis
     * anschliessend auf dem Server-Hauptthread an den Callback.
     */
    public <T> void query(SqlFunction<T> read, Consumer<T> mainThreadCallback) {
        executor.submit(() -> {
            T result = null;
            try {
                result = read.apply(connection);
            } catch (SQLException e) {
                plugin.getLogger().severe("Async-DB-Abfrage fehlgeschlagen: " + e.getMessage());
            }
            final T finalResult = result;
            if (plugin.isEnabled()) {
                Bukkit.getScheduler().runTask(plugin, () -> mainThreadCallback.accept(finalResult));
            }
        });
    }

    /**
     * Fuehrt mehrere Schritte (lesen + verarbeiten) atomar auf dem DB-Thread aus
     * und liefert das Resultat auf dem Hauptthread. Praktisch fuer Aktionen,
     * die in einer Transaktion laufen muessen (z.B. Dupe-sicheres Abheben).
     */
    public <T> void transaction(Function<Connection, T> work, Consumer<T> mainThreadCallback) {
        executor.submit(() -> {
            T result = null;
            try {
                connection.setAutoCommit(false);
                result = work.apply(connection);
                connection.commit();
            } catch (Exception e) {
                plugin.getLogger().severe("Async-DB-Transaktion fehlgeschlagen: " + e.getMessage());
                try {
                    connection.rollback();
                } catch (SQLException ignored) {
                }
            } finally {
                try {
                    connection.setAutoCommit(true);
                } catch (SQLException ignored) {
                }
            }
            final T finalResult = result;
            if (plugin.isEnabled()) {
                Bukkit.getScheduler().runTask(plugin, () -> mainThreadCallback.accept(finalResult));
            }
        });
    }

    /** Beendet den Executor und schliesst die Verbindung sauber. */
    public void shutdown() {
        executor.shutdown();
        try {
            if (connection != null && !connection.isClosed()) {
                connection.close();
            }
        } catch (SQLException e) {
            plugin.getLogger().warning("Async-DB-Verbindung konnte nicht geschlossen werden: " + e.getMessage());
        }
    }
}
