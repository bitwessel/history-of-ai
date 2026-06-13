# A People's History of AI

An open, community-built tour through the history of artificial intelligence —
from early theories of machine reasoning to the models of today. It's an
interactive slideshow on a timeline, designed to feel like **a beautifully
designed museum exhibit, not a textbook**.

Curious newcomers and technical readers explore the *same* timeline, each at
their chosen reading depth.

> **Status:** the first full version is live. Working: the slide view + timeline
> scrubber, the multi-select reading-depth toggle, an animated cosmic background
> (toggleable), opt-in **challenges** in all six formats (multiple-choice,
> guess-the-year, predict-the-word, order-events, myth-vs-fact, estimate-the-
> number), per-slide **sources**, **Edit this slide / Report a mistake** links
> into GitHub, and an **era-overview** map — all rendering live from JSON across
> 10 slides / 3 eras. Next up is real content and imagery (the prose is accurate
> but placeholder-grade for now).

## Open by design

This site is **proudly editable by the community**. There is no backend and no
database — every slide is a small JSON file under [`/data`](data/), and the
plan is for "Edit this slide" and "Report a mistake" buttons to link straight
to GitHub. If you spot a mistake or want to add a slide, you'll be able to edit
the data file and open a pull request. (Those buttons are coming in the next
iteration.)

## Tech, on purpose

- **Plain static HTML / CSS / JS.** No framework, no bundler, **no build step**.
- **One tiny dependency:** [`spektrum`](https://www.npmjs.com/package/spektrum),
  a zero-dependency reactive engine, loaded from a CDN via an import map with a
  pinned version. Nothing is installed or shipped in the repo.
- Deploys to **GitHub Pages** straight from the repo root.

## Running it locally

Because the site loads content with `fetch()`, browsers won't let it run from a
`file://` URL — you need to serve it over HTTP. Any static server works:

```bash
# Python 3 (built in on most systems)
python -m http.server 8000
# then open http://localhost:8000
```

```bash
# or, with Node installed
npx serve .
```

On GitHub Pages it Just Works — Pages serves over HTTPS, so there's nothing to
configure.

## Project layout

```
index.html          # the app shell + slide markup (spektrum bindings)
css/
  tokens.css        # design tokens: colours, fonts, light/dark themes
  app.css           # component styles
js/
  app.js            # loads /data, builds the reactive view-model, wires events
data/
  manifest.json     # site config + the ordered list of timeline nodes
  eras.json         # era definitions
  nodes/            # one JSON file per timeline node (one slide each)
assets/             # images / diagrams (placeholders for now)
```

## The content model

Each timeline node is one file in [`data/nodes/`](data/nodes/), listed in order
in [`data/manifest.json`](data/manifest.json):

```jsonc
{
  "id": "perceptron-1958",
  "era": "early-neural-nets",     // references an id in eras.json
  "year": 1958,
  "title": "The Perceptron",
  "who": "Frank Rosenblatt",      // attribution shown beside the year
  "caption": "…",                 // caption for the visual
  "levels": {
    "overview": { "text": "…", "image": "assets/…", "tags": ["…"] },
    "deep":     { "text": "…", "math": "w·x + b" }
  },
  "challenge": { /* optional, occasional — see below */ },
  "sources": [ { "title": "…", "author": "…", "url": "…", "license": "CC BY-SA" } ]
}
```

Two reading depths stack: **Overview** (broad, public) and **In-depth** (the
science and the math). Both can be on at once.

## License

Content and code are intended to be openly licensed (see `sources[].license` on
each node for per-source attribution). A repository license will be added.
