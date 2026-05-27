// public/rules.js
//
// Renders and controls the Rules modal used across the site.
// - No Firestore reads, fully static.
// - Matches current freeplay.js points logic and validations.
// - Creates the modal if it doesn't exist yet.
// - Provides tabs: Overview, Divisions, Freeplay, Cups, Conduct.
//
// NOTE: freeplay rules mirror computeFreeplayPoints() in public/freeplay.js

(function () {
  const RULES_VERSION = '2025-02-11';

  // ---------- HTML builders ----------
  const css = `
    .rules-overlay {
      position: fixed; inset: 0; display: none;
      background: rgba(0,0,0,.65);
      backdrop-filter: blur(4px);
      z-index: 9999;
      align-items: center;
      justify-content: center;
      padding: 16px;
    }
    .rules-overlay.open { display:flex; }
    .rules-modal {
      width: min(960px, 96vw);
      max-height: 90vh;
      overflow: hidden;
      border-radius: 12px;
      border: 1px solid rgba(215,180,106,.25);
      box-shadow: 0 18px 50px rgba(0,0,0,.65);
      background: linear-gradient(145deg, rgba(24,28,33,.95), rgba(13,16,20,.92));
      color: #f1e7d3;
      display: flex; flex-direction: column;
    }
    .rules-head {
      display:flex; align-items:center; justify-content:space-between;
      padding: 12px 14px; border-bottom: 1px solid rgba(215,180,106,.15);
    }
    .rules-title { font-weight:600; }
    .rules-close { background: transparent; color:#fff; border:1px solid rgba(215,180,106,.4); border-radius:8px; padding:6px 10px; cursor:pointer; }
    .rules-tabs { display:flex; gap:6px; padding:10px 12px; border-bottom:1px solid rgba(215,180,106,.12); flex-wrap:wrap;}
    .rules-tab {
      font-size:12px; color:#a7b0ba; background:rgba(10,14,19,.25);
      border:1px solid rgba(215,180,106,.15); border-radius:14px; padding:4px 10px; cursor:pointer;
    }
    .rules-tab.active { color:#f1e7d3; background:rgba(215,180,106,.20); }
    .rules-body { overflow:auto; padding: 14px 16px; }
    .rules-body h3 { margin: 12px 0 6px; font-size: 15px; }
    .rules-body h4 { margin: 10px 0 4px; font-size: 13px; color:#d7b46a; }
    .rules-body p, .rules-body li { font-size:13px; color:#e9dfcc; }
    .rules-kbd { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; }
    .rules-note { font-size:11px; color:#a7b0ba; }
    .rules-table { width:100%; border-collapse: collapse; margin: 6px 0 10px; font-size:12px; }
    .rules-table th, .rules-table td { border:1px solid rgba(215,180,106,.18); padding:6px 8px; text-align:center; }
    .rules-badge { display:inline-flex; align-items:center; gap:6px; background:rgba(215,180,106,.10); border:1px solid rgba(215,180,106,.25); border-radius:999px; padding:2px 8px; font-size:11px; }
  `;

  const overview = `
    <p>Welcome to Treblechasers! This page summarises how our league works and how to report results.</p>
    <ul>
      <li><strong>Divisions:</strong> standard season play. Standings show W/L, leg difference and season average.</li>
      <li><strong>Freeplay ladder:</strong> open ladder you can use anytime. Members can play immediately; non-members must have at least <strong>5</strong> division/league games.</li>
      <li><strong>Cups:</strong> occasional knockout brackets (and members-only cups).</li>
    </ul>
    <p class="rules-note">Last updated ${RULES_VERSION}</p>
  `;

  const divisions = `
    <h3>Divisions</h3>
    <ul>
      <li><strong>Match length:</strong> Best of 7 legs (first to 4).</li>
      <li><strong>Close loss:</strong> A 3–4 loss is tracked as “close loss” in the table.</li>
      <li><strong>Standings:</strong> ordered by points (if used in your season), then wins, then leg difference, then head-to-head / admin discretion.</li>
      <li><strong>Reporting:</strong> Either player submits. The opponent must confirm in their inbox. Admins can confirm on behalf of players if needed.</li>
    </ul>
    <h4>Valid Scores</h4>
    <p>Any 4–x where 0 ≤ x ≤ 3 is a valid win; no draws in divisions.</p>
  `;

  // Keep this fully aligned with public/freeplay.js logic:
  const freeplay = `
    <h3>Freeplay Ladder</h3>
    <ul>
      <li><strong>Eligibility:</strong> members & admins are always eligible. Non-members become eligible once they’ve played <strong>≥ 5</strong> league/division games (we accept older field names: <span class="rules-kbd">divisionGamesPlayed</span>, <span class="rules-kbd">divisionGames</span>, <span class="rules-kbd">leagueGamesPlayed</span>, <span class="rules-kbd">leagueMatchesPlayed</span>).</li>
      <li><strong>Match length:</strong> Best of 8 legs — valid scores are <strong>5–0</strong> to <strong>5–3</strong>, or a <strong>4–4</strong> draw. (Total legs ≤ 8.)</li>
      <li><strong>Reporting/Confirm:</strong> Either player submits; opponent confirms. “Dispute” sends it back for admin review.</li>
    </ul>

    <h4>Points Formula</h4>
    <ul>
      <li><strong>Base:</strong> Win = <strong>30</strong>, Draw = <strong>10</strong>, Loss = <strong>0</strong></li>
      <li><strong>Bonuses (10 pts each):</strong> 171+, 100+, Bull finish, Double-Double finish</li>
      <li><strong>Average bonus:</strong> If your match average is above your current Freeplay season average, you gain <strong>floor(diff)</strong> up to <strong>+20</strong>.</li>
      <li><strong>Form bonus:</strong> If your subtotal beats your own average points from your last 4 Freeplay matches, add <strong>+10</strong>.</li>
    </ul>

    <h4>Division Multipliers</h4>
    <p>If you play <em>up</em> a division, you’re rewarded. If you play <em>down</em>, smaller gain.</p>
    <div class="rules-note">Shown below as “Your Div vs Opp Div → Multiplier”. Cells not shown = 1.0</div>
    <table class="rules-table">
      <thead><tr><th>Your Div</th><th>vs 1</th><th>vs 2</th><th>vs 3</th><th>vs 4</th><th>vs 5</th><th>vs 6</th><th>vs 7</th><th>vs 8</th></tr></thead>
      <tbody>
        <tr><td>1</td><td>—</td><td>0</td><td>0</td><td>0</td><td>0</td><td>0</td><td>0</td><td>0</td></tr>
        <tr><td>2</td><td>1.10</td><td>—</td><td></td><td></td><td></td><td></td><td></td><td></td></tr>
        <tr><td>3</td><td>1.25</td><td>1.10</td><td>—</td><td></td><td></td><td></td><td></td><td></td></tr>
        <tr><td>4</td><td>1.50</td><td>1.25</td><td>1.10</td><td>—</td><td></td><td></td><td></td><td></td></tr>
        <tr><td>5</td><td>1.75</td><td>1.50</td><td>1.25</td><td>1.10</td><td>—</td><td></td><td></td><td></td></tr>
        <tr><td>6</td><td>2.00</td><td>1.75</td><td>1.50</td><td>1.25</td><td>1.10</td><td>—</td><td></td><td></td></tr>
        <tr><td>7</td><td>2.25</td><td>2.00</td><td>1.75</td><td>1.50</td><td>1.25</td><td>1.10</td><td>—</td><td></td></tr>
        <tr><td>8</td><td>2.50</td><td>2.25</td><td>2.00</td><td>1.75</td><td>1.50</td><td>1.25</td><td>1.10</td><td>—</td></tr>
      </tbody>
    </table>

    <h4>Leg-Loss Penalties (per leg)</h4>
    <p>After multipliers, points are reduced by a small per-leg penalty if you’re the higher-division player and you drop legs to a lower division opponent.</p>
    <table class="rules-table">
      <thead><tr><th>Your Div</th><th>vs 1</th><th>vs 2</th><th>vs 3</th><th>vs 4</th><th>vs 5</th><th>vs 6</th><th>vs 7</th><th>vs 8</th></tr></thead>
      <tbody>
        <tr><td>1</td><td>—</td><td>1</td><td>2</td><td>3</td><td>4</td><td>5</td><td>6</td><td>7</td></tr>
        <tr><td>2</td><td></td><td>—</td><td>1</td><td>2</td><td>3</td><td>4</td><td>5</td><td>6</td></tr>
        <tr><td>3</td><td></td><td></td><td>—</td><td>1</td><td>2</td><td>3</td><td>4</td><td>5</td></tr>
        <tr><td>4</td><td></td><td></td><td></td><td>—</td><td>1</td><td>2</td><td>3</td><td>4</td></tr>
        <tr><td>5</td><td></td><td></td><td></td><td></td><td>—</td><td>1</td><td>2</td><td>3</td></tr>
        <tr><td>6</td><td></td><td></td><td></td><td></td><td></td><td>—</td><td>1</td><td>2</td></tr>
        <tr><td>7</td><td></td><td></td><td></td><td></td><td></td><td></td><td>—</td><td>1</td></tr>
        <tr><td>8</td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td>—</td></tr>
      </tbody>
    </table>

    <div class="rules-badge">Cap & floor: total can’t go below 0; fractional totals are rounded at the end.</div>

    <h4>Example</h4>
    <p>You (Div 4) beat a Div 2 player 5–3 with 1×171+, 0×100+, 0×Bull, 0×DD. Your match avg is 62; your current FP avg is 58; last-4 average points = 50.</p>
    <ol>
      <li>Base 30 + Bonuses 10 = 40</li>
      <li>Avg bonus: floor(62 − 58) = +4 → subtotal 44</li>
      <li>Form bonus: 44 &gt; 50? No → +0 → subtotal 44</li>
      <li>Multiplier (Div4 vs Div2) = 1.25 → 44 × 1.25 = 55</li>
      <li>Leg-loss penalty (you’re lower div, so none) → 55</li>
      <li>Total = <strong>55</strong></li>
    </ol>
  `;

  const cups = `
    <h3>Cups</h3>
    <ul>
      <li>Admin may set different rounds/lengths; see the cup page for each event.</li>
      <li>Walkovers and byes are handled by admin if needed.</li>
      <li>Report and confirm as usual; disputes go to the admins.</li>
    </ul>
  `;

  const conduct = `
    <h3>Conduct & Fair Play</h3>
    <ul>
      <li>No abuse, harassment or sandbagging. Be sporting.</li>
      <li>Use honest self-reporting; averages and bonuses should reflect real scores.</li>
      <li>Admins may edit/void results in cases of error or misconduct.</li>
    </ul>
    <p class="rules-note">Questions? Ping an admin.</p>
  `;

  function ensureModal() {
    // inject CSS once
    if (!document.getElementById('rules-css')) {
      const style = document.createElement('style');
      style.id = 'rules-css';
      style.textContent = css;
      document.head.appendChild(style);
    }

    let overlay = document.getElementById('rulesOverlay');
    if (overlay) return overlay;

    overlay = document.createElement('div');
    overlay.id = 'rulesOverlay';
    overlay.className = 'rules-overlay';

    overlay.innerHTML = `
      <div class="rules-modal" role="dialog" aria-modal="true" aria-labelledby="rulesTitle">
        <div class="rules-head">
          <div class="rules-title" id="rulesTitle">League Rules</div>
          <button id="rulesCloseBtn" class="rules-close" type="button">Close</button>
        </div>
        <div class="rules-tabs">
          <button class="rules-tab active" data-tab="overview">Overview</button>
          <button class="rules-tab" data-tab="divisions">Divisions</button>
          <button class="rules-tab" data-tab="freeplay">Freeplay</button>
          <button class="rules-tab" data-tab="cups">Cups</button>
          <button class="rules-tab" data-tab="conduct">Conduct</button>
        </div>
        <div class="rules-body" id="rulesBody"></div>
      </div>
    `;
    document.body.appendChild(overlay);

    // wiring
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeRules();
    });
    overlay.querySelector('#rulesCloseBtn')?.addEventListener('click', closeRules);
    document.addEventListener('keydown', onEsc);

    // initial content
    setTab('overview');

    // tab clicks
    overlay.querySelectorAll('.rules-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        overlay.querySelectorAll('.rules-tab').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        setTab(btn.dataset.tab);
      });
    });

    return overlay;
  }

  function setTab(tab) {
    const body = document.getElementById('rulesBody');
    if (!body) return;
    switch (tab) {
      case 'overview': body.innerHTML = overview; break;
      case 'divisions': body.innerHTML = divisions; break;
      case 'freeplay': body.innerHTML = freeplay; break;
      case 'cups': body.innerHTML = cups; break;
      case 'conduct': body.innerHTML = conduct; break;
      default: body.innerHTML = overview; break;
    }
  }

  function openRules(tab = 'overview') {
    const ov = ensureModal();
    ov.classList.add('open');
    // set tab explicitly if provided
    ov.querySelectorAll('.rules-tab').forEach(b => {
      const act = b.dataset.tab === tab;
      b.classList.toggle('active', act);
      if (act) setTab(tab);
    });
  }

  function closeRules() {
    const ov = document.getElementById('rulesOverlay');
    if (ov) ov.classList.remove('open');
  }

  function onEsc(e) {
    if (e.key === 'Escape') closeRules();
  }

  // ---------- Public hooks ----------
  // If a page already includes #rulesModal and a “Rules” button, we gracefully augment it:
  const externalBtn = document.getElementById('btnRules');
  if (externalBtn) {
    externalBtn.addEventListener('click', () => openRules('overview'));
  }

  // Also expose a programmatic way to open specific tab:
  window.showRules = openRules;

  // If the site has its own #rulesModal container (from older markup),
  // we’ll ignore it because this module creates and manages its own modal.
})();
