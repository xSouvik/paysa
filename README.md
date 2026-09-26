# Paysa: Pay & Pension

*Pay + paisa.* A salary and retirement calculator for Indian central government and railway employees, with an Apple-style liquid glass design.

- **Salary**: take-home pay, DA, HRA, TA, NPS/UPS/GPF, CGEGIS, CGHS, new-regime tax, DA arrears, 8th CPC what-if
- **Career**: pay projection to retirement, increments, MACP with pay fixation
- **Retire**: NPS vs UPS vs OPS pension, gratuity, leave encashment, commutation
- **News**: automatic headlines for central employees and pensioners (official PIB releases and media reports)
- **Rates**: DA history, the full 7th CPC pay matrix, HRA/TA tables, sources
- **More than one person**: work out anyone's pay (spouse, parent, colleague…) from the name pill at the top

## Privacy

- Everything you type (names, dates, pay) is stored **only on your device** (`localStorage`). No accounts, no analytics, no cookies, no ads, no trackers.
- The app downloads just two public files, `data/rates.json` and `data/news.json`, from its own site. Those downloads are the same for everyone and carry no personal data.
- A Content-Security-Policy stops the app from contacting any other server. Fonts are bundled, so there are no Google Fonts calls.
- Opening a news story takes you to that publisher's website (links open with `noreferrer`).

## How updates reach every phone

```
                ┌──────────── GitHub (free) ─────────────┐
 PIB, news  ──► │ news robot (every 6 h) ──► news.json   │
 sites          │        │                               │──► GitHub Pages ──► every phone
                │        └─► official DA release? ──► PR │     (app checks on open,
 You (1 tap) ──►│ Merge PR ──► rates.json ──► tests ─────│      keeps last good copy offline)
                └────────────────────────────────────────┘
```

- **News is fully automatic.** `.github/workflows/news.yml` runs `scripts/fetch-news.mjs` four times a day and publishes the result.
- **Rates need your approval.** When an official PIB release announces a new DA (for example "w.e.f. 01.07.2026"), the robot opens a pull request titled *"Approve DA 62% from 1 July 2026?"*. GitHub notifies you. You check the link and tap **Merge**, and every phone has the new rate within minutes. Headlines alone never change rates.
- **Safety net:** `js/validate.js` checks every data file in GitHub (so a bad file is never published) and again in the app (so a bad download is ignored and the last good copy is kept).

### Changing other rates yourself (HRA, TA, tax slabs, 8th CPC…)

1. On GitHub, open `data/rates.json` → ✏️ Edit.
2. Change the value. **Add 1 to `"version"`** and set `"updated"` to today's date.
3. Commit. The tests run automatically. If they pass, the change is live on every phone within a few minutes. If they fail, nothing is published and GitHub emails you what's wrong.

## Run locally

```bash
node serve.mjs          # http://localhost:5178
node --test tests/*.test.mjs
node scripts/fetch-news.mjs --dry   # preview what the news robot would collect
```

## Files

```
index.html, css/, js/, assets/   the app (no build step, no dependencies)
js/engine.js                     calculation engine (all rates come from data/rates.json)
js/validate.js                   shared checks for the data files
data/rates.json, data/news.json  live data pushed to every device
scripts/                         news robot, DA proposal, data check
.github/workflows/               news (every 6 h), deploy (GitHub Pages), check (pull requests)
tests/                           node:test suite
```

Fonts: [Geist](https://vercel.com/font) and [Instrument Serif](https://fonts.google.com/specimen/Instrument+Serif), SIL Open Font License (see `assets/fonts/`).

*Paysa is an independent calculator, not an official Government app. Figures are estimates; always check with your office.*
