# QA pass (T051, issue #12)

Run on 2026-11-15 against the production build (`npm run build`, served by `vite preview`), branch
`perf/fast-first-screen`.

## Lighthouse

Lighthouse 12.6.1, desktop preset, run on the production build of `main` at `f428444` with headless Chromium 1255:

| Category | Score |
|---|---|
| Accessibility | **100** |
| Best practices | 100 |
| SEO | 91 |

Failing audits and their owners:

| Audit | Why | Owner | Decision |
|---|---|---|---|
| `robots-txt` (SEO) | `vite preview` answers `/robots.txt` with the app page. On GitHub Pages the file belongs to the root of the user domain (`matheus-c-feitosa.github.io`), outside this project. | Matheus | None needed for the project; nothing blocks crawling. |
| `valid-source-maps` (informative) | The production build ships no source maps. | Matheus | Kept that way: the maps would double the download for nobody but developers. |

**Still to run** (owner: Matheus, in a local Chrome; the VM can only run the desktop preset on a local build):
- the mobile preset;
- both presets on the live site, https://matheus-c-feitosa.github.io/jangada-orbital/.

To do it, open DevTools → Lighthouse, pick "Mobile", then "Desktop", and analyze the page. Write the scores in this
table.

## Accessibility script

A script with checks close to Lighthouse's was written for this pass. It runs with the project's Playwright and the
Chrome DevTools Protocol:

- interactive elements without an accessible name, from Chrome's accessibility tree;
- duplicate ids;
- `lang`, `title`, meta description and viewport;
- one `h1`;
- images without `alt`;
- WCAG AA contrast of every visible text against the background painted behind it.

| View | Dark theme | Light theme |
|---|---|---|
| Desktop 1440 px, Calendar tab | no failures | no failures |
| Desktop 1440 px, Ranking tab | no failures | no failures |
| Tablet 768 px | no failures | no failures |
| Phone 390 px | no failures | no failures |
| Phone 390 px, area sheet open | no failures* | no failures* |

\* The full-screen sheet covers the area header, so the page shows its `h2` title and no `h1`.

## Keyboard

Covered by `e2e/calendar.spec.ts`, test "the calendar is used with the keyboard alone":

- the calendar is one tab stop;
- Home, End and the arrow keys move between months;
- the readout follows the focused month.

The tab list keeps its arrow, Home and End keys (`DataPanel.tsx`).

## Drawing

These tests pass:

- "drawing a rectangle on the map loads that area";
- "drawing a polygon on the map loads that area" (new);
- "on a phone, the orange box is dragged by a corner and taken as the area".

## Totals

| Suite | Result |
|---|---|
| Vitest | 79 passed |
| Playwright | 35 passed |
| pytest | 44 passed |
