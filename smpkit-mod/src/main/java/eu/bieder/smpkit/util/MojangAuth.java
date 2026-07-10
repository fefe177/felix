package eu.bieder.smpkit.util;

import com.mojang.authlib.exceptions.AuthenticationException;
import com.mojang.authlib.minecraft.MinecraftSessionService;
import net.minecraft.client.MinecraftClient;
import net.minecraft.client.session.Session;

/**
 * Meldet einen "Join" bei Mojang an – exakt derselbe Vorgang wie beim Beitritt
 * zu einem Minecraft-Server. Als serverId wird die vom Backend gelieferte Nonce
 * verwendet. Das Backend prüft anschließend via Mojangs hasJoined, dass wirklich
 * dieser Account beigetreten ist, und erhält so die echte UUID.
 */
public final class MojangAuth {

    private MojangAuth() {}

    /**
     * @throws AuthenticationException wenn keine gültige Online-Session vorliegt
     *         (z.B. Offline-/Cracked-Account) oder Mojang nicht erreichbar ist.
     */
    public static void joinServer(String serverId) throws AuthenticationException {
        MinecraftClient mc = MinecraftClient.getInstance();
        Session session = mc.getSession();
        MinecraftSessionService service = mc.getSessionService();
        // authlib (MC 1.21.x): joinServer(UUID profileId, String authToken, String serverId)
        service.joinServer(session.getUuidOrNull(), session.getAccessToken(), serverId);
    }
}
