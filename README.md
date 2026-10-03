# Practice / Creative

One block a day from the Are.na channel [`anith-vishwanath/practice-creative`](https://www.are.na/anith-vishwanath/practice-creative). Everyone sees the same block on a given date, and it changes at local midnight. There are no prompts, streaks, counters, accounts or sharing, and there is an archive of past days.

Plain HTML, CSS and JavaScript. No build step, no dependencies. The public Are.na v2 API is fetched from the browser, with no token.

## Run locally

```bash
python3 -m http.server 8765
```

Open `http://localhost:8765/`. Serving over HTTP is better than opening `index.html` directly.

## Files

| File | Purpose |
|---|---|
| `index.html` | Page shell: header, date heading, block slot, credit, archive container, image lightbox |
| `css/styles.css` | Design tokens, light and dark themes, layouts for each block type, reduced-motion rules |
| `js/app.js` | Data fetching and caching, daily pick, hash router, rendering, arrival animation |
| `.github/workflows/pages.yml` | Deploys to GitHub Pages on push to `main` |

## Routes

| Hash | Shows |
|---|---|
| `#/` | Today's block |
| `#/archive` | Every past day, newest first, grouped by month |
| `#/YYYY-MM-DD` | A past day. Future dates, dates before the start date, and today redirect to `#/` |

## How the daily pick works

```
dayIndex = whole local days since START_DATE ("2026-10-03")
block    = channel[dayIndex % channel.length]
```

- The channel is read in position order (oldest first), and Channel blocks are skipped.
- The date is the visitor's **local** date, so the block changes at each visitor's own midnight.
- Appending new blocks keeps past days stable. Removing or reordering blocks shifts them.
- Each browser pins today's block in `localStorage` (`pc:day:YYYY-MM-DD`), so a refresh mid-day can't change it. Pins older than 60 days are pruned.

## Loading and caching

- **First visit:** only today's block is fetched (two small requests), then the full channel is cached after the image has loaded.
- **Repeat visits:** the channel is read from `localStorage` (`pc:channel`). A cache older than 12 hours is shown immediately and refreshed in the background.
- If Are.na is unreachable and there is no cache, the page shows a one-line error with a link to the channel.

## Block types

Image (click to open full size), Text (short quote or long text), Link, Video, and PDF/attachment. Each has a credit line: author, type, a source link where relevant, and "Open block".

## Configuration

Edit the constants at the top of `js/app.js`:

- `CONFIG`: Are.na user, channel slug and channel URL
- `START_DATE`: day 0 of the daily sequence
- `CACHE_MAX_AGE`: how long the cached channel is considered fresh

## Deploy

Pushing to `main` deploys to GitHub Pages through `.github/workflows/pages.yml`. Any static host works, since the site is just the three files above.

## Design

The design handoff (tokens, type scale, spacing, screens, motion) is in `design_handoff_practice_creative_v2/README.md` (a local folder that isn't committed to this repo). The implementation departs from it in two places: the arrival fade is shorter than specified, and the block no longer waits for its image before fading in.
