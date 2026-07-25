'use strict';

/**
 * ═══════════════════════════════════════════════════════
 *  WHERE TO ADD YOUR TELEGRAM TOKEN AND OTHER SECRETS
 * ═══════════════════════════════════════════════════════
 *
 *  DO NOT paste your token here in this file.
 *  Instead, add it on Vercel:
 *
 *  1. Go to vercel.com → your project
 *  2. Click Settings → Environment Variables
 *  3. Add these one by one:
 *
 *     TELEGRAM_BOT_TOKEN      = (paste your token from BotFather)
 *     TELEGRAM_WEBHOOK_SECRET = (make up any password, e.g. mySecret2024)
 *     TELEGRAM_ALLOWED_USERS  = (your Telegram user ID number)
 *     APP_URL                 = (your Vercel URL, e.g. https://twitch-skillionaire-tools.vercel.app)
 *     TWITCH_CLIENT_ID        = wck0uw2mywx841acjavyzpcay6yupg
 *     TWITCH_CLIENT_SECRET    = nodd91qd27x5njgk6fq4kh8w6osqhy
 *
 *  4. Click Save after each one
 *  5. Then go to Deployments → click the 3 dots → Redeploy
 *
 * ═══════════════════════════════════════════════════════
 */

function need(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing environment variable: ${name}\nAdd it in Vercel → Settings → Environment Variables`);
  return v;
}

function opt(name, fallback) {
  return process.env[name] || fallback || '';
}

module.exports = {

  // ── Telegram ────────────────────────────────
  telegram: {
    token:         need('TELEGRAM_BOT_TOKEN'),
    webhookSecret: need('TELEGRAM_WEBHOOK_SECRET'),
    // Your personal Telegram user ID — only you can use the bot
    // Get it from @userinfobot on Telegram
    allowedUsers:  opt('TELEGRAM_ALLOWED_USERS')
                     .split(',')
                     .map(s => s.trim())
                     .filter(Boolean),
    apiBase: 'https://api.telegram.org',
  },

  // ── Twitch API ──────────────────────────────
  twitch: {
    clientId:     need('TWITCH_CLIENT_ID'),
    clientSecret: need('TWITCH_CLIENT_SECRET'),
  },

  // ── Your deployed Vercel URL ────────────────
  // e.g. https://twitch-skillionaire-tools.vercel.app
  app: {
    url: need('APP_URL'),
  },

  // ── Image generation settings ───────────────
  images: {
    width:         1440,
    height:        900,
    renderTimeout: 15000,
    tempDir:       '/tmp/audit-images',
  },

  // ── Logging ─────────────────────────────────
  log: {
    level: opt('LOG_LEVEL', 'info'),
  },
};
