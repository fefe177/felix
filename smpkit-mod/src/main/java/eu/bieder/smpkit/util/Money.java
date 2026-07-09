package eu.bieder.smpkit.util;

import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** Parsen und Formatieren von Ingame-Geldbeträgen (k/m/b/t-Suffixe, Kommas). */
public final class Money {

    private static final Pattern AMOUNT =
            Pattern.compile("([0-9][0-9.,]*)\\s*([kmbtKMBT]?)");

    private Money() {}

    /** "$1,250.5k" / "2m" / "1000" -> long. Bei Fehler: -1. */
    public static long parse(String raw) {
        if (raw == null) return -1;
        String s = raw.replace("$", "").trim();
        Matcher m = AMOUNT.matcher(s);
        if (!m.find()) return -1;
        String num = m.group(1).replace(",", "");
        String suffix = m.group(2).toLowerCase(Locale.ROOT);
        double val;
        try {
            val = Double.parseDouble(num);
        } catch (NumberFormatException e) {
            return -1;
        }
        switch (suffix) {
            case "k": val *= 1_000d; break;
            case "m": val *= 1_000_000d; break;
            case "b": val *= 1_000_000_000d; break;
            case "t": val *= 1_000_000_000_000d; break;
            default: break;
        }
        return (long) val;
    }

    /** Kompakte Anzeige: 1_250_000 -> "1.25m". */
    public static String format(long amount) {
        double a = amount;
        String sign = a < 0 ? "-" : "";
        a = Math.abs(a);
        if (a >= 1_000_000_000_000d) return sign + trim(a / 1e12) + "t";
        if (a >= 1_000_000_000d) return sign + trim(a / 1e9) + "b";
        if (a >= 1_000_000d) return sign + trim(a / 1e6) + "m";
        if (a >= 1_000d) return sign + trim(a / 1e3) + "k";
        return sign + (long) a;
    }

    private static String trim(double v) {
        return String.format(Locale.ROOT, "%.2f", v)
                .replaceAll("0+$", "").replaceAll("\\.$", "");
    }
}
