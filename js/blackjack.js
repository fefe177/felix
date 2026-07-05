/* ============================================================
   Blackjack (Dealer steht bei 17, Blackjack zahlt 3:2)
   ============================================================ */
(() => {
  const SUITS = [
    { s: "♠", red: false }, { s: "♣", red: false },
    { s: "♥", red: true },  { s: "♦", red: true },
  ];
  const RANKS = ["A","2","3","4","5","6","7","8","9","10","J","Q","K"];

  const dealerCardsEl = document.getElementById("dealerCards");
  const playerCardsEl = document.getElementById("playerCards");
  const dealerScoreEl = document.getElementById("dealerScore");
  const playerScoreEl = document.getElementById("playerScore");
  const msg = document.getElementById("bjMsg");
  const dealBtn = document.getElementById("dealBtn");
  const hitBtn = document.getElementById("hitBtn");
  const standBtn = document.getElementById("standBtn");

  let deck = [], player = [], dealer = [], bet = 0, inRound = false;

  function buildDeck() {
    deck = [];
    for (const suit of SUITS)
      for (const rank of RANKS)
        deck.push({ rank, ...suit });
    // Fisher-Yates
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
  }

  function draw() { return deck.pop(); }

  function handValue(hand) {
    let total = 0, aces = 0;
    for (const c of hand) {
      if (c.rank === "A") { aces++; total += 11; }
      else if (["K","Q","J"].includes(c.rank)) total += 10;
      else total += parseInt(c.rank, 10);
    }
    while (total > 21 && aces > 0) { total -= 10; aces--; }
    return total;
  }

  function cardHTML(c, faceDown) {
    if (faceDown) return `<div class="card back"></div>`;
    const cls = c.red ? "card red" : "card";
    return `<div class="${cls}"><span class="rank-t">${c.rank}${c.s}</span>` +
           `<span class="rank-b">${c.rank}${c.s}</span></div>`;
  }

  function render(hideHole) {
    playerCardsEl.innerHTML = player.map(c => cardHTML(c, false)).join("");
    dealerCardsEl.innerHTML = dealer
      .map((c, i) => cardHTML(c, hideHole && i === 1)).join("");
    playerScoreEl.textContent = "(" + handValue(player) + ")";
    dealerScoreEl.textContent = hideHole ? "" : "(" + handValue(dealer) + ")";
  }

  function setActions(dealing) {
    dealBtn.disabled = dealing;
    hitBtn.disabled = !dealing;
    standBtn.disabled = !dealing;
    document.getElementById("bjBet").disabled = dealing;
  }

  function startRound() {
    if (inRound) return;
    bet = readBet("bjBet");
    if (bet === null) return;
    if (!Casino.placeBet(bet)) return;

    buildDeck();
    player = [draw(), draw()];
    dealer = [draw(), draw()];
    inRound = true;
    msg.className = "bj-msg";
    setActions(true);
    render(true);

    // Sofortiger Blackjack?
    if (handValue(player) === 21) stand();
    else msg.textContent = "Hit oder Stand?";
  }

  function hit() {
    if (!inRound) return;
    player.push(draw());
    render(true);
    if (handValue(player) > 21) {
      finish("bust");
    }
  }

  function stand() {
    if (!inRound) return;
    // Dealer zieht bis mindestens 17
    while (handValue(dealer) < 17) dealer.push(draw());
    finish("stand");
  }

  function finish(reason) {
    inRound = false;
    setActions(false);
    render(false);

    const p = handValue(player), d = handValue(dealer);
    const playerBJ = p === 21 && player.length === 2;
    let outcome, prize = 0;

    if (reason === "bust") {
      outcome = "lose";
    } else if (playerBJ && !(d === 21 && dealer.length === 2)) {
      outcome = "blackjack";
      prize = Math.round(bet * 2.5); // 3:2 + Einsatz zurück
    } else if (d > 21 || p > d) {
      outcome = "win";
      prize = bet * 2;
    } else if (p === d) {
      outcome = "push";
      prize = bet; // Einsatz zurück
    } else {
      outcome = "lose";
    }

    if (prize > 0) Casino.payout(prize);

    switch (outcome) {
      case "blackjack":
        msg.textContent = `Blackjack! +${prize - bet} Gewinn`;
        msg.className = "bj-msg win"; toast(`Blackjack! +${prize - bet}`, "win"); break;
      case "win":
        msg.textContent = `Gewonnen! (${p} vs ${d}) +${prize - bet}`;
        msg.className = "bj-msg win"; toast(`+${prize - bet} Credits!`, "win"); break;
      case "push":
        msg.textContent = `Unentschieden (${p} vs ${d}) – Einsatz zurück`;
        msg.className = "bj-msg push"; toast("Push – Einsatz zurück", null); break;
      case "lose":
        msg.textContent = p > 21
          ? `Überkauft mit ${p}! Verloren.`
          : `Verloren (${p} vs ${d}).`;
        msg.className = "bj-msg lose"; toast(`−${bet} Credits`, "lose"); break;
    }
  }

  dealBtn.addEventListener("click", startRound);
  hitBtn.addEventListener("click", hit);
  standBtn.addEventListener("click", stand);
})();
