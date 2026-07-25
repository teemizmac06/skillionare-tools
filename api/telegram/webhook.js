'use strict';

const tg       = require('../../lib/telegram');
const svc      = require('../../services/telegram');
const analyzer = require('../../services/analyzer');
const imgGen   = require('../../services/imageGenerator');
const log      = require('../../utils/logger');
const config   = require('../../config');

// Simple in-memory history per user
const history = new Map();

module.exports = async function handler(req, res) {
  // Must be POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Verify Telegram secret header
  const incoming = req.headers['x-telegram-bot-api-secret-token'];
  if (incoming !== config.telegram.webhookSecret) {
    log.warn('Rejected request — wrong secret');
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // Always return 200 immediately — Telegram needs this fast
  res.status(200).json({ ok: true });

  // Handle the update asynchronously
  try {
    await handleUpdate(req.body);
  } catch (err) {
    log.error('Unhandled update error', { error: err.message });
  }
};

async function handleUpdate(update) {
  const msg = update?.message || update?.edited_message;
  if (!msg) return;

  const chatId = msg.chat.id;
  const userId = msg.from?.id;
  const text   = (msg.text || '').trim();

  log.info('Message in', { chatId, userId, text: text.slice(0, 80) });

  // ── Access control ───────────────────────────
  if (!svc.isAllowed(userId)) {
    await tg.sendMessage(chatId, '⛔ This bot is private. Contact the owner for access.');
    return;
  }

  // ── /start ───────────────────────────────────
  if (text === '/start' || text.startsWith('/start ')) {
    await tg.sendMessage(chatId, [
      '👋 <b>Welcome to Skillonaire AI Bot!</b>',
      '',
      'Send me any Twitch channel link and I\'ll generate a full professional audit report with 9 HD proof images.',
      '',
      '<b>Just send a URL like this:</b>',
      '<code>https://twitch.tv/username</code>',
      '',
      'Or just a username:',
      '<code>username</code>',
      '',
      'Type /help to see all commands.',
    ].join('\n'));
    return;
  }

  // ── /help ────────────────────────────────────
  if (text === '/help' || text.startsWith('/help ')) {
    await tg.sendMessage(chatId, [
      '<b>Skillonaire AI Bot — Commands</b>',
      '',
      '/start — Welcome message',
      '/help — Show this message',
      '/review username — Analyze a channel',
      '/status — Check bot is running',
      '/history — Your recent scans',
      '',
      '<b>Quick scan (no command needed):</b>',
      'Just paste a Twitch URL or username.',
      '',
      '<b>Examples:</b>',
      '<code>https://twitch.tv/draconian920</code>',
      '<code>draconian920</code>',
      '<code>/review draconian920</code>',
    ].join('\n'));
    return;
  }

  // ── /status ──────────────────────────────────
  if (text === '/status' || text.startsWith('/status ')) {
    await tg.sendMessage(chatId, '✅ Bot is online and ready.\n\nSend a Twitch URL or username to generate a report.');
    return;
  }

  // ── /history ─────────────────────────────────
  if (text === '/history' || text.startsWith('/history ')) {
    const scans = history.get(String(userId)) || [];
    if (!scans.length) {
      await tg.sendMessage(chatId, 'No scans yet.\n\nSend a Twitch URL to get started.');
      return;
    }
    const lines = scans.slice(-5).reverse().map(s =>
      `• <code>${s.username}</code> — Score: ${s.score} — ${timeAgo(s.ts)}`
    );
    await tg.sendMessage(chatId, '<b>Your recent scans:</b>\n\n' + lines.join('\n'));
    return;
  }

  // ── Extract username ──────────────────────────
  let raw = text;
  if (text.startsWith('/review')) {
    raw = text.replace('/review', '').trim();
  }

  const username = svc.extractUsername(raw);

  if (!username) {
    await tg.sendMessage(chatId, [
      '❓ <b>I need a Twitch username or URL.</b>',
      '',
      'Send it like this:',
      '<code>https://twitch.tv/username</code>',
      '',
      'Or just:',
      '<code>username</code>',
    ].join('\n'));
    return;
  }

  // ── Rate limit ───────────────────────────────
  if (svc.isRateLimited(userId)) {
    await tg.sendMessage(chatId, '⏳ Please wait a moment before requesting another scan.');
    return;
  }
  svc.markUsed(userId);

  // ── Start analysis ───────────────────────────
  const t0 = Date.now();

  // Send immediate acknowledgement
  const ackMsg = await tg.sendMessage(chatId, [
    `✅ <b>Channel received: @${username}</b>`,
    '',
    '⏳ Generating your Twitch audit report...',
    '',
    'This normally takes 30–60 seconds.',
  ].join('\n'));

  try {
    // Step 1 — Analyze
    await tg.editMessage(chatId, ackMsg.message_id, [
      `🔍 <b>Analyzing @${username}...</b>`,
      '',
      '📡 Fetching live Twitch data...',
    ].join('\n'));

    const { data, score } = await analyzer.analyze(username);

    // Step 2 — Generate images
    await tg.editMessage(chatId, ackMsg.message_id, [
      `🔍 <b>Analyzing @${username}...</b>`,
      '',
      '✅ Channel data loaded',
      '🎨 Generating 9 proof images...',
    ].join('\n'));

    const images = await imgGen.generateImages(data, score, 'light');

    // Step 3 — Deliver
    await tg.editMessage(chatId, ackMsg.message_id, [
      `✅ <b>Report ready for @${username}</b>`,
      '',
      `📤 Sending ${images.length} images...`,
    ].join('\n'));

    const sent = await svc.deliverImages(chatId, images);

    // Step 4 — Final summary
    const elapsed = Math.round((Date.now() - t0) / 1000);
    const isLive  = !!(data.stream);

    await tg.sendMessage(chatId, [
      `✅ <b>All ${sent} images delivered!</b>`,
      '',
      `📊 <b>@${username} — Quick Summary</b>`,
      `• Status: <b>${isLive ? '🔴 LIVE NOW' : '⚫ Offline'}</b>`,
      `• Health Score: <b>${score.overall}/100</b>`,
      `• Followers: <b>${score.fmtFollowers}</b>`,
      `• Avg Viewers: <b>~${score.avgViewers}</b>`,
      `• Creator IQ: <b>${score.iq}</b>`,
      `• Viral Score: <b>${score.viral}%</b>`,
      `• Promo Ready: <b>${score.promoScore >= 65 ? '✅ Yes' : '❌ Not yet'}</b>`,
      `• Missing followers/mo: <b>~${score.missedF}</b>`,
      `• Missed revenue/mo: <b>$${score.revLow}–$${score.revHigh}</b>`,
      '',
      `⏱ Generated in ${elapsed}s`,
    ].join('\n'));

    // Save to history
    const userHistory = history.get(String(userId)) || [];
    userHistory.push({ username, score: score.overall, ts: Date.now() });
    history.set(String(userId), userHistory.slice(-20));

    // Clean up temp files
    imgGen.cleanup();

  } catch (err) {
    log.error('Analysis pipeline failed', { username, error: err.message });

    const msg2 = err.message === 'notfound'
      ? [
          `❌ <b>Channel not found</b>`,
          '',
          `<code>${username}</code> does not exist on Twitch.`,
          '',
          'Check the spelling and try again.',
        ].join('\n')
      : [
          `❌ <b>Something went wrong</b>`,
          '',
          `Error: ${err.message}`,
          '',
          'Please try again in a moment.',
        ].join('\n');

    await tg.sendMessage(chatId, msg2);
  }
}

function timeAgo(ts) {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60)   return s + 's ago';
  if (s < 3600) return Math.floor(s / 60) + 'm ago';
  return Math.floor(s / 3600) + 'h ago';
}
