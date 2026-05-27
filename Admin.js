// public/Js/admin.js
// TrebleChasers ODL Admin Engine

import {
  auth,
  db,
  onAuthStateChanged,
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  deleteDoc,
  serverTimestamp
} from "../firebase-init.js";

import {
  STARTING_ELO_BY_DIVISION,
  divisionValue
} from "../elo-engine.js";

const playersTableBody = document.getElementById("playersTableBody");
const playerSearch = document.getElementById("playerSearch");

const totalPlayers = document.getElementById("totalPlayers");
const totalMembers = document.getElementById("totalMembers");
const inactivePlayers = document.getElementById("inactivePlayers");

const pendingDisputesBox = document.getElementById("pendingDisputes");
const pendingResultsBox = document.getElementById("pendingResults");
const adminNote = document.getElementById("adminNote");

let allPlayers = [];

function note(msg = "") {
  if (adminNote) adminNote.textContent = msg;
}

function isAdmin(data) {
  return data?.role === "admin" || data?.isAdmin === true;
}

function isMember(data) {
  return data?.isMember === true || data?.member === true || data?.membershipActive === true;
}

function parseDate(v) {
  if (!v) return null;
  if (typeof v.toDate === "function") return v.toDate();
  if (typeof v.seconds === "number") return new Date(v.seconds * 1000);
  if (v instanceof Date) return v;

  const d = new Date(v);
  return Number.isFinite(d.getTime()) ? d : null;
}

function daysSince(v) {
  const d = parseDate(v);
  if (!d) return 9999;
  return Math.floor((Date.now() - d.getTime()) / 86400000);
}

function formatDate(v) {
  const d = parseDate(v);
  if (!d) return "Never";

  return d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  });
}

function playerName(player) {
  return player.leagueDisplayName || player.displayName || player.name || player.email || "Unnamed";
}

function playerDc(player) {
  return player.dartCounterUsername || player.dcUsername || player.discord || "No DC username";
}

function getStarterElo(division) {
  return STARTING_ELO_BY_DIVISION[Number(division)] || 950;
}

function makeDivisionSelect(player) {
  const select = document.createElement("select");
  select.style.minWidth = "130px";

  const empty = document.createElement("option");
  empty.value = "";
  empty.textContent = "Unallocated";
  select.appendChild(empty);

  const current = divisionValue(player.division);

  for (let i = 1; i <= 8; i++) {
    const opt = document.createElement("option");
    opt.value = String(i);
    opt.textContent = `Division ${i}`;

    if (Number(current) === i) {
      opt.selected = true;
    }

    select.appendChild(opt);
  }

  select.onchange = async () => {
    const div = Number(select.value);
    const starterElo = getStarterElo(div);

    await setDoc(doc(db, "users", player.uid), {
      division: div || "",
      starterDivision: div || "",
      starterElo,
      elo: player.elo || starterElo,
      updatedAt: serverTimestamp()
    }, { merge: true });

    await setDoc(doc(db, "playerProfiles", player.uid), {
      division: div || "",
      starterDivision: div || "",
      starterElo,
      elo: player.elo || starterElo,
      updatedAt: serverTimestamp()
    }, { merge: true });

    note(`${playerName(player)} moved to Division ${div || "Unallocated"}.`);
    await loadPlayers();
  };

  return select;
}

function makeMemberInput(player) {
  const input = document.createElement("input");
  input.type = "date";
  input.style.minWidth = "145px";

  const end =
    parseDate(player.membershipEnd) ||
    parseDate(player.memberUntil) ||
    parseDate(player.membershipExpiresAt);

  if (end) input.value = end.toISOString().slice(0, 10);

  input.onchange = async () => {
    const dateValue = input.value;
    const active = dateValue && new Date(dateValue).getTime() > Date.now();

    await setDoc(doc(db, "users", player.uid), {
      membershipEnd: dateValue || "",
      memberUntil: dateValue || "",
      membershipExpiresAt: dateValue || "",
      isMember: !!active,
      member: !!active,
      membershipActive: !!active,
      updatedAt: serverTimestamp()
    }, { merge: true });

    await setDoc(doc(db, "playerProfiles", player.uid), {
      membershipEnd: dateValue || "",
      memberUntil: dateValue || "",
      membershipExpiresAt: dateValue || "",
      isMember: !!active,
      member: !!active,
      membershipActive: !!active,
      updatedAt: serverTimestamp()
    }, { merge: true });

    note(`${playerName(player)} membership updated.`);
    await loadPlayers();
  };

  return input;
}

function renderOverview() {
  if (totalPlayers) totalPlayers.textContent = allPlayers.length;
  if (totalMembers) totalMembers.textContent = allPlayers.filter(isMember).length;
  if (inactivePlayers) inactivePlayers.textContent = allPlayers.filter(p => p.hidden || p.inactive).length;
}

function renderPlayers() {
  if (!playersTableBody) return;

  const search = (playerSearch?.value || "").toLowerCase().trim();

  const filtered = allPlayers.filter(player => {
    const text = [
      player.displayName,
      player.leagueDisplayName,
      player.name,
      player.email,
      player.dartCounterUsername,
      player.dcUsername
    ].join(" ").toLowerCase();

    return !search || text.includes(search);
  });

  playersTableBody.innerHTML = "";

  if (!filtered.length) {
    playersTableBody.innerHTML = `
      <tr>
        <td colspan="7">
          <div style="padding:28px;text-align:center;opacity:.75;">
            No players found.
          </div>
        </td>
      </tr>
    `;
    return;
  }

  filtered.forEach(player => {
    const tr = document.createElement("tr");

    const name = playerName(player);
    const dcUser = playerDc(player);
    const dcAvg = player.dartCounterAverage ?? player.average ?? "—";

    const statusText = player.approved && player.canPlay ? "Approved" : "Pending";
    const inactive = player.hidden || player.inactive;

    const statusColour = inactive
      ? "#ff9f9f"
      : player.approved
        ? "#7dff9e"
        : "#f5c96a";

    tr.innerHTML = `
      <td>
        <strong>${name}</strong><br>
        <small style="opacity:.7;">${player.email || ""}</small><br>
        <small style="opacity:.85;">DC: ${dcUser} • Avg: ${dcAvg}</small><br>
        <small style="opacity:.85;">Rank: #${player.currentRank || "—"} • GP: ${player.globalPoints || 0}</small><br>
        <a href="./profile.html?uid=${player.uid}" style="color:#f5c96a;font-size:.8rem;">
          View Profile
        </a>
      </td>

      <td class="division-cell"></td>

      <td>
        <strong>${player.elo || player.starterElo || getStarterElo(player.division)}</strong><br>
        <small style="opacity:.7;">Start: ${player.starterElo || getStarterElo(player.division)}</small>
      </td>

      <td class="member-cell"></td>

      <td>
        <span style="color:${statusColour};font-weight:800;">
          ${inactive ? "Hidden" : statusText}
        </span>
        ${isAdmin(player) ? `<br><small style="color:#f5c96a;">Admin</small>` : ""}
      </td>

      <td>${formatDate(player.lastActive || player.updatedAt || player.createdAt)}</td>

      <td class="actions-cell"></td>
    `;

    tr.querySelector(".division-cell").appendChild(makeDivisionSelect(player));
    tr.querySelector(".member-cell").appendChild(makeMemberInput(player));

    const actionsCell = tr.querySelector(".actions-cell");

    const approveBtn = document.createElement("button");
    approveBtn.textContent = player.approved && player.canPlay ? "Approved" : "Approve";
    approveBtn.style.marginRight = "6px";
    approveBtn.disabled = player.approved && player.canPlay;

    approveBtn.onclick = async () => {
      const div = Number(divisionValue(player.division)) || 8;
      const starterElo = player.starterElo || getStarterElo(div);

      await setDoc(doc(db, "users", player.uid), {
        approved: true,
        canPlay: true,
        status: "approved",
        division: div,
        starterDivision: div,
        starterElo,
        elo: player.elo || starterElo,
        approvedAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      }, { merge: true });

      await setDoc(doc(db, "playerProfiles", player.uid), {
        approved: true,
        canPlay: true,
        status: "approved",
        division: div,
        starterDivision: div,
        starterElo,
        elo: player.elo || starterElo,
        updatedAt: serverTimestamp()
      }, { merge: true });

      note(`${name} approved.`);
      await loadPlayers();
    };

    const hideBtn = document.createElement("button");
    hideBtn.textContent = player.hidden ? "Restore" : "Hide";
    hideBtn.style.marginRight = "6px";

    hideBtn.onclick = async () => {
      const hidden = !player.hidden;

      await setDoc(doc(db, "users", player.uid), {
        hidden,
        inactive: hidden,
        hiddenReason: hidden ? "Manually hidden by admin" : "",
        hiddenAt: hidden ? serverTimestamp() : "",
        updatedAt: serverTimestamp()
      }, { merge: true });

      await setDoc(doc(db, "playerProfiles", player.uid), {
        hidden,
        inactive: hidden,
        hiddenReason: hidden ? "Manually hidden by admin" : "",
        updatedAt: serverTimestamp()
      }, { merge: true });

      note(hidden ? `${name} hidden.` : `${name} restored.`);
      await loadPlayers();
    };

    const adminRoleBtn = document.createElement("button");
    adminRoleBtn.textContent = isAdmin(player) ? "Remove Admin" : "Make Admin";
    adminRoleBtn.style.marginRight = "6px";

    adminRoleBtn.onclick = async () => {
      const makeAdmin = !isAdmin(player);

      await setDoc(doc(db, "users", player.uid), {
        role: makeAdmin ? "admin" : "player",
        isAdmin: makeAdmin,
        updatedAt: serverTimestamp()
      }, { merge: true });

      note(makeAdmin ? `${name} is now admin.` : `${name} admin removed.`);
      await loadPlayers();
    };

    const deleteBtn = document.createElement("button");
    deleteBtn.textContent = "Delete";
    deleteBtn.style.background = "#b91c1c";

    deleteBtn.onclick = async () => {
      const ok = confirm(`Delete ${name}? This removes their user record and profile.`);
      if (!ok) return;

      await deleteDoc(doc(db, "users", player.uid));
      await deleteDoc(doc(db, "playerProfiles", player.uid));

      note(`${name} deleted.`);
      await loadPlayers();
    };

    actionsCell.appendChild(approveBtn);
    actionsCell.appendChild(hideBtn);
    actionsCell.appendChild(adminRoleBtn);
    actionsCell.appendChild(deleteBtn);

    playersTableBody.appendChild(tr);
  });
}

async function loadPlayers() {
  const usersSnap = await getDocs(collection(db, "users"));
  const players = [];

  for (const userDoc of usersSnap.docs) {
    const data = userDoc.data();

    const profileSnap = await getDoc(doc(db, "playerProfiles", userDoc.id));
    const profile = profileSnap.exists() ? profileSnap.data() : {};

    const lastActive =
      data.lastActive ||
      data.updatedAt ||
      profile.updatedAt ||
      data.createdAt;

    const inactive = daysSince(lastActive) >= 45;

    if (inactive && data.hidden !== true) {
      await setDoc(doc(db, "users", userDoc.id), {
        hidden: true,
        inactive: true,
        hiddenReason: "45 days inactive",
        hiddenAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      }, { merge: true });

      await setDoc(doc(db, "playerProfiles", userDoc.id), {
        hidden: true,
        inactive: true,
        hiddenReason: "45 days inactive",
        updatedAt: serverTimestamp()
      }, { merge: true });
    }

    players.push({
      uid: userDoc.id,
      ...data,
      ...profile,
      email: data.email || profile.email || "",
      division: data.division || profile.division || "",
      elo: profile.elo || data.elo || data.starterElo || getStarterElo(data.division || profile.division),
      starterElo: data.starterElo || profile.starterElo || getStarterElo(data.division || profile.division),
      inactive
    });
  }

  allPlayers = players.sort((a, b) => {
    const divA = Number(divisionValue(a.division) || 99);
    const divB = Number(divisionValue(b.division) || 99);

    if (divA !== divB) return divA - divB;

    return Number(b.elo || 0) - Number(a.elo || 0);
  });

  renderOverview();
  renderPlayers();
  await loadPendingAdminItems();
}

async function loadPendingAdminItems() {
  if (!pendingDisputesBox && !pendingResultsBox) return;

  let pending = [];
  let disputed = [];

  try {
    const snap = await getDocs(collection(db, "pendingMatches"));

    snap.forEach(d => {
      const item = { id: d.id, ...d.data() };

      if (item.status === "pending") pending.push(item);
      if (item.status === "disputed") disputed.push(item);
    });
  } catch (e) {
    console.warn("[admin] pendingMatches read failed", e);
  }

  if (pendingResultsBox) {
    pendingResultsBox.innerHTML = pending.length
      ? pending.map(m => `
        <div style="padding:12px 0;border-bottom:1px solid rgba(245,201,106,.15);">
          <strong>${m.p1Name}</strong> ${m.p1Legs} - ${m.p2Legs} <strong>${m.p2Name}</strong><br>
          <small>Division ${m.division || "—"} • Awaiting player confirmation</small>
        </div>
      `).join("")
      : "<p>No pending results.</p>";
  }

  if (pendingDisputesBox) {
    pendingDisputesBox.innerHTML = disputed.length
      ? disputed.map(m => `
        <div style="padding:12px 0;border-bottom:1px solid rgba(245,201,106,.15);">
          <strong>${m.p1Name}</strong> ${m.p1Legs} - ${m.p2Legs} <strong>${m.p2Name}</strong><br>
          <small>Reason: ${m.disputeReason || "No reason given"}</small><br><br>
          <button data-void="${m.id}">Void</button>
        </div>
      `).join("")
      : "<p>No disputes.</p>";

    pendingDisputesBox.querySelectorAll("[data-void]").forEach(btn => {
      btn.addEventListener("click", async () => {
        const ok = confirm("Void this disputed result?");
        if (!ok) return;

        await setDoc(doc(db, "pendingMatches", btn.dataset.void), {
          status: "void",
          voidedAt: serverTimestamp(),
          voidedBy: auth.currentUser?.uid || "",
          updatedAt: serverTimestamp()
        }, { merge: true });

        note("Dispute voided.");
        await loadPendingAdminItems();
      });
    });
  }
}

playerSearch?.addEventListener("input", renderPlayers);

onAuthStateChanged(auth, async user => {
  if (!user) {
    document.body.innerHTML = `
      <main style="padding:24px;color:white;">
        <h1>Admin Access Required</h1>
        <p>Please log in first.</p>
        <a href="/" style="color:#f5c96a;">Go Home</a>
      </main>
    `;
    return;
  }

  const meSnap = await getDoc(doc(db, "users", user.uid));
  const me = meSnap.exists() ? meSnap.data() : {};

  if (!isAdmin(me)) {
    document.body.innerHTML = `
      <main style="padding:24px;color:white;">
        <h1>Access Denied</h1>
        <p>Your account is not marked as admin.</p>
        <a href="/" style="color:#f5c96a;">Go Home</a>
      </main>
    `;
    return;
  }

  await loadPlayers();
});