/* ============================================================
   Coinflip – Kopf oder Zahl, 50:50, Auszahlung ×2
   ============================================================ */
(() => {
  const coin = document.getElementById("coin");
  const msg = document.getElementById("coinMsg");
  const headsBtn = document.getElementById("headsBtn");
  const tailsBtn = document.getElementById("tailsBtn");
  let flipping = false;

  function play(choice) {
    if (flipping) return;
    const bet = readBet("coinflipBet");
    if (bet === null) return;
    if (!Casino.placeBet(bet, "coinflip")) return;

    flipping = true;
    headsBtn.disabled = tailsBtn.disabled = true;
    coin.classList.add("flipping");
    Sound.play("spin");
    msg.textContent = "Münze fliegt…";

    const result = Math.random() < 0.5 ? "heads" : "tails";
    const flicker = setInterval(() => (coin.textContent = coin.textContent === "🪙" ? "🟡" : "🪙"), 90);

    setTimeout(() => {
      clearInterval(flicker);
      coin.classList.remove("flipping");
      coin.textContent = result === "heads" ? "👑" : "🔢";
      const label = result === "heads" ? "Kopf" : "Zahl";

      const won = choice === result;
      Casino.settle(won ? bet * 2 : 0);
      if (won) {
        msg.textContent = `${label}! Gewonnen.`;
        Sound.play("win");
        toast(`+${bet} Credits!`, "win");
      } else {
        msg.textContent = `${label}. Verloren.`;
        Sound.play("lose");
        toast(`−${bet} Credits`, "lose");
      }
      flipping = false;
      headsBtn.disabled = tailsBtn.disabled = false;
    }, 900);
  }

  headsBtn.addEventListener("click", () => play("heads"));
  tailsBtn.addEventListener("click", () => play("tails"));
})();
