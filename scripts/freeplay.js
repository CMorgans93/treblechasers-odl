// public/freeplay.js
// Freeplay = open ladder + selectable formats + points calculator + My Stats (members)

// Firebase ESM
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
  measurementId: "G-BNFG4TJ9MX"
};

const app  = initializeApp(firebaseConfig);
const db   = getFirestore(app);
const auth = getAuth(app);

isSupported().then(ok => {
  if (ok && location.protocol === 'https:') getAnalytics(app);
});

// ---------- DOM refs ----------
const needLoginBox = document.getElementById('needLoginBox');
const fpTableBody  = document.getElementById('fpTableBody');
const updatedMeta  = document.getElementById('updatedMeta');
const errorMeta    = document.getElementById('errorMeta');
const inboxCountEl = document.getElementById('inboxCount');

const btnSubmit    = document.getElementById('btnSubmit');
const submitModal  = document.getElementById('submitModal');

const btnInbox     = document.getElementById('btnInbox');
const inboxModal   = document.getElementById('inboxModal');
const inboxList    = document.getElementById('inboxList');

const btnFindMe    = document.getElementById('btnFindMe');
const btnRules     = document.getElementById('btnRules');
const rulesModal   = document.getElementById('rulesModal');
const notEligibleModal = document.getElementById('notEligibleModal');

const btnCalc      = document.getElementById('btnCalc');
const calcModal    = document.getElementById('calcModal');

const formatChip   = document.getElementById('formatChip');

// My Stats
const btnMyStats   = document.getElementById('btnMyStats');
const statsModal   = document.getElementById('statsModal');

const statsCountsBody      = document.getElementById('statsCountsBody');
const statsNonMemberUpsell = document.getElementById('statsNonMemberUpsell');

const statsMemberSummary   = document.getElementById('statsMemberSummary');
const statsGapValue        = document.getElementById('statsGapValue');
const statsGapSub          = document.getElementById('statsGapSub');

const statsMemberOnly      = document.getElementById('statsMemberOnly');
const statsPts             = document.getElementById('statsPts');
const statsRank            = document.getElementById('statsRank');
const statsGames           = document.getElementById('statsGames');
const statsWDL             = document.getElementById('statsWDL');
const statsLegDiff         = document.getElementById('statsLegDiff');
const statsAvg             = document.getElementById('statsAvg');

const statsFormatRows      = document.getElementById('statsFormatRows');
const rivalsBox            = document.getElementById('rivalsBox');
const statsHistory         = document.getElementById('statsHistory');

// Submit UI
const fpOpponentSearch = document.getElementById('fpOpponentSearch');
const fpOpponent  = document.getElementById('fpOpponent');

const fpGameType   = document.getElementById('fpGameType');
const fpLengthMode = document.getElementById('fpLengthMode');
const fpTarget     = document.getElementById('fpTarget');
const fpDido       = document.getElementById('fpDido');
const fpDidoWrap   = document.getElementById('fpDidoWrap');
const fpRuleNote   = document.getElementById('fpRuleNote');

const fpScoreLabel = document.getElementById('fpScoreLabel');
const fpScoreHelp  = document.getElementById('fpScoreHelp');
const fpMyLegs     = document.getElementById('fpMyLegs');
const fpOppLegs    = document.getElementById('fpOppLegs');

const fpBonusWrap  = document.getElementById('fpBonusWrap');
const fpAvgWrap    = document.getElementById('fpAvgWrap');

const fpMy171      = document.getElementById('fpMy171');
const fpMy100      = document.getElementById('fpMy100');
const fpMyBull     = document.getElementById('fpMyBull');
const fpMyDD       = document.getElementById('fpMyDD');

const fpOpp171     = document.getElementById('fpOpp171');
const fpOpp100     = document.getElementById('fpOpp100');
const fpOppBull    = document.getElementById('fpOppBull');
const fpOppDD      = document.getElementById('fpOppDD');

const fpMyAvg      = document.getElementById('fpMyAvg');
const fpOppAvg     = document.getElementById('fpOppAvg');

const fpSubmitBtn  = document.getElementById('fpSubmitBtn');
const fpSubmitNote = document.getElementById('fpSubmitNote');
const fpTotalsMine = document.getElementById('fpTotalsMine');
const fpTotalsOpp  = document.getElementById('fpTotalsOpp');

// Calculator UI
const calcOpponentSearch = document.getElementById('calcOpponentSearch');
const calcOpponent       = document.getElementById('calcOpponent');

const calcGameType   = document.getElementById('calcGameType');
const calcLengthMode = document.getElementById('calcLengthMode');
const calcTarget     = document.getElementById('calcTarget');
const calcDido       = document.getElementById('calcDido');
const calcDidoWrap   = document.getElementById('calcDidoWrap');
const calcRuleNote   = document.getElementById('calcRuleNote');

const calcScoreLabel = document.getElementById('calcScoreLabel');
const calcScoreHelp  = document.getElementById('calcScoreHelp');
const calcMyLegs     = document.getElementById('calcMyLegs');
const calcOppLegs    = document.getElementById('calcOppLegs');

const calcBonusWrap  = document.getElementById('calcBonusWrap');
const calcAvgWrap    = document.getElementById('calcAvgWrap');

const calcMy171      = document.getElementById('calcMy171');
const calcMy100      = document.getElementById('calcMy100');
const calcMyBull     = document.getElementById('calcMyBull');
const calcMyDD       = document.getElementById('calcMyDD');

const calcOpp171     = document.getElementById('calcOpp171');
const calcOpp100     = document.getElementById('calcOpp100');
const calcOppBull    = document.getElementById('calcOppBull');
const calcOppDD      = document.getElementById('calcOppDD');

const calcMyAvg      = document.getElementById('calcMyAvg');
const calcOppAvg     = document.getElementById('calcOppAvg');

const calcRunBtn     = document.getElementById('calcRunBtn');
const calcErr        = document.getElementById('calcErr');

const calcYouTotal   = document.getElementById('calcYouTotal');
const calcOppTotal   = document.getElementById('calcOppTotal');
const calcYouBreak   = document.getElementById('calcYouBreak');
const calcOppBreak   = document.getElementById('calcOppBreak');

// Charts canvases
const chartPointsCanvas  = document.getElementById('chartPoints');
const chartAvgCanvas     = document.getElementById('chartAvg');
const chartFormatsCanvas = document.getElementById('chartFormats');

// ---------- modal helpers (with scroll lock) ----------
function openModal(el){
  if (!el) return;
  el.classList.add('open');
  document.body.classList.add('modal-open');
}
function closeModal(el){
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
  if (overlay && !e.target.closest('.modal')) {
    closeModal(overlay);
  }
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    document.querySelectorAll('.modal-overlay.open').forEach(m => closeModal(m));
  }
});

// stats tabs
document.addEventListener('click', (e) => {
  const btn = e.target.closest('.tab-btn');
  if (!btn || !statsModal?.classList.contains('open')) return;

  const tabId = btn.getAttribute('data-tab');
  if (!tabId) return;

  statsModal.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');

  statsModal.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  const panel = document.getElementById(tabId);
  panel?.classList.add('active');
});

// ---------- utils ----------
const int = (v) => {
  const n = parseInt(v,10);
  return Number.isFinite(n) ? n : 0;
};
const flt = (v) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : null;
};
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
function safeName(u){
  return (u?.displayName || u?.name || '').trim() || 'Unknown';
}
// normalize division string from user doc
function normalizeDivision(raw) {
  if (!raw) return '';
  return String(raw).replace(/division/i,'').replace(/"/g,'').trim();
}
function divisionLabel(raw){
  const n = normalizeDivision(raw);
  return n ? `Div ${n}` : '-';
}
function setText(el, txt){
  if (!el) return;
  el.textContent = txt;
}
function fmtDate(ts){
  try{
    if (!ts) return '';
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleString();
  }catch{
    return '';
  }
}

// ---------- eligibility ----------
function canPlayFreeplay(userDoc, realDivMatches = 0) {
  if (!userDoc) return false;

  // members and admins always in
  const isMem =
    userDoc.isMember === true ||
    userDoc.isMember === 'true' ||
    userDoc.isMember === 1 ||
    userDoc.role === 'admin';

  if (isMem) return true;

  // freeplay access override (no member bonus)
  const freeplayOverride =
    userDoc.freeplayEnabled === true ||
    userDoc.freeplayEnabled === 'true' ||
    userDoc.freeplayEnabled === 1;

  if (freeplayOverride) return true;

  const rawPlayed =
    userDoc.divisionGamesPlayed ?? userDoc.divisionGames ??
    userDoc.leagueGamesPlayed ?? userDoc.leagueMatchesPlayed ?? 0;

  const docPlayed = Number(rawPlayed) || 0;
  const bestGuess = Math.max(docPlayed, realDivMatches);

  return bestGuess >= 5;
}

// ---------- scoring tables (division multipliers & leg penalties) ----------
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

// per-leg penalty (points lost per leg LOST) based on your div vs opp div
// per-leg penalty (points lost per leg LOST) based on your div vs opp div
// Div 1 = best, Div 10 = worst
// Penalty applies when YOU are the stronger division (lower number) playing a weaker division (higher number)
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

function getMultiplier(myDiv, theirDiv){
  const m = multipliers[myDiv]?.[theirDiv];
  if (!m) return 1;
  return m;
}
function getLegPenaltyPerLost(myDiv, theirDiv){
  const p = legPenalties[myDiv]?.[theirDiv];
  return Number.isFinite(p) ? p : 0;
}

// ---------- formats rules ----------
const formatRules = {
  '501': { legPts: 5, bonuses: true },
  '301': { legPts: 3, bonuses: true },
  '701': { legPts: 7, bonuses: true },
  'cricket': { legPts: 10, bonuses: false } // flat, no bonuses/avg/form/mults/penalties
};

function computeMaxLegs(gameType, lengthMode, target){
  const t = clamp(int(target), 1, 100);
  if (lengthMode === 'firstTo') {
    // max possible legs in first-to is 2t-1, but global cap is 100
    return Math.min(100, 2*t - 1);
  }
  // bestOf = exactly t max legs
  return Math.min(100, t);
}

function validateScore(lengthMode, target, myLegs, oppLegs){
  const t = clamp(int(target), 1, 100);
  const M = int(myLegs);
  const O = int(oppLegs);
  const total = M + O;

  if (M < 0 || O < 0) return { ok:false, msg:'Legs must be 0 or more.' };
  if (total === 0) return { ok:false, msg:'Enter a score.' };
  if (total > 100) return { ok:false, msg:'Max 100 total legs.' };

  if (lengthMode === 'bestOf') {
    if (total > t) return { ok:false, msg:`Best of ${t}: total legs must be ≤ ${t}.` };
    // win condition depends on odd/even
    if (t % 2 === 1) {
      const winTo = Math.floor(t/2) + 1;
      const someoneWon = (M >= winTo && M > O) || (O >= winTo && O > M);
      if (!someoneWon) return { ok:false, msg:`Best of ${t}: first to ${winTo} wins (no draws).` };
    } else {
      // even: allow draw at t/2 - t/2, or win to (t/2+1)
      const drawAt = t/2;
      const winTo = drawAt + 1;
      const isDraw = (M === drawAt && O === drawAt);
      const someoneWon = (M >= winTo && M > O) || (O >= winTo && O > M);
      if (!isDraw && !someoneWon) return { ok:false, msg:`Best of ${t}: win to ${winTo} or draw ${drawAt}-${drawAt}.` };
    }
    return { ok:true, msg:'' };
  }

  // firstTo
  const someoneWon = (M === t && M > O) || (O === t && O > M);
  if (!someoneWon) return { ok:false, msg:`First to ${t}: one player must reach ${t}.` };
  if (total > Math.min(100, 2*t - 1)) return { ok:false, msg:`First to ${t}: total legs too high.` };
  return { ok:true, msg:'' };
}

function outcomeFromScore(lengthMode, target, myLegs, oppLegs){
  const t = clamp(int(target), 1, 100);
  const M = int(myLegs);
  const O = int(oppLegs);

  if (lengthMode === 'bestOf' && t % 2 === 0) {
    const drawAt = t/2;
    if (M === drawAt && O === drawAt) return 'draw';
  }
  return (M > O) ? 'win' : 'loss';
}

// ---------- points ----------
function computeSidePoints({
  gameType,
  lengthMode,
  target,
  dido,
  myLegs,
  oppLegs,
  myDiv,
  oppDiv,
  bonus171=0,
  bonus100=0,
  bonusBull=0,
  bonusDD=0,
  myAvg=null,
  myFpAvg=null,
  myFormAvg=null
}){
  const rules = formatRules[gameType] || formatRules['501'];
  const M = int(myLegs);
  const O = int(oppLegs);
  const outcome = outcomeFromScore(lengthMode, target, M, O);

  // cricket: flat, no bonuses/avg/form/mults/penalties, plus +10 participation
  if (gameType === 'cricket') {
    const total = (rules.legPts * M) + 10;
    return {
      total,
      breakdown: [
        `Leg points: ${rules.legPts} × ${M} = ${rules.legPts * M}`,
        `Participation: +10`,
        `No bonuses / avgs / form / multipliers / penalties for Cricket`
      ],
      meta: { outcome, mult:1, legPenalty:0, avgBonus:0, formBonus:0, bonusTotal:0 }
    };
  }

  // base outcome points (keep “lose gets something” behaviour)
  const base = outcome === 'win' ? 30 : (outcome === 'draw' ? 10 : 5);

  // leg points
  let legPts = rules.legPts * M;
  if (dido) legPts *= 2;

  // bonuses (0–10 each) @ +10 per instance
  const b171  = clamp(int(bonus171), 0, 10);
  const b100  = clamp(int(bonus100), 0, 10);
  const bBull = clamp(int(bonusBull), 0, 10);
  const bDD   = clamp(int(bonusDD), 0, 10);
  const bonusTotal = 10 * (b171 + b100 + bBull + bDD);

  // multiplier + leg penalty (only when you are LOWER div playing higher div, per your table)
  const mult = getMultiplier(myDiv, oppDiv);
  const legPenaltyPerLeg = getLegPenaltyPerLost(myDiv, oppDiv);
  const legPenalty = legPenaltyPerLeg * O;

  // core before avg/form
  const preMult = base + legPts + bonusTotal;
  const afterMult = Math.round(preMult * mult);

  // avg bonus: +1 per 1.0 above FP avg (no cap)
  let avgBonus = 0;
  if (typeof myAvg === 'number' && typeof myFpAvg === 'number' && myAvg > myFpAvg) {
    avgBonus = Math.floor(myAvg - myFpAvg);
  }

  // form bonus: +1 per 1.0 above recent form avg (simple + safe)
  let formBonus = 0;
  if (typeof myAvg === 'number' && typeof myFormAvg === 'number' && myAvg > myFormAvg) {
    formBonus = Math.floor(myAvg - myFormAvg);
  }

  let total = afterMult - legPenalty + avgBonus + formBonus;
  if (total < 0) total = 0;

  const breakdown = [];
  breakdown.push(`Outcome: ${outcome.toUpperCase()} → ${base} pts`);
  breakdown.push(`Leg points: ${rules.legPts} × ${M}${dido ? ' ×2 (DIDO)' : ''} = ${legPts}`);
  breakdown.push(`Bonuses: 10 × (${b171}+${b100}+${bBull}+${bDD}) = ${bonusTotal}`);
  breakdown.push(`Subtotal: ${preMult}`);
  breakdown.push(`Multiplier: ×${mult} → ${afterMult}`);
  if (legPenalty) breakdown.push(`Leg-loss penalty: ${legPenaltyPerLeg} × ${O} = -${legPenalty}`);
  if (avgBonus) breakdown.push(`Avg bonus: +${avgBonus}`);
  if (formBonus) breakdown.push(`Form bonus: +${formBonus}`);
  breakdown.push(`Total: ${total}`);

  return {
    total,
    breakdown,
    meta: { outcome, mult, legPenalty, avgBonus, formBonus, bonusTotal }
  };
}

// ---------- Firestore reads ----------
async function fetchAllUsers(){
  const snap = await getDocs(collection(db, 'users'));
  const out = [];
  snap.forEach(d => out.push({ uid:d.id, ...d.data() }));
  return out;
}
async function fetchAllFreeplayMatches(){
  const snap = await getDocs(collection(db, 'freeplay', 'global', 'matches'));
  const out = [];
  snap.forEach(d => out.push({ id:d.id, ...d.data() }));
  return out;
}
async function fetchDivisionMatchCounts(){
  // counts CONFIRMED division matches per user across division-1..10
  const counts = {};
  const divIds = Array.from({length:10}, (_,i)=>`division-${i+1}`);
  for (const divId of divIds){
    const snap = await getDocs(collection(db, 'divisions', divId, 'matches'));
    snap.forEach(d => {
      const m = d.data();
      const confirmed = (m.locked === true) || (m.status === 'confirmed');
      if (!confirmed) return;
      if (m.p1) counts[m.p1] = (counts[m.p1]||0)+1;
      if (m.p2) counts[m.p2] = (counts[m.p2]||0)+1;
    });
  }
  return counts;
}

// ---------- leaderboard aggregation ----------
function shouldShowOnFreeplayBoard(userDoc, matches, realDivMatches){
  // show if eligible OR has at least one confirmed freeplay game (so they don’t vanish)
  const eligible = canPlayFreeplay(userDoc, realDivMatches);
  if (eligible) return true;
  const uid = userDoc.uid;
  return matches.some(m => (m.locked === true || m.status === 'confirmed') && (m.p1 === uid || m.p2 === uid));
}

function makeRow(u){
  return {
    uid:u.uid,
    name:safeName(u),
    isMember: (u?.role === 'admin' || u?.isMember === true || u?.isMember === 'true' || u?.isMember === 1),
    div: divisionLabel(u.division),
    games:0, wins:0, draws:0, losses:0,
    w301:0, w701:0, wCricket:0,
    legsFor:0, legsAgainst:0,
    c171:0, c100:0, cBull:0, cDD:0,
    fpPts:0,
    fpAvg:null, _avgSum:0, _avgN:0
  };
}

function buildLeaderboard(users, matches){
  const map = new Map();
  users.forEach(u => map.set(u.uid, makeRow(u)));

  matches.forEach(m => {
    const confirmed = (m.locked === true) || (m.status === 'confirmed');
    if (!confirmed) return;

    const gt = (m.gameType || '501').toString();
    const lenMode = (m.lengthMode || 'bestOf').toString();
    const target = int(m.target || 8);

    // p1
    if (m.p1 && map.has(m.p1)) {
      const r = map.get(m.p1);
      const M = int(m.p1Legs||0), O = int(m.p2Legs||0);
      r.games++;
      r.legsFor += M; r.legsAgainst += O;

      const out = outcomeFromScore(lenMode, target, M, O);
      if (out === 'win') r.wins++;
      else if (out === 'draw') r.draws++;
      else r.losses++;

      if (out === 'win') {
        if (gt === '301') r.w301++;
        if (gt === '701') r.w701++;
        if (gt === 'cricket') r.wCricket++;
      }

      r.c171 += int(m.p1BigVisits171Plus||0);
      r.c100 += int(m.p1HighCheckouts100Plus||0);
      r.cBull+= int(m.p1BullFinishes||0);
      r.cDD  += int(m.p1DoubleDoubleFinishes||0);

      r.fpPts += int(m.p1Points||0);

      const a = (typeof m.p1Avg === 'number') ? m.p1Avg : null;
      if (a != null) { r._avgSum += a; r._avgN++; }
    }

    // p2
    if (m.p2 && map.has(m.p2)) {
      const r = map.get(m.p2);
      const M = int(m.p2Legs||0), O = int(m.p1Legs||0);
      r.games++;
      r.legsFor += M; r.legsAgainst += O;

      const out = outcomeFromScore(lenMode, target, M, O);
      if (out === 'win') r.wins++;
      else if (out === 'draw') r.draws++;
      else r.losses++;

      if (out === 'win') {
        if (gt === '301') r.w301++;
        if (gt === '701') r.w701++;
        if (gt === 'cricket') r.wCricket++;
      }

      r.c171 += int(m.p2BigVisits171Plus||0);
      r.c100 += int(m.p2HighCheckouts100Plus||0);
      r.cBull+= int(m.p2BullFinishes||0);
      r.cDD  += int(m.p2DoubleDoubleFinishes||0);

      r.fpPts += int(m.p2Points||0);

      const a = (typeof m.p2Avg === 'number') ? m.p2Avg : null;
      if (a != null) { r._avgSum += a; r._avgN++; }
    }
  });

  const rows = Array.from(map.values());
  rows.forEach(r => {
    r.fpAvg = r._avgN ? (r._avgSum / r._avgN) : null;
  });

  rows.sort((a,b)=> (b.fpPts - a.fpPts) || ((b.wins - a.wins)) || (a.name.localeCompare(b.name)));
  return rows;
}

function renderLeaderboard(rows, meUid){
  if (!fpTableBody) return;
  fpTableBody.innerHTML = '';

  rows.forEach((r, idx) => {
    const tr = document.createElement('tr');
    if (meUid && r.uid === meUid) tr.classList.add('highlight');

    const ld = r.legsFor - r.legsAgainst;
    const ldHtml = ld >= 0 ? `<span class="diff-pos">+${ld}</span>` : `<span class="diff-neg">${ld}</span>`;

    tr.innerHTML = `
      <td>${idx+1}</td>
      <td>${r.isMember
     ? `<span class="name member-name" data-uid="${r.uid}">${r.name}</span> <span class="member-badge">M</span>`
     : `<span class="name" data-uid="${r.uid}">${r.name}</span>`
      }</td>
      <td>${r.div}</td>
      <td>${r.games}</td>
      <td>${r.wins}</td>
      <td>${r.draws}</td>
      <td>${r.losses}</td>
      <td>${r.w301}</td>
      <td>${r.w701}</td>
      <td>${r.wCricket}</td>
      <td>${r.legsFor}</td>
      <td>${r.legsAgainst}</td>
      <td>${ldHtml}</td>
      <td>${r.c171}</td>
      <td>${r.c100}</td>
      <td>${r.cBull}</td>
      <td>${r.cDD}</td>
      <td>${r.fpAvg != null ? r.fpAvg.toFixed(1) : '-'}</td>
      <td><strong>${r.fpPts}</strong></td>
    `;
    fpTableBody.appendChild(tr);
  });
}

// ---------- inbox ----------
function isPendingForUser(m, uid){
  if (!uid) return false;
  if (m.locked === true || m.status === 'confirmed') return false;
  if (m.status === 'disputed') return false;
  // pending if user is in match and did NOT submit it
  const inMatch = (m.p1 === uid || m.p2 === uid);
  if (!inMatch) return false;
  return m.reportedBy && m.reportedBy !== uid;
}
function computeInboxCount(uid, matches){
  return matches.filter(m => isPendingForUser(m, uid)).length;
}

async function renderInbox(meUid, users, matches){
  if (!inboxList) return;
  inboxList.innerHTML = '';

  const pending = matches
    .filter(m => isPendingForUser(m, meUid))
    .sort((a,b)=> {
      const da = a.reportedAt?.toMillis ? a.reportedAt.toMillis() : 0;
      const db = b.reportedAt?.toMillis ? b.reportedAt.toMillis() : 0;
      return db - da;
    });

  if (!pending.length){
    inboxList.innerHTML = `<div class="fixture-item"><div class="status ok">No pending confirmations 🎯</div></div>`;
    return;
  }

  const byId = new Map(users.map(u => [u.uid, u]));

  pending.forEach(m => {
    const p1 = byId.get(m.p1);
    const p2 = byId.get(m.p2);

    const card = document.createElement('div');
    card.className = 'fixture-item';

    const gt = (m.gameType || '501').toUpperCase();
    const t  = int(m.target || 8);
    const mode = (m.lengthMode || 'bestOf') === 'firstTo' ? 'First to' : 'Best of';

    const title = document.createElement('div');
    title.innerHTML = `<strong>${safeName(p1)} vs ${safeName(p2)}</strong> <span class="chip">${gt}</span> <span class="chip">${mode} ${t}</span>`;
    card.appendChild(title);

    const score = document.createElement('div');
    score.className = 'note';
    score.textContent = `Score: ${int(m.p1Legs)}-${int(m.p2Legs)} • Submitted: ${fmtDate(m.reportedAt)}`;
    card.appendChild(score);

    const actions = document.createElement('div');
    actions.className = 'row';

    const btnConfirm = document.createElement('button');
    btnConfirm.className = 'btn btn-primary';
    btnConfirm.textContent = 'Confirm';
    btnConfirm.onclick = async () => {
      await updateDoc(doc(db, 'freeplay', 'global', 'matches', m.id), {
        status: 'confirmed',
        locked: true,
        confirmedAt: serverTimestamp(),
        confirmedBy: meUid,
      });
      cachedMatches = await fetchAllFreeplayMatches();
      await renderInbox(meUid, users, cachedMatches);
      rerenderBoard();
    };

    const btnDispute = document.createElement('button');
    btnDispute.className = 'btn btn-ghost';
    btnDispute.textContent = 'Dispute';
    btnDispute.onclick = async () => {
      const reason = prompt('Reason for dispute? (optional)');
      await updateDoc(doc(db, 'freeplay', 'global', 'matches', m.id), {
        status: 'disputed',
        locked: false,
        disputeBy: meUid,
        disputeReason: reason || '',
        disputedAt: serverTimestamp(),
      });
      cachedMatches = await fetchAllFreeplayMatches();
      await renderInbox(meUid, users, cachedMatches);
      rerenderBoard();
    };

    actions.appendChild(btnConfirm);
    actions.appendChild(btnDispute);
    card.appendChild(actions);

    inboxList.appendChild(card);
  });
}

// ---------- state ----------
let cachedUsers = [];
let cachedMatches = [];
let cachedDivMatchCounts = {};
let currentUser = null;
let eligibleOpponents = [];

// Charts instances
let chartPoints = null;
let chartAvg = null;
let chartFormats = null;

// ---------- bonus select init ----------
function initBonusSelect(el, label){
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

// submit group
initBonusSelect(fpMy171, '171+'); initBonusSelect(fpMy100, '100+'); initBonusSelect(fpMyBull, 'Bull'); initBonusSelect(fpMyDD, 'D/D');
initBonusSelect(fpOpp171,'171+'); initBonusSelect(fpOpp100,'100+'); initBonusSelect(fpOppBull,'Bull'); initBonusSelect(fpOppDD,'D/D');

// calc group
initBonusSelect(calcMy171, '171+'); initBonusSelect(calcMy100, '100+'); initBonusSelect(calcMyBull, 'Bull'); initBonusSelect(calcMyDD, 'D/D');
initBonusSelect(calcOpp171,'171+'); initBonusSelect(calcOpp100,'100+'); initBonusSelect(calcOppBull,'Bull'); initBonusSelect(calcOppDD,'D/D');

// ---------- opponent select / search ----------
function renderOpponentSelect(el, list){
  if (!el) return;
  el.innerHTML = '';
  list.forEach(u => {
    const opt = document.createElement('option');
    opt.value = u.uid;
    opt.textContent = safeName(u);
    el.appendChild(opt);
  });
}

function filterListBySearch(q, list){
  const t = (q || '').toLowerCase();
  return list.filter(u => safeName(u).toLowerCase().includes(t));
}

// ---------- UI rules toggles ----------
function applyRulesToUI(scope){
  const isCalc = scope === 'calc';
  const gt   = (isCalc ? calcGameType : fpGameType)?.value || '501';
  const dido = (isCalc ? calcDido : fpDido);
  const didoWrap = isCalc ? calcDidoWrap : fpDidoWrap;
  const note = isCalc ? calcRuleNote : fpRuleNote;
  const scoreHelp = isCalc ? calcScoreHelp : fpScoreHelp;
  const bonusWrap = isCalc ? calcBonusWrap : fpBonusWrap;
  const avgWrap   = isCalc ? calcAvgWrap : fpAvgWrap;

  // cricket disables dido, hides bonuses + avgs
  if (gt === 'cricket') {
    if (dido) dido.checked = false;
    if (dido) dido.disabled = true;
    if (didoWrap) didoWrap.style.opacity = '0.5';
    if (bonusWrap) bonusWrap.style.display = 'none';
    if (avgWrap) avgWrap.style.display = 'none';
    if (note) note.textContent = 'Cricket: flat scoring, no bonuses/avgs/form/multipliers.';
  } else {
    if (dido) dido.disabled = false;
    if (didoWrap) didoWrap.style.opacity = '1';
    if (bonusWrap) bonusWrap.style.display = '';
    if (avgWrap) avgWrap.style.display = '';
    if (note) note.textContent = '501/301/701: bonuses + avg/form + div multipliers/penalties apply.';
  }

  // label helper
  const mode = (isCalc ? calcLengthMode : fpLengthMode)?.value || 'bestOf';
  const target = int((isCalc ? calcTarget : fpTarget)?.value || 8);
  const maxLegs = computeMaxLegs(gt, mode, target);
  if (scoreHelp) scoreHelp.textContent = `Max legs: ${maxLegs} (cap 100).`;
  if (formatChip) formatChip.textContent = `SOP: Best of 8`;
}

// bind UI changes
[fpGameType, fpLengthMode, fpTarget, fpDido].forEach(el => el?.addEventListener('change', ()=>{applyRulesToUI('fp'); updateLiveTotals();}));
[calcGameType, calcLengthMode, calcTarget, calcDido].forEach(el => el?.addEventListener('change', ()=>{applyRulesToUI('calc');}));

// ---------- live totals (submit modal) ----------
function getUserByUid(uid){ return cachedUsers.find(u => u.uid === uid); }
function getDivNum(u){
  const n = parseInt(normalizeDivision(u?.division), 10);
  return Number.isFinite(n) ? n : null;
}

function computeRecentFormAvg(uid){
  // simple: use last 8 confirmed matches that have an avg for this uid
  const mine = cachedMatches
    .filter(m => (m.locked===true || m.status==='confirmed') && (m.p1===uid || m.p2===uid))
    .sort((a,b)=> {
      const da = a.confirmedAt?.toMillis ? a.confirmedAt.toMillis() : (a.reportedAt?.toMillis ? a.reportedAt.toMillis() : 0);
      const db = b.confirmedAt?.toMillis ? b.confirmedAt.toMillis() : (b.reportedAt?.toMillis ? b.reportedAt.toMillis() : 0);
      return db - da;
    });

  const avgs = [];
  for (const m of mine){
    if (m.p1===uid && typeof m.p1Avg==='number') avgs.push(m.p1Avg);
    if (m.p2===uid && typeof m.p2Avg==='number') avgs.push(m.p2Avg);
    if (avgs.length >= 8) break;
  }
  if (!avgs.length) return null;
  return avgs.reduce((a,b)=>a+b,0)/avgs.length;
}

function updateLiveTotals(){
  if (!currentUser) return;
  const oppUid = fpOpponent?.value;
  const oppUser = getUserByUid(oppUid);
  const meUser  = getUserByUid(currentUser.uid);
  if (!oppUser || !meUser) return;

  const meDiv = getDivNum(meUser) ?? 10;
  const opDiv = getDivNum(oppUser) ?? 10;

  const gt = fpGameType.value;
  const mode = fpLengthMode.value;
  const target = int(fpTarget.value || 8);

  const meForm = computeRecentFormAvg(currentUser.uid);
  const opForm = computeRecentFormAvg(oppUid);

  const mePts = computeSidePoints({
    gameType:gt,
    lengthMode:mode,
    target,
    dido: !!fpDido.checked,
    myLegs: fpMyLegs.value,
    oppLegs: fpOppLegs.value,
    myDiv: meDiv,
    oppDiv: opDiv,
    bonus171: fpMy171?.value,
    bonus100: fpMy100?.value,
    bonusBull: fpMyBull?.value,
    bonusDD: fpMyDD?.value,
    myAvg: flt(fpMyAvg?.value),
    myFpAvg: null,
    myFormAvg: meForm
  });

  const opPts = computeSidePoints({
    gameType:gt,
    lengthMode:mode,
    target,
    dido: !!fpDido.checked,
    myLegs: fpOppLegs.value,
    oppLegs: fpMyLegs.value,
    myDiv: opDiv,
    oppDiv: meDiv,
    bonus171: fpOpp171?.value,
    bonus100: fpOpp100?.value,
    bonusBull: fpOppBull?.value,
    bonusDD: fpOppDD?.value,
    myAvg: flt(fpOppAvg?.value),
    myFpAvg: null,
    myFormAvg: opForm
  });

  if (fpTotalsMine) fpTotalsMine.innerHTML = `<small>You: <strong>Total ${mePts.total}</strong></small>`;
  if (fpTotalsOpp) fpTotalsOpp.innerHTML = `<small>Opponent: <strong>Total ${opPts.total}</strong></small>`;
}

// trigger live totals on score/bonus/avg input
[fpMyLegs, fpOppLegs, fpMyAvg, fpOppAvg].forEach(el => el?.addEventListener('input', updateLiveTotals));
[fpMy171, fpMy100, fpMyBull, fpMyDD, fpOpp171, fpOpp100, fpOppBull, fpOppDD].forEach(el => el?.addEventListener('change', updateLiveTotals));

// ---------- submit ----------
async function handleSubmit(){
  if (!currentUser) return;
  const meUid = currentUser.uid;
  const oppUid = fpOpponent.value;
  if (!oppUid) return;

  const meUser  = getUserByUid(meUid);
  const oppUser = getUserByUid(oppUid);
  if (!meUser || !oppUser) return;

  const mode = fpLengthMode.value;
  const gt   = fpGameType.value;
  const target = int(fpTarget.value || 8);

  const val = validateScore(mode, target, fpMyLegs.value, fpOppLegs.value);
  if (!val.ok){
    fpSubmitNote.style.display = 'block';
    fpSubmitNote.textContent = val.msg;
    return;
  }
  fpSubmitNote.style.display = 'none';

  const meDiv = getDivNum(meUser) ?? 10;
  const opDiv = getDivNum(oppUser) ?? 10;

  const meForm = computeRecentFormAvg(meUid);
  const opForm = computeRecentFormAvg(oppUid);

  const mePts = computeSidePoints({
    gameType:gt, lengthMode:mode, target,
    dido: !!fpDido.checked,
    myLegs: fpMyLegs.value,
    oppLegs: fpOppLegs.value,
    myDiv: meDiv, oppDiv: opDiv,
    bonus171: fpMy171.value, bonus100: fpMy100.value, bonusBull: fpMyBull.value, bonusDD: fpMyDD.value,
    myAvg: flt(fpMyAvg.value),
    myFormAvg: meForm
  });

  const opPts = computeSidePoints({
    gameType:gt, lengthMode:mode, target,
    dido: !!fpDido.checked,
    myLegs: fpOppLegs.value,
    oppLegs: fpMyLegs.value,
    myDiv: opDiv, oppDiv: meDiv,
    bonus171: fpOpp171.value, bonus100: fpOpp100.value, bonusBull: fpOppBull.value, bonusDD: fpOppDD.value,
    myAvg: flt(fpOppAvg.value),
    myFormAvg: opForm
  });

  await addDoc(collection(db, 'freeplay', 'global', 'matches'), {
    p1: meUid,
    p2: oppUid,

    gameType: gt,
    lengthMode: mode,
    target,
    dido: !!fpDido.checked,

    p1Legs: int(fpMyLegs.value),
    p2Legs: int(fpOppLegs.value),

    p1BigVisits171Plus: int(fpMy171.value),
    p1HighCheckouts100Plus: int(fpMy100.value),
    p1BullFinishes: int(fpMyBull.value),
    p1DoubleDoubleFinishes: int(fpMyDD.value),
    p1Avg: flt(fpMyAvg.value),

    p2BigVisits171Plus: int(fpOpp171.value),
    p2HighCheckouts100Plus: int(fpOpp100.value),
    p2BullFinishes: int(fpOppBull.value),
    p2DoubleDoubleFinishes: int(fpOppDD.value),
    p2Avg: flt(fpOppAvg.value),

    p1Points: mePts.total,
    p2Points: opPts.total,

    reportedBy: meUid,
    reportedAt: serverTimestamp(),

    status: 'pending',
    locked: false,
  });

  cachedMatches = await fetchAllFreeplayMatches();
  closeModal(submitModal);
  rerenderBoard();
}

// ---------- calculator ----------
function runCalculator(){
  if (!currentUser) return;

  const meUser = getUserByUid(currentUser.uid);
  const oppUser = getUserByUid(calcOpponent.value);

  if (!meUser || !oppUser){
    calcErr.style.display = 'block';
    calcErr.textContent = 'Select an opponent.';
    return;
  }

  const gt = calcGameType.value;
  const mode = calcLengthMode.value;
  const target = int(calcTarget.value || 8);

  const val = validateScore(mode, target, calcMyLegs.value, calcOppLegs.value);
  if (!val.ok){
    calcErr.style.display = 'block';
    calcErr.textContent = val.msg;
    return;
  }
  calcErr.style.display = 'none';

  const meDiv = getDivNum(meUser) ?? 10;
  const opDiv = getDivNum(oppUser) ?? 10;

  const meForm = computeRecentFormAvg(currentUser.uid);
  const opForm = computeRecentFormAvg(oppUser.uid);

  const mePts = computeSidePoints({
    gameType:gt, lengthMode:mode, target,
    dido: !!calcDido.checked,
    myLegs: calcMyLegs.value,
    oppLegs: calcOppLegs.value,
    myDiv: meDiv, oppDiv: opDiv,
    bonus171: calcMy171.value, bonus100: calcMy100.value, bonusBull: calcMyBull.value, bonusDD: calcMyDD.value,
    myAvg: flt(calcMyAvg.value),
    myFormAvg: meForm
  });

  const opPts = computeSidePoints({
    gameType:gt, lengthMode:mode, target,
    dido: !!calcDido.checked,
    myLegs: calcOppLegs.value,
    oppLegs: calcMyLegs.value,
    myDiv: opDiv, oppDiv: meDiv,
    bonus171: calcOpp171.value, bonus100: calcOpp100.value, bonusBull: calcOppBull.value, bonusDD: calcOppDD.value,
    myAvg: flt(calcOppAvg.value),
    myFormAvg: opForm
  });

  setText(calcYouTotal, String(mePts.total));
  setText(calcOppTotal, String(opPts.total));

  calcYouBreak.innerHTML = `<ul>${mePts.breakdown.map(x=>`<li>${x}</li>`).join('')}</ul>`;
  calcOppBreak.innerHTML = `<ul>${opPts.breakdown.map(x=>`<li>${x}</li>`).join('')}</ul>`;
}

// ---------- My Stats helpers ----------
async function getChartJs(){
  // lazy-load Chart.js (try ESM import first, then UMD script fallback)
  // This avoids blank charts on hosts/browsers that block cross-origin ESM imports.
  if (window.Chart) {
    try{
      // If registerables exist (UMD bundle), register them once
      if (window.Chart.register && window.Chart.registerables && !window.__TC_CHART_REGISTERED){
        window.Chart.register(...window.Chart.registerables);
        window.__TC_CHART_REGISTERED = true;
      }
    }catch{}
    return window.Chart;
  }

  // cache promise so we only try once
  if (window.__TC_CHART_PROMISE) return window.__TC_CHART_PROMISE;

  function loadScript(src){
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.async = true;
      s.onload = () => resolve(true);
      s.onerror = () => reject(new Error('Failed to load ' + src));
      document.head.appendChild(s);
    });
  }

  window.__TC_CHART_PROMISE = (async () => {
    // 1) Try ESM import (works on most modern setups)
    try{
      const mod = await import('https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.js');
      if (mod?.Chart?.register && mod?.registerables){
        mod.Chart.register(...mod.registerables);
      }
      return mod.Chart || null;
    }catch(e){
      // fall through
    }

    // 2) Fallback: UMD bundle via script tag (more compatible)
    try{
      await loadScript('https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js');
      if (window.Chart) {
        try{
          if (window.Chart.register && window.Chart.registerables && !window.__TC_CHART_REGISTERED){
            window.Chart.register(...window.Chart.registerables);
            window.__TC_CHART_REGISTERED = true;
          }
        }catch{}
        return window.Chart;
      }
    }catch(e){
      // fall through
    }

    return null;
  })();

  return window.__TC_CHART_PROMISE;
}

function destroyCharts(){
  try{ chartPoints?.destroy(); }catch{}
  try{ chartAvg?.destroy(); }catch{}
  try{ chartFormats?.destroy(); }catch{}
  chartPoints = chartAvg = chartFormats = null;
}

function computeMemberTimeline(uid){
  const out = [];
  const byId = new Map(cachedUsers.map(u => [u.uid, u]));
  const mine = cachedMatches
    .filter(m => (m.locked===true || m.status==='confirmed') && (m.p1===uid || m.p2===uid))
    .sort((a,b)=> {
      const da = a.confirmedAt?.toMillis ? a.confirmedAt.toMillis() : (a.reportedAt?.toMillis ? a.reportedAt.toMillis() : 0);
      const db = b.confirmedAt?.toMillis ? b.confirmedAt.toMillis() : (b.reportedAt?.toMillis ? b.reportedAt.toMillis() : 0);
      return da - db;
    });

  mine.forEach(m => {
    const isP1 = m.p1 === uid;
    const meLegs = int(isP1 ? m.p1Legs : m.p2Legs);
    const opLegs = int(isP1 ? m.p2Legs : m.p1Legs);
    const pts = int(isP1 ? m.p1Points : m.p2Points);
    const avg = (isP1 ? m.p1Avg : m.p2Avg);
    const oppUid = isP1 ? m.p2 : m.p1;
    const opp = byId.get(oppUid);

    out.push({
      id: m.id,
      when: m.confirmedAt || m.reportedAt,
      gameType: (m.gameType || '501'),
      lengthMode: (m.lengthMode || 'bestOf'),
      target: int(m.target || 8),
      dido: !!m.dido,
      meLegs, opLegs,
      points: pts,
      avg: (typeof avg === 'number' ? avg : null),
      oppName: safeName(opp),
    });
  });

  // compute cumulative points
  let run = 0;
  out.forEach(x => { run += x.points; x.cum = run; });
  return out;
}

function renderFormatBreakdown(timeline){
  if (!statsFormatRows) return;
  const buckets = {
    '501': {g:0,w:0,l:0,d:0},
    '301': {g:0,w:0,l:0,d:0},
    '701': {g:0,w:0,l:0,d:0},
    'cricket': {g:0,w:0,l:0,d:0}
  };

  timeline.forEach(t => {
    const k = (t.gameType || '501');
    const b = buckets[k] || (buckets[k]={g:0,w:0,l:0,d:0});
    b.g++;
    const out = outcomeFromScore(t.lengthMode, t.target, t.meLegs, t.opLegs);
    if (out === 'win') b.w++;
    else if (out === 'draw') b.d++;
    else b.l++;
  });

  statsFormatRows.innerHTML = Object.entries(buckets).map(([k,v]) => {
    return `<div class="note"><strong>${k.toUpperCase()}</strong> — Games: ${v.g} • W/D/L: ${v.w}/${v.d}/${v.l}</div>`;
  }).join('');
}

function computeRivals(uid, timeline){
  const map = new Map();
  timeline.forEach(t => {
    const k = t.oppName;
    const e = map.get(k) || { name:k, games:0, ptsFor:0, ptsAgainst:0, wins:0, losses:0, draws:0 };
    e.games++;
    e.ptsFor += t.points;
    const out = outcomeFromScore(t.lengthMode, t.target, t.meLegs, t.opLegs);
    if (out === 'win') e.wins++;
    else if (out === 'draw') e.draws++;
    else e.losses++;
    map.set(k, e);
  });
  return Array.from(map.values()).sort((a,b)=> b.games-a.games || (b.wins-a.wins));
}

function renderRivalsBox(items){
  if (!rivalsBox) return;
  rivalsBox.innerHTML = '';
  if (!items.length){
    rivalsBox.innerHTML = `<div class="fixture-item"><div class="status warn">No confirmed games yet.</div></div>`;
    return;
  }
  items.slice(0,8).forEach(r => {
    const card = document.createElement('div');
    card.className = 'fixture-item';
    card.innerHTML = `
      <strong>${r.name}</strong>
      <div class="note">Games: ${r.games} • W/D/L: ${r.wins}/${r.draws}/${r.losses}</div>
      <div class="note">Points for: ${r.ptsFor}</div>
    `;
    rivalsBox.appendChild(card);
  });
}

function renderHistory(timeline){
  if (!statsHistory) return;
  statsHistory.innerHTML = '';
  const items = [...timeline].sort((a,b)=> {
    const da = a.when?.toMillis ? a.when.toMillis() : 0;
    const db = b.when?.toMillis ? b.when.toMillis() : 0;
    return db - da;
  }).slice(0,12);

  if (!items.length){
    statsHistory.innerHTML = `<div class="fixture-item"><div class="status warn">No confirmed games yet.</div></div>`;
    return;
  }

  items.forEach(t => {
    const card = document.createElement('div');
    card.className = 'fixture-item';
    const out = outcomeFromScore(t.lengthMode, t.target, t.meLegs, t.opLegs).toUpperCase();
    const mode = t.lengthMode === 'firstTo' ? 'First to' : 'Best of';
    card.innerHTML = `
      <div><strong>${t.gameType.toUpperCase()}</strong> • ${mode} ${t.target} ${t.dido ? '• DIDO' : ''}</div>
      <div class="note">vs ${t.oppName} • Score ${t.meLegs}-${t.opLegs} • ${out} • +${t.points} pts</div>
      <div class="note">${fmtDate(t.when)}</div>
    `;
    statsHistory.appendChild(card);
  });
}

function renderChasing(rows, meUid){
  if (!statsGapValue || !statsGapSub) return;
  const idx = rows.findIndex(r => r.uid === meUid);
  if (idx <= 0){
    setText(statsGapValue, '0');
    setText(statsGapSub, idx === 0 ? 'You are top of the leaderboard 🎯' : 'No rank yet.');
    return;
  }
  const me = rows[idx];
  const above = rows[idx-1];
  const gap = Math.max(0, int(above.fpPts) - int(me.fpPts));
  setText(statsGapValue, String(gap));
  setText(statsGapSub, `Next: ${above.name} (${above.fpPts} pts). You: ${me.fpPts} pts.`);
}

// charts
async function renderCharts(timeline){
  destroyCharts();
  const Chart = await getChartJs();
  if (!Chart){
    const msg = 'Charts unavailable (Chart.js failed to load). If you use an adblocker/CSP, allow cdn.jsdelivr.net.';
    try{
      const targets = [chartPointsCanvas, chartAvgCanvas, chartFormatsCanvas].filter(Boolean);
      targets.forEach(cv => {
        const box = cv.parentElement;
        if (box && box.querySelector && box.querySelector('canvas')) {
          box.innerHTML = `<div class="note" style="padding:12px;">${msg}</div>`;
        }
      });
    }catch{}
    return;
  }

  const labels = timeline.map((_,i)=> String(i+1));

  if (chartPointsCanvas){
    chartPoints = new Chart(chartPointsCanvas, {
      type: 'line',
      data: {
        labels,
        datasets: [{ label:'Cumulative points', data: timeline.map(t=>t.cum) }]
      },
      options: { responsive:true, maintainAspectRatio:false, animation:false, resizeDelay:150 }
    });
  }

  if (chartAvgCanvas){
    chartAvg = new Chart(chartAvgCanvas, {
      type: 'line',
      data: {
        labels,
        datasets: [{ label:'Match avg', data: timeline.map(t=>t.avg) }]
      },
      options: { responsive:true, maintainAspectRatio:false, spanGaps:true, animation:false, resizeDelay:150 }
    });
  }

  if (chartFormatsCanvas){
    const counts = { '501':0,'301':0,'701':0,'cricket':0 };
    timeline.forEach(t => { counts[t.gameType] = (counts[t.gameType]||0)+1; });
    chartFormats = new Chart(chartFormatsCanvas, {
      type: 'doughnut',
      data: {
        labels: Object.keys(counts).map(k=>k.toUpperCase()),
        datasets: [{ label:'Games', data: Object.values(counts) }]
      },
      options: { responsive:true, maintainAspectRatio:false, animation:false, resizeDelay:150 }
    });
  }
}

async function renderMyStats(){
  if (!currentUser) return;
  const meUid = currentUser.uid;
  const me = getUserByUid(meUid);

  // member?
  const member =
    me?.isMember === true || me?.isMember === 'true' || me?.isMember === 1 || me?.role === 'admin';

  // counts for everyone (confirmed/pending per format)
  const formats = ['501','301','701','cricket'];
  const counts = formats.map(f => {
    const confirmed = cachedMatches.filter(m => (m.locked===true || m.status==='confirmed') && (m.gameType||'501')===f && (m.p1===meUid || m.p2===meUid)).length;
    const pending = cachedMatches.filter(m => (m.gameType||'501')===f && isPendingForUser(m, meUid)).length;
    return { f, confirmed, pending };
  });

  if (statsCountsBody){
    statsCountsBody.innerHTML = counts.map(c => `
      <tr>
        <td>${c.f.toUpperCase()}</td>
        <td>${c.confirmed}</td>
        <td>${c.pending}</td>
      </tr>
    `).join('');
  }

  // toggle sections
  if (statsNonMemberUpsell) statsNonMemberUpsell.style.display = member ? 'none' : 'block';
  if (statsMemberSummary) statsMemberSummary.style.display = member ? 'block' : 'none';
  if (statsMemberOnly) statsMemberOnly.style.display = member ? 'block' : 'none';

  destroyCharts();
  if (!member) return;

  // build rows + chasing
  const usersForBoard = cachedUsers.filter(u => {
    const realPlayed = cachedDivMatchCounts[u.uid] || 0;
    return shouldShowOnFreeplayBoard(u, cachedMatches, realPlayed);
  });
  const rows = buildLeaderboard(usersForBoard, cachedMatches);

  renderChasing(rows, meUid);

  const myRow = rows.find(r => r.uid === meUid) || null;
  if (myRow) {
    setText(statsPts, String(myRow.fpPts || 0));
    const rank = rows.findIndex(r => r.uid === meUid) + 1;
    setText(statsRank, rank ? `Rank: #${rank} / ${rows.length}` : 'Rank: —');
    setText(statsGames, String(myRow.games || 0));
    setText(statsWDL, `W/D/L: ${myRow.wins||0}/${myRow.draws||0}/${myRow.losses||0}`);
    const ld = (myRow.legsFor||0) - (myRow.legsAgainst||0);
    setText(statsLegDiff, ld >= 0 ? `+${ld}` : String(ld));
    setText(statsAvg, `${myRow.fpAvg != null ? myRow.fpAvg.toFixed(1) : '-'}`);
  }

  const timeline = computeMemberTimeline(meUid);
  renderFormatBreakdown(timeline);
  renderRivalsBox(computeRivals(meUid, timeline));
  await renderCharts(timeline);
  renderHistory(timeline);
}

// ---------- rerender ----------
function rerenderBoard(){
  if (!currentUser) return;
  const meUid = currentUser.uid;

  const usersForBoard = cachedUsers.filter(u => {
    const realPlayed = cachedDivMatchCounts[u.uid] || 0;
    return shouldShowOnFreeplayBoard(u, cachedMatches, realPlayed);
  });

  const rows = buildLeaderboard(usersForBoard, cachedMatches);
  renderLeaderboard(rows, meUid);

  setText(updatedMeta, `Last updated: ${new Date().toLocaleString()}`);
  if (inboxCountEl) {
    setText(inboxCountEl, String(computeInboxCount(meUid, cachedMatches)));
  }
}

// ---------- click handlers ----------
document.addEventListener('input', (e) => {
  if (e.target === fpOpponentSearch) {
    const filtered = filterListBySearch(fpOpponentSearch.value, eligibleOpponents);
    renderOpponentSelect(fpOpponent, filtered);
    updateLiveTotals();
  }
  if (e.target === calcOpponentSearch) {
    const filtered = filterListBySearch(calcOpponentSearch.value, eligibleOpponents);
    renderOpponentSelect(calcOpponent, filtered);
  }
});

// ---------- buttons ----------
btnSubmit?.addEventListener('click', () => {
  if (!currentUser) return;
  const meUser = cachedUsers.find(u => u.uid === currentUser.uid);
  const realPlayed = cachedDivMatchCounts[currentUser.uid] || 0;
  if (!meUser || !canPlayFreeplay(meUser, realPlayed)) {
    openModal(notEligibleModal);
    return;
  }
  applyRulesToUI('fp');
  updateLiveTotals();
  openModal(submitModal);
});

fpSubmitBtn?.addEventListener('click', handleSubmit);

btnInbox?.addEventListener('click', async () => {
  await renderInbox(currentUser?.uid, cachedUsers, cachedMatches);
  openModal(inboxModal);
});

btnRules?.addEventListener('click', () => openModal(rulesModal));

btnFindMe?.addEventListener('click', () => {
  if (!currentUser) return;
  const high = fpTableBody.querySelector('tr.highlight');
  if (high) high.scrollIntoView({ behavior: 'smooth', block: 'center' });
});

btnCalc?.addEventListener('click', () => {
  if (!currentUser) return;
  applyRulesToUI('calc');
  openModal(calcModal);
});

calcRunBtn?.addEventListener('click', runCalculator);

btnMyStats?.addEventListener('click', async () => {
  if (!currentUser) return;
  openModal(statsModal);
  await new Promise(r => requestAnimationFrame(r));
  await renderMyStats();
  // one-time “settle” resize to prevent post-render stretching/jumping
  setTimeout(() => {
    try { chartPoints?.resize(); } catch {}
    try { chartAvg?.resize(); } catch {}
    try { chartFormats?.resize(); } catch {}
  }, 150);
});
// ---------- auth + load ----------
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    if (needLoginBox) needLoginBox.style.display = 'block';
    renderLeaderboard([], null);
    return;
  }

  currentUser = user;
  if (needLoginBox) needLoginBox.style.display = 'none';

  try {
    cachedUsers          = await fetchAllUsers();
    cachedMatches        = await fetchAllFreeplayMatches();
    cachedDivMatchCounts = await fetchDivisionMatchCounts();

    // eligible opponents list = all users except me
    eligibleOpponents = cachedUsers.filter(u => u.uid !== user.uid);

    renderOpponentSelect(fpOpponent, eligibleOpponents);
    renderOpponentSelect(calcOpponent, eligibleOpponents);

    if (errorMeta) errorMeta.style.display = 'none';
    rerenderBoard();

    applyRulesToUI('fp');
    applyRulesToUI('calc');

  } catch (err) {
    console.error(err);
    if (errorMeta) errorMeta.style.display = 'inline';
  }
});



