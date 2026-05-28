// public/Js/tournaments/tournaments.js
// TrebleChasers ODL - Live Tournament Controller
// Connects tournament engines to Firebase and tournament pages.

import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-app.js";

import {
  getFirestore,
  collection,
  getDocs,
  addDoc,
  updateDoc,
  doc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

import {
  getAuth,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";

import {
  createTournamentFromAdmin,
  getAdminTournamentSummary,
  listAdminTournamentTypes,
  prepareTournamentForFirestore,
  TOURNAMENT_ADMIN_TYPES
} from "./tournament-admin.js";

import {
  buildSwissStandings,
  getSwissProgress
} from "./swiss-engine.js";

import {
  getBracketProgress,
  getReadyMatches,
  confirmMatchResult
} from "./bracket-engine.js";

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

const usersCol = collection(db, "users");
const tournamentsCol = collection(db, "tournaments");
const tournamentMatchesCol = collection(db, "tournaments", "global", "matches");

const state = {
  currentUser: null,
  currentUserDoc: null,
  users: [],
  tournaments: [],
  matches: [],
  currentView: "tournaments"
};

const els = {
  needLoginBox: document.getElementById("needLoginBox"),
  tournamentGrid: document.getElementById("tournamentGrid"),
  tournamentList: document.getElementById("tournamentList"),
  tournamentTableBody: document.getElementById("tourTableBody"),
  updatedMeta: document.getElementById("updatedMeta"),
  errorMeta: document.getElementById("errorMeta"),
  inboxCount: document.getElementById("inboxCount"),

  btnCreateElite: document.getElementById("btnCreateElite"),
  btnCreateChallenger: document.getElementById("btnCreateChallenger"),
  btnCreateDC: document.getElementById("btnCreateDC"),
  btnCreateMembersFriday: document.getElementById("btnCreateMembersFriday"),
  btnCreateSwiss: document.getElementById("btnCreateSwiss"),
  btnRefresh: document.getElementById("btnRefresh"),

  adminTournamentType: document.getElementById("adminTournamentType"),
  adminTournamentName: document.getElementById("adminTournamentName"),
  adminCreateBtn: document.getElementById("adminCreateBtn"),
  adminPreviewBtn: document.getElementById("adminPreviewBtn"),
  adminPreviewBox: document.getElementById("adminPreviewBox"),

  swissTableBody: document.getElementById("swissTableBody"),
  bracketBox: document.getElementById("bracketBox")
};

function setText(el, value) {
  if (el) el.textContent = value;
}

function showError(message) {
  if (!els.errorMeta) return;
  els.errorMeta.style.display = "block";
  els.errorMeta.textContent = message || "Something went wrong.";
}

function clearError() {
  if (!els.errorMeta) return;
  els.errorMeta.style.display = "none";
  els.errorMeta.textContent = "";
}

function safeName(user) {
  return user?.displayName || user?.name || "Unknown";
}

function isAdmin(userDoc) {
  return userDoc?.role === "admin" || userDoc?.isAdmin === true;
}

function isMember(userDoc) {
  return (
    userDoc?.role === "admin" ||
    userDoc?.role === "member" ||
    userDoc?.isMember === true ||
    userDoc?.member === true
  );
}

async function fetchUsers() {
  const snap = await getDocs(usersCol);
  const out = [];

  snap.forEach((d) => {
    out.push({
      uid: d.id,
      id: d.id,
      ...d.data()
    });
  });

  return out;
}

async function fetchTournaments() {
  const snap = await getDocs(tournamentsCol);
  const out = [];

  snap.forEach((d) => {
    if (d.id === "global") return;

    out.push({
      id: d.id,
      ...d.data()
    });
  });

  return out;
}

async function fetchTournamentMatches() {
  const snap = await getDocs(tournamentMatchesCol);
  const out = [];

  snap.forEach((d) => {
    out.push({
      id: d.id,
      ...d.data()
    });
  });

  return out;
}

async function loadAll() {
  clearError();

  state.users = await fetchUsers();
  state.tournaments = await fetchTournaments();
  state.matches = await fetchTournamentMatches();

  state.currentUserDoc =
    state.users.find((u) => u.uid === state.currentUser?.uid) || null;

  renderAll();
}

function renderAll() {
  renderTournamentTypeOptions();
  renderTournamentCards();
  renderTournamentTable();
  renderSwissIfAvailable();

  setText(
    els.updatedMeta,
    `Updated: ${new Date().toLocaleString()}`
  );
}

function renderTournamentTypeOptions() {
  if (!els.adminTournamentType) return;

  const currentValue = els.adminTournamentType.value;
  els.adminTournamentType.innerHTML = "";

  listAdminTournamentTypes().forEach((type) => {
    const opt = document.createElement("option");
    opt.value = type.key;
    opt.textContent = type.label;
    els.adminTournamentType.appendChild(opt);
  });

  if (currentValue) {
    els.adminTournamentType.value = currentValue;
  }
}

function renderTournamentCards() {
  const target = els.tournamentGrid || els.tournamentList;
  if (!target) return;

  target.innerHTML = "";

  if (!state.tournaments.length) {
    target.innerHTML = `
      <div class="tile">
        <div class="tile-head">
          <h3>No Tournaments Yet</h3>
          <span class="chip">Empty</span>
        </div>
        <p>Create your first tournament from the admin controls.</p>
      </div>
    `;
    return;
  }

  state.tournaments.forEach((tournament) => {
    const summary = getAdminTournamentSummary(tournament);

    const progress =
      tournament.type === TOURNAMENT_ADMIN_TYPES.MEMBERS_SWISS
        ? getSwissProgress(tournament)
        : getBracketProgress(tournament);

    const card = document.createElement("article");
    card.className = "tile";
    card.dataset.tournamentId = tournament.id;

    card.innerHTML = `
      <div class="tile-head">
        <h3>${summary?.name || tournament.name || "Tournament"}</h3>
        <span class="chip">${summary?.status || tournament.status || "live"}</span>
      </div>

      <p>
        ${summary?.type || tournament.type || tournament.competitionType || "Tournament"}
      </p>

      <div class="metrics">
        <div class="metric">
          <span>Players</span>
          <strong>${summary?.playerCount || tournament.playerCount || tournament.players?.length || 0}</strong>
        </div>

        <div class="metric">
          <span>Progress</span>
          <strong>${progress?.percentComplete ?? 0}%</strong>
        </div>

        <div class="metric">
          <span>Champion</span>
          <strong>${summary?.champion?.name || "—"}</strong>
        </div>
      </div>
    `;

    target.appendChild(card);
  });
}

function renderTournamentTable() {
  if (!els.tournamentTableBody) return;

  els.tournamentTableBody.innerHTML = "";

  const rows = state.tournaments.map((tournament) => {
    const summary = getAdminTournamentSummary(tournament);

    return {
      id: tournament.id,
      name: summary?.name || tournament.name || "Tournament",
      type: summary?.type || tournament.type || tournament.competitionType || "Tournament",
      status: summary?.status || tournament.status || "live",
      players: summary?.playerCount || tournament.players?.length || 0,
      champion: summary?.champion?.name || "—"
    };
  });

  if (!rows.length) {
    els.tournamentTableBody.innerHTML = `
      <tr>
        <td colspan="6">No tournaments created yet.</td>
      </tr>
    `;
    return;
  }

  rows.forEach((row, index) => {
    const tr = document.createElement("tr");

    tr.innerHTML = `
      <td>${index + 1}</td>
      <td>${row.name}</td>
      <td>${row.type}</td>
      <td>${row.status}</td>
      <td>${row.players}</td>
      <td>${row.champion}</td>
    `;

    els.tournamentTableBody.appendChild(tr);
  });
}

function renderSwissIfAvailable() {
  if (!els.swissTableBody) return;

  const swiss = state.tournaments.find(
    (t) => t.type === TOURNAMENT_ADMIN_TYPES.MEMBERS_SWISS
  );

  els.swissTableBody.innerHTML = "";

  if (!swiss) {
    els.swissTableBody.innerHTML = `
      <tr>
        <td colspan="8">No Members Swiss tournament found yet.</td>
      </tr>
    `;
    return;
  }

  const standings = buildSwissStandings(swiss);

  standings.forEach((row) => {
    const tr = document.createElement("tr");

    tr.innerHTML = `
      <td>${row.rank}</td>
      <td>${row.name}</td>
      <td>${row.played}</td>
      <td>${row.wins}</td>
      <td>${row.losses}</td>
      <td>${row.legsFor}</td>
      <td>${row.legsAgainst}</td>
      <td><strong>${row.points}</strong></td>
    `;

    els.swissTableBody.appendChild(tr);
  });
}

function getActivePlayersForAdmin() {
  return state.users.filter((u) => {
    const status = String(u.status || "active").toLowerCase();
    return status !== "inactive";
  });
}

async function saveTournament(tournament) {
  const prepared = prepareTournamentForFirestore(tournament);

  await addDoc(tournamentsCol, {
    ...prepared,
    createdAtServer: serverTimestamp()
  });
}

async function createTournament(type, options = {}) {
  if (!state.currentUser) {
    throw new Error("You must be logged in.");
  }

  if (!isAdmin(state.currentUserDoc)) {
    throw new Error("Admin access required.");
  }

  const players = getActivePlayersForAdmin();

  const tournament = createTournamentFromAdmin({
    type,
    players,
    name: options.name || null,
    startsAt: options.startsAt || null,
    bracketSize: options.bracketSize || null,
    createdBy: state.currentUser.uid,
    metadata: {
      createdFrom: "tournaments.js"
    }
  });

  await saveTournament(tournament);

  await loadAll();

  return tournament;
}

function previewTournament() {
  if (!els.adminPreviewBox) return;

  try {
    const type =
      els.adminTournamentType?.value ||
      TOURNAMENT_ADMIN_TYPES.DC_TOURNAMENT;

    const name = els.adminTournamentName?.value || null;

    const players = getActivePlayersForAdmin();

    const preview = createTournamentFromAdmin({
      type,
      players,
      name,
      createdBy: "preview",
      metadata: {
        preview: true
      }
    });

    const summary = getAdminTournamentSummary(preview);

    els.adminPreviewBox.innerHTML = `
      <div class="tile">
        <div class="tile-head">
          <h3>${summary.name}</h3>
          <span class="chip">Preview</span>
        </div>

        <p>${summary.type}</p>

        <div class="metrics">
          <div class="metric">
            <span>Players</span>
            <strong>${summary.playerCount || 0}</strong>
          </div>

          <div class="metric">
            <span>Format</span>
            <strong>${summary.format || "—"}</strong>
          </div>

          <div class="metric">
            <span>Members Only</span>
            <strong>${summary.membersOnly ? "Yes" : "No"}</strong>
          </div>
        </div>
      </div>
    `;
  } catch (err) {
    els.adminPreviewBox.innerHTML = `
      <div class="tile">
        <p>${err.message || "Preview failed."}</p>
      </div>
    `;
  }
}

function bindButtons() {
  els.btnRefresh?.addEventListener("click", () => {
    loadAll().catch((err) => showError(err.message));
  });

  els.btnCreateElite?.addEventListener("click", () => {
    createTournament(TOURNAMENT_ADMIN_TYPES.ELITE_CUP)
      .catch((err) => showError(err.message));
  });

  els.btnCreateChallenger?.addEventListener("click", () => {
    createTournament(TOURNAMENT_ADMIN_TYPES.CHALLENGER_CUP)
      .catch((err) => showError(err.message));
  });

  els.btnCreateDC?.addEventListener("click", () => {
    createTournament(TOURNAMENT_ADMIN_TYPES.DC_TOURNAMENT)
      .catch((err) => showError(err.message));
  });

  els.btnCreateMembersFriday?.addEventListener("click", () => {
    createTournament(TOURNAMENT_ADMIN_TYPES.DC_MEMBERS_FRIDAY)
      .catch((err) => showError(err.message));
  });

  els.btnCreateSwiss?.addEventListener("click", () => {
    createTournament(TOURNAMENT_ADMIN_TYPES.MEMBERS_SWISS)
      .catch((err) => showError(err.message));
  });

  els.adminPreviewBtn?.addEventListener("click", previewTournament);

  els.adminCreateBtn?.addEventListener("click", () => {
    const type =
      els.adminTournamentType?.value ||
      TOURNAMENT_ADMIN_TYPES.DC_TOURNAMENT;

    const name = els.adminTournamentName?.value || null;

    createTournament(type, { name })
      .catch((err) => showError(err.message));
  });
}

bindButtons();

onAuthStateChanged(auth, async (user) => {
  state.currentUser = user;

  if (!user) {
    if (els.needLoginBox) els.needLoginBox.style.display = "block";
    return;
  }

  if (els.needLoginBox) els.needLoginBox.style.display = "none";

  try {
    await loadAll();
  } catch (err) {
    console.error(err);
    showError(err.message || "Failed to load tournaments.");
  }
});