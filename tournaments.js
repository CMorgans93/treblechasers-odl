// public/tournaments.js
// Tournament submissions + leaderboard + Members Swiss Cup
//
// Tournament rules:
// - Formats: 501/301/701 (no Cricket)
// - Draws allowed in BEST OF only, if all scheduled legs are played
// - First to always resolves (no draws)
// - Caps: bestOf<=64, firstTo<=32
// - Round bonuses: R64+5 R32+8 R16+12 QF+18 SF+25 Finalist+35 (both) Champion+50 (winner)
// - Disconnect: normal scoring +10 to disconnected player if they lose (didn't advance)
// - Bye: admin confirm: 5 + round bonus
//
// Members Swiss Cup:
// - Submission type: "swiss"
// - Round is hidden (not used)
// - Points: 3 points per leg (ONLY) FOR LEADERBOARD VIEW
// - Swiss leaderboard view shows ALL members (even 0 games)
// - Expand row shows Played + Remaining opponents (everyone plays each other once)
// - Clicking a name in Swiss opens modal with played fixtures + remaining opponents
//
// Key behaviour:
// - Swiss submissions SAVE normal match points (same as tournament core points, no round/champ/disconnect)
// - Swiss leaderboard CONVERTS to 3 pts per leg won (ignores stored points)

import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.0.1/firebase-app.js';
import {
  getFirestore,
  collection,
  getDocs,
  addDoc,
  updateDoc,
  doc,
  serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js';
import { getAuth, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js';
import { getAnalytics, isSupported } from 'https://www.gstatic.com/firebasejs/11.0.1/firebase-analytics.js';

// ---------- Firebase init ----------
const firebaseConfig = {
  apiKey: "AIzaSyAg464NVVk_o7Dwj5lbXbrM03Vdrwm_uFM",
  authDomain: "treblechasersodl-9e9bc.firebaseapp.com",
  projectId: "treblechasersodl-9e9bc",
  storageBucket: "treblechasersodl-9e9bc.firebasestorage.app",
  messagingSenderId: "346894011277",
  appId: "1:346894011277:web:821ae37d1b34a323b10bc4",
  measurementId: "G-BNFG4TJ9MX",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

isSupported().then((ok) => {
  if (ok && location.protocol === 'https:') getAnalytics(app);
});

// ✅ Create collection refs once
const usersCol = collection(db, 'users');
const tourMatchesCol = collection(db, 'tournaments', 'global', 'matches');

// ---------- DOM refs ----------
const needLoginBox = document.getElementById('needLoginBox');
const tourTableBody = document.getElementById('tourTableBody');
const updatedMeta = document.getElementById('updatedMeta');
const errorMeta = document.getElementById('errorMeta');
const inboxCountEl = document.getElementById('inboxCount');

const btnSubmit = document.getElementById('btnSubmit');
const submitModal = document.getElementById('submitModal');

const btnInbox = document.getElementById('btnInbox');
const inboxModal = document.getElementById('inboxModal');
const inboxList = document.getElementById('inboxList');

const btnFindMe = document.getElementById('btnFindMe');
const btnRules = document.getElementById('btnRules');
const rulesModal = document.getElementById('rulesModal');

const formatChip = document.getElementById('formatChip');

// view toggles
const btnViewTour = document.getElementById('btnViewTour');
const btnViewSwiss = document.getElementById('btnViewSwiss');

// swiss fixtures modal
const swissFixturesModal = document.getElementById('swissFixturesModal');
const swissFixturesTitle = document.getElementById('swissFixturesTitle');
const swissFixturesList = document.getElementById('swissFixturesList');
const swissFixturesCount = document.getElementById('swissFixturesCount');

// Submit UI
const tourSubmissionType = document.getElementById('tourSubmissionType');
const tourTypeNote = document.getElementById('tourTypeNote');

const tourRoundWrap = document.getElementById('tourRoundWrap');
const tourRound = document.getElementById('tourRound');
const tourRoundNote = document.getElementById('tourRoundNote');

const tourOpponentWrap = document.getElementById('tourOpponentWrap');
const tourOpponentSearch = document.getElementById('tourOpponentSearch');
const tourOpponent = document.getElementById('tourOpponent');

const tourDisconnectByWrap = document.getElementById('tourDisconnectByWrap');
const tourDisconnectBy = document.getElementById('tourDisconnectBy');

const tourGameWrap = document.getElementById('tourGameWrap');
const tourGameType = document.getElementById('tourGameType');
const tourLengthMode = document.getElementById('tourLengthMode');
const tourTarget = document.getElementById('tourTarget');
const tourDido = document.getElementById('tourDido');
const tourRuleNote = document.getElementById('tourRuleNote');

const tourScoreWrap = document.getElementById('tourScoreWrap');
const tourScoreHelp = document.getElementById('tourScoreHelp');
const tourMyLegs = document.getElementById('tourMyLegs');
const tourOppLegs = document.getElementById('tourOppLegs');

const tourBonusWrap = document.getElementById('tourBonusWrap');
const tourAvgWrap = document.getElementById('tourAvgWrap');

const tourMy171 = document.getElementById('tourMy171');
const tourMy100 = document.getElementById('tourMy100');
const tourMyBull = document.getElementById('tourMyBull');
const tourMyDD = document.getElementById('tourMyDD');

const tourOpp171 = document.getElementById('tourOpp171');
const tourOpp100 = document.getElementById('tourOpp100');
const tourOppBull = document.getElementById('tourOppBull');
const tourOppDD = document.getElementById('tourOppDD');

const tourMyAvg = document.getElementById('tourMyAvg');
const tourOppAvg = document.getElementById('tourOppAvg');

const tourSubmitBtn = document.getElementById('tourSubmitBtn');
const tourSubmitNote = document.getElementById('tourSubmitNote');
const tourTotalsMine = document.getElementById('tourTotalsMine');
const tourTotalsOpp = document.getElementById('tourTotalsOpp');

// ---------- modal helpers ----------
function openModal(el) {
  if (!el) return;
  el.classList.add('open');
  document.body.classList.add('modal-open');
}
function closeModal(el) {
  if (!el) return;
  el.classList.remove('open');
  if (!document.querySelector('.modal-overlay.open')) {
    document.body.classList.remove('modal-open');
  }
}
document.addEventListener('click', (e) => {
  const closeBtn = e.target.closest('.modal .close');
  if (closeBtn) {
    const ov = closeBtn.closest('.modal-overlay');
    if (ov) closeModal(ov);
  }
  const overlay = e.target.closest('.modal-overlay');
  if (overlay && !e.target.closest('.modal')) closeModal(overlay);
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') document.querySelectorAll('.modal-overlay.open').forEach((m) => closeModal(m));
});

// ---------- utils ----------
const int = (v) => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : 0;
};
const flt = (v) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : null;
};
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
function setText(el, txt) { if (el) el.textContent = txt; }
function safeName(u) { return (u?.displayName || u?.name || '').trim() || 'Unknown'; }
function fmtDate(ts) {
  try {
    if (!ts) return '';
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleString();
  } catch { return ''; }
}
function normalizeDivision(raw) {
  if (!raw) return '';
  return String(raw).replace(/division/i, '').replace(/"/g, '').trim();
}
function divisionLabel(raw) {
  const n = normalizeDivision(raw);
  return n ? `Div ${n}` : '-';
}
function getDivNum(u) {
  const n = parseInt(normalizeDivision(u?.division), 10);
  return Number.isFinite(n) ? n : 10;
}
function isAdminDoc(u) { return u?.role === 'admin' || u?.isAdmin === true; }
function isMemberUser(u) {
  return (u?.role === 'admin' || u?.isMember === true || u?.isMember === 'true' || u?.isMember === 1);
}

// ---------- status labels (Swiss modal) ----------
function matchStatusLabel(m) {
  if (!m) return 'Pending';
  if (m.status === 'rejected') return 'Rejected';
  if (m.status === 'disputed') return 'Disputed';
  if (m.status === 'confirmed' || m.locked === true) return 'Confirmed';
  return 'Pending';
}
function matchStatusClass(m) {
  if (!m) return 'warn';
  if (m.status === 'rejected') return 'err';
  if (m.status === 'disputed') return 'warn';
  if (m.status === 'confirmed' || m.locked === true) return 'ok';
  return 'warn';
}

// ---------- scoring tables (TOURNAMENT) ----------
const multipliers = {
  1: { 2:0,3:0,4:0,5:0,6:0,7:0,8:0,9:0,10:0 },
  2: { 1:1.1 },
  3: { 1:1.25, 2:1.1 },
  4: { 1:1.5, 2:1.25, 3:1.1 },
  5: { 1:1.75, 2:1.5, 3:1.25, 4:1.1 },
  6: { 1:2, 2:1.75, 3:1.5, 4:1.25, 5:1.1 },
  7: { 1:2.25, 2:2, 3:1.75, 4:1.5, 5:1.25, 6:1.1 },
  8: { 1:2.5, 2:2.25, 3:2, 4:1.75, 5:1.5, 6:1.25, 7:1.1 },
  9: { 1:2.5, 2:2.25, 3:2, 4:1.75, 5:1.5, 6:1.25, 7:1.1, 8:1.0 },
  10:{ 1:2.5, 2:2.25, 3:2, 4:1.75, 5:1.5, 6:1.25, 7:1.1, 8:1.0 }
};
const legPenalties = {
  1: { 2:1, 3:1, 4:2, 5:2, 6:3, 7:4, 8:5, 9:6, 10:7 },
  2: { 3:1, 4:1, 5:2, 6:2, 7:3, 8:4, 9:5, 10:6 },
  3: { 4:1, 5:1, 6:2, 7:2, 8:3, 9:4, 10:5 },
  4: { 5:1, 6:1, 7:2, 8:2, 9:3, 10:4 },
  5: { 6:1, 7:1, 8:2, 9:2, 10:3 },
  6: { 7:1, 8:1, 9:2, 10:2 },
  7: { 8:1, 9:1, 10:2 },
  8: { 9:1, 10:1 },
  9: {},
  10: {}
};
function getMultiplier(myDiv, theirDiv) {
  const m = multipliers[myDiv]?.[theirDiv];
  return m ? m : 1;
}
function getLegPenaltyPerLost(myDiv, theirDiv) {
  const p = legPenalties[myDiv]?.[theirDiv];
  return Number.isFinite(p) ? p : 0;
}

// Tournament formats
const formatRules = {
  '501': { legPts: 5 },
  '301': { legPts: 3 },
  '701': { legPts: 7 },
};

// Round bonuses
const roundBonuses = { r64: 5, r32: 8, r16: 12, qf: 18, sf: 25, final: 35 };
const CHAMPION_BONUS = 50;
const BYE_BONUS = 5;
const DISCONNECT_LOSER_BONUS = 10;
const DRAW_BASE_POINTS = 15;

// Swiss
const SWISS_LEG_POINTS = 3;

// ---------- match-type helpers ----------
function submissionTypeOf(m) { return String(m?.submissionType || 'match'); }
function isBye(m) { return submissionTypeOf(m) === 'bye'; }
function isSwissMatch(m) { return m?.swissCup === true; }

// ---------- tournament validation ----------
function maxTargetForMode(mode) {
  return mode === 'firstTo' ? 32 : 64;
}

function validateTournamentRules(gameType, lengthMode, target) {
  const gt = String(gameType || '501');
  if (!formatRules[gt]) return { ok: false, msg: 'Invalid format. Use 501/301/701.' };

  const tMax = maxTargetForMode(lengthMode);
  const t = clamp(int(target), 1, tMax);

  if (lengthMode === 'bestOf') {
    if (t > 64) return { ok: false, msg: 'Best of cannot exceed 64.' };
  } else {
    if (t > 32) return { ok: false, msg: 'First to cannot exceed 32 (max 63 total legs).' };
  }

  return { ok: true, msg: '', target: t };
}

function validateTournamentScore(lengthMode, target, myLegs, oppLegs) {
  const t = clamp(int(target), 1, maxTargetForMode(lengthMode));
  const M = int(myLegs);
  const O = int(oppLegs);
  const total = M + O;

  if (M < 0 || O < 0) return { ok: false, msg: 'Legs must be 0 or more.' };
  if (total === 0) return { ok: false, msg: 'Enter a score.' };

  if (lengthMode === 'bestOf') {
    if (total > t) return { ok: false, msg: `Best of ${t}: total legs must be ≤ ${t}.` };

    if (M === O) {
      if (total !== t) return { ok: false, msg: `Draws are only valid when all ${t} scheduled legs are played.` };
      return { ok: true, msg: '' };
    }

    const winTo = Math.floor(t / 2) + 1;
    const someoneWon = (M >= winTo && M > O) || (O >= winTo && O > M);
    if (!someoneWon) return { ok: false, msg: `Best of ${t}: result is incomplete.` };
  } else {
    if (M === O) return { ok: false, msg: `First to ${t}: draws are not allowed.` };

    const someoneWon = (M === t && M > O) || (O === t && O > M);
    if (!someoneWon) return { ok: false, msg: `First to ${t}: one player must reach ${t}.` };
    if (total > (2 * t - 1)) return { ok: false, msg: `First to ${t}: total legs too high.` };
  }

  return { ok: true, msg: '' };
}

function getOutcome(myLegs, oppLegs) {
  const M = int(myLegs);
  const O = int(oppLegs);
  if (M > O) return 'win';
  if (M < O) return 'loss';
  return 'draw';
}

// ---------- form avg ----------
function isConfirmed(m) { return m.locked === true || m.status === 'confirmed'; }

function computeRecentFormAvg(uid) {
  const mine = cachedMatches
    .filter((m) => isConfirmed(m) && !isBye(m) && !isSwissMatch(m) && (m.p1 === uid || m.p2 === uid))
    .sort((a, b) => {
      const da = a.confirmedAt?.toMillis ? a.confirmedAt.toMillis() : (a.reportedAt?.toMillis ? a.reportedAt.toMillis() : 0);
      const db = b.confirmedAt?.toMillis ? b.confirmedAt.toMillis() : (b.reportedAt?.toMillis ? b.reportedAt.toMillis() : 0);
      return db - da;
    });

  const avgs = [];
  for (const m of mine) {
    if (m.p1 === uid && typeof m.p1Avg === 'number') avgs.push(m.p1Avg);
    if (m.p2 === uid && typeof m.p2Avg === 'number') avgs.push(m.p2Avg);
    if (avgs.length >= 8) break;
  }
  if (!avgs.length) return null;
  return avgs.reduce((a, b) => a + b, 0) / avgs.length;
}

// ---------- points ----------
function computeCorePoints({
  gameType, dido, myLegs, oppLegs, myDiv, oppDiv,
  bonus171 = 0, bonus100 = 0, bonusBull = 0, bonusDD = 0,
  myAvg = null, myFpAvg = null, myFormAvg = null
}) {
  const rules = formatRules[String(gameType) || '501'] || formatRules['501'];
  const M = int(myLegs);
  const O = int(oppLegs);
  const outcome = getOutcome(M, O);

  const base =
    outcome === 'win' ? 30 :
    outcome === 'loss' ? 5 :
    DRAW_BASE_POINTS;

  let legPts = rules.legPts * M;
  if (dido) legPts *= 2;

  const b171 = clamp(int(bonus171), 0, 10);
  const b100 = clamp(int(bonus100), 0, 10);
  const bBull = clamp(int(bonusBull), 0, 10);
  const bDD = clamp(int(bonusDD), 0, 10);
  const bonusTotal = 10 * (b171 + b100 + bBull + bDD);

  const mult = getMultiplier(myDiv, oppDiv);
  const legPenalty = getLegPenaltyPerLost(myDiv, oppDiv) * O;

  const preMult = base + legPts + bonusTotal;
  const afterMult = Math.round(preMult * mult);

  let avgBonus = 0;
  if (typeof myAvg === 'number' && typeof myFpAvg === 'number' && myAvg > myFpAvg) {
    avgBonus = Math.floor(myAvg - myFpAvg);
  }
  let formBonus = 0;
  if (typeof myAvg === 'number' && typeof myFormAvg === 'number' && myAvg > myFormAvg) {
    formBonus = Math.floor(myAvg - myFormAvg);
  }

  let total = afterMult - legPenalty + avgBonus + formBonus;
  if (total < 0) total = 0;

  return { total, meta: { outcome } };
}

function computeRoundBonusSplit(roundKey, p1Legs, p2Legs) {
  const r = String(roundKey || 'r64');
  const isFinal = r === 'final';
  const outcome = getOutcome(p1Legs, p2Legs);

  if (outcome === 'draw') {
    return {
      isFinal,
      winner: null,
      p1RoundBonus: isFinal ? roundBonuses.final : 0,
      p2RoundBonus: isFinal ? roundBonuses.final : 0,
      p1ChampionBonus: 0,
      p2ChampionBonus: 0,
    };
  }

  const p1Win = outcome === 'win';
  const winner = p1Win ? 'p1' : 'p2';

  if (isFinal) {
    return {
      isFinal: true,
      winner,
      p1RoundBonus: roundBonuses.final,
      p2RoundBonus: roundBonuses.final,
      p1ChampionBonus: p1Win ? CHAMPION_BONUS : 0,
      p2ChampionBonus: p1Win ? 0 : CHAMPION_BONUS,
    };
  }

  const b = roundBonuses[r] || 0;
  return {
    isFinal: false,
    winner,
    p1RoundBonus: p1Win ? b : 0,
    p2RoundBonus: p1Win ? 0 : b,
    p1ChampionBonus: 0,
    p2ChampionBonus: 0,
  };
}

function computeDisconnectBonusSplit(disconnectBy, p1Legs, p2Legs) {
  const outcome = getOutcome(p1Legs, p2Legs);
  if (outcome === 'draw') {
    return { p1DisconnectBonus: 0, p2DisconnectBonus: 0 };
  }

  const p1Win = outcome === 'win';
  const loser = p1Win ? 'p2' : 'p1';
  const who = String(disconnectBy || '');

  if (who !== 'p1' && who !== 'p2') return { p1DisconnectBonus: 0, p2DisconnectBonus: 0 };
  if (who !== loser) return { p1DisconnectBonus: 0, p2DisconnectBonus: 0 };

  return {
    p1DisconnectBonus: loser === 'p1' ? DISCONNECT_LOSER_BONUS : 0,
    p2DisconnectBonus: loser === 'p2' ? DISCONNECT_LOSER_BONUS : 0,
  };
}

// ---------- Firestore reads ----------
async function fetchAllUsers() {
  const snap = await getDocs(usersCol);
  const out = [];
  snap.forEach((d) => out.push({ uid: d.id, ...d.data() }));
  return out;
}
async function fetchAllTournamentMatches() {
  const snap = await getDocs(tourMatchesCol);
  const out = [];
  snap.forEach((d) => out.push({ id: d.id, ...d.data() }));
  return out;
}

// ---------- leaderboard helpers ----------
function hasAnyTournamentSubmission(uid, matches) {
  return matches.some((m) => (m?.p1 === uid || m?.p2 === uid));
}

// ---------- leaderboard rows ----------
function makeRow(u) {
  return {
    uid: u.uid,
    name: safeName(u),
    isMember: (u?.role === 'admin' || u?.isMember === true || u?.isMember === 'true' || u?.isMember === 1),
    isAdmin: isAdminDoc(u),
    div: divisionLabel(u.division),

    games: 0, wins: 0, losses: 0, draws: 0,
    legsFor: 0, legsAgainst: 0,

    c171: 0, c100: 0, cBull: 0, cDD: 0,

    r64w: 0, r32w: 0, r16w: 0, qfw: 0, sfw: 0, finals: 0, champs: 0,

    tourPts: 0,
    tourAvg: null, _avgSum: 0, _avgN: 0,

    _swissPlayed: [],
    _swissRemaining: [],
    _swissPlayedCount: 0,
    _swissTotalOpponents: 0,

    _swissMatchesPlayed: [],
  };
}

// ---------- tournament leaderboard build ----------
function buildTournamentLeaderboard(users, matches) {
  const map = new Map();
  users.forEach((u) => map.set(u.uid, makeRow(u)));

  matches.forEach((m) => {
    if (!isConfirmed(m)) return;

    const type = submissionTypeOf(m);

    if (type === 'bye') {
      if (!m.p1 || !map.has(m.p1)) return;
      const r = map.get(m.p1);
      r.tourPts += int(m.p1Points || 0);

      const rk = String(m.round || 'r64');
      if (rk === 'final') r.finals += 1;
      else if (rk === 'r64') r.r64w += 1;
      else if (rk === 'r32') r.r32w += 1;
      else if (rk === 'r16') r.r16w += 1;
      else if (rk === 'qf') r.qfw += 1;
      else if (rk === 'sf') r.sfw += 1;
      return;
    }

    const p1Legs = int(m.p1Legs || 0);
    const p2Legs = int(m.p2Legs || 0);
    const roundKey = String(m.round || 'r64');

    if (m.p1 && map.has(m.p1)) {
      const r = map.get(m.p1);
      r.games += 1;
      r.legsFor += p1Legs;
      r.legsAgainst += p2Legs;

      const out = getOutcome(p1Legs, p2Legs);
      if (out === 'win') r.wins += 1;
      else if (out === 'loss') r.losses += 1;
      else r.draws += 1;

      r.c171 += int(m.p1BigVisits171Plus || 0);
      r.c100 += int(m.p1HighCheckouts100Plus || 0);
      r.cBull += int(m.p1BullFinishes || 0);
      r.cDD += int(m.p1DoubleDoubleFinishes || 0);

      r.tourPts += int(m.p1Points || 0);

      if (typeof m.p1Avg === 'number') { r._avgSum += m.p1Avg; r._avgN += 1; }

      if (roundKey === 'final') r.finals += 1;
      if (int(m.p1ChampionBonus || 0) > 0) r.champs += 1;

      if (roundKey !== 'final' && out === 'win') {
        if (roundKey === 'r64') r.r64w += 1;
        if (roundKey === 'r32') r.r32w += 1;
        if (roundKey === 'r16') r.r16w += 1;
        if (roundKey === 'qf') r.qfw += 1;
        if (roundKey === 'sf') r.sfw += 1;
      }
    }

    if (m.p2 && map.has(m.p2)) {
      const r = map.get(m.p2);
      r.games += 1;
      r.legsFor += p2Legs;
      r.legsAgainst += p1Legs;

      const out = getOutcome(p2Legs, p1Legs);
      if (out === 'win') r.wins += 1;
      else if (out === 'loss') r.losses += 1;
      else r.draws += 1;

      r.c171 += int(m.p2BigVisits171Plus || 0);
      r.c100 += int(m.p2HighCheckouts100Plus || 0);
      r.cBull += int(m.p2BullFinishes || 0);
      r.cDD += int(m.p2DoubleDoubleFinishes || 0);

      r.tourPts += int(m.p2Points || 0);

      if (typeof m.p2Avg === 'number') { r._avgSum += m.p2Avg; r._avgN += 1; }

      if (roundKey === 'final') r.finals += 1;
      if (int(m.p2ChampionBonus || 0) > 0) r.champs += 1;

      if (roundKey !== 'final' && out === 'win') {
        if (roundKey === 'r64') r.r64w += 1;
        if (roundKey === 'r32') r.r32w += 1;
        if (roundKey === 'r16') r.r16w += 1;
        if (roundKey === 'qf') r.qfw += 1;
        if (roundKey === 'sf') r.sfw += 1;
      }
    }
  });

  const rows = Array.from(map.values());
  rows.forEach((r) => { r.tourAvg = r._avgN ? (r._avgSum / r._avgN) : null; });

  rows.sort((a, b) => (b.tourPts - a.tourPts) || (b.champs - a.champs) || (b.wins - a.wins) || a.name.localeCompare(b.name));
  return rows;
}

// ---------- swiss helpers ----------
function isSwissCountableForPlayed(m) {
  if (!isSwissMatch(m)) return false;
  if (m.status === 'rejected') return false;
  return true;
}
function isSwissConfirmed(m) {
  if (!isSwissMatch(m)) return false;
  return isConfirmed(m);
}
function buildSwissOpponentMap(members, matches) {
  const memberIds = new Set(members.map(m => m.uid));
  const played = new Map();

  members.forEach(m => played.set(m.uid, new Set()));

  matches.forEach((m) => {
    if (!isSwissCountableForPlayed(m)) return;
    if (!m.p1 || !m.p2) return;
    if (!memberIds.has(m.p1) || !memberIds.has(m.p2)) return;

    played.get(m.p1)?.add(m.p2);
    played.get(m.p2)?.add(m.p1);
  });

  return played;
}
function swissMatchesBetween(aUid, bUid, matches) {
  return matches
    .filter((m) => isSwissCountableForPlayed(m))
    .filter((m) => (m.p1 === aUid && m.p2 === bUid) || (m.p1 === bUid && m.p2 === aUid))
    .sort((x, y) => (y.reportedAt?.toMillis?.() || 0) - (x.reportedAt?.toMillis?.() || 0));
}

// ---------- swiss leaderboard build ----------
function buildSwissLeaderboard(members, matches) {
  const playedMap = buildSwissOpponentMap(members, matches);

  const map = new Map();
  members.forEach((u) => map.set(u.uid, makeRow(u)));

  matches.forEach((m) => {
    if (!isSwissConfirmed(m)) return;
    if (!m.p1 || !m.p2) return;

    const p1Legs = int(m.p1Legs || 0);
    const p2Legs = int(m.p2Legs || 0);

    if (map.has(m.p1)) {
      const r = map.get(m.p1);
      r.games += 1;
      r.legsFor += p1Legs;
      r.legsAgainst += p2Legs;

      const out = getOutcome(p1Legs, p2Legs);
      if (out === 'win') r.wins += 1;
      else if (out === 'loss') r.losses += 1;
      else r.draws += 1;

      r.tourPts += (SWISS_LEG_POINTS * p1Legs);
    }

    if (map.has(m.p2)) {
      const r = map.get(m.p2);
      r.games += 1;
      r.legsFor += p2Legs;
      r.legsAgainst += p1Legs;

      const out = getOutcome(p2Legs, p1Legs);
      if (out === 'win') r.wins += 1;
      else if (out === 'loss') r.losses += 1;
      else r.draws += 1;

      r.tourPts += (SWISS_LEG_POINTS * p2Legs);
    }
  });

  const memberIds = members.map(m => m.uid);
  const byId = new Map(members.map(m => [m.uid, m]));

  const rows = Array.from(map.values()).map((r) => {
    const playedSet = playedMap.get(r.uid) || new Set();
    const remaining = memberIds.filter((oid) => oid !== r.uid && !playedSet.has(oid));

    r._swissPlayed = Array.from(playedSet)
      .map(uid => safeName(byId.get(uid)))
      .sort((a,b)=>a.localeCompare(b));
    r._swissRemaining = remaining
      .map(uid => safeName(byId.get(uid)))
      .sort((a,b)=>a.localeCompare(b));
    r._swissPlayedCount = r._swissPlayed.length;
    r._swissTotalOpponents = Math.max(0, memberIds.length - 1);

    r._swissMatchesPlayed = Array.from(playedSet).flatMap((oppUid) => {
      return swissMatchesBetween(r.uid, oppUid, matches).slice(0, 1);
    });
    r._swissMatchesPlayed.sort((a, b) => (b.reportedAt?.toMillis?.() || 0) - (a.reportedAt?.toMillis?.() || 0));

    return r;
  });

  rows.sort((a, b) => {
    const ald = a.legsFor - a.legsAgainst;
    const bld = b.legsFor - b.legsAgainst;
    return (b.tourPts - a.tourPts) || (b.wins - a.wins) || (bld - ald) || a.name.localeCompare(b.name);
  });

  return rows;
}

// ---------- render ----------
let currentView = 'tour';
let lastRenderedRows = [];

function renderLeaderboard(rows, meUid) {
  if (!tourTableBody) return;
  tourTableBody.innerHTML = '';
  lastRenderedRows = rows || [];

  rows.forEach((r, idx) => {
    const main = document.createElement('tr');
    if (meUid && r.uid === meUid) main.classList.add('highlight');

    const ld = r.legsFor - r.legsAgainst;
    const ldHtml = ld >= 0 ? `<span class="diff-pos">+${ld}</span>` : `<span class="diff-neg">${ld}</span>`;

    const nameHtml = r.isMember
      ? `<span class="member-name" data-uid="${r.uid}">${r.name}</span> <span class="member-badge">M</span>`
      : `<span class="name" data-uid="${r.uid}">${r.name}</span>`;

    const champHtml = (currentView === 'tour' && r.champs > 0)
      ? ` <span class="champ-badge" title="Tournament champions">🏆×${r.champs}</span>`
      : '';

    const expId = `exp-${r.uid}`;
    main.innerHTML = `
      <td><button class="exp-btn" data-exp="${expId}" aria-label="Expand row">+</button></td>
      <td>${idx + 1}</td>
      <td>${nameHtml}${champHtml}</td>
      <td>${r.div}</td>
      <td>${r.games}</td>
      <td>${r.wins}</td>
      <td>${r.losses}</td>
      <td>${r.draws}</td>
      <td>${r.legsFor}</td>
      <td>${r.legsAgainst}</td>
      <td>${ldHtml}</td>
      <td>${currentView === 'swiss' ? '-' : r.c171}</td>
      <td>${currentView === 'swiss' ? '-' : r.c100}</td>
      <td>${currentView === 'swiss' ? '-' : r.cBull}</td>
      <td>${currentView === 'swiss' ? '-' : r.cDD}</td>
      <td>${currentView === 'swiss' ? '-' : (r.tourAvg != null ? r.tourAvg.toFixed(1) : '-')}</td>
      <td><strong>${r.tourPts}</strong></td>
    `;

    const details = document.createElement('tr');
    details.className = 'detail-row';
    details.id = expId;
    details.style.display = 'none';

    const swissDetailsHtml = `
      <div class="detail-grid" style="grid-template-columns:repeat(2,minmax(0,1fr));">
        <div class="detail-card">
          <div class="detail-k">Played</div>
          <div class="detail-v">${r._swissPlayedCount || 0} / ${r._swissTotalOpponents || 0}</div>
          <div class="note" style="margin-top:6px;">${(r._swissPlayed || []).join(', ') || '—'}</div>
        </div>
        <div class="detail-card">
          <div class="detail-k">Remaining</div>
          <div class="detail-v">${(r._swissRemaining || []).length || 0}</div>
          <div class="note" style="margin-top:6px;">${(r._swissRemaining || []).join(', ') || '—'}</div>
        </div>
      </div>
    `;

    const tourDetailsHtml = `
      <div class="detail-grid">
        <div class="detail-card"><div class="detail-k">R64 W</div><div class="detail-v">${r.r64w}</div></div>
        <div class="detail-card"><div class="detail-k">R32 W</div><div class="detail-v">${r.r32w}</div></div>
        <div class="detail-card"><div class="detail-k">R16 W</div><div class="detail-v">${r.r16w}</div></div>
        <div class="detail-card"><div class="detail-k">QF W</div><div class="detail-v">${r.qfw}</div></div>
        <div class="detail-card"><div class="detail-k">SF W</div><div class="detail-v">${r.sfw}</div></div>
        <div class="detail-card"><div class="detail-k">Finals</div><div class="detail-v">${r.finals}</div></div>
        <div class="detail-card"><div class="detail-k">Champs</div><div class="detail-v">${r.champs}</div></div>
      </div>
    `;

    details.innerHTML = `
      <td colspan="17">
        ${currentView === 'swiss' ? swissDetailsHtml : tourDetailsHtml}
      </td>
    `;

    tourTableBody.appendChild(main);
    tourTableBody.appendChild(details);
  });
}

document.addEventListener('click', (e) => {
  const btn = e.target.closest('.exp-btn');
  if (!btn) return;
  const id = btn.getAttribute('data-exp');
  const row = id ? document.getElementById(id) : null;
  if (!row) return;
  const open = row.style.display !== 'none';
  row.style.display = open ? 'none' : '';
  btn.textContent = open ? '+' : '–';
});

document.addEventListener('click', (e) => {
  const nameEl = e.target.closest('.member-name, .name');
  if (!nameEl) return;

  const uid = nameEl.getAttribute('data-uid');
  if (!uid) return;

  if (currentView !== 'swiss') return;

  const row = (lastRenderedRows || []).find(r => r.uid === uid);
  if (!row) return;

  openSwissFixturesModalForRow(row);
});

function openSwissFixturesModalForRow(row) {
  if (!swissFixturesModal || !swissFixturesList) return;

  if (swissFixturesTitle) swissFixturesTitle.textContent = `${row.name} • Swiss fixtures`;

  const playedCount = row._swissPlayedCount || 0;
  const totalOpp = row._swissTotalOpponents || 0;

  if (swissFixturesCount) swissFixturesCount.textContent = ` • Played ${playedCount}/${totalOpp}`;

  const byId = new Map(cachedUsers.map(u => [u.uid, u]));
  const memberIds = cachedUsers.filter(isMemberUser).map(u => u.uid);
  const playedSet = new Set((buildSwissOpponentMap(cachedUsers.filter(isMemberUser), cachedMatches).get(row.uid) || new Set()));

  const remainingIds = memberIds.filter((oid) => oid !== row.uid && !playedSet.has(oid));
  const remainingNames = remainingIds.map(uid => safeName(byId.get(uid))).sort((a,b)=>a.localeCompare(b));

  const playedCards = [];
  const playedMatches = (row._swissMatchesPlayed || []);

  if (!playedMatches.length && playedCount === 0) {
    playedCards.push(`<div class="fixture-item"><div class="status warn">No Swiss games played yet.</div></div>`);
  } else {
    playedMatches.forEach((m) => {
      const aUid = row.uid;
      const oppUid = (m.p1 === aUid) ? m.p2 : m.p1;
      const oppName = safeName(byId.get(oppUid));

      const myLegs = (m.p1 === aUid) ? int(m.p1Legs) : int(m.p2Legs);
      const oppLegs = (m.p1 === aUid) ? int(m.p2Legs) : int(m.p1Legs);

      const statusTxt = matchStatusLabel(m);
      const statusCls = matchStatusClass(m);

      const playedClass = (m.status === 'confirmed' || m.locked === true) ? 'fixture-played' : '';

      playedCards.push(`
        <div class="fixture-item ${playedClass}">
          <div class="fixture-row">
            <div><strong>vs ${oppName}</strong></div>
            <div class="fixture-score">${myLegs}-${oppLegs}</div>
          </div>
          <div class="status ${statusCls}">${statusTxt}</div>
          <div class="note">Submitted: ${fmtDate(m.reportedAt)}</div>
        </div>
      `);
    });
  }

  const remainingCards = [];
  if (!remainingNames.length) {
    remainingCards.push(`<div class="fixture-item"><div class="status ok">All Swiss fixtures completed 🎯</div></div>`);
  } else {
    remainingNames.forEach((nm) => {
      remainingCards.push(`
        <div class="fixture-item">
          <div class="fixture-row">
            <div><strong>vs ${nm}</strong></div>
            <div class="status warn">Remaining</div>
          </div>
        </div>
      `);
    });
  }

  swissFixturesList.innerHTML = `
    <div class="section">
      <div class="fixture-item">
        <div class="status ok"><strong>Played fixtures</strong></div>
        <div class="note">These are the Swiss opponents already played (most recent shown if duplicates).</div>
      </div>
      ${playedCards.join('')}
    </div>

    <div class="section" style="margin-top:14px;">
      <div class="fixture-item">
        <div class="status warn"><strong>Remaining opponents</strong></div>
        <div class="note">These are the Swiss opponents still to play.</div>
      </div>
      ${remainingCards.join('')}
    </div>
  `;

  openModal(swissFixturesModal);
}

// ---------- inbox ----------
function isPendingForUser(m, uid) {
  if (!uid) return false;
  if (isConfirmed(m)) return false;
  if (m.status === 'disputed') return false;
  if (isBye(m)) return false;

  const inMatch = (m.p1 === uid || m.p2 === uid);
  if (!inMatch) return false;

  return m.reportedBy && m.reportedBy !== uid;
}
function isPendingBye(m) {
  if (!isBye(m)) return false;
  if (isConfirmed(m)) return false;
  if (m.status === 'rejected') return false;
  return true;
}
function computeInboxCount(uid, meDoc, matches) {
  const pendingOpp = matches.filter((m) => isPendingForUser(m, uid)).length;
  const pendingBye = isAdminDoc(meDoc) ? matches.filter((m) => isPendingBye(m)).length : 0;
  return pendingOpp + pendingBye;
}

async function renderInbox(meUid, meDoc, users, matches) {
  if (!inboxList) return;
  inboxList.innerHTML = '';

  const byId = new Map(users.map((u) => [u.uid, u]));
  const pendingOpp = matches
    .filter((m) => isPendingForUser(m, meUid))
    .sort((a, b) => (b.reportedAt?.toMillis?.() || 0) - (a.reportedAt?.toMillis?.() || 0));

  const pendingBye = isAdminDoc(meDoc)
    ? matches
        .filter((m) => isPendingBye(m))
        .sort((a, b) => (b.reportedAt?.toMillis?.() || 0) - (a.reportedAt?.toMillis?.() || 0))
    : [];

  if (!pendingOpp.length && !pendingBye.length) {
    inboxList.innerHTML = `<div class="fixture-item"><div class="status ok">No pending items 🎯</div></div>`;
    return;
  }

  pendingOpp.forEach((m) => {
    const p1 = byId.get(m.p1);
    const p2 = byId.get(m.p2);

    const card = document.createElement('div');
    card.className = 'fixture-item';

    const isSwiss = isSwissMatch(m);
    const gt = String(m.gameType || '501').toUpperCase();
    const mode = String(m.lengthMode || 'bestOf') === 'firstTo' ? 'First to' : 'Best of';
    const t = int(m.target || 9);
    const rk = String(m.round || 'r64').toUpperCase();

    card.innerHTML = `
      <div>
        <strong>${safeName(p1)} vs ${safeName(p2)}</strong>
        ${isSwiss ? ` <span class="chip">SWISS</span>` : ` <span class="chip">${gt}</span> <span class="chip">${mode} ${t}</span> <span class="chip">${rk}</span>`}
      </div>
      <div class="note">Score: ${int(m.p1Legs)}-${int(m.p2Legs)} • Submitted: ${fmtDate(m.reportedAt)}</div>
    `;

    const actions = document.createElement('div');
    actions.className = 'row';

    const btnConfirm = document.createElement('button');
    btnConfirm.className = 'btn btn-primary';
    btnConfirm.textContent = 'Confirm';
    btnConfirm.onclick = async () => {
      await updateDoc(doc(db, 'tournaments', 'global', 'matches', m.id), {
        status: 'confirmed',
        locked: true,
        confirmedAt: serverTimestamp(),
        confirmedBy: meUid,
      });
      cachedMatches = await fetchAllTournamentMatches();
      await renderInbox(meUid, meDoc, cachedUsers, cachedMatches);
      rerenderBoard();
    };

    const btnDispute = document.createElement('button');
    btnDispute.className = 'btn btn-ghost';
    btnDispute.textContent = 'Dispute';
    btnDispute.onclick = async () => {
      const reason = prompt('Reason for dispute? (optional)');
      await updateDoc(doc(db, 'tournaments', 'global', 'matches', m.id), {
        status: 'disputed',
        locked: false,
        disputeBy: meUid,
        disputeReason: reason || '',
        disputedAt: serverTimestamp(),
      });
      cachedMatches = await fetchAllTournamentMatches();
      await renderInbox(meUid, meDoc, cachedUsers, cachedMatches);
      rerenderBoard();
    };

    actions.appendChild(btnConfirm);
    actions.appendChild(btnDispute);
    card.appendChild(actions);

    inboxList.appendChild(card);
  });

  if (pendingBye.length) {
    const sep = document.createElement('div');
    sep.className = 'fixture-item';
    sep.innerHTML = `<div class="status warn"><strong>Admin approvals</strong> • BYE submissions</div>`;
    inboxList.appendChild(sep);
  }

  pendingBye.forEach((m) => {
    const p1 = byId.get(m.p1);

    const card = document.createElement('div');
    card.className = 'fixture-item';

    const rk = String(m.round || 'r64').toUpperCase();
    card.innerHTML = `
      <div><strong>BYE</strong> • ${safeName(p1)} <span class="chip">${rk}</span></div>
      <div class="note">Submitted: ${fmtDate(m.reportedAt)} • Proposed points: ${int(m.p1Points || 0)}</div>
    `;

    const actions = document.createElement('div');
    actions.className = 'row';

    const btnApprove = document.createElement('button');
    btnApprove.className = 'btn btn-primary';
    btnApprove.textContent = 'Approve';
    btnApprove.onclick = async () => {
      await updateDoc(doc(db, 'tournaments', 'global', 'matches', m.id), {
        status: 'confirmed',
        locked: true,
        confirmedAt: serverTimestamp(),
        confirmedBy: meUid,
      });
      cachedMatches = await fetchAllTournamentMatches();
      await renderInbox(meUid, meDoc, cachedUsers, cachedMatches);
      rerenderBoard();
    };

    const btnReject = document.createElement('button');
    btnReject.className = 'btn btn-ghost';
    btnReject.textContent = 'Reject';
    btnReject.onclick = async () => {
      const reason = prompt('Reject reason? (optional)');
      await updateDoc(doc(db, 'tournaments', 'global', 'matches', m.id), {
        status: 'rejected',
        locked: false,
        rejectedAt: serverTimestamp(),
        rejectedBy: meUid,
        rejectedReason: reason || '',
      });
      cachedMatches = await fetchAllTournamentMatches();
      await renderInbox(meUid, meDoc, cachedUsers, cachedMatches);
      rerenderBoard();
    };

    actions.appendChild(btnApprove);
    actions.appendChild(btnReject);
    card.appendChild(actions);
    inboxList.appendChild(card);
  });
}

// ---------- state ----------
let cachedUsers = [];
let cachedMatches = [];
let currentUser = null;
let meUserDoc = null;
let eligibleOpponents = [];

// ---------- bonus selects ----------
function initBonusSelect(el, label) {
  if (!el) return;
  el.innerHTML = '';
  for (let i = 0; i <= 10; i++) {
    const opt = document.createElement('option');
    opt.value = String(i);
    opt.textContent = `${label}: ${i}`;
    el.appendChild(opt);
  }
  el.value = '0';
}
initBonusSelect(tourMy171, '171+'); initBonusSelect(tourMy100, '100+'); initBonusSelect(tourMyBull, 'Bull'); initBonusSelect(tourMyDD, 'D/D');
initBonusSelect(tourOpp171,'171+'); initBonusSelect(tourOpp100,'100+'); initBonusSelect(tourOppBull,'Bull'); initBonusSelect(tourOppDD,'D/D');

// ---------- opponent select/search ----------
function renderOpponentSelect(el, list) {
  if (!el) return;
  el.innerHTML = '';
  list.forEach((u) => {
    const opt = document.createElement('option');
    opt.value = u.uid;
    opt.textContent = safeName(u);
    el.appendChild(opt);
  });
}
function filterListBySearch(q, list) {
  const t = (q || '').toLowerCase();
  return list.filter((u) => safeName(u).toLowerCase().includes(t));
}
document.addEventListener('input', (e) => {
  if (e.target === tourOpponentSearch) {
    renderOpponentSelect(tourOpponent, filterListBySearch(tourOpponentSearch.value, eligibleOpponents));
    updateLiveTotals();
  }
});

// ---------- UI rules ----------
function roundLabel(roundKey) {
  const k = String(roundKey || 'r64');
  return k === 'r64' ? 'R64' : k === 'r32' ? 'R32' : k === 'r16' ? 'R16' : k === 'qf' ? 'QF' : k === 'sf' ? 'SF' : k === 'final' ? 'Final' : 'R64';
}

function applyRulesToUI() {
  const type = String(tourSubmissionType?.value || 'match');
  const rk = String(tourRound?.value || 'r64');

  if (type === 'swiss') {
    if (tourRoundWrap) tourRoundWrap.style.display = 'none';

    if (tourOpponentWrap) tourOpponentWrap.style.display = '';
    if (tourGameWrap) tourGameWrap.style.display = '';
    if (tourBonusWrap) tourBonusWrap.style.display = '';
    if (tourAvgWrap) tourAvgWrap.style.display = '';
    if (tourScoreWrap) tourScoreWrap.style.display = '';

    if (tourDisconnectByWrap) tourDisconnectByWrap.style.display = 'none';

    if (tourTypeNote) tourTypeNote.textContent =
      `Swiss Cup: submit like normal. Swiss leaderboard converts to ${SWISS_LEG_POINTS} pts per leg won.`;

    if (tourRuleNote) tourRuleNote.textContent =
      `Swiss submit saves normal match points. Swiss leaderboard converts to ${SWISS_LEG_POINTS} pts/leg.`;

    if (tourScoreHelp) tourScoreHelp.textContent =
      `Draws are allowed in Best-of only. Swiss view uses ${SWISS_LEG_POINTS} pts per leg won for the leaderboard only.`;

    if (formatChip) formatChip.textContent = `Swiss Cup • ${SWISS_LEG_POINTS} pts/leg (leaderboard)`;

    updateLiveTotals();
    return;
  }

  if (tourRoundWrap) tourRoundWrap.style.display = '';

  const rb = roundBonuses[rk] || 0;
  if (tourRoundNote) {
    tourRoundNote.textContent = rk === 'final'
      ? `Final: both players get +${rb}. Winner gets +${CHAMPION_BONUS}. If drawn, both keep the finalist bonus and no champion bonus is awarded.`
      : `${roundLabel(rk)} winner gets +${rb} (flat). If drawn, no round winner bonus is awarded.`;
  }

  if (type === 'bye') {
    if (tourTypeNote) tourTypeNote.textContent = `BYE: admin-confirmed. +${BYE_BONUS} + round bonus (flat).`;
    if (tourOpponentWrap) tourOpponentWrap.style.display = 'none';
    if (tourGameWrap) tourGameWrap.style.display = 'none';
    if (tourBonusWrap) tourBonusWrap.style.display = 'none';
    if (tourAvgWrap) tourAvgWrap.style.display = 'none';
    if (tourScoreWrap) tourScoreWrap.style.display = 'none';
    if (tourDisconnectByWrap) tourDisconnectByWrap.style.display = 'none';

    if (tourTotalsMine) tourTotalsMine.innerHTML = `<small>You: <strong>Total ${BYE_BONUS + (roundBonuses[rk] || 0)}</strong></small>`;
    if (tourTotalsOpp) tourTotalsOpp.innerHTML = `<small>Opponent: <strong>Total 0</strong></small>`;
    if (formatChip) formatChip.textContent = `501/301/701 • Draws allowed in best-of`;
    return;
  }

  if (tourOpponentWrap) tourOpponentWrap.style.display = '';
  if (tourGameWrap) tourGameWrap.style.display = '';
  if (tourBonusWrap) tourBonusWrap.style.display = '';
  if (tourAvgWrap) tourAvgWrap.style.display = '';
  if (tourScoreWrap) tourScoreWrap.style.display = '';

  if (type === 'disconnect') {
    if (tourTypeNote) tourTypeNote.textContent = `Disconnect: normal scoring +${DISCONNECT_LOSER_BONUS} to the disconnected player if they lose. No disconnect bonus on a draw.`;
    if (tourDisconnectByWrap) tourDisconnectByWrap.style.display = '';
  } else if (type === 'eliteCup') {
    if (tourTypeNote) tourTypeNote.textContent = `Elite Cup: normal tournament scoring.`;
    if (tourDisconnectByWrap) tourDisconnectByWrap.style.display = 'none';
  } else if (type === 'challengerCup') {
    if (tourTypeNote) tourTypeNote.textContent = `Challenger Cup: normal tournament scoring.`;
    if (tourDisconnectByWrap) tourDisconnectByWrap.style.display = 'none';
  } else {
    if (tourTypeNote) tourTypeNote.textContent = `Match: normal tournament scoring.`;
    if (tourDisconnectByWrap) tourDisconnectByWrap.style.display = 'none';
  }

  const gt = String(tourGameType?.value || '501');
  const mode = String(tourLengthMode?.value || 'bestOf');
  const rule = validateTournamentRules(gt, mode, tourTarget?.value);

  if (!rule.ok) {
    if (tourRuleNote) tourRuleNote.textContent = rule.msg;
  } else {
    if (tourTarget) tourTarget.value = String(rule.target);
    if (tourRuleNote) {
      tourRuleNote.textContent = mode === 'bestOf'
        ? `Best of ${rule.target} (≤64) • draws allowed if the scheduled legs finish level`
        : `First to ${rule.target} (≤32) • no draws`;
    }
  }

  if (formatChip) formatChip.textContent = `501/301/701 • Draws allowed in best-of`;
  if (tourScoreHelp) tourScoreHelp.textContent = `Draws are allowed in Best-of only. First-to still has no draws. Caps: bestOf≤64, firstTo≤32.`;

  updateLiveTotals();
}

[tourSubmissionType, tourRound, tourGameType, tourLengthMode, tourTarget, tourDido, tourDisconnectBy, tourOpponent].forEach((el) => {
  el?.addEventListener('change', applyRulesToUI);
});
[tourMyLegs, tourOppLegs, tourMyAvg, tourOppAvg].forEach((el) => el?.addEventListener('input', updateLiveTotals));
[tourMy171, tourMy100, tourMyBull, tourMyDD, tourOpp171, tourOpp100, tourOppBull, tourOppDD].forEach((el) => el?.addEventListener('change', updateLiveTotals));

// ---------- live totals ----------
function updateLiveTotals() {
  if (!currentUser) return;

  const type = String(tourSubmissionType?.value || 'match');

  if (type === 'bye') return;

  const oppUid = tourOpponent?.value;
  const oppUser = cachedUsers.find((u) => u.uid === oppUid);
  const meUser = cachedUsers.find((u) => u.uid === currentUser.uid);
  if (!oppUser || !meUser) return;

  if (type === 'swiss') {
    const gt = String(tourGameType?.value || '501');
    const mode = String(tourLengthMode?.value || 'bestOf');

    const rule = validateTournamentRules(gt, mode, tourTarget?.value);
    if (!rule.ok) {
      if (tourTotalsMine) tourTotalsMine.innerHTML = `<small>You: <strong>Total —</strong></small>`;
      if (tourTotalsOpp) tourTotalsOpp.innerHTML = `<small>Opponent: <strong>Total —</strong></small>`;
      return;
    }

    const val = validateTournamentScore(mode, rule.target, tourMyLegs?.value, tourOppLegs?.value);
    if (!val.ok) {
      if (tourTotalsMine) tourTotalsMine.innerHTML = `<small>You: <strong>Total —</strong></small>`;
      if (tourTotalsOpp) tourTotalsOpp.innerHTML = `<small>Opponent: <strong>Total —</strong></small>`;
      return;
    }

    const meDiv = getDivNum(meUser);
    const opDiv = getDivNum(oppUser);
    const meForm = computeRecentFormAvg(currentUser.uid);
    const opForm = computeRecentFormAvg(oppUid);

    const p1Core = computeCorePoints({
      gameType: gt,
      dido: !!tourDido?.checked,
      myLegs: tourMyLegs?.value,
      oppLegs: tourOppLegs?.value,
      myDiv: meDiv,
      oppDiv: opDiv,
      bonus171: tourMy171?.value,
      bonus100: tourMy100?.value,
      bonusBull: tourMyBull?.value,
      bonusDD: tourMyDD?.value,
      myAvg: flt(tourMyAvg?.value),
      myFpAvg: null,
      myFormAvg: meForm,
    });

    const p2Core = computeCorePoints({
      gameType: gt,
      dido: !!tourDido?.checked,
      myLegs: tourOppLegs?.value,
      oppLegs: tourMyLegs?.value,
      myDiv: opDiv,
      oppDiv: meDiv,
      bonus171: tourOpp171?.value,
      bonus100: tourOpp100?.value,
      bonusBull: tourOppBull?.value,
      bonusDD: tourOppDD?.value,
      myAvg: flt(tourOppAvg?.value),
      myFpAvg: null,
      myFormAvg: opForm,
    });

    if (tourTotalsMine) tourTotalsMine.innerHTML = `<small>You: <strong>Total ${p1Core.total}</strong></small>`;
    if (tourTotalsOpp) tourTotalsOpp.innerHTML = `<small>Opponent: <strong>Total ${p2Core.total}</strong></small>`;
    return;
  }

  const rk = String(tourRound?.value || 'r64');
  const gt = String(tourGameType?.value || '501');
  const mode = String(tourLengthMode?.value || 'bestOf');

  const rule = validateTournamentRules(gt, mode, tourTarget?.value);
  if (!rule.ok) {
    if (tourTotalsMine) tourTotalsMine.innerHTML = `<small>You: <strong>Total —</strong></small>`;
    if (tourTotalsOpp) tourTotalsOpp.innerHTML = `<small>Opponent: <strong>Total —</strong></small>`;
    return;
  }

  const val = validateTournamentScore(mode, rule.target, tourMyLegs?.value, tourOppLegs?.value);
  if (!val.ok) {
    if (tourTotalsMine) tourTotalsMine.innerHTML = `<small>You: <strong>Total —</strong></small>`;
    if (tourTotalsOpp) tourTotalsOpp.innerHTML = `<small>Opponent: <strong>Total —</strong></small>`;
    return;
  }

  const meDiv = getDivNum(meUser);
  const opDiv = getDivNum(oppUser);
  const meForm = computeRecentFormAvg(currentUser.uid);
  const opForm = computeRecentFormAvg(oppUid);

  const p1Core = computeCorePoints({
    gameType: gt,
    dido: !!tourDido?.checked,
    myLegs: tourMyLegs?.value,
    oppLegs: tourOppLegs?.value,
    myDiv: meDiv,
    oppDiv: opDiv,
    bonus171: tourMy171?.value,
    bonus100: tourMy100?.value,
    bonusBull: tourMyBull?.value,
    bonusDD: tourMyDD?.value,
    myAvg: flt(tourMyAvg?.value),
    myFpAvg: null,
    myFormAvg: meForm,
  });

  const p2Core = computeCorePoints({
    gameType: gt,
    dido: !!tourDido?.checked,
    myLegs: tourOppLegs?.value,
    oppLegs: tourMyLegs?.value,
    myDiv: opDiv,
    oppDiv: meDiv,
    bonus171: tourOpp171?.value,
    bonus100: tourOpp100?.value,
    bonusBull: tourOppBull?.value,
    bonusDD: tourOppDD?.value,
    myAvg: flt(tourOppAvg?.value),
    myFpAvg: null,
    myFormAvg: opForm,
  });

  const rb = computeRoundBonusSplit(rk, tourMyLegs?.value, tourOppLegs?.value);

  const disconnectBy = type === 'disconnect'
    ? (tourDisconnectBy?.value === 'me' ? 'p1' : 'p2')
    : null;

  const dbonus = type === 'disconnect'
    ? computeDisconnectBonusSplit(disconnectBy, tourMyLegs?.value, tourOppLegs?.value)
    : { p1DisconnectBonus: 0, p2DisconnectBonus: 0 };

  const p1Total = p1Core.total + rb.p1RoundBonus + rb.p1ChampionBonus + dbonus.p1DisconnectBonus;
  const p2Total = p2Core.total + rb.p2RoundBonus + rb.p2ChampionBonus + dbonus.p2DisconnectBonus;

  if (tourTotalsMine) tourTotalsMine.innerHTML = `<small>You: <strong>Total ${p1Total}</strong></small>`;
  if (tourTotalsOpp) tourTotalsOpp.innerHTML = `<small>Opponent: <strong>Total ${p2Total}</strong></small>`;
}

// ---------- submit ----------
function showSubmitError(msg) {
  if (!tourSubmitNote) return;
  tourSubmitNote.style.display = 'block';
  tourSubmitNote.textContent = msg;
}
function clearSubmitError() {
  if (!tourSubmitNote) return;
  tourSubmitNote.style.display = 'none';
  tourSubmitNote.textContent = '';
}

async function handleSubmit() {
  if (!currentUser) return;

  try {
    const type = String(tourSubmissionType?.value || 'match');
    const rk = String(tourRound?.value || 'r64');

    if (type === 'bye') {
      clearSubmitError();
      const pts = BYE_BONUS + (roundBonuses[rk] || 0);

      await addDoc(tourMatchesCol, {
        submissionType: 'bye',
        round: rk,

        p1: currentUser.uid,
        p2: null,

        p1Points: pts,
        p2Points: 0,

        byeBonus: BYE_BONUS,
        p1RoundBonus: (roundBonuses[rk] || 0),
        p2RoundBonus: 0,
        p1ChampionBonus: 0,
        p2ChampionBonus: 0,
        p1DisconnectBonus: 0,
        p2DisconnectBonus: 0,

        reportedBy: currentUser.uid,
        reportedAt: serverTimestamp(),

        status: 'pending',
        locked: false,
        needsAdmin: true,
      });

      cachedMatches = await fetchAllTournamentMatches();
      closeModal(submitModal);
      rerenderBoard();
      return;
    }

    const oppUid = tourOpponent?.value;
    if (!oppUid) return showSubmitError('Select an opponent.');

    const meUser = cachedUsers.find((u) => u.uid === currentUser.uid);
    const oppUser = cachedUsers.find((u) => u.uid === oppUid);
    if (!meUser || !oppUser) return showSubmitError('User data missing. Refresh.');

    if (type === 'swiss') {
      const gt = String(tourGameType?.value || '501');
      const mode = String(tourLengthMode?.value || 'bestOf');

      const rule = validateTournamentRules(gt, mode, tourTarget?.value);
      if (!rule.ok) return showSubmitError(rule.msg);

      const val = validateTournamentScore(mode, rule.target, tourMyLegs?.value, tourOppLegs?.value);
      if (!val.ok) return showSubmitError(val.msg);

      clearSubmitError();

      const meDiv = getDivNum(meUser);
      const opDiv = getDivNum(oppUser);
      const meForm = computeRecentFormAvg(currentUser.uid);
      const opForm = computeRecentFormAvg(oppUid);

      const p1Core = computeCorePoints({
        gameType: gt,
        dido: !!tourDido?.checked,
        myLegs: tourMyLegs?.value,
        oppLegs: tourOppLegs?.value,
        myDiv: meDiv,
        oppDiv: opDiv,
        bonus171: tourMy171?.value,
        bonus100: tourMy100?.value,
        bonusBull: tourMyBull?.value,
        bonusDD: tourMyDD?.value,
        myAvg: flt(tourMyAvg?.value),
        myFpAvg: null,
        myFormAvg: meForm,
      });

      const p2Core = computeCorePoints({
        gameType: gt,
        dido: !!tourDido?.checked,
        myLegs: tourOppLegs?.value,
        oppLegs: tourMyLegs?.value,
        myDiv: opDiv,
        oppDiv: meDiv,
        bonus171: tourOpp171?.value,
        bonus100: tourOpp100?.value,
        bonusBull: tourOppBull?.value,
        bonusDD: tourOppDD?.value,
        myAvg: flt(tourOppAvg?.value),
        myFpAvg: null,
        myFormAvg: opForm,
      });

      await addDoc(tourMatchesCol, {
        submissionType: 'match',
        swissCup: true,

        p1: currentUser.uid,
        p2: oppUid,

        gameType: gt,
        lengthMode: mode,
        target: rule.target,
        dido: !!tourDido?.checked,

        p1Legs: int(tourMyLegs?.value),
        p2Legs: int(tourOppLegs?.value),

        p1BigVisits171Plus: int(tourMy171?.value),
        p1HighCheckouts100Plus: int(tourMy100?.value),
        p1BullFinishes: int(tourMyBull?.value),
        p1DoubleDoubleFinishes: int(tourMyDD?.value),
        p1Avg: flt(tourMyAvg?.value),

        p2BigVisits171Plus: int(tourOpp171?.value),
        p2HighCheckouts100Plus: int(tourOpp100?.value),
        p2BullFinishes: int(tourOppBull?.value),
        p2DoubleDoubleFinishes: int(tourOppDD?.value),
        p2Avg: flt(tourOppAvg?.value),

        p1CorePoints: p1Core.total,
        p2CorePoints: p2Core.total,

        round: null,
        p1RoundBonus: 0, p2RoundBonus: 0,
        p1ChampionBonus: 0, p2ChampionBonus: 0,
        disconnectBy: null,
        p1DisconnectBonus: 0, p2DisconnectBonus: 0,

        p1Points: p1Core.total,
        p2Points: p2Core.total,

        reportedBy: currentUser.uid,
        reportedAt: serverTimestamp(),

        status: 'pending',
        locked: false,
      });

      cachedMatches = await fetchAllTournamentMatches();
      closeModal(submitModal);
      rerenderBoard();
      return;
    }

    const gt = String(tourGameType?.value || '501');
    const mode = String(tourLengthMode?.value || 'bestOf');

    const rule = validateTournamentRules(gt, mode, tourTarget?.value);
    if (!rule.ok) return showSubmitError(rule.msg);

    const val = validateTournamentScore(mode, rule.target, tourMyLegs?.value, tourOppLegs?.value);
    if (!val.ok) return showSubmitError(val.msg);

    clearSubmitError();

    const meDiv = getDivNum(meUser);
    const opDiv = getDivNum(oppUser);
    const meForm = computeRecentFormAvg(currentUser.uid);
    const opForm = computeRecentFormAvg(oppUid);

    const p1Core = computeCorePoints({
      gameType: gt,
      dido: !!tourDido?.checked,
      myLegs: tourMyLegs?.value,
      oppLegs: tourOppLegs?.value,
      myDiv: meDiv,
      oppDiv: opDiv,
      bonus171: tourMy171?.value,
      bonus100: tourMy100?.value,
      bonusBull: tourMyBull?.value,
      bonusDD: tourMyDD?.value,
      myAvg: flt(tourMyAvg?.value),
      myFpAvg: null,
      myFormAvg: meForm,
    });

    const p2Core = computeCorePoints({
      gameType: gt,
      dido: !!tourDido?.checked,
      myLegs: tourOppLegs?.value,
      oppLegs: tourMyLegs?.value,
      myDiv: opDiv,
      oppDiv: meDiv,
      bonus171: tourOpp171?.value,
      bonus100: tourOpp100?.value,
      bonusBull: tourOppBull?.value,
      bonusDD: tourOppDD?.value,
      myAvg: flt(tourOppAvg?.value),
      myFpAvg: null,
      myFormAvg: opForm,
    });

    const rb = computeRoundBonusSplit(rk, tourMyLegs?.value, tourOppLegs?.value);

    const disconnectBy = type === 'disconnect'
      ? (tourDisconnectBy?.value === 'me' ? 'p1' : 'p2')
      : null;

    const dbonus = type === 'disconnect'
      ? computeDisconnectBonusSplit(disconnectBy, tourMyLegs?.value, tourOppLegs?.value)
      : { p1DisconnectBonus: 0, p2DisconnectBonus: 0 };

    const p1Total = p1Core.total + rb.p1RoundBonus + rb.p1ChampionBonus + dbonus.p1DisconnectBonus;
    const p2Total = p2Core.total + rb.p2RoundBonus + rb.p2ChampionBonus + dbonus.p2DisconnectBonus;

    await addDoc(tourMatchesCol, {
      submissionType: type,
      round: rk,

      p1: currentUser.uid,
      p2: oppUid,

      gameType: gt,
      lengthMode: mode,
      target: rule.target,
      dido: !!tourDido?.checked,

      p1Legs: int(tourMyLegs?.value),
      p2Legs: int(tourOppLegs?.value),

      p1BigVisits171Plus: int(tourMy171?.value),
      p1HighCheckouts100Plus: int(tourMy100?.value),
      p1BullFinishes: int(tourMyBull?.value),
      p1DoubleDoubleFinishes: int(tourMyDD?.value),
      p1Avg: flt(tourMyAvg?.value),

      p2BigVisits171Plus: int(tourOpp171?.value),
      p2HighCheckouts100Plus: int(tourOpp100?.value),
      p2BullFinishes: int(tourOppBull?.value),
      p2DoubleDoubleFinishes: int(tourOppDD?.value),
      p2Avg: flt(tourOppAvg?.value),

      p1CorePoints: p1Core.total,
      p2CorePoints: p2Core.total,

      p1RoundBonus: rb.p1RoundBonus,
      p2RoundBonus: rb.p2RoundBonus,
      p1ChampionBonus: rb.p1ChampionBonus,
      p2ChampionBonus: rb.p2ChampionBonus,

      disconnectBy,
      p1DisconnectBonus: dbonus.p1DisconnectBonus,
      p2DisconnectBonus: dbonus.p2DisconnectBonus,

      p1Points: p1Total,
      p2Points: p2Total,

      reportedBy: currentUser.uid,
      reportedAt: serverTimestamp(),

      status: 'pending',
      locked: false,
    });

    cachedMatches = await fetchAllTournamentMatches();
    closeModal(submitModal);
    rerenderBoard();
  } catch (err) {
    console.error(err);
    showSubmitError(err?.message || 'Submit failed.');
  }
}

// ---------- rerender ----------
function rerenderBoard() {
  if (!currentUser) return;

  const members = cachedUsers.filter(isMemberUser);

  if (currentView === 'swiss') {
    const rows = buildSwissLeaderboard(members, cachedMatches);
    renderLeaderboard(rows, currentUser.uid);
    setText(updatedMeta, `Swiss Cup updated: ${new Date().toLocaleString()}`);
    if (formatChip) setText(formatChip, `Swiss Cup • ${SWISS_LEG_POINTS} pts/leg`);
  } else {
    const usersWithSubmissions = cachedUsers.filter((u) => hasAnyTournamentSubmission(u.uid, cachedMatches));
    const rows = buildTournamentLeaderboard(usersWithSubmissions, cachedMatches);
    renderLeaderboard(rows, currentUser.uid);
    setText(updatedMeta, `Tournament updated: ${new Date().toLocaleString()}`);
    if (formatChip) setText(formatChip, `501/301/701 • Draws allowed in best-of`);
  }

  if (inboxCountEl) setText(inboxCountEl, String(computeInboxCount(currentUser.uid, meUserDoc, cachedMatches)));
}

// ---------- buttons ----------
btnSubmit?.addEventListener('click', () => {
  if (!currentUser) return;
  applyRulesToUI();
  updateLiveTotals();
  openModal(submitModal);
});
tourSubmitBtn?.addEventListener('click', handleSubmit);

btnInbox?.addEventListener('click', async () => {
  if (!currentUser) return;
  await renderInbox(currentUser.uid, meUserDoc, cachedUsers, cachedMatches);
  openModal(inboxModal);
});
btnRules?.addEventListener('click', () => openModal(rulesModal));
btnFindMe?.addEventListener('click', () => {
  if (!currentUser) return;
  const high = tourTableBody?.querySelector('tr.highlight');
  if (high) high.scrollIntoView({ behavior: 'smooth', block: 'center' });
});

btnViewTour?.addEventListener('click', () => {
  currentView = 'tour';
  rerenderBoard();
});
btnViewSwiss?.addEventListener('click', () => {
  currentView = 'swiss';
  rerenderBoard();
});

// ---------- auth + load ----------
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    if (needLoginBox) needLoginBox.style.display = 'block';
    if (tourTableBody) tourTableBody.innerHTML = '';
    return;
  }

  currentUser = user;
  if (needLoginBox) needLoginBox.style.display = 'none';

  try {
    cachedUsers = await fetchAllUsers();
    cachedMatches = await fetchAllTournamentMatches();
    meUserDoc = cachedUsers.find((u) => u.uid === user.uid) || null;

    eligibleOpponents = cachedUsers.filter((u) => u.uid !== user.uid);
    renderOpponentSelect(tourOpponent, eligibleOpponents);

    if (errorMeta) errorMeta.style.display = 'none';

    applyRulesToUI();
    rerenderBoard();
  } catch (err) {
    console.error(err);
    if (errorMeta) errorMeta.style.display = 'inline';
  }
});