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
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Verify Telegram secret header
  const incoming = req.headers['x-telegram-bot-api-secret-token'];
  if (incoming !== config.telegram.webhookSecret) {
    log.warn('Rejected — wrong secret');
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // Always return 200 immediately
  res.status(200).json({ ok: true });

  try {
    await handleUpdate(req.body);
  } catch (err) {
    log.error('Unhandled error', { error: err.message });
  }
};

async function handleUpdate(update) {
  const msg = update?.message || update?.edited_message;
  if (!msg) return;

  const chatId = msg.chat.id;
  const userId = msg.from?.id;
  const text   = (msg.text || '').trim();

  log.info('Message received', { chatId, userId, text: text.slice(0, 80) });

  // ── Access control ──────────────────────────
  if (!svc.isAllowed(userId)) {
    await tg.sendMessage(chatId, '⛔ This bot is private. Contact the owner for access.');
    return;
  }

  // ── /start ──────────────────────────────────
  if (text === '/start' || text.startsWith('/start ')) {
    await tg.sendMessage(chatId, [
      '👋 <b>Welcome to Skillonaire AI Bot!</b>',
      '',
      'I analyze any Twitch channel and generate a professional audit report.',
      '',
      '<b>Send me a Twitch URL or username:</b>',
      '<code>https://twitch.tv/username</code>',
      'or just:',
      '<code>username</code>',
      '',
      'I will fetch live data, score the channel, and send you a full report with a direct link to download all 9 HD proof images.',
      '',
      'Type /help for all commands.',
    ].join('\n'));
    return;
  }

  // ── /help ───────────────────────────────────
  if (text === '/help' || text.startsWith('/help ')) {
    await tg.sendMessage(chatId, [
      '<b>Skillonaire AI Bot — Commands</b>',
      '',
      '/start — Welcome message',
      '/help — Show this message',
      '/review username — Analyze a Twitch channel',
      '/status — Check bot is running',
      '/history — Your recent scans',
      '',
      '<b>Quick scan — no command needed:</b>',
      'Just paste a Twitch URL or username.',
      '',
      '<b>Examples:</b>',
      '<code>https://twitch.tv/draconian920</code>',
      '<code>draconian920</code>',
      '<code>/review draconian920</code>',
    ].join('\n'));
    return;
  }

  // ── /status ─────────────────────────────────
  if (text === '/status' || text.startsWith('/status ')) {
    await tg.sendMessage(chatId, [
      '✅ <b>Bot is online and ready.</b>',
      '',
      'Send a Twitch URL or username to generate a report.',
    ].join('\n'));
    return;
  }

  // ── /history ────────────────────────────────
  if (text === '/history' || text.startsWith('/history ')) {
    const scans = history.get(String(userId)) || [];
    if (!scans.length) {
      await tg.sendMessage(chatId, 'No scans yet.\n\nSend a Twitch URL to get started.');
      return;
    }
    const lines = scans.slice(-5).reverse().map(s =>
      `• <code>${s.username}</code> — Score: <b>${s.score}/100</b> — ${timeAgo(s.ts)}`
    );
    await tg.sendMessage(chatId, '<b>Your recent scans:</b>\n\n' + lines.join('\n'));
    return;
  }

  // ── Extract username ─────────────────────────
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

  const ackMsg = await tg.sendMessage(chatId, [
    `✅ <b>Channel received: @${username}</b>`,
    '',
    '📡 Fetching live Twitch data...',
  ].join('\n'));

  try {
    // Fetch and score
    const { data, score } = await analyzer.analyze(username);
    const elapsed = Math.round((Date.now() - t0) / 1000);
    const isLive  = !!(data.stream);
    const link    = await imgGen.generateAuditLink(username);

    // Build the full report message
    const gradeLabel = score.overall >= 80 ? 'A — Professional'
                     : score.overall >= 65 ? 'B — Growing'
                     : score.overall >= 50 ? 'C — Developing'
                     : 'D — Needs Work';

    const promoStatus = score.promoScore >= 65 ? '✅ Ready for promotion'
                                                : '❌ Fix branding first';

    const partnerStatus = score.isPartner ? '⭐ Already Partner'
                        : score.isAff     ? '🎗 Affiliate — working toward Partner'
                                          : '⚪ Not yet Affiliate';

    await tg.editMessage(chatId, ackMsg.message_id, [
      `📊 <b>Audit Complete — @${username}</b>`,
      `${isLive ? '🔴 LIVE NOW' : '⚫ Offline'} · ${score.gameName || 'No game set'}`,
      '',
      '━━━━━━━━━━━━━━━━━━━━━',
      '📈 <b>PERFORMANCE</b>',
      `• Health Score:      <b>${score.overall}/100</b> (${gradeLabel})`,
      `• Followers:         <b>${score.fmtFollowers}</b>`,
      `• Avg Viewers:       <b>~${score.avgViewers}</b>`,
      `• Peak Viewers:      <b>~${score.peakViewers}</b>`,
      `• Avg Views/Stream:  <b>~${score.avgViews}</b>`,
      `• Active Chatters:   <b>~${score.chatters}</b>`,
      `• Chat Msgs/Stream:  <b>~${score.chatMsgs}</b>`,
      `• Returning Viewers: <b>~${score.retaining}</b>`,
      `• Stream Freq:       <b>${score.streamFreq}/wk</b>`,
      '',
      '━━━━━━━━━━━━━━━━━━━━━',
      '🧠 <b>SCORES</b>',
      `• Creator IQ:        <b>${score.iq}/100</b>`,
      `• Viral Score:       <b>${score.viral}%</b>`,
      `• Brand Score:       <b>${score.brand}%</b>`,
      `• Discoverability:   <b>${score.tagCount * 10}%</b>`,
      `• Promo Score:       <b>${score.promoScore}%</b>`,
      '',
      '━━━━━━━━━━━━━━━━━━━━━',
      '💸 <b>GROWTH LOST THIS MONTH</b>',
      `• Missing followers: <b>~${score.missedF}</b>`,
      `• Missed viewers:    <b>~${score.missedV}</b>`,
      `• Missed revenue:    <b>$${score.revLow}–$${score.revHigh}</b>`,
      '',
      '━━━━━━━━━━━━━━━━━━━━━',
      '🎯 <b>STATUS</b>',
      `• Partner status:    <b>${partnerStatus}</b>`,
      `• Promotion:         <b>${promoStatus}</b>`,
      `• Offline banner:    <b>${score.hasBanner ? '✅ Set' : '❌ Missing'}</b>`,
      `• Channel bio:       <b>${score.hasBio ? '✅ Set' : '❌ Missing'}</b>`,
      `• Social panel:      <b>${score.hasSocial ? '✅ Set' : '❌ Missing'}</b>`,
      `• Tags active:       <b>${score.tagCount}/10</b>`,
      `• Panels:            <b>${score.panelCnt}</b>`,
      `• Clips:             <b>${score.clipCnt}</b>`,
      '',
      '━━━━━━━━━━━━━━━━━━━━━',
      '📥 <b>DOWNLOAD 9 HD PROOF IMAGES</b>',
      '',
      `👉 <a href="${link.url}">${link.url}</a>`,
      '',
      `1. Open the link`,
      `2. Type <code>${username}</code> → click Analyze`,
      `3. Scroll to bottom → <b>⬇ Download 9 HD Images</b>`,
      `4. Choose Light or Dark theme`,
      `5. All 9 proof images download automatically`,
      '',
      `⏱ Analyzed in ${elapsed}s`,
    ].join('\n'));

    // Save to history
    const userHistory = history.get(String(userId)) || [];
    userHistory.push({ username, score: score.overall, ts: Date.now() });
    history.set(String(userId), userHistory.slice(-20));

  } catch (err) {
    log.error('Analysis failed', { username, error: err.message });

    const errMsg = err.message === 'notfound'
      ? [
          `❌ <b>Channel not found: @${username}</b>`,
          '',
          'This username does not exist on Twitch.',
          'Check the spelling and try again.',
        ].join('\n')
      : [
          `❌ <b>Something went wrong</b>`,
          '',
          `Error: ${err.message}`,
          '',
          'Please try again in a moment.',
        ].join('\n');

    await tg.editMessage(chatId, ackMsg.message_id, errMsg);
  }
}

function timeAgo(ts) {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60)   return s + 's ago';
  if (s < 3600) return Math.floor(s / 60) + 'm ago';
  return Math.floor(s / 3600) + 'h ago';
}
