// public/Js/tournaments/bracket-view.js
// TrebleChasers ODL - Public Bracket View

import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-app.js";

import {
  getFirestore,
  collection,
  getDocs
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

import {
  getBracketProgress
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

const els = {
  title: document.getElementById("tournamentTitle"),
  meta: document.getElementById("tournamentMeta"),
  statusChip: document.getElementById("statusChip"),
  playersChip: document.getElementById("playersChip"),
  progressChip: document.getElementById("progressChip"),
  championChip: document.getElementById("championChip"),
  bracketRoot: document.getElementById("bracketRoot"),
  errorMeta: document.getElementById("errorMeta")
};

function getTournamentIdFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return params.get("id") || params.get("tournamentId") || null;
}

function setText(el, value) {
  if (el) el.textContent = value;
}

function showError(message) {
  if (els.errorMeta) {
    els.errorMeta.style.display = "block";
    els.errorMeta.textContent = message;
  }

  if (els.bracketRoot) {
    els.bracketRoot.innerHTML = `<div class="empty">${message}</div>`;
  }
}

function safePlayerName(player) {
  if (!player) return "TBC";
  if (player.isBye) return "BYE";
  return player.name || player.displayName || "Unknown";
}

function safeScore(score) {
  if (score === null || score === undefined) return "—";
  return String(score);
}

function statusClass(status) {
  const s = String(status || "pending").toLowerCase();

  if (s === "complete" || s === "confirmed") return "complete";
  if (s === "ready") return "ready";
  return "pending";
}

async function fetchTournaments() {
  const snap = await getDocs(collection(db, "tournaments"));
  const tournaments = [];

  snap.forEach((docSnap) => {
    if (docSnap.id === "global") return;

    tournaments.push({
      firestoreId: docSnap.id,
      id: docSnap.data().id || docSnap.id,
      ...docSnap.data()
    });
  });

  return tournaments;
}

function chooseTournament(tournaments) {
  const id = getTournamentIdFromUrl();

  if (id) {
    return tournaments.find(
      (t) => t.id === id || t.firestoreId === id
    );
  }

  return tournaments[0] || null;
}

function renderHeader(tournament) {
  const progress = getBracketProgress(tournament);

  setText(els.title, tournament.name || "Tournament Bracket");

  setText(
    els.meta,
    `${tournament.type || tournament.competitionType || "Knockout"} • ${tournament.format || "BO9"} • ${tournament.bracketSize || 0}-player bracket`
  );

  setText(
    els.statusChip,
    `Status: ${tournament.status || "live"}`
  );

  setText(
    els.playersChip,
    `Players: ${tournament.playerCount || tournament.players?.length || 0}`
  );

  setText(
    els.progressChip,
    `Progress: ${progress.percentComplete || 0}%`
  );

  setText(
    els.championChip,
    `Champion: ${tournament.champion?.name || "—"}`
  );
}

function renderBracket(tournament) {
  if (!els.bracketRoot) return;

  if (!tournament.rounds || !Array.isArray(tournament.rounds)) {
    els.bracketRoot.innerHTML = `
      <div class="empty">
        This tournament does not have bracket rounds yet.
      </div>
    `;
    return;
  }

  els.bracketRoot.innerHTML = "";

  const rounds = [...tournament.rounds].sort(
    (a, b) => b.roundNumber - a.roundNumber
  );

  rounds.forEach((round) => {
    const roundCard = document.createElement("section");
    roundCard.className = "round-card";

    const title = document.createElement("h3");
    title.textContent = round.roundName || `Round ${round.roundNumber}`;
    roundCard.appendChild(title);

    if (!round.matches || !round.matches.length) {
      const empty = document.createElement("div");
      empty.className = "empty";
      empty.textContent = "No matches in this round.";
      roundCard.appendChild(empty);
    }

    round.matches.forEach((match) => {
      roundCard.appendChild(renderMatch(match));
    });

    els.bracketRoot.appendChild(roundCard);
  });
}

function renderMatch(match) {
  const card = document.createElement("article");
  card.className = "match-card";

  const pA = match.playerA || null;
  const pB = match.playerB || null;

  const winnerId = match.winner?.id || null;

  const playerAIsWinner = pA && winnerId && pA.id === winnerId;
  const playerBIsWinner = pB && winnerId && pB.id === winnerId;

  card.innerHTML = `
    <div class="match-top">
      <span>Match ${match.matchNumber || "—"}</span>
      <span class="status ${statusClass(match.status)}">
        ${match.status || "pending"}
      </span>
    </div>

    <div class="player-row ${playerAIsWinner ? "winner" : ""}">
      <div class="player-name">${safePlayerName(pA)}</div>
      <div class="score">${safeScore(match.scoreA)}</div>
    </div>

    <div class="player-row ${playerBIsWinner ? "winner" : ""}">
      <div class="player-name">${safePlayerName(pB)}</div>
      <div class="score">${safeScore(match.scoreB)}</div>
    </div>
  `;

  return card;
}

async function init() {
  try {
    const tournaments = await fetchTournaments();
    const tournament = chooseTournament(tournaments);

    if (!tournament) {
      showError("No tournament found yet. Create one from the Admin Panel first.");
      return;
    }

    renderHeader(tournament);
    renderBracket(tournament);
  } catch (err) {
    console.error(err);
    showError(err.message || "Failed to load bracket.");
  }
}

init();