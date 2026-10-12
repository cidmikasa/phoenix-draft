/**
 * ============================================================
 * PHOENIX DRAFT — STATE ENGINE v7
 * Adds sponsors[] for flexible sponsor logos.
 * ============================================================
 */

const STORAGE_KEY = 'phoenix_draft_state_v5';
const DEFAULT_TIMER = 50;
const MAX_SPONSORS = 6;

const DRAFT_PHASES = [
  { type: 'ban', side: 'A', index: 0 },
  { type: 'ban', side: 'B', index: 0 },
  { type: 'ban', side: 'A', index: 1 },
  { type: 'ban', side: 'B', index: 1 },
  { type: 'ban', side: 'A', index: 2 },
  { type: 'ban', side: 'B', index: 2 },
  { type: 'pick', side: 'A', index: 0 },
  { type: 'pick', side: 'B', index: 0 },
  { type: 'pick', side: 'B', index: 1 },
  { type: 'pick', side: 'A', index: 1 },
  { type: 'pick', side: 'A', index: 2 },
  { type: 'pick', side: 'B', index: 2 },
  { type: 'ban', side: 'B', index: 3 },
  { type: 'ban', side: 'A', index: 3 },
  { type: 'ban', side: 'B', index: 4 },
  { type: 'ban', side: 'A', index: 4 },
  { type: 'pick', side: 'B', index: 3 },
  { type: 'pick', side: 'A', index: 3 },
  { type: 'pick', side: 'A', index: 4 },
  { type: 'pick', side: 'B', index: 4 }
];

const PHASE_LABELS = { 'ban': 'BAN PHASE', 'pick': 'PICK PHASE' };

function emptyPlayers() {
  return Array.from({ length: 5 }, () => ({ name: '', hero: '' }));
}
function emptyBans() {
  return Array.from({ length: 5 }, () => '');
}

function defaultDraftState() {
  return {
    view: 'pre',
    round: 'GAME 01 · BEST OF 3',
    broadcastLogo: '',
    broadcastLabel: 'LIVE DRAFT',

    matchFormat: 'BO3',
    scoreA: 0,
    scoreB: 0,

    /* Sponsor logos (base64 strings, max 6) */
    sponsors: [],

    currentPhaseIndex: 0,
    isDraftComplete: false,
    teamA: { name: 'TEAM ALPHA', crest: 'A', logo: '', players: emptyPlayers(), bans: emptyBans() },
    teamB: { name: 'TEAM BRAVO', crest: 'B', logo: '', players: emptyPlayers(), bans: emptyBans() },
    live: { side: null, type: 'pick', index: 0 },
    timer: { duration: DEFAULT_TIMER, remaining: DEFAULT_TIMER, running: false, endTime: null }
  };
}

function getCurrentPhase(state) {
  const idx = state.currentPhaseIndex;
  if (idx >= DRAFT_PHASES.length) return null;
  return DRAFT_PHASES[idx];
}
function getNextPhase(state) {
  const idx = state.currentPhaseIndex + 1;
  if (idx >= DRAFT_PHASES.length) return null;
  return DRAFT_PHASES[idx];
}
function getPhaseLabel(state) {
  const phase = getCurrentPhase(state);
  if (!phase) return 'DRAFT COMPLETE';
  const type = phase.type;
  const count = DRAFT_PHASES.slice(0, state.currentPhaseIndex + 1).filter(p => p.type === type).length;
  const block = Math.ceil(count / 2);
  return `${PHASE_LABELS[type]} ${block}`;
}
function updateLiveFromPhase(state) {
  const phase = getCurrentPhase(state);
  if (!phase) {
    state.live = { side: null, type: 'pick', index: 0 };
    return state;
  }
  const group = getPickGroup(state);
  if (group && group.start !== group.end) {
    const startPhase = DRAFT_PHASES[group.start];
    state.live = { side: phase.side, type: phase.type, index: startPhase.index };
  } else {
    state.live = { side: phase.side, type: phase.type, index: phase.index };
  }
  return state;
}
function getPickGroup(state) {
  const phase = getCurrentPhase(state);
  if (!phase || phase.type !== 'pick') return null;
  const idx = state.currentPhaseIndex;
  const side = phase.side;
  const type = phase.type;
  const nextPhase = DRAFT_PHASES[idx + 1];
  if (nextPhase && nextPhase.side === side && nextPhase.type === type) {
    return { start: idx, end: idx + 1, side: side, type: type };
  }
  const prevPhase = DRAFT_PHASES[idx - 1];
  if (prevPhase && prevPhase.side === side && prevPhase.type === type) {
    return { start: idx - 1, end: idx, side: side, type: type };
  }
  return { start: idx, end: idx, side: side, type: type };
}
function getUsedHeroes(state) {
  const used = [];
  ['teamA', 'teamB'].forEach(key => {
    state[key].players.forEach(p => { if (p.hero) used.push(p.hero); });
    state[key].bans.forEach(b => { if (b) used.push(b); });
  });
  return used;
}

function dotsPerSide(format) {
  switch (format) {
    case 'BO1': return 1;
    case 'BO3': return 2;
    case 'BO5': return 3;
    case 'BO7': return 4;
    default:    return 2;
  }
}
function matchFormatLabel(format) {
  switch (format) {
    case 'BO1': return 'BEST OF 1';
    case 'BO3': return 'BEST OF 3';
    case 'BO5': return 'BEST OF 5';
    case 'BO7': return 'BEST OF 7';
    default:    return 'BEST OF 3';
  }
}

function loadDraftState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultDraftState();
    const parsed = JSON.parse(raw);
    const def = defaultDraftState();
    return {
      ...def, ...parsed,
      teamA: { ...def.teamA, ...parsed.teamA },
      teamB: { ...def.teamB, ...parsed.teamB },
      live: { ...def.live, ...(parsed.live || {}) },
      timer: { ...def.timer, ...(parsed.timer || {}) },
      sponsors: Array.isArray(parsed.sponsors) ? parsed.sponsors : []
    };
  } catch (e) {
    console.warn('Failed to load state, using default.', e);
    return defaultDraftState();
  }
}
function saveDraftState(state) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
  catch (e) { console.error('Failed to save state.', e); }
}
function onDraftStateChange(callback) {
  window.addEventListener('storage', (e) => {
    if (e.key === STORAGE_KEY) callback(loadDraftState());
  });
}

function timerRemainingSeconds(timer) {
  if (timer.running && timer.endTime) {
    return Math.max(0, Math.round((timer.endTime - Date.now()) / 1000));
  }
  return timer.remaining;
}
function startTimer(state) {
  const rem = timerRemainingSeconds(state.timer) || state.timer.duration;
  state.timer.running = true;
  state.timer.endTime = Date.now() + rem * 1000;
  state.timer.remaining = rem;
  return state;
}
function pauseTimer(state) {
  state.timer.remaining = timerRemainingSeconds(state.timer);
  state.timer.running = false;
  state.timer.endTime = null;
  return state;
}
function resetTimer(state) {
  state.timer.remaining = state.timer.duration;
  state.timer.running = false;
  state.timer.endTime = null;
  return state;
}
function setTimerDuration(state, seconds) {
  const sec = Math.max(1, Math.round(seconds) || DEFAULT_TIMER);
  state.timer.duration = sec;
  state.timer.remaining = sec;
  state.timer.running = false;
  state.timer.endTime = null;
  return state;
}
function formatSeconds(total) {
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
function setView(state, viewName) {
  state.view = viewName;
  return state;
}

/* Switch sides — swaps team names + crests + logos only. */
function switchSides(state) {
  const tmpName  = state.teamA.name;
  const tmpCrest = state.teamA.crest;
  const tmpLogo  = state.teamA.logo;

  state.teamA.name  = state.teamB.name;
  state.teamA.crest = state.teamB.crest;
  state.teamA.logo  = state.teamB.logo;

  state.teamB.name  = tmpName;
  state.teamB.crest = tmpCrest;
  state.teamB.logo  = tmpLogo;

  return state;
}

window.DRAFT_PHASES = DRAFT_PHASES;
window.PHASE_LABELS = PHASE_LABELS;
window.MAX_SPONSORS = MAX_SPONSORS;
window.emptyPlayers = emptyPlayers;
window.emptyBans = emptyBans;
window.defaultDraftState = defaultDraftState;
window.getCurrentPhase = getCurrentPhase;
window.getNextPhase = getNextPhase;
window.getPhaseLabel = getPhaseLabel;
window.updateLiveFromPhase = updateLiveFromPhase;
window.getPickGroup = getPickGroup;
window.getUsedHeroes = getUsedHeroes;
window.dotsPerSide = dotsPerSide;
window.matchFormatLabel = matchFormatLabel;
window.loadDraftState = loadDraftState;
window.saveDraftState = saveDraftState;
window.onDraftStateChange = onDraftStateChange;
window.timerRemainingSeconds = timerRemainingSeconds;
window.startTimer = startTimer;
window.pauseTimer = pauseTimer;
window.resetTimer = resetTimer;
window.setTimerDuration = setTimerDuration;
window.formatSeconds = formatSeconds;
window.setView = setView;
window.switchSides = switchSides;
window.STORAGE_KEY = STORAGE_KEY;