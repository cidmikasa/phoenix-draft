/**
 * ============================================================
 * PHOENIX DRAFT — HERO UPDATER SCRIPT (run locally)
 * ============================================================
 * Usage:   npm run update-heroes
 *
 * What it does:
 *   1. Fetches current heroes.json from your phoenix-draft-data repo
 *   2. Fetches hero list from a source (MLBB wiki / API)
 *   3. Diffs them — shows what's new
 *   4. Asks for confirmation
 *   5. Bumps version + pushes to phoenix-draft-data
 * ============================================================
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { execSync } = require('child_process');

const DATA_REPO_DIR = path.join(require('os').homedir(), 'phoenix-draft-data');
const LOCAL_HEROES_FILE = path.join(DATA_REPO_DIR, 'heroes.json');
const LOCAL_VERSION_FILE = path.join(DATA_REPO_DIR, 'version.json');

// ——— COLORS ———
const C = {
  reset: '\x1b[0m',
  cyan: '\x1b[36m',
  gold: '\x1b[33m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  dim: '\x1b[90m'
};

function log(msg, color = 'reset') { console.log(C[color] + msg + C.reset); }

// ——— ASK ———
function ask(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, (answer) => { rl.close(); resolve(answer); });
  });
}

// ——— VERSION BUMP ———
function bumpPatch(version) {
  const p = version.split('.').map(n => parseInt(n, 10) || 0);
  p[2] = (p[2] || 0) + 1;
  return p.join('.');
}

// ——— FETCH FROM MLBB WIKI ———
async function fetchHeroListFromWiki() {
  log('Fetching hero list from MLBB wiki...', 'cyan');

  // The fandom wiki has a public API we can hit
  const url = 'https://mobile-legends.fandom.com/api.php?action=query&list=categorymembers&cmtitle=Category:Heroes&cmlimit=500&format=json&origin=*';

  try {
    const res = await fetch(url);
    const data = await res.json();
    const members = data?.query?.categorymembers || [];

    const heroes = members
      .map(m => m.title)
      .filter(t => t && !t.startsWith('Category:') && !t.includes('/'))
      .map((name, i) => ({
        id: i + 1,
        name: name,
        slug: name.toLowerCase().replace(/\s+/g, '-'),
        roles: [],
        lanes: [],
        images: {
          round: `./images/${i + 1}-${name.toLowerCase().replace(/\s+/g, '-')}-round.png`,
          rectangle: `./images/${i + 1}-${name.toLowerCase().replace(/\s+/g, '-')}.png`
        }
      }));

    return heroes;
  } catch (e) {
    log('Wiki fetch failed: ' + e.message, 'red');
    return [];
  }
}

// ——— MAIN ———
async function main() {
  log('\n🔥 PHOENIX DRAFT — HERO UPDATER\n', 'gold');

  // 1. Check data repo exists
  if (!fs.existsSync(LOCAL_HEROES_FILE)) {
    log(`❌ Data repo not found at ${DATA_REPO_DIR}`, 'red');
    log('   Clone it first: git clone https://github.com/cidmikasa/phoenix-draft-data.git', 'dim');
    process.exit(1);
  }

  const localHeroes = JSON.parse(fs.readFileSync(LOCAL_HEROES_FILE, 'utf8'));
  const localVersion = JSON.parse(fs.readFileSync(LOCAL_VERSION_FILE, 'utf8'));

  log(`📦 Local:  ${localHeroes.length} heroes (v${localVersion.version})`, 'cyan');

  // 2. Fetch fresh list
  const remoteHeroes = await fetchHeroListFromWiki();
  log(`🌐 Remote: ${remoteHeroes.length} heroes`, 'cyan');

  // 3. Diff
  const localNames = new Set(localHeroes.map(h => h.name.toLowerCase()));
  const newHeroes = remoteHeroes.filter(h => !localNames.has(h.name.toLowerCase()));

  if (newHeroes.length === 0) {
    log('\n✅ No new heroes found. Everything up to date.', 'green');
    process.exit(0);
  }

  // 4. Show diff
  log('\n🆕 New heroes detected:', 'gold');
  newHeroes.forEach(h => log('   + ' + h.name, 'green'));

  // 5. Confirm
  const answer = await ask(`\nAdd ${newHeroes.length} new hero(es)? (y/n): `);
  if (answer.toLowerCase() !== 'y') {
    log('Aborted.', 'dim');
    process.exit(0);
  }

  // 6. Merge (append new heroes with sequential IDs)
  const merged = localHeroes.concat(
    newHeroes.map((h, i) => ({ ...h, id: localHeroes.length + i + 1 }))
  );

  // 7. Bump version
  const newVersion = bumpPatch(localVersion.version);
  const updatedVersion = {
    ...localVersion,
    version: newVersion,
    updated: new Date().toISOString(),
    heroCount: merged.length,
    changelog: `Added ${newHeroes.length} new hero(es): ${newHeroes.map(h => h.name).join(', ')}`
  };

  // 8. Write
  fs.writeFileSync(LOCAL_HEROES_FILE, JSON.stringify(merged, null, 2));
  fs.writeFileSync(LOCAL_VERSION_FILE, JSON.stringify(updatedVersion, null, 2));

  log(`\n💾 Saved heroes.json (${merged.length} heroes)`, 'green');
  log(`💾 Saved version.json (v${newVersion})`, 'green');

  // 9. Commit + push
  log('\n📤 Pushing to GitHub...', 'cyan');
  try {
    execSync('git add heroes.json version.json', { cwd: DATA_REPO_DIR, stdio: 'inherit' });
    execSync(`git commit -m "Add ${newHeroes.length} new hero(es): ${newHeroes.map(h => h.name).join(', ')}"`, { cwd: DATA_REPO_DIR, stdio: 'inherit' });
    execSync('git push', { cwd: DATA_REPO_DIR, stdio: 'inherit' });
    log('\n✅ Pushed! Apps will auto-update on next launch.', 'green');
  } catch (e) {
    log('\n❌ Push failed. Commit locally — push manually.', 'red');
  }

  log('\n🔥 Done.\n', 'gold');
}

main().catch(e => {
  log('Fatal error: ' + e.message, 'red');
  process.exit(1);
});