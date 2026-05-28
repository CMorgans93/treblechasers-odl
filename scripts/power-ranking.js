// public/power-ranking.js
// TC Power Rankings
// - Monthly Power Rating (selected season)
// - Career Power Points (permanent, never reduced)
// - Admin rebuild from confirmed live matches into /rankingEvents
// - Admin archive into /rankingArchives/{seasonKey}/players/{uid} and /careerPower/{uid}
//
// Scoring model, no paid league:
// (Base Points + Opponent Strength Bonus + Performance Bonus) × Format Weight = Ranking Gain
// Freeplay is deliberately low impact, repeat-dampened and capped per season.

import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.0.1/firebase-app.js';
import {
  getFirestore,
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  writeBatch,
  serverTimestamp,
  increment,
} from 'https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js';
import {
  getAuth,
  onAuthStateChanged,
  signOut,
} from 'https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js';
import { getAnalytics, isSupported } from 'https://www.gstatic.com/firebasejs/11.0.1/firebase-analytics.js';

// -------------------- Firebase --------------------
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

// -------------------- Ranking constants --------------------
const ACTIVE_AFTER_DAYS = 21;
const DEFAULT_FREEPLAY_WEIGHT = 0.4;
const FREEPLAY_SEASON_CAP = 40;
const PERFORMANCE_BONUS_CAP = 5;

const SOURCE_WEIGHTS = {
  division: 1.0,
  cupGroup: 0.9,
  cupKnockout: 1.0,
  tournament: 0.8,
  swiss: 0.8,
  freeplay: DEFAULT_FREEPLAY_WEIGHT,
};

const SOURCE_LABELS = {
  division: 'Free League',
  cup: 'Cup',
  tournament: 'Tournament',
  swiss: 'Swiss',
  freeplay: 'Freeplay',
};

// -------------------- DOM --------------------
const yearEl = document.getElementById('year');
if (yearEl) yearEl.textContent = String(new Date().getFullYear());

const needLoginBox = document.getElementById('needLoginBox');
const statusMeta = document.getElementById('statusMeta');

const authButtons = document.getElementById('authButtons');
const userArea = document.getElementById('userArea');
const userInitial = document.getElementById('userInitial');
const userName = document.getElementById('userName');
const btnSignOut = document.getElementById('btnSignOut');
const adminBtn = document.getElementById('adminBtn');

const btnReload = document.getElementById('btnReload');
const seasonSelect = document.getElementById('seasonSelect');
const currentSeasonChip = document.getElementById('currentSeasonChip');
const searchInput = document.getElementById('searchInput');
const activeOnly = document.getElementById('activeOnly');
const rowsCount = document.getElementById('rowsCount');

const tabs = document.querySelectorAll('.tab');
const seasonField = document.getElementById('seasonField');
const archiveField = document.getElementById('archiveField');
const archiveSeasonSelect = document.getElementById('archiveSeasonSelect');

const rankingBody = document.getElementById('rankingBody');

const youCard = document.getElementById('youCard');
const youAvatar = document.getElementById('youAvatar');
const youNameBig = document.getElementById('youNameBig');
const youEmail = document.getElementById('youEmail');
const youMonthly = document.getElementById('youMonthly');
const youCareer = document.getElementById('youCareer');
const youPosition = document.getElementById('youPosition');
const youActivity = document.getElementById('youActivity');

const metricPlayers = document.getElementById('metricPlayers');
const metricActive = document.getElementById('metricActive');
const metricEvents = document.getElementById('metricEvents');
const metricTop = document.getElementById('metricTop');

const adminPanel = document.getElementById('adminPanel');
const adminSeasonInput = document.getElementById('adminSeasonInput');
const btnAdminRebuildEvents = document.getElementById('btnAdminRebuildEvents');
const btnAdminArchive = document.getElementById('btnAdminArchive');
const adminNote = document.getElementById('adminNote');

// -------------------- State --------------------
let CURRENT_USER = null;
let CURRENT_USER_DOC = null;
let IS_ADMIN = false;

let USERS = [];
let USERS_BY_UID = {};
let CAREER_BY_UID = {};
let ARCHIVE_METAS = [];
let ACTIVE_EVENTS = [];
let LIVE_EVENTS = [];
let CURRENT_ROWS = [];
let ARCHIVE_ROWS = [];
let CURRENT_VIEW = 'monthly';
let OPEN_ROWS = new Set();

// -------------------- Helpers --------------------
function setStatus(kind, msg) {
  if (!statusMeta) return;
  statusMeta.className = `status ${kind || ''}`;
  statusMeta.textContent = msg || '';
}

function setAdminNote(msg) {
  if (adminNote) adminNote.textContent = msg || '';
}

function safeText(v, fallback = '—') {
  const s = (v == null) ? '' : String(v);
  return s.trim() ? s : fallback;
}

function escapeHtml(s) {
  return String(s ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function int(v, fallback = 0) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : fallback;
}

function num(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function round1(v) {
  const n = num(v, 0);
  return Math.round(n * 10) / 10;
}

function initials(name) {
  const s = String(name || '').trim();
  if (!s) return 'U';
  const parts = s.split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] || 'U') + (parts[1]?.[0] || '')).toUpperCase();
}

function isAdminUser(u) {
  return !!(u && (u.role === 'admin' || u.isAdmin === true));
}

function isMemberUser(u) {
  return !!(
    u?.role === 'admin' ||
    u?.isMember === true ||
    u?.isMember === 'true' ||
    u?.member === true ||
    u?.membershipActive === true ||
    u?.membership === true
  );
}

function playerName(uid) {
  const u = USERS_BY_UID[uid] || {};
  return u.displayName || u.name || u.email || uid || 'Unknown';
}

function playerEmail(uid) {
  return USERS_BY_UID[uid]?.email || '';
}

function tsToDate(ts) {
  try {
    if (!ts) return null;
    if (typeof ts.toDate === 'function') return ts.toDate();
    if (typeof ts.toMillis === 'function') return new Date(ts.toMillis());
    if (typeof ts.seconds === 'number') return new Date(ts.seconds * 1000);
    if (ts instanceof Date) return ts;
    if (typeof ts === 'number') return new Date(ts);
    if (typeof ts === 'string') {
      const d = new Date(ts);
      return Number.isFinite(d.getTime()) ? d : null;
    }
  } catch {}
  return null;
}

function dateMillis(ts) {
  const d = tsToDate(ts);
  return d ? d.getTime() : 0;
}

function seasonKeyForDate(d = new Date()) {
  const date = tsToDate(d) || new Date();
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

function validSeasonKey(v) {
  const s = String(v || '').trim();
  return /^\d{4}-\d{2}$/.test(s) ? s : seasonKeyForDate();
}

function formatDateShort(v) {
  const d = tsToDate(v);
  if (!d) return '—';
  return d.toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' });
}

function daysSince(v) {
  const d = tsToDate(v);
  if (!d) return Infinity;
  return Math.floor((Date.now() - d.getTime()) / 86400000);
}

function isConfirmedMatch(m) {
  const status = String(m?.status || '').toLowerCase();
  return !!(
    m?.locked === true ||
    m?.confirmed === true ||
    m?.approved === true ||
    m?.adminConfirmed === true ||
    m?.confirmedByAdmin === true ||
    status === 'confirmed' ||
    status === 'complete' ||
    status === 'completed' ||
    status === 'done'
  );
}

function sourcePathToEventId(path) {
  return String(path || '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 140);
}

function pairKey(a, b) {
  return [String(a || ''), String(b || '')].sort().join('__');
}

function getMatchDate(m) {
  return tsToDate(
    m?.powerSubmittedAt ||
    m?.reportedAt ||
    m?.submittedAt ||
    m?.createdAt ||
    m?.confirmedAt ||
    m?.updatedAt
  ) || new Date();
}

function getOutcome(myLegs, oppLegs) {
  const ml = int(myLegs);
  const ol = int(oppLegs);
  if (ml > ol) return 'win';
  if (ml < ol) return 'loss';
  return 'draw';
}

function getRoundKey(m) {
  return String(m?.round || m?.stage || m?.cupRound || '').toLowerCase();
}

function isCupKnockout(m) {
  const r = getRoundKey(m);
  if (m?.knockout === true || m?.isKnockout === true) return true;
  if (String(m?.stageType || '').toLowerCase() === 'knockout') return true;
  if (['ko','knockout','last16','r16','qf','quarter','quarterfinal','sf','semi','semifinal','final'].some(x => r.includes(x))) return true;
  return false;
}

function isCupGroup(m) {
  const r = getRoundKey(m);
  return m?.group === true || m?.groupStage === true || String(m?.stageType || '').toLowerCase() === 'group' || r.includes('group');
}

function getSourceWeight(sourceType, m) {
  if (sourceType === 'division') return SOURCE_WEIGHTS.division;
  if (sourceType === 'freeplay') return SOURCE_WEIGHTS.freeplay;
  if (sourceType === 'swiss') return SOURCE_WEIGHTS.swiss;
  if (sourceType === 'tournament') return SOURCE_WEIGHTS.tournament;
  if (sourceType === 'cup') return isCupKnockout(m) ? SOURCE_WEIGHTS.cupKnockout : SOURCE_WEIGHTS.cupGroup;
  return 1;
}

function sourceBucket(sourceType, m) {
  if (sourceType === 'division') return 'league';
  if (sourceType === 'freeplay') return 'freeplay';
  if (sourceType === 'swiss') return 'tournament';
  if (sourceType === 'tournament') return 'tournament';
  if (sourceType === 'cup') return 'cup';
  return 'other';
}

function sourceLabel(sourceType, m) {
  if (sourceType === 'cup') return isCupKnockout(m) ? 'Cup KO' : 'Cup Group';
  return SOURCE_LABELS[sourceType] || sourceType || 'Match';
}

function bonusCount(m, sidePrefix) {
  const p = sidePrefix;
  return (
    int(m?.[`${p}BigVisits171Plus`] ?? m?.[`${p}_171`] ?? m?.[`${p}171`]) +
    int(m?.[`${p}HighCheckouts100Plus`] ?? m?.[`${p}_100co`] ?? m?.[`${p}100`]) +
    int(m?.[`${p}BullFinishes`] ?? m?.[`${p}_bull`] ?? m?.[`${p}Bull`]) +
    int(m?.[`${p}DoubleDoubleFinishes`] ?? m?.[`${p}_dd`] ?? m?.[`${p}DD`])
  );
}

function performanceBonus(m, sidePrefix) {
  return Math.min(PERFORMANCE_BONUS_CAP, bonusCount(m, sidePrefix));
}

function basePointsForSide({ sourceType, m, myLegs, oppLegs, isBye = false }) {
  const ml = int(myLegs);
  const ol = int(oppLegs);
  const outcome = isBye ? 'win' : getOutcome(ml, ol);

  if (isBye) {
    return { base: 5, outcome, reason: 'Bye/admin advancement' };
  }

  if (sourceType === 'division') {
    if (outcome === 'win') return { base: 10, outcome, reason: 'Free League win' };
    if (outcome === 'draw') return { base: 5, outcome, reason: 'Free League draw' };
    const lossPoints = ml >= 3 ? 4 : ml === 2 ? 2 : ml === 1 ? 1 : 0;
    return { base: lossPoints, outcome, reason: `Free League loss: ${ml} legs won` };
  }

  if (sourceType === 'cup') {
    const winBase = isCupKnockout(m) ? 12 : 11;
    if (outcome === 'win') return { base: winBase, outcome, reason: isCupKnockout(m) ? 'Cup knockout win' : 'Cup group win' };
    if (outcome === 'draw') return { base: 6, outcome, reason: 'Cup group draw' };
    return { base: Math.min(4, ml), outcome, reason: `Cup loss: ${ml} legs won` };
  }

  if (sourceType === 'tournament' || sourceType === 'swiss') {
    if (outcome === 'win') return { base: 10, outcome, reason: `${sourceLabel(sourceType, m)} win` };
    if (outcome === 'draw') return { base: 5, outcome, reason: `${sourceLabel(sourceType, m)} draw` };
    return { base: Math.min(3, ml), outcome, reason: `${sourceLabel(sourceType, m)} loss: ${ml} legs won` };
  }

  if (sourceType === 'freeplay') {
    const activity = 1;
    if (outcome === 'win') return { base: 5 + activity, outcome, reason: 'Freeplay win + activity' };
    if (outcome === 'draw') return { base: 3 + activity, outcome, reason: 'Freeplay draw + activity' };
    const close = Math.abs(ml - ol) <= 1;
    const lossPoints = close ? 2 : (ml > 0 ? 1 : 0);
    return { base: lossPoints + activity, outcome, reason: close ? 'Close Freeplay loss + activity' : 'Freeplay activity' };
  }

  if (outcome === 'win') return { base: 10, outcome, reason: 'Win' };
  if (outcome === 'draw') return { base: 5, outcome, reason: 'Draw' };
  return { base: Math.min(3, ml), outcome, reason: 'Loss' };
}

function strengthBonusForResult({ outcome, myRatingBefore, oppRatingBefore }) {
  if (outcome !== 'win') return 0;
  const diff = round1(num(oppRatingBefore) - num(myRatingBefore));

  // Beat a stronger player: +5 to +12
  if (diff >= 80) return 12;
  if (diff >= 60) return 10;
  if (diff >= 40) return 8;
  if (diff >= 20) return 6;
  if (diff >= 5) return 5;

  // Beat a near-equal player: +3 to +6 in the proposal. Keep it moderate.
  if (diff >= -5) return 4;

  // Beat a lower player: +1 to +3
  if (diff >= -20) return 3;
  if (diff >= -50) return 2;
  return 1;
}

function freeplayDampenerForPairCount(nBefore) {
  if (nBefore < 2) return 1;
  if (nBefore < 5) return 0.5;
  return 0.25;
}

function applyFreeplayCap(uid, seasonKey, rawGain, freeplayUsedBySeasonUid) {
  const key = `${seasonKey}:${uid}`;
  const used = num(freeplayUsedBySeasonUid[key], 0);
  const remaining = Math.max(0, FREEPLAY_SEASON_CAP - used);
  const allowed = Math.min(rawGain, remaining);
  freeplayUsedBySeasonUid[key] = round1(used + allowed);
  return round1(allowed);
}

function sideGain({ sourceType, m, side, myRatingBefore, oppRatingBefore, dampener, freeplayUsedBySeasonUid, seasonKey }) {
  const p = side === 'p1' ? 'p1' : 'p2';
  const op = side === 'p1' ? 'p2' : 'p1';
  const myUid = m[p];
  const myLegs = int(m?.[`${p}Legs`] ?? m?.[`${p}_legs`] ?? m?.[`${p}score`]);
  const oppLegs = int(m?.[`${op}Legs`] ?? m?.[`${op}_legs`] ?? m?.[`${op}score`]);
  const isBye = !m?.[op] && String(m?.submissionType || '').toLowerCase() === 'bye';

  const base = basePointsForSide({ sourceType, m, myLegs, oppLegs, isBye });
  const perf = performanceBonus(m, p);
  const strength = strengthBonusForResult({
    outcome: base.outcome,
    myRatingBefore,
    oppRatingBefore,
  });

  const weight = getSourceWeight(sourceType, m);
  const rawBeforeDampener = (base.base + perf + strength) * weight;
  let raw = rawBeforeDampener * (sourceType === 'freeplay' ? dampener : 1);
  raw = round1(raw);

  let final = raw;
  let capped = false;
  if (sourceType === 'freeplay' && myUid) {
    const before = final;
    final = applyFreeplayCap(myUid, seasonKey, final, freeplayUsedBySeasonUid);
    capped = final < before;
  }

  return {
    uid: myUid || '',
    gain: round1(final),
    rawGain: raw,
    base: base.base,
    outcome: base.outcome,
    performance: perf,
    strength,
    weight,
    dampener: sourceType === 'freeplay' ? dampener : 1,
    capped,
    reason: base.reason,
    legsFor: myLegs,
    legsAgainst: oppLegs,
    ratingBefore: round1(myRatingBefore),
    opponentRatingBefore: round1(oppRatingBefore),
  };
}

function normalizeLiveMatch({ id, path, sourceType, data }) {
  const m = data || {};
  if (!isConfirmedMatch(m)) return null;
  if (m.rankingExcluded === true || m.powerExcluded === true) return null;

  const p1 = String(m.p1 || m.pA || m.player1 || m.playerA || '').trim();
  const p2 = String(m.p2 || m.pB || m.player2 || m.playerB || '').trim();
  if (!p1) return null;
  if (!p2 && String(m.submissionType || '').toLowerCase() !== 'bye') return null;

  const date = getMatchDate(m);
  const seasonKey = String(m.powerSeasonKey || m.seasonKey || seasonKeyForDate(date));

  let finalSource = sourceType;
  if (sourceType === 'tournament' && (m.swissCup === true || String(m.submissionType || '').toLowerCase() === 'swiss')) {
    finalSource = 'swiss';
  }

  return {
    ...m,
    id,
    sourcePath: path,
    sourceType: finalSource,
    seasonKey,
    matchDate: date.toISOString(),
    p1,
    p2,
    p1Legs: int(m.p1Legs ?? m.p1_legs ?? m.p1score),
    p2Legs: int(m.p2Legs ?? m.p2_legs ?? m.p2score),
  };
}

function buildEventsFromLiveMatches(liveMatches, seasonFilter = '') {
  const sorted = liveMatches
    .filter(Boolean)
    .filter(m => !seasonFilter || m.seasonKey === seasonFilter)
    .sort((a, b) => (dateMillis(a.matchDate) - dateMillis(b.matchDate)) || String(a.sourcePath).localeCompare(String(b.sourcePath)));

  const monthlyBeforeBySeasonUid = {};
  const pairCounts = {};
  const freeplayUsed = {};
  const events = [];

  function getBefore(season, uid) {
    return num(monthlyBeforeBySeasonUid[`${season}:${uid}`], 0);
  }
  function addAfter(season, uid, gain) {
    if (!uid) return;
    const key = `${season}:${uid}`;
    monthlyBeforeBySeasonUid[key] = round1(num(monthlyBeforeBySeasonUid[key], 0) + num(gain, 0));
  }

  for (const m of sorted) {
    const p1 = m.p1;
    const p2 = m.p2;
    const seasonKey = m.seasonKey;
    const p1Before = getBefore(seasonKey, p1);
    const p2Before = p2 ? getBefore(seasonKey, p2) : 0;

    const snap = m.powerSnapshots || m.powerSnapshot || {};
    const p1OppAtSubmission = num(snap.p1OpponentMonthlyAtSubmission ?? snap.p1OpponentMonthly ?? snap.p2MonthlyBefore, p2Before);
    const p2OppAtSubmission = num(snap.p2OpponentMonthlyAtSubmission ?? snap.p2OpponentMonthly ?? snap.p1MonthlyBefore, p1Before);
    const p1AtSubmission = num(snap.p1MonthlyAtSubmission ?? snap.p1MonthlyBefore, p1Before);
    const p2AtSubmission = num(snap.p2MonthlyAtSubmission ?? snap.p2MonthlyBefore, p2Before);

    let dampener = 1;
    if (m.sourceType === 'freeplay' && p1 && p2) {
      const pk = `${seasonKey}:${pairKey(p1, p2)}`;
      const n = int(pairCounts[pk], 0);
      dampener = freeplayDampenerForPairCount(n);
      pairCounts[pk] = n + 1;
    }

    const p1Breakdown = sideGain({
      sourceType: m.sourceType,
      m,
      side: 'p1',
      myRatingBefore: p1AtSubmission,
      oppRatingBefore: p1OppAtSubmission,
      dampener,
      freeplayUsedBySeasonUid: freeplayUsed,
      seasonKey,
    });

    let p2Breakdown = null;
    if (p2) {
      p2Breakdown = sideGain({
        sourceType: m.sourceType,
        m,
        side: 'p2',
        myRatingBefore: p2AtSubmission,
        oppRatingBefore: p2OppAtSubmission,
        dampener,
        freeplayUsedBySeasonUid: freeplayUsed,
        seasonKey,
      });
    }

    addAfter(seasonKey, p1, p1Breakdown.gain);
    if (p2 && p2Breakdown) addAfter(seasonKey, p2, p2Breakdown.gain);

    const eventId = sourcePathToEventId(m.sourcePath);
    events.push({
      id: eventId,
      eventId,
      sourcePath: m.sourcePath,
      sourceId: m.id || '',
      sourceType: m.sourceType,
      sourceLabel: sourceLabel(m.sourceType, m),
      bucket: sourceBucket(m.sourceType, m),
      status: 'active',
      seasonKey,
      matchDate: m.matchDate,
      submittedAt: m.powerSubmittedAt || m.reportedAt || m.submittedAt || m.createdAt || null,
      confirmedAt: m.confirmedAt || m.updatedAt || null,
      p1,
      p2: p2 || null,
      p1Name: playerName(p1),
      p2Name: p2 ? playerName(p2) : 'Bye',
      p1Legs: int(m.p1Legs),
      p2Legs: int(m.p2Legs),
      gameType: m.gameType || '',
      lengthMode: m.lengthMode || '',
      target: m.target || null,
      round: m.round || null,
      p1Gain: p1Breakdown.gain,
      p2Gain: p2Breakdown ? p2Breakdown.gain : 0,
      p1Breakdown,
      p2Breakdown,
      p1Outcome: p1Breakdown.outcome,
      p2Outcome: p2Breakdown?.outcome || 'bye',
      p1PerformanceBonus: p1Breakdown.performance,
      p2PerformanceBonus: p2Breakdown?.performance || 0,
      p1StrengthBonus: p1Breakdown.strength,
      p2StrengthBonus: p2Breakdown?.strength || 0,
      formatWeight: p1Breakdown.weight,
      freeplayDampener: p1Breakdown.dampener,
      createdFromLive: true,
      updatedAtClient: new Date().toISOString(),
    });
  }

  return events;
}

// -------------------- Data loading --------------------
async function loadUsers() {
  const snap = await getDocs(collection(db, 'users'));
  const arr = [];
  snap.forEach(d => arr.push({ uid: d.id, id: d.id, ...(d.data() || {}) }));
  arr.sort((a, b) => (a.displayName || a.email || a.uid || '').localeCompare(b.displayName || b.email || b.uid || ''));
  USERS = arr;
  USERS_BY_UID = Object.fromEntries(arr.map(u => [u.uid, u]));
}

async function loadCareerPower() {
  CAREER_BY_UID = {};
  try {
    const snap = await getDocs(collection(db, 'careerPower'));
    snap.forEach(d => { CAREER_BY_UID[d.id] = { uid: d.id, ...(d.data() || {}) }; });
  } catch (e) {
    console.warn('[power-ranking] careerPower read skipped', e);
  }
}

async function loadArchiveMetas() {
  ARCHIVE_METAS = [];
  try {
    const snap = await getDocs(collection(db, 'rankingArchives'));
    snap.forEach(d => ARCHIVE_METAS.push({ id: d.id, ...(d.data() || {}) }));
    ARCHIVE_METAS.sort((a, b) => String(b.id).localeCompare(String(a.id)));
  } catch (e) {
    console.warn('[power-ranking] archives read skipped', e);
  }
  renderArchivePicker();
}

async function loadRankingEvents() {
  ACTIVE_EVENTS = [];
  try {
    const snap = await getDocs(collection(db, 'rankingEvents'));
    snap.forEach(d => {
      const ev = { id: d.id, ...(d.data() || {}) };
      if (String(ev.status || 'active') === 'active') ACTIVE_EVENTS.push(ev);
    });
  } catch (e) {
    console.warn('[power-ranking] rankingEvents read skipped', e);
  }
}

async function loadLiveMatches() {
  const raw = [];

  // Free League divisions: /divisions/{divisionId}/matches
  try {
    const divRoots = await getDocs(collection(db, 'divisions'));
    for (const div of divRoots.docs) {
      const divId = div.id;
      const mSnap = await getDocs(collection(db, 'divisions', divId, 'matches'));
      mSnap.forEach(md => raw.push({ id: md.id, path: `divisions/${divId}/matches/${md.id}`, sourceType: 'division', data: md.data() || {} }));
    }
  } catch (e) {
    console.warn('[power-ranking] divisions read issue', e);
  }

  // Freeplay: /freeplay/global/matches
  try {
    const fpSnap = await getDocs(collection(db, 'freeplay', 'global', 'matches'));
    fpSnap.forEach(md => raw.push({ id: md.id, path: `freeplay/global/matches/${md.id}`, sourceType: 'freeplay', data: md.data() || {} }));
  } catch (e) {
    console.warn('[power-ranking] freeplay read issue', e);
  }

  // Tournaments and Swiss: /tournaments/global/matches
  try {
    const tSnap = await getDocs(collection(db, 'tournaments', 'global', 'matches'));
    tSnap.forEach(md => raw.push({ id: md.id, path: `tournaments/global/matches/${md.id}`, sourceType: 'tournament', data: md.data() || {} }));
  } catch (e) {
    console.warn('[power-ranking] tournaments read issue', e);
  }

  // Cups: /cups/{cupId}/matches
  try {
    const cupRoots = await getDocs(collection(db, 'cups'));
    for (const cup of cupRoots.docs) {
      const cupId = cup.id;
      const mSnap = await getDocs(collection(db, 'cups', cupId, 'matches'));
      mSnap.forEach(md => raw.push({ id: md.id, path: `cups/${cupId}/matches/${md.id}`, sourceType: 'cup', data: md.data() || {} }));
    }
  } catch (e) {
    console.warn('[power-ranking] cups read issue', e);
  }

  // Legacy/member cups: /memcups/{cupId}/matches
  try {
    const memRoots = await getDocs(collection(db, 'memcups'));
    for (const cup of memRoots.docs) {
      const cupId = cup.id;
      const mSnap = await getDocs(collection(db, 'memcups', cupId, 'matches'));
      mSnap.forEach(md => raw.push({ id: md.id, path: `memcups/${cupId}/matches/${md.id}`, sourceType: 'cup', data: md.data() || {} }));
    }
  } catch (e) {
    console.warn('[power-ranking] memcups read issue', e);
  }

  const seen = new Set();
  const matches = [];
  raw.forEach(row => {
    if (seen.has(row.path)) return;
    seen.add(row.path);
    const m = normalizeLiveMatch(row);
    if (m) matches.push(m);
  });

  LIVE_EVENTS = buildEventsFromLiveMatches(matches);
  return LIVE_EVENTS;
}

function currentSeasonKey() {
  return validSeasonKey(seasonSelect?.value || seasonKeyForDate());
}

function currentArchiveMeta(seasonKey) {
  return ARCHIVE_METAS.find(a => a.id === seasonKey || a.seasonKey === seasonKey) || null;
}

function renderArchivePicker() {
  if (!archiveSeasonSelect) return;
  const opts = ARCHIVE_METAS.map(a => {
    const id = a.seasonKey || a.id;
    const label = a.label || id;
    return `<option value="${escapeHtml(id)}">${escapeHtml(label)}${a.locked ? ' • locked' : ''}</option>`;
  });
  archiveSeasonSelect.innerHTML = opts.length ? opts.join('') : '<option value="">No archives yet</option>';
}

// -------------------- Aggregation --------------------
function emptyRow(uid) {
  const u = USERS_BY_UID[uid] || {};
  return {
    uid,
    name: playerName(uid),
    email: playerEmail(uid),
    isMember: isMemberUser(u),
    monthlyPower: 0,
    careerPower: num(CAREER_BY_UID[uid]?.careerPower, 0),
    played: 0,
    wins: 0,
    draws: 0,
    losses: 0,
    league: 0,
    cup: 0,
    tournament: 0,
    freeplay: 0,
    strength: 0,
    performance: 0,
    legsFor: 0,
    legsAgainst: 0,
    lastRankingMatchAt: null,
    events: [],
  };
}

function applyEventToRow(row, ev, side) {
  const prefix = side === 'p1' ? 'p1' : 'p2';
  const gain = round1(num(ev[`${prefix}Gain`], 0));
  if (gain <= 0 && !ev[`${prefix}Breakdown`]) return;

  const bd = ev[`${prefix}Breakdown`] || {};
  const outcome = String(ev[`${prefix}Outcome`] || bd.outcome || '').toLowerCase();
  const bucket = ev.bucket || sourceBucket(ev.sourceType, ev);

  row.monthlyPower = round1(row.monthlyPower + gain);
  row.played += 1;
  if (outcome === 'win') row.wins += 1;
  else if (outcome === 'draw') row.draws += 1;
  else if (outcome === 'loss') row.losses += 1;

  if (bucket === 'league') row.league = round1(row.league + gain);
  else if (bucket === 'cup') row.cup = round1(row.cup + gain);
  else if (bucket === 'tournament') row.tournament = round1(row.tournament + gain);
  else if (bucket === 'freeplay') row.freeplay = round1(row.freeplay + gain);

  row.strength = round1(row.strength + num(ev[`${prefix}StrengthBonus`] ?? bd.strength, 0));
  row.performance = round1(row.performance + num(ev[`${prefix}PerformanceBonus`] ?? bd.performance, 0));

  const lf = int(side === 'p1' ? ev.p1Legs : ev.p2Legs);
  const la = int(side === 'p1' ? ev.p2Legs : ev.p1Legs);
  row.legsFor += lf;
  row.legsAgainst += la;

  const d = tsToDate(ev.matchDate || ev.confirmedAt || ev.submittedAt);
  if (d && (!row.lastRankingMatchAt || d.getTime() > tsToDate(row.lastRankingMatchAt).getTime())) {
    row.lastRankingMatchAt = d.toISOString();
  }

  row.events.push({ ...ev, side, gain, breakdown: bd });
}

function aggregateMonthlyRows(events, seasonKey) {
  const rowsByUid = {};
  const selected = events.filter(ev => String(ev.seasonKey || '') === seasonKey && String(ev.status || 'active') === 'active');

  function ensure(uid) {
    if (!uid) return null;
    rowsByUid[uid] ||= emptyRow(uid);
    return rowsByUid[uid];
  }

  selected.forEach(ev => {
    if (ev.p1) applyEventToRow(ensure(ev.p1), ev, 'p1');
    if (ev.p2) applyEventToRow(ensure(ev.p2), ev, 'p2');
  });

  const meta = currentArchiveMeta(seasonKey);
  const currentSeasonAlreadyInCareer = !!(meta && meta.careerApplied === true);

  const rows = Object.values(rowsByUid).map(r => ({
    ...r,
    careerPowerDisplay: round1(r.careerPower + (currentSeasonAlreadyInCareer ? 0 : r.monthlyPower)),
    isActive: isActiveRow(r),
  }));

  rows.sort(sortMonthlyRows);
  return { rows, events: selected };
}

function aggregateCareerRows(monthlyRows, allEvents = []) {
  const rowsByUid = {};
  const hasCareerDocs = Object.keys(CAREER_BY_UID).length > 0;

  // Source of truth: /careerPower. If absent, fall back to all active events.
  if (hasCareerDocs) {
    Object.keys(CAREER_BY_UID).forEach(uid => {
      const r = emptyRow(uid);
      r.careerPower = round1(num(CAREER_BY_UID[uid]?.careerPower, 0));
      r.monthlyPower = monthlyRows.find(x => x.uid === uid)?.monthlyPower || 0;
      r.careerPowerDisplay = round1(r.careerPower + r.monthlyPower);
      r.played = int(CAREER_BY_UID[uid]?.totalEvents, 0);
      r.wins = int(CAREER_BY_UID[uid]?.wins, 0);
      r.draws = int(CAREER_BY_UID[uid]?.draws, 0);
      r.losses = int(CAREER_BY_UID[uid]?.losses, 0);
      r.lastRankingMatchAt = CAREER_BY_UID[uid]?.lastRankingMatchAt || null;
      r.isActive = isActiveRow(monthlyRows.find(x => x.uid === uid) || r);
      rowsByUid[uid] = r;
    });

    // Include players with current monthly points but no career doc yet.
    monthlyRows.forEach(m => {
      if (rowsByUid[m.uid]) {
        rowsByUid[m.uid].monthlyPower = m.monthlyPower;
        rowsByUid[m.uid].careerPowerDisplay = round1(rowsByUid[m.uid].careerPower + m.monthlyPower);
        rowsByUid[m.uid].isActive = m.isActive;
      } else {
        rowsByUid[m.uid] = { ...m, careerPowerDisplay: round1(m.monthlyPower) };
      }
    });
  } else {
    allEvents.filter(ev => String(ev.status || 'active') === 'active').forEach(ev => {
      if (ev.p1) applyEventToRow(rowsByUid[ev.p1] ||= emptyRow(ev.p1), ev, 'p1');
      if (ev.p2) applyEventToRow(rowsByUid[ev.p2] ||= emptyRow(ev.p2), ev, 'p2');
    });
    Object.values(rowsByUid).forEach(r => {
      r.careerPower = r.monthlyPower;
      r.careerPowerDisplay = r.monthlyPower;
      r.isActive = isActiveRow(monthlyRows.find(x => x.uid === r.uid) || r);
    });
  }

  const rows = Object.values(rowsByUid).filter(r => r.careerPowerDisplay > 0 || r.monthlyPower > 0);
  rows.sort((a, b) => (b.careerPowerDisplay - a.careerPowerDisplay) || String(a.name).localeCompare(String(b.name)));
  return rows;
}

function isActiveRow(row) {
  if (!row || row.played <= 0) return false;
  return daysSince(row.lastRankingMatchAt) <= ACTIVE_AFTER_DAYS;
}

function sortMonthlyRows(a, b) {
  return (
    (b.monthlyPower - a.monthlyPower) ||
    (b.wins - a.wins) ||
    ((b.legsFor - b.legsAgainst) - (a.legsFor - a.legsAgainst)) ||
    (b.performance - a.performance) ||
    String(a.name).localeCompare(String(b.name))
  );
}

function activeEventsForSeasonOrLive(seasonKey) {
  const persisted = ACTIVE_EVENTS.filter(ev => String(ev.seasonKey || '') === seasonKey);
  if (persisted.length) return { events: persisted, mode: 'saved' };
  const live = LIVE_EVENTS.filter(ev => String(ev.seasonKey || '') === seasonKey);
  return { events: live, mode: 'live-preview' };
}

// -------------------- Rendering --------------------
function rowStatusPill(row) {
  if (row.isActive) return '<span class="pill ok">Active</span>';
  if (row.played > 0) return '<span class="pill warn">Inactive</span>';
  return '<span class="pill dim">No games</span>';
}

function formatNum(v) {
  const n = round1(v);
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

function renderRows(rows, view) {
  if (!rankingBody) return;

  const q = String(searchInput?.value || '').trim().toLowerCase();
  const onlyActive = !!activeOnly?.checked && view === 'monthly';

  let filtered = rows.filter(r => {
    if (q && !String(`${r.name} ${r.email}`).toLowerCase().includes(q)) return false;
    if (onlyActive && !r.isActive) return false;
    return true;
  });

  if (rowsCount) rowsCount.textContent = `${filtered.length} players`;

  if (!filtered.length) {
    rankingBody.innerHTML = `<tr><td colspan="16" class="muted">No ranking rows for this view.</td></tr>`;
    return;
  }

  rankingBody.innerHTML = filtered.map((r, idx) => renderRankingRow(r, idx, view)).join('');
}

function renderRankingRow(r, idx, view) {
  const isMe = CURRENT_USER && r.uid === CURRENT_USER.uid;
  const expId = `exp-${r.uid}`;
  const open = OPEN_ROWS.has(r.uid);
  const nameHtml = r.isMember
    ? `<span class="member-name">${escapeHtml(r.name)}</span><span class="member-badge">M</span>`
    : `<span class="name">${escapeHtml(r.name)}</span>`;

  const careerValue = view === 'career' ? r.careerPowerDisplay : r.careerPowerDisplay;
  const main = `
    <tr class="${isMe ? 'me' : ''}">
      <td><button class="exp-btn" data-exp="${escapeHtml(r.uid)}" type="button">${open ? '−' : '+'}</button></td>
      <td class="pos">${idx + 1}</td>
      <td>${nameHtml}<div class="tiny">${escapeHtml(r.email || r.uid)}</div></td>
      <td>${rowStatusPill(r)}<div class="tiny">Last: ${formatDateShort(r.lastRankingMatchAt)}</div></td>
      <td class="monthly-col"><span class="num">${formatNum(r.monthlyPower)}</span></td>
      <td class="career-col"><span class="num">${formatNum(careerValue)}</span></td>
      <td>${r.played}</td>
      <td>${r.wins}</td>
      <td>${r.draws}</td>
      <td>${r.losses}</td>
      <td>${formatNum(r.league)}</td>
      <td>${formatNum(r.cup)}</td>
      <td>${formatNum(r.tournament)}</td>
      <td>${formatNum(r.freeplay)}</td>
      <td class="positive">+${formatNum(r.strength)}</td>
      <td class="positive">+${formatNum(r.performance)}</td>
    </tr>`;

  if (!open) return main;

  const detail = `
    <tr id="${expId}" class="breakdown-row">
      <td colspan="16">
        <div class="breakdown-box">
          <div class="mini"><span>Monthly</span><b>${formatNum(r.monthlyPower)}</b></div>
          <div class="mini"><span>Career shown</span><b>${formatNum(r.careerPowerDisplay)}</b></div>
          <div class="mini"><span>Leg diff</span><b>${r.legsFor - r.legsAgainst >= 0 ? '+' : ''}${r.legsFor - r.legsAgainst}</b></div>
          <div class="mini"><span>Freeplay cap</span><b>${FREEPLAY_SEASON_CAP}</b></div>
          <div class="mini"><span>Activity rule</span><b>${ACTIVE_AFTER_DAYS} days</b></div>
        </div>
        ${renderRecentEvents(r.events || [])}
      </td>
    </tr>`;
  return main + detail;
}

function renderRecentEvents(events) {
  if (!events.length) return '<div class="tiny" style="margin-top:10px;">No event breakdown available for this row.</div>';
  const latest = [...events].sort((a, b) => dateMillis(b.matchDate) - dateMillis(a.matchDate)).slice(0, 8);
  const rows = latest.map(ev => {
    const bd = ev.breakdown || {};
    const opp = ev.side === 'p1' ? (ev.p2Name || playerName(ev.p2)) : (ev.p1Name || playerName(ev.p1));
    return `
      <div class="mini">
        <span>${escapeHtml(ev.sourceLabel || ev.sourceType)} • ${formatDateShort(ev.matchDate)}</span>
        <b>${formatNum(ev.gain)} pts vs ${escapeHtml(opp || 'Bye')}</b>
        <div class="tiny">
          Base ${formatNum(bd.base || 0)} • Strength +${formatNum(bd.strength || 0)} • Perf +${formatNum(bd.performance || 0)} • Weight ×${formatNum(bd.weight || ev.formatWeight || 1)}${bd.dampener && bd.dampener !== 1 ? ` • Damp ×${formatNum(bd.dampener)}` : ''}${bd.capped ? ' • capped' : ''}
        </div>
      </div>`;
  }).join('');
  return `<div class="breakdown-box" style="margin-top:10px;">${rows}</div>`;
}

function updateMetrics(rows, events) {
  if (metricPlayers) metricPlayers.textContent = String(rows.length);
  if (metricActive) metricActive.textContent = String(rows.filter(r => r.isActive).length);
  if (metricEvents) metricEvents.textContent = String(events.length);
  if (metricTop) metricTop.textContent = rows.length ? formatNum(rows[0].monthlyPower || 0) : '0';
}

function renderYou(rows, careerRows) {
  if (!CURRENT_USER || !youCard) {
    if (youCard) youCard.style.display = 'none';
    return;
  }

  const uid = CURRENT_USER.uid;
  const monthlyIdx = rows.findIndex(r => r.uid === uid);
  const monthly = monthlyIdx >= 0 ? rows[monthlyIdx] : null;
  const career = careerRows.find(r => r.uid === uid) || monthly;
  const name = playerName(uid) || CURRENT_USER.email || 'You';

  youCard.style.display = 'flex';
  if (youAvatar) youAvatar.textContent = initials(name);
  if (youNameBig) youNameBig.textContent = name;
  if (youEmail) youEmail.textContent = CURRENT_USER.email || playerEmail(uid) || '';
  if (youMonthly) youMonthly.textContent = formatNum(monthly?.monthlyPower || 0);
  if (youCareer) youCareer.textContent = formatNum(career?.careerPowerDisplay || 0);
  if (youPosition) youPosition.textContent = monthlyIdx >= 0 ? String(monthlyIdx + 1) : '—';
  if (youActivity) {
    youActivity.className = `pill ${monthly?.isActive ? 'ok' : 'warn'}`;
    youActivity.textContent = monthly?.isActive ? 'Active' : 'Inactive / no games';
  }
}

async function renderArchive() {
  if (!archiveSeasonSelect?.value) {
    rankingBody.innerHTML = `<tr><td colspan="16" class="muted">No archived seasons yet.</td></tr>`;
    if (rowsCount) rowsCount.textContent = '0 players';
    return;
  }

  const seasonKey = archiveSeasonSelect.value;
  try {
    const snap = await getDocs(collection(db, 'rankingArchives', seasonKey, 'players'));
    const rows = [];
    snap.forEach(d => rows.push({ uid: d.id, ...(d.data() || {}) }));
    rows.forEach(r => {
      r.name = r.name || playerName(r.uid);
      r.email = r.email || playerEmail(r.uid);
      r.monthlyPower = num(r.monthlyPower, 0);
      r.careerPowerDisplay = num(r.careerPowerAfter ?? r.careerPowerDisplay ?? r.careerPower, 0);
      r.isMember = isMemberUser(USERS_BY_UID[r.uid]);
      r.isActive = true;
      r.events = [];
    });
    rows.sort(sortMonthlyRows);
    ARCHIVE_ROWS = rows;
    renderRows(ARCHIVE_ROWS, 'archive');
    setStatus('ok', `Loaded archive ${seasonKey}.`);
  } catch (e) {
    console.error('[power-ranking] archive load failed', e);
    setStatus('err', 'Could not read archived season. Check permissions.');
  }
}

function applyViewChrome() {
  if (CURRENT_VIEW === 'archive') {
    seasonField?.classList.add('hidden');
    archiveField?.classList.remove('hidden');
    if (activeOnly) activeOnly.checked = false;
  } else {
    seasonField?.classList.remove('hidden');
    archiveField?.classList.add('hidden');
  }
}

async function renderCurrentView() {
  applyViewChrome();

  if (CURRENT_VIEW === 'archive') {
    await renderArchive();
    return;
  }

  const seasonKey = currentSeasonKey();
  if (currentSeasonChip) currentSeasonChip.textContent = `Season ${seasonKey}`;
  if (adminSeasonInput && !adminSeasonInput.value) adminSeasonInput.value = seasonKey;

  const { events, mode } = activeEventsForSeasonOrLive(seasonKey);
  const { rows } = aggregateMonthlyRows(events, seasonKey);
  const allForCareer = ACTIVE_EVENTS.length ? ACTIVE_EVENTS : LIVE_EVENTS;
  const careerRows = aggregateCareerRows(rows, allForCareer);

  CURRENT_ROWS = CURRENT_VIEW === 'career' ? careerRows : rows;
  updateMetrics(rows, events);
  renderYou(rows, careerRows);
  renderRows(CURRENT_ROWS, CURRENT_VIEW);

  const modeText = mode === 'saved'
    ? 'saved ranking events'
    : 'live preview from confirmed matches. Admin should Save/Rebuild Events before deleting/resetting games.';
  setStatus(mode === 'saved' ? 'ok' : 'warn', `Showing ${modeText} for ${seasonKey}.`);
}

async function reloadAll() {
  if (btnReload) btnReload.disabled = true;
  setStatus('warn', 'Loading Power Rankings…');

  try {
    await loadUsers();
    await loadCareerPower();
    await loadArchiveMetas();
    await loadRankingEvents();
    await loadLiveMatches();
    await renderCurrentView();
  } catch (e) {
    console.error('[power-ranking] load failed', e);
    setStatus('err', 'Load failed. Check console and Firestore permissions.');
    if (rankingBody) rankingBody.innerHTML = `<tr><td colspan="16" class="muted">Could not load rankings.</td></tr>`;
  } finally {
    if (btnReload) btnReload.disabled = false;
  }
}

// -------------------- Admin writes --------------------
async function writeBatches(ops) {
  const chunkSize = 430;
  for (let i = 0; i < ops.length; i += chunkSize) {
    const batch = writeBatch(db);
    const chunk = ops.slice(i, i + chunkSize);
    chunk.forEach(op => {
      if (op.type === 'set') batch.set(op.ref, op.data, op.options || { merge: true });
    });
    await batch.commit();
  }
}

async function adminRebuildEvents() {
  if (!IS_ADMIN) return alert('Admin only.');

  const seasonKey = validSeasonKey(adminSeasonInput?.value || seasonSelect?.value);
  const ok = confirm(`Save/Rebuild Power Ranking events for ${seasonKey}?\n\nThis reads confirmed live matches and writes permanent rankingEvents. Existing events with the same source path are overwritten/merged.`);
  if (!ok) return;

  btnAdminRebuildEvents.disabled = true;
  setAdminNote('Reading live matches and calculating power events…');

  try {
    await loadUsers();
    const liveEvents = await loadLiveMatches();
    const events = liveEvents.filter(ev => ev.seasonKey === seasonKey);

    if (!events.length) {
      setAdminNote(`No confirmed live matches found for ${seasonKey}.`);
      return;
    }

    const ops = events.map(ev => ({
      type: 'set',
      ref: doc(db, 'rankingEvents', ev.id),
      data: {
        ...ev,
        status: 'active',
        rebuiltAt: serverTimestamp(),
        rebuiltBy: CURRENT_USER.uid,
      },
      options: { merge: true },
    }));

    await writeBatches(ops);
    setAdminNote(`Saved ${events.length} ranking events for ${seasonKey}.`);
    await reloadAll();
  } catch (e) {
    console.error('[power-ranking] adminRebuildEvents failed', e);
    setAdminNote('Save/Rebuild failed. Check console and Firestore rules.');
    alert('Save/Rebuild failed. Check console and Firestore rules.');
  } finally {
    btnAdminRebuildEvents.disabled = false;
  }
}

function eventOutcomeStatsForUid(events, uid) {
  const stats = { totalEvents: 0, wins: 0, draws: 0, losses: 0 };
  events.forEach(ev => {
    let outcome = '';
    if (ev.p1 === uid) outcome = String(ev.p1Outcome || ev.p1Breakdown?.outcome || '');
    else if (ev.p2 === uid) outcome = String(ev.p2Outcome || ev.p2Breakdown?.outcome || '');
    else return;

    stats.totalEvents += 1;
    if (outcome === 'win') stats.wins += 1;
    else if (outcome === 'draw') stats.draws += 1;
    else if (outcome === 'loss') stats.losses += 1;
  });
  return stats;
}

async function adminArchiveSeason() {
  if (!IS_ADMIN) return alert('Admin only.');

  const seasonKey = validSeasonKey(adminSeasonInput?.value || seasonSelect?.value);
  const existingMetaSnap = await getDoc(doc(db, 'rankingArchives', seasonKey));
  const existingMeta = existingMetaSnap.exists() ? existingMetaSnap.data() : null;

  if (existingMeta?.locked === true || existingMeta?.careerApplied === true) {
    alert(`Archive ${seasonKey} is already locked/applied. Refusing to apply career points twice.`);
    return;
  }

  const savedEvents = ACTIVE_EVENTS.filter(ev => ev.seasonKey === seasonKey);
  if (!savedEvents.length) {
    const run = confirm(`No saved rankingEvents found for ${seasonKey}.\n\nRun Save/Rebuild Events now, then archive?`);
    if (!run) return;
    await adminRebuildEvents();
    await loadRankingEvents();
  }

  const events = ACTIVE_EVENTS.filter(ev => ev.seasonKey === seasonKey);
  if (!events.length) {
    alert(`Still no rankingEvents for ${seasonKey}. Archive cancelled.`);
    return;
  }

  const { rows } = aggregateMonthlyRows(events, seasonKey);
  if (!rows.length) {
    alert(`No player rows for ${seasonKey}. Archive cancelled.`);
    return;
  }

  const ok = confirm(
    `Archive ${seasonKey} and add this month's gains to Career Power?\n\n` +
    `Players: ${rows.length}\nEvents: ${events.length}\n\n` +
    `This should be done before clearing live match data.`
  );
  if (!ok) return;

  btnAdminArchive.disabled = true;
  setAdminNote('Writing archive and career totals…');

  try {
    const ops = [];
    const archiveRef = doc(db, 'rankingArchives', seasonKey);

    ops.push({
      type: 'set',
      ref: archiveRef,
      data: {
        seasonKey,
        label: `TC Power Rankings ${seasonKey}`,
        locked: true,
        careerApplied: true,
        playerCount: rows.length,
        eventCount: events.length,
        topPlayerUid: rows[0]?.uid || '',
        topPlayerName: rows[0]?.name || '',
        topMonthlyPower: rows[0]?.monthlyPower || 0,
        archivedAt: serverTimestamp(),
        archivedBy: CURRENT_USER.uid,
      },
      options: { merge: true },
    });

    rows.forEach((r, index) => {
      const currentCareer = num(CAREER_BY_UID[r.uid]?.careerPower, 0);
      const after = round1(currentCareer + r.monthlyPower);
      const outcomeStats = eventOutcomeStatsForUid(events, r.uid);

      ops.push({
        type: 'set',
        ref: doc(db, 'rankingArchives', seasonKey, 'players', r.uid),
        data: {
          uid: r.uid,
          name: r.name,
          email: r.email || '',
          position: index + 1,
          monthlyPower: round1(r.monthlyPower),
          careerGain: round1(r.monthlyPower),
          careerPowerBefore: round1(currentCareer),
          careerPowerAfter: after,
          played: r.played,
          wins: r.wins,
          draws: r.draws,
          losses: r.losses,
          league: round1(r.league),
          cup: round1(r.cup),
          tournament: round1(r.tournament),
          freeplay: round1(r.freeplay),
          strength: round1(r.strength),
          performance: round1(r.performance),
          legsFor: r.legsFor,
          legsAgainst: r.legsAgainst,
          lastRankingMatchAt: r.lastRankingMatchAt || null,
          archivedAt: serverTimestamp(),
        },
        options: { merge: true },
      });

      ops.push({
        type: 'set',
        ref: doc(db, 'careerPower', r.uid),
        data: {
          uid: r.uid,
          name: r.name,
          email: r.email || '',
          careerPower: increment(round1(r.monthlyPower)),
          totalEvents: increment(outcomeStats.totalEvents),
          wins: increment(outcomeStats.wins),
          draws: increment(outcomeStats.draws),
          losses: increment(outcomeStats.losses),
          lastSeasonArchived: seasonKey,
          lastRankingMatchAt: r.lastRankingMatchAt || null,
          updatedAt: serverTimestamp(),
        },
        options: { merge: true },
      });
    });

    await writeBatches(ops);
    setAdminNote(`Archived ${seasonKey} and updated career totals for ${rows.length} players.`);
    await reloadAll();
  } catch (e) {
    console.error('[power-ranking] archive failed', e);
    setAdminNote('Archive failed. Check console and Firestore rules.');
    alert('Archive failed. Check console and Firestore rules.');
  } finally {
    btnAdminArchive.disabled = false;
  }
}

// -------------------- Auth + events --------------------
function wireUi() {
  btnReload?.addEventListener('click', reloadAll);
  btnSignOut?.addEventListener('click', () => signOut(auth));
  btnAdminRebuildEvents?.addEventListener('click', adminRebuildEvents);
  btnAdminArchive?.addEventListener('click', adminArchiveSeason);

  seasonSelect?.addEventListener('change', renderCurrentView);
  seasonSelect?.addEventListener('blur', renderCurrentView);
  archiveSeasonSelect?.addEventListener('change', renderCurrentView);
  searchInput?.addEventListener('input', renderCurrentView);
  activeOnly?.addEventListener('change', renderCurrentView);

  tabs.forEach(tab => {
    tab.addEventListener('click', async () => {
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      CURRENT_VIEW = tab.dataset.view || 'monthly';
      OPEN_ROWS.clear();
      await renderCurrentView();
    });
  });

  document.addEventListener('click', async (e) => {
    const btn = e.target?.closest?.('[data-exp]');
    if (!btn) return;
    const uid = btn.getAttribute('data-exp');
    if (!uid) return;
    if (OPEN_ROWS.has(uid)) OPEN_ROWS.delete(uid);
    else OPEN_ROWS.add(uid);
    await renderCurrentView();
  });
}

wireUi();

const initialSeason = new URLSearchParams(location.search).get('season') || seasonKeyForDate();
if (seasonSelect) seasonSelect.value = initialSeason;
if (adminSeasonInput) adminSeasonInput.value = initialSeason;
if (currentSeasonChip) currentSeasonChip.textContent = `Season ${initialSeason}`;

onAuthStateChanged(auth, async (user) => {
  CURRENT_USER = user;

  if (!user) {
    if (needLoginBox) needLoginBox.style.display = 'block';
    authButtons?.classList.remove('hidden');
    userArea?.classList.add('hidden');
    adminPanel.style.display = 'none';
    setStatus('warn', 'Sign in to view Power Rankings.');
    if (rankingBody) rankingBody.innerHTML = `<tr><td colspan="16" class="muted">Sign in required.</td></tr>`;
    return;
  }

  if (needLoginBox) needLoginBox.style.display = 'none';
  authButtons?.classList.add('hidden');
  userArea?.classList.remove('hidden');
  if (userInitial) userInitial.textContent = initials(user.displayName || user.email || 'U');
  if (userName) userName.textContent = user.displayName || user.email || 'User';

  try {
    const meSnap = await getDoc(doc(db, 'users', user.uid));
    CURRENT_USER_DOC = meSnap.exists() ? { uid: user.uid, ...(meSnap.data() || {}) } : { uid: user.uid };
    IS_ADMIN = isAdminUser(CURRENT_USER_DOC);
  } catch (e) {
    console.warn('[power-ranking] could not read current user doc', e);
    CURRENT_USER_DOC = { uid: user.uid };
    IS_ADMIN = false;
  }

  if (adminBtn) adminBtn.classList.toggle('hidden', !IS_ADMIN);
  if (adminPanel) adminPanel.style.display = IS_ADMIN ? 'block' : 'none';
  setAdminNote(IS_ADMIN ? 'Admin tools ready.' : 'Admin tools hidden from non-admin users.');

  await reloadAll();
});
