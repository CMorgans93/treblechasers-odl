const STARTING_ELO_BY_DIVISION = {
  1: 2000,
  2: 1850,
  3: 1700,
  4: 1550,
  5: 1400,
  6: 1250,
  7: 1100,
  8: 950,
  9: 800,
  10: 650
};

function getExpectedScore(playerElo, opponentElo) {
  return 1 / (1 + Math.pow(10, (opponentElo - playerElo) / 400));
}

function getKFactor(player) {
  return player.eloGames < 10 ? 48 : 32;
}

function getActualResult(scoreFor, scoreAgainst) {
  if (scoreFor > scoreAgainst) return 1;
  if (scoreFor < scoreAgainst) return 0;
  return 0.5;
}

function calculateEloChange(player, opponent, scoreFor, scoreAgainst, modeMultiplier) {
  const expected = getExpectedScore(player.elo, opponent.elo);
  const actual = getActualResult(scoreFor, scoreAgainst);
  const k = getKFactor(player);

  return Math.round(k * modeMultiplier * (actual - expected));
}