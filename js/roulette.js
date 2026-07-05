/* ============================================================
   Roulette (Europäisch, 0–36, eine grüne Null)
   ============================================================ */
(() => {
  const RED = new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36]);
  const wheel = document.getElementById("wheelNum");
  const msg = document.getElementById("rouletteMsg");
  const betButtons = [...document.querySelectorAll(".rbet")];
  let spinning = false;

  function colorOf(n) {
    if (n === 0) return "green";
    return RED.has(n) ? "red" : "black";
  }

  /* Prüft, ob die Wette gewinnt. */
  function wins(type, n, straightNum) {
    if (n === 0) return type === "straight" && straightNum === 0;
    switch (type) {
      case "red": return RED.has(n);
      case "black": return !RED.has(n);
      case "even": return n % 2 === 0;
      case "odd": return n % 2 === 1;
      case "low": return n >= 1 && n <= 18;
      case "high": return n >= 19 && n <= 36;
      case "straight": return n === straightNum;
    }
    return false;
  }

  const PAYOUT = { red:2, black:2, even:2, odd:2, low:2, high:2, straight:36 };

  function play(type) {
    if (spinning) return;
    const bet = readBet("rouletteBet");
    if (bet === null) return;

    let straightNum = null;
    if (type === "straight") {
      straightNum = parseInt(document.getElementById("straightNum").value, 10);
      if (!Number.isFinite(straightNum) || straightNum < 0 || straightNum > 36) {
        toast("Wähle eine Zahl von 0 bis 36.", "lose");
        return;
      }
    }
    if (!Casino.placeBet(bet, "roulette")) return;

    spinning = true;
    Sound.play("spin");
    betButtons.forEach(b => (b.disabled = true));
    wheel.className = "wheel spin";
    msg.textContent = "Die Kugel rollt…";

    const flicker = setInterval(() => (wheel.textContent = Math.floor(Math.random() * 37)), 60);
    const result = Math.floor(Math.random() * 37);

    setTimeout(() => {
      clearInterval(flicker);
      const color = colorOf(result);
      wheel.textContent = result;
      wheel.className = "wheel " + color;

      const won = wins(type, result, straightNum);
      const prize = won ? bet * PAYOUT[type] : 0;
      Casino.settle(prize);
      if (won) {
        msg.textContent = `${result} (${colorLabel(color)}) – Gewonnen!`;
        Sound.play(type === "straight" ? "jackpot" : "win");
        toast(`+${prize - bet} Credits!`, "win");
      } else {
        msg.textContent = `${result} (${colorLabel(color)}) – Verloren.`;
        Sound.play("lose");
        toast(`−${bet} Credits`, "lose");
      }
      spinning = false;
      betButtons.forEach(b => (b.disabled = false));
    }, 1600);
  }

  function colorLabel(c) { return c === "red" ? "Rot" : c === "black" ? "Schwarz" : "Grün"; }

  document.getElementById("rouletteBets").addEventListener("click", e => {
    const btn = e.target.closest(".rbet");
    if (btn) play(btn.dataset.type);
  });
  document.querySelector(".rbet.straight").addEventListener("click", () => play("straight"));
})();
