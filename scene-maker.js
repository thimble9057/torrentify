#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const axios = require('axios');
const qs = require('querystring');
const fg = require('fast-glob');
const stringSimilarity = require('string-similarity');

// ---------------------- CONFIG ----------------------
const DEST_DIR = '/data/torrent';
const CACHE_DIR = '/data/cache_tmdb';

const ENABLE_FILMS = process.env.ENABLE_FILMS === 'true';
const ENABLE_SERIES = process.env.ENABLE_SERIES === 'true';

const MEDIA_CONFIG = [
  ENABLE_FILMS && {
    name: 'films',
    source: '/data/films',
    dest: path.join(DEST_DIR, 'films')
  },
  ENABLE_SERIES && {
    name: 'series',
    source: '/data/series',
    dest: path.join(DEST_DIR, 'series')
  }
].filter(Boolean);

const TRACKERS = (process.env.TRACKERS || '').split(',').map(t => t.trim()).filter(Boolean);
const TMDB_API_KEY = process.env.TMDB_API_KEY;
const PARALLEL_JOBS = Math.max(1, parseInt(process.env.PARALLEL_JOBS || '1', 10));

if (!TRACKERS.length) {
  console.error('❌ Aucun tracker défini');
  process.exit(1);
}
if (!TMDB_API_KEY) {
  console.error('❌ TMDB_API_KEY non défini');
  process.exit(1);
}
if (!MEDIA_CONFIG.length) {
  console.error('❌ Aucun type de média activé (ENABLE_FILMS / ENABLE_SERIES)');
  process.exit(1);
}

const VIDEO_EXT = ['mkv','mp4','avi','mov','flv','wmv','m4v'];
if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });

// ---------------------- STATS ----------------------
let processed = 0;
let skipped = 0;
let tmdbFound = 0;
let tmdbMissing = 0;
const startTime = Date.now();

// ---------------------- UTIL ----------------------
const safeName = name => name.replace(/ /g, '.');
const cleanTitle = title => title.replace(/[^a-zA-Z0-9 ]/g, '').trim();

function execAsync(cmd, args = []) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    let err = '';

    p.stdout.on('data', d => out += d);
    p.stderr.on('data', d => err += d);

    p.on('close', code => {
      if (code === 0) resolve(out);
      else reject(new Error(err || `Commande échouée: ${cmd}`));
    });
  });
}

function formatDuration(ms) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m ${s % 60}s`;
}

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
    if (!res.data.results?.length) return null;

    let results = res.data.results;
    if (year) {
      const filtered = results.filter(r => r.release_date?.startsWith(year.toString()));
      if (filtered.length) results = filtered;
    }

    let best = null;
    let bestScore = 0;

    for (const r of results) {
      const score = stringSimilarity.compareTwoStrings(
        cleanTitle(title).toLowerCase(),
        (r.title || '').toLowerCase()
      );
      if (score > bestScore) {
        best = r;
        bestScore = score;
      }
    }
    return best;
  } catch {
    return null;
  }
}

async function getCachedMovie(title, year, language) {
  const key = safeName(`${title}_${year}_${language}`).toLowerCase();
  const file = path.join(CACHE_DIR, key + '.json');

  if (fs.existsSync(file)) {
    try { return JSON.parse(fs.readFileSync(file)); } catch {}
  }

  const movie = await searchTMDb(title, year, language);
  if (movie) fs.writeFileSync(file, JSON.stringify(movie, null, 2));
  return movie;
}

function getMktorrentL(file) {
  const size = fs.statSync(file).size;
  if (size < 512 * 1024 * 1024) return 20;
  if (size < 1 * 1024 ** 3) return 21;
  if (size < 2 * 1024 ** 3) return 22;
  if (size < 4 * 1024 ** 3) return 23;
  return 24;
}

// ---------------------- PROCESS ----------------------
async function processFile(file, index, total, destBase) {
  const nameNoExt = path.parse(file).name;
  const safeFolder = safeName(nameNoExt);
  const outDir = path.join(destBase, safeFolder);

  const nfo = path.join(outDir, `${safeFolder}.nfo`);
  const torrent = path.join(outDir, `${safeFolder}.torrent`);
  const txt = path.join(outDir, `${safeFolder}.txt`);

  if (fs.existsSync(nfo) && fs.existsSync(torrent) && fs.existsSync(txt)) {
    skipped++;
    console.log(`⏭️ Déjà traité : ${path.basename(file)}`);
    return;
  }

  console.log(`📊 Traitement ${index}/${total} → ${path.basename(file)}`);

  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

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
    const trackers = TRACKERS.flatMap(t => ['-a', t]);
    await execAsync('mktorrent', [
      '-l', getMktorrentL(file).toString(),
      ...trackers,
      '-o', torrent,
      file
    ]);
  }

  if (!fs.existsSync(txt)) {
    const guess = await runPythonGuessit(file);

    const movie =
      await getCachedMovie(guess.title, guess.year, 'en-US') ||
      await getCachedMovie(guess.title, guess.year, 'fr-FR') ||
      await getCachedMovie(guess.title, '', 'en-US');

    if (movie?.id) {
      tmdbFound++;
      fs.writeFileSync(txt, `ID TMDB : ${movie.id}\n`);
    } else {
      tmdbMissing++;
      fs.writeFileSync(txt, `TMDb non trouvé\n`);
      console.log(`⚠️ TMDb non trouvé : ${guess.title}`);
    }
  }

  processed++;
}

// ---------------------- PARALLEL ----------------------
async function runWithLimit(files, limit, destBase) {
  let index = 0;
  const running = new Set();

  for (const file of files) {
    index++;
    const p = processFile(file, index, files.length, destBase);
    running.add(p);
    p.finally(() => running.delete(p));

    if (running.size >= limit) {
      await Promise.race(running);
    }
  }
  await Promise.all(running);
}

// ---------------------- MAIN ----------------------
(async () => {
  for (const media of MEDIA_CONFIG) {
    const files = await fg(VIDEO_EXT.map(e => `${media.source}/**/*.${e}`));

    if (!files.length) {
      console.log(`ℹ️ Aucun fichier ${media.name} à traiter`);
      continue;
    }

    console.log(
      PARALLEL_JOBS === 1
        ? `▶️ ${media.name} : mode séquentiel`
        : `⚡ ${media.name} : mode parallèle (${PARALLEL_JOBS} jobs)`
    );

    await runWithLimit(files, PARALLEL_JOBS, media.dest);
  }

  const totalTime = Date.now() - startTime;

  console.log('\n📊 Résumé final');
  console.log('==============================');
  console.log(`🎞️ Traités           : ${processed}`);
  console.log(`⏭️ Déjà existants     : ${skipped}`);
  console.log(`🎬 TMDb trouvés       : ${tmdbFound}`);
  console.log(`⚠️ TMDb manquants     : ${tmdbMissing}`);
  console.log(`⏱️ Temps total        : ${formatDuration(totalTime)}`);
  console.log('==============================');
})();
