# Running King Bot 24/7 on a VPS

This keeps one saved bot (e.g. "RDA Digits Differs") running continuously by
driving a real headless Chrome against the deployed app, restarting it
whenever it stops. See the main repo README's "How is this hosted"
discussion for why this needs a VPS and not just the Vercel deployment
itself — Vercel serves the static frontend only; the bot's execution
requires a live, continuously-connected browser tab, which is what this
script provides.

## Cost

- **Free option**: Oracle Cloud "Always Free" tier — a 2 OCPU / 12 GB ARM VM,
  free forever if you can get one provisioned (signup can be finicky —
  capacity/verification issues are common, but worth trying first).
- **Cheap reliable option**: Hetzner CX22 — 2 vCPU / 4 GB RAM / 40 GB NVMe,
  ~€4.50/month (~$5/month). Comfortably runs one headless Chrome instance.
- Bandwidth is a non-issue either way — this is a low-volume WebSocket tick
  stream, nowhere near any provider's included transfer allowance.

**Validate before committing to a year of hosting.** Fintech sites often run
bot protection (Cloudflare or similar) that scores datacenter IPs poorly and
fingerprints headless browsers. This script uses `puppeteer-extra-plugin-stealth`
to reduce that risk, but it isn't guaranteed. Spin up a single month (or the
free Oracle tier) first, confirm login and a full day of uninterrupted
running work, *then* decide on a longer commitment.

## One-time VPS setup

```bash
# Ubuntu/Debian. Adjust for your distro.
sudo apt update
sudo apt install -y nodejs npm

# Chrome's runtime dependencies (Puppeteer downloads its own Chromium build,
# but still needs these system libraries present).
sudo apt install -y ca-certificates fonts-liberation libasound2 libatk-bridge2.0-0 \
  libatk1.0-0 libc6 libcairo2 libcups2 libdbus-1-3 libexpat1 libfontconfig1 \
  libgbm1 libgcc1 libglib2.0-0 libgtk-3-0 libnspr4 libnss3 libpango-1.0-0 \
  libpangocairo-1.0-0 libstdc++6 libx11-6 libx11-xcb1 libxcb1 libxcomposite1 \
  libxcursor1 libxdamage1 libxext6 libxfixes3 libxi6 libxrandr2 libxrender1 \
  libxss1 libxtst6 lsb-release xdg-utils

npm install -g pm2
```

Copy this `automation/` folder to the VPS (`scp -r automation/ user@your-vps:~/king-bot-runner`),
then on the VPS:

```bash
cd ~/king-bot-runner
npm install
```

## Step 1 — one-time login

Puppeteer needs an authenticated session before it can run headless. This
requires a visible browser, so you need a display — either:

- **A desktop/VPS with a GUI** (simplest): run `npm run login`, a Chrome
  window opens, log in normally, then close it once the script prints
  "Login detected."
- **A headless VPS with no GUI**: install a virtual display and a way to see
  it, e.g. Xvfb + noVNC/x11vnc, then run `xvfb-run -- npm run login` and
  connect via VNC to complete the login. (This is the more common real-world
  case for a cheap VPS — happy to write the Xvfb/noVNC setup script too if
  you go this route.)

The session is saved to `automation/chrome-profile/` (a real Chrome profile
directory — cookies, localStorage, everything). **Never commit this folder or
copy it anywhere untrusted** — it's equivalent to being logged into the
account. It's already excluded via `.gitignore`.

## Step 2 — run it

```bash
# Quick foreground test first:
npm start
# Ctrl+C once you've confirmed it opens the bot and says "OK - bot is running."

# Then run it under pm2 so it survives crashes and (optionally) reboots:
pm2 start ecosystem.config.js
pm2 save
pm2 startup   # follow the printed instructions to enable start-on-boot
```

Useful pm2 commands:

```bash
pm2 logs king-bot-runner    # tail live logs
pm2 restart king-bot-runner # manual restart
pm2 stop king-bot-runner    # stop
```

## How the bot gets loaded

Deriv Bot Builder saves bots to the *browser's* local storage, not to your
account server-side. That means a fresh Chrome profile (like the one this
script drives) never has anything under "Recent" on the Dashboard, even once
logged in — there's nothing there to click into. So instead of hunting for a
saved-bot row, the runner imports the strategy fresh every time it starts,
the same way a human would: Dashboard → "My computer" → pick the exported
`.xml` file. That's what `BOT_XML_PATH` points at (see below).

This folder ships a `bots/` subdirectory with a copy of each strategy's XML
(`bots/RDA Digits Differs.xml`, `bots/RDA Rise Fall.xml`). **These are copies**
of the source of truth in the repo's top-level `trading-bots/` folder — after
editing a bot's ladder or parameters there, re-copy the updated file into
`automation/bots/` (and re-deploy it to the VPS) before restarting the runner,
or it'll keep trading the old configuration.

## Configuration

Set these as environment variables (edit `ecosystem.config.js`, or export
them before `npm start` for a quick test):

| Variable | Default | Meaning |
|---|---|---|
| `APP_URL` | `https://king-trading-app.vercel.app` | The deployed app |
| `BOT_NAME` | `RDA Digits Differs` | Display name only, used in log messages |
| `BOT_XML_PATH` | `./bots/RDA Digits Differs.xml` | Which exported bot XML to import on startup/restart |
| `CHECK_INTERVAL_MS` | `30000` | How often to check the bot is still running and restart it if not |
| `USER_DATA_DIR` | `./chrome-profile` | Where the persistent login session is stored |

To run a second bot (e.g. RDA Rise Fall) at the same time, copy the
`automation/` folder to a second directory with its own `chrome-profile`
and a different `BOT_NAME`/`BOT_XML_PATH`/pm2 process name — each needs its
own browser instance and login session.

## What this does and doesn't solve

- **Does**: keeps the bot's browser tab alive and running continuously,
  auto-restarting on crashes, disconnects, or the bot hitting its own
  profit/loss circuit breaker and stopping.
- **Doesn't**: change the underlying trading math. If the strategy has a
  negative expected value (see the main README's "Does this bot make
  money?" section), running it continuously just means it grinds through
  that edge faster in wall-clock time, not that it becomes profitable.
