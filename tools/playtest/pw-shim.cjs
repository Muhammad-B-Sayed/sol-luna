// Lets tools/check-dodge-browser.cjs run on a machine whose Playwright has no matching browser
// download: it launches /usr/bin/chromium (or $CHROME) instead. Pass it as PLAYWRIGHT:
//   PLAYWRIGHT=$PWD/tools/playtest/pw-shim.cjs PW_REAL=/path/to/node_modules/playwright node tools/check-dodge-browser.cjs 3459 out local
const real = require(process.env.PW_REAL || 'playwright');
module.exports = {
  ...real,
  chromium: {
    launch: (o = {}) => { const { channel, ...rest } = o; return real.chromium.launch({ ...rest, executablePath: process.env.CHROME || '/usr/bin/chromium' }); },
  },
};
