package eu.bieder.smpkit.net;

import eu.bieder.smpkit.config.SmpKitConfig;
import eu.bieder.smpkit.grind.GrindTracker;
import eu.bieder.smpkit.ledger.Ledger;
import eu.bieder.smpkit.util.Money;
import eu.bieder.smpkit.util.Msg;
import net.fabricmc.fabric.api.client.message.v1.ClientReceiveMessageEvents;
import net.fabricmc.fabric.api.client.message.v1.ClientSendMessageEvents;
import net.minecraft.text.Text;
import net.minecraft.util.Formatting;

import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Zentrale Chat-Verarbeitung:
 *  - SafeTrade: Doppelbestätigung für große /pay-Beträge (Vertipper-Schutz).
 *  - Ledger/Grind: Parsen eingehender Zahlungs- und Kontostand-Nachrichten.
 *
 * Die Muster sind bewusst tolerant gehalten und lassen sich bei abweichenden
 * Server-Meldungen leicht anpassen.
 */
public final class ChatBus {

    // --- Regex für Server-Meldungen (case-insensitive) ---
    private static final Pattern INCOME_A = Pattern.compile(
            "(\\w{1,16})\\s+paid you\\s+\\$?([0-9.,]+[kmbt]?)", Pattern.CASE_INSENSITIVE);
    private static final Pattern INCOME_B = Pattern.compile(
            "received\\s+\\$?([0-9.,]+[kmbt]?)\\s+from\\s+(\\w{1,16})", Pattern.CASE_INSENSITIVE);
    private static final Pattern SPEND = Pattern.compile(
            "(?:paid|sent)\\s+\\$?([0-9.,]+[kmbt]?)\\s+to\\s+(\\w{1,16})", Pattern.CASE_INSENSITIVE);
    private static final Pattern BALANCE = Pattern.compile(
            "balance(?:\\s+is)?[:\\s]+\\$?([0-9.,]+[kmbt]?)", Pattern.CASE_INSENSITIVE);

    // --- SafeTrade pending confirm ---
    private static String pendingPay = null;
    private static long pendingAt = 0;
    private static final long CONFIRM_WINDOW_MS = 12_000;

    private ChatBus() {}

    public static void register() {
        ClientSendMessageEvents.ALLOW_COMMAND.register(ChatBus::allowCommand);
        ClientReceiveMessageEvents.ALLOW_GAME.register((message, overlay) -> {
            if (!overlay) parseIncoming(message);
            return true;   // niemals unterdrücken
        });
    }

    /** @return false = Befehl abbrechen (bis Bestätigung). */
    private static boolean allowCommand(String command) {
        SmpKitConfig cfg = SmpKitConfig.get();
        if (!cfg.payConfirmEnabled) return true;

        String[] parts = command.trim().split("\\s+");
        if (parts.length < 3 || !parts[0].equalsIgnoreCase("pay")) return true;

        long amount = Money.parse(parts[2]);
        if (amount < cfg.payConfirmThreshold) return true;

        String norm = command.trim().toLowerCase(Locale.ROOT);
        long now = System.currentTimeMillis();

        // Zweite identische Eingabe innerhalb des Zeitfensters -> durchlassen.
        if (norm.equals(pendingPay) && now - pendingAt < CONFIRM_WINDOW_MS) {
            pendingPay = null;
            Msg.success("Zahlung bestätigt – wird gesendet.");
            return true;
        }

        // Erste Eingabe -> abbrechen und Warnung zeigen.
        pendingPay = norm;
        pendingAt = now;
        String target = parts[1];
        Msg.send(Text.literal("⚠ Du willst ")
                .formatted(Formatting.YELLOW)
                .append(Text.literal(Money.format(amount)).formatted(Formatting.GOLD, Formatting.BOLD))
                .append(Text.literal(" an ").formatted(Formatting.YELLOW))
                .append(Text.literal(target).formatted(Formatting.WHITE))
                .append(Text.literal(" zahlen. Zum Bestätigen den Befehl innerhalb 12s ERNEUT senden.")
                        .formatted(Formatting.YELLOW)));
        return false;
    }

    private static void parseIncoming(Text message) {
        String s = message.getString();
        if (s == null || s.isEmpty()) return;

        Matcher m;

        m = INCOME_A.matcher(s);
        if (m.find()) {
            long amt = Money.parse(m.group(2));
            recordIncome(m.group(1), amt);
            return;
        }
        m = INCOME_B.matcher(s);
        if (m.find()) {
            long amt = Money.parse(m.group(1));
            recordIncome(m.group(2), amt);
            return;
        }
        m = SPEND.matcher(s);
        if (m.find()) {
            long amt = Money.parse(m.group(1));
            if (amt > 0) Ledger.get().addSpend(m.group(2), amt);
            return;
        }
        m = BALANCE.matcher(s);
        if (m.find()) {
            long bal = Money.parse(m.group(1));
            if (bal >= 0) Ledger.get().setBalance(bal);
        }
    }

    private static void recordIncome(String partner, long amt) {
        if (amt <= 0) return;
        Ledger.get().addIncome(partner, amt);
        GrindTracker.get().addEarnings(amt);
    }
}
