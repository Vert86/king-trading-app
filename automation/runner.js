/**
 * King Bot 24/7 runner.
 *
 * Keeps one saved bot (from the Dashboard's "Your bots" list) running
 * continuously in a real (headless) browser, restarting it whenever it
 * stops -- crash, disconnect, hit its own profit/loss circuit breaker, etc.
 *
 * Two modes, controlled by the HEADLESS env var:
 *   - Setup/login mode (HEADLESS=false, `npm run login`): opens a visible
 *     browser window against a persistent profile so you can log in by hand
 *     once. Exits automatically once it detects you're logged in.
 *   - Run mode (default, `npm start`): reuses that same persistent profile
 *     headlessly -- no login needed as long as the session cookie/localStorage
 *     is still valid -- opens the configured bot and keeps it running.
 *
 * Config via env vars (see .env.example):
 *   APP_URL            e.g. https://king-trading-app.vercel.app
 *   BOT_NAME           exact "Bot name" text as shown on the Dashboard
 *   USER_DATA_DIR      persistent Chrome profile directory (default: ./chrome-profile)
 *   CHECK_INTERVAL_MS  how often to check the bot is still running (default: 30000)
 *   HEADLESS           "false" for the one-time login run, otherwise headless
 */

const path = require('path');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');

puppeteer.use(StealthPlugin());

const APP_URL = (process.env.APP_URL || 'https://king-trading-app.vercel.app').replace(/\/$/, '');
const BOT_NAME = process.env.BOT_NAME || 'RDA Digits Differs';
const USER_DATA_DIR = process.env.USER_DATA_DIR || path.join(__dirname, 'chrome-profile');
const CHECK_INTERVAL_MS = Number(process.env.CHECK_INTERVAL_MS || 30000);
const HEADLESS = process.env.HEADLESS !== 'false';

function log(...args) {
  console.log(`[${new Date().toISOString()}]`, ...args);
}

async function isLoggedIn(page) {
  // The header shows "Demo account"/"Real account" plus a balance once
  // authenticated; logged-out shows "Log in"/"Sign up" instead.
  return page.evaluate(() => {
    const text = document.body.innerText || '';
    return /Demo account|Real account/.test(text) && !/Log in/.test(text);
  });
}

async function waitForManualLogin(page, timeoutMs = 10 * 60 * 1000) {
  log('Waiting for you to log in inside the opened browser window...');
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await isLoggedIn(page)) {
      log('Login detected. You can close this window; the session is saved.');
      return true;
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  return false;
}

async function openBotFromDashboard(page, botName) {
  await page.goto(`${APP_URL}/#dashboard`, { waitUntil: 'networkidle2' });
  await page.waitForFunction(
    (name) => Array.from(document.querySelectorAll('*')).some((el) => el.textContent?.trim() === name),
    { timeout: 30000 },
    botName
  );

  // Find the row whose first cell matches botName, click its "open" icon
  // (first of the three action icons in that row).
  const clicked = await page.evaluate((name) => {
    const cells = Array.from(document.querySelectorAll('td, div')).filter(
      (el) => el.children.length === 0 && el.textContent?.trim() === name
    );
    for (const cell of cells) {
      const row = cell.closest('tr') || cell.closest('[class*="row"]');
      if (!row) continue;
      const icons = row.querySelectorAll('svg, img, button');
      if (icons.length > 0) {
        icons[0].dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        return true;
      }
    }
    return false;
  }, botName);

  if (!clicked) {
    throw new Error(
      `Could not find a bot named "${botName}" on the Dashboard. Check BOT_NAME matches exactly.`
    );
  }

  await page.waitForFunction(() => location.hash.includes('bot_builder'), { timeout: 30000 });
  // Let the Blockly workspace finish rendering.
  await new Promise((r) => setTimeout(r, 3000));
}

async function clickRun(page) {
  await page.evaluate(() => {
    document.getElementById('db-animation__run-button')?.click();
  });
}

async function isBotRunning(page) {
  return page.evaluate(() => {
    const text = document.body.innerText || '';
    return !/Bot is not running/.test(text);
  });
}

async function monitorLoop(page) {
  log(`Monitoring "${BOT_NAME}" every ${CHECK_INTERVAL_MS}ms. Ctrl+C to stop.`);
  // eslint-disable-next-line no-constant-condition
  while (true) {
    await new Promise((r) => setTimeout(r, CHECK_INTERVAL_MS));
    try {
      const stillLoggedIn = await isLoggedIn(page);
      if (!stillLoggedIn) {
        log('Session appears logged out. Reloading and re-opening the bot...');
        await openBotFromDashboard(page, BOT_NAME);
        await clickRun(page);
        continue;
      }

      const running = await isBotRunning(page);
      if (!running) {
        log('Bot is not running (stopped/crashed/hit a threshold). Restarting it...');
        await clickRun(page);
        await new Promise((r) => setTimeout(r, 2000));
        const confirmedRunning = await isBotRunning(page);
        log(confirmedRunning ? 'Restarted successfully.' : 'Restart click did not take effect, will retry next cycle.');
      } else {
        log('OK - bot is running.');
      }
    } catch (err) {
      log('Error during health check, will retry next cycle:', err.message);
      try {
        await openBotFromDashboard(page, BOT_NAME);
        await clickRun(page);
      } catch (recoveryErr) {
        log('Recovery attempt also failed:', recoveryErr.message);
      }
    }
  }
}

async function main() {
  log(`Starting in ${HEADLESS ? 'HEADLESS (run)' : 'HEADED (login)'} mode.`);
  log(`Profile dir: ${USER_DATA_DIR}`);

  const browser = await puppeteer.launch({
    headless: HEADLESS,
    userDataDir: USER_DATA_DIR,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--window-size=1366,900',
    ],
    defaultViewport: { width: 1366, height: 900 },
  });

  const [page] = await browser.pages();

  if (!HEADLESS) {
    await page.goto(`${APP_URL}/#dashboard`, { waitUntil: 'networkidle2' });
    const loggedIn = await waitForManualLogin(page);
    await browser.close();
    process.exit(loggedIn ? 0 : 1);
  }

  await page.goto(`${APP_URL}/#dashboard`, { waitUntil: 'networkidle2' });
  if (!(await isLoggedIn(page))) {
    log('ERROR: not logged in and running headless. Run `npm run login` first to establish a session.');
    await browser.close();
    process.exit(1);
  }

  await openBotFromDashboard(page, BOT_NAME);
  await clickRun(page);
  log(`"${BOT_NAME}" started.`);

  await monitorLoop(page);
}

process.on('SIGINT', () => {
  log('Shutting down (SIGINT).');
  process.exit(0);
});
process.on('SIGTERM', () => {
  log('Shutting down (SIGTERM).');
  process.exit(0);
});

main().catch((err) => {
  log('Fatal error:', err);
  process.exit(1);
});
