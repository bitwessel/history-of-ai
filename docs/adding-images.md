# Handoff: adding real images to slides

The slides ship with striped **placeholders** in the visual area. Replacing one
with a real image is just two steps: drop a file in `/assets`, then point the
slide's JSON at it. No code changes, no build step.

## 1. Add the image file

Put the file under [`/assets`](../assets/). A flat folder is fine; name files
after the slide id so they're easy to find:

```
assets/perceptron-1958.jpg
assets/alexnet-2012.webp
```

**Recommended specs**
- **Aspect ratio:** landscape **4:3** (e.g. **1600 × 1200**). The visual frame
  uses `object-fit: cover`, so other ratios still work but will be cropped to
  fill the frame.
- **Format:** `.jpg` for photos, `.webp` for smaller files, `.png` for diagrams
  with transparency or text.
- **Weight:** keep it light — aim for **under ~300 KB**. Optimize before
  committing (e.g. [squoosh.app](https://squoosh.app)). These load over the
  network on every slide.

## 2. Point the slide at it

In the node's JSON file (`data/nodes/<id>.json`), set `levels.overview.image`
to the repo-relative path:

```jsonc
{
  "levels": {
    "overview": {
      "text": "…",
      "image": "assets/perceptron-1958.jpg",   // ← was ""
      "tags": ["…"]
    }
  },
  "caption": "The Mark I Perceptron wiring its 400 photocells to motor-driven weights."
}
```

That's it. When `image` is non-empty the slide renders the photo in the visual
frame (cropped to fill); when it's empty you get the striped placeholder.

### Alt text & captions

- The image's **alt text** comes from the node's `caption` — so write a
  genuinely descriptive caption (it doubles as accessibility text and the
  italic caption shown on the slide). Don't write "image of…"; describe what's
  shown.
- The `fig` field (e.g. `"3.2"`) is just a small figure label in the corner.

## 3. Mind the rights (this is a public, CC BY-SA project)

Only add images you're allowed to republish:

- Prefer **public domain** or **Creative Commons** images — e.g. Wikimedia
  Commons, the Internet Archive, institutional/government archives.
- Record where it came from in the node's `sources[]`, with an accurate
  `license` (e.g. `"Public domain"`, `"CC BY-SA"`, `"CC BY"`). If the license
  requires attribution, name the author in the source entry.
- When in doubt, leave the placeholder — a placeholder beats a rights problem.

## 4. Contributing without a local checkout

You don't need to clone the repo: open a slide on the site, click
**✎ Edit this slide** to edit its JSON on GitHub, and attach/commit the image to
`/assets` in the same pull request (GitHub's web "Add file → Upload files"
works). A maintainer can help wire it up if you get stuck — open an issue with
the **⚑ Report a mistake** button.

---

### Notes for maintainers

- Only `levels.overview.image` is rendered in the visual frame today. The schema
  also allows `levels.deep.image`, but it isn't displayed — wire it in
  `index.html` / `buildCur` if you want a separate in-depth diagram later.
- The frame is a fixed 4:3-ish box; very wide or very tall source images are
  center-cropped. Crop intentionally before upload if the subject is off-center.
