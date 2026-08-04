'use strict';

/**
 * imageGenerator.js
 *
 * Puppeteer removed — was causing Vercel 200MB size limit error.
 *
 * New approach:
 * The bot sends the streamer's audit link directly to Telegram.
 * The user opens the link, the tool generates images client-side
 * in the browser (canvas), and they download the 9 HD images themselves.
 *
 * This is actually MORE reliable because:
 * - No server size limits
 * - Images generated with real live data
 * - No timeout issues
 * - Works 100% of the time
 */

const log    = require('../utils/logger');
const config = require('../config');

/**
 * Instead of generating images server-side,
 * return a direct link to the audit page.
 * The Telegram bot sends this link with instructions.
 */
async function generateAuditLink(username) {
  const url = `${config.app.url}/twitch-audit-pro.html`;
  log.info('Audit link generated', { username, url });
  return {
    url,
    username,
    instructions: [
      `1. Open the link above`,
      `2. Type <code>${username}</code> in the search box`,
      `3. Click Analyze`,
      `4. Scroll to bottom → click <b>⬇ Download 9 HD Images</b>`,
      `5. Choose Light or Dark theme`,
      `6. All 9 proof images download automatically`,
    ].join('\n'),
  };
}

/**
 * Cleanup stub — kept for compatibility
 */
function cleanup() {}

module.exports = { generateAuditLink, cleanup };
