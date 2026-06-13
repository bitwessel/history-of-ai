# Handoff prompt — continue building (paste into a new session)

> Copy everything in the block below into a fresh Claude Code session. It
> contains the full context plus all the remaining work.

```
You are continuing an existing project: "A People's History of AI" — an open,
educational, interactive timeline of the history of AI. Plain static HTML/CSS/JS,
NO build step, NO framework; it renders reactively with the tiny `spektrum`
engine loaded from a CDN, and deploys to GitHub Pages. It is fully working and
already deployed — your job is the enhancements listed at the bottom.

ENVIRONMENT
- Local path: C:\projects\history-of-ai   (Windows; PowerShell + a Bash tool)
- Repo: bitwessel/history-of-ai  (gh CLI authenticated as bitwessel; remote = SSH)
- Live: https://bitwessel.github.io/history-of-ai/  (Pages, branch main, path /)
- Run locally: `PORT=8137 node _ref/serve.mjs` (zero-dep static server, in _ref)
  or `python -m http.server 8000`. It uses fetch(), so needs HTTP, not file://.
- Deploy = commit + `git push origin main` (Pages auto-builds in ~1 min).
  Commit style: short subject + bullet body + trailer
  `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

WHAT ALREADY WORKS (do NOT rebuild): slide view (visual + story, year/title/era),
prev/next + a 10-tick timeline scrubber with challenge markers; multi-select
reading-depth toggle (Overview/In-depth) with math; opt-in occasional challenges
in all six formats (multiple-choice, guess-the-year, predict-word, order-events,
myth-fact, estimate-number) with a global on/off toggle + per-slide reset;
per-slide sources drawer; "Edit this slide"/"Report a mistake" GitHub links;
era-overview screen (header "Overview" toggle); animated cosmic background
(toggle, persisted); light/dark; responsive; README, CONTRIBUTING, .github
issue template; dual-licensed (MIT code + CC BY-SA content). 10 nodes / 3 eras.

PROJECT MAP
- index.html — app shell + all markup with spektrum bindings.
- css/tokens.css — design tokens (light/dark vars, fonts, keyframes). DON'T fight these.
- css/app.css — component styles.
- js/app.js — state, computeds, handlers, data loading. Read it fully first.
- js/starfield.js — the cosmic-background canvas controller.
- data/manifest.json — site config (incl. repo {owner,name,branch,dataDir}) + the
  ORDERED `nodes` array (timeline order). data/eras.json — eras. data/nodes/<id>.json
  — one slide each.
- _ref/ — GITIGNORED scratch: _spektrum.js (the real spektrum source — READ it,
  don't guess the API), serve.mjs, cdp-check.mjs + verify-wave1.mjs (headless
  verification examples).

NODE SCHEMA: { id, era (eras.json id), year, title, who, fig, caption,
  levels:{ overview:{text,image,tags[]}, deep:{text,math} }, challenge?, sources[] }.
Challenge shapes are documented in CONTRIBUTING.md (one `feedback{correct,incorrect}`
each). data/ may carry data for a challenge type before its UI exists — the UI is
gated by `IMPLEMENTED_CHALLENGE_TYPES` (a Set near the top of app.js).

SPEKTRUM RULES (verified from _ref/_spektrum.js — do NOT guess):
- Events: data-action="event[.prevent/.stop/.once/.enter/.esc]" + data-fn="name";
  register with defineFn('name',(el,state,delta,value,event,scope)=>…) BEFORE bindDOM().
- {{expr}} works in TEXT nodes only. For attributes use :attr="expr" and
  :class="{cls: expr}" (object form preserves static classes). data-if = show/hide.
- Lists: data-each="dotted.path" data-as="x" on a <template> (loop vars x,$index,
  $first,$last); use data-key="…" for stable DOM across reorder. Per-row click args:
  bind :data-foo="x.y" then read el.dataset.foo in the handler.
- Two-way inputs: data-model="path[.number/.lazy/.trim]". Derived state:
  computed(path, deps, fn) — fn(state) re-runs when any dep path changes.
- appState is the live merged state but updates on the rAF tick, NOT synchronously
  after setValue — in handlers compute the new value yourself.
- Inline per-row style: :style="'--x:'+x.v" sets cssText incl. custom props.
- Persisted prefs: see readPref/writePref + the `initialX` consts at the top of app.js
  and the toggle handlers — mirror that pattern for any new pref.

VERIFY before each commit: `node --check js/app.js`; serve on 8137; drive the REAL
app with headless Edge over the DevTools Protocol (see _ref/verify-wave1.mjs and
_ref/cdp-check.mjs). Edge: "/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"
--headless=new --disable-gpu --no-sandbox --remote-debugging-port=9222
--user-data-dir=<unique-in-_ref> ; then a node script polls http://localhost:9222/json,
connects, Page.navigate to http://localhost:8137/, Runtime.evaluate (awaitPromise) to
click + read DOM. IMPORTANT: the scrubber rebuilds .tick nodes on every navigation,
so RE-QUERY document.querySelectorAll('.tick')[i] before each click. For
screenshots use --screenshot=<ABSOLUTE path> (relative paths don't write); a
same-origin iframe-driver (load "/" in an iframe and click real buttons) works well.
Kill the headless Edge by its port/user-data-dir via PowerShell when done (profiles lock).

CONSTRAINTS: zero dependencies beyond CDN spektrum; NO build step; keep it
deployable as static files. Content is CC BY-SA — keep facts accurate and cite
sources. Match the existing code style and comment density. Build incrementally:
one feature → verify in-browser → commit → push. You may delegate independent
chunks to subagents, but note index.html/js/app.js/css/app.css are shared, so
don't run two agents on them at once.

=================  REMAINING WORK  =================

1) CONSISTENT SLIDE SIZE. Today `.slide__body` has min-height:520px so longer
   slides grow and the box jumps when navigating. On DESKTOP (>720px) give the
   slide a FIXED height (~600px) and make `.slide__text` scroll internally
   (overflow-y:auto; min-height:0); the left `.slide__visual` fills the height.
   On mobile (≤720px) keep natural/auto height, no inner scroll. Goal: prev/next
   never changes the slide's outer size on desktop.

2) EXPAND TOGGLE (~80% width). Add a persisted `wide` bool (localStorage
   'hai.wide'; initialWide const + setValue in boot + writePref in handler). Put
   the toggle on the RIGHT of the slide eyebrow row ("Slide X of N" → flex row,
   eyebrow left, button right): data-fn="toggleWide", :aria-pressed="wide",
   icon+label flipping "⤢ Wide"/"⤡ Fit". When wide, the slide container widens to
   ~80vw (so a strip of cosmos still shows each side); else the current 1180px
   max. Implement via :class="{ wide: wide }" on .exhibit + `.exhibit.wide{max-width:80vw}`.

3) RENDER IMAGES. The visual area only shows the striped placeholder; buildCur
   already exposes cur.image (levels.overview.image, "" for all nodes now). In
   .slide__visual render <img class="slide__photo" :src="cur.image" :alt="cur.caption"
   data-if="cur.image"> filling the frame (object-fit:cover); show the placeholder
   text + "drop archival photo" hint only when !cur.image; keep the era pill, fig,
   and italic caption. This makes real images work (see step 6).

4) CHALLENGE RESULTS — green/red scrubber dots + a header score.
   - Add session state `chResults` (object map nodeId → 'correct'|'incorrect'|'revealed');
     setValue('chResults',{}) in boot. Do NOT clear it in resetChallenge (it
     accumulates as you play). Helper recordResult(id,res){ setValue('chResults',
     {...appState.chResults,[id]:res}); }.
   - Wire recordResult(appState.cur.id, …) into the grading handlers: pickMC
     ('correct' if idx===answer else 'incorrect'), submitYear, pickMyth, submitEst,
     checkOrder (all match the chFb they set), and revealPredict → 'revealed'
     (predict-word is a reveal, NOT graded).
   - Scrubber: in buildTicks add `result:(state.chResults||{})[node.id]` and add
     'chResults' to the ticks computed deps. On `.tick__challenge` add
     :class="{ 'tick__challenge--correct':t.result==='correct',
     'tick__challenge--incorrect':t.result==='incorrect' }"; CSS: correct→var(--good),
     incorrect→var(--bad), default→var(--accent). Keep the showChallenge gate.
   - Header SCORE: computed chScore={correct,total} where total = nodes whose
     challenge type is implemented AND gradeable (EXCLUDE predict-word), correct =
     count of chResults==='correct'; deps ['chResults','nodes','challengesOn']. Show
     a compact chip in the header near the Challenges toggle (data-if="challengesOn"):
     "✓ {{chScore.correct}} / {{chScore.total}}", title "challenges answered correctly".

5) MOUSE DRAG for order-events (keep the ▲/▼ buttons). Working order is `chOrder`
   (array of original indices) via the orderList computed + a keyed data-each. Make
   each row draggable="true" with data-action="dragstart" data-fn="orderDragStart"
   :data-pos="$index"; data-action="dragover.prevent" data-fn="orderDragOver"
   (tiny/no-op fn — .prevent enables dropping); data-action="drop.prevent"
   data-fn="orderDrop" :data-pos="$index" (+ optional dragend). Use module-level
   `let orderDragFrom=null;`; on drop splice chOrder from→to and setValue. Don't
   break ▲/▼ or checkOrder; keep the data-key stable.

6) ADD REAL IMAGES (content). After step 3, source public-domain / CC-licensed
   images for the 10 slides, drop files in /assets, set each node's
   levels.overview.image, write a descriptive caption (= alt text), and record the
   source+license in that node's sources[]. Full guide: docs/adding-images.md.
   Propose picks (with source URLs + licenses) before downloading. When unsure,
   leave the placeholder. The 10 ids: mcculloch-pitts-1943, turing-test-1950,
   dartmouth-1956, perceptron-1958, perceptrons-book-1969, backpropagation-1986,
   deep-blue-1997, alexnet-2012, transformers-2017, chatgpt-2022. (Also: the prose
   is accurate but placeholder-grade and may be refined; double-check the AlexNet
   top-5 error %, Deep Blue positions/sec, and the "ChatGPT 100M users" figure.)

7) NORMALIZE LINE ENDINGS. Add a .gitattributes with `* text=auto eol=lf` (+
   `*.png -text`/binary rules), then `git add --renormalize .` and commit as its
   OWN clean commit ("Normalize line endings to LF"). Do this LAST, when nothing
   else is mid-edit (it restages every file).

Suggested order: 1+2 together (layout) → 3 → 4 → 5 → 7 → 6 (content). Read
README.md, CONTRIBUTING.md, js/app.js and index.html first. Build, verify, commit,
push each step.
```
