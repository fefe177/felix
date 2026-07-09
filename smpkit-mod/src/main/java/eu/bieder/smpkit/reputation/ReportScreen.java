package eu.bieder.smpkit.reputation;

import eu.bieder.smpkit.net.PlayerTrust;
import eu.bieder.smpkit.net.TrustApi;
import eu.bieder.smpkit.util.Identity;
import eu.bieder.smpkit.util.Msg;
import net.minecraft.client.gui.DrawContext;
import net.minecraft.client.gui.screen.Screen;
import net.minecraft.client.gui.widget.ButtonWidget;
import net.minecraft.client.gui.widget.TextFieldWidget;
import net.minecraft.text.Text;
import net.minecraft.util.Formatting;

/** GUI zum Melden (Report) oder Empfehlen (Vouch) eines Spielers. */
public class ReportScreen extends Screen {

    /** Kategorien – müssen mit den Backend-Kategorien übereinstimmen. */
    private enum Category {
        SCAM_TPTRADE("scam_tptrade", "Beim TP-Trade betrogen"),
        TP_KILL("tp_kill", "Beim Hinteleportieren getötet"),
        ITEM_SWITCH("item_switch", "Item beim Handeln getauscht"),
        PAY_FIRST("pay_first_scam", "\"Zahl zuerst\"-Masche"),
        DOUBLING("doubling_scam", "\"Verdopple dein Geld\""),
        OTHER("other", "Sonstiges");

        final String id;
        final String label;
        Category(String id, String label) { this.id = id; this.label = label; }
    }

    private final String target;
    private Category selected = Category.SCAM_TPTRADE;
    private TextFieldWidget noteField;
    private ButtonWidget submitButton;

    public ReportScreen(String target) {
        super(Text.literal("Spieler melden: " + target));
        this.target = target;
    }

    @Override
    protected void init() {
        int cx = this.width / 2;
        int y = this.height / 2 - 70;

        // Kategorie-Buttons (zwei Spalten)
        Category[] cats = Category.values();
        int bw = 150, bh = 20, gap = 4;
        for (int i = 0; i < cats.length; i++) {
            Category c = cats[i];
            int col = i % 2;
            int row = i / 2;
            int bx = cx - bw - gap / 2 + col * (bw + gap);
            int by = y + row * (bh + gap);
            this.addDrawableChild(ButtonWidget.builder(
                    Text.literal(c.label), b -> selectCategory(c))
                    .dimensions(bx, by, bw, bh).build());
        }

        int noteY = y + 3 * (bh + gap) + 14;
        this.noteField = new TextFieldWidget(this.textRenderer, cx - 152, noteY, 304, 20,
                Text.literal("Notiz (optional)"));
        this.noteField.setMaxLength(280);
        this.noteField.setPlaceholder(Text.literal("Optionale Notiz zum Vorfall …")
                .formatted(Formatting.DARK_GRAY));
        this.addDrawableChild(this.noteField);

        int actionY = noteY + 34;
        this.submitButton = ButtonWidget.builder(
                        Text.literal("Melden"), b -> submitReport())
                .dimensions(cx - 152, actionY, 150, 20).build();
        this.addDrawableChild(this.submitButton);

        this.addDrawableChild(ButtonWidget.builder(
                        Text.literal("Empfehlen (Vouch)").formatted(Formatting.GREEN), b -> submitVouch())
                .dimensions(cx + 2, actionY, 150, 20).build());

        this.addDrawableChild(ButtonWidget.builder(
                        Text.literal("Abbrechen"), b -> this.close())
                .dimensions(cx - 75, actionY + 24, 150, 20).build());

        updateSubmitLabel();
    }

    private void selectCategory(Category c) {
        this.selected = c;
        updateSubmitLabel();
    }

    private void updateSubmitLabel() {
        if (submitButton != null) {
            submitButton.setMessage(Text.literal("Melden: " + selected.label));
        }
    }

    private void submitReport() {
        String note = noteField != null ? noteField.getText() : "";
        setBusy();
        TrustApi.report(Identity.uuid(), Identity.username(), target, selected.id, note)
                .thenAccept(res -> {
                    if (res.success) {
                        TrustCache.invalidate(target);
                        if (res.player != null) TrustCache.put(target, res.player);
                        Msg.success("Report gegen " + target + " gespeichert"
                                + (res.player != null ? " (Trust jetzt " + res.player.trust + "%)." : "."));
                    } else {
                        Msg.error("Report fehlgeschlagen: " + res.error);
                    }
                });
        this.close();
    }

    private void submitVouch() {
        setBusy();
        TrustApi.vouch(Identity.uuid(), Identity.username(), target)
                .thenAccept(res -> {
                    if (res.success) {
                        TrustCache.invalidate(target);
                        if (res.player != null) TrustCache.put(target, res.player);
                        Msg.success("Empfehlung für " + target + " gespeichert"
                                + (res.player != null ? " (Trust jetzt " + res.player.trust + "%)." : "."));
                    } else {
                        Msg.error("Empfehlung fehlgeschlagen: " + res.error);
                    }
                });
        this.close();
    }

    private void setBusy() {
        if (submitButton != null) submitButton.active = false;
    }

    @Override
    public void render(DrawContext context, int mouseX, int mouseY, float delta) {
        super.render(context, mouseX, mouseY, delta);
        int cx = this.width / 2;
        context.drawCenteredTextWithShadow(this.textRenderer,
                Text.literal("Spieler melden").formatted(Formatting.AQUA, Formatting.BOLD),
                cx, this.height / 2 - 92, 0xFFFFFF);
        context.drawCenteredTextWithShadow(this.textRenderer,
                Text.literal("Ziel: " + target).formatted(Formatting.WHITE),
                cx, this.height / 2 - 80, 0xFFFFFF);

        PlayerTrust pt = TrustCache.peek(target);
        if (pt != null && pt.rated) {
            context.drawCenteredTextWithShadow(this.textRenderer,
                    Text.literal("Aktueller Trust: " + pt.trust + "%  (" + pt.reports
                            + " Reports, " + pt.vouches + " Vouches)")
                            .formatted(TrustFormat.color(pt)),
                    cx, this.height / 2 + 64, 0xFFFFFF);
        }
    }

    @Override
    public boolean shouldPause() {
        return false;
    }
}
