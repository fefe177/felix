package eu.bieder.smpkit.ledger;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Persönliche Economy-Statistik der laufenden Sitzung. Wird aus geparsten
 * Chat-Nachrichten gespeist (Zahlungen rein/raus, Kontostand) und rein lokal
 * ausgewertet – keine Serverdaten, kein unfairer Vorteil.
 */
public final class Ledger {

    private static final Ledger INSTANCE = new Ledger();
    public static Ledger get() { return INSTANCE; }

    private final long sessionStart = System.currentTimeMillis();
    private long incomeTotal = 0;
    private long spendTotal = 0;
    private long currentBalance = -1;               // -1 = unbekannt
    private final Map<String, Long> perPartnerNet = new LinkedHashMap<>();

    private Ledger() {}

    public synchronized void addIncome(String partner, long amount) {
        if (amount <= 0) return;
        incomeTotal += amount;
        perPartnerNet.merge(partner == null ? "?" : partner, amount, Long::sum);
    }

    public synchronized void addSpend(String partner, long amount) {
        if (amount <= 0) return;
        spendTotal += amount;
        perPartnerNet.merge(partner == null ? "?" : partner, -amount, Long::sum);
    }

    public synchronized void setBalance(long balance) {
        this.currentBalance = balance;
    }

    public synchronized long incomeTotal() { return incomeTotal; }
    public synchronized long spendTotal() { return spendTotal; }
    public synchronized long net() { return incomeTotal - spendTotal; }
    public synchronized long balance() { return currentBalance; }

    public synchronized double hoursElapsed() {
        return Math.max(1.0 / 3600.0, (System.currentTimeMillis() - sessionStart) / 3_600_000.0);
    }

    public synchronized long incomePerHour() {
        return Math.round(incomeTotal / hoursElapsed());
    }

    public synchronized long netPerHour() {
        return Math.round(net() / hoursElapsed());
    }

    public synchronized Map<String, Long> perPartner() {
        return new LinkedHashMap<>(perPartnerNet);
    }

    public synchronized void reset() {
        incomeTotal = 0;
        spendTotal = 0;
        perPartnerNet.clear();
    }
}
