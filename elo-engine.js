// elo-engine.js
// TrebleChasers ODL shared ELO, division and stats engine

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

export function emptyStats() {
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

export function fullPlayerStats() {
  return {
    overall: emptyStats(),
    freeLeague: emptyStats(),
    freeplay: emptyStats(),
    eliteCup: emptyStats(),
    challengerCup: emptyStats(),
    tournaments: emptyStats(),
    members: emptyStats(),
    paidLeague: emptyStats()
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

  return Number.isFinite(value) && value >= 1 && value <= 8
    ? value
    : 8;
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

    if (rank <= runningTotal) {
      return division;
    }
  }

  return 8;
}

export function getExpectedScore(playerElo, opponentElo) {
  return 1 / (1 + Math.pow(10, (Number(opponentElo) - Number(playerElo)) / 400));
}

export function getKFactor(player) {
  const games =
    Number(player?.eloGames) ||
    Number(player?.gamesPlayed) ||
    Number(player?.stats?.overall?.played) ||
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

export function updateStatsWithMatch(existingStats, scoreFor, scoreAgainst, bonusStats = {}) {
  const stats = {
    ...emptyStats(),
    ...(existingStats || {})
  };

  const forScore = Number(scoreFor) || 0;
  const againstScore = Number(scoreAgainst) || 0;
  const draw = forScore === againstScore;
  const win = forScore > againstScore;
  const loss = forScore < againstScore;

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
    const oldTotal = Number(stats.average || 0) * Math.max(stats.played - 1, 0);
    stats.average = Number(((oldTotal + Number(bonusStats.average)) / stats.played).toFixed(2));
  }

  return stats;
}