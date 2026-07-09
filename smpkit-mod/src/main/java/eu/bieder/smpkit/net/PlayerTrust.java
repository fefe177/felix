package eu.bieder.smpkit.net;

import java.util.Map;

/** Antwortobjekt des Backends für einen Spieler (per Gson befüllt). */
public class PlayerTrust {
    public String name;
    public int trust;         // 0..100
    public int reports;       // Anzahl unterschiedlicher Melder
    public int vouches;       // Anzahl unterschiedlicher Empfehler
    public boolean rated;     // false = noch keine Daten
    public boolean flagged;   // auf der geteilten Blacklist
    public Map<String, Integer> categories;

    public static PlayerTrust unknown(String name) {
        PlayerTrust p = new PlayerTrust();
        p.name = name;
        p.trust = 50;
        p.rated = false;
        return p;
    }
}
