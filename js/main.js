/* ============================================================
   Neon Casino – Core: Guthaben, Statistik, Navigation, Persistenz
   ============================================================ */
const STORAGE_KEY = "neon-casino-v2";
const START_BALANCE = 1000;
const GAMES = ["slots", "roulette", "blackjack", "dice", "coinflip", "poker"];
const GAME_LABEL = {
  slots: "Slots", roulette: "Roulette", blackjack: "Blackjack",
  dice: "Dice", coinflip: "Coinflip", poker: "Video Poker",
};

const Casino = (() => {
  let state = load();
  let round = null; // { game, bet } der aktuell laufenden Runde

  function freshStats() {
    const perGame = {};
    for (const g of GAMES) perGame[g] = { plays: 0, net: 0 };
    return {
      balance: START_BALANCE,
      wagered: 0,      // insgesamt gesetzt
      returned: 0,     // insgesamt ausgezahlt
      spins: 0,        // Runden gesamt
      wins: 0,         // gewonnene Runden
      biggestWin: 0,   // größter Netto-Gewinn einer Runde
      peakBalance: START_BALANCE, // Highscore
      perGame,
    };
  }

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        // Fehlende Felder ergänzen (Vorwärtskompatibilität)
        return Object.assign(freshStats(), parsed,
          { perGame: Object.assign(freshStats().perGame, parsed.perGame || {}) });
      }
    } catch (_) {}
    return freshStats();
  }

  function save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (_) {}
  }

  function getBalance() { return state.balance; }
  function getState() { return state; }

  function canBet(amount) {
    return Number.isFinite(amount) && amount > 0 && amount <= state.balance;
  }

  /* Zieht den Einsatz ab und startet eine Runde. */
  function placeBet(amount, game) {
    if (!canBet(amount)) return false;
    state.balance -= amount;
    state.wagered += amount;
    state.spins += 1;
    if (state.perGame[game]) state.perGame[game].plays += 1;
    round = { game, bet: amount };
    render();
    save();
    return true;
  }

  /* Schließt die Runde ab. `prize` = gesamte Rückzahlung (0 = Verlust). */
  function settle(prize) {
    if (!round) return;
    prize = Math.max(0, Math.round(prize || 0));
    const net = prize - round.bet;

    state.balance += prize;
    state.returned += prize;
    if (prize > round.bet) state.wins += 1;
    if (net > state.biggestWin) state.biggestWin = net;
    if (state.balance > state.peakBalance) state.peakBalance = state.balance;
    if (state.perGame[round.game]) state.perGame[round.game].net += net;

    round = null;
    render();
    renderStats();
    save();
  }

  function reset() {
    state = freshStats();
    round = null;
    render();
    renderStats();
    save();
    toast("Guthaben zurückgesetzt: " + START_BALANCE + " Credits", null);
  }

  function render() {
    const el = document.getElementById("balance");
    el.textContent = Math.round(state.balance).toLocaleString("de-DE");
    el.style.color = "var(--green)";
    setTimeout(() => (el.style.color = "var(--gold)"), 200);
    const stat = document.getElementById("statLine");
    if (stat) stat.textContent =
      `Runden: ${state.spins} · Highscore: ${Math.round(state.peakBalance).toLocaleString("de-DE")}`;
  }

  return { getBalance, getState, canBet, placeBet, settle, reset, render };
})();

/* ---------- Statistik-Screen ---------- */
function renderStats() {
  const s = Casino.getState();
  const net = s.returned - s.wagered;
  const winRate = s.spins ? Math.round((s.wins / s.spins) * 100) : 0;
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  const fmt = n => Math.round(n).toLocaleString("de-DE");

  set("stBalance", fmt(s.balance));
  set("stPeak", fmt(s.peakBalance));
  set("stSpins", fmt(s.spins));
  set("stWinRate", winRate + " %");
  set("stBiggest", "+" + fmt(s.biggestWin));
  set("stWagered", fmt(s.wagered));

  const netEl = document.getElementById("stNet");
  if (netEl) {
    netEl.textContent = (net >= 0 ? "+" : "−") + fmt(Math.abs(net));
    netEl.className = "st-value " + (net >= 0 ? "pos" : "neg");
  }

  const tbody = document.getElementById("stPerGame");
  if (tbody) {
    tbody.innerHTML = GAMES.map(g => {
      const pg = s.perGame[g];
      const cls = pg.net > 0 ? "pos" : pg.net < 0 ? "neg" : "";
      const sign = pg.net > 0 ? "+" : pg.net < 0 ? "−" : "";
      return `<tr><td>${GAME_LABEL[g]}</td><td>${pg.plays}</td>` +
             `<td class="${cls}">${sign}${fmt(Math.abs(pg.net))}</td></tr>`;
    }).join("");
  }
}

/* ---------- Navigation ---------- */
function showScreen(name) {
  document.querySelectorAll(".screen").forEach(s => s.classList.toggle("active", s.id === name));
  document.querySelectorAll(".tab").forEach(t => t.classList.toggle("active", t.dataset.game === name));
  if (name === "stats") renderStats();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

document.getElementById("tabs").addEventListener("click", e => {
  const tab = e.target.closest(".tab");
  if (tab) { Sound.play("click"); showScreen(tab.dataset.game); }
});
document.querySelectorAll("[data-goto]").forEach(btn =>
  btn.addEventListener("click", () => { Sound.play("click"); showScreen(btn.dataset.goto); }));

document.getElementById("resetBtn").addEventListener("click", () => {
  if (confirm("Guthaben wirklich auf " + START_BALANCE + " Credits zurücksetzen?")) Casino.reset();
});

/* ---------- Einsatz-Stepper ---------- */
document.querySelectorAll("[data-bet-adjust]").forEach(btn => {
  btn.addEventListener("click", () => {
    const map = { slots: "slotsBet", roulette: "rouletteBet", bj: "bjBet",
                  dice: "diceBet", coinflip: "coinflipBet", poker: "pokerBet" };
    const input = document.getElementById(map[btn.dataset.betAdjust]);
    const delta = parseInt(btn.dataset.delta, 10);
    const val = Math.max(1, (parseInt(input.value, 10) || 0) + delta);
    input.value = val;
  });
});

/* ---------- Toast ---------- */
let toastTimer;
function toast(msg, type) {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.className = "toast show" + (type ? " " + type : "");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.className = "toast"), 2200);
}

/* Liest & validiert einen Einsatz aus einem Input-Feld. */
function readBet(inputId) {
  const amount = parseInt(document.getElementById(inputId).value, 10);
  if (!Number.isFinite(amount) || amount <= 0) {
    toast("Gib einen gültigen Einsatz ein.", "lose");
    return null;
  }
  if (amount > Casino.getBalance()) {
    toast("Nicht genug Credits!", "lose");
    return null;
  }
  return amount;
}

/* Initiales Rendern */
Casino.render();
renderStats();
