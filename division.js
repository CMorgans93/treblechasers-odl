// division.js
// TrebleChasers ODL | Firebase Division Engine

import {
  auth,
  db,
  onAuthStateChanged,
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  addDoc,
  serverTimestamp
} from "./firebase-init.js";

import {
  STARTING_ELO_BY_DIVISION,
  divisionValue,
  calculateEloChange,
  updateStatsWithMatch,
  emptyStats
} from "./elo-engine.js";

const divisionSelect = document.getElementById("divisionSelectPublic");
const divNameText = document.getElementById("divNameText");
const standingsBody = document.getElementById("standingsBody");
const updatedMeta = document.getElementById("updatedMeta");
const errorMeta = document.getElementById("errorMeta");

const btnFixtures = document.getElementById("btnFixtures");
const btnSubmit = document.getElementById("btnSubmit");
const btnInbox = document.getElementById("btnInbox");
const btnPointsCalc = document.getElementById("btnPointsCalc");

const fixturesModal = document.getElementById("fixturesModal");
const submitModal = document.getElementById("submitModal");

const fixturesList = document.getElementById("fixturesList");
const fixturesCount = document.getElementById("fixturesCount");
const inboxCount = document.getElementById("inboxCount");

const srOpponent = document.getElementById("srOpponent");
const srSubmitBtn = document.getElementById("srSubmitBtn");
const srNote = document.getElementById("srNote");

let currentUser = null;
let currentUserDoc = null;
let allPlayers = [];
let currentDivision = 1;
let pendingInbox = [];

function setError(message = "") {
  if (!errorMeta) return;
  errorMeta.textContent = message;
  errorMeta.style.display = message ? "block" : "none";
}

function playerName(player) {
  return (
    player?.leagueDisplayName ||
    player?.displayName ||
    player?.name ||
    player?.email ||
    "Unnamed Player"
  );
}

function playerDcUsername(player) {
  return (
    player?.dartCounterUsername ||
    player?.dcUsername ||
    player?.discord ||
    "No DC username"
  );
}

function isOnline(player) {
  return player?.online === true || player?.status === "online";
}

function onlineDot(player) {
  return isOnline(player)
    ? `<span title="Online" style="color:#39ff88;font-weight:900;">●</span>`
    : `<span title="Offline" style="color:#777;font-weight:900;">●</span>`;
}

function getModeStats(player, mode = "freeLeague") {
  if (player?.stats?.[mode]) return player.stats[mode];
  if (player?.stats?.overall) return player.stats.overall;

  return {
    ...emptyStats(),
    played: Number(player?.gamesPlayed || player?.played || 0),
    wins: Number(player?.wins || 0),
    draws: Number(player?.draws || 0),
    losses: Number(player?.losses || 0),
    legsFor: Number(player?.legsFor || 0),
    legsAgainst: Number(player?.legsAgainst || 0),
    visits171: Number(player?.visits171 || 0),
    checkouts100: Number(player?.checkouts100 || 0),
    bigFish: Number(player?.bigFish || 0),
    bullFinishes: Number(player?.bullFinishes || 0),
    doubleDouble: Number(player?.doubleDouble || 0),
    average: Number(player?.average || player?.dartCounterAverage || 0)
  };
}

function sortPlayers(a, b) {
  const sa = getModeStats(a);
  const sb = getModeStats(b);

  const ptsA = sa.wins * 2 + sa.draws;
  const ptsB = sb.wins * 2 + sb.draws;

  if (ptsB !== ptsA) return ptsB - ptsA;

  const diffA = sa.legsFor - sa.legsAgainst;
  const diffB = sb.legsFor - sb.legsAgainst;

  if (diffB !== diffA) return diffB - diffA;

  return Number(b.elo || 0) - Number(a.elo || 0);
}

function setupDivisionSelect() {
  if (!divisionSelect) return;

  divisionSelect.innerHTML = "";

  for (let i = 1; i <= 8; i++) {
    const opt = document.createElement("option");
    opt.value = String(i);
    opt.textContent = `Division ${i}`;
    divisionSelect.appendChild(opt);
  }

  divisionSelect.value = String(currentDivision);

  divisionSelect.onchange = () => {
    currentDivision = Number(divisionSelect.value);
    renderDivision();
  };
}

async function loadPlayers() {
  const usersSnap = await getDocs(collection(db, "users"));
  const rows = [];

  for (const userDoc of usersSnap.docs) {
    const userData = userDoc.data();

    let profileData = {};
    const profileSnap = await getDoc(doc(db, "playerProfiles", userDoc.id));

    if (profileSnap.exists()) {
      profileData = profileSnap.data();
    }

    const div = divisionValue(userData.division || profileData.division);

    rows.push({
      uid: userDoc.id,
      ...userData,
      ...profileData,
      email: userData.email || profileData.email || "",
      division: userData.division || profileData.division || div,
      elo:
        profileData.elo ||
        userData.elo ||
        userData.starterElo ||
        STARTING_ELO_BY_DIVISION[div] ||
        950
    });
  }

  allPlayers = rows.filter(player => player.hidden !== true);
}

function renderDivision() {
  const playersInDivision = allPlayers
    .filter(player => divisionValue(player.division) === currentDivision)
    .sort(sortPlayers);

  if (divisionSelect) divisionSelect.value = String(currentDivision);
  if (divNameText) divNameText.textContent = `Division ${currentDivision}`;

  if (!standingsBody) return;

  standingsBody.innerHTML = "";

  if (!playersInDivision.length) {
    standingsBody.innerHTML = `
      <tr>
        <td colspan="15" style="text-align:center;padding:28px;opacity:.75;">
          No players found in Division ${currentDivision}.
        </td>
      </tr>
    `;
    return;
  }

  playersInDivision.forEach((player, index) => {
    const stats = getModeStats(player);
    const diff = stats.legsFor - stats.legsAgainst;
    const elo = Number(player.elo || player.starterElo || 0);

    const tr = document.createElement("tr");

    tr.innerHTML = `
      <td>${index + 1}</td>

      <td>
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
          ${onlineDot(player)}
          <strong>${playerName(player)}</strong>
          <a
            href="./profile.html?uid=${player.uid}"
            style="font-size:.75rem;color:#f5c96a;text-decoration:none;"
          >
            Profile
          </a>
        </div>
        <small style="opacity:.7;">DC: ${playerDcUsername(player)}</small>
      </td>

      <td>${stats.played}</td>
      <td>${stats.wins}</td>
      <td>${stats.losses}</td>
      <td>${stats.legsFor}</td>
      <td>${stats.legsAgainst}</td>
      <td>${diff > 0 ? "+" : ""}${diff}</td>
      <td>${stats.visits171}</td>
      <td>${stats.checkouts100}</td>
      <td>${stats.bigFish}</td>
      <td>${stats.bullFinishes}</td>
      <td>${stats.doubleDouble}</td>
      <td>${stats.average ? Number(stats.average).toFixed(2) : "—"}</td>
      <td>${elo}</td>
    `;

    standingsBody.appendChild(tr);
  });

  if (updatedMeta) {
    updatedMeta.textContent = `Updated ${new Date().toLocaleString("en-GB")}`;
  }

  renderFixtures(playersInDivision);
  renderSubmitOpponents(playersInDivision);
}

function renderFixtures(playersInDivision) {
  if (!fixturesList || !fixturesCount || !currentUser) return;

  const opponents = playersInDivision.filter(player => player.uid !== currentUser.uid);

  fixturesCount.textContent = `0 / ${opponents.length}`;

  fixturesList.innerHTML = opponents.length
    ? opponents.map(player => `
      <div style="
        padding:10px 0;
        border-bottom:1px solid rgba(245,201,106,.15);
        display:flex;
        justify-content:space-between;
        gap:12px;
        align-items:center;
      ">
        <div>
          ${onlineDot(player)}
          <strong>${playerName(player)}</strong><br>
          <small style="opacity:.75;">DC: ${playerDcUsername(player)}</small>
        </div>

        <a href="./profile.html?uid=${player.uid}" style="color:#f5c96a;font-size:.8rem;">
          Profile
        </a>
      </div>
    `).join("")
    : `<p>No fixtures found.</p>`;
}

function renderSubmitOpponents(playersInDivision) {
  if (!srOpponent || !currentUser) return;

  srOpponent.innerHTML = `<option value="">Choose opponent</option>`;

  playersInDivision
    .filter(player => player.uid !== currentUser.uid)
    .sort((a, b) => playerName(a).localeCompare(playerName(b)))
    .forEach(player => {
      const opt = document.createElement("option");
      opt.value = player.uid;
      opt.textContent = `${isOnline(player) ? "🟢" : "⚫"} ${playerName(player)}`;
      srOpponent.appendChild(opt);
    });
}

function openModal(modal) {
  if (!modal) return;
  modal.classList.add("is-open");
  modal.style.display = "flex";
}

function closeModal(modal) {
  if (!modal) return;
  modal.classList.remove("is-open");
  modal.style.display = "none";
}

function setupModals() {
  btnFixtures?.addEventListener("click", () => openModal(fixturesModal));
  btnSubmit?.addEventListener("click", () => openModal(submitModal));

  document.querySelectorAll(".modal-overlay .close").forEach(btn => {
    btn.addEventListener("click", () => closeModal(btn.closest(".modal-overlay")));
  });

  document.querySelectorAll(".modal-overlay").forEach(modal => {
    modal.addEventListener("click", event => {
      if (event.target === modal) closeModal(modal);
    });
  });
}

function ensureInboxModal() {
  if (document.getElementById("inboxModal")) return;

  const div = document.createElement("div");
  div.id = "inboxModal";
  div.className = "modal-overlay";
  div.style.display = "none";

  div.innerHTML = `
    <div class="modal large-modal">
      <button class="close" type="button">×</button>
      <h3>Result Inbox</h3>
      <div id="inboxList"></div>
    </div>
  `;

  document.body.appendChild(div);

  div.querySelector(".close").addEventListener("click", () => closeModal(div));

  div.addEventListener("click", event => {
    if (event.target === div) closeModal(div);
  });
}

async function updateOnlineStatus(online) {
  if (!currentUser) return;

  await setDoc(doc(db, "users", currentUser.uid), {
    online,
    status: online ? "online" : "offline",
    lastActive: serverTimestamp(),
    updatedAt: serverTimestamp()
  }, { merge: true });

  await setDoc(doc(db, "playerProfiles", currentUser.uid), {
    online,
    status: online ? "online" : "offline",
    lastActive: serverTimestamp(),
    updatedAt: serverTimestamp()
  }, { merge: true });

  await refresh();
}

function addOnlineToggle() {
  const actions = document.querySelector(".header-actions");

  if (!actions || document.getElementById("btnOnlineToggle")) return;

  const btn = document.createElement("button");
  btn.id = "btnOnlineToggle";
  btn.className = "outline-btn";
  btn.type = "button";

  const online = currentUserDoc && isOnline(currentUserDoc);
  btn.textContent = online ? "Go Offline" : "Go Online";

  btn.addEventListener("click", async () => {
    const currentlyOnline = currentUserDoc && isOnline(currentUserDoc);
    await updateOnlineStatus(!currentlyOnline);
  });

  actions.appendChild(btn);
}

async function submitResult() {
  if (!currentUser || !currentUserDoc) {
    alert("You must be logged in to submit a result.");
    return;
  }

  const opponentUid = srOpponent?.value;
  const opponent = allPlayers.find(player => player.uid === opponentUid);

  const myLegs = Number(document.getElementById("srMyLegs")?.value);
  const oppLegs = Number(document.getElementById("srOppLegs")?.value);

  if (!opponentUid || !opponent) {
    srNote.textContent = "Choose an opponent.";
    return;
  }

  if (Number.isNaN(myLegs) || Number.isNaN(oppLegs)) {
    srNote.textContent = "Enter both leg scores.";
    return;
  }

  const myStats = {
    visits171: Number(document.getElementById("srMy171")?.value) || 0,
    checkouts100: Number(document.getElementById("srMy100")?.value) || 0,
    bigFish: Number(document.getElementById("srMyBigFish")?.value) || 0,
    bullFinishes: Number(document.getElementById("srMyBull")?.value) || 0,
    doubleDouble: Number(document.getElementById("srMyDD")?.value) || 0,
    average: Number(document.getElementById("srMyAvg")?.value) || 0
  };

  const oppStats = {
    visits171: Number(document.getElementById("srOpp171")?.value) || 0,
    checkouts100: Number(document.getElementById("srOpp100")?.value) || 0,
    bigFish: Number(document.getElementById("srOppBigFish")?.value) || 0,
    bullFinishes: Number(document.getElementById("srOppBull")?.value) || 0,
    doubleDouble: Number(document.getElementById("srOppDD")?.value) || 0,
    average: Number(document.getElementById("srOppAvg")?.value) || 0
  };

  await addDoc(collection(db, "pendingMatches"), {
    mode: "freeLeague",
    division: currentDivision,
    p1: currentUser.uid,
    p2: opponentUid,
    p1Name: playerName(currentUserDoc),
    p2Name: playerName(opponent),
    p1Legs: myLegs,
    p2Legs: oppLegs,
    p1Stats: myStats,
    p2Stats: oppStats,
    submittedBy: currentUser.uid,
    status: "pending",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });

  srNote.textContent = "Result submitted for confirmation.";
  await loadInboxCount();
}

async function loadInboxCount() {
  if (!currentUser || !inboxCount) return;

  const snap = await getDocs(collection(db, "pendingMatches"));
  pendingInbox = [];

  snap.forEach(matchDoc => {
    const match = { id: matchDoc.id, ...matchDoc.data() };

    if (
      match.status === "pending" &&
      (match.p1 === currentUser.uid || match.p2 === currentUser.uid) &&
      match.submittedBy !== currentUser.uid
    ) {
      pendingInbox.push(match);
    }
  });

  inboxCount.textContent = String(pendingInbox.length);
}

function renderInbox() {
  ensureInboxModal();

  const box = document.getElementById("inboxList");

  if (!box) return;

  if (!pendingInbox.length) {
    box.innerHTML = `<p>No results waiting for you.</p>`;
    return;
  }

  box.innerHTML = pendingInbox.map(match => `
    <div style="padding:14px 0;border-bottom:1px solid rgba(245,201,106,.18);">
      <strong>${match.p1Name}</strong> ${match.p1Legs} - ${match.p2Legs} <strong>${match.p2Name}</strong>
      <br>
      <small style="opacity:.75;">Division ${match.division} • Awaiting your confirmation</small>
      <br><br>
      <button class="gold-btn" data-confirm-match="${match.id}" type="button">Confirm</button>
      <button class="outline-btn" data-dispute-match="${match.id}" type="button">Dispute</button>
    </div>
  `).join("");

  box.querySelectorAll("[data-confirm-match]").forEach(btn => {
    btn.addEventListener("click", async () => {
      await confirmPendingMatch(btn.dataset.confirmMatch);
    });
  });

  box.querySelectorAll("[data-dispute-match]").forEach(btn => {
    btn.addEventListener("click", async () => {
      await disputePendingMatch(btn.dataset.disputeMatch);
    });
  });
}

async function confirmPendingMatch(matchId) {
  const match = pendingInbox.find(item => item.id === matchId);
  if (!match) return;

  const p1 = allPlayers.find(player => player.uid === match.p1);
  const p2 = allPlayers.find(player => player.uid === match.p2);

  if (!p1 || !p2) {
    alert("Could not find both players.");
    return;
  }

  const mode = match.mode || "freeLeague";

  const p1Change = calculateEloChange(p1, p2, match.p1Legs, match.p2Legs, mode);
  const p2Change = calculateEloChange(p2, p1, match.p2Legs, match.p1Legs, mode);

  const p1StatsMode = updateStatsWithMatch(
    getModeStats(p1, mode),
    match.p1Legs,
    match.p2Legs,
    match.p1Stats || {}
  );

  const p2StatsMode = updateStatsWithMatch(
    getModeStats(p2, mode),
    match.p2Legs,
    match.p1Legs,
    match.p2Stats || {}
  );

  const p1StatsOverall = updateStatsWithMatch(
    getModeStats(p1, "overall"),
    match.p1Legs,
    match.p2Legs,
    match.p1Stats || {}
  );

  const p2StatsOverall = updateStatsWithMatch(
    getModeStats(p2, "overall"),
    match.p2Legs,
    match.p1Legs,
    match.p2Stats || {}
  );

  const p1NewElo = Number(p1.elo || p1.starterElo || 950) + p1Change;
  const p2NewElo = Number(p2.elo || p2.starterElo || 950) + p2Change;

  const p1Stats = {
    ...(p1.stats || {}),
    [mode]: p1StatsMode,
    overall: p1StatsOverall
  };

  const p2Stats = {
    ...(p2.stats || {}),
    [mode]: p2StatsMode,
    overall: p2StatsOverall
  };

  await setDoc(doc(db, "users", match.p1), {
    elo: p1NewElo,
    stats: p1Stats,
    updatedAt: serverTimestamp()
  }, { merge: true });

  await setDoc(doc(db, "playerProfiles", match.p1), {
    elo: p1NewElo,
    stats: p1Stats,
    updatedAt: serverTimestamp()
  }, { merge: true });

  await setDoc(doc(db, "users", match.p2), {
    elo: p2NewElo,
    stats: p2Stats,
    updatedAt: serverTimestamp()
  }, { merge: true });

  await setDoc(doc(db, "playerProfiles", match.p2), {
    elo: p2NewElo,
    stats: p2Stats,
    updatedAt: serverTimestamp()
  }, { merge: true });

  await addDoc(collection(db, "matches"), {
    ...match,
    status: "confirmed",
    confirmedBy: currentUser.uid,
    confirmedAt: serverTimestamp(),
    p1EloChange: p1Change,
    p2EloChange: p2Change,
    p1NewElo,
    p2NewElo
  });

  await setDoc(doc(db, "pendingMatches", matchId), {
    status: "confirmed",
    confirmedBy: currentUser.uid,
    confirmedAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  }, { merge: true });

  alert("Result confirmed and standings updated.");

  closeModal(document.getElementById("inboxModal"));
  await refresh();
}

async function disputePendingMatch(matchId) {
  const reason = prompt("Reason for dispute:");

  if (!reason) return;

  await setDoc(doc(db, "pendingMatches", matchId), {
    status: "disputed",
    disputeReason: reason,
    disputedBy: currentUser.uid,
    disputedAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  }, { merge: true });

  alert("Result disputed and sent for admin review.");

  closeModal(document.getElementById("inboxModal"));
  await refresh();
}

btnInbox?.addEventListener("click", async () => {
  await loadInboxCount();
  renderInbox();
  openModal(document.getElementById("inboxModal"));
});

btnPointsCalc?.addEventListener("click", () => {
  alert("Points calculator coming next.");
});

srSubmitBtn?.addEventListener("click", submitResult);

async function refresh() {
  setError("");

  await loadPlayers();

  if (currentUser) {
    currentUserDoc = allPlayers.find(player => player.uid === currentUser.uid) || null;

    if (currentUserDoc) {
      currentDivision = divisionValue(currentUserDoc.division);
    }
  }

  setupDivisionSelect();
  addOnlineToggle();
  renderDivision();
  await loadInboxCount();
}

setupModals();
ensureInboxModal();

onAuthStateChanged(auth, async user => {
  currentUser = user;

  if (!user) {
    setError("You are viewing as guest. Log in to submit results or set online status.");
    currentDivision = 1;
    await loadPlayers();
    setupDivisionSelect();
    renderDivision();
    return;
  }

  await setDoc(doc(db, "users", user.uid), {
    lastActive: serverTimestamp(),
    updatedAt: serverTimestamp()
  }, { merge: true });

  await refresh();
});