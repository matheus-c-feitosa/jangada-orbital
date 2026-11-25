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

The SEO point lost is `robots.txt`. `vite preview` answers that path with the app page. On GitHub Pages, `robots.txt`
belongs to the root of the user domain, outside this project. The mobile preset was not run.

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
| Vitest | 72 passed |
| Playwright | 29 passed |
| pytest | 44 passed |
