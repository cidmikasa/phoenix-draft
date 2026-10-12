/**
 * PHOENIX DRAFT — RENDER ENGINE v7 (animation pass)
 * Draft logic unchanged. Added:
 *   - change detection (what was just picked / banned)
 *   - intro overlay trigger (pre → draft)
 *   - window.showHeroOverlay(heroName, type, side)
 *   - signature checks so unchanged containers are NOT rebuilt on every poll
 *     (otherwise CSS animations would restart every 400ms)
 */

/* ——— ANIMATION BOOKKEEPING ——— */
const _phxAnim = {
  prev: null,          // last pick/ban snapshot
  pop: {},             // 'pick-A-2' -> { phase:'pending'|'popping', t:timestamp }
  popMs: 450,          // how long the .pop class lives (animation is 400ms)
  lastView: null,
  introPlayed: false,
  introTimer: null,
  overlayQueue: [],
  overlayBusy: false
};
const INTRO_TOTAL_MS = 4100;     // CSS intro is 4.0s
const HERO_OVERLAY_MS = 2200;    // 0.3s in + 1.5s hold + 0.4s out — matches @keyframes heroOv
const PENDING_FAILSAFE_MS = 15000; // a slot never stays hidden longer than this

function escapeHtml(str) {
  if (!str) return '';
  const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
  return String(str).replace(/[&<>"']/g, function (m) { return map[m]; });
}

function isLive(state, type, side, index) {
  const live = state.live;
  if (!live || live.side !== side || live.type !== type) return false;
  if (type === 'ban') { return live.index === index; }
  const group = window.getPickGroup ? window.getPickGroup(state) : null;
  if (group && group.start !== group.end) {
    const startSlot = window.DRAFT_PHASES[group.start].index;
    const endSlot = window.DRAFT_PHASES[group.end].index;
    return index === startSlot || index === endSlot;
  }
  return live.index === index;
}

function getHeroData(heroName) {
  if (!window.heroData) return null;
  return window.heroData.find(h => h.name === heroName) || null;
}

const FALLBACK_PORTRAIT = 'data:image/svg+xml;utf8,' + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="#0d0404"/>' +
  '<text x="32" y="40" font-family="Arial" font-size="24" font-weight="900" fill="#e82a2a" text-anchor="middle">?</text></svg>'
);

function resolvePath(raw) {
  if (!raw) return null;
  raw = raw.replace(/^\.\//, '');
  if (raw.startsWith('http') || raw.startsWith('data:') || raw.startsWith('assets/')) return raw;
  return 'assets/' + raw;
}
function getPickPortraitPath(hero) {
  if (!hero || !hero.images) return FALLBACK_PORTRAIT;
  return resolvePath(hero.images.rectangle || hero.images.portrait || hero.images.round) || FALLBACK_PORTRAIT;
}
function getBanPortraitPath(hero) {
  if (!hero || !hero.images) return FALLBACK_PORTRAIT;
  return resolvePath(hero.images.round || hero.images.portrait || hero.images.rectangle) || FALLBACK_PORTRAIT;
}

/* ——— SMALL HELPERS (animation) ——— */
function _phxHeroSig() {
  return String(window.heroData ? window.heroData.length : 0);
}

// key = 'pick-A-2' / 'ban-B-0'  →  the live DOM element for that slot
function _phxPopHost(key) {
  const p = key.split('-');
  const box = document.getElementById((p[0] === 'ban' ? 'bans' : 'slots') + p[1]);
  return box ? (box.children[parseInt(p[2], 10)] || null) : null;
}

/* Pop lifecycle for a freshly written hero:
     pending  → slot is shown EMPTY (.pop-pending) while the big overlay plays
     popping  → overlay finished: .pop bounce plays (~0.4s)
     (deleted) → settled
   Driven by the overlay queue, so a queued overlay delays ITS slot's pop, not just the first one's. */
function _phxStartPop(key) {
  if (!key) return;
  const entry = _phxAnim.pop[key];
  if (!entry || entry.phase !== 'pending') return;
  entry.phase = 'popping';
  entry.t = Date.now();
  const el = _phxPopHost(key);
  if (el && el.classList.contains('filled')) {
    el.classList.remove('pop-pending', 'pop');
    el.style.animationDelay = '';
    void el.offsetWidth;                         // make sure the bounce restarts cleanly
    el.classList.add('pop');
  }
  setTimeout(function () {
    if (_phxAnim.pop[key] !== entry) return;     // slot was re-picked meanwhile — newer entry owns it
    delete _phxAnim.pop[key];
    const cur = _phxPopHost(key);
    if (cur) { cur.classList.remove('pop'); cur.style.animationDelay = ''; }
  }, _phxAnim.popMs);
}

// Called while (re)building a slot/ban element so a rebuild mid-sequence keeps the right look.
function _phxApplyPop(el, key) {
  const entry = _phxAnim.pop[key];
  if (!entry) return;
  const age = Date.now() - entry.t;
  if (entry.phase === 'pending') {
    if (age > PENDING_FAILSAFE_MS) { delete _phxAnim.pop[key]; return; }
    el.classList.add('pop-pending');
  } else if (entry.phase === 'popping' && age < _phxAnim.popMs) {
    el.classList.add('pop');
    el.style.animationDelay = (-age) + 'ms';
  }
}

/* ——— BIG HERO OVERLAY (pick / ban) ——— */
// Public API: window.showHeroOverlay(heroName, 'pick' | 'ban', 'A' | 'B')
function showHeroOverlay(heroName, type, side) {
  _phxEnqueueOverlay({
    heroName: heroName,
    type: type === 'ban' ? 'ban' : 'pick',
    side: side === 'A' || side === 'B' ? side : '',
    key: null
  });
}

function _phxEnqueueOverlay(job) {
  if (!job.heroName) { _phxStartPop(job.key); return; }
  _phxAnim.overlayQueue.push(job);
  if (_phxAnim.overlayQueue.length > 6) {
    const dropped = _phxAnim.overlayQueue.shift();
    _phxStartPop(dropped.key);                     // never leave a dropped job's slot hidden
  }
  if (!_phxAnim.overlayBusy) _phxDrainOverlay();
}

function _phxDrainOverlay() {
  const job = _phxAnim.overlayQueue.shift();
  if (!job) { _phxAnim.overlayBusy = false; return; }
  _phxAnim.overlayBusy = true;

  const host = document.getElementById('heroOverlay');
  if (!host) { _phxStartPop(job.key); _phxDrainOverlay(); return; }

  const hero = getHeroData(job.heroName);
  const card = document.createElement('div');
  // NOTE: class is "ov-pick" / "ov-ban" — NOT "ban", which is the board's 82px ban-slot class.
  card.className = 'hero-ov-card ov-' + job.type + (job.side ? ' side-' + job.side : '');
  card.innerHTML =
    '<div class="hero-ov-frame">' +
      '<img src="' + escapeHtml(getPickPortraitPath(hero)) + '" alt="' + escapeHtml(job.heroName) + '">' +
      '<div class="hero-ov-name">' + escapeHtml(job.heroName) + '</div>' +
    '</div>' +
    '<div class="hero-ov-label">' + (job.type === 'ban' ? 'BANNED' : 'PICKED') + '</div>';
  host.appendChild(card);

  setTimeout(function () {
    if (card.parentNode) card.parentNode.removeChild(card);
    _phxStartPop(job.key);                         // overlay done → NOW the slot bounces in
    _phxDrainOverlay();
  }, HERO_OVERLAY_MS);
}

/* ——— DETECT NEW PICKS / BANS BETWEEN RENDERS ———
   Runs on every render but only acts when a slot's hero actually differs from last render. */
function detectDraftChanges(state) {
  const snap = {
    pick: {
      A: state.teamA.players.map(function (p) { return p.hero || ''; }),
      B: state.teamB.players.map(function (p) { return p.hero || ''; })
    },
    ban: {
      A: state.teamA.bans.map(function (b) { return b || ''; }),
      B: state.teamB.bans.map(function (b) { return b || ''; })
    }
  };
  const prev = _phxAnim.prev;
  _phxAnim.prev = snap;
  if (!prev) return;                       // first render: never animate existing state

  const changes = [];
  ['A', 'B'].forEach(function (side) {
    ['pick', 'ban'].forEach(function (type) {
      snap[type][side].forEach(function (hero, i) {
        const before = prev[type][side][i];
        const key = type + '-' + side + '-' + i;
        if (hero && hero !== before) changes.push({ type: type, side: side, index: i, hero: hero, key: key });
        else if (!hero && before) delete _phxAnim.pop[key];   // slot cleared (reset) — cancel any pending pop
      });
    });
  });
  if (!changes.length) return;

  const now = Date.now();
  // 1–2 changes = a normal pick/ban (or a double-pick group). More than that is a bulk change
  // (state import / reset) — skip the big overlays and just pop the slots straight away.
  const useOverlay = state.view === 'draft' && changes.length <= 2;

  changes.forEach(function (c) {
    _phxAnim.pop[c.key] = { phase: 'pending', t: now };
    if (useOverlay) {
      _phxEnqueueOverlay({ heroName: c.hero, type: c.type, side: c.side, key: c.key });
    }
  });
  if (!useOverlay) changes.forEach(function (c) { _phxStartPop(c.key); });
}

/* ——— VIEW SWITCHER (+ intro trigger) ——— */
function playIntro() {
  _phxAnim.introPlayed = true;
  const el = document.getElementById('viewIntro') || document.querySelector('.view-intro');
  if (!el) return;
  clearTimeout(_phxAnim.introTimer);
  el.classList.remove('playing');
  void el.offsetWidth;                     // restart CSS animations
  el.classList.add('playing');
  _phxAnim.introTimer = setTimeout(function () { el.classList.remove('playing'); }, INTRO_TOTAL_MS);
}

function renderView(state) {
  const view = state.view || 'pre';
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  const active = document.querySelector('.view-' + view);
  if (active) active.classList.add('active');

  const prev = _phxAnim.lastView;
  _phxAnim.lastView = view;
  if (view === 'pre') _phxAnim.introPlayed = false;   // Back to Pre re-arms the intro
  if (!_phxAnim.introPlayed && (view === 'intro' || (view === 'draft' && prev === 'pre'))) {
    playIntro();
  }
}

/* ——— PRE-DRAFT ——— */
function setCrest(el, team, fallback) {
  if (!el) return;
  if (team.logo) el.innerHTML = '<img src="' + escapeHtml(team.logo) + '" alt="logo" />';
  else el.textContent = (team.crest || fallback).slice(0, 2).toUpperCase();
}
function renderPreView(state) {
  const nameA = document.getElementById('preNameA');
  const nameB = document.getElementById('preNameB');
  if (nameA) nameA.textContent = state.teamA.name || 'TEAM ALPHA';
  if (nameB) nameB.textContent = state.teamB.name || 'TEAM BRAVO';
  setCrest(document.getElementById('preCrestA'), state.teamA, 'A');
  setCrest(document.getElementById('preCrestB'), state.teamB, 'B');
}

/* ——— DRAFT VIEW ——— */
function renderTeamTags(state) {
  const tagA = document.getElementById('teamTagA');
  const tagB = document.getElementById('teamTagB');
  if (tagA) tagA.textContent = state.teamA.name || 'TEAM ALPHA';
  if (tagB) tagB.textContent = state.teamB.name || 'TEAM BRAVO';
}

function renderBroadcastLogo(state) {
  const img = document.getElementById('broadcastLogoImg');
  const label = document.getElementById('broadcastLabel');
  if (img) {
    img.onerror = function () { img.style.display = 'none'; };
    img.src = state.broadcastLogo || 'assets/broadcast-logo.png';
    img.style.display = 'block';
  }
  if (label) label.textContent = state.broadcastLabel || 'LIVE DRAFT';
}

function renderCams(state) {
  [['A', state.teamA, 'BLUE CAPTAIN'], ['B', state.teamB, 'RED CAPTAIN']].forEach(function (c) {
    const img = document.getElementById('camImg' + c[0]);
    const label = document.getElementById('camLabel' + c[0]);
    if (label) label.textContent = (c[1].name || c[2]).toUpperCase();
    if (img) {
      if (c[1].cam) { img.src = c[1].cam; img.style.display = 'block'; }
      else img.style.display = 'none';
    }
  });
}

function renderPlayerSlots(state, side) {
  const team = side === 'A' ? state.teamA : state.teamB;
  const container = document.getElementById('slots' + side);
  if (!container) return;

  // Skip rebuild when nothing visible changed, so running animations survive the 400ms poll.
  const sig = _phxHeroSig() + '#' + team.players.map(function (p, i) {
    return (p.hero || '') + '|' + (p.name || '') + '|' + (isLive(state, 'pick', side, i) ? 1 : 0);
  }).join('~');
  if (container.dataset.sig === sig && container.children.length === team.players.length) return;
  container.dataset.sig = sig;

  container.innerHTML = '';
  team.players.forEach((player, i) => {
    const slot = document.createElement('div');
    slot.className = 'slot';
    slot.dataset.n = i + 1;
    if (isLive(state, 'pick', side, i)) slot.classList.add('live');
    if (player.hero) {
      slot.classList.add('filled');
      const img = document.createElement('img');
      img.className = 'hero-portrait';
      img.alt = player.hero;
      img.src = getPickPortraitPath(getHeroData(player.hero));
      slot.appendChild(img);
      const plate = document.createElement('div');
      plate.className = 'slot-plate';
      plate.innerHTML = '<b>' + escapeHtml(player.hero) + '</b>' + (player.name ? '<i>' + escapeHtml(player.name) + '</i>' : '');
      slot.appendChild(plate);
      _phxApplyPop(slot, 'pick-' + side + '-' + i);
    }
    container.appendChild(slot);
  });
}

function renderBanSlots(state, side) {
  const team = side === 'A' ? state.teamA : state.teamB;
  const container = document.getElementById('bans' + side);
  if (!container) return;

  const sig = _phxHeroSig() + '#' + team.bans.map(function (b, i) {
    return (b || '') + '|' + (isLive(state, 'ban', side, i) ? 1 : 0);
  }).join('~');
  if (container.dataset.sig === sig && container.children.length === team.bans.length) return;
  container.dataset.sig = sig;

  container.innerHTML = '';
  team.bans.forEach((ban, i) => {
    const slot = document.createElement('div');
    slot.className = 'ban';
    if (ban) {
      slot.classList.add('filled');
      const hero = getHeroData(ban);
      if (hero) {
        const img = document.createElement('img');
        img.className = 'ban-portrait';
        img.src = getBanPortraitPath(hero);
        img.alt = ban;
        slot.appendChild(img);
      }
      _phxApplyPop(slot, 'ban-' + side + '-' + i);
    }
    if (isLive(state, 'ban', side, i)) slot.classList.add('live');
    container.appendChild(slot);
  });
}

/* ——— CENTER CONSOLE ——— */
function renderScoreDots(el, max, score) {
  if (!el) return;
  el.innerHTML = '';
  for (let i = 0; i < max; i++) {
    const d = document.createElement('div');
    d.className = 'score-dot' + (i < score ? ' filled' : '');
    el.appendChild(d);
  }
}
function renderCenterConsole(state) {
  const fmt = document.getElementById('consoleFormat');
  if (fmt) fmt.textContent = matchFormatLabel(state.matchFormat);
  const max = dotsPerSide(state.matchFormat);
  renderScoreDots(document.getElementById('consoleScoreA'), max, state.scoreA);
  renderScoreDots(document.getElementById('consoleScoreB'), max, state.scoreB);
  const phaseEl = document.getElementById('phase');
  if (phaseEl) phaseEl.textContent = state.isDraftComplete ? 'DRAFT COMPLETE' : getPhaseLabel(state);
}

function renderTimer(state) {
  const el = document.getElementById('timer');
  if (!el) return;
  const remaining = state.isDraftComplete ? 0 : timerRemainingSeconds(state.timer);
  el.textContent = formatSeconds(remaining);
  el.classList.toggle('low', !state.isDraftComplete && remaining <= 10);
}

function renderArrows(state) {
  const arrowsEl = document.getElementById('consoleArrows');
  if (!arrowsEl) return;
  arrowsEl.classList.remove('dir-left', 'dir-right');
  if (state.isDraftComplete) return;
  const phase = getCurrentPhase(state);
  if (!phase) return;
  if (phase.side === 'A') arrowsEl.classList.add('dir-left');
  else if (phase.side === 'B') arrowsEl.classList.add('dir-right');
}

/* ——— COMPLETE VIEW ——— */
function renderLineup(el, team) {
  if (!el) return;

  // Only rebuild when the lineup actually changes — otherwise the fly-in would restart every poll.
  const sig = _phxHeroSig() + '#' + team.players.map(function (p) { return p.hero || ''; }).join('~');
  if (el.dataset.sig === sig && el.children.length === team.players.length) return;
  el.dataset.sig = sig;

  el.innerHTML = '';
  team.players.forEach(player => {
    const card = document.createElement('div');
    card.className = 'lineup-card';
    if (player.hero) {
      const img = document.createElement('img');
      img.src = getPickPortraitPath(getHeroData(player.hero));
      img.alt = player.hero;
      card.appendChild(img);
    }
    el.appendChild(card);
  });
}
function renderCompleteView(state) {
  renderLineup(document.getElementById('lineupA'), state.teamA);
  renderLineup(document.getElementById('lineupB'), state.teamB);
}

/* ——— SPONSOR STRIP ——— */
function renderSponsors(state) {
  const strip = document.getElementById('sponsorStrip');
  if (!strip) return;

  strip.innerHTML = '';

  const sponsors = Array.isArray(state.sponsors) ? state.sponsors : [];
  const filled = sponsors.filter(s => s && s.length > 0);

  if (filled.length === 0) {
    strip.style.display = 'none';
    return;
  }

  strip.style.display = 'flex';

  filled.forEach(logo => {
    const img = document.createElement('img');
    img.src = logo;
    img.alt = 'sponsor';
    img.loading = 'lazy';
    img.className = 'sponsor-logo';
    strip.appendChild(img);
  });
}

/* ——— MASTER ——— */
function renderDisplay(state) {
  if (!state) return;
  renderView(state);
  detectDraftChanges(state);      // must run BEFORE slots/bans render so .pop can be applied
  renderPreView(state);
  renderTeamTags(state);
  renderBroadcastLogo(state);
  renderCams(state);
  renderBanSlots(state, 'A');
  renderBanSlots(state, 'B');
  renderPlayerSlots(state, 'A');
  renderPlayerSlots(state, 'B');
  renderCenterConsole(state);
  renderTimer(state);
  renderArrows(state);
  renderCompleteView(state);
  renderSponsors(state);
}

window.renderDisplay = renderDisplay;
window.renderView = renderView;
window.renderPreView = renderPreView;
window.renderTeamTags = renderTeamTags;
window.renderBroadcastLogo = renderBroadcastLogo;
window.renderCams = renderCams;
window.renderPlayerSlots = renderPlayerSlots;
window.renderBanSlots = renderBanSlots;
window.renderCenterConsole = renderCenterConsole;
window.renderTimer = renderTimer;
window.renderArrows = renderArrows;
window.renderCompleteView = renderCompleteView;
window.isLive = isLive;
window.getHeroData = getHeroData;
window.getPickPortraitPath = getPickPortraitPath;
window.getBanPortraitPath = getBanPortraitPath;
window.showHeroOverlay = showHeroOverlay;
window.playIntro = playIntro;
window.renderSponsors = renderSponsors;