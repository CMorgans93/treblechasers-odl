// public/Js/admin.js
// TrebleChasers ODL Admin Engine

import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.0.1/firebase-app.js';

import {
  getAuth,
  onAuthStateChanged,
} from 'https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js';

import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  collection,
  getDocs,
  serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js';

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
const auth = getAuth(app);
const db = getFirestore(app);

const playersTableBody = document.getElementById('playersTableBody');
const playerSearch = document.getElementById('playerSearch');

const totalPlayers = document.getElementById('totalPlayers');
const totalMembers = document.getElementById('totalMembers');
const inactivePlayers = document.getElementById('inactivePlayers');

let allPlayers = [];

function isAdmin(data) {
  return data?.role === 'admin' || data?.isAdmin === true;
}

function isMember(data) {
  return data?.isMember === true || data?.member === true || data?.membershipActive === true;
}

function parseDate(v) {
  if (!v) return null;
  if (typeof v.toDate === 'function') return v.toDate();
  if (typeof v.seconds === 'number') return new Date(v.seconds * 1000);
  if (v instanceof Date) return v;

  const d = new Date(v);
  return Number.isFinite(d.getTime()) ? d : null;
}

function daysSince(v) {
  const d = parseDate(v);
  if (!d) return 9999;
  return Math.floor((Date.now() - d.getTime()) / 86400000);
}

function formatDate(v) {
  const d = parseDate(v);
  if (!d) return 'Never';

  return d.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function divisionValue(raw) {
  if (!raw) return '';
  return String(raw).replace('division-', '').replace('Division', '').trim();
}

function makeDivisionSelect(player) {
  const select = document.createElement('select');
  select.style.minWidth = '130px';

  const empty = document.createElement('option');
  empty.value = '';
  empty.textContent = 'Unallocated';
  select.appendChild(empty);

  const current = divisionValue(player.division);

  for (let i = 1; i <= 10; i++) {
    const opt = document.createElement('option');
    opt.value = String(i);
    opt.textContent = `Division ${i}`;

    if (current === String(i)) {
      opt.selected = true;
    }

    select.appendChild(opt);
  }

  select.onchange = async () => {
    await setDoc(doc(db, 'users', player.uid), {
      division: select.value,
      updatedAt: serverTimestamp(),
    }, { merge: true });

    await setDoc(doc(db, 'playerProfiles', player.uid), {
      division: select.value,
      updatedAt: serverTimestamp(),
    }, { merge: true });

    await loadPlayers();
  };

  return select;
}

function makeMemberInput(player) {
  const input = document.createElement('input');
  input.type = 'date';
  input.style.minWidth = '145px';

  const end =
    parseDate(player.membershipEnd) ||
    parseDate(player.memberUntil) ||
    parseDate(player.membershipExpiresAt);

  if (end) {
    input.value = end.toISOString().slice(0, 10);
  }

  input.onchange = async () => {
    const dateValue = input.value;
    const active = dateValue && new Date(dateValue).getTime() > Date.now();

    await setDoc(doc(db, 'users', player.uid), {
      membershipEnd: dateValue || '',
      memberUntil: dateValue || '',
      isMember: !!active,
      member: !!active,
      membershipActive: !!active,
      updatedAt: serverTimestamp(),
    }, { merge: true });

    await loadPlayers();
  };

  return input;
}

function renderOverview() {
  totalPlayers.textContent = allPlayers.length;
  totalMembers.textContent = allPlayers.filter(isMember).length;
  inactivePlayers.textContent = allPlayers.filter(p => p.hidden || p.inactive).length;
}

function renderPlayers() {
  if (!playersTableBody) return;

  const search = (playerSearch?.value || '').toLowerCase().trim();

  const filtered = allPlayers.filter(player => {
    const text = [
      player.displayName,
      player.leagueDisplayName,
      player.email,
      player.dartCounterUsername,
    ].join(' ').toLowerCase();

    return !search || text.includes(search);
  });

  playersTableBody.innerHTML = '';

  if (!filtered.length) {
    playersTableBody.innerHTML = `
      <tr>
        <td colspan="7">
          <div style="padding:28px;text-align:center;opacity:.75;">
            No players found.
          </div>
        </td>
      </tr>
    `;
    return;
  }

  filtered.forEach(player => {
    const tr = document.createElement('tr');

    const name = player.leagueDisplayName || player.displayName || player.email || 'Unnamed';
    const dcUser = player.dartCounterUsername || 'No DC username';
    const dcAvg = player.dartCounterAverage ?? '—';

    const statusText = player.approved && player.canPlay
      ? 'Approved'
      : 'Pending';

    const inactive = player.hidden || player.inactive;

    const statusColour = inactive
      ? '#ff9f9f'
      : player.approved
        ? '#7dff9e'
        : '#f5c96a';

    tr.innerHTML = `
      <td>
        <strong>${name}</strong><br>
        <small style="opacity:.7;">${player.email || ''}</small><br>
        <small style="opacity:.85;">DC: ${dcUser} • Avg: ${dcAvg}</small><br>
        <a
          href="https://app.dartcounter.net/login"
          target="_blank"
          rel="noopener"
          style="color:#f5c96a;font-size:.8rem;"
        >
          Open DartCounter
        </a>
      </td>

      <td class="division-cell"></td>

      <td>
        <strong>${player.elo || player.starterElo || 1000}</strong><br>
        <small style="opacity:.7;">Start: ${player.starterElo || '—'}</small>
      </td>

      <td class="member-cell"></td>

      <td>
        <span style="
          color:${statusColour};
          font-weight:800;
        ">
          ${inactive ? 'Hidden' : statusText}
        </span>
      </td>

      <td>
        ${formatDate(player.lastActive || player.updatedAt || player.createdAt)}
      </td>

      <td class="actions-cell"></td>
    `;

    tr.querySelector('.division-cell').appendChild(makeDivisionSelect(player));
    tr.querySelector('.member-cell').appendChild(makeMemberInput(player));

    const actionsCell = tr.querySelector('.actions-cell');

    const approveBtn = document.createElement('button');
    approveBtn.textContent = player.approved && player.canPlay ? 'Approved' : 'Approve';
    approveBtn.style.marginRight = '6px';
    approveBtn.disabled = player.approved && player.canPlay;

    approveBtn.onclick = async () => {
      await setDoc(doc(db, 'users', player.uid), {
        approved: true,
        canPlay: true,
        status: 'approved',
        approvedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }, { merge: true });

      await loadPlayers();
    };

    const hideBtn = document.createElement('button');
    hideBtn.textContent = player.hidden ? 'Restore' : 'Hide';
    hideBtn.style.marginRight = '6px';

    hideBtn.onclick = async () => {
      await setDoc(doc(db, 'users', player.uid), {
        hidden: !player.hidden,
        hiddenReason: !player.hidden ? 'Manually hidden by admin' : '',
        updatedAt: serverTimestamp(),
      }, { merge: true });

      await loadPlayers();
    };

    const adminBtn = document.createElement('button');
    adminBtn.textContent = isAdmin(player) ? 'Remove Admin' : 'Make Admin';
    adminBtn.style.marginRight = '6px';

    adminBtn.onclick = async () => {
      await setDoc(doc(db, 'users', player.uid), {
        role: isAdmin(player) ? 'player' : 'admin',
        isAdmin: !isAdmin(player),
        updatedAt: serverTimestamp(),
      }, { merge: true });

      await loadPlayers();
    };

    const deleteBtn = document.createElement('button');
    deleteBtn.textContent = 'Delete';
    deleteBtn.style.background = '#b91c1c';

    deleteBtn.onclick = async () => {
      const ok = confirm(`Delete ${name}? This removes their user record and profile.`);
      if (!ok) return;

      await deleteDoc(doc(db, 'users', player.uid));
      await deleteDoc(doc(db, 'playerProfiles', player.uid));

      await loadPlayers();
    };

    actionsCell.appendChild(approveBtn);
    actionsCell.appendChild(hideBtn);
    actionsCell.appendChild(adminBtn);
    actionsCell.appendChild(deleteBtn);

    playersTableBody.appendChild(tr);
  });
}

async function loadPlayers() {
  const usersSnap = await getDocs(collection(db, 'users'));
  const players = [];

  for (const userDoc of usersSnap.docs) {
    const data = userDoc.data();

    const profileSnap = await getDoc(doc(db, 'playerProfiles', userDoc.id));
    const profile = profileSnap.exists() ? profileSnap.data() : {};

    const lastActive =
      data.lastActive ||
      data.updatedAt ||
      profile.updatedAt ||
      data.createdAt;

    const inactive = daysSince(lastActive) >= 45;

    if (inactive && data.hidden !== true) {
      await setDoc(doc(db, 'users', userDoc.id), {
        hidden: true,
        hiddenReason: '45 days inactive',
        hiddenAt: serverTimestamp(),
      }, { merge: true });
    }

    players.push({
      uid: userDoc.id,
      ...data,
      ...profile,
      email: data.email,
      division: data.division || profile.division,
      elo: profile.elo || data.elo || data.starterElo || 1000,
      starterElo: data.starterElo || profile.starterElo,
      inactive,
    });
  }

  allPlayers = players.sort((a, b) => {
    const divA = Number(divisionValue(a.division) || 99);
    const divB = Number(divisionValue(b.division) || 99);

    if (divA !== divB) return divA - divB;

    return Number(b.elo || 0) - Number(a.elo || 0);
  });

  renderOverview();
  renderPlayers();
}

playerSearch?.addEventListener('input', renderPlayers);

onAuthStateChanged(auth, async user => {
  if (!user) {
    document.body.innerHTML = `
      <main style="padding:24px;color:white;">
        <h1>Admin Access Required</h1>
        <p>Please log in first.</p>
        <a href="/" style="color:#f5c96a;">Go Home</a>
      </main>
    `;
    return;
  }

  const meSnap = await getDoc(doc(db, 'users', user.uid));
  const me = meSnap.exists() ? meSnap.data() : {};

  if (!isAdmin(me)) {
    document.body.innerHTML = `
      <main style="padding:24px;color:white;">
        <h1>Access Denied</h1>
        <p>Your account is not marked as admin.</p>
        <a href="/" style="color:#f5c96a;">Go Home</a>
      </main>
    `;
    return;
  }

  await loadPlayers();
});