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
        BOT_NAME: 'RDA Digits Differs (Flat)',
        // Flat stake, no martingale-style escalation. Analysis showed any
        // escalation ladder roughly doubles the average money wagered per
        // trade (and therefore the loss rate) versus flat betting, for no
        // offsetting benefit -- see automation/bots/RDA Digits Differs.xml
        // for the original escalating-ladder version.
        BOT_XML_PATH: './bots/RDA Digits Differs - Flat.xml',
        CHECK_INTERVAL_MS: '30000',
      },
    },
  ],
};
