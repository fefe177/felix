package eu.bieder.bigmc.boss;

import eu.bieder.bigmc.BigMC;
import eu.bieder.bigmc.config.MessageManager;
import org.bukkit.Bukkit;
import org.bukkit.Location;
import org.bukkit.Material;
import org.bukkit.World;
import org.bukkit.attribute.Attribute;
import org.bukkit.boss.BarColor;
import org.bukkit.boss.BarStyle;
import org.bukkit.boss.BossBar;
import org.bukkit.configuration.ConfigurationSection;
import org.bukkit.entity.Entity;
import org.bukkit.entity.EntityType;
import org.bukkit.entity.LivingEntity;
import org.bukkit.entity.Player;
import org.bukkit.inventory.ItemStack;
import org.bukkit.scheduler.BukkitTask;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.ThreadLocalRandom;

/**
 * Boss-Event-System: automatische Boss-Spawns, BossBar, serverweite
 * Ankuendigungen, Schadens-Rangliste und Belohnungen fuer die besten Spieler.
 *
 * Es ist immer hoechstens EIN Boss aktiv. Der Schaden wird pro Spieler im
 * Arbeitsspeicher gezaehlt (Event-bezogen, keine Persistenz noetig).
 */
public class BossManager {

    private final BigMC plugin;
    private final Map<String, BossDefinition> bosses = new LinkedHashMap<>();

    // aktiver Boss
    private UUID bossEntityId;
    private BossDefinition activeDef;
    private double maxHealth;
    private long startTime;
    private BossBar bossBar;
    private final Map<UUID, Double> damage = new HashMap<>();
    private BukkitTask tickTask;

    public BossManager(BigMC plugin) {
        this.plugin = plugin;
        loadBosses();
    }

    // ----- Config -----

    public void loadBosses() {
        bosses.clear();
        ConfigurationSection root = plugin.getConfigManager().getConfig().getConfigurationSection("bossevents.bosses");
        if (root == null) {
            plugin.getLogger().warning("Kein 'bossevents.bosses'-Abschnitt in der config.yml gefunden.");
            return;
        }
        for (String id : root.getKeys(false)) {
            ConfigurationSection sec = root.getConfigurationSection(id);
            if (sec == null) continue;
            EntityType type;
            try {
                type = EntityType.valueOf(sec.getString("entity", "RAVAGER").toUpperCase());
            } catch (IllegalArgumentException e) {
                plugin.getLogger().warning("Boss '" + id + "': unbekannter entity-Typ - uebersprungen.");
                continue;
            }
            Location loc = null;
            ConfigurationSection ls = sec.getConfigurationSection("location");
            if (ls != null && ls.getString("world", "").length() > 0) {
                World w = Bukkit.getWorld(ls.getString("world"));
                if (w != null) loc = new Location(w, ls.getDouble("x"), ls.getDouble("y"), ls.getDouble("z"));
            }
            Map<Integer, BossReward> rewards = new HashMap<>();
            ConfigurationSection rs = sec.getConfigurationSection("rewards");
            if (rs != null) {
                for (String pos : rs.getKeys(false)) {
                    ConfigurationSection r = rs.getConfigurationSection(pos);
                    if (r == null) continue;
                    Map<Material, Integer> items = new HashMap<>();
                    ConfigurationSection is = r.getConfigurationSection("items");
                    if (is != null) {
                        for (String m : is.getKeys(false)) {
                            Material mat = Material.matchMaterial(m);
                            if (mat != null) items.put(mat, is.getInt(m));
                        }
                    }
                    try {
                        rewards.put(Integer.parseInt(pos),
                                new BossReward(r.getDouble("money", 0), r.getLong("shards", 0), items));
                    } catch (NumberFormatException ignored) {
                    }
                }
            }
            bosses.put(id, new BossDefinition(id, sec.getString("display", id), type,
                    sec.getDouble("health", 300), loc, rewards));
        }
        plugin.getLogger().info("Bosse geladen: " + bosses.size());
    }

    public List<BossDefinition> getBosses() {
        return List.copyOf(bosses.values());
    }

    public Optional<BossDefinition> getBoss(String id) {
        return Optional.ofNullable(bosses.get(id));
    }

    public boolean isActive() {
        return bossEntityId != null;
    }

    // ----- Auto-Spawn-Task -----

    public void startAutoSpawnTask() {
        if (!plugin.getConfigManager().getConfig().getBoolean("bossevents.auto-spawn", true)) return;
        long ticks = 20L * 60 * Math.max(1, plugin.getConfigManager().getConfig().getInt("bossevents.interval-minutes", 60));
        Bukkit.getScheduler().runTaskTimer(plugin, () -> {
            if (!isActive() && !bosses.isEmpty() && !Bukkit.getOnlinePlayers().isEmpty()) {
                spawnRandom();
            }
        }, ticks, ticks);
    }

    public void spawnRandom() {
        List<BossDefinition> list = new ArrayList<>(bosses.values());
        if (list.isEmpty()) return;
        spawn(list.get(ThreadLocalRandom.current().nextInt(list.size())));
    }

    // ----- Spawn / Ende -----

    public boolean spawn(BossDefinition def) {
        if (isActive()) return false;

        Location loc = def.location();
        if (loc == null) {
            List<Player> online = new ArrayList<>(Bukkit.getOnlinePlayers());
            if (online.isEmpty()) return false;
            Player p = online.get(ThreadLocalRandom.current().nextInt(online.size()));
            loc = p.getLocation();
        }

        Entity entity = loc.getWorld().spawnEntity(loc, def.type());
        if (!(entity instanceof LivingEntity boss)) {
            entity.remove();
            plugin.getLogger().warning("Boss '" + def.id() + "': " + def.type() + " ist kein LivingEntity.");
            return false;
        }

        boss.setCustomName(MessageManager.color(def.display()));
        boss.setCustomNameVisible(true);
        boss.setRemoveWhenFarAway(false);
        boss.setPersistent(true);
        if (boss.getAttribute(Attribute.MAX_HEALTH) != null) {
            boss.getAttribute(Attribute.MAX_HEALTH).setBaseValue(def.health());
        }
        boss.setHealth(def.health());

        this.bossEntityId = boss.getUniqueId();
        this.activeDef = def;
        this.maxHealth = def.health();
        this.startTime = System.currentTimeMillis();
        this.damage.clear();

        this.bossBar = Bukkit.createBossBar(MessageManager.color(def.display()), BarColor.RED, BarStyle.SEGMENTED_10);
        this.bossBar.setProgress(1.0);
        Bukkit.getOnlinePlayers().forEach(bossBar::addPlayer);

        Bukkit.broadcastMessage(plugin.getMessageManager().get("boss.spawned",
                "%boss%", MessageManager.color(def.display())));

        int timeout = plugin.getConfigManager().getConfig().getInt("bossevents.fight-timeout-seconds", 300);
        this.tickTask = Bukkit.getScheduler().runTaskTimer(plugin, () -> tick(timeout), 20L, 20L);
        return true;
    }

    private void tick(int timeoutSeconds) {
        if (!isActive()) return;
        Entity entity = Bukkit.getEntity(bossEntityId);
        if (!(entity instanceof LivingEntity boss) || boss.isDead()) {
            // Boss wurde anderweitig entfernt
            endWithoutReward();
            return;
        }
        double progress = Math.max(0, Math.min(1, boss.getHealth() / maxHealth));
        if (bossBar != null) bossBar.setProgress(progress);

        long elapsed = (System.currentTimeMillis() - startTime) / 1000L;
        if (elapsed >= timeoutSeconds) {
            boss.remove();
            Bukkit.broadcastMessage(plugin.getMessageManager().get("boss.escaped",
                    "%boss%", MessageManager.color(activeDef.display())));
            cleanup();
        }
    }

    /** Registriert Schaden eines Spielers am aktiven Boss. */
    public void recordDamage(UUID bossId, Player player, double amount) {
        if (!isActive() || !bossId.equals(bossEntityId) || amount <= 0) return;
        damage.merge(player.getUniqueId(), amount, Double::sum);
    }

    /** Wird beim Tod des Bosses aufgerufen: Rangliste + Belohnungen. */
    public void onBossDeath(UUID bossId) {
        if (!isActive() || !bossId.equals(bossEntityId)) return;
        BossDefinition def = activeDef;

        List<Map.Entry<UUID, Double>> ranking = new ArrayList<>(damage.entrySet());
        ranking.sort(Map.Entry.<UUID, Double>comparingByValue().reversed());

        Bukkit.broadcastMessage(plugin.getMessageManager().get("boss.defeated",
                "%boss%", MessageManager.color(def.display())));

        int place = 1;
        for (Map.Entry<UUID, Double> entry : ranking) {
            if (place > 3 && !def.rewards().containsKey(place)) break;
            String name = Optional.ofNullable(Bukkit.getOfflinePlayer(entry.getKey()).getName()).orElse("?");
            Bukkit.broadcastMessage(plugin.getMessageManager().get("boss.ranking",
                    "%place%", String.valueOf(place),
                    "%player%", name,
                    "%damage%", String.format("%.0f", entry.getValue())));

            BossReward reward = def.rewards().get(place);
            Player online = Bukkit.getPlayer(entry.getKey());
            if (reward != null && online != null) {
                giveReward(online, reward);
                plugin.getMessageManager().send(online, "boss.reward",
                        "%place%", String.valueOf(place));
            }
            place++;
            if (place > 10) break;
        }
        cleanup();
    }

    private void giveReward(Player player, BossReward reward) {
        if (reward.money() > 0) plugin.getEconomyManager().deposit(player.getUniqueId(), reward.money());
        if (reward.shards() > 0) plugin.getShardsManager().addShards(player.getUniqueId(), reward.shards());
        for (Map.Entry<Material, Integer> e : reward.items().entrySet()) {
            Map<Integer, ItemStack> leftover = player.getInventory().addItem(new ItemStack(e.getKey(), e.getValue()));
            leftover.values().forEach(rest -> player.getWorld().dropItemNaturally(player.getLocation(), rest));
        }
    }

    private void endWithoutReward() {
        if (activeDef != null) {
            Bukkit.broadcastMessage(plugin.getMessageManager().get("boss.ended",
                    "%boss%", MessageManager.color(activeDef.display())));
        }
        cleanup();
    }

    /** Bricht ein laufendes Boss-Event ab (Admin / Plugin-Stop). */
    public void stop() {
        if (!isActive()) return;
        Entity entity = Bukkit.getEntity(bossEntityId);
        if (entity != null) entity.remove();
        cleanup();
    }

    private void cleanup() {
        if (bossBar != null) {
            bossBar.removeAll();
            bossBar = null;
        }
        if (tickTask != null) {
            tickTask.cancel();
            tickTask = null;
        }
        bossEntityId = null;
        activeDef = null;
        damage.clear();
    }

    public UUID getBossEntityId() {
        return bossEntityId;
    }

    public void addViewer(Player player) {
        if (bossBar != null) bossBar.addPlayer(player);
    }

    public void removeViewer(Player player) {
        if (bossBar != null) bossBar.removePlayer(player);
    }
}
