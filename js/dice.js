/* ============================================================
   Dice (Over/Under, 1–100, 1% Hausvorteil)
   ============================================================ */
(() => {
  const HOUSE_EDGE = 0.99; // 1 % Hausvorteil
  const slider = document.getElementById("diceSlider");
  const targetEl = document.getElementById("diceTarget");
  const chanceEl = document.getElementById("diceChance");
  const payoutEl = document.getElementById("dicePayout");
  const face = document.getElementById("diceFace");
  const rollNum = document.getElementById("diceRollNum");
  const msg = document.getElementById("diceMsg");
  const rollBtn = document.getElementById("rollBtn");
  const modeUnder = document.getElementById("modeUnder");
  const modeOver = document.getElementById("modeOver");

  let mode = "under";
  let rolling = false;

  /* Gewinnchance in Prozent (ganze Zahlen 1–100). */
  function winChance() {
    const t = parseInt(slider.value, 10);
    // Under: gewinnt bei roll < t  →  (t-1) Zahlen
    // Over:  gewinnt bei roll > t  →  (100-t) Zahlen
    return mode === "under" ? t - 1 : 100 - t;
  }

  function payoutMult() {
    const chance = winChance();
    if (chance <= 0) return 0;
    return (100 / chance) * HOUSE_EDGE;
  }

  function updateStats() {
    const chance = winChance();
    targetEl.textContent = slider.value;
    chanceEl.textContent = chance + "%";
    payoutEl.textContent = "×" + payoutMult().toFixed(2);
  }

  function setMode(m) {
    mode = m;
    modeUnder.classList.toggle("active", m === "under");
    modeOver.classList.toggle("active", m === "over");
    updateStats();
  }

  slider.addEventListener("input", updateStats);
  modeUnder.addEventListener("click", () => setMode("under"));
  modeOver.addEventListener("click", () => setMode("over"));

  rollBtn.addEventListener("click", () => {
    if (rolling) return;
    const bet = readBet("diceBet");
    if (bet === null) return;
    const mult = payoutMult();
    if (mult <= 0) { toast("Ungültiges Ziel.", "lose"); return; }
    if (!Casino.placeBet(bet)) return;

    rolling = true;
    rollBtn.disabled = true;
    face.classList.add("rolling");
    msg.textContent = "Würfelt…";
    rollNum.textContent = "";

    const flicker = setInterval(() =>
      (rollNum.textContent = Math.floor(Math.random() * 100) + 1), 50);
    const result = Math.floor(Math.random() * 100) + 1;
    const t = parseInt(slider.value, 10);

    setTimeout(() => {
      clearInterval(flicker);
      face.classList.remove("rolling");
      rollNum.textContent = result;

      const won = mode === "under" ? result < t : result > t;
      if (won) {
        const prize = Math.floor(bet * mult);
        Casino.payout(prize);
        msg.textContent = `${result} — ${mode === "under" ? "unter" : "über"} ${t}. Gewonnen!`;
        toast(`+${prize - bet} Credits!`, "win");
      } else {
        msg.textContent = `${result} — daneben. Verloren.`;
        toast(`−${bet} Credits`, "lose");
      }
      rolling = false;
      rollBtn.disabled = false;
    }, 900);
  });

  updateStats();
})();
