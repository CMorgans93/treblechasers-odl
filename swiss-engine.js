// public/Js/tournaments/swiss-engine.js
// TrebleChasers ODL - Members Swiss Engine
// Handles Swiss handicap, eligible members, fixtures, standings and result scoring.

export const SWISS_CONFIG = {
  key: "membersSwiss",
  label: "Members Swiss Cup",
  membersOnly: true,
  gameType: "501",
  lengthMode: "firstTo",
  target: 9,
  playsEachOpponent: 2,
  pointsPerLeg: 3,
  affectsElo: true,
  affectsTournamentLeaderboard: true,
  affectsProfiles: true,
  affectsCareerStats: true
};

export const SWISS_HANDICAP_BANDS = [
  { minAvg: 65, maxAvg: null, handicap: 0 },
  { minAvg: 57, maxAvg: 64.99, handicap: 2 },
  { minAvg: 48, maxAvg: 56.99, handicap: 4 },
  { minAvg: 38, maxAvg: 47.99, handicap: 5 },
  { minAvg: 31, maxAvg: 37.99, handicap: 6 },
  { minAvg: 0, maxAvg: 30.99, handicap: 7 }
];

export function normaliseSwissPlayer(player, index = 0) {
  return {
    id: player.id || player.uid || player.playerId || `player_${index + 1}`,
    name: player.name || player.displayName || `Player ${index + 1}`,
    division: player.division || null,
    average: Number(player.average ?? player.avg ?? player.trackedAverage ?? 0),
    elo: Number(player.elo ?? player.currentElo ?? 0),
    isMember:
      player.isMember === true ||
      player.member === true ||
      player.role === "member" ||
      player.role === "admin",
    role: player.role || "player"
  };
}

export function getSwissHandicapFromAverage(avg) {
  const n = Number(avg);

  if (!Number.isFinite(n)) {
    return 7;
  }

  const band = SWISS_HANDICAP_BANDS.find((b) => {
    const aboveMin = n >= b.minAvg;
    const belowMax = b.maxAvg === null || n <= b.maxAvg;
    return aboveMin && belowMax;
  });

  return band ? band.handicap : 7;
}

export function getSwissPlayerHandicap(player) {
  return getSwissHandicapFromAverage(player.average);
}

export function getSwissStartingScore(playerA, playerB) {
  const aHandicap = getSwissPlayerHandicap(playerA);
  const bHandicap = getSwissPlayerHandicap(playerB);

  const difference = Math.abs(aHandicap - bHandicap);

  if (aHandicap === bHandicap) {
    return {
      playerAStart: 0,
      playerBStart: 0,
      playerAHandicap: aHandicap,
      playerBHandicap: bHandicap,
      difference: 0
    };
  }

  return {
    playerAStart: aHandicap > bHandicap ? difference : 0,
    playerBStart: bHandicap > aHandicap ? difference : 0,
    playerAHandicap: aHandicap,
    playerBHandicap: bHandicap,
    difference
  };
}

export function filterSwissMembers(players = []) {
  return players
    .map(normaliseSwissPlayer)
    .filter((player) => player.isMember === true);
}

export function sortSwissPlayers(players = []) {
  return [...players].sort((a, b) => {
    const eloA = Number(a.elo ?? 0);
    const eloB = Number(b.elo ?? 0);

    if (eloB !== eloA) return eloB - eloA;

    const avgA = Number(a.average ?? 0);
    const avgB = Number(b.average ?? 0);

    if (avgB !== avgA) return avgB - avgA;

    return a.name.localeCompare(b.name);
  });
}

export function generateSwissFixtureId(tournamentId, playerAId, playerBId, repeatNumber) {
  const ids = [playerAId, playerBId].sort();
  return `${tournamentId}_${ids[0]}_v_${ids[1]}_${repeatNumber}`;
}

export function createSwissFixture({
  tournamentId,
  playerA,
  playerB,
  repeatNumber = 1
}) {
  const handicap = getSwissStartingScore(playerA, playerB);

  return {
    id: generateSwissFixtureId(tournamentId, playerA.id, playerB.id, repeatNumber),
    tournamentId,
    type: SWISS_CONFIG.key,
    round: null,
    repeatNumber,

    playerA,
    playerB,

    playerAHandicap: handicap.playerAHandicap,
    playerBHandicap: handicap.playerBHandicap,
    playerAStart: handicap.playerAStart,
    playerBStart: handicap.playerBStart,
    handicapDifference: handicap.difference,

    gameType: SWISS_CONFIG.gameType,
    lengthMode: SWISS_CONFIG.lengthMode,
    target: SWISS_CONFIG.target,

    playerALegs: null,
    playerBLegs: null,
    playerAPoints: 0,
    playerBPoints: 0,

    winnerId: null,
    loserId: null,
    status: "pending",
    submittedResultId: null,
    confirmedAt: null,
    createdAt: new Date().toISOString()
  };
}

export function createSwissFixtures(tournamentId, players = []) {
  const members = sortSwissPlayers(filterSwissMembers(players));
  const fixtures = [];

  for (let i = 0; i < members.length; i++) {
    for (let j = i + 1; j < members.length; j++) {
      for (let repeat = 1; repeat <= SWISS_CONFIG.playsEachOpponent; repeat++) {
        fixtures.push(
          createSwissFixture({
            tournamentId,
            playerA: members[i],
            playerB: members[j],
            repeatNumber: repeat
          })
        );
      }
    }
  }

  return fixtures;
}

export function createSwissTournament({
  tournamentId,
  name = SWISS_CONFIG.label,
  players = [],
  createdBy = "system",
  startsAt = null,
  metadata = {}
}) {
  if (!tournamentId) {
    throw new Error("tournamentId is required.");
  }

  const members = sortSwissPlayers(filterSwissMembers(players));
  const fixtures = createSwissFixtures(tournamentId, members);

  return {
    id: tournamentId,
    name,
    type: SWISS_CONFIG.key,
    status: "live",
    config: SWISS_CONFIG,
    players: members.map((player) => ({
      ...player,
      swissHandicap: getSwissPlayerHandicap(player)
    })),
    fixtures,
    createdBy,
    startsAt,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    completedAt: null,
    metadata
  };
}

export function validateSwissScore(playerALegs, playerBLegs) {
  const a = Number(playerALegs);
  const b = Number(playerBLegs);

  if (!Number.isFinite(a) || !Number.isFinite(b)) {
    return {
      ok: false,
      message: "Both leg scores are required."
    };
  }

  if (a < 0 || b < 0) {
    return {
      ok: false,
      message: "Leg scores cannot be negative."
    };
  }

  if (a === b) {
    return {
      ok: false,
      message: "First to 9 cannot end in a draw."
    };
  }

  if (a !== SWISS_CONFIG.target && b !== SWISS_CONFIG.target) {
    return {
      ok: false,
      message: "One player must reach 9 legs."
    };
  }

  if (a > SWISS_CONFIG.target || b > SWISS_CONFIG.target) {
    return {
      ok: false,
      message: "No player can score more than 9 legs."
    };
  }

  return {
    ok: true,
    message: ""
  };
}

export function calculateSwissPoints(legsWon) {
  return Number(legsWon || 0) * SWISS_CONFIG.pointsPerLeg;
}

export function confirmSwissFixtureResult(tournament, {
  fixtureId,
  playerALegs,
  playerBLegs,
  submittedResultId = null,
  confirmedAt = new Date().toISOString()
}) {
  const validation = validateSwissScore(playerALegs, playerBLegs);

  if (!validation.ok) {
    throw new Error(validation.message);
  }

  const updated = structuredCloneSafe(tournament);
  const fixture = updated.fixtures.find((f) => f.id === fixtureId);

  if (!fixture) {
    throw new Error("Swiss fixture not found.");
  }

  if (fixture.status === "complete") {
    throw new Error("Swiss fixture is already complete.");
  }

  const a = Number(playerALegs);
  const b = Number(playerBLegs);

  const winnerId = a > b ? fixture.playerA.id : fixture.playerB.id;
  const loserId = a > b ? fixture.playerB.id : fixture.playerA.id;

  fixture.playerALegs = a;
  fixture.playerBLegs = b;
  fixture.playerAPoints = calculateSwissPoints(a);
  fixture.playerBPoints = calculateSwissPoints(b);
  fixture.winnerId = winnerId;
  fixture.loserId = loserId;
  fixture.status = "complete";
  fixture.submittedResultId = submittedResultId;
  fixture.confirmedAt = confirmedAt;

  updated.updatedAt = new Date().toISOString();

  return updated;
}

export function buildSwissStandings(tournament) {
  const rows = new Map();

  tournament.players.forEach((player) => {
    rows.set(player.id, {
      id: player.id,
      name: player.name,
      division: player.division,
      average: player.average,
      elo: player.elo,
      handicap: getSwissPlayerHandicap(player),

      played: 0,
      wins: 0,
      losses: 0,
      legsFor: 0,
      legsAgainst: 0,
      legDiff: 0,
      points: 0,

      remaining: 0,
      completedOpponents: [],
      remainingOpponents: []
    });
  });

  tournament.fixtures.forEach((fixture) => {
    const aRow = rows.get(fixture.playerA.id);
    const bRow = rows.get(fixture.playerB.id);

    if (!aRow || !bRow) return;

    if (fixture.status === "complete") {
      const aLegs = Number(fixture.playerALegs || 0);
      const bLegs = Number(fixture.playerBLegs || 0);

      aRow.played += 1;
      bRow.played += 1;

      aRow.legsFor += aLegs;
      aRow.legsAgainst += bLegs;
      bRow.legsFor += bLegs;
      bRow.legsAgainst += aLegs;

      aRow.points += calculateSwissPoints(aLegs);
      bRow.points += calculateSwissPoints(bLegs);

      if (fixture.winnerId === aRow.id) {
        aRow.wins += 1;
        bRow.losses += 1;
      } else {
        bRow.wins += 1;
        aRow.losses += 1;
      }

      aRow.completedOpponents.push(fixture.playerB.name);
      bRow.completedOpponents.push(fixture.playerA.name);
    } else {
      aRow.remaining += 1;
      bRow.remaining += 1;

      aRow.remainingOpponents.push(fixture.playerB.name);
      bRow.remainingOpponents.push(fixture.playerA.name);
    }
  });

  const table = Array.from(rows.values()).map((row) => ({
    ...row,
    legDiff: row.legsFor - row.legsAgainst
  }));

  table.sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.wins !== a.wins) return b.wins - a.wins;
    if (b.legDiff !== a.legDiff) return b.legDiff - a.legDiff;
    if (b.legsFor !== a.legsFor) return b.legsFor - a.legsFor;
    return a.name.localeCompare(b.name);
  });

  return table.map((row, index) => ({
    rank: index + 1,
    ...row
  }));
}

export function getSwissPlayerFixtures(tournament, playerId) {
  return tournament.fixtures.filter(
    (fixture) =>
      fixture.playerA.id === playerId ||
      fixture.playerB.id === playerId
  );
}

export function getSwissRemainingFixtures(tournament, playerId) {
  return getSwissPlayerFixtures(tournament, playerId).filter(
    (fixture) => fixture.status !== "complete"
  );
}

export function getSwissCompletedFixtures(tournament, playerId) {
  return getSwissPlayerFixtures(tournament, playerId).filter(
    (fixture) => fixture.status === "complete"
  );
}

export function getSwissProgress(tournament) {
  const total = tournament.fixtures.length;
  const completed = tournament.fixtures.filter(
    (fixture) => fixture.status === "complete"
  ).length;

  return {
    totalFixtures: total,
    completedFixtures: completed,
    remainingFixtures: total - completed,
    percentComplete: total === 0 ? 0 : Math.round((completed / total) * 100)
  };
}

export function structuredCloneSafe(value) {
  if (typeof structuredClone === "function") {
    return structuredClone(value);
  }

  return JSON.parse(JSON.stringify(value));
}