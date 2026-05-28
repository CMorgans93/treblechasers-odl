// public/calendar.js
// Simple fixed "This week" calendar + hard-wired schedule (editable in this file).
// No month switching. Defaults to selecting TOMORROW.
// Includes a Tournament Info modal.

const weekGrid = document.getElementById('weekGrid');
const weekRange = document.getElementById('weekRange');

const detailDayName = document.getElementById('detailDayName');
const detailDatePill = document.getElementById('detailDatePill');
const detailSubtitle = document.getElementById('detailSubtitle');
const detailList = document.getElementById('detailList');

const linksBox = document.getElementById('linksBox');

const tomorrowChip = document.getElementById('tomorrowChip');

const btnTournamentInfo = document.getElementById('btnTournamentInfo');
const tOverlay = document.getElementById('tOverlay');
const btnCloseModal = document.getElementById('btnCloseModal');

/* =========================================
   EDIT HERE: schedule + useful links
   ========================================= */

// Schedule (Monday-Sunday)
const SCHEDULE = {
  mon: {
    title: "Division & Freeplay",
    items: [
      "Divisions",
      "Freeplay",
    ],
  },
  tue: {
    title: "Division & Freeplay",
    items: [
      "Divisions",
      "Freeplay",
    ],
  },
  wed: {
    title: "Division, Freeplay + Tournaments",
    items: [
      "Divisions",
      "Freeplay",
      "DC 50+ tournament — 19:00",
      "Open tournament — 19:00",
    ],
  },
  thu: {
    title: "Division & Freeplay",
    items: [
      "Divisions",
      "Freeplay",
    ],
  },
  fri: {
    title: "Division & Freeplay",
    items: [
      "Divisions",
      "Freeplay",
    ],
  },
  sat: {
    title: "Division, Freeplay + Opens",
    items: [
      "Divisions",
      "Freeplay",
      "Open tournament — 11:00",
      "Open tournament — 18:00",
    ],
  },
  sun: {
    title: "Division, Freeplay + Team Play",
    items: [
      "Divisions",
      "Freeplay",
      "Team Play — 14:00",
    ],
  },
};

// Useful links (edit these)
const USEFUL_LINKS = [
  { label: "Tournaments page (submissions)", href: "/tournaments.html" },
  { label: "Freeplay", href: "/freeplay.html" },
  { label: "Division play", href: "/division.html" },
  { label: "Overall ranking", href: "/ranking.html" },
  // Add more:
  // { label: "WhatsApp group", href: "https://example.com" },
  // { label: "Target DartCounter", href: "https://example.com" },
];

/* =========================================
   Helpers
   ========================================= */

const DOW_KEYS = ["mon","tue","wed","thu","fri","sat","sun"];
const DOW_LABELS = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
const DOW_FULL = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"];

function addDays(d, n){
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

// Convert JS day (0=Sun..6=Sat) into our index where 0=Mon..6=Sun
function mondayIndex(jsDay){
  // jsDay: 0..6 (Sun..Sat)
  // want: 0..6 (Mon..Sun)
  return (jsDay + 6) % 7;
}

function startOfWeekMonday(date){
  const d = new Date(date);
  const idx = mondayIndex(d.getDay());
  d.setDate(d.getDate() - idx);
  d.setHours(0,0,0,0);
  return d;
}

function fmtUK(d){
  return d.toLocaleDateString("en-GB", { weekday:"long", day:"numeric", month:"long" });
}
function fmtShort(d){
  return d.toLocaleDateString("en-GB", { day:"numeric", month:"short" });
}
function fmtMonthDay(d){
  return d.toLocaleDateString("en-GB", { day:"numeric", month:"short" });
}

function sameDate(a,b){
  return a.getFullYear()===b.getFullYear() && a.getMonth()===b.getMonth() && a.getDate()===b.getDate();
}

function escapeHtml(s){
  return String(s ?? "")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

/* =========================================
   Render
   ========================================= */

let selectedDate = null;
let weekStart = null; // Monday

function renderLinks(){
  if (!linksBox) return;

  if (!USEFUL_LINKS.length){
    linksBox.innerHTML = `<div class="muted">No links set.</div>`;
    return;
  }

  linksBox.innerHTML = USEFUL_LINKS.map(l =>
    `<div style="margin:8px 0;">
      <a href="${escapeHtml(l.href)}">${escapeHtml(l.label)}</a>
    </div>`
  ).join("");
}

function renderWeek(){
  if (!weekGrid) return;

  const today = new Date();
  const tomorrow = addDays(today, 1);

  weekStart = startOfWeekMonday(today);
  const weekEnd = addDays(weekStart, 6);

  if (weekRange) {
    weekRange.textContent = `${fmtMonthDay(weekStart)} – ${fmtMonthDay(weekEnd)}`;
  }

  // default select tomorrow (or today if something weird)
  selectedDate = tomorrow;

  // chip text
  if (tomorrowChip) tomorrowChip.textContent = fmtUK(tomorrow);

  weekGrid.innerHTML = "";

  for (let i=0;i<7;i++){
    const d = addDays(weekStart, i);

    const cell = document.createElement("div");
    cell.className = "day";

    if (sameDate(d, tomorrow)) cell.classList.add("tomorrow");
    if (sameDate(d, selectedDate)) cell.classList.add("selected");

    const dow = document.createElement("div");
    dow.className = "dow";
    dow.textContent = DOW_LABELS[i];

    const date = document.createElement("div");
    date.className = "date";
    date.textContent = String(d.getDate());

    cell.appendChild(dow);
    cell.appendChild(date);

    // add quick tag if day has tournaments / team play
    const key = DOW_KEYS[i];
    const items = (SCHEDULE[key]?.items || []).join(" ").toLowerCase();
    let tag = "";
    if (items.includes("tournament")) tag = "Tournaments";
    else if (items.includes("team play")) tag = "Team Play";

    if (tag){
      const pill = document.createElement("div");
      pill.className = "tag";
      pill.textContent = tag;
      cell.appendChild(pill);
    }

    cell.addEventListener("click", () => {
      selectedDate = d;
      // re-render selection state quickly
      Array.from(weekGrid.children).forEach(x => x.classList.remove("selected"));
      cell.classList.add("selected");
      renderDetailsForDate(d);
    });

    weekGrid.appendChild(cell);
  }

  renderDetailsForDate(selectedDate);
}

function renderDetailsForDate(d){
  const idx = mondayIndex(d.getDay()); // 0=Mon..6=Sun
  const key = DOW_KEYS[idx];
  const data = SCHEDULE[key] || { title:"", items:[] };

  if (detailDayName) detailDayName.textContent = DOW_FULL[idx];
  if (detailDatePill) detailDatePill.textContent = fmtShort(d);

  if (detailSubtitle) {
    detailSubtitle.textContent = data.title ? data.title : "Schedule";
  }

  if (detailList) {
    const items = data.items || [];
    detailList.innerHTML = items.length
      ? items.map(x => `<li>${escapeHtml(x)}</li>`).join("")
      : `<li class="muted">No schedule set.</li>`;
  }
}

/* =========================================
   Modal
   ========================================= */
function openModal(){
  if (!tOverlay) return;
  tOverlay.classList.add("open");
  tOverlay.setAttribute("aria-hidden","false");
}
function closeModal(){
  if (!tOverlay) return;
  tOverlay.classList.remove("open");
  tOverlay.setAttribute("aria-hidden","true");
}

btnTournamentInfo?.addEventListener("click", openModal);
btnCloseModal?.addEventListener("click", closeModal);
tOverlay?.addEventListener("click", (e) => {
  if (e.target === tOverlay) closeModal();
});

/* =========================================
   Init
   ========================================= */
renderLinks();
renderWeek();
