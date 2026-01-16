#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');
const axios = require('axios');
const qs = require('querystring');
const fg = require('fast-glob');
const stringSimilarity = require('string-similarity');

// ---------------------- CONFIG ----------------------
const DEST_DIR = '/data/torrent';
const CACHE_DIR = '/data/cache_tmdb';
const FINGERPRINT_FILE = '/data/trackers.fingerprint.sha256';

const ENABLE_FILMS = process.env.ENABLE_FILMS === 'true';
const ENABLE_SERIES = process.env.ENABLE_SERIES === 'true';

const MEDIA_CONFIG = [
  ENABLE_FILMS && {
    name: 'films',
    source: '/films',
    dest: path.join(DEST_DIR, 'films')
  },
  ENABLE_SERIES && {
    name: 'series',
    source: '/series',
    dest: path.join(DEST_DIR, 'series')
  }
].filter(Boolean);

const TRACKERS = (process.env.TRACKERS || '')
  .split(',')
  .map(t => t.trim())
  .filter(Boolean);

const TMDB_API_KEY = process.env.TMDB_API_KEY;
const PARALLEL_JOBS = Math.max(1, parseInt(process.env.PARALLEL_JOBS || '1', 10));

if (!TRACKERS.length || !TMDB_API_KEY || !MEDIA_CONFIG.length) {
  console.error('❌ Configuration invalide');
  process.exit(1);
}

const VIDEO_EXT = ['mkv','mp4','avi','mov','flv','wmv','m4v'];

fs.mkdirSync(CACHE_DIR, { recursive: true });
fs.mkdirSync(DEST_DIR, { recursive: true });
for (const m of MEDIA_CONFIG) {
  fs.mkdirSync(m.dest, { recursive: true });
}

// ---------------------- FINGERPRINT ----------------------
function computeFingerprint(trackers) {
  return crypto
    .createHash('sha256')
    .update(trackers.slice().sort().join('|'))
    .digest('hex');
}

const currentFingerprint = computeFingerprint(TRACKERS);
const previousFingerprint = fs.existsSync(FINGERPRINT_FILE)
  ? fs.readFileSync(FINGERPRINT_FILE, 'utf8').trim()
  : null;

const TRACKERS_CHANGED = currentFingerprint !== previousFingerprint;
let SHOULD_WRITE_FINGERPRINT = false;

if (TRACKERS_CHANGED) {
  console.log('🔁 Trackers modifiés → mise à jour des torrents existants');
  SHOULD_WRITE_FINGERPRINT = true;
}

// ---------------------- STATS ----------------------
let trackersScanned = 0;
let trackersUpdated = 0;
let trackersSkipped = 0;
let processed = 0;
let skipped = 0;
let tmdbFound = 0;
let tmdbMissing = 0;
const startTime = Date.now();

// ---------------------- UTIL ----------------------
const safeName = name => name.replace(/ /g, '.');
const cleanTitle = title =>
  String(title || '').replace(/[^a-zA-Z0-9 ]/g, '').trim();

const isVideoFile = f =>
  VIDEO_EXT.includes(path.extname(f).slice(1).toLowerCase());

function execAsync(cmd, args = []) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '', err = '';
    p.stdout.on('data', d => out += d);
    p.stderr.on('data', d => err += d);
    p.on('close', code => code === 0 ? resolve(out) : reject(err));
  });
}

function formatDuration(ms) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m ${s % 60}s`;
}

// ---------------------- TORRENT MODIFY ----------------------
async function modifyTorrentTrackers(torrentPath) {
  // nom du torrent sans chemin ni extension
  const outputBase = path.parse(torrentPath).name;

  const args = [
    'modify',
    torrentPath
  ];

  TRACKERS.forEach(t => args.push('--tracker', t));

  args.push('--output', outputBase);

  await execAsync('mkbrr', args);
  trackersUpdated++;
}

// ---------------------- UPDATE EXISTING TORRENTS ----------------------
async function updateAllTorrentsIfNeeded() {
  if (!TRACKERS_CHANGED) return;

  const torrents = await fg(`${DEST_DIR}/**/*.torrent`);
  trackersScanned = torrents.length;

  if (!torrents.length) {
    console.log('ℹ️ Aucun torrent existant à mettre à jour');
    return;
  }

  console.log(`🛠️ Mise à jour announce sur ${torrents.length} torrents`);

await runTasks(
  torrents.map(t => async () => {
    try {
      await modifyTorrentTrackers(t);
    } catch (err) {
      trackersSkipped++;
      console.error('❌ Échec modification torrent :', t);
      console.error(String(err));
    }
  }),
  PARALLEL_JOBS
);
}

// ---------------------- TMDB ----------------------
async function runPythonGuessit(filePath) {
  try {
    const out = await execAsync('python3', ['-c', `
import json
from guessit import guessit
f = guessit("${filePath}")
print(json.dumps({'title': f.get('title',''), 'year': f.get('year','')}))
    `]);
    return JSON.parse(out);
  } catch {
    return { title: path.parse(filePath).name, year: '' };
  }
}

async function searchTMDb(title, year, language) {
  const query = qs.escape(cleanTitle(title));
  const url = `https://api.themoviedb.org/3/search/movie?api_key=${TMDB_API_KEY}&query=${query}&language=${language}`;
  try {
    const res = await axios.get(url);
    return res.data.results?.[0] || null;
  } catch {
    return null;
  }
}

async function getCachedMovie(title, year, language) {
  const key = safeName(`${title}_${year}_${language}`).toLowerCase();
  const file = path.join(CACHE_DIR, key + '.json');
  if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file));
  const movie = await searchTMDb(title, year, language);
  if (movie) fs.writeFileSync(file, JSON.stringify(movie, null, 2));
  return movie;
}

// ---------------------- PROCESS FILE ----------------------
async function processFile(file, destBase, index, total, label) {
  const nameNoExt = path.parse(file).name;
  const name = safeName(nameNoExt);
  const outDir = path.join(destBase, name);
  const nfo = path.join(outDir, `${name}.nfo`);
  const torrent = path.join(outDir, `${name}.torrent`);
  const txt = path.join(outDir, `${name}.txt`);

  if (fs.existsSync(nfo) && fs.existsSync(torrent) && fs.existsSync(txt)) {
    skipped++;
    console.log(`⏭️ Déjà traité : ${path.basename(file)}`);
    return;
  }

  console.log(`📊 ${label} ${index}/${total} → ${path.basename(file)}`);
  fs.mkdirSync(outDir, { recursive: true });

  if (!fs.existsSync(nfo)) {
    let mediadata = await execAsync('mediainfo', [file]);
    mediadata = mediadata.replace(
      /^Complete name\s*:.*$/m,
      `Complete name : ${path.basename(file)}`
    );
    fs.writeFileSync(nfo, `
============================================================
Release Name : ${nameNoExt}
Added On    : ${new Date().toISOString().replace('T',' ').split('.')[0]}
============================================================

${mediadata}

============================================================
Generated by torrentify
============================================================
`.trim());
  }

  if (!fs.existsSync(torrent)) {
    const args = ['create', file, '--output', torrent, '--private'];
    TRACKERS.forEach(t => args.push('--tracker', t));
    await execAsync('mkbrr', args);
  }

  if (!fs.existsSync(txt)) {
    const g = await runPythonGuessit(file);
    const m = await getCachedMovie(g.title, g.year, 'en-US');
    if (m?.id) {
      tmdbFound++;
      fs.writeFileSync(txt, `ID TMDB : ${m.id}`);
    } else {
      tmdbMissing++;
      fs.writeFileSync(txt, 'TMDB not found');
      console.log(`⚠️ TMDb non trouvé : ${g.title}`);
    }
  }

  processed++;
}

// ---------------------- SERIES META ----------------------
async function createSeriesMeta(outDir, name, videoFile) {
  const nfo = path.join(outDir, `${name}.nfo`);
  const txt = path.join(outDir, `${name}.txt`);

  if (!fs.existsSync(nfo)) {
    let mediadata = await execAsync('mediainfo', [videoFile]);
    mediadata = mediadata.replace(
      /^Complete name\s*:.*$/m,
      `Complete name : ${path.basename(videoFile)}`
    );
    fs.writeFileSync(nfo, `
============================================================
Release Name : ${name}
Added On    : ${new Date().toISOString().replace('T',' ').split('.')[0]}
============================================================

${mediadata}

============================================================
Generated by torrentify
============================================================
`.trim());
  }

  if (!fs.existsSync(txt)) {
    const g = await runPythonGuessit(videoFile);
    const m = await getCachedMovie(g.title, g.year, 'en-US');
    if (m?.id) {
      tmdbFound++;
      fs.writeFileSync(txt, `ID TMDB : ${m.id}`);
    } else {
      tmdbMissing++;
      fs.writeFileSync(txt, 'TMDB not found');
      console.log(`⚠️ TMDb non trouvé (série) : ${g.title}`);
    }
  }
}

// ---------------------- SERIES FOLDER ----------------------
async function processSeriesFolder(folder, destBase, index, total) {
  const videos = await fg(VIDEO_EXT.map(e => `${folder}/**/*.${e}`));
  if (!videos.length) return;

  const name = safeName(path.basename(folder));
  const outDir = path.join(destBase, name);
  const torrent = path.join(outDir, `${name}.torrent`);
  const nfo = path.join(outDir, `${name}.nfo`);
  const txt = path.join(outDir, `${name}.txt`);

  if (fs.existsSync(torrent) && fs.existsSync(nfo) && fs.existsSync(txt)) {
    skipped++;
    console.log(`⏭️ Déjà traité (dossier complet) : ${name}`);
    return;
  }

  console.log(`📊 Série ${index}/${total} → ${name} (${videos.length} fichiers)`);
  fs.mkdirSync(outDir, { recursive: true });

  await createSeriesMeta(outDir, name, videos[0]);

  if (!fs.existsSync(torrent)) {
    const args = [
      'create',
      folder,
      '--output', torrent,
      '--private'
    ];

    TRACKERS.forEach(t => args.push('--tracker', t));

    await execAsync('mkbrr', args);
  }

  processed++;
}

// ---------------------- PARALLEL ----------------------
async function runTasks(tasks, limit) {
  const running = new Set();
  for (const t of tasks) {
    const p = t();
    running.add(p);
    p.finally(() => running.delete(p));
    if (running.size >= limit) await Promise.race(running);
  }
  await Promise.all(running);
}

// ---------------------- MAIN ----------------------
(async () => {
  console.log('🚀 Scan initial au démarrage');
  
    // UPDATE TRACKERS AVANT TOUT
  await updateAllTorrentsIfNeeded();
  
  if (SHOULD_WRITE_FINGERPRINT) {
    fs.writeFileSync(FINGERPRINT_FILE, currentFingerprint);
  }

  for (const media of MEDIA_CONFIG) {

    console.log(
      PARALLEL_JOBS === 1
        ? `▶️ ${media.name} : mode séquentiel`
        : `⚡ ${media.name} : mode parallèle (${PARALLEL_JOBS} jobs)`
    );

    if (media.name === 'films') {
      const files = await fg(VIDEO_EXT.map(e => `${media.source}/**/*.${e}`));
      let i = 0;
      const total = files.length;

      await runTasks(
        files.map(f => () => processFile(f, media.dest, ++i, total, 'Film')),
        PARALLEL_JOBS
      );
    }

    if (media.name === 'series') {
      const entries = fs.readdirSync(media.source, { withFileTypes: true });
      const tasks = [];
      let i = 0;
      const total = entries.length;

      for (const e of entries) {
        const full = path.join(media.source, e.name);

        if (e.isFile() && isVideoFile(e.name)) {
          tasks.push(() =>
            processFile(full, media.dest, ++i, total, 'Série fichier')
          );
        }

        if (e.isDirectory()) {
          tasks.push(() =>
            processSeriesFolder(full, media.dest, ++i, total)
          );
        }
      }

      if (!tasks.length) {
        console.log('ℹ️ Aucun contenu série à traiter');
        continue;
      }

      await runTasks(tasks, PARALLEL_JOBS);
    }
  }

  const totalTime = Date.now() - startTime;

console.log('\n📊 Résumé final');
console.log('==============================');

if (TRACKERS_CHANGED) {
  console.log('🛠️ Mise à jour announce');
  console.log(`   🔍 Torrents analysés : ${trackersScanned}`);
  console.log(`   🔁 Torrents modifiés : ${trackersUpdated}`);
  console.log(`   ⏭️ Torrents ignorés  : ${trackersSkipped}`);
  console.log('------------------------------');
}

console.log(`🎞️ Traités           : ${processed}`);
console.log(`⏭️ Déjà existants     : ${skipped}`);
console.log(`🎬 TMDb trouvés       : ${tmdbFound}`);
console.log(`⚠️ TMDb manquants     : ${tmdbMissing}`);
console.log(`⏱️ Temps total        : ${formatDuration(totalTime)}`);
console.log('==============================');
})();
