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
 * Deriv Bot Builder saves bots to the *browser's* local storage, not to the
 * account server-side -- so a fresh Chrome profile (like the one this script
 * uses) has no "recent bots" on the Dashboard to pick from, even once logged
 * in. Instead, every run loads the bot the same way a human would via
 * Dashboard -> "My computer": by importing the strategy's exported XML file
 * straight off disk (see BOT_XML_PATH below). Loading it fresh each run also
 * means edits to that XML take effect on the next restart with no other
 * setup step.
 *
 * Config via env vars (see .env.example):
 *   APP_URL            e.g. https://king-trading-app.vercel.app
 *   BOT_NAME           display name only, used in log messages
 *   BOT_XML_PATH       path to the exported bot XML to import (default: ./bots/RDA Digits Differs.xml)
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
const BOT_XML_PATH = process.env.BOT_XML_PATH || path.join(__dirname, 'bots', 'RDA Digits Differs.xml');
const USER_DATA_DIR = process.env.USER_DATA_DIR || path.join(__dirname, 'chrome-profile');
const CHECK_INTERVAL_MS = Number(process.env.CHECK_INTERVAL_MS || 30000);
const HEADLESS = process.env.HEADLESS !== 'false';

function log(...args) {
  console.log(`[${new Date().toISOString()}]`, ...args);
}

async function isLoggedIn(page) {
  // The header shows "Demo account"/"Real account" plus a balance once
  // authenticated; logged-out shows "Log in"/"Sign up" instead.
  //
  // This is a best-effort polling check run every couple seconds while the
  // page may be mid-navigation (OAuth redirect hops, reloads, etc.) -- body
  // can be null, the execution context can be torn down mid-evaluate, the
  // target can momentarily not exist. None of that means "logged out", it
  // means "ask again in a moment", so any failure here is swallowed and
  // treated as "not confirmed yet" rather than allowed to crash the process.
  try {
    return await page.evaluate(() => {
      const text = document.body ? document.body.innerText || '' : '';
      return /Demo account|Real account/.test(text) && !/Log in/.test(text);
    });
  } catch (err) {
    return false;
  }
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

async function loadBotFromFile(page, xmlPath) {
  await page.goto(`${APP_URL}/#dashboard`, { waitUntil: 'networkidle2' });

  // "My computer" is one of three tiles under "Load or build your bot"
  // (My computer / Bot Builder / Quick strategy). Clicking it reveals a
  // hidden <input type="file"> that Deriv's own import flow uses.
  await page.waitForFunction(
    () => Array.from(document.querySelectorAll('.tab__dashboard__table__block')).some(
      (el) => el.textContent?.trim() === 'My computer'
    ),
    { timeout: 30000 }
  );
  const blocks = await page.$$('.tab__dashboard__table__block');
  let myComputerTile = null;
  for (const block of blocks) {
    const text = await page.evaluate((el) => el.textContent.trim(), block);
    if (text === 'My computer') {
      myComputerTile = block;
      break;
    }
  }
  if (!myComputerTile) {
    throw new Error('Could not find the "My computer" import tile on the Dashboard.');
  }
  await myComputerTile.click();

  const fileInput = await page.waitForSelector('input[type=file]', { timeout: 10000 });
  await fileInput.uploadFile(xmlPath);

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
  try {
    return await page.evaluate(() => {
      const text = document.body ? document.body.innerText || '' : '';
      return !/Bot is not running/.test(text);
    });
  } catch (err) {
    // Mid-navigation/transient -- let the caller's own error handling and
    // retry-next-cycle logic decide what to do, don't assume stopped.
    throw err;
  }
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
        await loadBotFromFile(page, BOT_XML_PATH);
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
        await loadBotFromFile(page, BOT_XML_PATH);
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

  // React hydration / the auth check can still be settling right after
  // networkidle2 resolves, so a single immediate check can read a
  // logged-out-looking DOM even though the session is valid. Poll briefly
  // before giving up.
  let loggedIn = false;
  for (let i = 0; i < 8; i += 1) {
    loggedIn = await isLoggedIn(page);
    if (loggedIn) break;
    await new Promise((r) => setTimeout(r, 1500));
  }
  if (!loggedIn) {
    log('ERROR: not logged in and running headless. Run `npm run login` first to establish a session.');
    await browser.close();
    process.exit(1);
  }

  await loadBotFromFile(page, BOT_XML_PATH);
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
