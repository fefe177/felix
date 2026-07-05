/* ============================================================
   Coinflip – echte Münze fliegt hoch, dreht sich und fällt zu Boden
   50:50, Auszahlung ×2
   ============================================================ */
(() => {
  const coin = document.getElementById("coin");
  const front = document.getElementById("coinFront");
  const back = document.getElementById("coinBack");
  const shadow = document.getElementById("coinShadow");
  const msg = document.getElementById("coinMsg");
  const headsBtn = document.getElementById("headsBtn");
  const tailsBtn = document.getElementById("tailsBtn");
  let flipping = false;

  const FACE = { heads: "👑", tails: "🔢" };
  const LABEL = { heads: "Kopf", tails: "Zahl" };
  const DUR = 1700;        // Gesamtdauer des Wurfs (ms)
  const APEX = 190;        // maximale Flughöhe (px) – bleibt innerhalb der Flugbühne
  const LAND = 0.82;       // Zeitpunkt der Landung (Anteil der Dauer)

  function play(choice) {
    if (flipping) return;
    const bet = readBet("coinflipBet");
    if (bet === null) return;
    if (!Casino.placeBet(bet, "coinflip")) return;

    flipping = true;
    headsBtn.disabled = tailsBtn.disabled = true;
    msg.textContent = "Die Münze fliegt…";
    Sound.play("spin");

    const result = Math.random() < 0.5 ? "heads" : "tails";
    // Während des Flugs neutrale Seiten – Ergebnis ist noch nicht ablesbar
    front.textContent = "🪙";
    back.textContent = "✦";

    const spins = 4 + Math.floor(Math.random() * 3); // 4–6 volle Umdrehungen
    const endRot = spins * 360;                      // endet mit Vorderseite oben

    // Münze: Wurfbogen (translateY) + Drehung (rotateX), mit Aufprall-Hüpfer
    const anim = coin.animate([
      { transform: "translateY(0) rotateX(0deg) scale(1,1)",
        easing: "cubic-bezier(0.22,0.6,0.35,1)" },                    // Start: Aufstieg (verzögernd)
      { transform: `translateY(-${APEX}px) rotateX(${endRot * 0.55}deg) scale(1.06,1.06)`,
        offset: 0.42, easing: "cubic-bezier(0.55,0,0.85,0.45)" },     // Scheitel → Fall (beschleunigend)
      { transform: `translateY(0) rotateX(${endRot}deg) scale(1.12,0.88)`,
        offset: LAND, easing: "cubic-bezier(0.3,0.8,0.5,1)" },        // Aufprall (gestaucht)
      { transform: `translateY(-26px) rotateX(${endRot}deg) scale(0.97,1.03)`,
        offset: 0.9, easing: "cubic-bezier(0.4,0,0.6,1)" },           // kleiner Rückpraller
      { transform: `translateY(0) rotateX(${endRot}deg) scale(1,1)`,
        offset: 1 },                                                  // liegt still
    ], { duration: DUR, fill: "forwards" });

    // Schatten: klein & blass am Scheitelpunkt, groß & dunkel am Boden
    shadow.animate([
      { transform: "translateX(-50%) scale(1)",   opacity: 0.55 },
      { transform: "translateX(-50%) scale(0.45)", opacity: 0.15, offset: 0.42 },
      { transform: "translateX(-50%) scale(1.1)",  opacity: 0.6,  offset: LAND },
      { transform: "translateX(-50%) scale(0.92)", opacity: 0.5,  offset: 0.9 },
      { transform: "translateX(-50%) scale(1)",    opacity: 0.55 },
    ], { duration: DUR, fill: "forwards" });

    // Kurz vor der Landung Ergebnis auf der Oberseite aufdecken + Klimpern
    setTimeout(() => {
      front.textContent = FACE[result];
      Sound.play("coin");
    }, DUR * LAND);

    anim.onfinish = () => {
      const won = choice === result;
      Casino.settle(won ? bet * 2 : 0);
      if (won) {
        msg.textContent = `${LABEL[result]}! Gewonnen.`;
        Sound.play("win");
        toast(`+${bet} Credits!`, "win");
      } else {
        msg.textContent = `${LABEL[result]}. Verloren.`;
        Sound.play("lose");
        toast(`−${bet} Credits`, "lose");
      }
      flipping = false;
      headsBtn.disabled = tailsBtn.disabled = false;
    };
  }

  headsBtn.addEventListener("click", () => play("heads"));
  tailsBtn.addEventListener("click", () => play("tails"));
})();
