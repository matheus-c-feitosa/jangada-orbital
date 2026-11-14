# Testing

Three layers, because this project has three different things to break: the pipeline, the web app's logic and
the published site. Each layer uses the tool that fits it; do not test the pipeline with JavaScript or the
static site with pytest.

| Layer | Tool | Where | Needs |
|---|---|---|---|
| Pipeline | pytest (+ pytest-cov) | `pipeline/tests/` | nothing for the offline tests; built data for the invariants |
| Web logic | Vitest (+ coverage-v8) | `web/tests/` | nothing |
| Published site | Playwright | `web/e2e/` | a build (`npm run build`) or `PREVIEW_URL` |

None of the default commands below touches the network, needs a `FIRMS_MAP_KEY` or downloads NASA data.

## Pipeline

```sh
cd pipeline
uv sync                      # first time; installs the dev group (pytest, pytest-cov)
uv run pytest                # all tests
uv run pytest --cov=jangada  # with coverage
```

| File | What it checks | Runs offline |
|---|---|---|
| `test_config_and_access.py` | `.env`/environment `MAP_KEY` lookup, key redaction, yearly URLs, Brazil/Ceará bounding boxes, the eight FIRMS API sources, the HTTP and dead-network paths of `fetch()` and `report()` (network faked) | yes, always |
| `test_harmonize.py` | calibration factor and shrinkage toward the national factor, on toy data | yes, always |
| `test_invariants.py` | the exported web files against `data/processed/`: area totals, sort order, manifest contract, `series.json` vs Parquet, tiles partition | **skipped** until `jangada-aggregate`, `jangada-harmonize` and `jangada-export-web` have run |

On a fresh clone the expected result is `21 passed, 6 skipped`. The 6 skips are the invariants; run the
pipeline first (README, "Data pipeline") to turn them on.

Without `uv`, any Python 3.12+ works for the offline tests:

```sh
cd pipeline
python -m venv .venv
.venv/Scripts/pip install -e . pytest   # .venv/bin/pip on Linux/macOS
.venv/Scripts/python -m pytest
```

### Live probes (manual, never in CI)

`uv run jangada-check` and `uv run jangada-probe` talk to NASA FIRMS. They need a real MAP_KEY, spend
transactions (the probe spends ~80 of 5000 per 10 minutes) and depend on the network. Run them by hand when
touching download code or after a long pause; they are not part of the test suite.

## Web logic: Vitest

```sh
cd web
npm ci
npm test                # area → cells, month comparison, CSV export, noise floor, tiles
npm run test:coverage   # same, with a coverage report in web/coverage/ (git-ignored)
```

Vitest is configured in `vite.config.ts` (`test.include: tests/**/*.test.ts`). The GitHub Pages workflow runs
`npm test` before every deploy.

## Published site: Playwright

```sh
cd web
npx playwright install chromium   # once per machine
npm run e2e                        # builds, serves with `vite preview` on 127.0.0.1:4173, runs web/e2e/
PREVIEW_URL=https://<user>.github.io/jangada-orbital/ npm run e2e   # same tests against a deployed site
```

The tests open the calendar for Brazil, download the CSV and open the Method page. Every request to a host
other than the site itself is aborted, including the OpenFreeMap basemap, so the tests pass offline and prove
the calendar depends only on the static files in `web/public/data/`. Never point a test at NASA, a fake REST
API (`jsonplaceholder`, `httpbin`) or any other outside service: this project has no backend.

Playwright is not in the Pages workflow yet; adding it there means installing Chromium in CI (~150 MB per run).

## Reproducing the data from scratch

This is the acceptance test that matters most, and it has **not been run** on a second machine yet.

The commands exist (README, "Data pipeline": `jangada-download all` → `jangada-aggregate` → `jangada-regions` →
`jangada-harmonize` → `jangada-export-web`), and `jangada-export-web` writes `web/public/data/manifest.json`
with row counts and a SHA-256 for every published file. That manifest is what makes two machines comparable.

The from-scratch check:

1. fresh clone, `uv sync`, own `FIRMS_MAP_KEY` in `.env`;
2. ≥ 3.2 GB free disk for the yearly CSVs (see `docs/DATA.md`);
3. run the five commands; the area API part spends about 4,600 transactions, paced under 4,000 per 10 minutes
   (`docs/DATA.md`);
4. `uv run pytest`: all 27 tests pass, none skipped;
5. compare the new `manifest.json` with the committed one: same `rows` for every file. Same `sha256` is the
   stronger goal; it needs deterministic Parquet output (rows and columns sorted, no write timestamps) and has
   not been verified.

Two caveats before calling it reproduced: FIRMS near-real-time data for the current month keeps changing until
it is replaced by standard-processing data, so compare runs made on the same day or exclude the last month; and
until steps 1–5 have passed on a second machine, "the data reproduces" is a claim, not a result.
