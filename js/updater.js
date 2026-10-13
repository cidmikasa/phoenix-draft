/**
 * ============================================================
 * PHOENIX DRAFT — HERO UPDATER
 * Checks remote version.json against local heroes-version.json.
 * Downloads updated heroes.json if remote is newer.
 * Works in Electron (userData) and browser (localStorage fallback).
 * ============================================================
 */

const HERO_UPDATER = {
  status: 'idle', // idle | checking | downloading | done | error
  lastCheck: null,
  lastError: null
};

/**
 * Compare two semver-ish version strings: "1.0.0" vs "1.2.3"
 * Returns 1 if a > b, -1 if a < b, 0 if equal.
 */
function compareVersions(a, b) {
  const pa = String(a || '0').split('.').map(n => parseInt(n, 10) || 0);
  const pb = String(b || '0').split('.').map(n => parseInt(n, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const na = pa[i] || 0;
    const nb = pb[i] || 0;
    if (na > nb) return 1;
    if (na < nb) return -1;
  }
  return 0;
}

/**
 * Get local version info.
 * Prefers Electron userData, falls back to bundled heroes-version.json.
 */
async function getLocalVersion() {
  if (window.electronAPI && window.electronAPI.readLocalVersion) {
    const v = await window.electronAPI.readLocalVersion();
    if (v) return v;
  }
  // Fallback: bundled version
  try {
    const res = await fetch('heroes-version.json');
    if (res.ok) return await res.json();
  } catch (e) {}
  return { version: '0.0.0' };
}

/**
 * Fetch remote version.json.
 */
async function getRemoteVersion(remoteUrl) {
  const res = await fetch(remoteUrl, { cache: 'no-store' });
  if (!res.ok) throw new Error('Remote version fetch failed: ' + res.status);
  return await res.json();
}

/**
 * Download remote heroes.json.
 */
async function fetchRemoteHeroes(baseUrl, heroesFilename) {
  const url = baseUrl.replace(/\/[^/]*$/, '/') + (heroesFilename || 'heroes.json');
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error('Heroes fetch failed: ' + res.status);
  return await res.json();
}

/**
 * Main update check. Returns a status object.
 */
async function checkForHeroUpdates(opts = {}) {
  const { silent = false, onStatus = null } = opts;
  const status = (s) => {
    HERO_UPDATER.status = s;
    if (onStatus) onStatus(s);
    console.log('[HERO UPDATER]', s);
  };

  try {
    status('checking');
    HERO_UPDATER.lastError = null;

    const local = await getLocalVersion();
    if (!local.remoteUrl) throw new Error('No remoteUrl configured');

    const remote = await getRemoteVersion(local.remoteUrl);

    if (compareVersions(remote.version, local.version) <= 0) {
      status('done');
      HERO_UPDATER.lastCheck = new Date().toISOString();
      return { updated: false, version: local.version };
    }

    status('downloading');
    const baseUrl = local.remoteUrl.replace(/\/[^/]*$/, '/');
    const newHeroes = await fetchRemoteHeroes(baseUrl, remote.heroesUrl || 'heroes.json');

    // Save to Electron userData (or localStorage in browser)
    if (window.electronAPI && window.electronAPI.writeLocalHeroes) {
      await window.electronAPI.writeLocalHeroes(newHeroes);
      await window.electronAPI.writeLocalVersion({
        version: remote.version,
        updated: remote.updated,
        remoteUrl: local.remoteUrl,
        heroCount: newHeroes.length
      });
    } else {
      try {
        localStorage.setItem('phoenix_heroes_cache', JSON.stringify(newHeroes));
        localStorage.setItem('phoenix_heroes_version', JSON.stringify(remote));
      } catch (e) { /* ignore quota */ }
    }

    // Update the runtime hero data
    window.heroData = newHeroes;

    status('done');
    HERO_UPDATER.lastCheck = new Date().toISOString();
    return { updated: true, version: remote.version, heroCount: newHeroes.length };
  } catch (e) {
    status('error');
    HERO_UPDATER.lastError = e.message;
    if (!silent) console.warn('Hero update check failed:', e);
    return { updated: false, error: e.message };
  }
}

/**
 * Load heroes: prefer userData cache, fall back to bundled heroes.json.
 */
async function loadHeroesWithCache() {
  // 1. Try userData (Electron)
  if (window.electronAPI && window.electronAPI.readLocalHeroes) {
    try {
      const cached = await window.electronAPI.readLocalHeroes();
      if (Array.isArray(cached) && cached.length > 0) {
        console.log(`🔥 Loaded ${cached.length} heroes from userData`);
        return cached;
      }
    } catch (e) {}
  }

  // 2. Try localStorage (browser fallback)
  try {
    const cached = localStorage.getItem('phoenix_heroes_cache');
    if (cached) {
      const parsed = JSON.parse(cached);
      if (Array.isArray(parsed) && parsed.length > 0) {
        console.log(`🔥 Loaded ${parsed.length} heroes from localStorage`);
        return parsed;
      }
    }
  } catch (e) {}

  // 3. Fall back to bundled heroes.json
  try {
    const res = await fetch('assets/heroes.json');
    const data = await res.json();
    const heroes = Array.isArray(data) ? data : (data.heroes || []);
    console.log(`🔥 Loaded ${heroes.length} heroes from bundled assets`);
    return heroes;
  } catch (e) {
    console.error('Failed to load any heroes:', e);
    return [];
  }
}

window.HERO_UPDATER = HERO_UPDATER;
window.checkForHeroUpdates = checkForHeroUpdates;
window.loadHeroesWithCache = loadHeroesWithCache;
window.compareVersions = compareVersions;