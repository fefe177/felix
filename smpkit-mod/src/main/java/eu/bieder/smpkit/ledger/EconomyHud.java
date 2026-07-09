package eu.bieder.smpkit.ledger;

import eu.bieder.smpkit.config.SmpKitConfig;
import eu.bieder.smpkit.grind.GrindTracker;
import eu.bieder.smpkit.util.Money;
import net.fabricmc.fabric.api.client.rendering.v1.HudRenderCallback;
import net.minecraft.client.MinecraftClient;
import net.minecraft.client.gui.DrawContext;
import net.minecraft.text.MutableText;
import net.minecraft.text.Text;
import net.minecraft.util.Formatting;

import java.util.ArrayList;
import java.util.List;

/** Zeigt Sitzungs-Economy (Ledger) und optional den Grind-Ertrag/Stunde oben links. */
public final class EconomyHud implements HudRenderCallback {

    @Override
    public void onHudRender(DrawContext context, net.minecraft.client.render.RenderTickCounter tickCounter) {
        SmpKitConfig cfg = SmpKitConfig.get();
        MinecraftClient client = MinecraftClient.getInstance();
        if (client.player == null || client.options.hudHidden || client.currentScreen != null) return;
        if (!cfg.ledgerHudEnabled && !cfg.grindHudEnabled) return;

        List<Text> lines = new ArrayList<>();

        if (cfg.ledgerHudEnabled) {
            Ledger l = Ledger.get();
            lines.add(Text.literal("SMP-Kit Ledger").formatted(Formatting.AQUA));
            if (l.balance() >= 0) {
                lines.add(label("Kontostand: ").append(value(Money.format(l.balance()), Formatting.WHITE)));
            }
            long net = l.net();
            lines.add(label("Netto (Sitzung): ")
                    .append(value(Money.format(net), net >= 0 ? Formatting.GREEN : Formatting.RED)));
            lines.add(label("Einkommen/h: ").append(value(Money.format(l.incomePerHour()), Formatting.GREEN)));
        }

        if (cfg.grindHudEnabled) {
            GrindTracker g = GrindTracker.get();
            if (cfg.ledgerHudEnabled) lines.add(Text.literal(" "));
            lines.add(label("Grind: ").append(value(g.activity(), Formatting.WHITE)));
            lines.add(label("Ertrag: ").append(value(Money.format(g.earned())
                    + " (" + Money.format(g.perHour()) + "/h)", Formatting.GREEN)));
        }

        int x = 4;
        int y = 4;
        for (Text line : lines) {
            context.drawTextWithShadow(client.textRenderer, line, x, y, 0xFFFFFFFF);
            y += 10;
        }
    }

    private static MutableText label(String s) {
        return Text.literal(s).formatted(Formatting.GRAY);
    }

    private static Text value(String s, Formatting color) {
        return Text.literal(s).formatted(color);
    }
}
