package eu.bieder.smpkit.util;

import net.minecraft.client.MinecraftClient;
import net.minecraft.text.Text;
import net.minecraft.util.Formatting;

/** Lokale (nur clientseitig sichtbare) Chat-Rückmeldungen mit einheitlichem Präfix. */
public final class Msg {

    private static final Text PREFIX =
            Text.literal("[SMP-Kit] ").formatted(Formatting.AQUA);

    private Msg() {}

    public static void info(String text) {
        send(Text.literal(text).formatted(Formatting.GRAY));
    }

    public static void success(String text) {
        send(Text.literal(text).formatted(Formatting.GREEN));
    }

    public static void warn(String text) {
        send(Text.literal(text).formatted(Formatting.YELLOW));
    }

    public static void error(String text) {
        send(Text.literal(text).formatted(Formatting.RED));
    }

    public static void send(Text body) {
        MinecraftClient client = MinecraftClient.getInstance();
        if (client.player == null) return;
        // Auf den Render-Thread schieben – Aufrufe kommen oft aus HTTP-Callbacks.
        client.execute(() -> {
            if (client.player != null) {
                client.player.sendMessage(Text.empty().append(PREFIX).append(body), false);
            }
        });
    }

    /** Kurze Meldung in der Aktionsleiste (über der Hotbar). */
    public static void actionBar(Text body) {
        MinecraftClient client = MinecraftClient.getInstance();
        if (client.player == null) return;
        client.execute(() -> {
            if (client.player != null) {
                client.player.sendMessage(body, true);
            }
        });
    }
}
