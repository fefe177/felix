package eu.bieder.smpkit.reputation;

import eu.bieder.smpkit.net.PlayerTrust;
import net.minecraft.util.Formatting;

/** Einheitliche Farb-/Textdarstellung für Trust-Werte. */
public final class TrustFormat {

    private TrustFormat() {}

    /** ARGB-Farbe für HUD-Text (drawText erwartet int-Farbe). */
    public static int argb(PlayerTrust pt) {
        if (pt == null || !pt.rated) return 0xFFAAAAAA;   // grau = unbewertet
        if (pt.flagged) return 0xFFFF3333;                // rot = geflaggt
        if (pt.trust < 40) return 0xFFFF5555;             // rot
        if (pt.trust < 60) return 0xFFFFAA00;             // gelb/orange
        return 0xFF55FF55;                                // grün
    }

    /** Formatting für Chat/GUI-Texte. */
    public static Formatting color(PlayerTrust pt) {
        if (pt == null || !pt.rated) return Formatting.GRAY;
        if (pt.flagged) return Formatting.RED;
        if (pt.trust < 40) return Formatting.RED;
        if (pt.trust < 60) return Formatting.GOLD;
        return Formatting.GREEN;
    }

    public static String shortLabel(PlayerTrust pt) {
        if (pt == null || !pt.rated) return "Trust: n/a";
        String s = "Trust " + pt.trust + "%";
        if (pt.flagged) s += " ⚠ SCAMMER";
        return s;
    }
}
