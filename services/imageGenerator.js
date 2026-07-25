'use strict';

const chromium  = require('@sparticuz/chromium');
const puppeteer = require('puppeteer-core');
const path      = require('path');
const fs        = require('fs');
const log       = require('../utils/logger');
const config    = require('../config');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

async function launchBrowser() {
  return puppeteer.launch({
    args:            chromium.args,
    defaultViewport: { width: config.images.width, height: config.images.height },
    executablePath:  await chromium.executablePath(),
    headless:        chromium.headless,
  });
}

/**
 * Generate proof images by loading the Twitch Audit Pro page,
 * injecting channel data, and capturing each canvas.
 *
 * Returns: [{ name, buffer, caption }]
 */
async function generateImages(data, score, theme = 'light') {
  ensureDir(config.images.tempDir);

  const username = data.user.login;
  log.info('Starting image generation', { username, theme });

  const browser = await launchBrowser();
  const results = [];

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: config.images.width, height: config.images.height });

    // Load the Twitch Audit Pro page
    const url = `${config.app.url}/twitch-audit-pro.html`;
    await page.goto(url, { waitUntil: 'networkidle0', timeout: 45000 });

    // Pre-compute derived data
    const gapF  = (100 - score.overall) / 100;
    const discF = (100 - Math.min(100, score.tagCount * 10)) / 100;

    // Inject all data the page needs
    await page.evaluate((d, s, t, gf, df) => {
      window._lastD   = d;
      window._lastS   = s;
      window._hdTheme = t;

      // Growth lost data
      const fl = s.followers;
      window._glData = {
        missedF: Math.round(fl * gf * 0.10 + df * 140 + (!s.hasBanner ? 42 : 0) + (!s.hasBio ? 28 : 0)),
        missedV: Math.round(fl * gf * 0.10 * 1.9),
        missedS: Math.round(fl * gf * 0.10 * (s.isPartner ? .07 : s.isAff ? .04 : .01)),
        revLow:  s.revLow  || 0,
        revHigh: s.revHigh || 0,
      };

      // Current vs potential
      const curMo = Math.max(1, Math.floor(fl * 0.005));
      const potMo = Math.max(curMo + 2, Math.floor(curMo * 1.42));
      window._cvpData = {
        cur30: curMo, pot30: potMo,
        cur90: curMo * 3, pot90: potMo * 3,
        gap:   potMo * 3 - curMo * 3, fl,
      };

      window._iq    = s.iq    || 0;
      window._viral = s.viral || 0;

      window._strData = [
        s.hasAvatar && 'Custom profile logo — strong brand recognition',
        s.hasBanner && 'Offline banner configured — professional first impression',
        s.hasBio    && 'Channel bio written — helps convert visitors to followers',
        s.tagCount >= 6 && (s.tagCount + '/10 tags active — solid discoverability'),
        s.hasSocial && 'Social links panel present — cross-platform reach',
        s.clipCnt >= 5 && (s.clipCnt + ' clips — good discovery signal'),
        (s.isPartner || s.isAff) && (s.isPartner ? '⭐ Twitch Partner' : '🎗 Twitch Affiliate'),
        s.streamFreq >= 3 && (s.streamFreq + '/wk streams — consistent schedule'),
      ].filter(Boolean);

      window._wknData = [
        !s.hasBanner  && 'No offline banner — visitors leave when you\'re offline',
        !s.hasBio     && 'No channel bio — new viewers have no context',
        s.tagCount < 6 && ('Only ' + s.tagCount + '/10 tags — low search visibility'),
        !s.hasSocial  && 'No social links panel — missing cross-platform growth',
        s.streamFreq < 3 && ('Only ' + s.streamFreq + '/wk — inconsistent schedule'),
        s.clipCnt < 5  && ('Only ' + s.clipCnt + ' clips — no viral reach'),
        s.panelCnt < 3 && ('Only ' + s.panelCnt + ' panels — channel looks incomplete'),
      ].filter(Boolean);

    }, data, score, theme, gapF, discF);

    // Wait for page scripts to initialise
    await page.waitForTimeout(1000);

    // Intercept the canvas downloads — capture them as buffers instead
    await page.evaluate((t) => {
      window._captured = {};
      // Override the download helper used inside downloadHDCard
      window._origDlCanvas = undefined;

      // Patch: we re-define dlCanvas / the inner function to capture instead
      window.__captureMode = true;
      window.__captures    = {};
    }, theme);

    // Now call the download function — it will generate all 9 canvases
    // We capture each toDataURL call
    await page.evaluate((t) => {
      // Override canvas toDataURL so we intercept results
      const origToDataURL = HTMLCanvasElement.prototype.toDataURL;
      let captureIdx = 0;
      HTMLCanvasElement.prototype.toDataURL = function(type) {
        const result = origToDataURL.call(this, type);
        window.__captures[captureIdx++] = result.split(',')[1]; // base64 only
        return result;
      };
      // Trigger generation (async — runs in background)
      if (typeof downloadHDCard === 'function') {
        downloadHDCard(t).catch(e => console.error('HD gen error:', e));
      }
    }, theme);

    // Wait for all 9 images to generate
    await page.waitForTimeout(config.images.renderTimeout);

    // Collect captured images
    const captured = await page.evaluate(() => window.__captures || {});

    const imageNames = [
      { key: 0, name: `01-${username}-health-score`,        caption: '📊 Health Score & Performance' },
      { key: 1, name: `02-${username}-growth-vs-potential`, caption: '📈 Current Growth vs What It Should Be' },
      { key: 2, name: `03-${username}-growth-lost`,         caption: '💸 Estimated Growth Lost' },
      { key: 3, name: `04-${username}-first-impression`,    caption: '👁 First Impression & Creator IQ' },
      { key: 4, name: `05-${username}-funnel-partner`,      caption: '🎯 Funnel & Partner Readiness' },
      { key: 5, name: `06-${username}-brand-discovery`,     caption: '🎨 Brand & Discoverability' },
      { key: 6, name: `07-${username}-prediction-revenue`,  caption: '🚀 AI Prediction & Revenue' },
      { key: 7, name: `08-${username}-scorecard`,           caption: '✅ Strengths & Scorecard' },
      { key: 8, name: `09-${username}-full-summary`,        caption: '📋 Full Channel Summary' },
    ];

    for (const img of imageNames) {
      const b64 = captured[img.key];
      if (!b64) {
        log.warn('Canvas not captured', { key: img.key, name: img.name });
        continue;
      }
      const buffer   = Buffer.from(b64, 'base64');
      const filepath = path.join(config.images.tempDir, img.name + '.png');
      fs.writeFileSync(filepath, buffer);
      results.push({ name: img.name + '.png', buffer, caption: img.caption, filepath });
      log.info('Image captured', { name: img.name });
    }

  } catch (err) {
    log.error('Image generation failed', { username, error: err.message });
    throw err;
  } finally {
    await browser.close();
  }

  log.info('Image generation complete', { username, count: results.length });
  return results;
}

// Clean up old temp files (call after delivery)
function cleanup() {
  try {
    const dir = config.images.tempDir;
    if (!fs.existsSync(dir)) return;
    const now = Date.now();
    fs.readdirSync(dir).forEach(f => {
      const fp = path.join(dir, f);
      if (now - fs.statSync(fp).mtimeMs > 3600000) fs.unlinkSync(fp);
    });
  } catch (e) { /* silent */ }
}

module.exports = { generateImages, cleanup };
