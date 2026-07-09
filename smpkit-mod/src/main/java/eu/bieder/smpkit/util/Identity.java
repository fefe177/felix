package eu.bieder.smpkit.util;

import net.minecraft.client.MinecraftClient;

/**
 * Identität des lokalen Spielers für Report/Vouch.
 *
 * Hinweis: Es wird die vom Client gelieferte Session-UUID verwendet. Für einen
 * öffentlichen Produktivbetrieb sollte das Backend die Identität zusätzlich
 * verifizieren (z.B. per Mojang-Session-Token), sonst sind UUIDs fälschbar.
 */
public final class Identity {

    private Identity() {}

    public static String uuid() {
        MinecraftClient c = MinecraftClient.getInstance();
        return c.getSession().getUuidOrNull() != null
                ? c.getSession().getUuidOrNull().toString()
                : c.getSession().getUsername();
    }

    public static String username() {
        return MinecraftClient.getInstance().getSession().getUsername();
    }
}
