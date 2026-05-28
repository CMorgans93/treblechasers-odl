// public/Js/tournaments/bracket-engine.js
// TrebleChasers ODL - Bracket Engine
// Handles knockout bracket creation, byes, rounds, match progression and winner advancement.

export const BRACKET_STATUS = {
  DRAFT: "draft",
  OPEN: "open",
  LOCKED: "locked",
  LIVE: "live",
  COMPLETE: "complete",
  CANCELLED: "cancelled"
};

export const ROUND_NAMES = {
  2: "Final",
  4: "Semi Final",
  8: "Quarter Final",
  16: "Last 16",
  32: "Last 32",
  64: "Last 64",
  128: "Last 128"
};

export function getBracketSize(playerCount) {
  if (playerCount <= 2) return 2;
  if (playerCount <= 4) return 4;
  if (playerCount <= 8) return 8;
  if (playerCount <= 16) return 16;
  if (playerCount <= 32) return 32;
  if (playerCount <= 64) return 64;
  if (playerCount <= 128) return 128;

  throw new Error("Maximum supported bracket size is 128 players.");
}

export function shufflePlayers(players = []) {
  const copy = [...players];

  for (let i = copy.length - 1; i > 0; i--) {
    const randomIndex = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[randomIndex]] = [copy[randomIndex], copy[i]];
  }

  return copy;
}

export function sortPlayersBySeed(players = []) {
  return [...players].sort((a, b) => {
    const seedA = Number(a.seed ?? 9999);
    const seedB = Number(b.seed ?? 9999);

    if (seedA !== seedB) return seedA - seedB;

    const eloA = Number(a.elo ?? 0);
    const eloB = Number(b.elo ?? 0);

    return eloB - eloA;
  });
}

export function normalisePlayer(player, index = 0) {
  return {
    id: player.id || player.playerId || `player_${index + 1}`,
    name: player.name || player.displayName || `Player ${index + 1}`,
    division: player.division || null,
    average: Number(player.average ?? player.avg ?? 0),
    elo: Number(player.elo ?? 0),
    seed: player.seed ?? null,
    isBye: Boolean(player.isBye)
  };
}

export function createBye(slotNumber) {
  return {
    id: `bye_${slotNumber}`,
    name: "BYE",
    division: null,
    average: 0,
    elo: 0,
    seed: null,
    isBye: true
  };
}

export function buildSeedOrder(size) {
  if (size < 2 || size % 2 !== 0) {
    throw new Error("Bracket size must be an even number.");
  }

  let order = [1, 2];

  while (order.length < size) {
    const nextSize = order.length * 2;
    const nextOrder = [];

    order.forEach((seed) => {
      nextOrder.push(seed);
      nextOrder.push(nextSize + 1 - seed);
    });

    order = nextOrder;
  }

  return order;
}

export function applySeedingSlots(players, bracketSize) {
  const seedOrder = buildSeedOrder(bracketSize);
  const sorted = sortPlayersBySeed(players);

  const slots = Array(bracketSize).fill(null);

  sorted.forEach((player, index) => {
    const slotSeed = seedOrder[index];
    const slotIndex = slotSeed - 1;

    slots[slotIndex] = {
      ...player,
      seed: index + 1
    };
  });

  return slots.map((slot, index) => slot || createBye(index + 1));
}

export function applyRandomSlots(players, bracketSize) {
  const shuffled = shufflePlayers(players);
  const slots = Array(bracketSize).fill(null);

  shuffled.forEach((player, index) => {
    slots[index] = player;
  });

  return slots.map((slot, index) => slot || createBye(index + 1));
}

export function getRoundName(playersRemaining) {
  return ROUND_NAMES[playersRemaining] || `Round of ${playersRemaining}`;
}

export function createMatch({
  tournamentId,
  roundNumber,
  matchNumber,
  playerA = null,
  playerB = null,
  sourceA = null,
  sourceB = null
}) {
  const playersRemaining = Math.pow(2, roundNumber);
  const roundName = getRoundName(playersRemaining);

  const playerAIsBye = playerA?.isBye === true;
  const playerBIsBye = playerB?.isBye === true;

  let status = "pending";
  let winner = null;

  if (playerA && playerB) {
    if (playerAIsBye && !playerBIsBye) {
      status = "complete";
      winner = playerB;
    }

    if (playerBIsBye && !playerAIsBye) {
      status = "complete";
      winner = playerA;
    }

    if (playerAIsBye && playerBIsBye) {
      status = "complete";
      winner = null;
    }

    if (!playerAIsBye && !playerBIsBye) {
      status = "ready";
    }
  }

  return {
    id: `${tournamentId}_r${roundNumber}_m${matchNumber}`,
    tournamentId,
    roundNumber,
    roundName,
    matchNumber,
    playerA,
    playerB,
    sourceA,
    sourceB,
    winner,
    loser: null,
    scoreA: null,
    scoreB: null,
    status,
    submittedResultId: null,
    confirmedAt: null,
    createdAt: new Date().toISOString()
  };
}

export function createInitialRound(tournamentId, slots = []) {
  const roundNumber = Math.log2(slots.length);
  const matches = [];

  for (let i = 0; i < slots.length; i += 2) {
    matches.push(
      createMatch({
        tournamentId,
        roundNumber,
        matchNumber: matches.length + 1,
        playerA: slots[i],
        playerB: slots[i + 1]
      })
    );
  }

  return matches;
}

export function createEmptyNextRound(tournamentId, previousRoundNumber) {
  const roundNumber = previousRoundNumber - 1;
  const matchCount = Math.pow(2, roundNumber - 1);
  const matches = [];

  for (let i = 0; i < matchCount; i++) {
    const sourceMatchA = i * 2 + 1;
    const sourceMatchB = i * 2 + 2;

    matches.push(
      createMatch({
        tournamentId,
        roundNumber,
        matchNumber: i + 1,
        sourceA: `winner_r${previousRoundNumber}_m${sourceMatchA}`,
        sourceB: `winner_r${previousRoundNumber}_m${sourceMatchB}`
      })
    );
  }

  return matches;
}

export function createAllRounds(tournamentId, slots = []) {
  const firstRoundNumber = Math.log2(slots.length);
  const rounds = [];

  rounds.push({
    roundNumber: firstRoundNumber,
    roundName: getRoundName(slots.length),
    matches: createInitialRound(tournamentId, slots)
  });

  for (let round = firstRoundNumber - 1; round >= 1; round--) {
    rounds.push({
      roundNumber: round,
      roundName: getRoundName(Math.pow(2, round)),
      matches: createEmptyNextRound(tournamentId, round + 1)
    });
  }

  return rounds;
}

export function autoAdvanceByes(rounds = []) {
  const updatedRounds = structuredCloneSafe(rounds);

  for (let r = 0; r < updatedRounds.length - 1; r++) {
    const currentRound = updatedRounds[r];

    currentRound.matches.forEach((match) => {
      if (match.status === "complete" && match.winner) {
        advanceWinner(updatedRounds, match.id, match.winner, {
          autoAdvance: true
        });
      }
    });
  }

  return updatedRounds;
}

export function createKnockoutBracket({
  tournamentId,
  name = "Tournament",
  players = [],
  mode = "random",
  bracketSize = null,
  format = "BO9",
  startsAt = null,
  createdBy = "system",
  metadata = {}
}) {
  if (!tournamentId) {
    throw new Error("tournamentId is required.");
  }

  const normalisedPlayers = players.map(normalisePlayer);
  const size = bracketSize || getBracketSize(normalisedPlayers.length);

  if (normalisedPlayers.length > size) {
    throw new Error(`Too many players for a ${size}-player bracket.`);
  }

  const slots =
    mode === "seeded"
      ? applySeedingSlots(normalisedPlayers, size)
      : applyRandomSlots(normalisedPlayers, size);

  const rounds = autoAdvanceByes(createAllRounds(tournamentId, slots));

  return {
    id: tournamentId,
    name,
    type: "knockout",
    status: BRACKET_STATUS.LIVE,
    format,
    bracketSize: size,
    playerCount: normalisedPlayers.length,
    mode,
    startsAt,
    createdBy,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    completedAt: null,
    champion: null,
    players: normalisedPlayers,
    slots,
    rounds,
    metadata
  };
}

export function structuredCloneSafe(value) {
  if (typeof structuredClone === "function") {
    return structuredClone(value);
  }

  return JSON.parse(JSON.stringify(value));
}

export function findMatchById(rounds = [], matchId) {
  for (const round of rounds) {
    const match = round.matches.find((m) => m.id === matchId);

    if (match) {
      return match;
    }
  }

  return null;
}

export function getNextMatchPosition(match) {
  const nextRoundNumber = match.roundNumber - 1;

  if (nextRoundNumber < 1) {
    return null;
  }

  const nextMatchNumber = Math.ceil(match.matchNumber / 2);
  const slot = match.matchNumber % 2 === 1 ? "playerA" : "playerB";

  return {
    nextRoundNumber,
    nextMatchNumber,
    slot
  };
}

export function advanceWinner(rounds = [], matchId, winner, options = {}) {
  const match = findMatchById(rounds, matchId);

  if (!match || !winner) {
    return rounds;
  }

  const nextPosition = getNextMatchPosition(match);

  if (!nextPosition) {
    return rounds;
  }

  const nextRound = rounds.find(
    (round) => round.roundNumber === nextPosition.nextRoundNumber
  );

  if (!nextRound) {
    return rounds;
  }

  const nextMatch = nextRound.matches.find(
    (m) => m.matchNumber === nextPosition.nextMatchNumber
  );

  if (!nextMatch) {
    return rounds;
  }

  nextMatch[nextPosition.slot] = winner;

  if (nextMatch.playerA && nextMatch.playerB) {
    const playerAIsBye = nextMatch.playerA?.isBye === true;
    const playerBIsBye = nextMatch.playerB?.isBye === true;

    if (!playerAIsBye && !playerBIsBye) {
      nextMatch.status = "ready";
    }

    if (playerAIsBye && !playerBIsBye) {
      nextMatch.status = "complete";
      nextMatch.winner = nextMatch.playerB;
      advanceWinner(rounds, nextMatch.id, nextMatch.playerB, options);
    }

    if (playerBIsBye && !playerAIsBye) {
      nextMatch.status = "complete";
      nextMatch.winner = nextMatch.playerA;
      advanceWinner(rounds, nextMatch.id, nextMatch.playerA, options);
    }
  }

  if (options.autoAdvance) {
    nextMatch.updatedBy = "system";
  }

  return rounds;
}

export function confirmMatchResult(bracket, {
  matchId,
  winnerId,
  scoreA,
  scoreB,
  submittedResultId = null,
  confirmedAt = new Date().toISOString()
}) {
  const updatedBracket = structuredCloneSafe(bracket);
  const match = findMatchById(updatedBracket.rounds, matchId);

  if (!match) {
    throw new Error("Match not found.");
  }

  if (!match.playerA || !match.playerB) {
    throw new Error("Match does not have both players yet.");
  }

  const playerA = match.playerA;
  const playerB = match.playerB;

  let winner = null;
  let loser = null;

  if (playerA.id === winnerId) {
    winner = playerA;
    loser = playerB;
  }

  if (playerB.id === winnerId) {
    winner = playerB;
    loser = playerA;
  }

  if (!winner) {
    throw new Error("winnerId does not match this match.");
  }

  match.winner = winner;
  match.loser = loser;
  match.scoreA = Number(scoreA);
  match.scoreB = Number(scoreB);
  match.status = "complete";
  match.submittedResultId = submittedResultId;
  match.confirmedAt = confirmedAt;

  advanceWinner(updatedBracket.rounds, matchId, winner);

  const finalMatch = getFinalMatch(updatedBracket.rounds);

  if (finalMatch?.status === "complete" && finalMatch.winner) {
    updatedBracket.status = BRACKET_STATUS.COMPLETE;
    updatedBracket.champion = finalMatch.winner;
    updatedBracket.completedAt = confirmedAt;
  }

  updatedBracket.updatedAt = new Date().toISOString();

  return updatedBracket;
}

export function getFinalMatch(rounds = []) {
  const finalRound = rounds.find((round) => round.roundNumber === 1);

  if (!finalRound) {
    return null;
  }

  return finalRound.matches[0] || null;
}

export function getReadyMatches(bracket) {
  return bracket.rounds
    .flatMap((round) => round.matches)
    .filter((match) => match.status === "ready");
}

export function getCompletedMatches(bracket) {
  return bracket.rounds
    .flatMap((round) => round.matches)
    .filter((match) => match.status === "complete");
}

export function getBracketProgress(bracket) {
  const allMatches = bracket.rounds.flatMap((round) => round.matches);
  const playableMatches = allMatches.filter(
    (match) =>
      match.playerA &&
      match.playerB &&
      match.playerA.isBye !== true &&
      match.playerB.isBye !== true
  );

  const completedPlayableMatches = playableMatches.filter(
    (match) => match.status === "complete"
  );

  return {
    totalMatches: playableMatches.length,
    completedMatches: completedPlayableMatches.length,
    remainingMatches: playableMatches.length - completedPlayableMatches.length,
    percentComplete:
      playableMatches.length === 0
        ? 0
        : Math.round((completedPlayableMatches.length / playableMatches.length) * 100)
  };
}

export function flattenBracketMatches(bracket) {
  return bracket.rounds.flatMap((round) =>
    round.matches.map((match) => ({
      ...match,
      bracketId: bracket.id,
      tournamentName: bracket.name
    }))
  );
}