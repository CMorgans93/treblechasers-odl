const STARTING_ELO_BY_DIVISION = {
  1: 2000,
  2: 1850,
  3: 1700,
  4: 1550,
  5: 1400,
  6: 1250,
  7: 1100,
  8: 950
};

const DIVISION_SIZES = {
  1: 12,
  2: 16,
  3: 20,
  4: 24,
  5: 28,
  6: 32,
  7: 36,
  8: 40
};

const PROMOTION_RELEGATION = {
  1: { promote: 0, relegate: 3 },
  2: { promote: 3, relegate: 4 },
  3: { promote: 4, relegate: 5 },
  4: { promote: 5, relegate: 6 },
  5: { promote: 6, relegate: 7 },
  6: { promote: 7, relegate: 8 },
  7: { promote: 8, relegate: 9 },
  8: { promote: 9, relegate: 0 }
};

let players = JSON.parse(localStorage.getItem("tcPlayers")) || [];
let matches = JSON.parse(localStorage.getItem("tcMatches")) || [];
let pendingMatches = JSON.parse(localStorage.getItem("tcPendingMatches")) || [];
let pendingSignups = JSON.parse(localStorage.getItem("tcPendingSignups")) || [];

players = players.map(player => ({
  ...player,
  elo:
    player.elo ??
    STARTING_ELO_BY_DIVISION[player.starterDivision || 8] ??
    950,
  currentDivision:
    player.currentDivision ??
    player.starterDivision ??
    8
}));

function saveData() {
  localStorage.setItem("tcPlayers", JSON.stringify(players));
  localStorage.setItem("tcMatches", JSON.stringify(matches));
  localStorage.setItem("tcPendingMatches", JSON.stringify(pendingMatches));
  localStorage.setItem("tcPendingSignups", JSON.stringify(pendingSignups));
}

function getExpectedScore(playerElo, opponentElo) {
  return 1 / (1 + Math.pow(10, (opponentElo - playerElo) / 400));
}

function getKFactor(player) {
  return player.gamesPlayed < 10 ? 48 : 32;
}

function getDivisionFromAverage(avg) {
  if (avg >= 65) return 1;
  if (avg >= 61) return 2;
  if (avg >= 57) return 3;
  if (avg >= 53) return 4;
  if (avg >= 48) return 5;
  if (avg >= 43) return 6;
  if (avg >= 38) return 7;
  return 8;
}

function getActualResult(scoreFor, scoreAgainst) {
  if (scoreFor > scoreAgainst) return 1;
  if (scoreFor < scoreAgainst) return 0;
  return 0.5;
}

function calculateEloChange(player, opponent, scoreFor, scoreAgainst) {
  const expected = getExpectedScore(player.elo, opponent.elo);
  const actual = getActualResult(scoreFor, scoreAgainst);
  const k = getKFactor(player);

  const eloChange = Math.round(k * (actual - expected));

  const baseReward =
    scoreFor === scoreAgainst ? 5 :
    scoreFor > scoreAgainst ? 10 :
    0;

  return eloChange + baseReward;
}

function getSuggestedDivision(rank) {
  let runningTotal = 0;

  for (let division = 1; division <= 8; division++) {
    runningTotal += DIVISION_SIZES[division];

    if (rank <= runningTotal) {
      return division;
    }
  }

  return 8;
}

function getUKMonthKey(date = new Date()) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit"
  }).format(date);
}

function shouldRolloverSeason() {
  const currentMonth = getUKMonthKey();
  const lastMonth = localStorage.getItem("tcCurrentSeasonMonth");

  if (!lastMonth) {
    localStorage.setItem("tcCurrentSeasonMonth", currentMonth);
    return false;
  }

  return lastMonth !== currentMonth;
}

function archivePlayerSeasonStats(player) {
  player.profileStats = player.profileStats || {};
  player.profileStats.seasons = player.profileStats.seasons || [];

  player.profileStats.seasons.push({
    month: localStorage.getItem("tcCurrentSeasonMonth"),
    division: player.currentDivision,
    elo: player.elo,
    gamesPlayed: player.gamesPlayed || 0,
    wins: player.wins || 0,
    draws: player.draws || 0,
    losses: player.losses || 0,
    visits180: player.visits180 || 0,
    visits171: player.visits171 || 0,
    checkouts100: player.checkouts100 || 0,
    bullFinishes: player.bullFinishes || 0,
    doubleDouble: player.doubleDouble || 0,
    average: player.average || 0
  });
}

function resetPlayerSeasonStats(player) {
  player.gamesPlayed = 0;
  player.wins = 0;
  player.draws = 0;
  player.losses = 0;

  player.visits180 = 0;
  player.visits171 = 0;
  player.checkouts100 = 0;
  player.bullFinishes = 0;
  player.doubleDouble = 0;

  player.totalAverage = 0;
  player.averageCount = 0;
  player.average = 0;
}

function runMonthlyDivisionRollover() {
  if (!shouldRolloverSeason()) return;

  const divisions = {};

  for (let i = 1; i <= 8; i++) {
    divisions[i] = players
      .filter(p => Number(p.currentDivision) === i)
      .sort((a, b) => {
        if ((b.wins || 0) !== (a.wins || 0)) return (b.wins || 0) - (a.wins || 0);
        if ((b.elo || 0) !== (a.elo || 0)) return (b.elo || 0) - (a.elo || 0);
        return Number(b.average || 0) - Number(a.average || 0);
      });
  }

  players.forEach(player => {
    archivePlayerSeasonStats(player);
  });

  for (let div = 1; div <= 8; div++) {
    const rules = PROMOTION_RELEGATION[div];
    const table = divisions[div];

    const promoted = table.slice(0, rules.promote);
    const relegated = rules.relegate > 0 ? table.slice(-rules.relegate) : [];

    promoted.forEach(player => {
      if (player.currentDivision > 1) {
        player.currentDivision -= 1;
      }
    });

    relegated.forEach(player => {
      if (player.currentDivision < 8) {
        player.currentDivision += 1;
      }
    });
  }

  players.forEach(player => {
    resetPlayerSeasonStats(player);
  });

  matches = [];
  pendingMatches = [];

  localStorage.setItem("tcCurrentSeasonMonth", getUKMonthKey());

  saveData();

  alert("New monthly season started. Divisions refreshed and player profile history saved.");
}

function addPlayer() {
  const nameInput = document.getElementById("playerName");
  const starterDivision = Number(document.getElementById("starterDivision").value);
  const name = nameInput.value.trim();

  if (!name) {
    alert("Enter a player name.");
    return;
  }

  const existing = players.find(p => p.name.toLowerCase() === name.toLowerCase());

  if (existing) {
    alert("Player already exists.");
    return;
  }

  players.push({
    id: Date.now().toString(),
    name,
    elo: STARTING_ELO_BY_DIVISION[starterDivision] || 950,
    currentDivision: starterDivision,
    starterDivision,
    gamesPlayed: 0,
    wins: 0,
    losses: 0,
    draws: 0,
    profileStats: {
      visits171: 0,
      visits180: 0,
      checkouts100: 0,
      bullFinishes: 0,
      doubleDouble: 0,
      averages: [],
      seasons: []
    }
  });

  nameInput.value = "";

  saveData();
  renderAll();
}

function submitSignup() {
  const name = document.getElementById("signupName").value.trim();
  const discord = document.getElementById("signupDcUsername").value.trim();
  const average = parseFloat(document.getElementById("signupAverage").value);
  const division = Number(document.getElementById("signupDivision").value);

  if (!name) {
    alert("Enter your name.");
    return;
  }

  if (isNaN(average)) {
    alert("Enter your average.");
    return;
  }

  const allocatedDivision =
    division === 0
      ? getDivisionFromAverage(average)
      : division;

  pendingSignups.push({
    id: Date.now().toString(),
    name,
    discord,
    average,
    division: allocatedDivision,
    startingElo: STARTING_ELO_BY_DIVISION[allocatedDivision] || 950
  });

  saveData();

  alert("Signup submitted for admin approval.");

  document.getElementById("signupName").value = "";
  document.getElementById("signupDcUsername").value = "";
  document.getElementById("signupAverage").value = "";
  document.getElementById("signupDivision").value = "0";
}

function submitMatch() {
  const playerAId = document.getElementById("playerASelect").value;
  const playerBId = document.getElementById("playerBSelect").value;

  const scoreA = Number(document.getElementById("playerAScore").value);
  const scoreB = Number(document.getElementById("playerBScore").value);

  const statsA = {
    visits180: Number(document.getElementById("playerA180s").value) || 0,
    visits171: Number(document.getElementById("playerA171").value) || 0,
    checkouts100: Number(document.getElementById("playerA100").value) || 0,
    bullFinishes: Number(document.getElementById("playerABull").value) || 0,
    doubleDouble: Number(document.getElementById("playerADD").value) || 0,
    average: Number(document.getElementById("playerAAvg").value) || 0
  };

  const statsB = {
    visits180: Number(document.getElementById("playerB180s").value) || 0,
    visits171: Number(document.getElementById("playerB171").value) || 0,
    checkouts100: Number(document.getElementById("playerB100").value) || 0,
    bullFinishes: Number(document.getElementById("playerBBull").value) || 0,
    doubleDouble: Number(document.getElementById("playerBDD").value) || 0,
    average: Number(document.getElementById("playerBAvg").value) || 0
  };

  if (!playerAId || !playerBId) {
    alert("Choose both players.");
    return;
  }

  if (playerAId === playerBId) {
    alert("A player cannot play themselves.");
    return;
  }

  if (Number.isNaN(scoreA) || Number.isNaN(scoreB)) {
    alert("Enter both scores.");
    return;
  }

  const playerA = players.find(p => p.id === playerAId);
  const playerB = players.find(p => p.id === playerBId);

  pendingMatches.unshift({
    id: Date.now().toString(),
    date: new Date().toLocaleString(),
    playerAId,
    playerBId,
    playerAName: playerA.name,
    playerBName: playerB.name,
    scoreA,
    scoreB,
    statsA,
    statsB,
    status: "pending"
  });

  document.getElementById("playerAScore").value = "";
  document.getElementById("playerBScore").value = "";

  saveData();
  renderAll();

  alert("Match submitted for confirmation.");
}

function saveProfileStats() {
  const playerId = document.getElementById("statsPlayerSelect").value;

  if (!playerId) {
    alert("Choose a player.");
    return;
  }

  const player = players.find(p => p.id === playerId);

  player.profileStats = player.profileStats || {
    visits171: 0,
    visits180: 0,
    checkouts100: 0,
    bullFinishes: 0,
    doubleDouble: 0,
    averages: [],
    seasons: []
  };

  const visits171 = Number(document.getElementById("visits171").value) || 0;
  const visits180 = Number(document.getElementById("visits180").value) || 0;
  const checkouts100 = Number(document.getElementById("checkouts100").value) || 0;
  const bullFinishes = Number(document.getElementById("bullFinishes").value) || 0;
  const doubleDouble = Number(document.getElementById("doubleDouble").value) || 0;
  const matchAverage = Number(document.getElementById("matchAverage").value) || null;

  player.profileStats.visits171 += visits171;
  player.profileStats.visits180 += visits180;
  player.profileStats.checkouts100 += checkouts100;
  player.profileStats.bullFinishes += bullFinishes;
  player.profileStats.doubleDouble += doubleDouble;

  if (matchAverage !== null) {
    player.profileStats.averages.push(matchAverage);
  }

  document.getElementById("visits171").value = "";
  document.getElementById("visits180").value = "";
  document.getElementById("checkouts100").value = "";
  document.getElementById("bullFinishes").value = "";
  document.getElementById("doubleDouble").value = "";
  document.getElementById("matchAverage").value = "";

  saveData();
  renderAll();
}

function renderDropdowns() {
  const playerASelect = document.getElementById("playerASelect");
  const playerBSelect = document.getElementById("playerBSelect");
  const statsPlayerSelect = document.getElementById("statsPlayerSelect");

  playerASelect.innerHTML = `<option value="">Player A</option>`;
  playerBSelect.innerHTML = `<option value="">Player B</option>`;
  statsPlayerSelect.innerHTML = `<option value="">Choose player</option>`;

  players
    .sort((a, b) => a.name.localeCompare(b.name))
    .forEach(player => {
      playerASelect.add(new Option(player.name, player.id));
      playerBSelect.add(new Option(player.name, player.id));
      statsPlayerSelect.add(new Option(player.name, player.id));
    });
}

function renderEloTable() {
  const body = document.getElementById("eloTableBody");

  body.innerHTML = "";

  const rankedPlayers = [...players].sort((a, b) => b.elo - a.elo);

  rankedPlayers.forEach((player, index) => {
    const rank = index + 1;
    const suggestedDivision = getSuggestedDivision(rank);

    const probation =
      player.gamesPlayed >= 10
        ? "Unlocked"
        : `${player.gamesPlayed}/10`;

    let status = "🔒 Limited";

    if (player.gamesPlayed >= 5) {
      status = "🟢 Full Access";
    }

    if (player.isMember) {
      status = "💎 Member";
    }

    const row = document.createElement("tr");

    row.innerHTML = `
      <td>${rank}</td>
      <td>
        <button onclick="viewPlayer('${player.id}')">
          ${player.name}
        </button>
      </td>
      <td>${player.elo}</td>
      <td class="div-${player.currentDivision}">
        Div ${player.currentDivision}
      </td>
      <td>Div ${suggestedDivision}</td>
      <td>${probation}</td>
      <td>${status}</td>
      <td>${player.gamesPlayed}</td>
      <td>${player.wins}</td>
      <td>${player.draws || 0}</td>
      <td>${player.losses}</td>
      <td>${player.visits180 || 0}</td>
      <td>${player.visits171 || 0}</td>
      <td>${player.checkouts100 || 0}</td>
      <td>${player.bullFinishes || 0}</td>
      <td>${player.doubleDouble || 0}</td>
      <td>${player.average || 0}</td>
    `;

    body.appendChild(row);
  });
}

function renderMatchHistory() {
  const history = document.getElementById("matchHistory");

  history.innerHTML = "";

  if (matches.length === 0) {
    history.innerHTML = "<p>No matches submitted yet.</p>";
    return;
  }

  matches.forEach(match => {
    const div = document.createElement("div");

    div.innerHTML = `
      <p>
        <strong>${match.playerA}</strong> ${match.scoreA}
        -
        ${match.scoreB} <strong>${match.playerB}</strong>
        <br />
        ${match.playerA}: ${match.oldEloA} → ${match.newEloA}
        (${match.changeA >= 0 ? "+" : ""}${match.changeA})
        <br />
        ${match.playerB}: ${match.oldEloB} → ${match.newEloB}
        (${match.changeB >= 0 ? "+" : ""}${match.changeB})
        <br />
        <small>${match.date}</small>
      </p>
      <hr />
    `;

    history.appendChild(div);
  });
}

function renderPendingMatches() {
  const container = document.getElementById("pendingMatches");

  container.innerHTML = "";

  if (pendingMatches.length === 0) {
    container.innerHTML = "<p>No pending matches.</p>";
    return;
  }

  pendingMatches.forEach(match => {
    const div = document.createElement("div");

    div.innerHTML = `
      <p>
        <strong>${match.playerAName}</strong>
        ${match.scoreA} - ${match.scoreB}
        <strong>${match.playerBName}</strong>

        <br /><small>${match.date}</small><br /><br />

        <button onclick="confirmMatch('${match.id}')">
          Confirm
        </button>

        <button onclick="disputeMatch('${match.id}')">
          Dispute
        </button>
      </p>
      <hr />
    `;

    container.appendChild(div);
  });
}

function confirmMatch(matchId) {
  const match = pendingMatches.find(m => m.id === matchId);

  if (!match) return;

  const playerA = players.find(p => p.id === match.playerAId);
  const playerB = players.find(p => p.id === match.playerBId);

  const oldEloA = playerA.elo;
  const oldEloB = playerB.elo;

  const changeA = calculateEloChange(playerA, playerB, match.scoreA, match.scoreB);
  const changeB = calculateEloChange(playerB, playerA, match.scoreB, match.scoreA);

  playerA.elo += changeA;
  playerB.elo += changeB;

  playerA.gamesPlayed++;
  playerB.gamesPlayed++;

  playerA.visits180 = (playerA.visits180 || 0) + match.statsA.visits180;
  playerA.visits171 = (playerA.visits171 || 0) + match.statsA.visits171;
  playerA.checkouts100 = (playerA.checkouts100 || 0) + match.statsA.checkouts100;
  playerA.bullFinishes = (playerA.bullFinishes || 0) + match.statsA.bullFinishes;
  playerA.doubleDouble = (playerA.doubleDouble || 0) + match.statsA.doubleDouble;

  playerB.visits180 = (playerB.visits180 || 0) + match.statsB.visits180;
  playerB.visits171 = (playerB.visits171 || 0) + match.statsB.visits171;
  playerB.checkouts100 = (playerB.checkouts100 || 0) + match.statsB.checkouts100;
  playerB.bullFinishes = (playerB.bullFinishes || 0) + match.statsB.bullFinishes;
  playerB.doubleDouble = (playerB.doubleDouble || 0) + match.statsB.doubleDouble;

  playerA.totalAverage = (playerA.totalAverage || 0) + match.statsA.average;
  playerB.totalAverage = (playerB.totalAverage || 0) + match.statsB.average;

  playerA.averageCount = (playerA.averageCount || 0) + 1;
  playerB.averageCount = (playerB.averageCount || 0) + 1;

  playerA.average = (playerA.totalAverage / playerA.averageCount).toFixed(2);
  playerB.average = (playerB.totalAverage / playerB.averageCount).toFixed(2);

  if (match.scoreA > match.scoreB) {
    playerA.wins++;
    playerB.losses++;
  } else if (match.scoreB > match.scoreA) {
    playerB.wins++;
    playerA.losses++;
  } else {
    playerA.draws++;
    playerB.draws++;
  }

  matches.unshift({
    date: match.date,
    playerA: playerA.name,
    playerB: playerB.name,
    scoreA: match.scoreA,
    scoreB: match.scoreB,
    oldEloA,
    oldEloB,
    newEloA: playerA.elo,
    newEloB: playerB.elo,
    changeA,
    changeB
  });

  pendingMatches = pendingMatches.filter(m => m.id !== matchId);

  saveData();
  renderAll();
}

function deleteDisputedMatch(matchId) {
  pendingMatches = pendingMatches.filter(m => m.id !== matchId);

  saveData();
  renderAll();

  alert("Disputed match removed.");
}

function disputeMatch(matchId) {
  const reason = prompt("Enter dispute reason:");

  if (!reason) return;

  const match = pendingMatches.find(m => m.id === matchId);

  if (!match) return;

  match.status = "disputed";
  match.disputeReason = reason;

  saveData();
  renderAll();

  alert("Match disputed and sent to admins.");
}

function approveSignup(signupId) {
  const signup = pendingSignups.find(signup => signup.id === signupId);

  if (!signup) return;

  players.push({
    id: Date.now().toString(),
    name: signup.name,
    dcUsername: signup.discord,
    elo: signup.startingElo || STARTING_ELO_BY_DIVISION[signup.division] || 950,
    currentDivision: signup.division,
    starterDivision: signup.division,
    gamesPlayed: 0,
    wins: 0,
    losses: 0,
    draws: 0,
    profileStats: {
      visits171: 0,
      visits180: 0,
      checkouts100: 0,
      bullFinishes: 0,
      doubleDouble: 0,
      averages: [],
      seasons: []
    }
  });

  pendingSignups = pendingSignups.filter(signup => signup.id !== signupId);

  saveData();
  renderAll();

  alert("Signup approved and player added.");
}

function rejectSignup(signupId) {
  pendingSignups = pendingSignups.filter(signup => signup.id !== signupId);

  saveData();
  renderAll();

  alert("Signup rejected.");
}

function renderPendingSignups() {
  const container = document.getElementById("pendingSignups");

  if (!container) return;

  container.innerHTML = "";

  if (pendingSignups.length === 0) {
    container.innerHTML = "<p>No pending signups.</p>";
    return;
  }

  pendingSignups.forEach(signup => {
    const div = document.createElement("div");

    div.innerHTML = `
      <hr>
      <p>
        <b>${signup.name}</b><br>
        DC Username: ${signup.discord}<br>
        Average: ${signup.average}<br>
        Division: ${signup.division}<br>
        Starting ELO: ${signup.startingElo || STARTING_ELO_BY_DIVISION[signup.division] || 950}
      </p>

      <button onclick="approveSignup('${signup.id}')">
        Approve
      </button>

      <button onclick="rejectSignup('${signup.id}')">
        Reject
      </button>
    `;

    container.appendChild(div);
  });
}

function renderAdminDisputes() {
  const container = document.getElementById("adminDisputes");

  container.innerHTML = "";

  const disputed = pendingMatches.filter(match => match.status === "disputed");

  if (disputed.length === 0) {
    container.innerHTML = "<p>No disputes.</p>";
    return;
  }

  disputed.forEach(match => {
    const div = document.createElement("div");

    div.innerHTML = `
      <p>
        <strong>${match.playerAName}</strong>
        ${match.scoreA} - ${match.scoreB}
        <strong>${match.playerBName}</strong>

        <br /><small>${match.date}</small>

        <br /><br />

        <strong>Reason:</strong>
        ${match.disputeReason}

        <br /><br />

        <button onclick="confirmMatch('${match.id}')">
          Admin Accept
        </button>

        <button onclick="deleteDisputedMatch('${match.id}')">
          Admin Void
        </button>
      </p>

      <hr />
    `;

    container.appendChild(div);
  });
}

function renderAll() {
  renderDropdowns();
  renderEloTable();
  renderMatchHistory();
  renderPendingMatches();
  renderPendingSignups();
  renderAdminDisputes();
}

const playerAverageInput = document.getElementById("playerAverage");
const starterDivisionSelect = document.getElementById("starterDivision");

if (playerAverageInput && starterDivisionSelect) {
  playerAverageInput.addEventListener("input", () => {
    const avg = parseFloat(playerAverageInput.value);

    if (!isNaN(avg)) {
      starterDivisionSelect.value = String(getDivisionFromAverage(avg));
    }
  });
}

const signupAverageInput = document.getElementById("signupAverage");
const signupDivisionSelect = document.getElementById("signupDivision");

if (signupAverageInput && signupDivisionSelect) {
  signupAverageInput.addEventListener("input", () => {
    const avg = parseFloat(signupAverageInput.value);

    if (!isNaN(avg)) {
      signupDivisionSelect.value = String(getDivisionFromAverage(avg));
    }
  });
}

document.getElementById("signupBtn")?.addEventListener("click", submitSignup);
document.getElementById("addPlayerBtn")?.addEventListener("click", addPlayer);
document.getElementById("submitMatchBtn")?.addEventListener("click", submitMatch);
document.getElementById("saveStatsBtn")?.addEventListener("click", saveProfileStats);

const ADMIN_PASSWORD = "TCAdmin2026";

let adminUnlocked = localStorage.getItem("tcAdminUnlocked") === "true";

function toggleAdminPanel() {
  const password = prompt("Enter admin password:");

  if (password !== ADMIN_PASSWORD) {
    alert("Incorrect password.");
    return;
  }

  adminUnlocked = true;

  localStorage.setItem("tcAdminUnlocked", "true");

  document.getElementById("adminControls").style.display = "block";

  alert("Admin panel unlocked.");

  renderAll();
}

if (adminUnlocked && document.getElementById("adminControls")) {
  document.getElementById("adminControls").style.display = "block";
}

function resetAllData() {
  localStorage.removeItem("tcPlayers");
  localStorage.removeItem("tcMatches");
  localStorage.removeItem("tcPendingMatches");
  localStorage.removeItem("tcPendingSignups");
  localStorage.removeItem("tcCurrentSeasonMonth");

  location.reload();
}

function viewPlayer(playerId) {
  const player = players.find(p => p.id === playerId);

  if (!player) return;

  const profile = document.getElementById("playerProfile");

  profile.innerHTML = `
<pre>
${player.name}

ELO: ${player.elo}

Current Division: Div ${player.currentDivision}

Played: ${player.gamesPlayed}

Wins: ${player.wins}
Draws: ${player.draws || 0}
Losses: ${player.losses}

180s: ${player.visits180 || 0}
171+: ${player.visits171 || 0}
100+ CO: ${player.checkouts100 || 0}
Bull Finishes: ${player.bullFinishes || 0}
Double Double: ${player.doubleDouble || 0}

Average: ${player.average || 0}

Archived Seasons: ${
    player.profileStats?.seasons?.length || 0
  }
</pre>`;
}

runMonthlyDivisionRollover();
renderAll();