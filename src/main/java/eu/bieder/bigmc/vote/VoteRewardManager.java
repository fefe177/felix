package eu.bieder.bigmc.vote;

import eu.bieder.bigmc.BigMC;
import eu.bieder.bigmc.config.MessageManager;
import org.bukkit.Bukkit;
import org.bukkit.Material;
import org.bukkit.configuration.ConfigurationSection;
import org.bukkit.entity.Player;
import org.bukkit.inventory.ItemStack;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.Map;

/**
 * Verwaltet Vote-Belohnungen.
 *
 * Beim Eintreffen eines Votes (ueber NuVotifier) wird der Spieler belohnt.
 * Ist er online, gibt es die Belohnung sofort. Ist er offline, wird der Vote
 * als "ausstehend" in der Datenbank gemerkt und beim naechsten Join (oder per
 * /vote claim) ausgezahlt - so geht keine Belohnung verloren.
 *
 * Die Belohnung selbst (Geld, Items, Befehle) steht komplett in der config.yml.
 */
public class VoteRewardManager {

    private final BigMC plugin;

    public VoteRewardManager(BigMC plugin) {
        this.plugin = plugin;
        createTable();
    }

    private void createTable() {
        try (Statement st = connection().createStatement()) {
            st.execute("""
                CREATE TABLE IF NOT EXISTS votes (
                    name           TEXT PRIMARY KEY,
                    votes_total    INTEGER NOT NULL DEFAULT 0,
                    votes_pending  INTEGER NOT NULL DEFAULT 0
                );
            """);
        } catch (SQLException e) {
            plugin.getLogger().severe("Vote-Tabelle konnte nicht erstellt werden: " + e.getMessage());
        }
    }

    /**
     * Verarbeitet einen eingegangenen Vote fuer einen Spielernamen.
     * Wird vom Votifier-Listener (und von /vote test) aufgerufen.
     */
    public void handleVote(String playerName) {
        // Gesamtzahl hochzaehlen (Statistik)
        incrementTotal(playerName);

        Player online = Bukkit.getPlayerExact(playerName);
        if (online != null) {
            giveReward(online);
        } else {
            // Offline -> als ausstehend merken
            incrementPending(playerName);
            plugin.getLogger().info("Vote von " + playerName + " gespeichert (Spieler offline).");
        }

        if (plugin.getConfigManager().getConfig().getBoolean("vote.broadcast", true)) {
            Bukkit.broadcastMessage(plugin.getMessageManager()
                    .get("vote.broadcast", "%player%", playerName));
        }
    }

    /**
     * Liefert alle ausstehenden Votes eines Spielers aus (beim Join oder /vote claim).
     * @return Anzahl der ausgezahlten Belohnungen
     */
    public int claimPending(Player player) {
        int pending = getPending(player.getName());
        if (pending <= 0) return 0;

        for (int i = 0; i < pending; i++) {
            giveReward(player);
        }
        setPending(player.getName(), 0);
        return pending;
    }

    /**
     * Zahlt EINE Vote-Belohnung an einen Online-Spieler aus (Geld, Items, Befehle).
     */
    public void giveReward(Player player) {
        MessageManager msg = plugin.getMessageManager();
        ConfigurationSection vote = plugin.getConfigManager().getConfig()
                .getConfigurationSection("vote");
        if (vote == null) return;

        // 1. Geld
        double money = vote.getDouble("money", 0);
        if (money > 0) {
            plugin.getEconomyManager().deposit(player.getUniqueId(), money);
        }

        // 2. Items (was nicht ins Inventar passt, wird fallen gelassen)
        ConfigurationSection items = vote.getConfigurationSection("items");
        if (items != null) {
            for (String matName : items.getKeys(false)) {
                Material mat = Material.matchMaterial(matName);
                if (mat == null) {
                    plugin.getLogger().warning("Vote-Belohnung: unbekanntes Material '" + matName + "'.");
                    continue;
                }
                int amount = items.getInt(matName, 1);
                Map<Integer, ItemStack> leftover =
                        player.getInventory().addItem(new ItemStack(mat, amount));
                leftover.values().forEach(rest ->
                        player.getWorld().dropItemNaturally(player.getLocation(), rest));
            }
        }

        // 3. Konsolen-Befehle (z.B. Crate-Key geben). %player% wird ersetzt.
        for (String cmd : vote.getStringList("commands")) {
            Bukkit.dispatchCommand(Bukkit.getConsoleSender(),
                    cmd.replace("%player%", player.getName()));
        }

        // 4. Nachricht an den Spieler
        msg.send(player, "vote.reward-received",
                "%money%", plugin.getEconomyManager().formatMoney(money));
    }

    // ----- Zaehler in der DB -----

    private void incrementTotal(String name) {
        upsert(name);
        update("UPDATE votes SET votes_total = votes_total + 1 WHERE name = ?;", name);
    }

    private void incrementPending(String name) {
        upsert(name);
        update("UPDATE votes SET votes_pending = votes_pending + 1 WHERE name = ?;", name);
    }

    private void setPending(String name, int value) {
        try (PreparedStatement ps = connection().prepareStatement(
                "UPDATE votes SET votes_pending = ? WHERE name = ?;")) {
            ps.setInt(1, value);
            ps.setString(2, name);
            ps.executeUpdate();
        } catch (SQLException e) {
            plugin.getLogger().severe("Vote-Status konnte nicht gesetzt werden: " + e.getMessage());
        }
    }

    public int getPending(String name) {
        return queryInt("SELECT votes_pending FROM votes WHERE name = ?;", name);
    }

    public int getTotal(String name) {
        return queryInt("SELECT votes_total FROM votes WHERE name = ?;", name);
    }

    /** Legt eine Zeile fuer den Namen an, falls noch nicht vorhanden. */
    private void upsert(String name) {
        try (PreparedStatement ps = connection().prepareStatement(
                "INSERT INTO votes (name) VALUES (?) ON CONFLICT(name) DO NOTHING;")) {
            ps.setString(1, name);
            ps.executeUpdate();
        } catch (SQLException e) {
            plugin.getLogger().severe("Vote-Datensatz konnte nicht angelegt werden: " + e.getMessage());
        }
    }

    private void update(String sql, String name) {
        try (PreparedStatement ps = connection().prepareStatement(sql)) {
            ps.setString(1, name);
            ps.executeUpdate();
        } catch (SQLException e) {
            plugin.getLogger().severe("Vote-Update fehlgeschlagen: " + e.getMessage());
        }
    }

    private int queryInt(String sql, String name) {
        try (PreparedStatement ps = connection().prepareStatement(sql)) {
            ps.setString(1, name);
            try (ResultSet rs = ps.executeQuery()) {
                if (rs.next()) return rs.getInt(1);
            }
        } catch (SQLException e) {
            plugin.getLogger().severe("Vote-Abfrage fehlgeschlagen: " + e.getMessage());
        }
        return 0;
    }

    private Connection connection() {
        return plugin.getDatabase().getConnection();
    }
}
