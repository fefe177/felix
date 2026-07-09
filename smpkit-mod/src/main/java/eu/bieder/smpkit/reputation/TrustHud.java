package eu.bieder.smpkit.reputation;

import eu.bieder.smpkit.config.SmpKitConfig;
import eu.bieder.smpkit.net.PlayerTrust;
import eu.bieder.smpkit.util.LookHelper;
import net.fabricmc.fabric.api.client.rendering.v1.HudRenderCallback;
import net.minecraft.client.MinecraftClient;
import net.minecraft.client.gui.DrawContext;
import net.minecraft.client.network.AbstractClientPlayerEntity;
import net.minecraft.text.Text;

/**
 * Blendet den Trust-Wert des gerade angeschauten Spielers mittig unter dem
 * Fadenkreuz ein. Rein informativ – kein Kampf-/Radar-Vorteil.
 */
public final class TrustHud implements HudRenderCallback {

    @Override
    public void onHudRender(DrawContext context, net.minecraft.client.render.RenderTickCounter tickCounter) {
        SmpKitConfig cfg = SmpKitConfig.get();
        if (!cfg.trustHudEnabled) return;

        MinecraftClient client = MinecraftClient.getInstance();
        if (client.player == null || client.options.hudHidden || client.currentScreen != null) return;

        AbstractClientPlayerEntity looked = LookHelper.getLookedAtPlayer(16.0);
        if (looked == null) return;

        String name = looked.getGameProfile().getName();
        PlayerTrust pt = TrustCache.peek(name);   // löst bei Bedarf async Nachladen aus

        String line;
        int color;
        if (pt == null) {
            line = name + " – Trust wird geladen …";
            color = 0xFFAAAAAA;
        } else {
            line = name + " – " + TrustFormat.shortLabel(pt)
                    + (pt.rated ? "  (" + pt.reports + "R/" + pt.vouches + "V)" : "");
            color = TrustFormat.argb(pt);
        }

        int x = context.getScaledWindowWidth() / 2;
        int y = context.getScaledWindowHeight() / 2 + 12;
        Text text = Text.literal(line);
        int w = client.textRenderer.getWidth(text);
        context.drawTextWithShadow(client.textRenderer, text, x - w / 2, y, color);
    }
}
