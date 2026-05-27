// public/app.js
// App shell: auth + header + simple tile routing + admin link visibility
// + LIVE Overall Ranking tile
// + Membership countdown pill
// + Stacked Barrels partner tile
// + Paid Divisions tile direct handler

import { auth, db } from './firebase-init.js';

import {
  onAuthStateChanged,
  signOut,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
} from 'https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js';

import {
  doc,
  getDoc,
  setDoc,
  collection,
  getDocs,
} from 'https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js';
// ---------- partner website ----------
const PARTNER_SITE_URL = 'https://stackedbarrels.co.uk/';
const PAID_DIVISIONS_URL = '/paid-divisions.html';

// ---------- DOM ----------
const yearEl = document.getElementById('year');
if (yearEl) yearEl.textContent = new Date().getFullYear();

const authButtons  = document.getElementById('authButtons');
const userArea     = document.getElementById('userArea');
const userInitial  = document.getElementById('userInitial');
const userNameEl   = document.getElementById('userName');
const adminBtn     = document.getElementById('adminBtn');
const btnSignOut   = document.getElementById('btnSignOut');

const modal         = document.getElementById('authModal');
const openLogin     = document.getElementById('openLogin');
const openSignup    = document.getElementById('openSignup');
const tabLogin      = document.getElementById('tabLogin');
const tabSignup     = document.getElementById('tabSignup');
const formLogin     = document.getElementById('formLogin');
const formSignup    = document.getElementById('formSignup');
const loginError    = document.getElementById('loginError');
const signupError   = document.getElementById('signupError');
const closeA        = document.getElementById('closeModalA');
const closeB        = document.getElementById('closeModalB');
const loginEmail    = document.getElementById('loginEmail');
const loginPassword = document.getElementById('loginPassword');
const signupName    = document.getElementById('signupName');
const signupEmail   = document.getElementById('signupEmail');
const signupPassword= document.getElementById('signupPassword');
const linkForgot    = document.getElementById('linkForgot');

const ctaGetStarted = document.getElementById('ctaGetStarted');

const seasonAvgEl          = document.getElementById('seasonAvg');
const seasonMatchesEl      = document.getElementById('seasonMatches');
const seasonRemainingEl    = document.getElementById('seasonRemaining');
const seasonRankEl         = document.getElementById('seasonPosition');

const freeplayAvgEl        = document.getElementById('freeplayAvg');
const freeplayGamesEl      = document.getElementById('freeplayGames');
const freeplayRankEl       = document.getElementById('freeplayRank');

const totalPointsValEl     = document.getElementById('totalPointsVal');
const rankingPosValEl      = document.getElementById('rankingPosVal');

const memberCountdownEl    = document.getElementById('memberCountdown');
const partnerTile          = document.getElementById('partnerTile');
const paidDivisionsTile    = document.getElementById('paidDivisionsTile');

// ---------- generic tile navigation ----------
document.querySelectorAll('[data-link]').forEach(tile => {
  tile.addEventListener('click', () => {
    const href = tile.getAttribute('data-link');
    if (href) window.location.href = href;
  });

  tile.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      const href = tile.getAttribute('data-link');
      if (href) window.location.href = href;
    }
  });
});

// ---------- partner tile ----------
if (partnerTile) {
  const openPartnerSite = () => {
    window.open(PARTNER_SITE_URL, '_blank', 'noopener');
  };

  partnerTile.addEventListener('click', openPartnerSite);

  partnerTile.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      openPartnerSite();
    }
  });
}

// ---------- paid divisions tile ----------
if (paidDivisionsTile) {
  const openPaidDivisions = () => {
    window.location.href = PAID_DIVISIONS_URL;
  };

  paidDivisionsTile.addEventListener('click', openPaidDivisions);

  paidDivisionsTile.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      openPaidDivisions();
    }
  });
}

// ---------- helpers ----------
function openModal()  { modal?.classList.add('is-open'); }
function closeModal() { modal?.classList.remove('is-open'); }

function showLogin()  {
  tabLogin?.classList.add('active');
  tabSignup?.classList.remove('active');
  formLogin?.classList.remove('hidden');
  formSignup?.classList.add('hidden');
}

function showSignup() {
  tabSignup?.classList.add('active');
  tabLogin?.classList.remove('active');
  formSignup?.classList.remove('hidden');
  formLogin?.classList.add('hidden');
}

async function ensureUserDoc(user) {
  const ref = doc(db, 'users', user.uid);
  const snap = await getDoc(ref);

  if (!snap.exists()) {
    await setDoc(ref, {
      displayName: user.displayName || user.email?.split('@')[0] || 'Player',
      email: user.email || '',
      role: 'player',
      createdAt: new Date(),
    });
  }

  const fresh = await getDoc(ref);
  return { uid: user.uid, ...fresh.data() };
}

function setText(el, value, fallback = '—') {
  if (!el) return;
  if (value === null || value === undefined || value === '') {
    el.textContent = fallback;
  } else {
    el.textContent = String(value);
  }
}

function parseAnyDate(v){
  if (!v) return null;
  if (typeof v.toDate === 'function') return v.toDate();
  if (typeof v.seconds === 'number') return new Date(v.seconds * 1000);
  if (v instanceof Date) return v;
  if (typeof v === 'number') {
    const d = new Date(v);
    return Number.isFinite(d.getTime()) ? d : null;
  }
  if (typeof v === 'string') {
    const d = new Date(v);
    return Number.isFinite(d.getTime()) ? d : null;
  }
  return null;
}

function formatUK(d){
  return d.toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' });
}

function updateMembershipCountdown(userDoc){
  if (!memberCountdownEl) return;

  const end =
    parseAnyDate(userDoc.membershipEnd) ||
    parseAnyDate(userDoc.membershipEndDate) ||
    parseAnyDate(userDoc.membershipExpiresAt) ||
    parseAnyDate(userDoc.memberUntil);

  if (!end){
    memberCountdownEl.classList.add('hidden');
    memberCountdownEl.textContent = '';
    return;
  }

  const now = new Date();
  const ms = end.getTime() - now.getTime();
  const daysLeft = Math.ceil(ms / 86400000);

  if (daysLeft > 0){
    memberCountdownEl.innerHTML =
      `Membership: <strong>${daysLeft}</strong> day${daysLeft === 1 ? '' : 's'} left ` +
      `<span class="muted-inline">(ends ${formatUK(end)})</span>`;
  } else {
    memberCountdownEl.innerHTML =
      `<span class="danger-inline">Membership expired</span> ` +
      `<span class="muted-inline">(ended ${formatUK(end)})</span>`;
  }

  memberCountdownEl.classList.remove('hidden');
}

function setSignedOutUI() {
  authButtons?.classList.remove('hidden');
  userArea?.classList.add('hidden');
  if (adminBtn) adminBtn.style.display = 'none';

  const statEls = [
    seasonAvgEl, seasonMatchesEl, seasonRemainingEl, seasonRankEl,
    freeplayAvgEl, freeplayGamesEl, freeplayRankEl,
    totalPointsValEl, rankingPosValEl
  ];

  statEls.forEach(el => {
    if (el) el.textContent = '—';
  });

  if (memberCountdownEl) {
    memberCountdownEl.classList.add('hidden');
    memberCountdownEl.textContent = '';
  }
}

function setSignedInUI(userDoc) {
  authButtons?.classList.add('hidden');
  userArea?.classList.remove('hidden');

  if (userInitial) userInitial.textContent = (userDoc.displayName || userDoc.email || 'U').slice(0,1).toUpperCase();
  if (userNameEl)  userNameEl.textContent  = userDoc.displayName || userDoc.email || 'User';
  if (adminBtn)    adminBtn.style.display  = (userDoc.role === 'admin') ? '' : 'none';

  updateMembershipCountdown(userDoc);
}

const int = (v) => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : 0;
};

function normalizeDivisionString(raw) {
  if (!raw) return '';
  return String(raw).replace(/"/g, '').replace(/division/i, '').trim();
}

function divisionPointsForSide(myLegs, oppLegs, bull = 0, dd = 0, hi100 = 0, v171 = 0) {
  const ml = int(myLegs);
  const ol = int(oppLegs);
  const won       = (ml === 4 && ml > ol);
  const closeLoss = (!won && ml === 3);
  const base      = won ? 30 : (closeLoss ? 10 : 0);
  const perLeg    = 5 * ml;
  const bonus     = 10 * (int(bull) + int(dd) + int(hi100) + int(v171));
  return { won, closeLoss, total: base + perLeg + bonus };
}

function makeEmptyDivStats(uid, name, profileAvg) {
  return {
    uid,
    displayName: name || '',
    avg: (typeof profileAvg === 'number' ? profileAvg : null),
    avgSum: 0,
    avgCount: 0,
    played: 0,
    won: 0,
    lost: 0,
    closeLoss: 0,
    legsFor: 0,
    legsAgainst: 0,
    c171: 0,
    c100: 0,
    cBull: 0,
    cDD: 0,
    points: 0,
  };
}

function buildDivisionStandings(players, matches) {
  const map = {};
  players.forEach(p => {
    map[p.uid] = makeEmptyDivStats(p.uid, p.name, p.avg);
  });

  matches.forEach(m => {
    const confirmed = (m.locked === true) || (m.status === 'confirmed');
    if (!confirmed) return;

    if (m.p1 && map[m.p1]) {
      const myLegs  = m.p1Legs || 0;
      const oppLegs = m.p2Legs || 0;
      const pts = divisionPointsForSide(
        myLegs,
        oppLegs,
        m.p1BullFinishes,
        m.p1DoubleDoubleFinishes,
        m.p1HighCheckouts100Plus,
        m.p1BigVisits171Plus
      );
      const st = map[m.p1];
      st.played++;
      st.legsFor     += myLegs;
      st.legsAgainst += oppLegs;
      if (pts.won) st.won++; else st.lost++;
      if (pts.closeLoss) st.closeLoss++;
      st.c171 += (m.p1BigVisits171Plus || 0);
      st.c100 += (m.p1HighCheckouts100Plus || 0);
      st.cBull+= (m.p1BullFinishes || 0);
      st.cDD  += (m.p1DoubleDoubleFinishes || 0);
      st.points += pts.total;
      if (typeof m.p1Avg === 'number') {
        st.avgSum += m.p1Avg;
        st.avgCount += 1;
      }
    }

    if (m.p2 && map[m.p2]) {
      const myLegs  = m.p2Legs || 0;
      const oppLegs = m.p1Legs || 0;
      const pts = divisionPointsForSide(
        myLegs,
        oppLegs,
        m.p2BullFinishes,
        m.p2DoubleDoubleFinishes,
        m.p2HighCheckouts100Plus,
        m.p2BigVisits171Plus
      );
      const st = map[m.p2];
      st.played++;
      st.legsFor     += myLegs;
      st.legsAgainst += oppLegs;
      if (pts.won) st.won++; else st.lost++;
      if (pts.closeLoss) st.closeLoss++;
      st.c171 += (m.p2BigVisits171Plus || 0);
      st.c100 += (m.p2HighCheckouts100Plus || 0);
      st.cBull+= (m.p2BullFinishes || 0);
      st.cDD  += (m.p2DoubleDoubleFinishes || 0);
      st.points += pts.total;
      if (typeof m.p2Avg === 'number') {
        st.avgSum += m.p2Avg;
        st.avgCount += 1;
      }
    }
  });

  const arr = Object.values(map);
  arr.forEach(st => {
    if (st.avgCount > 0) st.avg = st.avgSum / st.avgCount;
    delete st.avgSum;
    delete st.avgCount;
  });

  arr.sort((a, b) => {
    const pts = (b.points || 0) - (a.points || 0);
    if (pts) return pts;
    const won = (b.won || 0) - (a.won || 0);
    if (won) return won;
    const ld = ((b.legsFor - b.legsAgainst) - (a.legsFor - a.legsAgainst));
    if (ld) return ld;
    const av = ((typeof b.avg === 'number' ? b.avg : -9999) - (typeof a.avg === 'number' ? a.avg : -9999));
    if (av) return av;
    return a.displayName.localeCompare(b.displayName);
  });

  return arr;
}

function isConfirmedOverall(md) {
  const status = String(md.status || '').toLowerCase();
  return (
    md.locked === true ||
    md.status === 'confirmed' ||
    md.status === 'done' ||
    status === 'confirmed' ||
    status === 'done'
  );
}

function numOverall(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function extractPointsFromMatchOverall(md) {
  const p1Stored = md.p1PointsEarned ?? md.p1Pts ?? md.p1_points ?? md.p1points ?? md.p1Points;
  const p2Stored = md.p2PointsEarned ?? md.p2Pts ?? md.p2_points ?? md.p2points ?? md.p2Points;

  if (p1Stored != null || p2Stored != null) {
    return { p1Pts: numOverall(p1Stored), p2Pts: numOverall(p2Stored) };
  }

  const p1legs = numOverall(md.p1Legs ?? md.p1_legs ?? md.p1legs ?? md.p1score);
  const p2legs = numOverall(md.p2Legs ?? md.p2_legs ?? md.p2legs ?? md.p2score);

  let p1 = p1legs * 5;
  let p2 = p2legs * 5;

  if (p1legs > p2legs) p1 += 50;
  else if (p2legs > p1legs) p2 += 50;

  const p1b = numOverall(md.p1_171) + numOverall(md.p1_100co) + numOverall(md.p1_bull) + numOverall(md.p1_dd);
  const p2b = numOverall(md.p2_171) + numOverall(md.p2_100co) + numOverall(md.p2_bull) + numOverall(md.p2_dd);

  p1 += p1b * 10;
  p2 += p2b * 10;

  return { p1Pts: p1, p2Pts: p2 };
}

async function loadOverallRankingForUser(userDoc) {
  try {
    const uidMe = userDoc?.uid;
    if (!uidMe) {
      setText(totalPointsValEl, null);
      setText(rankingPosValEl, null);
      return;
    }

    const usersSnap = await getDocs(collection(db, 'users'));
    const allUsers = [];
    usersSnap.forEach(d => allUsers.push({ id: d.id, ...d.data() }));
    const userIndex = Object.fromEntries(allUsers.map(u => [u.id, u]));

    const scores = {};
    const ensure = (uid) => (scores[uid] ??= { division:0, freeplay:0, cups:0, members:0 });

    for (let i = 1; i <= 8; i++) {
      const divId = `division-${i}`;
      const mSnap = await getDocs(collection(db, 'divisions', divId, 'matches'));

      mSnap.forEach(mdoc => {
        const md = mdoc.data();
        if (!isConfirmedOverall(md)) return;
        const { p1Pts, p2Pts } = extractPointsFromMatchOverall(md);
        if (md.p1) { ensure(md.p1); scores[md.p1].division += p1Pts; }
        if (md.p2) { ensure(md.p2); scores[md.p2].division += p2Pts; }
      });
    }

    try {
      const fpRoots = await getDocs(collection(db, 'freeplay'));
      for (const root of fpRoots.docs) {
        const mSnap = await getDocs(collection(db, 'freeplay', root.id, 'matches'));
        mSnap.forEach(mdoc => {
          const md = mdoc.data();
          if (!isConfirmedOverall(md)) return;
          const { p1Pts, p2Pts } = extractPointsFromMatchOverall(md);
          if (md.p1) { ensure(md.p1); scores[md.p1].freeplay += p1Pts; }
          if (md.p2) { ensure(md.p2); scores[md.p2].freeplay += p2Pts; }
        });
      }
    } catch (e) {
      console.warn('[overall] freeplay read issue:', e);
    }

    try {
      const cupsSnap = await getDocs(collection(db, 'cups'));
      for (const c of cupsSnap.docs) {
        const mSnap = await getDocs(collection(db, 'cups', c.id, 'matches'));
        mSnap.forEach(mdoc => {
          const md = mdoc.data();
          if (!isConfirmedOverall(md)) return;
          const { p1Pts, p2Pts } = extractPointsFromMatchOverall(md);
          if (md.p1) { ensure(md.p1); scores[md.p1].cups += p1Pts; }
          if (md.p2) { ensure(md.p2); scores[md.p2].cups += p2Pts; }
        });
      }
    } catch (e) {
      console.warn('[overall] cups read issue:', e);
    }

    try {
      const memSnap = await getDocs(collection(db, 'memcups'));
      for (const c of memSnap.docs) {
        const mSnap = await getDocs(collection(db, 'memcups', c.id, 'matches'));
        mSnap.forEach(mdoc => {
          const md = mdoc.data();
          if (!isConfirmedOverall(md)) return;
          const { p1Pts, p2Pts } = extractPointsFromMatchOverall(md);
          if (md.p1) { ensure(md.p1); scores[md.p1].members += p1Pts; }
          if (md.p2) { ensure(md.p2); scores[md.p2].members += p2Pts; }
        });
      }
    } catch (e) {
      console.warn('[overall] memcups read issue:', e);
    }

    const rows = Object.keys(scores).map(uid => {
      const u = userIndex[uid] || {};
      const divisionPts = scores[uid].division || 0;
      const freeplayPts = scores[uid].freeplay || 0;
      const cupsPts     = scores[uid].cups || 0;
      const membersRaw  = scores[uid].members || 0;

      const membershipBonus = u.isMember ? 100 : 0;
      const membersPts = Math.floor(membersRaw / 2);
      const manualAdj  = numOverall(u.rankingAdjust || 0);

      const total = divisionPts + freeplayPts + cupsPts + membersPts + membershipBonus + manualAdj;
      return { uid, total };
    });

    rows.sort((a,b) => b.total - a.total);

    const idx = rows.findIndex(r => r.uid === uidMe);
    const me  = rows[idx];

    setText(totalPointsValEl, me ? me.total : 0);
    setText(rankingPosValEl, idx >= 0 ? (idx + 1) : '—');
  } catch (err) {
    console.error('loadOverallRankingForUser error', err);
    setText(totalPointsValEl, null);
    setText(rankingPosValEl, null);
  }
}

async function loadDivisionTileForUser(userDoc) {
  try {
    const rawDiv = userDoc?.division;
    const num = normalizeDivisionString(rawDiv);

    if (!num) {
      setText(seasonAvgEl, null);
      setText(seasonMatchesEl, null);
      setText(seasonRemainingEl, null);
      setText(seasonRankEl, null);
      return;
    }

    const divId = `division-${num}`;

    const usersSnap = await getDocs(collection(db, 'users'));
    const players = [];

    usersSnap.forEach(d => {
      const data = d.data();
      const theirNum = normalizeDivisionString(data.division);
      if (theirNum === num) {
        players.push({
          uid: d.id,
          name: data.displayName || data.email || '',
          avg: (typeof data.avg === 'number' ? data.avg : null),
        });
      }
    });

    if (!players.length) {
      setText(seasonAvgEl, null);
      setText(seasonMatchesEl, null);
      setText(seasonRemainingEl, null);
      setText(seasonRankEl, null);
      return;
    }

    const matsSnap = await getDocs(collection(db, 'divisions', divId, 'matches'));
    const matches = [];
    matsSnap.forEach(d => matches.push({ id: d.id, ...d.data() }));

    const standings = buildDivisionStandings(players, matches);
    const meIndex = standings.findIndex(r => r.uid === userDoc.uid);
    const meRow = meIndex >= 0 ? standings[meIndex] : null;

    const totalMatches = Math.max(players.length - 1, 0);

    if (!meRow) {
      setText(seasonAvgEl, null);
      setText(seasonMatchesEl, `0 / ${totalMatches}`);
      setText(seasonRemainingEl, totalMatches);
      setText(seasonRankEl, null);
      return;
    }

    const avgVal = typeof meRow.avg === 'number' ? meRow.avg.toFixed(1) : (meRow.avg ?? '—');
    const played = meRow.played || 0;
    const remaining = Math.max(totalMatches - played, 0);
    const pos = meIndex + 1;

    setText(seasonAvgEl, avgVal);
    setText(seasonMatchesEl, `${played} / ${totalMatches}`);
    setText(seasonRemainingEl, remaining);
    setText(seasonRankEl, pos);
  } catch (err) {
    console.error('loadDivisionTileForUser error', err);
    setText(seasonAvgEl, null);
    setText(seasonMatchesEl, null);
    setText(seasonRemainingEl, null);
    setText(seasonRankEl, null);
  }
}

async function loadFreeplayTileForUser(userDoc) {
  try {
    const uid = userDoc?.uid;

    if (!uid) {
      setText(freeplayAvgEl, null);
      setText(freeplayGamesEl, null);
      setText(freeplayRankEl, null);
      return;
    }

    const snap = await getDocs(collection(db, 'freeplay', 'global', 'matches'));
    const allMatches = [];
    snap.forEach(d => allMatches.push({ id: d.id, ...d.data() }));

    if (!allMatches.length) {
      setText(freeplayAvgEl, null);
      setText(freeplayGamesEl, null);
      setText(freeplayRankEl, null);
      return;
    }

    let games = 0;
    let avgSum = 0;
    let avgCount = 0;

    const ladder = new Map();
    const addPts = (who, pts) => {
      if (!who) return;
      const prev = ladder.get(who) || 0;
      ladder.set(who, prev + pts);
    };

    allMatches.forEach(m => {
      const confirmed = (m.locked === true) || (m.status === 'confirmed');
      if (!confirmed) return;

      const p1Pts = divisionPointsForSide(
        m.p1Legs || 0,
        m.p2Legs || 0,
        m.p1BullFinishes || 0,
        m.p1DoubleDoubleFinishes || 0,
        m.p1HighCheckouts100Plus || 0,
        m.p1BigVisits171Plus || 0
      ).total;

      const p2Pts = divisionPointsForSide(
        m.p2Legs || 0,
        m.p1Legs || 0,
        m.p2BullFinishes || 0,
        m.p2DoubleDoubleFinishes || 0,
        m.p2HighCheckouts100Plus || 0,
        m.p2BigVisits171Plus || 0
      ).total;

      addPts(m.p1, p1Pts);
      addPts(m.p2, p2Pts);

      if (m.p1 === uid || m.p2 === uid) {
        games += 1;
        const myAvg = (m.p1 === uid) ? m.p1Avg : m.p2Avg;
        if (typeof myAvg === 'number' && Number.isFinite(myAvg)) {
          avgSum += myAvg;
          avgCount += 1;
        }
      }
    });

    const fpAvg = avgCount > 0 ? (avgSum / avgCount) : null;
    setText(freeplayAvgEl, fpAvg ? fpAvg.toFixed(2) : null);
    setText(freeplayGamesEl, games || null);

    if (ladder.size === 0) {
      setText(freeplayRankEl, null);
    } else {
      const sorted = Array.from(ladder.entries()).sort((a,b) => (b[1] || 0) - (a[1] || 0));
      const idx = sorted.findIndex(entry => entry[0] === uid);
      setText(freeplayRankEl, idx >= 0 ? (idx + 1) : null);
    }
  } catch (err) {
    console.error('loadFreeplayTileForUser error', err);
    setText(freeplayAvgEl, null);
    setText(freeplayGamesEl, null);
    setText(freeplayRankEl, null);
  }
}

async function loadDashboardStats(uid) {
  try {
    const ref = doc(db, 'dashboardStats', uid);
    const snap = await getDoc(ref);
    if (!snap.exists()) return;
  } catch (err) {
    console.error('Error loading dashboardStats:', err);
  }
}

async function refreshTilesForUser(userDoc) {
  await Promise.all([
    loadDivisionTileForUser(userDoc),
    loadFreeplayTileForUser(userDoc),
    loadDashboardStats(userDoc.uid),
    loadOverallRankingForUser(userDoc),
  ]);
}

// ---------- auth wiring ----------
openLogin?.addEventListener('click', () => {
  showLogin();
  openModal();
});

openSignup?.addEventListener('click', () => {
  showSignup();
  openModal();
});

closeA?.addEventListener('click', closeModal);
closeB?.addEventListener('click', closeModal);

tabLogin?.addEventListener('click', showLogin);
tabSignup?.addEventListener('click', showSignup);

formLogin?.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (loginError) loginError.textContent = '';

  try {
    const cred = await signInWithEmailAndPassword(auth, loginEmail.value, loginPassword.value);
    const udoc = await ensureUserDoc(cred.user);
    setSignedInUI(udoc);
    await refreshTilesForUser(udoc);
    closeModal();
  } catch (err) {
    console.error('login failed', err);
    if (loginError) loginError.textContent = err.message || 'Login failed';
  }
});

linkForgot?.addEventListener('click', async () => {
  if (loginError) loginError.textContent = '';

  try {
    if (!loginEmail.value) {
      if (loginError) loginError.textContent = 'Enter your email above first.';
      return;
    }

    await sendPasswordResetEmail(auth, loginEmail.value);
    if (loginError) loginError.textContent = 'Reset email sent (check inbox).';
  } catch (err) {
    console.error('reset failed', err);
    if (loginError) loginError.textContent = err.message || 'Could not send reset email.';
  }
});

formSignup?.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (signupError) signupError.textContent = '';

  try {
    const cred = await createUserWithEmailAndPassword(auth, signupEmail.value, signupPassword.value);

    await setDoc(doc(db, 'users', cred.user.uid), {
      displayName: signupName.value || signupEmail.value.split('@')[0],
      email: signupEmail.value,
      role: 'player',
      createdAt: new Date(),
    }, { merge: true });

    await setDoc(doc(db, 'dashboardStats', cred.user.uid), {
      isMember: false,
    }, { merge: true });

    const udoc = await ensureUserDoc(cred.user);
    setSignedInUI(udoc);
    await refreshTilesForUser(udoc);

    alert('Account created. Welcome to TrebleChasers ODL!');
    closeModal();
  } catch (err) {
    console.error('signup failed', err);
    if (signupError) signupError.textContent = err.message || 'Signup failed';
  }
});

btnSignOut?.addEventListener('click', async () => {
  await signOut(auth);
  setSignedOutUI();
});

ctaGetStarted?.addEventListener('click', () => {
  if (!auth.currentUser) {
    showSignup();
    openModal();
  } else {
    window.location.href = '/division.html';
  }
});

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    setSignedOutUI();
    return;
  }

  try {
    const udoc = await ensureUserDoc(user);
    setSignedInUI(udoc);
    await refreshTilesForUser(udoc);
  } catch (e) {
    console.error('auth state error', e);
    setSignedInUI({
      displayName: user.email || 'User',
      email: user.email || '',
      role: 'player'
    });
  }
});