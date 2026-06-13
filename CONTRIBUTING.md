# Contributing

**A People's History of AI is meant to be edited by the people.** It's an open,
community-built exhibit — there's no backend and no gatekeeping pipeline. Every
slide is a small JSON file, the whole site is plain HTML/CSS/JS, and anyone can
propose a change with a pull request.

Thank you for helping make it more accurate, more complete, and more fun. 💫

## The fastest ways to help

- **Fix a slide** — on any slide, click **✎ Edit this slide**. GitHub opens that
  slide's JSON file in its web editor; make your change and submit it as a pull
  request, all in the browser.
- **Report a mistake** — click **⚑ Report a mistake** on the slide. It opens a
  pre-filled GitHub issue tagged with the slide's id. No GitHub editing required.
- **Add a source, tag, or challenge** — same as fixing a slide: edit its JSON.

## How the content is structured

```
data/
  manifest.json     # site config + the ORDERED list of node ids (timeline order)
  eras.json         # the eras (id, name, year range, blurb)
  nodes/<id>.json   # one file per slide
```

A node looks like this (see existing files in `data/nodes/` for full examples):

```jsonc
{
  "id": "perceptron-1958",          // matches the filename: perceptron-1958.json
  "era": "symbolic-to-connectionist", // an id from eras.json
  "year": 1958,
  "title": "The Perceptron",
  "who": "Frank Rosenblatt",         // shown beside the year
  "fig": "3.2",                       // placeholder figure label
  "caption": "…",                     // caption for the (future) image
  "levels": {
    "overview": { "text": "…", "image": "", "tags": ["…", "…"] },
    "deep":     { "text": "…", "math": "ŷ = φ(Σ wⱼxⱼ + b)" }
  },
  "challenge": { /* optional — see below */ },
  "sources": [
    { "title": "…", "author": "…", "year": 1958, "publisher": "…",
      "url": "https://…", "license": "Public domain" }
  ]
}
```

### Editorial guidelines

- **Get the facts right.** Dates, names, and claims should be verifiable. Cite a
  real source in `sources[]`. When something is contested or approximate, say so.
- **Two depths, one timeline.** `overview` is for a curious newcomer (what happened,
  who, why it mattered). `deep` is the science/math for technical readers. Both
  render together when the reader turns both on, so `deep` should *extend* the
  overview, not repeat it.
- **Warm but trustworthy.** Think museum wall text, not a textbook or a tweet.
- **Math** goes in `levels.deep.math` as plain Unicode (e.g. `Σ`, `θ`, `wⱼ`).
- **Licenses**: use an accurate `license` per source — e.g. `Public domain`,
  `CC BY-SA`, or `© cited` for copyrighted works referenced under fair use.

### Adding a new slide

1. Create `data/nodes/<id>.json` (kebab-case id, usually `topic-year`).
2. Add `"<id>"` to the `nodes` array in `data/manifest.json`, **in chronological
   order** (that array *is* the timeline order).
3. Point `era` at an existing id in `eras.json`, or add a new era there.
4. Make sure the JSON is valid (see "Running locally").

### Challenges (optional, occasional)

Challenges are a treat between reading — keep them rare and never essential. Add a
`challenge` object to a node using one of these shapes (`feedback` is always
`{ "correct": "…", "incorrect": "…" }`):

| type | extra fields |
|------|--------------|
| `multiple-choice` | `prompt`, `options` (array), `answer` (0-based index) |
| `guess-the-year`  | `prompt`, `answer` (year), `range` `{min,max}`, `tolerance` |
| `predict-word`    | `prompt`, `sentence` (use `___` for the blank), `answer`, `alternatives` `[{word,pct}]` |
| `order-events`    | `prompt`, `items` `[{year,label}]` *(in correct order; the UI shuffles)* |
| `myth-fact`       | `statement`, `isMyth` (boolean) |
| `estimate-number` | `prompt`, `answer` (number), `unit`, `range` `{min,max}`, `tolerance` |

## Running locally

The site loads content with `fetch()`, so it needs to be served over HTTP (not
opened as a `file://`):

```bash
python -m http.server 8000   # then open http://localhost:8000
# or: npx serve .
```

There is **no build step** and **nothing to install** — the only runtime
dependency, [`spektrum`](https://www.npmjs.com/package/spektrum), is loaded from a
CDN. Please don't add dependencies or a build pipeline without discussing it first.

## Pull request checklist

- [ ] JSON files are valid (no trailing commas) and `manifest.json` lists every node.
- [ ] New/changed facts have a source.
- [ ] One slide per file; ids match filenames.
- [ ] You didn't add a build step or a new runtime dependency.

If you're unsure about anything, open an issue and ask — friendly questions
welcome.
