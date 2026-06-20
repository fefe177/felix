package eu.bieder.bigmc.battlepass;

/**
 * Belohnung eines Battle-Pass-Levels (Geld + Shards).
 */
public record BattlePassReward(double money, long shards) {

    public boolean isEmpty() {
        return money <= 0 && shards <= 0;
    }
}
