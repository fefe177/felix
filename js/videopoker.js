/* ============================================================
   Video Poker – Jacks or Better
   Deal → Karten halten → Tauschen → Bewertung
   ============================================================ */
(() => {
  const SUITS = [
    { s: "♠", red: false }, { s: "♣", red: false },
    { s: "♥", red: true },  { s: "♦", red: true },
  ];
  const RANKS = ["2","3","4","5","6","7","8","9","10","J","Q","K","A"];
  const VALUE = { "2":2,"3":3,"4":4,"5":5,"6":6,"7":7,"8":8,"9":9,"10":10,"J":11,"Q":12,"K":13,"A":14 };

  const PAYTABLE = [
    { name: "Royal Flush",    mult: 250 },
    { name: "Straight Flush", mult: 50 },
    { name: "Vierling",       mult: 25 },
    { name: "Full House",     mult: 9 },
    { name: "Flush",          mult: 6 },
    { name: "Straße",         mult: 4 },
    { name: "Drilling",       mult: 3 },
    { name: "Zwei Paare",     mult: 2 },
    { name: "Buben o. besser",mult: 1 },
  ];

  const slots = [...document.querySelectorAll("#pokerCards .pk-slot")];
  const cardEls = slots.map(s => s.querySelector(".card"));
  const holdBtns = slots.map(s => s.querySelector(".hold-btn"));
  const msg = document.getElementById("pokerMsg");
  const dealBtn = document.getElementById("pokerDealBtn");
  const drawBtn = document.getElementById("pokerDrawBtn");

  let deck = [], hand = [], held = [false,false,false,false,false];
  let bet = 0, phase = "idle"; // idle | draw

  function buildDeck() {
    deck = [];
    for (const suit of SUITS)
      for (const rank of RANKS)
        deck.push({ rank, ...suit });
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
  }

  function renderCard(i) {
    const c = hand[i];
    const el = cardEls[i];
    el.className = "card" + (c.red ? " red" : "") + (held[i] ? " held" : "");
    el.innerHTML = `<span class="rank-t">${c.rank}${c.s}</span>` +
                   `<span class="rank-b">${c.rank}${c.s}</span>`;
    holdBtns[i].classList.toggle("active", held[i]);
    holdBtns[i].textContent = held[i] ? "GEHALTEN" : "HALTEN";
  }

  /* Bewertet eine 5-Karten-Hand → { name, mult } (mult 0 = kein Gewinn). */
  function evaluate(cards) {
    const values = cards.map(c => VALUE[c.rank]).sort((a, b) => a - b);
    const suits = cards.map(c => c.s);
    const isFlush = suits.every(s => s === suits[0]);

    // Straße (inkl. Ass-tief A-2-3-4-5)
    const uniq = [...new Set(values)];
    let isStraight = false;
    if (uniq.length === 5) {
      if (values[4] - values[0] === 4) isStraight = true;
      if (values.join(",") === "2,3,4,5,14") isStraight = true; // A-2-3-4-5
    }
    const isRoyal = isStraight && isFlush && values[0] === 10 && values[4] === 14;

    // Ränge zählen
    const counts = {};
    for (const v of values) counts[v] = (counts[v] || 0) + 1;
    const groups = Object.entries(counts).sort((a, b) => b[1] - a[1] || b[0] - a[0]);
    const shape = groups.map(g => g[1]).join(""); // z. B. "41", "32", "221"

    if (isRoyal) return { name: "Royal Flush", mult: 250 };
    if (isStraight && isFlush) return { name: "Straight Flush", mult: 50 };
    if (shape === "41") return { name: "Vierling", mult: 25 };
    if (shape === "32") return { name: "Full House", mult: 9 };
    if (isFlush) return { name: "Flush", mult: 6 };
    if (isStraight) return { name: "Straße", mult: 4 };
    if (shape === "311") return { name: "Drilling", mult: 3 };
    if (shape === "221") return { name: "Zwei Paare", mult: 2 };
    // Ein Paar: nur Buben oder besser (J,Q,K,A = 11..14)
    if (shape === "2111" && parseInt(groups[0][0], 10) >= 11)
      return { name: "Buben o. besser", mult: 1 };
    return { name: "Keine Wertung", mult: 0 };
  }

  function setHoldEnabled(on) {
    holdBtns.forEach(b => (b.disabled = !on));
  }

  function deal() {
    if (phase === "draw") return;
    bet = readBet("pokerBet");
    if (bet === null) return;
    if (!Casino.placeBet(bet, "poker")) return;

    Sound.play("deal");
    buildDeck();
    hand = [deck.pop(), deck.pop(), deck.pop(), deck.pop(), deck.pop()];
    held = [false,false,false,false,false];
    hand.forEach((_, i) => renderCard(i));
    setHoldEnabled(true);
    phase = "draw";
    dealBtn.disabled = true;
    drawBtn.disabled = false;
    msg.className = "poker-msg";
    msg.textContent = "Karten zum Halten wählen, dann Tauschen.";
  }

  function draw() {
    if (phase !== "draw") return;
    // Nicht gehaltene Karten ersetzen
    for (let i = 0; i < 5; i++) {
      if (!held[i]) { hand[i] = deck.pop(); renderCard(i); }
    }
    setHoldEnabled(false);
    phase = "idle";
    dealBtn.disabled = false;
    drawBtn.disabled = true;

    const res = evaluate(hand);
    const prize = bet * res.mult;
    Casino.settle(prize);
    if (res.mult > 0) {
      msg.className = "poker-msg win";
      msg.textContent = `${res.name}! ×${res.mult} → +${prize - bet}`;
      Sound.play(res.mult >= 25 ? "jackpot" : "win");
      toast(`${res.name}! +${prize - bet}`, "win");
    } else {
      msg.className = "poker-msg lose";
      msg.textContent = `${res.name}. Verloren.`;
      Sound.play("lose");
      toast(`−${bet} Credits`, "lose");
    }
  }

  holdBtns.forEach((btn, i) => btn.addEventListener("click", () => {
    if (phase !== "draw") return;
    held[i] = !held[i];
    renderCard(i);
    Sound.play("click");
  }));

  dealBtn.addEventListener("click", deal);
  drawBtn.addEventListener("click", draw);
})();
