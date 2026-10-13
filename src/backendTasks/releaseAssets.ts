import log from 'electron-log';
import fs from 'fs';
import path from 'path';
import { Marshal } from 'ts-marshal';
import { getPSDKBinariesPath } from '@services/getPSDKVersion';
import { padStr } from '@utils/PadStr';
import {
  assetKey,
  emptySelection,
  type AssetReason,
  type ManualChoice,
  type ReleaseAsset,
  type ReleaseAssetsScan,
  type ReleaseAssetsSelection,
  type ReleaseOtherSizes,
} from '@src/custom/ReleaseAssets/types';
import { defineBackendServiceFunction } from './defineBackendServiceFunction';
import { readRMXPMapInfo } from './readRMXPMapInfo';

/**
 * Release assets scan: which graphics/audio files the release needs.
 *
 * 1. Catalogue what PSDK's `project_compilation` ships: the graphics folders it
 *    packs into VD archives (png/jpg/gif) and every file under audio/.
 * 2. Collect strings from everything that can name an asset: every string in
 *    the rxdata files (maps, common events, system, tilesets…) and the Studio
 *    database / config JSON, `\code[args]` in dialogue CSVs, attribute values in
 *    Tiled maps, and string literals in Ruby scripts.
 * 3. Match each string against every tail of every asset path, without
 *    extension ("graphics/titles/apoch/0001", "titles/apoch/0001", "apoch/0001",
 *    "0001"), so a reference resolves whatever form it was written in.
 *
 * Deliberately generous: a coincidental match only keeps an extra file, while a
 * missed reference would drop a needed one. Names built at runtime are covered
 * by rules (whole folders, folders named in code, name variants, interpolation
 * prefixes) and reported as "kept by rule" so the user can see why.
 */

// --- What PSDK ships -------------------------------------------------------

/** graphics/ folders `project_compilation` packs (GRAPHICS_FILES), and whether it recurses. */
const PACKED_GRAPHICS: { folder: string; recursive: boolean }[] = [
  ...['animations', 'autotiles', 'ball', 'battlebacks', 'battlers', 'characters', 'fogs', 'icons', 'interface', 'panoramas', 'particles', 'pc', 'pictures', 'titles', 'tilesets', 'transitions', 'windowskins'].map(
    (folder) => ({ folder, recursive: true })
  ),
  { folder: 'pokedex', recursive: false },
  ...['footprints', 'pokeicon', 'pokefront', 'pokefrontshiny', 'pokeback', 'pokebackshiny'].map((sub) => ({ folder: `pokedex/${sub}`, recursive: true })),
];
const PACKED_IMAGE_EXT = /\.(png|jpe?g|gif)$/i;

// --- Rules for names built at runtime ---------------------------------------

/** Folders kept whole: code loads from them by computed names (UI parts, species sprites, cries…). */
const KEEP_WHOLE_FOLDERS = [
  'graphics/interface',
  'graphics/windowskins',
  'graphics/particles',
  'graphics/animations',
  'graphics/pokedex',
  'graphics/transitions',
  'graphics/ball',
  'graphics/pc',
  'graphics/icons',
  'audio/se/cries',
  'audio/se/moves',
  'audio/se/voltorbflip',
  'audio/se/mining_game',
  'audio/particles',
];
/** Suffixes code appends to a used name: legacy 8-dir sheets, time-of-day battlebacks. */
const VARIANT_SUFFIXES = ['_8dir', '_morning', '_day', '_sunset', '_night'];
const KNOWN_EXT = /\.(png|jpe?g|gif|bmp|ogg|mp3|wav|midi?|flac|opus|wma|m4a|aac)$/i;
const MAX_REASONS = 6;

// --- Helpers ----------------------------------------------------------------

const toPosix = (p: string) => p.replace(/\\/g, '/');

/** Recursively list files under `dir` (absolute paths). */
const listFiles = (dir: string, recursive = true, filter?: (name: string) => boolean): string[] => {
  if (!fs.existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (recursive) out.push(...listFiles(full, true, filter));
    } else if (!filter || filter(entry.name)) {
      out.push(full);
    }
  }
  return out;
};

const fileSize = (file: string) => {
  try {
    return fs.statSync(file).size;
  } catch {
    return 0;
  }
};
const dirSize = (dir: string) => listFiles(dir).reduce((sum, file) => sum + fileSize(file), 0);

/** Normalize a referenced name to the index's key form: lowercase, posix, from graphics/ or audio/, no extension. */
const normalizeRef = (raw: string): string => {
  let s = toPosix(raw.trim()).toLowerCase();
  const g = s.lastIndexOf('graphics/');
  const a = s.lastIndexOf('audio/');
  const at = Math.max(g, a);
  if (at > 0) s = s.slice(at);
  s = s.replace(/^(\.{1,2}\/)+/, '').replace(KNOWN_EXT, '');
  return s;
};

/** Every tail of a path ("a/b/c" → "a/b/c", "b/c", "c"). */
const tails = (p: string): string[] => {
  const parts = p.split('/');
  return parts.map((_, i) => parts.slice(i).join('/'));
};

// --- String extraction ------------------------------------------------------

const QUOTED = /'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"/g;
const MESSAGE_CODE = /\\[a-z]+\[([^\]]*)\]/gi;
const PERCENT_WORDS = /%[wiWI][[(]([^\])]*)[\])]/g;

/** Candidates from a string stored in data (event text, script command, JSON value…). */
const candidatesFromDataString = (s: string): string[] => {
  const out = [s];
  if (/['"(=]/.test(s)) {
    for (const m of s.matchAll(QUOTED)) out.push(m[1] ?? m[2] ?? '');
    out.push(...s.split(/[\s,()[\]{}=;|<>]+/));
  }
  for (const m of s.matchAll(MESSAGE_CODE)) out.push(...m[1].split(','));
  return out;
};

/** Visit every string inside a Marshal-loaded / JSON-parsed value (iterative; skips binary blobs). */
const visitStrings = (root: unknown, visit: (s: string) => void) => {
  const stack: unknown[] = [root];
  const seen = new Set<object>();
  while (stack.length) {
    const value = stack.pop();
    if (typeof value === 'string') {
      visit(value);
      continue;
    }
    if (!value || typeof value !== 'object' || seen.has(value)) continue;
    if (ArrayBuffer.isView(value) || value instanceof ArrayBuffer) continue;
    seen.add(value);
    if (Array.isArray(value)) {
      for (const item of value) stack.push(item);
      continue;
    }
    for (const [key, item] of Object.entries(value)) {
      if (!key.startsWith('@') && !key.startsWith('__')) visit(key);
      stack.push(item);
    }
  }
};

type RubyRefs = { literals: string[]; prefixes: string[]; suffixes: string[] };

/** String literals (and interpolation prefixes) in a Ruby source, comments removed. */
const rubyRefs = (source: string): RubyRefs => {
  const code = source.replace(/^=begin[\s\S]*?^=end/gm, '').replace(/^\s*#.*$/gm, '');
  const literals: string[] = [];
  const prefixes: string[] = [];
  const suffixes: string[] = [];
  for (const m of code.matchAll(QUOTED)) {
    if (m[1] !== undefined) {
      literals.push(m[1]);
      continue;
    }
    const s = m[2] ?? '';
    if (!s.includes('#{')) {
      literals.push(s);
      continue;
    }
    const fragments = s.split(/#\{[^}]*\}/);
    literals.push(...fragments);
    prefixes.push(fragments[0]);
    suffixes.push(fragments[fragments.length - 1]);
  }
  for (const m of code.matchAll(PERCENT_WORDS)) literals.push(...m[1].split(/\s+/));
  return { literals, prefixes, suffixes };
};

// --- Scan -------------------------------------------------------------------

/** The scan runs in Electron's main process: hand control back regularly so the window stays responsive. */
const makeYielder = (budgetMs = 30) => {
  let last = Date.now();
  return async () => {
    if (Date.now() - last < budgetMs) return;
    await new Promise<void>((resolve) => setImmediate(resolve));
    last = Date.now();
  };
};

/** JSON that isn't strict (comments, trailing commas…): still collect its quoted strings. */
const looseJsonStrings = (text: string): string[] => [...text.matchAll(/"((?:[^"\\\n]|\\.)*)"/g)].map((m) => m[1]);

type Entry = { asset: ReleaseAsset; key: string; dir: string; base: string; sources: Set<string>; rules: AssetReason[] };

export type ScanReleaseAssetsInput = { projectPath: string };
export type ScanReleaseAssetsOutput = { scan: ReleaseAssetsScan };

export const scanReleaseAssets = async ({ projectPath }: ScanReleaseAssetsInput): Promise<ScanReleaseAssetsOutput> => {
  log.info('scan-release-assets', { projectPath });
  const started = Date.now();
  const tick = makeYielder();
  const unreadable: string[] = [];
  const rel = (abs: string) => toPosix(path.relative(projectPath, abs));

  // 1. Catalogue shipped assets.
  const files = new Set<string>();
  for (const { folder, recursive } of PACKED_GRAPHICS) {
    for (const f of listFiles(path.join(projectPath, 'graphics', folder), recursive, (n) => PACKED_IMAGE_EXT.test(n))) files.add(f);
  }
  for (const f of listFiles(path.join(projectPath, 'audio'))) files.add(f);

  const entries: Entry[] = [];
  for (const abs of files) {
    await tick();
    const p = rel(abs);
    const key = assetKey(p);
    entries.push({
      asset: { path: p, size: fileSize(abs), status: 'unused', reasons: [] },
      key,
      dir: key.slice(0, key.lastIndexOf('/')),
      base: key.slice(key.lastIndexOf('/') + 1).replace(KNOWN_EXT, ''),
      sources: new Set(),
      rules: [],
    });
  }

  // Index every tail of every asset path (no extension) and of every directory.
  const byName = new Map<string, Entry[]>();
  const dirs = new Map<string, Entry[]>();
  for (const e of entries) {
    for (const t of tails(e.key.replace(KNOWN_EXT, ''))) {
      const list = byName.get(t);
      if (list) list.push(e);
      else byName.set(t, [e]);
    }
    const parts = e.dir.split('/');
    for (let depth = 2; depth <= parts.length; depth += 1) {
      const d = parts.slice(0, depth).join('/');
      const list = dirs.get(d);
      if (list) list.push(e);
      else dirs.set(d, [e]);
    }
  }

  // Every name referenced anywhere (normalized) → first place it appeared, for the variant pass:
  // "back_beach" must keep back_beach_day.gif even though no plain back_beach file exists.
  const referencedNames = new Map<string, string>();
  const reference = (raw: string, label: string) => {
    if (!raw || raw.length > 260) return;
    const name = normalizeRef(raw);
    // All-digit names ("0001", "713") collide with ids, counters and hash keys everywhere in the
    // data. Numbered files are resolved by the rules instead (frame folders named in code, whole
    // Pokédex/icon/cry folders), so a bare number never counts as a reference.
    if (/^[\d\s]*$/.test(name.slice(name.lastIndexOf('/') + 1))) return;
    if (!referencedNames.has(name)) referencedNames.set(name, label);
    const matches = byName.get(name);
    if (matches) for (const e of matches) if (e.sources.size < MAX_REASONS) e.sources.add(label);
  };
  const referenceData = (s: string, label: string) => {
    for (const c of candidatesFromDataString(s)) reference(c, label);
  };

  const sources = { maps: 0, dataFiles: 0, scripts: 0, texts: 0, tiled: 0 };
  const dataDir = path.join(projectPath, 'Data');

  // 2a. Maps, with the event a reference comes from.
  const mapInfoPath = path.join(dataDir, 'MapInfos.rxdata');
  const mapNames = new Map<number, string>();
  if (fs.existsSync(mapInfoPath)) for (const m of await readRMXPMapInfo(mapInfoPath)) mapNames.set(m.id, m.name);
  for (const file of listFiles(dataDir, false, (n) => /^Map\d+\.rxdata$/i.test(n))) {
    await tick();
    const id = Number(path.basename(file).match(/\d+/)?.[0] ?? 0);
    const mapLabel = `Map ${padStr(id, 3)}${mapNames.has(id) ? ` (${mapNames.get(id)})` : ''}`;
    try {
      const map = Marshal.load(fs.readFileSync(file)) as Record<string, unknown>;
      const { '@events': events, ...rest } = map;
      visitStrings(rest, (s) => referenceData(s, mapLabel));
      if (events && typeof events === 'object') {
        for (const [eventId, event] of Object.entries(events)) {
          if (eventId.startsWith('__') || !event || typeof event !== 'object') continue;
          const name = (event as Record<string, unknown>)['@name'];
          const label = `${mapLabel} · event ${eventId}${typeof name === 'string' && name ? ` (${name})` : ''}`;
          visitStrings(event, (s) => referenceData(s, label));
        }
      }
      sources.maps += 1;
    } catch (error) {
      log.warn('scan-release-assets/map-unreadable', { file, error: String(error) });
      unreadable.push(rel(file));
    }
  }

  // 2b. Other rxdata (system, tilesets, common events…) and animation data.
  const otherData = [
    ...listFiles(dataDir, false, (n) => /\.rxdata$/i.test(n) && !/^Map\d+\.rxdata$/i.test(n)),
    ...listFiles(path.join(dataDir, 'Animations'), true, (n) => /\.(dat|json)$/i.test(n)),
  ];
  for (const file of otherData) {
    await tick();
    const label = rel(file).replace(/^Data\//, '');
    try {
      const buffer = fs.readFileSync(file);
      const data = file.toLowerCase().endsWith('.json') ? JSON.parse(buffer.toString('utf-8')) : Marshal.load(buffer);
      if (/CommonEvents\.rxdata$/i.test(file) && Array.isArray(data)) {
        for (const ce of data) {
          if (!ce || typeof ce !== 'object') continue;
          const c = ce as Record<string, unknown>;
          const ceLabel = `Common event ${c['@id']}${typeof c['@name'] === 'string' && c['@name'] ? ` (${c['@name']})` : ''}`;
          visitStrings(ce, (s) => referenceData(s, ceLabel));
        }
      } else {
        visitStrings(data, (s) => referenceData(s, label));
      }
      sources.dataFiles += 1;
    } catch (error) {
      log.warn('scan-release-assets/data-unreadable', { file, error: String(error) });
      unreadable.push(rel(file));
    }
  }

  // 2c. Studio database + configs (JSON).
  const jsonFiles = [
    ...listFiles(path.join(dataDir, 'Studio'), true, (n) => n.toLowerCase().endsWith('.json')).map((f) => ({ f, prefix: 'Database' })),
    ...listFiles(path.join(dataDir, 'configs'), true, (n) => n.toLowerCase().endsWith('.json')).map((f) => ({ f, prefix: 'Config' })),
  ];
  for (const { f, prefix } of jsonFiles) {
    const label = `${prefix}: ${toPosix(path.relative(path.join(dataDir, prefix === 'Database' ? 'Studio' : 'configs'), f)).replace(/\.json$/i, '')}`;
    await tick();
    const text = fs.readFileSync(f, 'utf-8');
    try {
      visitStrings(JSON.parse(text), (s) => referenceData(s, label));
    } catch (error) {
      // Not strict JSON: still use every quoted string, so its references aren't lost.
      log.warn('scan-release-assets/json-loose', { file: f, error: String(error) });
      for (const s of looseJsonStrings(text)) referenceData(s, label);
    }
    sources.dataFiles += 1;
  }

  // 2d. Dialogue CSVs: only `\code[args]` (\img[name,folder]…), not the prose.
  for (const f of listFiles(path.join(dataDir, 'Text', 'Dialogs'), false, (n) => n.toLowerCase().endsWith('.csv'))) {
    await tick();
    const label = `Text file ${path.basename(f, '.csv')}`;
    const text = fs.readFileSync(f, 'utf-8');
    for (const m of text.matchAll(MESSAGE_CODE)) for (const arg of m[1].split(',')) reference(arg, label);
    sources.texts += 1;
  }

  // 2e. Tiled maps / tilesets: attribute values (image sources…).
  for (const f of listFiles(path.join(dataDir, 'Tiled'), true, (n) => /\.(tmx|tsx)$/i.test(n))) {
    await tick();
    const label = `Tiled: ${path.basename(f)}`;
    for (const m of fs.readFileSync(f, 'utf-8').matchAll(/="([^"]*)"/g)) reference(m[1], label);
    sources.tiled += 1;
  }

  // 2f. Ruby: project scripts (incl. extracted plugins) + the PSDK the project runs on.
  const projectPsdk = path.join(projectPath, 'pokemonsdk', 'scripts');
  const psdkScripts = fs.existsSync(projectPsdk) ? projectPsdk : path.join(getPSDKBinariesPath(), 'pokemonsdk', 'scripts');
  const rubyFiles = [
    ...listFiles(path.join(projectPath, 'scripts'), true, (n) => n.endsWith('.rb')).filter((f) => !toPosix(f).includes('/psdk_scripts/')),
    ...listFiles(psdkScripts, true, (n) => n.endsWith('.rb')),
  ];
  const codeLiterals = new Map<string, string>(); // normalized literal → first file using it
  const codePrefixes = new Map<string, string>();
  const codeSuffixes = new Set<string>(VARIANT_SUFFIXES); // "#{name}_sma" → "_sma"
  const SUFFIX = /^_[a-z0-9]{2,12}$/;
  let scriptBytes = 0;
  for (const f of rubyFiles) {
    await tick();
    const source = fs.readFileSync(f, 'utf-8');
    scriptBytes += source.length;
    const label = `Script: ${toPosix(path.relative(f.startsWith(projectPsdk) || f.startsWith(psdkScripts) ? path.dirname(psdkScripts) : path.join(projectPath, 'scripts'), f))}`;
    const { literals, prefixes, suffixes } = rubyRefs(source);
    for (const lit of literals) {
      reference(lit, label);
      const n = normalizeRef(lit);
      if (n.length >= 3 && !codeLiterals.has(n)) codeLiterals.set(n, label);
    }
    for (const sfx of suffixes) if (SUFFIX.test(sfx.toLowerCase())) codeSuffixes.add(sfx.toLowerCase());
    for (const p of prefixes) {
      const n = normalizeRef(p);
      const lastSegment = n.slice(n.lastIndexOf('/') + 1);
      if (lastSegment.length >= 3 && !codePrefixes.has(n)) codePrefixes.set(n, label);
    }
    sources.scripts += 1;
  }

  // 3. Rules for runtime-built names.
  for (const folder of KEEP_WHOLE_FOLDERS) {
    await tick();
    for (const e of entries) if (e.key.startsWith(`${folder}/`)) e.rules.push({ type: 'folder', folder });
  }
  // Folders named in code (`'apoch'`, `'apoch/roar'`): files loaded by computed names.
  // Only below the pack folders, so a literal like 'characters' can't keep a whole pack.
  // A nested folder needs a match that includes its parent ('apoch/roar') or a parent that is
  // itself kept here: a lone common word ('roar', the move) must not keep `apoch_png/roar`.
  const keptDirs = new Set<string>();
  const sortedDirs = [...dirs].sort((a, b) => a[0].split('/').length - b[0].split('/').length);
  for (const [dir, list] of sortedDirs) {
    await tick();
    const depth = dir.split('/').length;
    if (depth < 3) continue; // graphics/<pack>/<sub> or audio/<type>/<sub> and deeper
    const parentKept = keptDirs.has(dir.slice(0, dir.lastIndexOf('/')));
    const hit = tails(dir).find((t) => codeLiterals.has(t) && (depth === 3 || parentKept || t.includes('/')));
    if (!hit) continue;
    keptDirs.add(dir);
    for (const e of list) e.rules.push({ type: 'folderInCode', folder: dir, label: codeLiterals.get(hit) as string });
  }
  // Interpolation prefixes ("key_short_#{…}").
  for (const [prefix, label] of codePrefixes) {
    await tick();
    for (const e of entries) if (tails(e.key.replace(KNOWN_EXT, '')).some((t) => t.startsWith(prefix))) e.rules.push({ type: 'prefix', prefix, label });
  }
  // Names built from an id ("805_0", "025_big"): files directly in a pack folder whose name
  // starts with a number. Numbered files deeper down (frame folders) are judged by the folder.
  for (const e of entries) {
    const depth = e.key.split('/').length;
    if (depth === 3 && /^\d/.test(e.base)) e.rules.push({ type: 'idName' });
  }
  // Variants of names that are kept: "<stem><suffix>" siblings, the suffixes being the fixed
  // ones (_8dir, time of day) plus every "#{…}_xyz" ending found in code (_big/_sma…). A kept
  // "X_big" also keeps "X_sma" (code strips one suffix and appends another).
  const byDirBase = new Map<string, Entry[]>();
  for (const e of entries) {
    const k = `${e.dir}/${e.base}`;
    const list = byDirBase.get(k);
    if (list) list.push(e);
    else byDirBase.set(k, [e]);
  }
  const suffixList = [...codeSuffixes];
  const markVariant = (v: Entry, of: string) => {
    if (!v.sources.size && !v.rules.some((r) => r.type === 'variant')) v.rules.push({ type: 'variant', of });
  };
  for (const [name] of referencedNames) {
    await tick();
    for (const sfx of suffixList) for (const v of byName.get(`${name}${sfx}`) ?? []) markVariant(v, name);
  }
  for (const e of entries) {
    await tick();
    if (!e.sources.size && !e.rules.some((r) => r.type !== 'variant')) continue;
    const stems = new Set([e.base]);
    for (const sfx of suffixList) if (e.base.endsWith(sfx) && e.base.length > sfx.length) stems.add(e.base.slice(0, -sfx.length));
    for (const stem of stems) {
      for (const sfx of suffixList) {
        for (const v of byDirBase.get(`${e.dir}/${stem}${sfx}`) ?? []) if (v !== e) markVariant(v, e.asset.path);
      }
    }
  }

  // 4. Final status + reasons.
  for (const e of entries) {
    const reasons: AssetReason[] = [...e.sources].map((label) => ({ type: 'source', label }));
    for (const r of e.rules) if (reasons.length < MAX_REASONS) reasons.push(r);
    e.asset.reasons = reasons;
    e.asset.status = e.sources.size ? 'used' : e.rules.length ? 'rule' : 'unused';
  }

  const scan: ReleaseAssetsScan = {
    assets: entries.map((e) => e.asset).sort((a, b) => a.path.localeCompare(b.path)),
    other: otherSizes(projectPath, scriptBytes),
    sources: { ...sources, unreadable },
    durationMs: Date.now() - started,
  };
  log.info('scan-release-assets/success', { assets: scan.assets.length, durationMs: scan.durationMs, sources });
  return { scan };
};

/** Approximate size of everything else the build writes. */
const otherSizes = (projectPath: string, scriptBytes: number): ReleaseOtherSizes => {
  const binaries = getPSDKBinariesPath();
  const engine =
    process.platform === 'win32'
      ? dirSize(path.join(binaries, 'ruby_builtin_dlls')) +
        ['ruby.exe', 'rubyw.exe', 'msvcrt-ruby300.dll'].reduce((sum, f) => sum + fileSize(path.join(binaries, f)), 0) +
        fileSize(path.join(projectPath, 'Gamew.exe'))
      : 0;
  const data = path.join(projectPath, 'Data');
  const dataFiles = [
    ...listFiles(data, false, (n) => /\.rxdata$/i.test(n)),
    ...listFiles(path.join(data, 'Text', 'Dialogs'), false, (n) => n.endsWith('.dat')),
    ...listFiles(path.join(data, 'Animations'), false, (n) => n.endsWith('.dat')),
    ...listFiles(path.join(data, 'Events', 'Battle'), false, (n) => n.endsWith('.yarbc')),
    ...listFiles(path.join(data, 'configs'), true, (n) => /\.rxdata$/i.test(n)),
    path.join(data, 'Studio', 'psdk.dat'),
    path.join(data, 'PSDK', 'Maplinks.rxdata'),
    path.join(data, 'PSDK', 'SystemTags.rxdata'),
  ];
  return {
    engine,
    lib: dirSize(path.join(binaries, 'lib')),
    data: dataFiles.reduce((sum, f) => sum + fileSize(f), 0),
    // Scripts.dat is compressed bytecode; ~30% of the source is a fair guess.
    scripts: Math.round(scriptBytes * 0.3),
    fontsAndShaders: dirSize(path.join(projectPath, 'Fonts')) + dirSize(path.join(projectPath, 'graphics', 'shaders')),
  };
};

// --- Selection file -----------------------------------------------------------

const SELECTION_FILE = 'release_assets.json';

const sanitizeSelection = (raw: unknown): ReleaseAssetsSelection => {
  const base = emptySelection();
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return base;
  const o = raw as Record<string, unknown>;
  const strings = (v: unknown) => (Array.isArray(v) ? v.filter((s): s is string => typeof s === 'string') : []);
  const manual: Record<string, ManualChoice> = {};
  if (o.manual && typeof o.manual === 'object') {
    for (const [k, v] of Object.entries(o.manual as Record<string, unknown>)) if (v === 'include' || v === 'exclude') manual[assetKey(k)] = v;
  }
  return { version: 1, enabled: o.enabled !== false, excluded: strings(o.excluded), manual, reviewed: strings(o.reviewed).map(assetKey) };
};

export type ReadReleaseAssetsSelectionInput = { projectPath: string };
/** `selection` is null when the project has never saved one (everything ships). */
export type ReadReleaseAssetsSelectionOutput = { selection: ReleaseAssetsSelection | null };

const readReleaseAssetsSelection = async ({ projectPath }: ReadReleaseAssetsSelectionInput): Promise<ReadReleaseAssetsSelectionOutput> => {
  const file = path.join(projectPath, SELECTION_FILE);
  if (!fs.existsSync(file)) return { selection: null };
  try {
    return { selection: sanitizeSelection(JSON.parse(fs.readFileSync(file, 'utf-8'))) };
  } catch (error) {
    throw `${SELECTION_FILE} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`;
  }
};

export type SaveReleaseAssetsSelectionInput = { projectPath: string; selection: ReleaseAssetsSelection };
export type SaveReleaseAssetsSelectionOutput = Record<string, never>;

const saveReleaseAssetsSelection = async ({ projectPath, selection }: SaveReleaseAssetsSelectionInput): Promise<SaveReleaseAssetsSelectionOutput> => {
  const clean = sanitizeSelection(selection);
  clean.excluded.sort((a, b) => a.localeCompare(b));
  clean.reviewed.sort();
  fs.writeFileSync(path.join(projectPath, SELECTION_FILE), JSON.stringify(clean, null, 1));
  log.info('save-release-assets-selection', { excluded: clean.excluded.length });
  return {};
};

export const registerScanReleaseAssets = defineBackendServiceFunction('scan-release-assets', scanReleaseAssets);
export const registerReadReleaseAssetsSelection = defineBackendServiceFunction('read-release-assets-selection', readReleaseAssetsSelection);
export const registerSaveReleaseAssetsSelection = defineBackendServiceFunction('save-release-assets-selection', saveReleaseAssetsSelection);
