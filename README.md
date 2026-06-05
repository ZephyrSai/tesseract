# TESSERACT — A Journey Through Dimensions & Spacetime

An interactive, scroll-driven 3D experience that climbs from a single point all the
way to the fourth dimension — inspired by Carl Sagan's *Cosmos* / *Pale Blue Dot*.
Every load is scored by a unique generative ambient soundtrack, and the whole thing
works in both light and dark.

## The journey

| # | Chapter | What it shows |
|---|---------|---------------|
| 0 | The Pale Blue Dot | Opening in deep space, a tiny blue dot, Sagan's words |
| 1 | The Point (0D) | A dimensionless singularity |
| 2 | The Line (1D) | A Linelander gliding on its one-dimensional thread |
| 3 | The Plane (2D) | Flatland — an infinite glowing sheet of graph paper |
| 4 | A Visitor From Above (2D→1D) | A 2D disc crossing the 1D line; the Linelander sees only two points |
| 5 | Space (3D) | Solid cube, sphere and apple with their three axes |
| 6 | The Apple in Flatland (3D→2D) | Sagan's apple falling *through* the graph paper, leaving cross-sections + an ink-stamp |
| 7 | Pages of Time | The apple rebuilt by stacking 2D slices like pages in a book |
| 8 | Smeared Across Time | A worldline through spacetime, with a sweeping "now" plane |
| 9 | Perpendicular to Everything | The ladder: point → line → square → cube → tesseract |
| 10 | The Tesseract | A fully animated 4D hypercube, rotating in 4D and projected into 3D |
| 11 | The Pale Blue Dot | Zoom back out; the closing meditation |

## Running it

The app uses native ES modules + an import map, so it must be served over HTTP
(opening `index.html` from `file://` will not work).

```bash
python3 serve.py
# then open http://localhost:4321
```

`serve.py` is a tiny static server that sends `no-store` headers (handy while
editing) and the correct `text/javascript` MIME type for modules. Any static
server works too (e.g. `python3 -m http.server 4321`).

> Needs an internet connection on first load: Three.js is pulled from a CDN via the
> import map, and the display fonts from Google Fonts (both degrade to system
> fallbacks). To go fully offline, vendor `three` locally and self-host the fonts.

## Controls

- **Scroll** to travel the journey.
- **◐ / Dark·Light** — toggle theme (remembered across visits; dark by default).
- **♪ Sound** — start/stop the generative score. (It also starts on your first
  click/keypress anywhere; mute any time.)

## How it's built

- **`index.html`** — the scrolling narrative (one `<section class="chapter">` each)
  over a single fixed WebGL canvas.
- **`css/styles.css`** — themable via CSS variables on `[data-theme]`; fluid type.
- **`js/main.js`** — renderer, bloom post-processing, the persistent starfield,
  the scroll→progress→camera choreography, theme + audio wiring.
- **`js/chapters.js`** — every scene, each with `update(progress, time, weight)`
  and a `camera()` pose. Dark mode glows (additive blending); light mode is solid
  "blueprint on paper" (normal blending).
- **`js/tesseract.js`** — the 4D math: 16 vertices, 32 edges, double rotation in 4D,
  perspective projection 4D→3D, drawn as glowing gradient edges + nodes.
- **`js/audio.js`** — a Web Audio generative engine: slow evolving pads, sub drone,
  airy noise and occasional bells. A fresh random seed each load picks the key,
  scale, voicing and timing, so the theme is familiar but never identical.
- **`js/theme.js`, `js/utils.js`** — palettes and small math helpers.
