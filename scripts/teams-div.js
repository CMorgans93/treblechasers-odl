// public/teams-div.js
// Team Division hub (fixtures + leaderboard)
//
// ✅ Supports SESSION publishing (lineupSessionsA/B.s1..s5) + legacy lineupSubmittedA/B (publish all)
// ✅ Players can only view/submit sessions that are "released" (both sides published that session)
// ✅ Admin can view everything
// ✅ Leaderboard updates per COMPLETED SESSION (released + all required boards confirmed/bye, none disputed)
// ✅ Fixture becomes "completed" when ALL required boards are confirmed/bye and none disputed
// ✅ BYE v BYE reduces required boards (e.g. 29 total instead of 30)
//
// ✅ NEW PERMISSIONS (as requested):
// - Player on that board can submit
// - Captain can submit for ANY board in fixtures involving their team
// - Admin can submit for any board
// - Opponent confirms/disputes (submitter cannot confirm themselves, unless admin)

import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.0.1/firebase-app.js';
import {
  getFirestore,
  collection,
  getDocs,
  doc,
  getDoc,
  updateDoc,
  serverTimestamp
} from 'https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js';
import {
  getAuth,
  onAuthStateChanged,
  signOut
} from 'https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js';
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

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

isSupported().then(ok => {
  if (ok && location.protocol === 'https:') getAnalytics(app);
});

// ---------- constants ----------
const CURRENT = 'current';
const SESSIONS = [1,2,3,4,5];
const BOARDS_PER_SESSION = 6;
const TOTAL_BOARDS = SESSIONS.length * BOARDS_PER_SESSION; // 30 (max; may reduce with bye/bye)

// ---------- DOM ----------
const yearEl = document.getElementById('year');
if (yearEl) yearEl.textContent = String(new Date().getFullYear());

const authButtons = document.getElementById('authButtons');
const userArea = document.getElementById('userArea');
const userInitial = document.getElementById('userInitial');
const userName = document.getElementById('userName');
const btnSignOut = document.getElementById('btnSignOut');
const adminBtn = document.getElementById('adminBtn');

const modePill = document.getElementById('modePill');
const statusBox = document.getElementById('statusBox');

const btnViewTable = document.getElementById('btnViewTable');      // leaderboard
const btnViewFixtures = document.getElementById('btnViewFixtures'); // fixtures
const tableView = document.getElementById('tableView');
const fixturesView = document.getElementById('fixturesView');

const searchInput = document.getElementById('searchInput');
const divisionFilter = document.getElementById('divisionFilter');
const teamFilter = document.getElementById('teamFilter');
const countPill = document.getElementById('countPill');
const btnReload = document.getElementById('btnReload');

const fixturesTbody = document.getElementById('fixturesTbody');
const tableTbody = document.getElementById('tableTbody');

// ---------- refs ----------
const teamsCol = collection(db, 'teamsleague', CURRENT, 'teams');
const fixturesCol = collection(db, 'teamsleague', CURRENT, 'fixtures');
const rosterDoc = (uid) => doc(db, 'teamsleague', CURRENT, 'roster', uid);
const userDoc = (uid) => doc(db, 'users', uid);
const fixtureRef = (fxId) => doc(db, 'teamsleague', CURRENT, 'fixtures', fxId);

// ---------- helpers ----------
function initials(name) {
  const s = String(name || '').trim();
  if (!s) return 'U';
  const parts = s.split(/\s+/).filter(Boolean);
  const a = parts[0]?.[0] || 'U';
  const b = parts[1]?.[0] || '';
  return (a + b).toUpperCase();
}

function setStatus(kind, msg) {
  if (!statusBox) return;
  statusBox.className = `status ${kind || ''}`;
  statusBox.textContent = msg;
}

function safeText(v, fallback='—') {
  const s = (v == null) ? '' : String(v);
  return s.trim() ? s : fallback;
}

function pillClassForStatus(st) {
  const s = String(st || '').toLowerCase();
  if (s === 'completed' || s === 'confirmed') return 'ok';
  if (s === 'in-progress' || s === 'pending' || s === 'upcoming') return 'warn';
  if (s === 'disputed') return 'err';
  return 'warn';
}

function norm(s){ return String(s || '').toLowerCase(); }
function asNum(v, fallback=0){
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}
function deepClone(o){ return JSON.parse(JSON.stringify(o || {})); }

function isRealUid(uid){
  const u = String(uid || '');
  return !!u && u !== '__tbd__';
}

// ---------- session publish/release helpers ----------
function getPublishedMapForSide(fx, side){
  // legacy publish-all => treat all sessions as published
  const legacyAll = side === 'A' ? !!fx.lineupSubmittedA : !!fx.lineupSubmittedB;
  if (legacyAll) {
    const m = {};
    SESSIONS.forEach(s => m[`s${s}`] = true);
    return m;
  }

  const raw = side === 'A' ? (fx.lineupSessionsA || {}) : (fx.lineupSessionsB || {});
  const out = {};
  SESSIONS.forEach(s => out[`s${s}`] = raw[`s${s}`] === true);
  return out;
}

function isSessionReleased(fx, sNo){
  const a = getPublishedMapForSide(fx, 'A');
  const b = getPublishedMapForSide(fx, 'B');
  return a[`s${sNo}`] === true && b[`s${sNo}`] === true;
}

function releasedSessionCount(fx){
  let c = 0;
  SESSIONS.forEach(s => { if (isSessionReleased(fx, s)) c++; });
  return c;
}

function isSessionVisibleToUser(fx, sNo){
  if (CURRENT_USER?.isAdmin) return true;
  return isSessionReleased(fx, sNo);
}

// ---------- fixture lock rule (players locked when completed/confirmed) ----------
function isFixtureLockedForUser(fx){
  // Admin never locked
  if (CURRENT_USER?.isAdmin) return false;

  // Lock only when it is genuinely complete (all required boards confirmed/bye and no disputes)
  const comp = computeCompletionState(fx);
  if (comp.complete) return true;

  // If you treat "confirmed" as a final hard lock, keep this
  const st = String(fx?.status || '').toLowerCase();
  if (st === 'confirmed') return true;

  return false;
}

// ---------- captain permission helpers (NEW) ----------
function isCaptainOnFixture(user, fx){
  if (!user || !fx) return false;
  if (!user.isCaptain) return false;
  const myTeam = user.teamId || '';
  return !!myTeam && (myTeam === fx.teamAId || myTeam === fx.teamBId);
}

function canActOnBoard({user, aUid, bUid, fx}){
  if (!user) return false;
  if (fx && isFixtureLockedForUser(fx)) return false;
  if (user.isAdmin) return true;

  // captain can submit/act on any board for fixtures involving their team
  if (isCaptainOnFixture(user, fx)) return true;

  // player can act only on their own board
  return user.uid === aUid || user.uid === bUid;
}

function isOpponent({user, aUid, bUid, submittedBy, fx}){
  if (!user) return false;
  if (fx && isFixtureLockedForUser(fx)) return false;
  if (user.isAdmin) return true;

  // captain can confirm/dispute as long as they weren't the submitter
  if (isCaptainOnFixture(user, fx) && user.uid !== submittedBy) return true;

  const isPlayer = (user.uid === aUid || user.uid === bUid);
  return isPlayer && user.uid !== submittedBy;
}

// Winner-only rule (unless admin OR captain)
function isWinnerSubmitter({user, aUid, bUid, scoreA, scoreB, fx}){
  if (!user) return false;
  if (fx && isFixtureLockedForUser(fx)) return false;
  if (user.isAdmin) return true;

  // captains can submit on behalf (no winner-only restriction)
  if (isCaptainOnFixture(user, fx)) return true;

  if (user.uid === aUid) return scoreA === 1 && scoreB === 0;
  if (user.uid === bUid) return scoreB === 1 && scoreA === 0;
  return false;
}

function clampInt(n, min=0, max=10){
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  return Math.max(min, Math.min(max, Math.trunc(x)));
}
function clampAvg(v){
  const x = Number(v);
  if (!Number.isFinite(x)) return null;
  if (x < 0) return 0;
  if (x > 200) return 200;
  return Math.round(x * 100) / 100;
}

// ---------- state ----------
let CURRENT_USER = null; // {uid, displayName, isAdmin, teamId, isCaptain, divisionNumber}
let TEAMS = [];
let TEAMS_BY_ID = {};
let FIXTURES = [];

let OPEN_FX_ID = null;
let OPEN_SESSION_BY_FX = {};       // fxId -> sessionNo
let OPEN_BOARD_BY_FX_SESSION = {}; // `${fxId}|${session}` -> slotNo

const FINALIZE_ATTEMPTED = new Set(); // fxId

// ---------- load user context ----------
async function ensureUserContext(user) {
  let udoc = {};
  try {
    const us = await getDoc(userDoc(user.uid));
    udoc = us.exists() ? (us.data() || {}) : {};
  } catch { udoc = {}; }

  let rdoc = null;
  try {
    const rs = await getDoc(rosterDoc(user.uid));
    rdoc = rs.exists() ? (rs.data() || {}) : null;
  } catch { rdoc = null; }

  const display = udoc.displayName || user.displayName || user.email || 'User';
  const isAdmin = (udoc.role === 'admin' || udoc.isAdmin === true);
  const teamId = rdoc?.teamId || '';
  const isCaptain = (String(rdoc?.role || '').toLowerCase() === 'captain');
  const divisionNumber = rdoc?.divisionNumber ?? null;

  CURRENT_USER = { uid:user.uid, displayName:display, isAdmin, teamId, isCaptain, divisionNumber };

  authButtons?.classList.add('hidden');
  userArea?.classList.remove('hidden');
  if (userName) userName.textContent = display;
  if (userInitial) userInitial.textContent = initials(display);

  if (adminBtn) {
    if (isAdmin) adminBtn.classList.remove('hidden');
    else adminBtn.classList.add('hidden');
  }

  if (modePill) {
    if (isAdmin) { modePill.className = 'pill ok'; modePill.textContent = 'Admin signed-in'; }
    else if (isCaptain) { modePill.className = 'pill warn'; modePill.textContent = 'Captain'; }
    else { modePill.className = 'pill'; modePill.textContent = 'Player'; }
  }

  if (btnSignOut) {
    btnSignOut.onclick = async () => {
      try { await signOut(auth); location.href = '/teams.html'; }
      catch (e) { console.error(e); }
    };
  }
}

function signedOutUI() {
  CURRENT_USER = null;
  authButtons?.classList.remove('hidden');
  userArea?.classList.add('hidden');
  if (adminBtn) adminBtn.classList.add('hidden');
  if (modePill) { modePill.className = 'pill warn'; modePill.textContent = 'Signed out'; }
}

// ---------- loads ----------
async function loadTeams() {
  const snap = await getDocs(teamsCol);
  const arr = [];
  const map = {};
  snap.forEach(d => {
    const data = d.data() || {};
    arr.push({ id:d.id, ...data });
    map[d.id] = data;
  });
  arr.sort((a,b) => String(a.name||a.id).localeCompare(String(b.name||b.id)));
  TEAMS = arr;
  TEAMS_BY_ID = map;
}

async function loadFixtures() {
  const snap = await getDocs(fixturesCol);
  const arr = [];
  snap.forEach(d => arr.push({ id:d.id, ...(d.data() || {}) }));
  arr.sort((a,b) => Number(a.fixtureNo||0) - Number(b.fixtureNo||0));
  FIXTURES = arr;
}

// ---------- UI: names ----------
function teamName(teamId) {
  const t = TEAMS_BY_ID[teamId] || {};
  return t.name || teamId || '—';
}
function teamDivision(teamId){
  const t = TEAMS_BY_ID[teamId] || {};
  return t.divisionNumber ?? t.div ?? t.division ?? null;
}

// ---------- dropdowns ----------
function populateTeamFilter() {
  if (!teamFilter) return;
  while (teamFilter.options.length > 2) teamFilter.remove(2);

  TEAMS.forEach(t => {
    const opt = document.createElement('option');
    opt.value = t.id;
    opt.textContent = t.name || t.id;
    teamFilter.appendChild(opt);
  });

  teamFilter.value = '__all__';
}

function populateDivisionFilter() {
  if (!divisionFilter) return;

  while (divisionFilter.options.length > 1) divisionFilter.remove(1);

  const divs = new Set();
  TEAMS.forEach(t => {
    const dn = t.divisionNumber ?? t.div ?? t.division;
    if (dn != null && String(dn).trim() !== '') divs.add(String(dn));
  });

  [...divs].sort((a,b) => asNum(a) - asNum(b)).forEach(dn => {
    const opt = document.createElement('option');
    opt.value = dn;
    opt.textContent = `Div ${dn}`;
    divisionFilter.appendChild(opt);
  });

  divisionFilter.value = '__all__';
}

// ---------- view toggle ----------
function setView(view){
  const isTable = (view === 'table');
  if (btnViewTable) btnViewTable.classList.toggle('active', isTable);
  if (btnViewFixtures) btnViewFixtures.classList.toggle('active', !isTable);
  tableView?.classList.toggle('hidden', !isTable);
  fixturesView?.classList.toggle('hidden', isTable);

  if (countPill) countPill.textContent = isTable ? 'Leaderboard' : 'Fixtures';
  OPEN_FX_ID = null;
}

// ---------- filters ----------
function getSelectedTeamId() {
  const v = (teamFilter?.value || '__all__');
  if (v === '__all__') return '__all__';
  if (v === '__my__') return (CURRENT_USER?.teamId || '__all__');
  return v;
}

function getSelectedDivision() {
  const v = (divisionFilter?.value || '__all__');
  return v === '__all__' ? '__all__' : String(v);
}

// ---------- lineup + results helpers ----------
function ensureLineupShape(fx){
  const out = deepClone(fx.lineups || {});
  out.A = out.A || {};
  out.B = out.B || {};
  for (const s of SESSIONS) {
    const key = `s${s}`;
    if (!Array.isArray(out.A[key])) out.A[key] = [];
    if (!Array.isArray(out.B[key])) out.B[key] = [];
  }
  return out;
}

function getSlotFromLineups(lineups, side, sessionNo, slotNo){
  const arr = lineups?.[side]?.[`s${sessionNo}`] || [];
  return arr.find(x => Number(x.slot) === Number(slotNo)) || null;
}

function getResultObj(fx, sessionNo, slotNo){
  const res = fx.results || {};
  const s = res[`s${sessionNo}`] || {};
  return s[`b${slotNo}`] || null;
}

// ---------- session / fixture computation (handles bye vs bye) ----------
function computeSessionState(fx, sessionNo){
  // If not released to the userbase, treat as unavailable for scoring/leaderboard
  // (Admin still sees the UI, but scoring should still be based on actual data. We keep it consistent.)
  if (!isSessionReleased(fx, sessionNo) && !CURRENT_USER?.isAdmin) {
    return {
      visible:false,
      complete:false,
      legsA:0, legsB:0,
      doneCount:0, requiredCount:0,
      hasDispute:false,
      avgSumA:0, avgNA:0, avgSumB:0, avgNB:0,
      b171A:0, bullA:0, ddA:0, c100A:0,
      b171B:0, bullB:0, ddB:0, c100B:0
    };
  }

  const lineups = ensureLineupShape(fx);

  let legsA = 0, legsB = 0;
  let doneCount = 0;
  let byeByeCount = 0;
  let hasDispute = false;

  let avgSumA = 0, avgNA = 0;
  let avgSumB = 0, avgNB = 0;
  let b171A = 0, bullA = 0, ddA = 0, c100A = 0;
  let b171B = 0, bullB = 0, ddB = 0, c100B = 0;

  for (let slot=1; slot<=BOARDS_PER_SESSION; slot++){
    const aEntry = getSlotFromLineups(lineups, 'A', sessionNo, slot);
    const bEntry = getSlotFromLineups(lineups, 'B', sessionNo, slot);
    const aUid = aEntry?.uid || '';
    const bUid = bEntry?.uid || '';
    const aReal = isRealUid(aUid);
    const bReal = isRealUid(bUid);

    // bye vs bye => board removed (reduces required)
    if (!aReal && !bReal) {
      byeByeCount++;
      continue;
    }

    // one-sided bye => auto-confirm (counts as done)
    if (aReal && !bReal) {
      doneCount++;
      legsA += 1;
      continue;
    }
    if (bReal && !aReal) {
      doneCount++;
      legsB += 1;
      continue;
    }

    // both real => need confirmed result
    const resRaw = getResultObj(fx, sessionNo, slot);
    if (resRaw?.disputed === true) hasDispute = true;

    if (resRaw && resRaw.confirmed === true && resRaw.disputed !== true) {
      doneCount++;
      legsA += asNum(resRaw.scoreA, 0);
      legsB += asNum(resRaw.scoreB, 0);

      if (resRaw.avgA != null && Number.isFinite(Number(resRaw.avgA))) { avgSumA += Number(resRaw.avgA); avgNA += 1; }
      if (resRaw.avgB != null && Number.isFinite(Number(resRaw.avgB))) { avgSumB += Number(resRaw.avgB); avgNB += 1; }

      const ba = resRaw.bonusA || {};
      const bb = resRaw.bonusB || {};
      b171A += asNum(ba.v171, 0);
      bullA += asNum(ba.bull, 0);
      ddA   += asNum(ba.dd, 0);
      c100A += asNum(ba.c100, 0);

      b171B += asNum(bb.v171, 0);
      bullB += asNum(bb.bull, 0);
      ddB   += asNum(bb.dd, 0);
      c100B += asNum(bb.c100, 0);
    }
  }

  const requiredCount = Math.max(0, BOARDS_PER_SESSION - byeByeCount);
  const complete = (doneCount >= requiredCount) && !hasDispute;

  return {
    visible:true,
    complete,
    legsA, legsB,
    doneCount,
    requiredCount,
    hasDispute,
    avgSumA, avgNA, avgSumB, avgNB,
    b171A, bullA, ddA, c100A,
    b171B, bullB, ddB, c100B
  };
}

function computeCompletionState(fx){
  let legsA = 0, legsB = 0;
  let doneCount = 0;
  let requiredCount = 0;
  let hasDispute = false;

  for (const sNo of SESSIONS) {
    const ss = computeSessionState(fx, sNo);
    // only count sessions that are visible in scoring model
    if (!ss.visible && !CURRENT_USER?.isAdmin) continue;

    doneCount += ss.doneCount;
    requiredCount += ss.requiredCount;
    legsA += ss.legsA;
    legsB += ss.legsB;
    if (ss.hasDispute) hasDispute = true;
  }

  const complete = (requiredCount > 0) && (doneCount >= requiredCount) && !hasDispute;
  return { complete, legsA, legsB, doneCount, requiredCount, hasDispute };
}

// Admin-only: persist completion to Firestore
async function maybeFinalizeFixtureAsAdmin(fx){
  if (!CURRENT_USER?.isAdmin) return;
  if (!fx?.id) return;
  if (FINALIZE_ATTEMPTED.has(fx.id)) return;

  const state = computeCompletionState(fx);
  if (!state.complete) return;

  const st = String(fx.status || '').toLowerCase();
  if (st === 'completed' || st === 'confirmed') return;

  FINALIZE_ATTEMPTED.add(fx.id);

  try {
    await updateDoc(fixtureRef(fx.id), {
      status: 'completed',
      completedAt: serverTimestamp(),
      finalScoreA: state.legsA,
      finalScoreB: state.legsB,
      completedBoards: state.doneCount,
      requiredBoards: state.requiredCount
    });
  } catch (e) {
    console.error(e);
  }
}

// ---------- leaderboard build ----------
function buildTableRows() {
  const divSel = getSelectedDivision();

  let teams = TEAMS.slice();
  if (divSel !== '__all__') {
    teams = teams.filter(t => String(t.divisionNumber ?? t.div ?? t.division ?? '') === String(divSel));
  }

  const teamSel = teamFilter?.value || '__all__';
  if (teamSel !== '__all__' && teamSel !== '__my__') teams = teams.filter(t => t.id === teamSel);
  if (teamSel === '__my__' && CURRENT_USER?.teamId) teams = teams.filter(t => t.id === CURRENT_USER.teamId);

  const stats = {};
  teams.forEach(t => {
    stats[t.id] = {
      teamId: t.id,
      name: t.name || t.id,

      P:0, W:0, L:0,
      LF:0, LA:0,
      PTS:0,

      B171:0, C100:0, BULL:0, DD:0,
      AVG_SUM:0, AVG_N:0,
    };
  });

  for (const fx of FIXTURES) {
    const aId = fx.teamAId;
    const bId = fx.teamBId;
    if (!aId || !bId) continue;
    if (!stats[aId] || !stats[bId]) continue;

    // Only count sessions that are COMPLETE (and released in scoring model)
    for (const sNo of SESSIONS){
      const ss = computeSessionState(fx, sNo);
      if (!ss.complete) continue;

      const a = stats[aId];
      const b = stats[bId];

      a.P++; b.P++;

      a.LF += ss.legsA; a.LA += ss.legsB;
      b.LF += ss.legsB; b.LA += ss.legsA;

      a.PTS += ss.legsA;
      b.PTS += ss.legsB;

      if (ss.legsA > ss.legsB) { a.W++; b.L++; }
      else if (ss.legsB > ss.legsA) { b.W++; a.L++; }

      if (ss.avgNA) { a.AVG_SUM += ss.avgSumA; a.AVG_N += ss.avgNA; }
      if (ss.avgNB) { b.AVG_SUM += ss.avgSumB; b.AVG_N += ss.avgNB; }

      a.B171 += ss.b171A;
      a.C100 += ss.c100A;
      a.BULL += ss.bullA;
      a.DD   += ss.ddA;

      b.B171 += ss.b171B;
      b.C100 += ss.c100B;
      b.BULL += ss.bullB;
      b.DD   += ss.ddB;
    }
  }

  const rows = Object.values(stats).map(r => {
    const AVG = r.AVG_N ? (r.AVG_SUM / r.AVG_N) : 0;
    return { ...r, DIFF: r.LF - r.LA, AVG };
  });

  rows.sort((x,y) =>
    (y.PTS - x.PTS) ||
    (y.AVG - x.AVG) ||
    (y.B171 - x.B171) ||
    (y.C100 - x.C100) ||
    (y.BULL - x.BULL) ||
    (y.DD - x.DD) ||
    (y.DIFF - x.DIFF) ||
    (y.LF - x.LF) ||
    String(x.name).localeCompare(String(y.name))
  );

  return rows;
}

function renderTable() {
  if (!tableTbody) return;

  const q = norm(searchInput?.value || '');
  const rows = buildTableRows().filter(r => !q || String(r.name||'').toLowerCase().includes(q));

  tableTbody.innerHTML = '';

  if (!rows.length) {
    setStatus('warn', 'No teams match your filters for the leaderboard.');
    return;
  }

  setStatus('ok', 'Leaderboard updates when each released session completes.');
  rows.forEach((r, idx) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${idx + 1}</strong></td>
      <td>${safeText(r.name)}</td>
      <td>${r.P}</td>
      <td>${r.W}</td>
      <td>${r.L}</td>
      <td>${r.LF}</td>
      <td>${r.LA}</td>
      <td>${r.DIFF}</td>
      <td><strong>${r.B171}</strong></td>
      <td><strong>${r.C100}</strong></td>
      <td><strong>${r.BULL}</strong></td>
      <td><strong>${r.DD}</strong></td>
      <td><strong>${(r.AVG || 0).toFixed(2)}</strong></td>
      <td><strong>${r.PTS}</strong></td>
    `;
    tableTbody.appendChild(tr);
  });

  if (countPill) countPill.textContent = `Leaderboard • ${rows.length} teams`;
}

// ---------- fixtures expand ----------
function captainsHaveReleasedAnything(fx){
  return CURRENT_USER?.isAdmin || releasedSessionCount(fx) > 0;
}

function toggleFixtureExpand(fxId){
  OPEN_FX_ID = (OPEN_FX_ID === fxId) ? null : fxId;
  if (OPEN_FX_ID && !OPEN_SESSION_BY_FX[OPEN_FX_ID]) OPEN_SESSION_BY_FX[OPEN_FX_ID] = 1;
  renderFixtures();
}

function selectSession(fxId, sNo){
  OPEN_SESSION_BY_FX[fxId] = sNo;
  OPEN_BOARD_BY_FX_SESSION[`${fxId}|${sNo}`] = null;
  renderFixtures();
}

function toggleBoardEditor(fxId, sNo, slotNo){
  const key = `${fxId}|${sNo}`;
  OPEN_BOARD_BY_FX_SESSION[key] = (OPEN_BOARD_BY_FX_SESSION[key] === slotNo) ? null : slotNo;
  renderFixtures();
}

function selectOptions0to10(selected){
  const sel = clampInt(selected, 0, 10);
  let out = '';
  for (let i=0;i<=10;i++){
    out += `<option value="${i}" ${i===sel?'selected':''}>${i}</option>`;
  }
  return out;
}

function boardRowHTML({fx, sessionNo, slotNo, aEntry, bEntry, res, kind}){
  const aName = aEntry?.name || (aEntry?.uid === '__tbd__' ? 'TBD' : '—');
  const bName = bEntry?.name || (bEntry?.uid === '__tbd__' ? 'TBD' : '—');
  const aUid = aEntry?.uid || '';
  const bUid = bEntry?.uid || '';

  const locked = isFixtureLockedForUser(fx);

  const sessionVisible = isSessionVisibleToUser(fx, sessionNo);

  const clickable =
    sessionVisible &&
    !locked &&
    kind === 'real' &&
    canActOnBoard({user:CURRENT_USER, aUid, bUid, fx});

  const hasResult = !!res;
  const confirmed = res?.confirmed === true;
  const disputed = res?.disputed === true;

  let rightPill = '';
  if (!sessionVisible && !CURRENT_USER?.isAdmin) rightPill = `<span class="pill warn">Not released</span>`;
  else if (locked) rightPill = `<span class="pill ok">Locked</span>`;
  else if (kind === 'byebye') rightPill = `<span class="pill warn">Bye/Bye</span>`;
  else if (kind === 'bye') rightPill = `<span class="pill warn">Bye</span>`;
  else if (disputed) rightPill = `<span class="pill err">Disputed</span>`;
  else if (confirmed) rightPill = `<span class="pill ok">Confirmed</span>`;
  else if (hasResult) rightPill = `<span class="pill warn">Submitted</span>`;

  const scoreText = (kind === 'real' && hasResult)
    ? `<span class="muted" style="margin-left:10px;">Score: <strong>${res.scoreA}</strong> - <strong>${res.scoreB}</strong></span>`
    : (kind === 'bye' ? `<span class="muted" style="margin-left:10px;">Auto: <strong>${res.scoreA}</strong> - <strong>${res.scoreB}</strong></span>` : '');

  return `
    <div
      class="board-row"
      data-action="${clickable ? 'toggle-board' : ''}"
      data-fx="${fx.id}"
      data-session="${sessionNo}"
      data-slot="${slotNo}"
      style="
        display:flex;align-items:center;justify-content:space-between;
        padding:10px 10px;border:1px solid rgba(215,180,106,.12);
        border-radius:12px;background:rgba(10,14,18,.28);
        margin-bottom:8px;
        ${clickable ? 'cursor:pointer;' : 'opacity:.85;'}
      "
      title="${
        !sessionVisible && !CURRENT_USER?.isAdmin ? 'Session not released yet' :
        locked ? 'Locked (completed). Admin only.' :
        (clickable ? 'Click to submit/confirm' : (kind === 'bye' ? 'Bye board' : (kind === 'byebye' ? 'Bye vs Bye' : 'Not your board')))
      }"
    >
      <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;">
        <span class="pill" style="min-width:72px;justify-content:center;">Board ${slotNo}</span>
        <div>
          <div class="muted" style="font-size:.75rem;color:var(--muted-400);">Team A</div>
          <div style="font-weight:900;">${safeText(aName)}</div>
        </div>
        <span class="pill" style="opacity:.8;">vs</span>
        <div style="text-align:right;">
          <div class="muted" style="font-size:.75rem;color:var(--muted-400);">Team B</div>
          <div style="font-weight:900;">${safeText(bName)}</div>
        </div>
        ${scoreText}
      </div>
      <div style="display:flex;gap:8px;align-items:center;">
        ${rightPill}
      </div>
    </div>
  `;
}

function boardEditorHTML({fx, sessionNo, slotNo, aEntry, bEntry, res}){
  const aUid = aEntry?.uid || '';
  const bUid = bEntry?.uid || '';

  const locked = isFixtureLockedForUser(fx);
  const sessionVisible = isSessionVisibleToUser(fx, sessionNo);

  const canAct = canActOnBoard({user:CURRENT_USER, aUid, bUid, fx});
  const hasResult = !!res;
  const confirmed = res?.confirmed === true;
  const disputed = res?.disputed === true;

  const submittedBy = res?.submittedBy || '';

  const opponentCanConfirm = sessionVisible && !locked && hasResult && !confirmed && !disputed && isOpponent({user:CURRENT_USER, aUid, bUid, submittedBy, fx});
  const canSubmit = sessionVisible && !locked && canAct && !confirmed && !disputed;

  const scoreA = hasResult ? Number(res.scoreA) : '';
  const scoreB = hasResult ? Number(res.scoreB) : '';

  const avgA = hasResult && res.avgA != null ? Number(res.avgA) : '';
  const avgB = hasResult && res.avgB != null ? Number(res.avgB) : '';

  const ba = res?.bonusA || {};
  const bb = res?.bonusB || {};

  const v171A = clampInt(ba.v171, 0, 10);
  const bullA = clampInt(ba.bull, 0, 10);
  const ddA   = clampInt(ba.dd,   0, 10);
  const c100A = clampInt(ba.c100, 0, 10);

  const v171B = clampInt(bb.v171, 0, 10);
  const bullB = clampInt(bb.bull, 0, 10);
  const ddB   = clampInt(bb.dd,   0, 10);
  const c100B = clampInt(bb.c100, 0, 10);

  const isOpponentViewer =
    hasResult &&
    !CURRENT_USER?.isAdmin &&
    CURRENT_USER?.uid !== submittedBy &&
    (CURRENT_USER?.uid === aUid || CURRENT_USER?.uid === bUid);

  const inputsReadOnly = !sessionVisible || locked || confirmed || disputed || isOpponentViewer;

  let msg = '';
  if (!sessionVisible && !CURRENT_USER?.isAdmin) msg = `This session is not released yet (both captains must publish it).`;
  else if (locked) msg = `Fixture is completed and locked. Only admins can edit.`;
  else if (!hasResult) msg = `Players on the board or captains can submit the score + tie-break stats. Opponent then confirms or disputes.`;
  else if (confirmed) msg = `This board is confirmed and locked.`;
  else if (disputed) msg = `This board is disputed. An admin will resolve it.`;
  else msg = isOpponentViewer ? `Result submitted by opponent. Confirm or dispute.` : `Result submitted. You can edit until opponent confirms.`;

  return `
    <div class="expand-box" style="margin-top:10px;">
      <div class="expand-title">
        <span>Board ${slotNo} • Submit / Confirm</span>
        <span class="pill ${locked ? 'ok' : confirmed ? 'ok' : disputed ? 'err' : hasResult ? 'warn' : 'warn'}">
          ${locked ? 'Locked' : confirmed ? 'Confirmed' : disputed ? 'Disputed' : hasResult ? 'Submitted' : 'Not submitted'}
        </span>
      </div>

      <div class="muted" style="margin-bottom:10px;color:var(--muted-400);">${msg}</div>

      <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end;margin-bottom:10px;">
        <div style="min-width:160px;">
          <div class="muted" style="font-size:.75rem;color:var(--muted-400);">Team A score</div>
          <input data-score="a" data-fx="${fx.id}" data-session="${sessionNo}" data-slot="${slotNo}"
            type="number" min="0" max="1" step="1" value="${scoreA}" ${inputsReadOnly ? 'disabled' : ''} style="width:140px;" />
        </div>

        <div style="min-width:160px;">
          <div class="muted" style="font-size:.75rem;color:var(--muted-400);">Team B score</div>
          <input data-score="b" data-fx="${fx.id}" data-session="${sessionNo}" data-slot="${slotNo}"
            type="number" min="0" max="1" step="1" value="${scoreB}" ${inputsReadOnly ? 'disabled' : ''} style="width:140px;" />
        </div>

        <div style="min-width:180px;">
          <div class="muted" style="font-size:.75rem;color:var(--muted-400);">Team A avg (tie-break)</div>
          <input data-avg="a" data-fx="${fx.id}" data-session="${sessionNo}" data-slot="${slotNo}"
            type="number" min="0" max="200" step="0.01" value="${avgA}" ${inputsReadOnly ? 'disabled' : ''} style="width:160px;" />
        </div>

        <div style="min-width:180px;">
          <div class="muted" style="font-size:.75rem;color:var(--muted-400);">Team B avg (tie-break)</div>
          <input data-avg="b" data-fx="${fx.id}" data-session="${sessionNo}" data-slot="${slotNo}"
            type="number" min="0" max="200" step="0.01" value="${avgB}" ${inputsReadOnly ? 'disabled' : ''} style="width:160px;" />
        </div>
      </div>

      <div class="muted" style="margin:6px 0 10px;color:var(--muted-400);font-weight:800;">
        Tie-break extras (counts) — stored only:
      </div>

      <div style="display:flex;gap:16px;flex-wrap:wrap;">
        <div style="flex:1 1 340px;min-width:320px;">
          <div class="muted" style="font-size:.75rem;color:var(--muted-400);margin-bottom:6px;">Team A extras</div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
            <label class="muted" style="display:flex;flex-direction:column;gap:6px;">
              171+
              <select data-bonus="v171A" data-fx="${fx.id}" data-session="${sessionNo}" data-slot="${slotNo}" ${inputsReadOnly?'disabled':''}>${selectOptions0to10(v171A)}</select>
            </label>
            <label class="muted" style="display:flex;flex-direction:column;gap:6px;">
              Bull finishes
              <select data-bonus="bullA" data-fx="${fx.id}" data-session="${sessionNo}" data-slot="${slotNo}" ${inputsReadOnly?'disabled':''}>${selectOptions0to10(bullA)}</select>
            </label>
            <label class="muted" style="display:flex;flex-direction:column;gap:6px;">
              Double/Double
              <select data-bonus="ddA" data-fx="${fx.id}" data-session="${sessionNo}" data-slot="${slotNo}" ${inputsReadOnly?'disabled':''}>${selectOptions0to10(ddA)}</select>
            </label>
            <label class="muted" style="display:flex;flex-direction:column;gap:6px;">
              100+ checkouts
              <select data-bonus="c100A" data-fx="${fx.id}" data-session="${sessionNo}" data-slot="${slotNo}" ${inputsReadOnly?'disabled':''}>${selectOptions0to10(c100A)}</select>
            </label>
          </div>
        </div>

        <div style="flex:1 1 340px;min-width:320px;">
          <div class="muted" style="font-size:.75rem;color:var(--muted-400);margin-bottom:6px;">Team B extras</div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
            <label class="muted" style="display:flex;flex-direction:column;gap:6px;">
              171+
              <select data-bonus="v171B" data-fx="${fx.id}" data-session="${sessionNo}" data-slot="${slotNo}" ${inputsReadOnly?'disabled':''}>${selectOptions0to10(v171B)}</select>
            </label>
            <label class="muted" style="display:flex;flex-direction:column;gap:6px;">
              Bull finishes
              <select data-bonus="bullB" data-fx="${fx.id}" data-session="${sessionNo}" data-slot="${slotNo}" ${inputsReadOnly?'disabled':''}>${selectOptions0to10(bullB)}</select>
            </label>
            <label class="muted" style="display:flex;flex-direction:column;gap:6px;">
              Double/Double
              <select data-bonus="ddB" data-fx="${fx.id}" data-session="${sessionNo}" data-slot="${slotNo}" ${inputsReadOnly?'disabled':''}>${selectOptions0to10(ddB)}</select>
            </label>
            <label class="muted" style="display:flex;flex-direction:column;gap:6px;">
              100+ checkouts
              <select data-bonus="c100B" data-fx="${fx.id}" data-session="${sessionNo}" data-slot="${slotNo}" ${inputsReadOnly?'disabled':''}>${selectOptions0to10(c100B)}</select>
            </label>
          </div>
        </div>
      </div>

      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px;">
        <button class="btn btn-primary btn-small" type="button"
          data-action="submit-result" data-fx="${fx.id}" data-session="${sessionNo}" data-slot="${slotNo}"
          ${canSubmit ? '' : 'disabled'}
        >${hasResult ? 'Update result' : 'Submit result'}</button>

        <button class="btn btn-ghost btn-small" type="button"
          data-action="confirm-result" data-fx="${fx.id}" data-session="${sessionNo}" data-slot="${slotNo}"
          ${opponentCanConfirm ? '' : 'disabled'}
        >Confirm</button>

        <button class="btn btn-danger btn-small" type="button"
          data-action="dispute-result" data-fx="${fx.id}" data-session="${sessionNo}" data-slot="${slotNo}"
          ${(!locked && sessionVisible && hasResult && !confirmed && !disputed && canAct) ? '' : 'disabled'}
        >Dispute</button>
      </div>
    </div>
  `;
}

function expandRowHTML(fx){
  const hasAnyReleased = captainsHaveReleasedAnything(fx);
  const sNo = OPEN_SESSION_BY_FX[fx.id] || 1;

  const locked = isFixtureLockedForUser(fx);

  const sessionBtns = SESSIONS.map(n => {
    const canOpen = isSessionVisibleToUser(fx, n);
    return `
      <button
        class="btn btn-ghost btn-small"
        type="button"
        data-action="select-session"
        data-fx="${fx.id}"
        data-session="${n}"
        ${canOpen ? '' : 'disabled'}
        style="${n === sNo ? 'background:rgba(215,180,106,.12);' : ''}"
        title="${canOpen ? '' : 'Not released yet'}"
      >Session ${n}</button>
    `;
  }).join('');

  if (!hasAnyReleased) {
    return `
      <tr>
        <td colspan="5">
          <div class="expand-box">
            <div class="expand-title">
              <span>Sessions</span>
              <span class="pill warn">Awaiting captains</span>
            </div>
            <div class="session-row">${sessionBtns}</div>
            <div class="status warn" style="margin:0;">
              No sessions released yet. Captains must publish the same session number on both teams.
            </div>
          </div>
        </td>
      </tr>
    `;
  }

  // If the selected session isn't released, show message (players)
  if (!isSessionVisibleToUser(fx, sNo)) {
    return `
      <tr>
        <td colspan="5">
          <div class="expand-box">
            <div class="expand-title">
              <span>Sessions</span>
              <span class="pill warn">Not released</span>
            </div>
            <div class="session-row">${sessionBtns}</div>
            <div class="status warn" style="margin:0;">
              Session ${sNo} is not released yet. Choose a released session (or wait for captains).
            </div>
          </div>
        </td>
      </tr>
    `;
  }

  const lineups = ensureLineupShape(fx);
  const keyBoard = `${fx.id}|${sNo}`;
  const openSlot = OPEN_BOARD_BY_FX_SESSION[keyBoard] || null;

  let boardsHtml = '';
  for (let slot=1; slot<=BOARDS_PER_SESSION; slot++){
    const aEntry = getSlotFromLineups(lineups, 'A', sNo, slot) || { uid:'__tbd__', name:'TBD' };
    const bEntry = getSlotFromLineups(lineups, 'B', sNo, slot) || { uid:'__tbd__', name:'TBD' };

    const aUid = aEntry?.uid || '';
    const bUid = bEntry?.uid || '';
    const aReal = isRealUid(aUid);
    const bReal = isRealUid(bUid);

    const resRaw = getResultObj(fx, sNo, slot);

    let kind = 'real';
    let resForRow = resRaw;

    if (!aReal && !bReal) {
      kind = 'byebye';
      resForRow = null;
    } else if (aReal && !bReal) {
      kind = 'bye';
      resForRow = { scoreA:1, scoreB:0, confirmed:true };
    } else if (bReal && !aReal) {
      kind = 'bye';
      resForRow = { scoreA:0, scoreB:1, confirmed:true };
    }

    boardsHtml += boardRowHTML({fx, sessionNo:sNo, slotNo:slot, aEntry, bEntry, res:resForRow, kind});

    if (!locked && kind === 'real' && openSlot === slot) {
      boardsHtml += boardEditorHTML({fx, sessionNo:sNo, slotNo:slot, aEntry, bEntry, res: resRaw});
    }
  }

  const fixtureState = computeCompletionState(fx);
  const sessionState = computeSessionState(fx, sNo);

  const stComputed = fixtureState.complete ? 'completed' : (fx.status || 'in-progress');
  const stCls = pillClassForStatus(stComputed);

  const progressText =
    fixtureState.complete
      ? `Completed • Final ${fixtureState.legsA}-${fixtureState.legsB}`
      : (fixtureState.hasDispute ? `Dispute present` : `Progress ${fixtureState.doneCount}/${fixtureState.requiredCount || TOTAL_BOARDS}`);

  const sessionProgress =
    sessionState.complete
      ? `Session ${sNo} complete • ${sessionState.legsA}-${sessionState.legsB}`
      : (sessionState.hasDispute ? `Session ${sNo} has dispute` : `Session ${sNo} progress ${sessionState.doneCount}/${sessionState.requiredCount}`);

  return `
    <tr>
      <td colspan="5">
        <div class="expand-box">
          <div class="expand-title">
            <span>Sessions</span>
            <span class="pill ${stCls}">${safeText(stComputed)}</span>
          </div>

          <div class="muted" style="margin:6px 0 8px;color:var(--muted-400);">
            ${progressText}
            <span style="margin-left:12px;">•</span>
            <span style="margin-left:12px;">${sessionProgress}</span>
            ${locked ? `<span style="margin-left:10px;" class="pill ok">Locked (admin only)</span>` : ``}
          </div>

          <div class="session-row">${sessionBtns}</div>

          <div class="muted" style="margin:6px 0 8px;color:var(--muted-400);">
            Showing <strong>Session ${sNo}</strong> • ${safeText(teamName(fx.teamAId))} vs ${safeText(teamName(fx.teamBId))}
          </div>

          <div class="muted" style="margin:0 0 10px;color:var(--muted-400);font-weight:900;">
            Session score: <strong>${sessionState.legsA}</strong> - <strong>${sessionState.legsB}</strong>
            <span style="margin-left:14px;">Match score (confirmed/bye so far): <strong>${fixtureState.legsA}</strong> - <strong>${fixtureState.legsB}</strong></span>
          </div>

          ${boardsHtml}
        </div>
      </td>
    </tr>
  `;
}

// ---------- fixtures render ----------
function renderFixtures() {
  if (!fixturesTbody) return;

  const q = norm(searchInput?.value || '');
  const teamId = getSelectedTeamId();
  const divSel = getSelectedDivision();

  let list = FIXTURES.slice();

  if (divSel !== '__all__') {
    list = list.filter(fx => {
      const da = teamDivision(fx.teamAId);
      const db = teamDivision(fx.teamBId);
      return String(da ?? '') === String(divSel) && String(db ?? '') === String(divSel);
    });
  }

  if (teamId !== '__all__') {
    list = list.filter(fx => fx.teamAId === teamId || fx.teamBId === teamId);
  }

  if (q) {
    list = list.filter(fx => {
      const a = teamName(fx.teamAId);
      const b = teamName(fx.teamBId);
      const hay = `${a} ${b} ${fx.id} ${fx.fixtureNo}`.toLowerCase();
      return hay.includes(q);
    });
  }

  fixturesTbody.innerHTML = '';

  if (!list.length) {
    setStatus('warn', 'No fixtures match your filters.');
    if (countPill) countPill.textContent = `Fixtures • 0`;
    return;
  }

  setStatus('ok', 'Loaded. Click a fixture to expand into released sessions.');
  if (countPill) countPill.textContent = `Fixtures • ${list.length}`;

  const useTeamSeq = (teamFilter?.value === '__my__' && !!CURRENT_USER?.teamId) ||
    (teamFilter?.value && teamFilter.value !== '__all__' && teamFilter.value !== '__my__');

  const seqMap = new Map();
  if (useTeamSeq) list.forEach((fx, idx) => seqMap.set(fx.id, idx + 1));

  for (const fx of list) {
    const comp = computeCompletionState(fx);
    if (comp.complete) maybeFinalizeFixtureAsAdmin(fx);

    const tr = document.createElement('tr');
    tr.className = 'clickable';

    const stComputed = comp.complete ? 'completed' : String(fx.status || 'upcoming');
    const stCls = pillClassForStatus(stComputed);

    const rel = releasedSessionCount(fx);
    const relPill = rel ? `<span class="muted" style="margin-left:8px;">Released ${rel}/5</span>` : `<span class="muted" style="margin-left:8px;">Released 0/5</span>`;

    const scoreBar = `<span class="muted" style="margin-left:8px;">${comp.legsA}-${comp.legsB}</span>`;
    const fxNoDisplay = useTeamSeq ? seqMap.get(fx.id) : safeText(fx.fixtureNo,'—');

    tr.innerHTML = `
      <td><strong>${fxNoDisplay}</strong>${scoreBar}${relPill}</td>
      <td>${safeText(teamName(fx.teamAId))}</td>
      <td>${safeText(teamName(fx.teamBId))}</td>
      <td><span class="pill ${stCls}">${stComputed}</span></td>
      <td><span class="muted">${comp.requiredCount ? `${comp.doneCount}/${comp.requiredCount}` : '—'}</span></td>
    `;

    tr.onclick = () => toggleFixtureExpand(fx.id);
    fixturesTbody.appendChild(tr);

    if (OPEN_FX_ID === fx.id) {
      const wrap = document.createElement('tbody');
      wrap.innerHTML = expandRowHTML(fx);
      fixturesTbody.appendChild(wrap.firstElementChild);
    }
  }
}

// ---------- unified render ----------
function render() {
  const isTable = btnViewTable?.classList.contains('active');
  if (isTable) renderTable();
  else renderFixtures();
}

// ---------- delegation helpers ----------
function getFxById(fxId){
  return FIXTURES.find(f => f.id === fxId) || null;
}

function getScoreInputs(fxId, sessionNo, slotNo){
  const a = document.querySelector(`input[data-score="a"][data-fx="${fxId}"][data-session="${sessionNo}"][data-slot="${slotNo}"]`);
  const b = document.querySelector(`input[data-score="b"][data-fx="${fxId}"][data-session="${sessionNo}"][data-slot="${slotNo}"]`);
  return { a, b };
}
function getAvgInputs(fxId, sessionNo, slotNo){
  const a = document.querySelector(`input[data-avg="a"][data-fx="${fxId}"][data-session="${sessionNo}"][data-slot="${slotNo}"]`);
  const b = document.querySelector(`input[data-avg="b"][data-fx="${fxId}"][data-session="${sessionNo}"][data-slot="${slotNo}"]`);
  return { a, b };
}
function getBonusSelect(fxId, sessionNo, slotNo, key){
  return document.querySelector(`select[data-bonus="${key}"][data-fx="${fxId}"][data-session="${sessionNo}"][data-slot="${slotNo}"]`);
}

async function doSubmit(fxId, sessionNo, slotNo){
  const fx = getFxById(fxId);
  if (!fx) return;

  if (!isSessionVisibleToUser(fx, sessionNo) && !CURRENT_USER?.isAdmin) {
    setStatus('warn', 'This session is not released yet.');
    return;
  }

  if (isFixtureLockedForUser(fx)) {
    setStatus('err', 'Fixture is completed and locked. Admin only.');
    return;
  }

  const lineups = ensureLineupShape(fx);
  const aEntry = getSlotFromLineups(lineups, 'A', sessionNo, slotNo);
  const bEntry = getSlotFromLineups(lineups, 'B', sessionNo, slotNo);
  const aUid = aEntry?.uid || '';
  const bUid = bEntry?.uid || '';

  if (!canActOnBoard({user:CURRENT_USER, aUid, bUid, fx})) {
    setStatus('err', 'You are not allowed to submit this board.');
    return;
  }

  if (!isRealUid(aUid) || !isRealUid(bUid)) {
    setStatus('warn', 'This board is not fully assigned yet (Bye/TBD).');
    return;
  }

  const {a, b} = getScoreInputs(fxId, sessionNo, slotNo);
  const scoreA = Number(a?.value);
  const scoreB = Number(b?.value);

  if (!Number.isFinite(scoreA) || !Number.isFinite(scoreB)) {
    setStatus('warn', 'Enter both scores (0 or 1).');
    return;
  }
  if (!([0,1].includes(scoreA) && [0,1].includes(scoreB))) {
    setStatus('warn', 'Scores must be 0 or 1.');
    return;
  }
  if (scoreA === scoreB) {
    setStatus('warn', 'A one-leg board can’t be a draw.');
    return;
  }

  if (!isWinnerSubmitter({user:CURRENT_USER, aUid, bUid, scoreA, scoreB, fx})) {
    setStatus('err', 'Only the winner can submit (captain/admin can override).');
    return;
  }

  const av = getAvgInputs(fxId, sessionNo, slotNo);
  const avgA = clampAvg(av.a?.value);
  const avgB = clampAvg(av.b?.value);

  const bonusA = {
    v171: clampInt(getBonusSelect(fxId, sessionNo, slotNo, 'v171A')?.value, 0, 10),
    bull: clampInt(getBonusSelect(fxId, sessionNo, slotNo, 'bullA')?.value, 0, 10),
    dd:   clampInt(getBonusSelect(fxId, sessionNo, slotNo, 'ddA')?.value,   0, 10),
    c100: clampInt(getBonusSelect(fxId, sessionNo, slotNo, 'c100A')?.value, 0, 10),
  };
  const bonusB = {
    v171: clampInt(getBonusSelect(fxId, sessionNo, slotNo, 'v171B')?.value, 0, 10),
    bull: clampInt(getBonusSelect(fxId, sessionNo, slotNo, 'bullB')?.value, 0, 10),
    dd:   clampInt(getBonusSelect(fxId, sessionNo, slotNo, 'ddB')?.value,   0, 10),
    c100: clampInt(getBonusSelect(fxId, sessionNo, slotNo, 'c100B')?.value, 0, 10),
  };

  setStatus('warn', `Submitting Board ${slotNo} (Session ${sessionNo})…`);

  const path = `results.s${sessionNo}.b${slotNo}`;
  const payload = {};
  payload[path] = {
    aUid,
    bUid,
    scoreA,
    scoreB,
    avgA,
    avgB,
    bonusA,
    bonusB,
    submittedBy: CURRENT_USER.uid,
    submittedAt: serverTimestamp(),
    confirmed: false,
    disputed: false
  };

  try{
    await updateDoc(fixtureRef(fxId), payload);
    setStatus('ok', 'Submitted. Opponent can now confirm or dispute.');
    await loadFixtures();
    render();
  }catch(e){
    console.error(e);
    setStatus('err', 'Could not submit (check rules/permissions).');
  }
}

async function doConfirm(fxId, sessionNo, slotNo){
  const fx = getFxById(fxId);
  if (!fx) return;

  if (!isSessionVisibleToUser(fx, sessionNo) && !CURRENT_USER?.isAdmin) {
    setStatus('warn', 'This session is not released yet.');
    return;
  }

  if (isFixtureLockedForUser(fx)) {
    setStatus('err', 'Fixture is completed and locked. Admin only.');
    return;
  }

  const lineups = ensureLineupShape(fx);
  const aEntry = getSlotFromLineups(lineups, 'A', sessionNo, slotNo);
  const bEntry = getSlotFromLineups(lineups, 'B', sessionNo, slotNo);
  const aUid = aEntry?.uid || '';
  const bUid = bEntry?.uid || '';
  const res = getResultObj(fx, sessionNo, slotNo);

  if (!res) { setStatus('warn', 'No result to confirm.'); return; }
  if (res.confirmed) { setStatus('warn', 'Already confirmed.'); return; }
  if (res.disputed) { setStatus('warn', 'This board is disputed.'); return; }

  if (!isOpponent({user:CURRENT_USER, aUid, bUid, submittedBy: res.submittedBy, fx})) {
    setStatus('err', 'Only the opponent (or captain/admin) can confirm.');
    return;
  }

  setStatus('warn', `Confirming Board ${slotNo}…`);

  const base = `results.s${sessionNo}.b${slotNo}`;
  const payload = {};
  payload[`${base}.confirmed`] = true;
  payload[`${base}.confirmedBy`] = CURRENT_USER.uid;
  payload[`${base}.confirmedAt`] = serverTimestamp();

  try{
    await updateDoc(fixtureRef(fxId), payload);
    setStatus('ok', 'Confirmed. This board is now locked.');
    await loadFixtures();
    render();
  }catch(e){
    console.error(e);
    setStatus('err', 'Could not confirm (check rules/permissions).');
  }
}

async function doDispute(fxId, sessionNo, slotNo){
  const fx = getFxById(fxId);
  if (!fx) return;

  if (!isSessionVisibleToUser(fx, sessionNo) && !CURRENT_USER?.isAdmin) {
    setStatus('warn', 'This session is not released yet.');
    return;
  }

  if (isFixtureLockedForUser(fx)) {
    setStatus('err', 'Fixture is completed and locked. Admin only.');
    return;
  }

  const lineups = ensureLineupShape(fx);
  const aEntry = getSlotFromLineups(lineups, 'A', sessionNo, slotNo);
  const bEntry = getSlotFromLineups(lineups, 'B', sessionNo, slotNo);
  const aUid = aEntry?.uid || '';
  const bUid = bEntry?.uid || '';
  const res = getResultObj(fx, sessionNo, slotNo);

  if (!res) { setStatus('warn', 'No result to dispute.'); return; }
  if (res.confirmed) { setStatus('warn', 'Already confirmed.'); return; }
  if (res.disputed) { setStatus('warn', 'Already disputed.'); return; }

  if (!canActOnBoard({user:CURRENT_USER, aUid, bUid, fx})) {
    setStatus('err', 'Not allowed to dispute this board.');
    return;
  }

  setStatus('warn', `Disputing Board ${slotNo}…`);

  const base = `results.s${sessionNo}.b${slotNo}`;
  const payload = {};
  payload[`${base}.disputed`] = true;
  payload[`${base}.disputedBy`] = CURRENT_USER.uid;
  payload[`${base}.disputedAt`] = serverTimestamp();

  try{
    await updateDoc(fixtureRef(fxId), payload);
    setStatus('ok', 'Disputed. An admin will resolve it.');
    await loadFixtures();
    render();
  }catch(e){
    console.error(e);
    setStatus('err', 'Could not dispute (check rules/permissions).');
  }
}

function wireDelegation(){
  document.addEventListener('click', async (e) => {
    const btn = e.target?.closest?.('[data-action]');
    if (!btn) return;

    const action = btn.getAttribute('data-action');
    const fxId = btn.getAttribute('data-fx');
    const sessionNo = Number(btn.getAttribute('data-session') || 0);
    const slotNo = Number(btn.getAttribute('data-slot') || 0);

    if (action === 'select-session') {
      e.stopPropagation();
      selectSession(fxId, sessionNo);
      return;
    }

    if (action === 'toggle-board') {
      e.stopPropagation();
      toggleBoardEditor(fxId, sessionNo, slotNo);
      return;
    }

    if (action === 'submit-result') {
      e.stopPropagation();
      await doSubmit(fxId, sessionNo, slotNo);
      return;
    }

    if (action === 'confirm-result') {
      e.stopPropagation();
      await doConfirm(fxId, sessionNo, slotNo);
      return;
    }

    if (action === 'dispute-result') {
      e.stopPropagation();
      await doDispute(fxId, sessionNo, slotNo);
      return;
    }
  });
}

// ---------- boot ----------
async function boot() {
  if (!CURRENT_USER) return;

  setStatus('warn', 'Loading teams + fixtures…');

  await loadTeams();
  await loadFixtures();

  populateTeamFilter();
  populateDivisionFilter();

  setView('table');
  render();

  if (btnViewTable) btnViewTable.onclick = () => { setView('table'); render(); };
  if (btnViewFixtures) btnViewFixtures.onclick = () => { setView('fixtures'); render(); };

  if (searchInput) searchInput.oninput = () => render();
  if (teamFilter) teamFilter.onchange = () => render();
  if (divisionFilter) divisionFilter.onchange = () => render();

  if (btnReload) btnReload.onclick = async () => {
    setStatus('warn', 'Reloading…');
    await loadTeams();
    await loadFixtures();
    populateTeamFilter();
    populateDivisionFilter();
    render();
  };

  wireDelegation();
}

// ---------- auth ----------
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    signedOutUI();
    setStatus('warn', 'Please log in to view team division.');
    return;
  }
  await ensureUserContext(user);
  await boot();
});
