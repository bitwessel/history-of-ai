// =========================================================================
// A People's History of AI — application logic
//
// Plain ES module, no build step. All content is loaded at runtime from
// /data and rendered reactively with spektrum (the only dependency).
//
// spektrum API used here (read from the v1.1.0 source, not guessed):
//   setValue(path, value)         write reactive state at a dotted path
//   computed(path, deps, fn)      derived state; fn(state) re-runs on dep change
//   defineFn(name, fn)            register a handler for data-fn="name"
//                                 fn signature: (el, state, delta, value, event, scope)
//   bindDOM(root?)                scan the DOM for bindings; default root = document
//   run()                         start the requestAnimationFrame tick loop
//   appState                      live, merged state object (read-only use here)
// =========================================================================

import { setValue, computed, defineFn, bindDOM, run, appState } from 'spektrum';
import { createStarfield } from './starfield.js';

// Persisted UI preferences (theme + animated background).
function readPref(key) { try { return localStorage.getItem(key); } catch { return null; } }
function writePref(key, value) { try { localStorage.setItem(key, value); } catch { /* private mode */ } }

const savedTheme = readPref('hai.theme');
const initialTheme = (savedTheme === 'dark' || savedTheme === 'light') ? savedTheme : 'light';
const savedCosmos = readPref('hai.cosmos');
const initialCosmos = savedCosmos === null ? true : savedCosmos === '1';  // default on
const savedChallenges = readPref('hai.challenges');
const initialChallenges = savedChallenges === null ? true : savedChallenges === '1';  // default on

let sky = null;  // starfield controller, created at boot

// Challenge types whose UI is implemented. A node may carry challenge data for
// a type that isn't built yet (content can run ahead of UI); those stay dormant
// — no prompt, no scrubber marker — until their type is added here AND given a
// render block in index.html. Wave 3 adds: predict-word, order-events,
// myth-fact, estimate-number.
const IMPLEMENTED_CHALLENGE_TYPES = new Set(['multiple-choice', 'guess-the-year']);

// ---- Pure view-model builders -------------------------------------------

/** The current node, flattened into the fields the slide template reads. */
function buildCur(state) {
  const nodes = state.nodes;
  if (!Array.isArray(nodes) || nodes.length === 0) return null;
  const i = clampIdx(state.activeIdx, nodes.length);
  const n = nodes[i];
  const eras = Array.isArray(state.eras) ? state.eras : [];
  const era = eras.find(e => e.id === n.era);
  const levels = n.levels || {};
  const ov = levels.overview || {};
  const dp = levels.deep || {};
  const math = (dp.math || '').trim();
  const ch = n.challenge || null;
  return {
    id: n.id,
    year: n.year,
    title: n.title,
    who: n.who || '',
    eraName: era ? era.name : (n.era || ''),
    fig: n.fig ? ('fig. ' + n.fig) : '',
    caption: n.caption || '',
    image: ov.image || '',
    overview: ov.text || '',
    tags: Array.isArray(ov.tags) ? ov.tags : [],
    deep: dp.text || '',
    math,
    hasMath: math.length > 0,
    hasChallenge: !!ch && IMPLEMENTED_CHALLENGE_TYPES.has(ch.type),
    challenge: ch,
    srcCount: Array.isArray(n.sources) ? n.sources.length : 0,
    sources: Array.isArray(n.sources)
      ? n.sources.map(s => ({ ...s, urlHost: urlHostname(s.url || '') }))
      : []
  };
}

/** Extract just the hostname from a URL for display. Falls back to the raw URL. */
function urlHostname(url) {
  try { return new URL(url).hostname; } catch { return url; }
}

/** Build the GitHub links object for the current slide.
 *  Returns { edit, report } — both are full URLs ready to bind to :href.
 *  Returns null when manifest hasn't loaded yet. */
function buildLinks(state) {
  const cur = state.cur;
  const manifest = state.manifest;
  if (!cur || !manifest) return { edit: '#', report: '#' };
  const repo = manifest.repo || {};
  const owner = repo.owner || '';
  const name = repo.name || '';
  const branch = repo.branch || 'main';
  const dataDir = repo.dataDir || 'data/nodes';
  const id = cur.id || '';
  const title = cur.title || '';

  const edit = `https://github.com/${owner}/${name}/edit/${branch}/${dataDir}/${id}.json`;

  const issueTitle = encodeURIComponent(`Mistake on slide: ${title} (${id})`);
  const issueBody = encodeURIComponent(
    `**Slide:** ${id}\n**Title:** ${title}\n\nDescribe the mistake:\n\n<!-- Please link to the live slide if possible: https://bitwessel.github.io/history-of-ai/ -->`
  );
  const report = `https://github.com/${owner}/${name}/issues/new?title=${issueTitle}&body=${issueBody}&template=mistake.md`;

  return { edit, report };
}

// ---- Challenge helpers ---------------------------------------------------

/** Reset per-slide challenge UI state. Called whenever the active slide
 *  changes so each slide starts fresh (collapsed, neutral). */
function resetChallenge() {
  setValue('chOpen', false);
  setValue('chPick', null);
  setValue('chYear', null);     // null = not yet set; will be seeded from challenge data
  setValue('chFb', 'neutral');  // 'neutral' | 'correct' | 'incorrect'
}

/** Build the list of multiple-choice option objects for the template loop.
 *  Each item: { label, idx, picked, correct, state }
 *  `state` is 'neutral' | 'correct' | 'incorrect' — drives CSS classes.
 *
 * HOW TO ADD A NEW CHALLENGE TYPE
 * ================================
 * 1. Add the new type's data shape in the relevant node JSON
 *    (e.g. { type: "predict-word", prompt, ... }).
 * 2. In index.html, add a new block inside the challenge expanded area:
 *      <div data-if="cur.challenge.type === 'new-type-name'">
 *        <!-- type-specific UI using state paths chXxx for interaction -->
 *      </div>
 * 3. In app.js, add:
 *    a. Any new state paths (e.g. setValue('chGuess', '')) in boot().
 *    b. A defineFn handler (e.g. defineFn('checkNewType', ...)).
 *    c. Reset those paths inside resetChallenge().
 *    d. If you need a computed list (like mcOptions), add a computed()
 *       call in boot() keyed to the new state paths.
 *    e. Add the type string to IMPLEMENTED_CHALLENGE_TYPES (top of file) so
 *       its "Try a challenge?" prompt and scrubber marker switch on.
 * 4. Add CSS classes in app.css if the type needs unique visual treatment.
 * That's it — the data-if gate in HTML selects the right type UI automatically.
 */
function buildMcOptions(state) {
  const ch = state.cur && state.cur.challenge;
  if (!ch || ch.type !== 'multiple-choice') return [];
  const fb = state.chFb || 'neutral';
  const pick = state.chPick;
  const answer = ch.answer;
  return (ch.options || []).map((label, idx) => {
    let optState = 'neutral';
    if (fb !== 'neutral') {
      if (idx === answer) optState = 'correct';
      else if (idx === pick) optState = 'incorrect';
    }
    return { label, idx, optState };
  });
}

/** One tick per node for the timeline scrubber. */
function buildTicks(state) {
  const nodes = state.nodes;
  if (!Array.isArray(nodes) || nodes.length === 0) return [];
  const n = nodes.length;
  const active = clampIdx(state.activeIdx, n);
  const challengesOn = !!state.challengesOn;
  return nodes.map((node, idx) => ({
    idx,
    year: node.year,
    left: (n > 1 ? (idx / (n - 1)) * 100 : 0) + '%',
    active: idx === active,
    title: node.year + ' · ' + node.title,
    showChallenge: !!node.challenge && IMPLEMENTED_CHALLENGE_TYPES.has(node.challenge.type) && challengesOn
  }));
}

function clampIdx(i, len) {
  i = Number(i) || 0;
  return Math.min(Math.max(i, 0), Math.max(len - 1, 0));
}

// ---- Navigation helpers --------------------------------------------------

function goTo(idx) {
  const len = Number(appState.nodeCount) || 0;
  setValue('activeIdx', clampIdx(idx, len));
  // Reset challenge UI whenever the slide changes so each slide starts
  // collapsed and neutral. chYear gets seeded on render from challenge data.
  resetChallenge();
}

// ---- Boot ----------------------------------------------------------------

function boot() {
  // Initial state — set before bindDOM so the first render is correct
  // (spektrum primes each binding synchronously against current state).
  setValue('view', 'loading');
  setValue('errorMsg', '');
  setValue('theme', initialTheme);
  setValue('cosmos', initialCosmos);
  setValue('activeIdx', 0);
  setValue('nodeCount', 0);
  setValue('firstYear', '');
  setValue('lastYear', '');
  setValue('depthOv', true);   // newcomers read the overview by default
  setValue('depthIn', false);  // specialists opt into the in-depth layer
  setValue('challengesOn', initialChallenges);
  setValue('nodes', []);
  setValue('eras', []);

  // Sources drawer state.
  setValue('sourcesOpen', false);

  // Challenge UI state — kept separate from the cur computed so the
  // interaction state never pollutes the view-model.
  setValue('chOpen', false);   // whether the challenge panel is expanded
  setValue('chPick', null);    // index of the picked MC option (or null)
  setValue('chYear', null);    // current year slider value (null = unset)
  setValue('chFb', 'neutral'); // feedback state: 'neutral'|'correct'|'incorrect'

  // Derived state — ports the design prototype's renderVals().
  computed('cur', ['activeIdx', 'nodes', 'eras'], buildCur);
  computed('ticks', ['activeIdx', 'nodes', 'challengesOn'], buildTicks);
  // Computed list for the multiple-choice options loop.
  computed('mcOptions', ['cur', 'chPick', 'chFb'], buildMcOptions);
  // Computed GitHub links (edit / report) keyed on current slide + manifest.
  computed('links', ['cur', 'manifest'], buildLinks);

  // Handlers (must be registered before bindDOM so data-fn lookups resolve).
  defineFn('toggleTheme', () => {
    const next = appState.theme === 'dark' ? 'light' : 'dark';
    setValue('theme', next);
    writePref('hai.theme', next);
    if (sky) sky.setTheme(next);
  });
  defineFn('toggleCosmos', () => {
    const next = !appState.cosmos;
    setValue('cosmos', next);
    writePref('hai.cosmos', next ? '1' : '0');
    if (sky) sky.setActive(next);
  });
  defineFn('toggleChallenges', () => {
    const next = !appState.challengesOn;
    setValue('challengesOn', next);
    writePref('hai.challenges', next ? '1' : '0');
  });
  defineFn('prev', () => goTo((Number(appState.activeIdx) || 0) - 1));
  defineFn('next', () => goTo((Number(appState.activeIdx) || 0) + 1));
  defineFn('goto', (el) => goTo(el.dataset.idx));
  defineFn('toggleOv', () => setValue('depthOv', !appState.depthOv));
  defineFn('toggleIn', () => setValue('depthIn', !appState.depthIn));

  // ---- Challenge handlers ----

  // Toggle the challenge panel open/collapsed.
  defineFn('toggleChallenge', () => {
    setValue('chOpen', !appState.chOpen);
  });

  // Multiple-choice: user picks an option by index (passed via data-idx).
  defineFn('pickMC', (el) => {
    const ch = appState.cur && appState.cur.challenge;
    if (!ch || appState.chFb !== 'neutral') return; // locked after first pick
    const idx = Number(el.dataset.idx);
    setValue('chPick', idx);
    setValue('chFb', idx === ch.answer ? 'correct' : 'incorrect');
  });

  // Guess-the-year: the range slider updates this path via data-model.
  // Reset feedback to neutral when the slider moves (before submit).
  // (The range input uses data-model="chYear.number" which writes directly.)

  // Guess-the-year: submit / check the guessed year.
  defineFn('submitYear', () => {
    const ch = appState.cur && appState.cur.challenge;
    if (!ch) return;
    // chYear may be null if the user never touched the slider; seed from midpoint.
    const guess = appState.chYear !== null
      ? Number(appState.chYear)
      : Math.round(((ch.range && ch.range.min) || ch.answer) + ((ch.range && ch.range.max - ch.range.min) || 0) / 2);
    const diff = Math.abs(guess - ch.answer);
    setValue('chFb', diff <= (ch.tolerance || 0) ? 'correct' : 'incorrect');
  });

  // Reset the guess-the-year so the visitor can try again.
  defineFn('resetYear', () => {
    setValue('chYear', null);
    setValue('chFb', 'neutral');
  });

  // Called by the year range input on change; resets feedback so moving
  // the slider after a wrong guess clears the incorrect banner.
  defineFn('yearSliderChange', (el) => {
    setValue('chYear', Number(el.value));
    // Only reset if incorrect — keep 'correct' locked in.
    if (appState.chFb === 'incorrect') setValue('chFb', 'neutral');
  });

  // ---- Sources drawer handlers ----

  defineFn('openSources', () => {
    setValue('sourcesOpen', true);
  });

  defineFn('closeSources', () => {
    setValue('sourcesOpen', false);
  });

  // Noop: used on the drawer panel so click.stop prevents the backdrop
  // from catching inner clicks (panel itself has data-action="click.stop").
  defineFn('noop', () => {});

  bindDOM();
  run();

  // Animated cosmic background — created once, driven imperatively by the toggles.
  const canvas = document.getElementById('cosmos');
  if (canvas) {
    sky = createStarfield(canvas);
    sky.setTheme(initialTheme);
    sky.setActive(initialCosmos);
  }

  // Arrow-key navigation + Escape to close the sources drawer.
  // Ignored while typing in a field.
  window.addEventListener('keydown', (e) => {
    if (appState.view !== 'ready') return;
    const t = e.target;
    if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
    if (e.key === 'Escape') {
      if (appState.sourcesOpen) { setValue('sourcesOpen', false); }
    } else if (e.key === 'ArrowLeft') { goTo((Number(appState.activeIdx) || 0) - 1); }
    else if (e.key === 'ArrowRight') { goTo((Number(appState.activeIdx) || 0) + 1); }
  });

  loadTimeline();
}

// ---- Data loading --------------------------------------------------------

async function fetchJSON(url) {
  const res = await fetch(url, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
  return res.json();
}

async function loadTimeline() {
  try {
    const manifest = await fetchJSON('data/manifest.json');
    const dataDir = (manifest.repo && manifest.repo.dataDir) || 'data/nodes';
    const erasFile = manifest.erasFile || 'data/eras.json';

    const [eras, nodes] = await Promise.all([
      fetchJSON(erasFile),
      Promise.all((manifest.nodes || []).map(id => fetchJSON(`${dataDir}/${id}.json`)))
    ]);

    if (nodes.length === 0) throw new Error('manifest lists no nodes');

    setValue('manifest', manifest);
    setValue('eras', eras);
    setValue('nodes', nodes);
    setValue('nodeCount', nodes.length);
    setValue('firstYear', nodes[0].year);
    setValue('lastYear', nodes[nodes.length - 1].year);
    setValue('activeIdx', 0);
    setValue('view', 'ready');
  } catch (err) {
    console.error('[history-of-ai] failed to load timeline:', err);
    setValue('errorMsg', String(err && err.message ? err.message : err));
    setValue('view', 'error');
  }
}

boot();
