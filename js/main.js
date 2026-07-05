/* ============================================================
   Neon Casino – Core: Guthaben, Navigation, Persistenz
   ============================================================ */
const STORAGE_KEY = "neon-casino-v1";
const START_BALANCE = 1000;

const Casino = (() => {
  let state = load();

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return JSON.parse(raw);
    } catch (_) {}
    return { balance: START_BALANCE, wagered: 0, wins: 0, spins: 0 };
  }

  function save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (_) {}
  }

  function getBalance() { return state.balance; }

  /* Prüft, ob ein Einsatz gültig ist. */
  function canBet(amount) {
    return Number.isFinite(amount) && amount > 0 && amount <= state.balance;
  }

  /* Zieht den Einsatz ab. Gibt false zurück, wenn ungültig. */
  function placeBet(amount) {
    if (!canBet(amount)) return false;
    state.balance -= amount;
    state.wagered += amount;
    state.spins += 1;
    render();
    save();
    return true;
  }

  /* Zahlt einen Gewinn (inkl. Einsatz, falls gewünscht) aus. */
  function payout(amount) {
    if (amount > 0) {
      state.balance += amount;
      state.wins += 1;
    }
    render();
    save();
  }

  /* Erstattet einen Einsatz (z. B. Push beim Blackjack). */
  function refund(amount) {
    state.balance += amount;
    render();
    save();
  }

  function reset() {
    state = { balance: START_BALANCE, wagered: 0, wins: 0, spins: 0 };
    render();
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
      `Runden: ${state.spins} · Einsatz gesamt: ${Math.round(state.wagered).toLocaleString("de-DE")}`;
  }

  return { getBalance, canBet, placeBet, payout, refund, reset, render };
})();

/* ---------- Navigation ---------- */
function showScreen(name) {
  document.querySelectorAll(".screen").forEach(s => s.classList.toggle("active", s.id === name));
  document.querySelectorAll(".tab").forEach(t => t.classList.toggle("active", t.dataset.game === name));
  window.scrollTo({ top: 0, behavior: "smooth" });
}

document.getElementById("tabs").addEventListener("click", e => {
  const tab = e.target.closest(".tab");
  if (tab) showScreen(tab.dataset.game);
});
document.querySelectorAll("[data-goto]").forEach(btn =>
  btn.addEventListener("click", () => showScreen(btn.dataset.goto)));

document.getElementById("resetBtn").addEventListener("click", () => {
  if (confirm("Guthaben wirklich auf " + START_BALANCE + " Credits zurücksetzen?")) Casino.reset();
});

/* ---------- Einsatz-Stepper (für alle Spiele) ---------- */
document.querySelectorAll("[data-bet-adjust]").forEach(btn => {
  btn.addEventListener("click", () => {
    const map = { slots: "slotsBet", roulette: "rouletteBet", bj: "bjBet", dice: "diceBet" };
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
