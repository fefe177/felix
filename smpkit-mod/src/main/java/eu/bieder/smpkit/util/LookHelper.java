package eu.bieder.smpkit.util;

import net.minecraft.client.MinecraftClient;
import net.minecraft.client.network.AbstractClientPlayerEntity;
import net.minecraft.util.math.Vec3d;

/**
 * Ermittelt den Spieler, auf den der lokale Spieler blickt – über einen
 * einfachen Blickstrahl mit Winkeltoleranz (funktioniert weiter als der
 * normale Crosshair-Reach und ist versionsrobust).
 */
public final class LookHelper {

    private LookHelper() {}

    public static AbstractClientPlayerEntity getLookedAtPlayer(double maxDistance) {
        MinecraftClient client = MinecraftClient.getInstance();
        if (client.player == null || client.world == null) return null;

        Vec3d eye = client.player.getEyePos();
        Vec3d look = client.player.getRotationVec(1.0F).normalize();

        AbstractClientPlayerEntity best = null;
        double bestForward = Double.MAX_VALUE;

        for (AbstractClientPlayerEntity p : client.world.getPlayers()) {
            if (p == client.player) continue;
            Vec3d to = p.getEyePos().subtract(eye);
            double forward = to.dotProduct(look);
            if (forward <= 0 || forward > maxDistance) continue;
            Vec3d closest = eye.add(look.multiply(forward));
            double perp = closest.distanceTo(p.getEyePos());
            if (perp < 0.9 && forward < bestForward) {
                bestForward = forward;
                best = p;
            }
        }
        return best;
    }
}
