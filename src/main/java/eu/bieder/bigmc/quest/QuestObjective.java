package eu.bieder.bigmc.quest;

/**
 * Art des Quest-Ziels. Der QuestListener meldet passende Spielereignisse.
 */
public enum QuestObjective {
    /** Bloecke abbauen (filter = Material-Name, optional). */
    BREAK,
    /** Bloecke platzieren (filter = Material-Name, optional). */
    PLACE,
    /** Mobs toeten (filter = EntityType-Name, optional). */
    KILL_ENTITY,
    /** Spieler im PvP toeten. */
    KILL_PLAYER,
    /** Fische angeln. */
    FISH
}
