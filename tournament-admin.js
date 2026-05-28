// public/Js/tournaments/tournament-admin.js
// TrebleChasers ODL - Tournament Admin Engine
// Admin helpers for creating Elite Cup, Challenger Cup, DC tournaments,
// Members Friday DC, Members Swiss, and custom admin knockout events.

import {
  createEliteCup,
  createChallengerCup,
  createDCTournament,
  createMembersFridayDCTournament,
  createAdminKnockout,
  getKnockoutSummary,
  KNOCKOUT_TYPES
} from "./knockout-engine.js";

import {
  createSwissTournament,
  buildSwissStandings,
  getSwissProgress,
  SWISS_CONFIG
} from "./swiss-engine.js";

export const TOURNAMENT_ADMIN_TYPES = {
  ELITE_CUP: "eliteCup",
  CHALLENGER_CUP: "challengerCup",
  DC_TOURNAMENT: "dcTournament",
  DC_MEMBERS_FRIDAY: "dcMembersFriday",
  MEMBERS_SWISS: "membersSwiss",
  ADMIN_KNOCKOUT: "adminKnockout"
};

export function generateAdminTournamentId(type, date = new Date()) {
  const safeType = String(type || "tournament")
    .replace(/[^a-zA-Z0-9]/g, "")
    .toLowerCase();

  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const h = String(date.getHours()).padStart(2, "0");
  const min = String(date.getMinutes()).padStart(2, "0");

  return `${safeType}_${y}${m}${d}_${h}${min}`;
}

export function normaliseAdminPlayer(player, index = 0) {
  return {
    id: player.id || player.uid || player.playerId || `player_${index + 1}`,
    name: player.name || player.displayName || `Player ${index + 1}`,
    division: player.division || null,
    average: Number(player.average ?? player.avg ?? player.trackedAverage ?? 0),
    elo: Number(player.elo ?? player.currentElo ?? 0),
    seed: player.seed ?? null,
    isMember:
      player.isMember === true ||
      player.member === true ||
      player.role === "member" ||
      player.role === "admin",
    role: player.role || "player",
    status: player.status || "active"
  };
}

export function filterActivePlayers(players = []) {
  return players
    .map(normaliseAdminPlayer)
    .filter((player) => String(player.status).toLowerCase() !== "inactive");
}

export function validateMinimumPlayers(players = [], minimum = 2) {
  if (!Array.isArray(players)) {
    return {
      ok: false,
      message: "Players must be an array."
    };
  }

  if (players.length < minimum) {
    return {
      ok: false,
      message: `At least ${minimum} players are required.`
    };
  }

  return {
    ok: true,
    message: ""
  };
}

export function validateTournamentCreateRequest({
  type,
  players = [],
  minimumPlayers = 2
}) {
  if (!type) {
    return {
      ok: false,
      message: "Tournament type is required."
    };
  }

  return validateMinimumPlayers(players, minimumPlayers);
}

export function createTournamentFromAdmin({
  type,
  players = [],
  name = null,
  startsAt = null,
  createdBy = "admin",
  bracketSize = null,
  metadata = {}
}) {
  const activePlayers = filterActivePlayers(players);

  const validation = validateTournamentCreateRequest({
    type,
    players: activePlayers,
    minimumPlayers: type === TOURNAMENT_ADMIN_TYPES.MEMBERS_SWISS ? 2 : 2
  });

  if (!validation.ok) {
    throw new Error(validation.message);
  }

  const tournamentId =
    metadata.tournamentId ||
    generateAdminTournamentId(type);

  const commonOptions = {
    name,
    startsAt,
    createdBy,
    metadata: {
      ...metadata,
      tournamentId,
      createdFromAdmin: true
    }
  };

  if (type === TOURNAMENT_ADMIN_TYPES.ELITE_CUP) {
    return createEliteCup(activePlayers, commonOptions);
  }

  if (type === TOURNAMENT_ADMIN_TYPES.CHALLENGER_CUP) {
    return createChallengerCup(activePlayers, commonOptions);
  }

  if (type === TOURNAMENT_ADMIN_TYPES.DC_TOURNAMENT) {
    return createDCTournament(activePlayers, commonOptions);
  }

  if (type === TOURNAMENT_ADMIN_TYPES.DC_MEMBERS_FRIDAY) {
    return createMembersFridayDCTournament(activePlayers, commonOptions);
  }

  if (type === TOURNAMENT_ADMIN_TYPES.MEMBERS_SWISS) {
    return createSwissTournament({
      tournamentId,
      name: name || SWISS_CONFIG.label,
      players: activePlayers,
      startsAt,
      createdBy,
      metadata: {
        ...metadata,
        createdFromAdmin: true
      }
    });
  }

  if (type === TOURNAMENT_ADMIN_TYPES.ADMIN_KNOCKOUT) {
    return createAdminKnockout(activePlayers, {
      ...commonOptions,
      bracketSize
    });
  }

  throw new Error(`Unknown admin tournament type: ${type}`);
}

export function createEliteCupFromAdmin(players = [], options = {}) {
  return createTournamentFromAdmin({
    type: TOURNAMENT_ADMIN_TYPES.ELITE_CUP,
    players,
    name: options.name || "Elite Cup",
    startsAt: options.startsAt || null,
    createdBy: options.createdBy || "admin",
    metadata: options.metadata || {}
  });
}

export function createChallengerCupFromAdmin(players = [], options = {}) {
  return createTournamentFromAdmin({
    type: TOURNAMENT_ADMIN_TYPES.CHALLENGER_CUP,
    players,
    name: options.name || "Challenger Cup",
    startsAt: options.startsAt || null,
    createdBy: options.createdBy || "admin",
    metadata: options.metadata || {}
  });
}

export function createDCTournamentFromAdmin(players = [], options = {}) {
  return createTournamentFromAdmin({
    type: TOURNAMENT_ADMIN_TYPES.DC_TOURNAMENT,
    players,
    name: options.name || "DC Tournament",
    startsAt: options.startsAt || null,
    createdBy: options.createdBy || "admin",
    metadata: options.metadata || {}
  });
}

export function createMembersFridayDCFromAdmin(players = [], options = {}) {
  return createTournamentFromAdmin({
    type: TOURNAMENT_ADMIN_TYPES.DC_MEMBERS_FRIDAY,
    players,
    name: options.name || "Members Friday DC Tournament",
    startsAt: options.startsAt || null,
    createdBy: options.createdBy || "admin",
    metadata: options.metadata || {}
  });
}

export function createMembersSwissFromAdmin(players = [], options = {}) {
  return createTournamentFromAdmin({
    type: TOURNAMENT_ADMIN_TYPES.MEMBERS_SWISS,
    players,
    name: options.name || "Members Swiss Cup",
    startsAt: options.startsAt || null,
    createdBy: options.createdBy || "admin",
    metadata: options.metadata || {}
  });
}

export function createCustomKnockoutFromAdmin(players = [], options = {}) {
  return createTournamentFromAdmin({
    type: TOURNAMENT_ADMIN_TYPES.ADMIN_KNOCKOUT,
    players,
    name: options.name || "Custom Knockout",
    startsAt: options.startsAt || null,
    createdBy: options.createdBy || "admin",
    bracketSize: options.bracketSize || null,
    metadata: options.metadata || {}
  });
}

export function getAdminTournamentSummary(tournament) {
  if (!tournament) {
    return null;
  }

  if (tournament.type === TOURNAMENT_ADMIN_TYPES.MEMBERS_SWISS) {
    const progress = getSwissProgress(tournament);
    const standings = buildSwissStandings(tournament);

    return {
      id: tournament.id,
      name: tournament.name,
      type: tournament.type,
      status: tournament.status,
      playerCount: tournament.players?.length || 0,
      fixtureCount: tournament.fixtures?.length || 0,
      progress,
      leader: standings[0] || null,
      startsAt: tournament.startsAt,
      createdAt: tournament.createdAt,
      updatedAt: tournament.updatedAt
    };
  }

  return getKnockoutSummary(tournament);
}

export function listAdminTournamentTypes() {
  return [
    {
      key: TOURNAMENT_ADMIN_TYPES.ELITE_CUP,
      label: "Elite Cup",
      description: "Top 32 from live ELO table. Seeded BO9 knockout."
    },
    {
      key: TOURNAMENT_ADMIN_TYPES.CHALLENGER_CUP,
      label: "Challenger Cup",
      description: "ELO ranks 33–64. Seeded BO9 knockout."
    },
    {
      key: TOURNAMENT_ADMIN_TYPES.DC_TOURNAMENT,
      label: "DC Tournament",
      description: "Open BO9 DartsCounter knockout."
    },
    {
      key: TOURNAMENT_ADMIN_TYPES.DC_MEMBERS_FRIDAY,
      label: "Members Friday DC",
      description: "Members-only Friday BO9 knockout."
    },
    {
      key: TOURNAMENT_ADMIN_TYPES.MEMBERS_SWISS,
      label: "Members Swiss Cup",
      description: "Members-only 501 First to 9 handicap Swiss."
    },
    {
      key: TOURNAMENT_ADMIN_TYPES.ADMIN_KNOCKOUT,
      label: "Custom Knockout",
      description: "Admin-created knockout with custom bracket size."
    }
  ];
}

export function prepareTournamentForFirestore(tournament) {
  return {
    ...tournament,
    savedAt: new Date().toISOString()
  };
}

export function createAdminPreview({
  type,
  players = [],
  name = null,
  startsAt = null,
  bracketSize = null
}) {
  const tournament = createTournamentFromAdmin({
    type,
    players,
    name,
    startsAt,
    bracketSize,
    createdBy: "preview",
    metadata: {
      preview: true
    }
  });

  return {
    tournament,
    summary: getAdminTournamentSummary(tournament)
  };
}