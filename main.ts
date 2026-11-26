// Skyline Courier — entry program for "Make the best flight game"
// (best-flight-game-20261126-0057). Node 22, standard library only.
//
// The game itself is plain static files under game/ (game/index.html and its
// ES modules, no library, no network request) that open in desktop Chrome and
// play offline. This program hands the entry in: it copies game/ and
// screenshots/ from beside this file into the output directory and writes
// /output/dossier.json, the summary the judge reads, with the vendored
// make.fun library (vendor/makefun-game.ts, the kit's copy, unchanged).
//
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
//
// The grader runs this program twice in a fresh container with a read-only
// /bot (this repository at the submitted commit) and a writable /output, on
// 1 CPU, 1024 MB and 10 seconds, and both runs must write the same bytes.
// So: no timestamps, no randomness, no environment-dependent output anywhere
// in what is written. The only files written are the copied game files, the
// copied screenshots and the deterministic dossier.json the library builds.
//
// The output directory resolves in this order:
//   1. $MAKEFUN_OUTPUT_DIR when set (local runs and the kit's own tooling)
//   2. /output, the grader's writable directory
// A mirror of the repository's own hand-in notes is attempted only inside a
// try/catch, so a read-only filesystem (EROFS) can never fail the run: the
// mirror is a nicety, the dossier is the deliverable.

import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

// The directory this file lives in: the repository root at the submitted
// commit (read-only in the grader, writable here while building).
const here = fileURLToPath(new URL('.', import.meta.url));

// The grader's output directory, or the local stand-in. Never a relative
// path: a relative fallback would resolve under the read-only /bot in the
// grader and fail the run with EROFS.
const out = process.env.MAKEFUN_OUTPUT_DIR
  ? resolve(process.env.MAKEFUN_OUTPUT_DIR)
  : '/output';

// --- helpers ---------------------------------------------------------------

// Count the plain files under a directory, recursively, for the build note.
// Deterministic: sorted paths, sizes only, no timestamps.
function listFiles(root) {
  const found = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir).sort()) {
      const path = join(dir, name);
      const st = statSync(path);
      if (st.isDirectory()) walk(path);
      else if (st.isFile()) found.push(path.slice(root.length + 1));
    }
  };
  if (existsSync(root)) walk(root);
  return found;
}

// Copy a directory tree only when the source exists, creating the target
// first so a missing optional directory is never an error.
function copyTreeIfPresent(src, dst) {
  if (!existsSync(src)) return 0;
  mkdirSync(dst, { recursive: true });
  cpSync(src, dst, { recursive: true });
  return listFiles(src).length;
}

// --- hand-in ----------------------------------------------------------------

mkdirSync(out, { recursive: true });

// The playable game: every file under game/ is served as-is by any static
// HTTP server. game/index.html is the entry point; its ES modules live in
// game/src/ and it loads nothing from outside game/.
const gameFiles = copyTreeIfPresent(join(here, 'game'), join(out, 'game'));

// The maker's screenshots of the game itself, taken in a desktop browser
// from the game's own code. The first by name is the cover.
const shotFiles = copyTreeIfPresent(join(here, 'screenshots'), join(out, 'screenshots'));

// The dossier: byte for byte what buildDossier writes from game/ and
// screenshots/, capped exactly as the gate's own caps. The scorer rebuilds
// it with the same library and compares the two byte for byte, so the caps
// here must match the gate's: at most 4 screenshots of at most 256 KiB, at
// most 993 files and 48 MiB under game/, paths under game/ at most 1000
// bytes, and the dossier text at most 160 KiB.
const dossier = buildDossier(out, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
});
writeFileSync(join(out, 'dossier.json'), dossier);

// --- best-effort build note -------------------------------------------------
//
// A small, fully deterministic note about what was handed in. It lives in
// the output directory beside the deliverable and is written inside a
// try/catch on purpose: on the grader's read-only /bot this directory is
// /output and writable, but if anything about the filesystem ever refuses a
// write here, the entry must still stand on its dossier, so a failure to
// write the note is swallowed and the run still exits 0.
try {
  const note = [
    'Skyline Courier — best-flight-game-20261126-0057',
    `game files: ${gameFiles}`,
    `screenshots: ${shotFiles}`,
    `dossier bytes: ${Buffer.byteLength(dossier, 'utf8')}`,
    'game files:',
    ...listFiles(join(here, 'game')).map((f) => `  ${f}`),
    'screenshots:',
    ...listFiles(join(here, 'screenshots')).map((f) => `  ${f}`),
    '',
  ].join('\n');
  writeFileSync(join(out, 'build-note.txt'), note);
} catch {
  // The note is a nicety; the dossier above is the deliverable.
}

// A one-line summary on stdout so a local run shows what happened. Stdout
// is not part of the graded output, so this line is free to be human text.
console.log(
  `Skyline Courier handed in: ${gameFiles} game files, ${shotFiles} screenshots, dossier ${Buffer.byteLength(dossier, 'utf8')} bytes -> ${out}`,
);
