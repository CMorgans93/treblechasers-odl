// public/teams.js
// Treble Teams League landing page
// - Signed-in chip + membership pill (user doc)
// - Teams registration countdown pill (teamsleague/current.registrationDeadline)
// - Interest toggle (teamsleague/current/interest/{uid})
// - Team assignment tile (teamsleague/current/roster/{uid} + teams/{teamId})
// - Admin button visible if user is admin
// - Captain tile visible if roster role is 'captain' OR user is admin

import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.0.1/firebase-app.js';
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  deleteDoc,
  serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js';
import {
  getAuth,
  onAuthStateChanged,
  signOut,
} from 'https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js';
import { getAnalytics, isSupported } from 'https://www.gstatic.com/firebasejs/11.0.1/firebase-analytics.js';

// -------------------- Firebase init --------------------
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

// -------------------- DOM --------------------
const yearEl = document.getElementById('year');
if (yearEl) yearEl.textContent = String(new Date().getFullYear());

const memberCountdownEl = document.getElementById('memberCountdown');
const regCountdownEl = document.getElementById('regCountdown');

const authButtons = document.getElementById('authButtons');
const userArea = document.getElementById('userArea');
const userInitial = document.getElementById('userInitial');
const userName = document.getElementById('userName');
const adminBtn = document.getElementById('adminBtn');
const btnSignOut = document.getElementById('btnSignOut');

const openLogin = document.getElementById('openLogin');
const openSignup = document.getElementById('openSignup');

const btnInterest = document.getElementById('btnInterest');
const statusText = document.getElementById('statusText');
const seasonNameChip = document.getElementById('seasonNameChip');

const myTeamChip = document.getElementById('myTeamChip');
const myTeamName = document.getElementById('myTeamName');
const myTeamRole = document.getElementById('myTeamRole');
const myTeamDiv  = document.getElementById('myTeamDiv');
const tileMyTeam = document.getElementById('tileMyTeam');

// FIX: correct id in your current HTML
const tileTeamDivision = document.getElementById('tileTeamDivision');

// Captain tile
const tileCaptain = document.getElementById('tileCaptain');

// -------------------- helpers --------------------
const CURRENT = 'current';

function initials(name) {
  const s = String(name || '').trim();
  if (!s) return 'U';
  const parts = s.split(/\s+/).filter(Boolean);
  const a = parts[0]?.[0] || 'U';
  const b = (parts[1]?.[0]) || '';
  return (a + b).toUpperCase();
}

function msToParts(ms) {
  const sec = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return { d, h, m };
}

function setStatus(msg) {
  if (statusText) statusText.textContent = msg;
}

// ----- Date parsing helpers -----
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

// ----- Membership countdown -----
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

// ---- Teams registration countdown pill ----
function setRegCountdownPill(html) {
  if (!regCountdownEl) return;
  regCountdownEl.classList.remove('hidden');
  regCountdownEl.innerHTML = html;
}
function hideRegCountdownPill() {
  if (!regCountdownEl) return;
  regCountdownEl.classList.add('hidden');
  regCountdownEl.innerHTML = '';
}

// ----- captain tile visibility -----
function setCaptainTileVisible(show){
  if (!tileCaptain) return;
  tileCaptain.classList.toggle('hidden', !show);
}

// ----- signed UI controls -----
function setSignedOutUI() {
  authButtons?.classList.remove('hidden');
  userArea?.classList.add('hidden');

  if (adminBtn) adminBtn.style.display = 'none';

  if (memberCountdownEl) {
    memberCountdownEl.classList.add('hidden');
    memberCountdownEl.textContent = '';
  }
  hideRegCountdownPill();

  // hide captain tile when signed out
  setCaptainTileVisible(false);

  if (openLogin) openLogin.onclick = () => location.href = '/';
  if (openSignup) openSignup.onclick = () => location.href = '/';
}

function setSignedInUI(userDoc) {
  authButtons?.classList.add('hidden');
  userArea?.classList.remove('hidden');

  const display = userDoc.displayName || userDoc.email || 'User';
  if (userName) userName.textContent = display;
  if (userInitial) userInitial.textContent = initials(display);

  if (adminBtn) {
    const isAdmin = (userDoc.role === 'admin' || userDoc.isAdmin === true);
    adminBtn.style.display = isAdmin ? '' : 'none';
  }

  updateMembershipCountdown(userDoc);
}

// -------------------- Firestore refs --------------------
const leagueDocRef = doc(db, 'teamsleague', CURRENT);
const interestRef = (uid) => doc(db, 'teamsleague', CURRENT, 'interest', uid);
const rosterRef   = (uid) => doc(db, 'teamsleague', CURRENT, 'roster', uid);
const teamRef     = (teamId) => doc(db, 'teamsleague', CURRENT, 'teams', teamId);

async function ensureUserDoc(user) {
  const ref = doc(db, 'users', user.uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    await setDoc(ref, {
      displayName: user.displayName || user.email?.split('@')[0] || 'Player',
      email: user.email || '',
      role: 'player',
      createdAt: serverTimestamp(),
    });
  }
  const fresh = await getDoc(ref);
  return { uid: user.uid, ...fresh.data() };
}

let regInterval = null;

async function loadLeagueMeta() {
  const snap = await getDoc(leagueDocRef);
  const d = snap.exists() ? (snap.data() || {}) : {};

  if (seasonNameChip) seasonNameChip.textContent = String(d.seasonName || 'TEAMS').toUpperCase();

  const end = parseAnyDate(d.registrationDeadline);

  if (regInterval) { clearInterval(regInterval); regInterval = null; }

  if (end) {
    const tick = () => {
      const diff = end.getTime() - Date.now();
      const { d, h, m } = msToParts(diff);
      if (diff <= 0) {
        setRegCountdownPill(`<span class="danger-inline">Registration closed</span>`);
        return;
      }
      setRegCountdownPill(
        `<span class="muted-inline">Registration closes in</span> <strong>${d}d ${h}h ${m}m</strong>`
      );
    };
    tick();
    regInterval = setInterval(tick, 30_000);
  } else {
    hideRegCountdownPill();
  }

  return {
    seasonName: d.seasonName || 'TEAMS',
    registrationDeadline: d.registrationDeadline || null,
    registrationOpen: (d.registrationOpen !== false),
  };
}

async function loadInterest(uid) {
  const snap = await getDoc(interestRef(uid));
  return snap.exists();
}

function setInterestBtn(isOn) {
  if (!btnInterest) return;
  if (isOn) {
    btnInterest.textContent = 'Registered ✓';
    btnInterest.classList.remove('btn-primary');
    btnInterest.classList.add('btn-ghost');
  } else {
    btnInterest.textContent = 'Register interest';
    btnInterest.classList.remove('btn-ghost');
    btnInterest.classList.add('btn-primary');
  }
}

async function toggleInterest(uid, nowInterested) {
  if (nowInterested) {
    await setDoc(interestRef(uid), { uid, createdAt: serverTimestamp() }, { merge: true });
  } else {
    await deleteDoc(interestRef(uid));
  }
}

async function loadRoster(uid) {
  const rs = await getDoc(rosterRef(uid));
  if (!rs.exists()) return null;
  return rs.data();
}

async function hydrateTeamUI(roster) {
  if (!roster?.teamId) {
    if (myTeamChip) myTeamChip.textContent = 'Awaiting';
    if (myTeamName) myTeamName.textContent = '—';
    if (myTeamRole) myTeamRole.textContent = '—';
    if (myTeamDiv)  myTeamDiv.textContent  = '—';
    if (tileMyTeam) tileMyTeam.onclick = () => alert('You are not assigned to a team yet.');
    return;
  }

  if (myTeamChip) myTeamChip.textContent = 'Assigned';
  if (myTeamRole) myTeamRole.textContent = roster.role ? String(roster.role) : 'player';
  if (myTeamDiv)  myTeamDiv.textContent  = roster.divisionNumber ? `Div ${roster.divisionNumber}` : '—';

  try {
    const ts = await getDoc(teamRef(roster.teamId));
    const t = ts.exists() ? (ts.data() || {}) : {};
    if (myTeamName) myTeamName.textContent = t.name || roster.teamId;

    if (tileMyTeam) tileMyTeam.onclick = () => {
      location.href = `/teams-div.html?tid=${encodeURIComponent(roster.teamId)}`;
    };
  } catch {
    if (myTeamName) myTeamName.textContent = roster.teamId;
    if (tileMyTeam) tileMyTeam.onclick = () => {
      location.href = `/teams-div.html?tid=${encodeURIComponent(roster.teamId)}`;
    };
  }
}

function wireTiles() {
  // Teams Division tile -> /teams-div.html
  if (tileTeamDivision) tileTeamDivision.onclick = () => location.href = '/teams-div.html';

  // Captain tile -> /teams-captain.html
  if (tileCaptain) tileCaptain.onclick = () => location.href = '/teams-captain.html';
}
wireTiles();

// -------------------- MAIN --------------------
let leagueMeta = null;

onAuthStateChanged(auth, async (user) => {
  // Signed OUT
  if (!user) {
    setSignedOutUI();
    setStatus('Sign in to register interest and view your team.');
    if (btnInterest) {
      btnInterest.disabled = true;
      btnInterest.title = 'Sign in required';
    }
    await hydrateTeamUI(null);
    return;
  }

  // Signed IN
  let udoc = null;
  try {
    udoc = await ensureUserDoc(user);
  } catch (e) {
    console.error('ensureUserDoc failed:', e);
    udoc = { uid: user.uid, displayName: user.displayName || user.email || 'User', email: user.email || '', role: 'player' };
  }
  setSignedInUI(udoc);

  // Sign out
  if (btnSignOut) {
    btnSignOut.onclick = async () => {
      try { await signOut(auth); location.href = '/'; }
      catch (e) { console.error(e); }
    };
  }

  // Teams league meta (registration pill)
  try {
    leagueMeta = await loadLeagueMeta();
  } catch (e) {
    console.error('loadLeagueMeta failed:', e);
    leagueMeta = { registrationOpen: true };
    hideRegCountdownPill();
  }

  // Interest enable/disable
  if (btnInterest) {
    btnInterest.disabled = (leagueMeta?.registrationOpen === false);
    btnInterest.title = (leagueMeta?.registrationOpen === false) ? 'Registration closed' : '';
  }

  // Interest
  let interested = false;
  try {
    interested = await loadInterest(user.uid);
    setInterestBtn(interested);
  } catch (e) {
    console.error('loadInterest failed:', e);
  }

  if (btnInterest) {
    btnInterest.onclick = async () => {
      try {
        const cur = await loadInterest(user.uid);
        const next = !cur;
        await toggleInterest(user.uid, next);
        setInterestBtn(next);
        setStatus(next ? 'Registered interest. You’ll be assigned to a team by admins.' : 'Interest removed.');
      } catch (e) {
        console.error(e);
        setStatus('Could not update interest (permissions/path).');
      }
    };
  }

  // Roster (controls captain tile visibility too)
  const roster = await loadRoster(user.uid);
  await hydrateTeamUI(roster);

  const isCaptain = String(roster?.role || '').toLowerCase() === 'captain';
  const isAdmin = (udoc?.role === 'admin' || udoc?.isAdmin === true);
  setCaptainTileVisible(isAdmin || isCaptain);

  if (roster?.teamId) setStatus('You’re assigned — use “Your Team” to view details.');
  else if (interested) setStatus('Registered — awaiting team assignment.');
  else setStatus('Tap “Register interest” to join the player pool.');
});
