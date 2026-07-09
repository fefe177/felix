package eu.bieder.smpkit.reputation;

import eu.bieder.smpkit.net.PlayerTrust;
import eu.bieder.smpkit.net.TrustApi;
import net.minecraft.client.gui.DrawContext;
import net.minecraft.client.gui.screen.Screen;
import net.minecraft.client.gui.widget.ButtonWidget;
import net.minecraft.text.Text;
import net.minecraft.util.Formatting;

import java.util.ArrayList;
import java.util.List;

/** Zeigt die geteilte Blacklist geflaggter Spieler (server-weit, alle Mod-Nutzer). */
public class BlacklistScreen extends Screen {

    private List<PlayerTrust> entries = new ArrayList<>();
    private boolean loading = true;
    private int scroll = 0;
    private static final int ROWS = 14;

    public BlacklistScreen() {
        super(Text.literal("SMP-Kit Blacklist"));
    }

    @Override
    protected void init() {
        int cx = this.width / 2;
        this.addDrawableChild(ButtonWidget.builder(Text.literal("Aktualisieren"), b -> reload())
                .dimensions(cx - 154, this.height - 30, 100, 20).build());
        this.addDrawableChild(ButtonWidget.builder(Text.literal("▲"), b -> { if (scroll > 0) scroll--; })
                .dimensions(cx - 50, this.height - 30, 48, 20).build());
        this.addDrawableChild(ButtonWidget.builder(Text.literal("▼"), b -> {
                    if (scroll < Math.max(0, entries.size() - ROWS)) scroll++;
                })
                .dimensions(cx + 2, this.height - 30, 48, 20).build());
        this.addDrawableChild(ButtonWidget.builder(Text.literal("Schließen"), b -> this.close())
                .dimensions(cx + 54, this.height - 30, 100, 20).build());
        reload();
    }

    private void reload() {
        loading = true;
        TrustApi.getBlacklist().thenAccept(list -> {
            this.entries = list;
            this.loading = false;
            this.scroll = 0;
        });
    }

    @Override
    public void render(DrawContext context, int mouseX, int mouseY, float delta) {
        super.render(context, mouseX, mouseY, delta);
        int cx = this.width / 2;
        context.drawCenteredTextWithShadow(this.textRenderer,
                Text.literal("Geteilte Blacklist – geflaggte Spieler").formatted(Formatting.RED, Formatting.BOLD),
                cx, 20, 0xFFFFFF);

        if (loading) {
            context.drawCenteredTextWithShadow(this.textRenderer,
                    Text.literal("Lade …").formatted(Formatting.GRAY), cx, 60, 0xFFFFFF);
            return;
        }
        if (entries.isEmpty()) {
            context.drawCenteredTextWithShadow(this.textRenderer,
                    Text.literal("Keine geflaggten Spieler.").formatted(Formatting.GREEN), cx, 60, 0xFFFFFF);
            return;
        }

        context.drawCenteredTextWithShadow(this.textRenderer,
                Text.literal(entries.size() + " Einträge").formatted(Formatting.GRAY), cx, 34, 0xFFFFFF);

        int y = 52;
        int end = Math.min(entries.size(), scroll + ROWS);
        for (int i = scroll; i < end; i++) {
            PlayerTrust p = entries.get(i);
            String line = String.format("%-16s  Trust %3d%%   %d Reports / %d Vouches",
                    p.name, p.trust, p.reports, p.vouches);
            context.drawTextWithShadow(this.textRenderer,
                    Text.literal(line).formatted(TrustFormat.color(p)), cx - 160, y, 0xFFFFFF);
            y += 12;
        }
    }

    @Override
    public boolean shouldPause() {
        return false;
    }
}
