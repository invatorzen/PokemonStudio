/**
 * Drive a running Pokémon Studio over CDP.
 *
 * Studio is Electron, so its renderer is just a Chromium target. Start Studio
 * with the debug port open and this attaches to it — letting a change be made,
 * saved and verified without a human clicking through the UI.
 *
 *   1. npm run start:debug                       (Studio with CDP on :9222)
 *   2. node tools/drive_studio.mjs ready          (wait until it's up)
 *   3. node tools/drive_studio.mjs <command> [args] [; <command> [args] …]
 *
 * Several commands can run in one call, separated by a lone `;`:
 *   node tools/drive_studio.mjs open "Pokemon Umbra" ; nav /dashboard/release-assets ; wait "Release size" ; shot ra.png
 *
 * Commands
 *   ready [ms]            wait for Studio + the dev bridge (default 120000ms)
 *   where                 current route and open project
 *   nav <route>           go to a page (/home, /dashboard/release-assets, /database/pokemon…)
 *   open <project>        open a project by clicking its Home card (title as shown)
 *   windows               list Studio windows (main, compilation…)
 *   dump                  visible UI text and clickable candidates
 *   text [target]         visible text of the page (or of one element)
 *   click <target>        click an element
 *   hover <target>        hover an element (menus that open on hover)
 *   fill <target> <text>  replace an input's value (target = placeholder, label or css=)
 *   type <text>           type into whatever has focus
 *   key <combo>           press keys: Enter, Escape, Control+s, ArrowDown…
 *   wait <target> [ms]    wait until an element is visible (default 10000ms)
 *   sleep <ms>            pause
 *   eval "<js>"           evaluate JS in the renderer (promises awaited), print the result
 *   console [ms]          stream renderer console + page errors (default 15000ms)
 *   shot <path>           screenshot the window
 *
 * A <target> is visible text (exact match preferred, then partial) or
 * `css=<selector>`. `--window <title>` before the command picks another window.
 *
 * `dump`/`text` exist because selectors have to be discovered, not guessed: run
 * them, read the labels, then act on what's actually there. Guessing selectors
 * blind produces scripts that fail for the wrong reasons.
 *
 * Dev builds expose `window.__studio` (src/custom/StudioDriver/StudioDriverBridge.tsx):
 * Studio routes through a MemoryRouter with no URL, so `nav`/`where` go through it.
 */

import { chromium } from 'playwright-core';

const ENDPOINT = process.env.STUDIO_CDP ?? 'http://localhost:9222';

/** Every renderer page, devtools excluded. */
const studioPages = (browser) =>
  browser
    .contexts()
    .flatMap((c) => c.pages())
    .filter((p) => !p.url().startsWith('devtools://'));

/** Attach to the window whose title contains `windowTitle`, else the main window (the one with the dev bridge). */
const attach = async (windowTitle) => {
  let browser;
  try {
    browser = await chromium.connectOverCDP(ENDPOINT);
  } catch (e) {
    console.error(
      `Could not reach Studio at ${ENDPOINT}.\n` +
        'Start it with the debug port open first:\n' +
        '  npm run start:debug\n' +
        `(${e.message})`
    );
    process.exit(1);
  }
  const pages = studioPages(browser);
  let page = pages[0];
  if (windowTitle) {
    const titles = await Promise.all(pages.map((p) => p.title()));
    const index = titles.findIndex((t) => t.toLowerCase().includes(windowTitle.toLowerCase()));
    if (index < 0) {
      console.error(`No window titled like "${windowTitle}". Open windows: ${titles.map((t) => `"${t}"`).join(', ')}`);
      process.exit(1);
    }
    page = pages[index];
  } else {
    for (const p of pages) if (await p.evaluate(() => !!window.__studio).catch(() => false)) page = p;
  }
  if (!page) {
    console.error('Connected, but Studio has no renderer page open.');
    process.exit(1);
  }
  return { browser, page };
};

/** Resolve a <target>: `css=<selector>`, else visible text (exact match first, then partial). */
const locate = async (page, target) => {
  if (target.startsWith('css=')) return page.locator(target.slice(4)).first();
  const exact = page.getByText(target, { exact: true });
  if (await exact.count()) return exact.first();
  return page.getByText(target, { exact: false }).first();
};

/** An input by `css=`, placeholder, then label. */
const locateInput = async (page, target) => {
  if (target.startsWith('css=')) return page.locator(target.slice(4)).first();
  const byPlaceholder = page.getByPlaceholder(target, { exact: false });
  if (await byPlaceholder.count()) return byPlaceholder.first();
  return page.getByLabel(target, { exact: false }).first();
};

/** Fail clearly when the dev bridge isn't there (packaged build, or not the main window). */
const bridge = async (page) => {
  if (!(await page.evaluate(() => !!window.__studio).catch(() => false))) {
    throw new Error('window.__studio is missing: start Studio with `npm run start:debug` (dev build) and target the main window');
  }
};

const commands = {
  async console(page, [ms = '15000']) {
    console.log(`listening for ${ms}ms — interact with Studio now\n`);
    page.on('console', (msg) => console.log(`[${msg.type()}] ${msg.text()}`));
    page.on('pageerror', (err) => console.log(`[pageerror] ${err.message}`));
    await page.waitForTimeout(Number(ms));
  },

  async ready(page, [ms = '120000']) {
    await page.waitForFunction(() => !!window.__studio, null, { timeout: Number(ms) });
    console.log(JSON.stringify(await page.evaluate(() => window.__studio.where())));
  },

  async where(page) {
    await bridge(page);
    console.log(JSON.stringify(await page.evaluate(() => window.__studio.where())));
  },

  async nav(page, [rawRoute]) {
    if (!rawRoute) throw new Error('nav needs a route, e.g. /dashboard');
    // Git Bash rewrites a leading "/x" argument into "C:/Program Files/Git/x"; undo that, and
    // accept routes written without the leading slash.
    const stripped = rawRoute.replace(/^[A-Za-z]:\/Program Files\/Git(?=\/)/i, '');
    const route = stripped.startsWith('/') ? stripped : `/${stripped}`;
    await bridge(page);
    await page.evaluate((r) => window.__studio.navigate(r), route);
    await page.waitForTimeout(300);
    console.log(`at ${await page.evaluate(() => window.__studio.where().route)}`);
  },

  async open(page, args) {
    const name = args.join(' ');
    if (!name) throw new Error('open needs a project title, as shown on its Home card');
    await bridge(page);
    await page.evaluate(() => window.__studio.navigate('/home'));
    await page.waitForTimeout(500);
    await (await locate(page, name)).click({ timeout: 10000 });
    // A big project takes a while: done once a project is set and Studio left Home.
    await page.waitForFunction(
      () => {
        const w = window.__studio.where();
        return !!w.projectPath && w.route !== '/home';
      },
      null,
      { timeout: 180000 }
    );
    console.log(JSON.stringify(await page.evaluate(() => window.__studio.where())));
  },

  async windows(page, _args, browser) {
    for (const [i, p] of studioPages(browser).entries()) console.log(`  ${i}  "${await p.title()}"  ${p.url().slice(0, 80)}`);
  },

  async dump(page) {
    const info = await page.evaluate(() => {
      const visible = (el) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden';
      };
      const label = (el) =>
        (el.innerText || el.getAttribute('title') || el.getAttribute('aria-label') || el.getAttribute('placeholder') || '').trim().slice(0, 60);
      const clickable = [...document.querySelectorAll('button, [role="button"], a, input, select, textarea, label, [class*="Btn"], [class*="Tab"]')]
        .filter(visible)
        .map((el) => ({ tag: el.tagName.toLowerCase(), type: el.getAttribute('type') || '', cls: (el.className || '').toString().slice(0, 40), text: label(el) }))
        .filter((e) => e.text || e.tag === 'input');
      return { route: window.__studio?.where().route ?? location.href, title: document.title, clickable: clickable.slice(0, 150) };
    });
    console.log(`route: ${info.route}\ntitle: ${info.title}\n`);
    console.log('clickable elements:');
    info.clickable.forEach((e, i) => console.log(`  ${String(i).padStart(3)} <${e.tag}${e.type ? ` ${e.type}` : ''}> "${e.text}"  .${e.cls}`));
  },

  async text(page, args) {
    const target = args.join(' ');
    const text = target ? await (await locate(page, target)).innerText() : await page.evaluate(() => document.body.innerText);
    console.log(text.replace(/\n{3,}/g, '\n\n').slice(0, 8000));
  },

  async eval(page, args) {
    const source = args.join(' ');
    if (!source) return console.error('eval needs an expression');
    const result = await page.evaluate(async (src) => {
      // eslint-disable-next-line no-eval
      const value = await eval(src);
      try {
        return JSON.parse(JSON.stringify(value ?? null));
      } catch {
        return String(value);
      }
    }, source);
    console.log(JSON.stringify(result, null, 2));
  },

  async click(page, args) {
    const target = args.join(' ');
    await (await locate(page, target)).click({ timeout: 5000 });
    console.log(`clicked "${target}"`);
  },

  async hover(page, args) {
    const target = args.join(' ');
    await (await locate(page, target)).hover({ timeout: 5000 });
    await page.waitForTimeout(400); // hover menus reveal on a ~300ms transition
    console.log(`hovering "${target}"`);
  },

  async fill(page, [target, ...rest]) {
    if (!target) throw new Error('fill needs <target> <text>');
    await (await locateInput(page, target)).fill(rest.join(' '), { timeout: 5000 });
    console.log(`filled "${target}"`);
  },

  async type(page, args) {
    await page.keyboard.type(args.join(' '));
    console.log('typed');
  },

  async key(page, [combo]) {
    if (!combo) throw new Error('key needs a combo, e.g. Enter or Control+s');
    await page.keyboard.press(combo);
    console.log(`pressed ${combo}`);
  },

  async wait(page, [target, ms = '10000']) {
    if (!target) throw new Error('wait needs a target');
    await (await locate(page, target)).waitFor({ state: 'visible', timeout: Number(ms) });
    console.log(`visible: "${target}"`);
  },

  async sleep(page, [ms = '1000']) {
    await page.waitForTimeout(Number(ms));
  },

  /**
   * Erase one passage cell and save, capturing the renderer console throughout.
   *
   * Erase rather than draw: it needs no tile selected in the palette, so the
   * scenario has one less piece of hidden state to get wrong.
   *
   *   node tools/drive_studio.mjs passage-test [cellIndex]
   */
  async ['passage-test'](page, [cellArg = '69']) {
    const cell = Number(cellArg);
    page.on('console', (m) => console.log(`  [${m.type()}] ${m.text()}`));
    page.on('pageerror', (e) => console.log(`  [pageerror] ${e.message}`));

    const geom = await page.evaluate(() => {
      const canvas = document.querySelector('canvas');
      const row = [...document.querySelectorAll('div,span,li')].find((e) => (e.innerText || '').trim() === 'passages');
      const r = canvas.getBoundingClientRect();
      const lr = row.getBoundingClientRect();
      return { cx: r.x, cy: r.y, cw: r.width, ch: r.height, lx: lr.x + lr.width / 2, ly: lr.y + lr.height / 2 };
    });

    console.log('1. select passages layer');
    await page.mouse.click(geom.lx, geom.ly);
    await page.waitForTimeout(300);

    console.log('2. pick Erase tool');
    await page.getByText('Erase', { exact: false }).first().click();
    await page.waitForTimeout(300);

    // The map is 20x15 over the canvas, so tile size falls out of the geometry
    // rather than being hardcoded to a zoom level.
    const cols = 20;
    const tile = geom.cw / cols;
    const col = cell % cols;
    const rowIdx = Math.floor(cell / cols);
    const px = geom.cx + col * tile + tile / 2;
    const py = geom.cy + rowIdx * tile + tile / 2;
    console.log(`3. click cell ${cell} (col ${col}, row ${rowIdx}) at ${Math.round(px)},${Math.round(py)}`);
    await page.mouse.click(px, py);
    await page.waitForTimeout(500);

    console.log('4. save  (watch for [save-diag])');
    await page.getByText('Save', { exact: true }).first().click();
    await page.waitForTimeout(3000);
    console.log('done');
  },

  /**
   * The flow that actually misbehaves: edit, then save through the nav split
   * button's "Save maps" entry and its dialog — NOT the editor toolbar's Save.
   * Those are different code paths (onSaveAllMaps with a selection set vs a
   * plain onSave), so exercising the toolbar proves nothing about this one.
   *
   *   node tools/drive_studio.mjs save-maps-test [cellIndex]
   */
  async ['save-maps-test'](page, [cellArg = '89']) {
    const cell = Number(cellArg);
    page.on('console', (m) => console.log(`  [${m.type()}] ${m.text()}`));
    page.on('pageerror', (e) => console.log(`  [pageerror] ${e.message}`));

    const geom = await page.evaluate(() => {
      const canvas = document.querySelector('canvas');
      const row = [...document.querySelectorAll('div,span,li')].find((e) => (e.innerText || '').trim() === 'passages');
      const split = document.querySelector('.save-menu')?.parentElement?.parentElement;
      // Fail with a diagnosis rather than a null-deref: a scenario that silently
      // does nothing looks exactly like a passing run, which is worse than a
      // crash. Studio has to be sitting on the map editor for this to mean
      // anything.
      if (!canvas || !row || !split) {
        throw new Error(
          'Not on the map editor — open a map and select its layers first. ' +
            `canvas=${!!canvas} passagesLayer=${!!row} saveButton=${!!split}`
        );
      }
      const r = canvas.getBoundingClientRect();
      const lr = row.getBoundingClientRect();
      const sr = split.getBoundingClientRect();
      return {
        cx: r.x, cy: r.y, cw: r.width,
        lx: lr.x + lr.width / 2, ly: lr.y + lr.height / 2,
        sx: sr.x + sr.width / 2, sy: sr.y + sr.height / 2,
      };
    });

    await page.mouse.click(geom.lx, geom.ly);
    await page.waitForTimeout(250);
    await page.getByText('Erase', { exact: false }).first().click();
    await page.waitForTimeout(250);

    const cols = 20;
    const tile = geom.cw / cols;
    const px = geom.cx + (cell % cols) * tile + tile / 2;
    const py = geom.cy + Math.floor(cell / cols) * tile + tile / 2;
    console.log(`1. erase cell ${cell}`);
    await page.mouse.click(px, py);
    await page.waitForTimeout(500);

    console.log('2. hover the nav save button to open its menu');
    await page.mouse.move(geom.sx, geom.sy);
    // The menu reveals on a 300ms visibility transition.
    await page.waitForTimeout(700);

    console.log('3. click "Save maps"');
    await page.getByText('Save maps', { exact: true }).first().click();
    await page.waitForTimeout(700);

    console.log('4. confirm in the dialog');
    const confirm = page.getByRole('button', { name: /Save \d+ map/ }).first();
    await confirm.click({ timeout: 5000 });
    await page.waitForTimeout(3500);
    console.log('done');
  },

  async shot(page, [path = 'studio.png']) {
    await page.screenshot({ path, fullPage: false });
    console.log(`saved ${path}`);
  },
};

// argv: [--window <title>] <command> [args] [; <command> [args] …]
let argv = process.argv.slice(2);
let windowTitle;
if (argv[0] === '--window') {
  windowTitle = argv[1];
  argv = argv.slice(2);
}
const steps = [[]];
for (const token of argv) {
  if (token === ';') steps.push([]);
  else steps[steps.length - 1].push(token);
}
const runnable = steps.filter((step) => step.length);
const unknown = runnable.find(([command]) => !commands[command]);
if (!runnable.length || unknown) {
  if (unknown) console.error(`unknown command "${unknown[0]}"`);
  console.log(`commands: ${Object.keys(commands).join(', ')}`);
  process.exit(unknown ? 1 : 0);
}

const { browser, page } = await attach(windowTitle);
let failed = false;
try {
  for (const [command, ...args] of runnable) {
    if (runnable.length > 1) console.log(`> ${command} ${args.join(' ')}`);
    await commands[command](page, args, browser);
  }
} catch (e) {
  // One line, not Playwright's full call log: the step that failed and why.
  failed = true;
  console.error(`FAILED: ${e.message.split('\n')[0]}`);
} finally {
  // Detach only — never close, that would kill the user's Studio window.
  await browser.close();
}
process.exit(failed ? 1 : 0);
