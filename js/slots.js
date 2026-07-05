/* ============================================================
   Slots
   ============================================================ */
(() => {
  const SYMBOLS = ["🍒", "🍋", "🔔", "⭐", "💎", "7️⃣"];
  const reels = [...document.querySelectorAll(".reel")];
  const msg = document.getElementById("slotsMsg");
  const spinBtn = document.getElementById("spinBtn");
  let spinning = false;

  function rand() { return SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)]; }

  function evaluate(result, bet) {
    const [a, b, c] = result;
    if (a === b && b === c) {
      const mult = a === "7️⃣" ? 20 : 8;
      return { win: bet * mult, text: `JACKPOT! 3× ${a} → ×${mult}` };
    }
    if (a === b || b === c || a === c) {
      return { win: bet * 2, text: "Zwei Gleiche → ×2" };
    }
    return { win: 0, text: "Kein Gewinn – nochmal!" };
  }

  spinBtn.addEventListener("click", () => {
    if (spinning) return;
    const bet = readBet("slotsBet");
    if (bet === null) return;
    if (!Casino.placeBet(bet, "slots")) return;

    spinning = true;
    spinBtn.disabled = true;
    Sound.play("spin");
    reels.forEach(r => { r.classList.add("spinning"); r.classList.remove("win"); });
    msg.textContent = "Dreht…";

    const result = reels.map(() => rand());
    // Walzen nacheinander stoppen
    reels.forEach((reel, i) => {
      const flicker = setInterval(() => (reel.textContent = rand()), 70);
      setTimeout(() => {
        clearInterval(flicker);
        reel.textContent = result[i];
        reel.classList.remove("spinning");
        if (i === reels.length - 1) finish(result, bet);
      }, 600 + i * 350);
    });
  });

  function finish(result, bet) {
    const { win, text } = evaluate(result, bet);
    msg.textContent = text;
    Casino.settle(win);
    if (win > 0) {
      reels.forEach(r => r.classList.add("win"));
      Sound.play(win >= bet * 8 ? "jackpot" : "win");
      toast(`+${win - bet} Credits!`, "win");
    } else {
      Sound.play("lose");
      toast(`−${bet} Credits`, "lose");
    }
    spinning = false;
    spinBtn.disabled = false;
  }
})();
