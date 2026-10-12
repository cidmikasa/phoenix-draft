/**
 * ============================================================
 * PHOENIX DRAFT — CONTROL ENGINE v11
 * Bumped last-pick delay: 2000ms → 2500ms so the pop animation
 * has time to finish before view switches to complete.
 * ============================================================
 */

let state = loadDraftState();
let controlInterval = null;
let heroData = [];

const FALLBACK_PORTRAIT = 'data:image/svg+xml;utf8,' + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">' +
  '<rect width="64" height="64" fill="#0d0404"/>' +
  '<text x="32" y="40" font-family="Arial" font-size="24" font-weight="900" ' +
  'fill="#e82a2a" text-anchor="middle">?</text>' +
  '</svg>'
);

const $ = (id) => document.getElementById(id);

const teamANameInput        = $('A-name');
const teamBNameInput        = $('B-name');
const teamACrestFile        = $('A-crest-file');
const teamBCrestFile        = $('B-crest-file');
const teamACrestPreview     = $('A-crest-preview');
const teamBCrestPreview     = $('B-crest-preview');

const broadcastLogoFile     = $('broadcastLogoFile');
const broadcastLogoPreview  = $('broadcastLogoPreview');
const broadcastLabelInput   = $('broadcastLabel');

const sponsorList           = $('sponsorList');
const btnAddSponsor         = $('btnAddSponsor');

const timerReadout          = $('timerReadout');
const timerDuration         = $('timerDuration');
const phaseIndicator        = $('phaseIndicator');

const btnStart      = $('btnStart');
const btnPause      = $('btnPause');
const btnReset      = $('btnReset');
const btnResetDraft = $('btnResetDraft');

const btnStartDraft   = $('btnStartDraft');
const btnNextDraft    = $('btnNextDraft');
const btnSwitchSides  = $('btnSwitchSides');

const matchFormatSelect = $('matchFormat');
const scoreDotsA        = $('scoreDotsA');
const scoreDotsB        = $('scoreDotsB');

function commit() {
  saveDraftState(state);
  if (window.broadcastState) window.broadcastState(state);
}

function updateTimerDisplay() {
  if (!timerReadout) return;
  const remaining = state.isDraftComplete ? 0 : timerRemainingSeconds(state.timer);
  timerReadout.textContent = formatSeconds(remaining);
}

function updateCrestPreview(side, logo) {
  const el = side === 'A' ? teamACrestPreview : teamBCrestPreview;
  if (!el) return;
  if (logo) { el.style.backgroundImage = `url(${logo})`; el.textContent = ''; }
  else { el.style.backgroundImage = ''; el.textContent = 'no logo'; }
}

function updateBroadcastLogoPreview(logo) {
  if (!broadcastLogoPreview) return;
  if (logo) { broadcastLogoPreview.style.backgroundImage = `url(${logo})`; broadcastLogoPreview.textContent = ''; }
  else { broadcastLogoPreview.style.backgroundImage = ''; broadcastLogoPreview.textContent = 'no logo'; }
}

function heroPortrait(hero) {
  if (!hero || !hero.images) return FALLBACK_PORTRAIT;
  let raw = hero.images.portrait || hero.images.round;
  if (!raw) return FALLBACK_PORTRAIT;
  raw = raw.replace(/^\.\//, '');
  if (raw.startsWith('http') || raw.startsWith('data:') || raw.startsWith('assets/')) return raw;
  return 'assets/' + raw;
}

/* ——— SPONSOR MANAGEMENT ——— */
function renderSponsorSlots() {
  if (!sponsorList) return;
  sponsorList.innerHTML = '';

  state.sponsors.forEach((logo, i) => {
    const row = document.createElement('div');
    row.className = 'sponsor-row';

    const preview = document.createElement('div');
    preview.className = 'sponsor-preview';
    if (logo) preview.style.backgroundImage = `url(${logo})`;
    else preview.textContent = 'slot';

    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/*';
    fileInput.className = 'sponsor-file';
    fileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (evt) => {
        state.sponsors[i] = evt.target.result;
        commit();
        renderSponsorSlots();
      };
      reader.readAsDataURL(file);
    });

    const removeBtn = document.createElement('div');
    removeBtn.className = 'sponsor-remove';
    removeBtn.textContent = '✕';
    removeBtn.addEventListener('click', () => {
      state.sponsors.splice(i, 1);
      commit();
      renderSponsorSlots();
    });

    row.appendChild(preview);
    row.appendChild(fileInput);
    row.appendChild(removeBtn);
    sponsorList.appendChild(row);
  });

  if (btnAddSponsor) {
    btnAddSponsor.style.display = state.sponsors.length >= MAX_SPONSORS ? 'none' : 'block';
  }
}

if (btnAddSponsor) btnAddSponsor.addEventListener('click', () => {
  if (state.sponsors.length >= MAX_SPONSORS) return;
  state.sponsors.push('');
  commit();
  renderSponsorSlots();
});

/* ——— SCORE DOTS ——— */
function renderScoreDotsControl() {
  const max = dotsPerSide(state.matchFormat);

  if (scoreDotsA) {
    scoreDotsA.innerHTML = '';
    for (let i = 0; i < max; i++) {
      const dot = document.createElement('div');
      dot.className = 'score-dot' + (i < state.scoreA ? ' filled' : '');
      dot.addEventListener('click', () => {
        state.scoreA = (i + 1 === state.scoreA) ? i : (i + 1);
        commit(); renderScoreDotsControl();
      });
      scoreDotsA.appendChild(dot);
    }
  }
  if (scoreDotsB) {
    scoreDotsB.innerHTML = '';
    for (let i = 0; i < max; i++) {
      const dot = document.createElement('div');
      dot.className = 'score-dot' + (i < state.scoreB ? ' filled' : '');
      dot.addEventListener('click', () => {
        state.scoreB = (i + 1 === state.scoreB) ? i : (i + 1);
        commit(); renderScoreDotsControl();
      });
      scoreDotsB.appendChild(dot);
    }
  }
}

function populateForm() {
  try {
    if (teamANameInput) teamANameInput.value = state.teamA.name || '';
    if (teamBNameInput) teamBNameInput.value = state.teamB.name || '';
    updateCrestPreview('A', state.teamA.logo);
    updateCrestPreview('B', state.teamB.logo);
    updateBroadcastLogoPreview(state.broadcastLogo);
    if (broadcastLabelInput) broadcastLabelInput.value = state.broadcastLabel || '';
    if (timerDuration) timerDuration.value = state.timer.duration || 50;
    if (matchFormatSelect) matchFormatSelect.value = state.matchFormat || 'BO3';

    const total = DRAFT_PHASES.length;
    const current = state.currentPhaseIndex || 0;
    if (phaseIndicator) phaseIndicator.textContent = `${Math.min(current + 1, total)} / ${total}`;

    updateTimerDisplay();
    renderHeroButtons(heroData);
    renderScoreDotsControl();
    renderSponsorSlots();
  } catch (e) {
    console.error('populateForm error:', e);
  }
}

/* ——— TEAM NAME ——— */
if (teamANameInput) teamANameInput.addEventListener('input', () => { state.teamA.name = teamANameInput.value; commit(); });
if (teamBNameInput) teamBNameInput.addEventListener('input', () => { state.teamB.name = teamBNameInput.value; commit(); });

/* ——— CREST UPLOAD ——— */
function wireCrestUpload(inputEl, sideKey, sideLetter) {
  if (!inputEl) return;
  inputEl.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      state[sideKey].logo = evt.target.result;
      commit();
      updateCrestPreview(sideLetter, evt.target.result);
    };
    reader.readAsDataURL(file);
  });
}
wireCrestUpload(teamACrestFile, 'teamA', 'A');
wireCrestUpload(teamBCrestFile, 'teamB', 'B');

/* ——— BROADCAST LOGO UPLOAD ——— */
if (broadcastLogoFile) broadcastLogoFile.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (evt) => {
    state.broadcastLogo = evt.target.result;
    commit();
    updateBroadcastLogoPreview(evt.target.result);
  };
  reader.readAsDataURL(file);
});

if (broadcastLabelInput) broadcastLabelInput.addEventListener('input', () => {
  state.broadcastLabel = broadcastLabelInput.value;
  commit();
});

/* ——— MATCH FORMAT ——— */
if (matchFormatSelect) matchFormatSelect.addEventListener('change', () => {
  state.matchFormat = matchFormatSelect.value;
  const max = dotsPerSide(state.matchFormat);
  if (state.scoreA > max) state.scoreA = max;
  if (state.scoreB > max) state.scoreB = max;
  commit();
  renderScoreDotsControl();
});

/* ——— TIMER START/PAUSE ——— */
if (btnStart) btnStart.addEventListener('click', () => { state = startTimer(state); commit(); updateTimerDisplay(); });
if (btnPause) btnPause.addEventListener('click', () => { state = pauseTimer(state); commit(); updateTimerDisplay(); });
if (timerDuration) timerDuration.addEventListener('change', () => {
  const val = parseInt(timerDuration.value, 10);
  if (val > 0) { state = setTimerDuration(state, val); commit(); updateTimerDisplay(); }
});

/* ——— RESET (single-step undo) ——— */
if (btnReset) btnReset.addEventListener('click', () => {
  if (state.currentPhaseIndex <= 0) {
    state = resetTimer(state);
    commit();
    populateForm();
    return;
  }

  const prevIdx = state.currentPhaseIndex - 1;
  const prevPhase = DRAFT_PHASES[prevIdx];

  const sideKey = prevPhase.side === 'A' ? 'teamA' : 'teamB';
  const slot = prevPhase.index;
  if (prevPhase.type === 'pick') {
    state[sideKey].players[slot].hero = '';
  } else if (prevPhase.type === 'ban') {
    state[sideKey].bans[slot] = '';
  }

  state.currentPhaseIndex = prevIdx;
  state.isDraftComplete = false;
  state.phaseLabel = getPhaseLabel(state);
  state = updateLiveFromPhase(state);
  state = resetTimer(state);

  commit();
  populateForm();
});

/* ——— HERO LOAD ——— */
async function loadHeroes() {
  try {
    const response = await fetch('assets/heroes.json');
    const data = await response.json();
    if (Array.isArray(data)) heroData = data;
    else if (data.heroes && Array.isArray(data.heroes)) heroData = data.heroes;
    else { console.error('Unexpected heroes format:', data); heroData = []; }
    console.log(`🔥 Loaded ${heroData.length} heroes`);
    window.heroData = heroData;
    renderHeroButtons(heroData);
    return heroData;
  } catch (e) {
    console.error('Failed to load heroes:', e);
    heroData = [];
    return [];
  }
}

/* ——— HERO GRID ——— */
function renderHeroButtons(heroes, filter = '') {
  const grid = $('heroGrid');
  if (!grid) return;
  grid.innerHTML = '';
  if (!Array.isArray(heroes) || heroes.length === 0) {
    grid.innerHTML = '<div style="color:#a06050;padding:20px;text-align:center;font-size:12px;">No heroes loaded.</div>';
    return;
  }
  const searchInput = $('heroSearch');
  const searchTerm = (filter || (searchInput ? searchInput.value.toLowerCase() : '')).trim();
  const usedHeroes = getUsedHeroes(state);

  const filtered = heroes.filter(h => {
    const nameMatch = h.name && h.name.toLowerCase().includes(searchTerm);
    const roleMatch = h.role && h.role.toLowerCase().includes(searchTerm);
    return nameMatch || roleMatch;
  });

  if (filtered.length === 0) {
    grid.innerHTML = '<div style="color:#a06050;padding:20px;text-align:center;font-size:12px;">No heroes found.</div>';
    return;
  }

  filtered.forEach(hero => {
    const btn = document.createElement('button');
    btn.className = 'hero-btn';
    btn.dataset.heroId = hero.id;
    btn.dataset.heroName = hero.name;
    if (usedHeroes.includes(hero.name)) btn.classList.add('used');

    btn.innerHTML =
      '<img src="' + heroPortrait(hero) + '" alt="' + hero.name + '" loading="lazy" />' +
      '<span>' + hero.name + '</span>';

    btn.addEventListener('click', () => selectHero(hero.id));
    grid.appendChild(btn);
  });
}

function setupHeroSearch() {
  const searchInput = $('heroSearch');
  if (!searchInput) return;
  searchInput.addEventListener('input', () => { renderHeroButtons(heroData, searchInput.value); });
}

/* ——— SELECT HERO ——— */
function selectHero(heroId) {
  const hero = heroData.find(h => h.id === heroId);
  if (!hero) { console.warn('Hero not found:', heroId); return; }

  const phase = getCurrentPhase(state);
  if (!phase) { console.warn('No active phase'); return; }

  const sideKey = phase.side === 'A' ? 'teamA' : 'teamB';
  const index = phase.index;

  const usedHeroes = getUsedHeroes(state);
  if (usedHeroes.includes(hero.name)) { console.log(`⚠️ ${hero.name} already used`); return; }

  console.log(`🔥 ${hero.name} → ${sideKey} slot ${index} (${phase.type})`);

  if (phase.type === 'pick') state[sideKey].players[index].hero = hero.name;
  else if (phase.type === 'ban') state[sideKey].bans[index] = hero.name;

  commit();
  advancePhase();
}

/* ——— ADVANCE PHASE (double-pick aware + last-pick delay) ——— */
function advancePhase() {
  const prevPhase = getCurrentPhase(state);
  const nextIndex = state.currentPhaseIndex + 1;

  if (nextIndex >= DRAFT_PHASES.length) {
    // Last pick — mark complete, but keep view on 'draft' for 2.5s
    // (2.2s overlay + 0.4s pop ≈ 2.6s total — 2.5s is the sweet spot to just land)
    state.isDraftComplete = true;
    state.currentPhaseIndex = DRAFT_PHASES.length - 1;
    state.phaseLabel = 'DRAFT COMPLETE';
    state.live = { side: null, type: 'pick', index: 0 };
    state = pauseTimer(state);
    state.timer.remaining = 0;
    commit();
    populateForm();

    setTimeout(() => {
      state.view = 'complete';
      commit();
      populateForm();
    }, 2500);
    return;
  }

  const nextPhase = DRAFT_PHASES[nextIndex];
  const sameGroupTurn =
    prevPhase &&
    nextPhase.side === prevPhase.side &&
    nextPhase.type === prevPhase.type;

  state.currentPhaseIndex = nextIndex;
  state.isDraftComplete = false;
  state.phaseLabel = getPhaseLabel(state);
  state = updateLiveFromPhase(state);

  if (!sameGroupTurn) {
    state = resetTimer(state);
    state = startTimer(state);
  }

  commit(); populateForm();
}

/* ——— RESET DRAFT (full wipe) ——— */
if (btnResetDraft) btnResetDraft.addEventListener('click', () => {
  if (!confirm('🔥 Reset the ENTIRE draft? This clears teams, picks, bans, and returns to pre-draft.')) return;
  state = defaultDraftState();
  state.phaseLabel = getPhaseLabel(state);
  state = updateLiveFromPhase(state);
  commit();
  populateForm();
});

/* ——— NEXT DRAFT ——— */
if (btnNextDraft) btnNextDraft.addEventListener('click', () => {
  if (!confirm('▶ Start the next draft? Current picks and bans will be cleared.')) return;
  resetDraftProgress();
  state.view = 'pre';
  commit();
  populateForm();
});

/* ——— SWITCH SIDES ——— */
if (btnSwitchSides) btnSwitchSides.addEventListener('click', () => {
  if (!confirm('⇄ Switch sides? Team names and logos will swap.')) return;
  state = switchSides(state);
  commit();
  populateForm();
});

/* ——— START DRAFT ——— */
if (btnStartDraft) btnStartDraft.addEventListener('click', () => {
  resetDraftProgress();
  state.view = 'draft';
  state = resetTimer(state);
  state = startTimer(state);
  commit(); populateForm();
});

/* ——— SHARED DRAFT-RESET HELPER ——— */
function resetDraftProgress() {
  state.currentPhaseIndex = 0;
  state.isDraftComplete = false;
  state.phaseLabel = getPhaseLabel(state);
  state.live = { side: null, type: 'pick', index: 0 };
  state = updateLiveFromPhase(state);

  ['teamA', 'teamB'].forEach(key => {
    state[key].players = state[key].players.map(() => ({ name: '', hero: '' }));
    state[key].bans = ['', '', '', '', ''];
  });

  state.timer.remaining = state.timer.duration;
  state.timer.running = false;
  state.timer.endTime = null;
}

/* ——— TIMER TICK ——— */
function startTimerTick() {
  if (controlInterval) clearInterval(controlInterval);
  controlInterval = setInterval(() => {
    if (state.timer.running) {
      const remaining = timerRemainingSeconds(state.timer);
      if (remaining <= 0) {
        state = pauseTimer(state);
        commit();
        advancePhase();
      } else {
        updateTimerDisplay();
      }
    }
  }, 250);
}

/* ——— BOOT ——— */
populateForm();
startTimerTick();

onDraftStateChange((newState) => { state = newState; populateForm(); });

document.addEventListener('keydown', (e) => {
  if (e.target.tagName !== 'INPUT' && e.target.tagName !== 'SELECT') {
    if (e.code === 'Space') {
      e.preventDefault();
      if (state.timer.running) btnPause && btnPause.click();
      else btnStart && btnStart.click();
    }
    if (e.key === 'r' || e.key === 'R') {
      if (!e.ctrlKey && !e.metaKey) btnResetDraft && btnResetDraft.click();
    }
  }
});

loadHeroes().then(() => { setupHeroSearch(); });

console.log('🔥 Phoenix Draft — Control Panel loaded (v11).');