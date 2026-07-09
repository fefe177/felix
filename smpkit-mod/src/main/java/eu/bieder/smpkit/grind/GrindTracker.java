package eu.bieder.smpkit.grind;

/**
 * Misst den Ertrag pro Stunde einer benannten Aktivität ("Blaze-Farm",
 * "AH-Flippen" …). Wird aus denselben Einkommens-Events wie das Ledger
 * gespeist. Reine Selbst-Statistik.
 */
public final class GrindTracker {

    private static final GrindTracker INSTANCE = new GrindTracker();
    public static GrindTracker get() { return INSTANCE; }

    private String activity = "Grind";
    private long startTime = System.currentTimeMillis();
    private long earned = 0;

    private GrindTracker() {}

    public synchronized void addEarnings(long amount) {
        if (amount > 0) earned += amount;
    }

    public synchronized void startActivity(String name) {
        this.activity = (name == null || name.isBlank()) ? "Grind" : name;
        this.startTime = System.currentTimeMillis();
        this.earned = 0;
    }

    public synchronized String activity() { return activity; }
    public synchronized long earned() { return earned; }

    public synchronized double hours() {
        return Math.max(1.0 / 3600.0, (System.currentTimeMillis() - startTime) / 3_600_000.0);
    }

    public synchronized long perHour() {
        return Math.round(earned / hours());
    }
}
