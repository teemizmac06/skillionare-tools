'use strict';

const tg     = require('../lib/telegram');
const log    = require('../utils/logger');
const config = require('../config');

// Rate limit — 1 scan per minute per user
const _lastScan = new Map();

function isAllowed(userId) {
  const allowed = config.telegram.allowedUsers;
  if (!allowed.length) return true; // No allowlist = open to everyone
  return allowed.includes(String(userId));
}

function isRateLimited(userId) {
  const last = _lastScan.get(String(userId)) || 0;
  return Date.now() - last < 60000; // 60 second cooldown
}

function markUsed(userId) {
  _lastScan.set(String(userId), Date.now());
}

// Extract Twitch username from any format
function extractUsername(text) {
  if (!text) return null;
  const t = text.trim().toLowerCase().replace(/^@/, '');

  // Full twitch URL
  const urlMatch = t.match(/twitch\.tv\/([a-z0-9_]{3,25})/);
  if (urlMatch) return urlMatch[1];

  // Plain username
  if (/^[a-z0-9_]{3,25}$/.test(t)) return t;

  return null;
}

// Send all images one by one (most reliable on Telegram)
async function deliverImages(chatId, images) {
  let sent = 0;
  for (const img of images) {
    try {
      await tg.sendPhoto(chatId, img.buffer, img.name, img.caption);
      sent++;
      // Small delay between images to avoid flooding
      await new Promise(r => setTimeout(r, 800));
    } catch (err) {
      log.error('Image delivery failed', { name: img.name, error: err.message });
      // Continue with next image even if one fails
    }
  }
  return sent;
}

module.exports = { isAllowed, isRateLimited, markUsed, extractUsername, deliverImages };
