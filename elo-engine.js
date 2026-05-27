// elo-engine.js
// TrebleChasers ODL shared ELO, divisions, stats and ranking engine

export const STARTING_ELO_BY_DIVISION = {
  1: 2000,
  2: 1850,
  3: 1700,
  4: 1550,
  5: 1400,
  6: 1250,
  7: 1100,
  8: 950
};

export const DIVISION_SIZES = {
  1: 12,
  2: 16,
  3: 20,
  4: 24,
  5: 28,
  6: 32,
  7: 36,
  8: 40
};

export const PROMOTION_RELEGATION = {
  1: { promote: 0, relegate: 3 },
  2: { promote: 3, relegate: 4 },
  3: { promote: 4, relegate: 5 },
  4: { promote: 5, relegate: 6 },
  5: { promote: 6, relegate: 7 },
  6: { promote: 7, relegate: 8 },
  7: { promote: 8, relegate: 9 },
  8: { promote: 9, relegate: 0 }
};

export const MODE_MULTIPLIERS = {
  freeLeague: 1,
  freeplay: 0.75,
  tournaments: 1,
  eliteCup: 1.15,
  challengerCup: 1,
  members: 0.85,
  paidLeague: 1
};

export const STAT_MODES = [
  "freeLeague",
  "freeplay",
  "eliteCup",
  "challengerCup",
  "tournaments",
  "members",
  "paidLeague"
];

export function emptyMatchStats() {
  return {
    played: 0,
    wins: 0,
    draws: 0,
    losses: 0,
    legsFor: 0,
    legsAgainst: 0,
    visits171: 0,
    checkouts100: 0,
    bigFish: 0,
    bullFinishes: 0,
    doubleDouble: 0,
    average: 0
  };
}

export function emptyOverallSummary() {
  return {
    currentRank: 0,
    previousRank: 0,
    highestRank: 0,

    globalPoints: 0,
    seasonPoints: 0,

    combinedAverage: 0,
    totalMatches: 0,

    currentDivision: 8,
    suggestedDivision: 8,
    seasonDivisionSeed: 8,

    eliteCupEligible: false,
    challengerCupEligible: false,
    eliteCupSeed: 0,
    challengerCupSeed: 0,

    memberSwissHandicap: 0,

    lastUpdated: ""
  };
}

export function fullPlayerStats() {
  return {
    overall: emptyOverallSummary(),
    freeLeague: emptyMatchStats(),
    freeplay: emptyMatchStats(),
    eliteCup: emptyMatchStats(),
    challengerCup: emptyMatchStats(),
    tournaments: emptyMatchStats(),
    members: emptyMatchStats(),
    paidLeague: emptyMatchStats()
  };
}

export function divisionValue(raw) {
  if (!raw) return 8;

  const cleaned = String(raw)
    .toLowerCase()
    .replace("division-", "")
    .replace("division", "")
    .replace("div", "")
    .trim();

  const value = Number(cleaned);

  return Number.isFinite(value) && value >= 1 && value <= 8 ? value : 8;
}

export function getStartingEloByDivision(division) {
  const div = divisionValue(division);
  return STARTING_ELO_BY_DIVISION[div] || 950;
}

export function getDivisionFromAverage(avg) {
  const average = Number(avg);

  if (average >= 65) return 1;
  if (average >= 61) return 2;
  if (average >= 57) return 3;
  if (average >= 53) return 4;
  if (average >= 48) return 5;
  if (average >= 43) return 6;
  if (average >= 38) return 7;

  return 8;
}

export function getSuggestedDivision(rank) {
  let runningTotal = 0;

  for (let division = 1; division <= 8; division++) {
    runningTotal += DIVISION_SIZES[division];

    if (rank <= runningTotal) return division;
  }

  return 8;
}

export function getExpectedScore(playerElo, opponentElo) {
  return 1 / (1 + Math.pow(10, (Number(opponentElo) - Number(playerElo)) / 400));
}

export function getKFactor(player) {
  const games =
    Number(player?.eloGames) ||
    Number(player?.stats?.overall?.totalMatches) ||
    Number(player?.gamesPlayed) ||
    0;

  return games < 10 ? 48 : 32;
}

export function getActualResult(scoreFor, scoreAgainst) {
  const forScore = Number(scoreFor);
  const againstScore = Number(scoreAgainst);

  if (forScore > againstScore) return 1;
  if (forScore < againstScore) return 0;
  return 0.5;
}

export function calculateEloChange(
  player,
  opponent,
  scoreFor,
  scoreAgainst,
  mode = "freeLeague"
) {
  const playerElo = Number(player?.elo || player?.starterElo || 950);
  const opponentElo = Number(opponent?.elo || opponent?.starterElo || 950);

  const expected = getExpectedScore(playerElo, opponentElo);
  const actual = getActualResult(scoreFor, scoreAgainst);
  const k = getKFactor(player);
  const multiplier = MODE_MULTIPLIERS[mode] || 1;

  const eloChange = Math.round(k * multiplier * (actual - expected));

  const baseReward =
    Number(scoreFor) === Number(scoreAgainst) ? 5 :
    Number(scoreFor) > Number(scoreAgainst) ? 10 :
    0;

  return eloChange + baseReward;
}

export function updateModeStatsWithMatch(existingStats, scoreFor, scoreAgainst, bonusStats = {}) {
  const stats = {
    ...emptyMatchStats(),
    ...(existingStats || {})
  };

  const forScore = Number(scoreFor) || 0;
  const againstScore = Number(scoreAgainst) || 0;

  const draw = forScore === againstScore;
  const win = forScore > againstScore;
  const loss = forScore < againstScore;

  const previousPlayed = Number(stats.played || 0);
  const previousAverage = Number(stats.average || 0);

  stats.played += 1;
  stats.wins += win ? 1 : 0;
  stats.draws += draw ? 1 : 0;
  stats.losses += loss ? 1 : 0;
  stats.legsFor += forScore;
  stats.legsAgainst += againstScore;

  stats.visits171 += Number(bonusStats.visits171 || 0);
  stats.checkouts100 += Number(bonusStats.checkouts100 || 0);
  stats.bigFish += Number(bonusStats.bigFish || 0);
  stats.bullFinishes += Number(bonusStats.bullFinishes || 0);
  stats.doubleDouble += Number(bonusStats.doubleDouble || 0);

  if (Number(bonusStats.average) > 0) {
    const oldTotal = previousAverage * previousPlayed;
    stats.average = Number(((oldTotal + Number(bonusStats.average)) / stats.played).toFixed(2));
  }

  return stats;
}

export function calculateCombinedAverage(stats = {}) {
  const modes = STAT_MODES
    .map(mode => stats?.[mode])
    .filter(modeStats => modeStats && Number(modeStats.played || 0) > 0);

  const totalPlayed = modes.reduce((sum, modeStats) => {
    return sum + Number(modeStats.played || 0);
  }, 0);

  if (!totalPlayed) return 0;

  const weightedTotal = modes.reduce((sum, modeStats) => {
    return sum + Number(modeStats.average || 0) * Number(modeStats.played || 0);
  }, 0);

  return Number((weightedTotal / totalPlayed).toFixed(2));
}

export function calculateTotalMatches(stats = {}) {
  return STAT_MODES.reduce((sum, mode) => {
    return sum + Number(stats?.[mode]?.played || 0);
  }, 0);
}

export function calculateGlobalPoints(stats = {}, elo = 0) {
  let points = Number(elo || 0);

  STAT_MODES.forEach(mode => {
    const s = stats?.[mode] || {};
    const multiplier = MODE_MULTIPLIERS[mode] || 1;

    points += Number(s.wins || 0) * 12 * multiplier;
    points += Number(s.draws || 0) * 5 * multiplier;
    points += Number(s.legsFor || 0) * 0.5 * multiplier;
    points += Number(s.visits171 || 0) * 2;
    points += Number(s.checkouts100 || 0) * 3;
    points += Number(s.bigFish || 0) * 5;
    points += Number(s.bullFinishes || 0) * 2;
    points += Number(s.doubleDouble || 0) * 2;
  });

  return Math.round(points);
}

export function calculateMemberSwissHandicap(combinedAverage) {
  const avg = Number(combinedAverage || 0);

  if (avg >= 65) return 0;
  if (avg >= 60) return 1;
  if (avg >= 55) return 2;
  if (avg >= 50) return 3;
  if (avg >= 45) return 4;
  if (avg >= 40) return 5;
  if (avg >= 35) return 6;

  return 7;
}

export function buildOverallSummary(player, rank = 0) {
  const stats = {
    ...fullPlayerStats(),
    ...(player?.stats || {})
  };

  const currentOverall = {
    ...emptyOverallSummary(),
    ...(stats.overall || {})
  };

  const combinedAverage = calculateCombinedAverage(stats);
  const totalMatches = calculateTotalMatches(stats);
  const globalPoints = calculateGlobalPoints(stats, player?.elo || player?.starterElo || 950);
  const suggestedDivision = rank > 0 ? getSuggestedDivision(rank) : divisionValue(player?.division);

  return {
    ...currentOverall,

    previousRank: currentOverall.currentRank || 0,
    currentRank: rank || currentOverall.currentRank || 0,
    highestRank:
      currentOverall.highestRank > 0
        ? Math.min(currentOverall.highestRank, rank || currentOverall.highestRank)
        : rank || 0,

    globalPoints,
    combinedAverage,
    totalMatches,

    currentDivision: divisionValue(player?.division),
    suggestedDivision,
    seasonDivisionSeed: suggestedDivision,

    eliteCupEligible: rank > 0 && rank <= 32,
    challengerCupEligible: rank > 32 && rank <= 64,
    eliteCupSeed: rank > 0 && rank <= 32 ? rank : 0,
    challengerCupSeed: rank > 32 && rank <= 64 ? rank - 32 : 0,

    memberSwissHandicap: calculateMemberSwissHandicap(combinedAverage),

    lastUpdated: new Date().toISOString()
  };
}