# Pact

**A promise from you, to you.**

Pact lets your calm self set the rules that protect you on your worst day, and steps in before the damage is done.
Built at GreatUniHack 2026 for the NatWest challenge: *AI-Powered Financial Inclusion & Resilience*.

The full project plan (features, ethics, architecture, demo script) is in [PROJECT.md](PROJECT.md).

## Run the website

Open `website/index.html` in Chrome or Safari (double-click it in Finder). No install needed.
Open it in a browser, not an editor preview, or the CSS and JS files won't load.

## Who owns what

Only edit your own files. If you need a change in someone else's file, ask them.

| Person | Job | Files |
|---|---|---|
| 1 | Dashboard, design, joining features together | `website/index.html`, `website/css/style.css`, `website/js/core.js`, `website/js/app.js`, `website/js/plan.js` |
| 2 | Bank statement upload: needs vs wants, baseline, impulse flags | `website/js/statement.js`, the statement CSVs |
| 3 | Rules engine and hold screen | `website/js/rules.js`, `website/js/hold.js` |
| 4 | AI: "Make your pact" (words → rules), server for OpenAI | `website/js/setup.js`, `server/` |
| 5 | Streak, trusted person view, then the pitch | `website/js/streak.js`, `website/trusted.html` |
| Data | Python anomaly detection | `scripts/anomaly_detection.py`, `requirements.txt` |

Shared data formats (transactions and rules) are at the top of `statement.js` and `rules.js`.
Scripts load in order: `core.js` first, `app.js` last. Your file goes in between (already wired up in `index.html`).

## Team rules

1. `git pull` before you start, and again before you push.
2. Only edit your own files.
3. Push every 30–60 minutes.
4. **Never commit API keys.** This repo is public. Keys go in a `.env` file, which git ignores.
5. Hour 12: everything joined up once. Hour 18: no new features. Hour 21: rehearse together.
