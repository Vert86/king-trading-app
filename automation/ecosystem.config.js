// PM2 process manager config. Keeps runner.js alive: restarts it if it
// crashes, and can start it automatically on VPS reboot (see SETUP.md).
module.exports = {
  apps: [
    {
      name: 'king-bot-runner',
      script: 'runner.js',
      cwd: __dirname,
      autorestart: true,
      restart_delay: 5000,
      max_restarts: 50,
      env: {
        HEADLESS: 'true',
        APP_URL: 'https://king-trading-app.vercel.app',
        BOT_NAME: 'RDA Digits Differs',
        // BOT_XML_PATH left unset: runner.js defaults to
        // <automation dir>/bots/RDA Digits Differs.xml
        CHECK_INTERVAL_MS: '30000',
      },
    },
  ],
};
