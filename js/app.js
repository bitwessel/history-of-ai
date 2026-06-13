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
const savedWide = readPref('hai.wide');
const initialWide = savedWide === '1';  // default off (fit to the standard column)

let sky = null;  // starfield controller, created at boot

// Challenge types whose UI is implemented. A node may carry challenge data for
// a type that isn't built yet (content can run ahead of UI); those stay dormant
// — no prompt, no scrubber marker — until their type is added here AND given a
// render block in index.html. Wave 3 adds: predict-word, order-events,
// myth-fact, estimate-number.
const IMPLEMENTED_CHALLENGE_TYPES = new Set(['multiple-choice', 'guess-the-year', 'predict-word', 'order-events', 'myth-fact', 'estimate-number']);

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
  // Wave 3 challenge types
  setValue('chReveal', false);  // predict-word: whether the blank is revealed
  setValue('chOrder', null);    // order-events: working order array (null = unseeded)
  setValue('chMyth', null);     // myth-fact: 'myth' | 'fact' | null (unpicked)
  setValue('chEst', null);      // estimate-number: current slider value (null = unset)
}

/** Record the outcome of the current node's challenge. Accumulates across the
 *  session — deliberately NOT reset on slide change — so the scrubber dots and
 *  header score reflect everything the visitor has tried. A node maps to one
 *  of 'correct' | 'incorrect' | 'revealed' (predict-word is a reveal, not
 *  graded). Re-answering a slide overwrites its prior outcome. */
function recordResult(id, res) {
  if (!id) return;
  setValue('chResults', { ...(appState.chResults || {}), [id]: res });
}

/** Score across all gradeable challenges: { correct, total }. "Gradeable"
 *  excludes predict-word (a reveal) and any type whose UI isn't implemented. */
function buildChScore(state) {
  const nodes = Array.isArray(state.nodes) ? state.nodes : [];
  const results = state.chResults || {};
  let total = 0, correct = 0;
  for (const n of nodes) {
    const ch = n.challenge;
    if (!ch || !IMPLEMENTED_CHALLENGE_TYPES.has(ch.type) || ch.type === 'predict-word') continue;
    total++;
    if (results[n.id] === 'correct') correct++;
  }
  return { correct, total };
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

/** Split the predict-word sentence on ___ into before/after parts + alternatives.
 *  Returns { before, after, answer, alternatives } or null when not applicable. */
function buildPredictParts(state) {
  const ch = state.cur && state.cur.challenge;
  if (!ch || ch.type !== 'predict-word') return null;
  const sentence = ch.sentence || '';
  const sepIdx = sentence.indexOf('___');
  if (sepIdx === -1) return { before: sentence, after: '', answer: ch.answer || '', alternatives: ch.alternatives || [] };
  return {
    before: sentence.slice(0, sepIdx),
    after: sentence.slice(sepIdx + 3),
    answer: ch.answer || '',
    alternatives: ch.alternatives || []
  };
}

/** Map chOrder (array of original item indices) to a display list.
 *  Returns [{ origIdx, year, label }] in the current user ordering. */
function buildOrderList(state) {
  const ch = state.cur && state.cur.challenge;
  if (!ch || ch.type !== 'order-events') return [];
  const items = ch.items || [];
  const order = state.chOrder;
  if (!Array.isArray(order) || order.length === 0) {
    // Not yet seeded — return items in correct order as a fallback (seeding happens on open).
    return items.map((item, i) => ({ origIdx: i, year: item.year, label: item.label }));
  }
  return order.map(origIdx => {
    const item = items[origIdx] || {};
    return { origIdx, year: item.year || '', label: item.label || '' };
  });
}

/** One tick per node for the timeline scrubber. */
function buildTicks(state) {
  const nodes = state.nodes;
  if (!Array.isArray(nodes) || nodes.length === 0) return [];
  const n = nodes.length;
  const active = clampIdx(state.activeIdx, n);
  const challengesOn = !!state.challengesOn;
  const results = state.chResults || {};
  return nodes.map((node, idx) => ({
    idx,
    year: node.year,
    left: (n > 1 ? (idx / (n - 1)) * 100 : 0) + '%',
    active: idx === active,
    title: node.year + ' · ' + node.title,
    showChallenge: !!node.challenge && IMPLEMENTED_CHALLENGE_TYPES.has(node.challenge.type) && challengesOn,
    result: results[node.id]  // 'correct' | 'incorrect' | 'revealed' | undefined
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

// ---- Era-overview builder ------------------------------------------------

/** Build the eraGroups data for the era-overview screen.
 *  Returns an array of { id, name, range, blurb, cards[] } in chronological order.
 *  Each card: { idx, year, title, eraName, isCurrent, showChallenge }.
 *  Eras with zero nodes are omitted. */
function buildEraGroups(state) {
  const nodes = state.nodes;
  const eras = state.eras;
  const activeIdx = state.activeIdx;
  const challengesOn = !!state.challengesOn;

  if (!Array.isArray(nodes) || nodes.length === 0) return [];
  if (!Array.isArray(eras) || eras.length === 0) return [];

  // Group node indices by era id (preserving chronological order of nodes).
  const groups = new Map();
  nodes.forEach((node, idx) => {
    const eraId = node.era;
    if (!groups.has(eraId)) groups.set(eraId, []);
    groups.get(eraId).push(idx);
  });

  // Build result in the order eras appear in eras.json, skipping empty ones.
  const result = [];
  for (const era of eras) {
    const idxList = groups.get(era.id);
    if (!idxList || idxList.length === 0) continue;

    // Compute year range from the nodes in this era.
    const years = idxList.map(i => nodes[i].year);
    const minYear = Math.min(...years);
    const maxYear = Math.max(...years);
    const range = minYear === maxYear ? String(minYear) : `${minYear} – ${maxYear}`;

    const cards = idxList.map(idx => {
      const node = nodes[idx];
      const showChallenge = !!node.challenge &&
        IMPLEMENTED_CHALLENGE_TYPES.has(node.challenge.type) &&
        challengesOn;
      return {
        idx,
        year: node.year,
        title: node.title,
        eraName: era.name,
        isCurrent: idx === clampIdx(activeIdx, nodes.length),
        showChallenge
      };
    });

    result.push({
      id: era.id,
      name: era.name,
      range,
      blurb: era.blurb || '',
      cards
    });
  }
  return result;
}

// ---- Boot ----------------------------------------------------------------

function boot() {
  // Initial state — set before bindDOM so the first render is correct
  // (spektrum primes each binding synchronously against current state).
  setValue('view', 'loading');
  setValue('errorMsg', '');
  setValue('theme', initialTheme);
  setValue('cosmos', initialCosmos);
  setValue('screen', 'slide'); // 'slide' | 'eras'
  setValue('activeIdx', 0);
  setValue('nodeCount', 0);
  setValue('firstYear', '');
  setValue('lastYear', '');
  setValue('depthOv', true);   // newcomers read the overview by default
  setValue('depthIn', false);  // specialists opt into the in-depth layer
  setValue('challengesOn', initialChallenges);
  setValue('wide', initialWide);  // expanded (~80vw) vs. standard-width slide
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
  // Wave 3 challenge types
  setValue('chReveal', false); // predict-word: blank revealed?
  setValue('chOrder', null);   // order-events: working order (array of origIdx)
  setValue('chMyth', null);    // myth-fact: 'myth'|'fact'|null
  setValue('chEst', null);     // estimate-number: slider value (null = unset)
  // Accumulated challenge outcomes: { nodeId: 'correct'|'incorrect'|'revealed' }.
  // Persists across slide changes (NOT reset by resetChallenge) for the
  // scrubber dots + header score.
  setValue('chResults', {});

  // Derived state — ports the design prototype's renderVals().
  computed('cur', ['activeIdx', 'nodes', 'eras'], buildCur);
  computed('ticks', ['activeIdx', 'nodes', 'challengesOn', 'chResults'], buildTicks);
  // Running challenge score for the header chip.
  computed('chScore', ['chResults', 'nodes', 'challengesOn'], buildChScore);
  // Computed list for the multiple-choice options loop.
  computed('mcOptions', ['cur', 'chPick', 'chFb'], buildMcOptions);
  // Computed GitHub links (edit / report) keyed on current slide + manifest.
  computed('links', ['cur', 'manifest'], buildLinks);
  // Era groups for the overview screen.
  computed('eraGroups', ['activeIdx', 'nodes', 'eras', 'challengesOn'], buildEraGroups);
  // Wave 3 computeds
  computed('predictParts', ['cur'], buildPredictParts);
  computed('orderList', ['cur', 'chOrder'], buildOrderList);

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
  defineFn('toggleWide', () => {
    const next = !appState.wide;
    setValue('wide', next);
    writePref('hai.wide', next ? '1' : '0');
  });
  // Toggle between the slide view and the era-overview map.
  defineFn('toggleScreen', () => {
    setValue('screen', appState.screen === 'eras' ? 'slide' : 'eras');
  });
  // Jump to a node by its global index (read from el.dataset.idx) and
  // return to the slide view. Reuses goTo() which sets activeIdx + resets
  // the challenge UI.
  defineFn('jumpTo', (el) => {
    goTo(Number(el.dataset.idx));
    setValue('screen', 'slide');
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
    const res = idx === ch.answer ? 'correct' : 'incorrect';
    setValue('chFb', res);
    recordResult(appState.cur.id, res);
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
    const res = diff <= (ch.tolerance || 0) ? 'correct' : 'incorrect';
    setValue('chFb', res);
    recordResult(appState.cur.id, res);
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

  // ---- Wave 3: predict-word handlers ----

  // Reveal the blank word.
  defineFn('revealPredict', () => {
    setValue('chReveal', true);
    // Show the "correct" feedback message on reveal.
    setValue('chFb', 'correct');
    // predict-word is a reveal, not a graded answer — tracked separately.
    recordResult(appState.cur.id, 'revealed');
  });

  // Hide the revealed word again.
  defineFn('resetPredict', () => {
    setValue('chReveal', false);
    setValue('chFb', 'neutral');
  });

  // ---- Wave 3: myth-fact handlers ----

  // User picks 'myth' or 'fact'. data-value on the button sets el.dataset.value.
  defineFn('pickMyth', (el) => {
    const ch = appState.cur && appState.cur.challenge;
    if (!ch || appState.chFb !== 'neutral') return; // locked after first pick
    const pick = el.dataset.value; // 'myth' or 'fact'
    setValue('chMyth', pick);
    // isMyth true → correct answer is 'myth'
    const correct = ch.isMyth ? 'myth' : 'fact';
    const res = pick === correct ? 'correct' : 'incorrect';
    setValue('chFb', res);
    recordResult(appState.cur.id, res);
  });

  // ---- Wave 3: estimate-number handlers ----

  // Slider change — update chEst and clear incorrect feedback.
  defineFn('estSliderChange', (el) => {
    setValue('chEst', Number(el.value));
    if (appState.chFb === 'incorrect') setValue('chFb', 'neutral');
  });

  // Submit the estimate.
  defineFn('submitEst', () => {
    const ch = appState.cur && appState.cur.challenge;
    if (!ch) return;
    const range = ch.range || {};
    const mid = range.min != null && range.max != null
      ? range.min + (range.max - range.min) / 2
      : ch.answer;
    const guess = appState.chEst !== null ? Number(appState.chEst) : mid;
    const diff = Math.abs(guess - ch.answer);
    const res = diff <= (ch.tolerance || 0) ? 'correct' : 'incorrect';
    setValue('chFb', res);
    recordResult(appState.cur.id, res);
  });

  // Reset the estimate so visitor can try again.
  defineFn('resetEst', () => {
    setValue('chEst', null);
    setValue('chFb', 'neutral');
  });

  // ---- Wave 3: order-events handlers ----

  // Seed the chOrder array to a shuffled order (called when opening order-events).
  // Guaranteed to not be identical to the correct order.
  function seedOrderShuffle(items) {
    const n = items.length;
    const arr = Array.from({ length: n }, (_, i) => i);
    // Fisher-Yates
    for (let i = n - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    // Ensure the shuffle isn't already in correct order (all ascending by year).
    const isCorrect = arr.every((origIdx, pos) => {
      // Correct order = items sorted by year index 0,1,2... (they are given pre-sorted).
      return origIdx === pos;
    });
    if (isCorrect && n >= 2) {
      // Swap first two to guarantee scrambled.
      [arr[0], arr[1]] = [arr[1], arr[0]];
    }
    return arr;
  }

  // Override toggleChallenge to also seed order-events.
  defineFn('toggleChallenge', () => {
    const wasOpen = appState.chOpen;
    setValue('chOpen', !wasOpen);
    // When opening an order-events challenge that hasn't been seeded, seed it.
    if (!wasOpen) {
      const ch = appState.cur && appState.cur.challenge;
      if (ch && ch.type === 'order-events' && !Array.isArray(appState.chOrder)) {
        const shuffled = seedOrderShuffle(ch.items || []);
        setValue('chOrder', shuffled);
      }
    }
  });

  // Move an item up in the order list.
  defineFn('orderMoveUp', (el) => {
    const ch = appState.cur && appState.cur.challenge;
    if (!ch || appState.chFb === 'correct') return; // locked when correct
    const pos = Number(el.dataset.pos);
    if (pos <= 0) return;
    const order = (appState.chOrder || []).slice();
    [order[pos - 1], order[pos]] = [order[pos], order[pos - 1]];
    setValue('chOrder', order);
    if (appState.chFb === 'incorrect') setValue('chFb', 'neutral');
  });

  // Move an item down in the order list.
  defineFn('orderMoveDown', (el) => {
    const ch = appState.cur && appState.cur.challenge;
    if (!ch || appState.chFb === 'correct') return;
    const pos = Number(el.dataset.pos);
    const order = (appState.chOrder || []).slice();
    if (pos >= order.length - 1) return;
    [order[pos], order[pos + 1]] = [order[pos + 1], order[pos]];
    setValue('chOrder', order);
    if (appState.chFb === 'incorrect') setValue('chFb', 'neutral');
  });

  // Check whether the current order is correct.
  defineFn('checkOrder', () => {
    const ch = appState.cur && appState.cur.challenge;
    if (!ch) return;
    const items = ch.items || [];
    const order = appState.chOrder || [];
    // Correct if the year sequence in chOrder is non-decreasing (= ascending).
    let correct = order.length === items.length;
    for (let i = 1; i < order.length && correct; i++) {
      if ((items[order[i]] || {}).year < (items[order[i - 1]] || {}).year) correct = false;
    }
    setValue('chFb', correct ? 'correct' : 'incorrect');
    recordResult(appState.cur.id, correct ? 'correct' : 'incorrect');
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
    } else if (appState.screen === 'slide' && e.key === 'ArrowLeft') { goTo((Number(appState.activeIdx) || 0) - 1); }
    else if (appState.screen === 'slide' && e.key === 'ArrowRight') { goTo((Number(appState.activeIdx) || 0) + 1); }
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
