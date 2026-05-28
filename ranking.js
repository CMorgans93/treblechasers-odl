// public/ranking.js
import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.0.1/firebase-app.js';
import {
  getFirestore,
  collection,
  getDocs,
  updateDoc,
  doc,
} from 'https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js';
import {
  getAuth,
  onAuthStateChanged,
} from 'https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js';

// --- firebase init ---
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

// --- DOM ---
const bodyEl        = document.getElementById('rankingBody');
const youCard       = document.getElementById('youCard');
const youAvatar     = document.getElementById('youAvatar');
const youName       = document.getElementById('youName');
const youEmail      = document.getElementById('youEmail');
const youTotal      = document.getElementById('youTotal');
const youDivAvg     = document.getElementById('youDivAvg');
const youPosition   = document.getElementById('youPosition');
const btnReload     = document.getElementById('btnReload');
const tabs          = document.querySelectorAll('.tab');

// we’ll inject this if admin:
let adminUIReady = false;
let isAdmin = false;
let allUsersCache = []; // keep full user docs for admin picker

let currentUser = null;
let ranking = []; // rows that drive the table

onAuthStateChanged(auth, async (user) => {
  currentUser = user;
  await loadRanking();
});

btnReload?.addEventListener('click', loadRanking);

tabs.forEach(tab => {
  tab.addEventListener('click', () => {
    tabs.forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    renderRanking(tab.dataset.scope || 'all');
  });
});

// ------------ core ------------
async function loadRanking() {
  bodyEl.innerHTML = `<tr><td colspan="7" class="muted">Loading…</td></tr>`;

  // 1) users
  let allUsers = [];
  try {
    const usersSnap = await getDocs(collection(db, 'users'));
    usersSnap.forEach(d => allUsers.push({ id: d.id, ...d.data() }));
  } catch (e) {
    console.error('[ranking] users read failed', e);
    bodyEl.innerHTML = `<tr><td colspan="7" class="muted">Error: cannot read users (are you signed in?).</td></tr>`;
    return;
  }
  allUsersCache = allUsers;
  const userIndex = Object.fromEntries(allUsers.map(u => [u.id, u]));

  // Is the signed-in user an admin?
  const meDoc = currentUser ? userIndex[currentUser.uid] : null;
  isAdmin = !!(meDoc && meDoc.role === 'admin');
  if (isAdmin && !adminUIReady) {
    installAdminAdjustUI();
    adminUIReady = true;
  }

  // scores bucket
  const scores = {}; // uid -> {division, freeplay, tournaments, cups, members}
  const ensure = (uid) => (scores[uid] ??= { division:0, freeplay:0, tournaments:0, cups:0, members:0 });

  // 2) ✅ DIVISIONS: scan ALL /divisions/* (so division-9+ also counts)
  try {
    const divRoots = await getDocs(collection(db, 'divisions'));
    for (const div of divRoots.docs) {
      const divId = div.id; // e.g. "division-1", "division-9", etc.
      const mSnap = await getDocs(collection(db, 'divisions', divId, 'matches'));
      mSnap.forEach(mdoc => {
        const md = mdoc.data();
        if (!isConfirmed(md)) return;
        const { p1Pts, p2Pts } = extractPointsFromMatch(md);
        if (md.p1) { ensure(md.p1); scores[md.p1].division += p1Pts; }
        if (md.p2) { ensure(md.p2); scores[md.p2].division += p2Pts; }
      });
    }
  } catch (e) {
    console.warn('[ranking] divisions read issue (continuing):', e);
  }

  // 3) FREEPLAY: read ALL /freeplay/*/matches (not just global)
  try {
    const counted = new Set(); // prevent double-counting if needed

    // (a) legacy/expected path
    try {
      const fpGlobalSnap = await getDocs(collection(db, 'freeplay', 'global', 'matches'));
      fpGlobalSnap.forEach(mdoc => {
        const md = mdoc.data();
        if (!isConfirmed(md)) return;
        const { p1Pts, p2Pts } = extractPointsFromMatch(md);
        counted.add(`global:${mdoc.id}`);
        if (md.p1) { ensure(md.p1); scores[md.p1].freeplay += p1Pts; }
        if (md.p2) { ensure(md.p2); scores[md.p2].freeplay += p2Pts; }
      });
    } catch (e) {
      // ignore and continue to generic scan
    }

    // (b) scan all freeplay root docs and read their matches
    const fpRoots = await getDocs(collection(db, 'freeplay'));
    for (const root of fpRoots.docs) {
      const rootId = root.id;
      const mSnap = await getDocs(collection(db, 'freeplay', rootId, 'matches'));
      mSnap.forEach(mdoc => {
        const key = `${rootId}:${mdoc.id}`;
        if (counted.has(key)) return;

        const md = mdoc.data();
        if (!isConfirmed(md)) return;

        const { p1Pts, p2Pts } = extractPointsFromMatch(md);
        if (md.p1) { ensure(md.p1); scores[md.p1].freeplay += p1Pts; }
        if (md.p2) { ensure(md.p2); scores[md.p2].freeplay += p2Pts; }
      });
    }
  } catch (e) {
    console.warn('[ranking] freeplay read issue (continuing):', e);
  }

  // 4) TOURNAMENTS: /tournaments/global/matches
  try {
    const tSnap = await getDocs(collection(db, 'tournaments', 'global', 'matches'));
    tSnap.forEach(mdoc => {
      const md = mdoc.data();
      if (!isConfirmed(md)) return;
      const { p1Pts, p2Pts } = extractPointsFromMatch(md);
      if (md.p1) { ensure(md.p1); scores[md.p1].tournaments += p1Pts; }
      if (md.p2) { ensure(md.p2); scores[md.p2].tournaments += p2Pts; }
    });
  } catch (e) {
    console.warn('[ranking] tournaments read issue (continuing):', e);
  }

  // 5) PUBLIC CUPS: /cups/*/matches
  try {
    const cupsSnap = await getDocs(collection(db, 'cups'));
    for (const c of cupsSnap.docs) {
      const mSnap = await getDocs(collection(db, 'cups', c.id, 'matches'));
      mSnap.forEach(mdoc => {
        const md = mdoc.data();
        if (!isConfirmed(md)) return;
        const { p1Pts, p2Pts } = extractPointsFromMatch(md);
        if (md.p1) { ensure(md.p1); scores[md.p1].cups += p1Pts; }
        if (md.p2) { ensure(md.p2); scores[md.p2].cups += p2Pts; }
      });
    }
  } catch (e) {
    console.warn('[ranking] cups read issue (continuing):', e);
  }

  // 6) MEMBERS CUPS: /memcups/*/matches
  try {
    const memSnap = await getDocs(collection(db, 'memcups'));
    for (const c of memSnap.docs) {
      const mSnap = await getDocs(collection(db, 'memcups', c.id, 'matches'));
      mSnap.forEach(mdoc => {
        const md = mdoc.data();
        if (!isConfirmed(md)) return;
        const { p1Pts, p2Pts } = extractPointsFromMatch(md);
        if (md.p1) { ensure(md.p1); scores[md.p1].members += p1Pts; }
        if (md.p2) { ensure(md.p2); scores[md.p2].members += p2Pts; }
      });
    }
  } catch (e) {
    console.warn('[ranking] memcups read issue (continuing):', e);
  }

  // 7) build rows (+ apply admin adjustment stored on user doc)
  const rows = Object.keys(scores).map(uid => {
    const u = userIndex[uid] || {};
    const divisionPts    = scores[uid].division    || 0;
    const freeplayPts    = scores[uid].freeplay    || 0;
    const tournamentsPts = scores[uid].tournaments || 0;
    const cupsPts        = scores[uid].cups        || 0;
    const membersRaw     = scores[uid].members     || 0;

    const membershipBonus = u.isMember ? 100 : 0;
    const membersPts = Math.floor(membersRaw / 2);
    const manualAdj  = num(u.rankingAdjust || 0);

    const total = divisionPts + freeplayPts + tournamentsPts + cupsPts + membersPts + membershipBonus + manualAdj;

    return {
      uid,
      name: u.displayName || u.email || uid,
      email: u.email || '',
      divisionPts,
      freeplayPts,
      tournamentsPts,
      cupsPts,
      rawMembers: membersRaw,
      membersPts,
      isMember: !!u.isMember,
      total,
      divAvg: u.avg ?? null,
      manualAdj,
    };
  });

  rows.sort((a,b) => b.total - a.total);
  ranking = rows;
  renderRanking('all');

  // "you" header
  if (currentUser) {
    const idx = ranking.findIndex(r => r.uid === currentUser.uid);
    const me  = ranking[idx];
    youCard.style.display = 'flex';
    const nm = me?.name || currentUser.email || 'You';
    youAvatar.textContent = nm.slice(0,1).toUpperCase();
    youName.textContent   = nm;
    youEmail.textContent  = currentUser.email || '';
    youTotal.textContent  = me ? me.total : 0;
    youDivAvg.textContent = me?.divAvg ?? '–';
    youPosition.textContent = idx >= 0 ? (idx + 1) : '–';
  } else {
    youCard.style.display = 'none';
  }
}

function renderRanking(scope = 'all') {
  if (!ranking.length) {
    bodyEl.innerHTML = `<tr><td colspan="7" class="muted">No players / no scores yet.</td></tr>`;
    return;
  }

  const rows = ranking.filter(r => {
    if (scope === 'all') return true;
    if (scope === 'division')    return r.divisionPts > 0;
    if (scope === 'freeplay')    return r.freeplayPts > 0;
    if (scope === 'tournaments') return r.tournamentsPts > 0;
    if (scope === 'cups')        return r.cupsPts > 0;
    if (scope === 'members')     return r.membersPts > 0 || r.rawMembers > 0 || r.isMember;
    return true;
  });

  if (!rows.length) {
    bodyEl.innerHTML = `<tr><td colspan="7" class="muted">No results for this filter.</td></tr>`;
    return;
  }

  bodyEl.innerHTML = rows.map((r, i) => {
    const nameHtml = r.isMember
      ? `<span class="member-name">${escapeHtml(r.name)}</span> <span class="member-badge">M</span>`
      : `${escapeHtml(r.name)}`;

    const adjHtml = r.manualAdj
      ? ` <span class="muted">(${r.manualAdj >= 0 ? '+' : ''}${r.manualAdj})</span>`
      : '';

    return `
      <tr>
        <td class="pos">${i+1}</td>
        <td>${nameHtml}${adjHtml}</td>
        <td>${r.total}</td>
        <td>${r.divisionPts}</td>
        <td>${r.freeplayPts}</td>
        <td>${r.tournamentsPts}</td>
        <td>${r.cupsPts}</td>
      </tr>
    `;
  }).join('');
}

// ---- helpers ----
function isConfirmed(md) {
  const status = String(md.status || '').toLowerCase();
  return (
    md.locked === true ||
    md.confirmed === true ||
    md.approved === true ||
    md.adminConfirmed === true ||
    md.confirmedByAdmin === true ||
    status === 'confirmed' ||
    status === 'done' ||
    status === 'complete' ||
    status === 'completed'
  );
}

function num(v){ const n = Number(v); return Number.isFinite(n) ? n : 0; }

function extractPointsFromMatch(md){
  // Prefer stored points; otherwise derive a simple cup-style score.
  const p1Stored =
    md.p1PointsEarned ?? md.p1Pts ?? md.p1_points ?? md.p1points ?? md.p1Points ?? md.p1_totalPoints;
  const p2Stored =
    md.p2PointsEarned ?? md.p2Pts ?? md.p2_points ?? md.p2points ?? md.p2Points ?? md.p2_totalPoints;

  if (p1Stored != null || p2Stored != null) {
    return { p1Pts: num(p1Stored), p2Pts: num(p2Stored) };
  }

  const p1legs = num(md.p1Legs ?? md.p1_legs ?? md.p1legs ?? md.p1score);
  const p2legs = num(md.p2Legs ?? md.p2_legs ?? md.p2legs ?? md.p2score);

  let p1 = p1legs * 5, p2 = p2legs * 5;
  if (p1legs > p2legs) p1 += 50;
  else if (p2legs > p1legs) p2 += 50;

  const p1b = num(md.p1_171) + num(md.p1_100co) + num(md.p1_bull) + num(md.p1_dd);
  const p2b = num(md.p2_171) + num(md.p2_100co) + num(md.p2_bull) + num(md.p2_dd);
  p1 += p1b * 10; p2 += p2b * 10;

  return { p1Pts: p1, p2Pts: p2 };
}

function escapeHtml(s) {
  return String(s ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

/* ===========================
   ADMIN: Add Points UI
   =========================== */
function installAdminAdjustUI() {
  const headerBtns = document.querySelector('header div[style*="gap"]') || document.querySelector('header');
  const btn = document.createElement('button');
  btn.id = 'btnAdminAdjust';
  btn.className = 'btn primary';
  btn.textContent = 'Add points (Admin)';
  btn.style.marginLeft = '8px';
  btn.onclick = openAdjustModal;
  headerBtns?.appendChild(btn);

  const ov = document.createElement('div');
  ov.id = 'adjOverlay';
  ov.style.position = 'fixed';
  ov.style.inset = '0';
  ov.style.background = 'rgba(0,0,0,.55)';
  ov.style.backdropFilter = 'blur(4px)';
  ov.style.display = 'none';
  ov.style.zIndex = '120';
  ov.innerHTML = `
    <div style="max-width:520px;width:100%;margin:40px auto;background:#0f1317;border:1px solid rgba(215,180,106,.3);border-radius:14px;padding:14px;color:#f1e7d3;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
        <h3 style="margin:0;font-family:'Bebas Neue',system-ui;letter-spacing:.5px;">Admin: Add ranking points</h3>
        <button id="adjClose" class="btn" style="background:transparent;border:1px solid rgba(241,231,211,.25);color:#f1e7d3;">Close</button>
      </div>
      <label style="font-size:.8rem;color:#a7b0ba;">Player</label>
      <select id="adjPlayer" style="width:100%;background:#0d1217;border:1px solid rgba(215,180,106,.25);border-radius:10px;padding:10px;color:#fff;margin:6px 0 10px;"></select>

      <label style="font-size:.8rem;color:#a7b0ba;">Delta points (can be negative)</label>
      <input id="adjDelta" type="number" step="1" value="0" style="width:100%;background:#0d1217;border:1px solid rgba(215,180,106,.25);border-radius:10px;padding:10px;color:#fff;margin:6px 0 10px;" />

      <label style="font-size:.8rem;color:#a7b0ba;">Note (optional)</label>
      <input id="adjNote" type="text" placeholder="Reason / reference" style="width:100%;background:#0d1217;border:1px solid rgba(215,180,106,.25);border-radius:10px;padding:10px;color:#fff;margin:6px 0 12px;" />

      <div id="adjError" style="color:#ff6b6b;font-size:.85rem;display:none;margin-bottom:8px;"></div>

      <button id="adjSave" class="btn primary" style="width:100%;">Apply adjustment</button>
      <div style="margin-top:8px;font-size:.75rem;color:#a7b0ba;">
        Stored on the user doc as <code>rankingAdjust</code>. Totals include this immediately.
      </div>
    </div>
  `;
  document.body.appendChild(ov);

  ov.querySelector('#adjClose').onclick = () => ov.style.display = 'none';
  ov.addEventListener('click', (e) => { if (e.target === ov) ov.style.display = 'none'; });
  ov.querySelector('#adjSave').onclick = saveAdjustment;
}

function openAdjustModal() {
  if (!isAdmin) return;
  const ov  = document.getElementById('adjOverlay');
  const sel = document.getElementById('adjPlayer');
  const err = document.getElementById('adjError');
  err.style.display = 'none'; err.textContent = '';

  const sorted = [...allUsersCache].sort((a,b) =>
    (a.displayName || a.email || a.id || '').localeCompare(b.displayName || b.email || b.id || '')
  );
  sel.innerHTML = sorted.map(u => {
    const name = u.displayName || u.email || u.id;
    const adj  = Number(u.rankingAdjust || 0);
    const extra= adj ? ` (adj: ${adj >= 0 ? '+' : ''}${adj})` : '';
    return `<option value="${u.id}">${name}${extra}</option>`;
  }).join('');

  ov.style.display = 'flex';
}

async function saveAdjustment() {
  const err = document.getElementById('adjError');
  err.style.display = 'none'; err.textContent = '';

  if (!isAdmin) {
    err.textContent = 'Only admins can adjust.';
    err.style.display = 'block';
    return;
  }
  const uid   = String(document.getElementById('adjPlayer').value || '');
  const delta = Number(document.getElementById('adjDelta').value || 0);
  const note  = String(document.getElementById('adjNote').value || '');

  if (!uid) {
    err.textContent = 'Pick a player.';
    err.style.display = 'block';
    return;
  }
  if (!Number.isFinite(delta)) {
    err.textContent = 'Enter a valid number.';
    err.style.display = 'block';
    return;
  }

  const user = allUsersCache.find(u => u.id === uid);
  const currentAdj = Number(user?.rankingAdjust || 0);
  const newAdj = currentAdj + delta;

  try {
    await updateDoc(doc(db, 'users', uid), {
      rankingAdjust: newAdj,
      rankingAdjustNote: note,
      rankingAdjustUpdatedAt: new Date(),
    });
  } catch (e) {
    console.error('[ranking] adjust save failed', e);
    err.textContent = 'Failed to save adjustment (permissions?).';
    err.style.display = 'block';
    return;
  }

  document.getElementById('adjOverlay').style.display = 'none';
  await loadRanking();
}
