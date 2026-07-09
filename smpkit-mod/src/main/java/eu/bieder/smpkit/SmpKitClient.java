package eu.bieder.smpkit;

import com.mojang.brigadier.arguments.StringArgumentType;
import com.mojang.brigadier.builder.LiteralArgumentBuilder;
import eu.bieder.smpkit.config.SmpKitConfig;
import eu.bieder.smpkit.ledger.EconomyHud;
import eu.bieder.smpkit.net.ChatBus;
import eu.bieder.smpkit.net.PlayerTrust;
import eu.bieder.smpkit.net.TrustApi;
import eu.bieder.smpkit.reputation.BlacklistScreen;
import eu.bieder.smpkit.reputation.ReportScreen;
import eu.bieder.smpkit.reputation.TrustCache;
import eu.bieder.smpkit.reputation.TrustFormat;
import eu.bieder.smpkit.reputation.TrustHud;
import eu.bieder.smpkit.util.Identity;
import eu.bieder.smpkit.util.LookHelper;
import eu.bieder.smpkit.util.Msg;
import net.fabricmc.api.ClientModInitializer;
import net.fabricmc.fabric.api.client.command.v2.ClientCommandManager;
import net.fabricmc.fabric.api.client.command.v2.ClientCommandRegistrationCallback;
import net.fabricmc.fabric.api.client.command.v2.FabricClientCommandSource;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientTickEvents;
import net.fabricmc.fabric.api.client.keybinding.v1.KeyBindingHelper;
import net.fabricmc.fabric.api.client.rendering.v1.HudRenderCallback;
import net.fabricmc.fabric.api.client.networking.v1.ClientPlayConnectionEvents;
import net.minecraft.client.MinecraftClient;
import net.minecraft.client.network.AbstractClientPlayerEntity;
import net.minecraft.client.option.KeyBinding;
import net.minecraft.client.util.InputUtil;
import net.minecraft.text.Text;
import net.minecraft.util.Formatting;
import org.lwjgl.glfw.GLFW;

import java.util.HashMap;
import java.util.Map;

public class SmpKitClient implements ClientModInitializer {

    private KeyBinding reportKey;
    private KeyBinding blacklistKey;

    private int tickCounter = 0;
    private final Map<String, Long> warnCooldown = new HashMap<>();

    @Override
    public void onInitializeClient() {
        SmpKitConfig.get();   // Config laden/anlegen

        // HUDs
        HudRenderCallback.EVENT.register(new TrustHud());
        HudRenderCallback.EVENT.register(new EconomyHud());

        // Chat (SafeTrade + Ledger)
        ChatBus.register();

        // Blacklist beim Serverbeitritt laden
        ClientPlayConnectionEvents.JOIN.register((handler, sender, client) ->
                TrustCache.refreshBlacklistIfStale());

        registerKeybinds();
        registerCommands();

        ClientTickEvents.END_CLIENT_TICK.register(this::onClientTick);

        System.out.println("[SMP-Kit] initialisiert.");
    }

    // --- Tastenkürzel ---
    private void registerKeybinds() {
        reportKey = KeyBindingHelper.registerKeyBinding(new KeyBinding(
                "key.smpkit.report", InputUtil.Type.KEYSYM, GLFW.GLFW_KEY_R, "category.smpkit"));
        blacklistKey = KeyBindingHelper.registerKeyBinding(new KeyBinding(
                "key.smpkit.blacklist", InputUtil.Type.KEYSYM, GLFW.GLFW_KEY_B, "category.smpkit"));
    }

    private void onClientTick(MinecraftClient client) {
        while (reportKey.wasPressed()) openReportForLookedAt(client);
        while (blacklistKey.wasPressed()) client.setScreen(new BlacklistScreen());

        // ~ alle 2 Sekunden: Nähe-Warnung + Blacklist auffrischen
        if (++tickCounter % 40 == 0) {
            TrustCache.refreshBlacklistIfStale();
            checkNearbyThreats(client);
        }
    }

    private void openReportForLookedAt(MinecraftClient client) {
        AbstractClientPlayerEntity p = LookHelper.getLookedAtPlayer(16.0);
        if (p == null) {
            Msg.warn("Kein Spieler im Blick – schau einen Spieler an oder nutze /smpkit report <name>.");
            return;
        }
        client.setScreen(new ReportScreen(p.getGameProfile().getName()));
    }

    private void checkNearbyThreats(MinecraftClient client) {
        SmpKitConfig cfg = SmpKitConfig.get();
        if (!cfg.nearbyWarningEnabled || client.player == null || client.world == null) return;
        double r2 = (double) cfg.nearbyWarnRadius * cfg.nearbyWarnRadius;
        long now = System.currentTimeMillis();

        for (AbstractClientPlayerEntity p : client.world.getPlayers()) {
            if (p == client.player) continue;
            String name = p.getGameProfile().getName();
            if (!TrustCache.isFlagged(name)) continue;
            if (client.player.squaredDistanceTo(p) > r2) continue;
            Long last = warnCooldown.get(name);
            if (last != null && now - last < 30_000) continue;
            warnCooldown.put(name, now);
            Msg.send(Text.literal("⚠ Achtung: ").formatted(Formatting.RED, Formatting.BOLD)
                    .append(Text.literal(name).formatted(Formatting.WHITE))
                    .append(Text.literal(" ist als SCAMMER geflaggt und in der Nähe!")
                            .formatted(Formatting.RED)));
        }
    }

    // --- Client-Commands ---
    private void registerCommands() {
        ClientCommandRegistrationCallback.EVENT.register((dispatcher, access) -> {
            dispatcher.register(buildRoot("smpkit"));
            dispatcher.register(buildRoot("smptrust"));
        });
    }

    private LiteralArgumentBuilder<FabricClientCommandSource> buildRoot(String name) {
        return ClientCommandManager.literal(name)
                .then(ClientCommandManager.literal("check")
                        .then(ClientCommandManager.argument("player", StringArgumentType.word())
                                .executes(ctx -> {
                                    checkPlayer(ctx.getSource(), StringArgumentType.getString(ctx, "player"));
                                    return 1;
                                })))
                .then(ClientCommandManager.literal("report")
                        .then(ClientCommandManager.argument("player", StringArgumentType.word())
                                .executes(ctx -> {
                                    String player = StringArgumentType.getString(ctx, "player");
                                    MinecraftClient.getInstance().execute(() ->
                                            MinecraftClient.getInstance().setScreen(new ReportScreen(player)));
                                    return 1;
                                })))
                .then(ClientCommandManager.literal("vouch")
                        .then(ClientCommandManager.argument("player", StringArgumentType.word())
                                .executes(ctx -> {
                                    String player = StringArgumentType.getString(ctx, "player");
                                    TrustApi.vouch(Identity.uuid(), Identity.username(), player).thenAccept(res -> {
                                        if (res.success) {
                                            TrustCache.invalidate(player);
                                            Msg.success("Empfehlung für " + player + " gespeichert.");
                                        } else {
                                            Msg.error("Fehlgeschlagen: " + res.error);
                                        }
                                    });
                                    return 1;
                                })))
                .then(ClientCommandManager.literal("redeem")
                        .then(ClientCommandManager.argument("key", StringArgumentType.greedyString())
                                .executes(ctx -> {
                                    String key = StringArgumentType.getString(ctx, "key").trim();
                                    TrustApi.redeem(key, Identity.uuid(), Identity.username()).thenAccept(res -> {
                                        if (res.success && res.token != null) {
                                            SmpKitConfig cfg = SmpKitConfig.get();
                                            cfg.apiKey = res.token;
                                            cfg.save();
                                            Msg.success("Lizenz aktiviert! Zugang ist jetzt freigeschaltet.");
                                        } else {
                                            Msg.error("Einlösung fehlgeschlagen: " + res.error);
                                        }
                                    });
                                    return 1;
                                })))
                .then(ClientCommandManager.literal("unreport")
                        .then(ClientCommandManager.argument("player", StringArgumentType.word())
                                .executes(ctx -> {
                                    String player = StringArgumentType.getString(ctx, "player");
                                    TrustApi.unreport(Identity.uuid(), player).thenAccept(res -> {
                                        if (res.success) {
                                            TrustCache.invalidate(player);
                                            Msg.success("Eigener Report gegen " + player + " zurückgezogen.");
                                        } else {
                                            Msg.error("Fehlgeschlagen: " + res.error);
                                        }
                                    });
                                    return 1;
                                })))
                .then(ClientCommandManager.literal("list")
                        .executes(ctx -> {
                            MinecraftClient.getInstance().execute(() ->
                                    MinecraftClient.getInstance().setScreen(new BlacklistScreen()));
                            return 1;
                        }))
                .then(ClientCommandManager.literal("seturl")
                        .then(ClientCommandManager.argument("url", StringArgumentType.greedyString())
                                .executes(ctx -> {
                                    SmpKitConfig cfg = SmpKitConfig.get();
                                    cfg.backendUrl = StringArgumentType.getString(ctx, "url").trim();
                                    cfg.save();
                                    Msg.success("Backend-URL gesetzt: " + cfg.baseUrl());
                                    return 1;
                                })))
                .then(ClientCommandManager.literal("setkey")
                        .then(ClientCommandManager.argument("key", StringArgumentType.greedyString())
                                .executes(ctx -> {
                                    SmpKitConfig cfg = SmpKitConfig.get();
                                    cfg.apiKey = StringArgumentType.getString(ctx, "key").trim();
                                    cfg.save();
                                    Msg.success("API-Key gespeichert.");
                                    return 1;
                                })))
                .then(ClientCommandManager.literal("hud")
                        .then(ClientCommandManager.literal("ledger").executes(ctx -> toggleLedger()))
                        .then(ClientCommandManager.literal("grind").executes(ctx -> toggleGrind()))
                        .then(ClientCommandManager.literal("trust").executes(ctx -> toggleTrust())))
                .then(ClientCommandManager.literal("grindstart")
                        .then(ClientCommandManager.argument("activity", StringArgumentType.greedyString())
                                .executes(ctx -> {
                                    String act = StringArgumentType.getString(ctx, "activity");
                                    eu.bieder.smpkit.grind.GrindTracker.get().startActivity(act);
                                    Msg.info("Grind-Aktivität gestartet: " + act);
                                    return 1;
                                })))
                .executes(ctx -> {
                    ctx.getSource().sendFeedback(Text.literal(
                            "SMP-Kit: /smpkit redeem <schlüssel> · check|report|vouch|unreport <spieler> · "
                                    + "list · seturl <url> · hud ledger|grind|trust")
                            .formatted(Formatting.AQUA));
                    return 1;
                });
    }

    private void checkPlayer(FabricClientCommandSource source, String player) {
        TrustApi.getPlayer(player).thenAccept(pt -> {
            TrustCache.put(player, pt);
            Text msg;
            if (pt == null || !pt.rated) {
                msg = Text.literal(player + ": noch nicht bewertet (neutral).").formatted(Formatting.GRAY);
            } else {
                msg = Text.literal(player + ": " + TrustFormat.shortLabel(pt)
                        + "  (" + pt.reports + " Reports, " + pt.vouches + " Vouches)")
                        .formatted(TrustFormat.color(pt));
            }
            Msg.send(msg);
        });
    }

    private int toggleLedger() {
        SmpKitConfig cfg = SmpKitConfig.get();
        cfg.ledgerHudEnabled = !cfg.ledgerHudEnabled; cfg.save();
        Msg.info("Ledger-HUD: " + (cfg.ledgerHudEnabled ? "an" : "aus"));
        return 1;
    }

    private int toggleGrind() {
        SmpKitConfig cfg = SmpKitConfig.get();
        cfg.grindHudEnabled = !cfg.grindHudEnabled; cfg.save();
        Msg.info("Grind-HUD: " + (cfg.grindHudEnabled ? "an" : "aus"));
        return 1;
    }

    private int toggleTrust() {
        SmpKitConfig cfg = SmpKitConfig.get();
        cfg.trustHudEnabled = !cfg.trustHudEnabled; cfg.save();
        Msg.info("Trust-HUD: " + (cfg.trustHudEnabled ? "an" : "aus"));
        return 1;
    }
}
