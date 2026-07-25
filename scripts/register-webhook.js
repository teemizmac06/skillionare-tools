#!/usr/bin/env node
'use strict';

/**
 * Run this ONE TIME after deploying to Vercel.
 *
 * It tells Telegram: "Send all bot messages to my Vercel app."
 *
 * How to run:
 *   node scripts/register-webhook.js
 *
 * Make sure these 3 env vars are set before running:
 *   TELEGRAM_BOT_TOKEN
 *   TELEGRAM_WEBHOOK_SECRET
 *   APP_URL
 */

const token   = process.env.TELEGRAM_BOT_TOKEN;
const secret  = process.env.TELEGRAM_WEBHOOK_SECRET;
const appUrl  = process.env.APP_URL;

if (!token) {
  console.error('\n❌  TELEGRAM_BOT_TOKEN is not set.');
  console.error('    Run: export TELEGRAM_BOT_TOKEN=your_token_here\n');
  process.exit(1);
}
if (!secret) {
  console.error('\n❌  TELEGRAM_WEBHOOK_SECRET is not set.');
  console.error('    Run: export TELEGRAM_WEBHOOK_SECRET=any_random_string\n');
  process.exit(1);
}
if (!appUrl) {
  console.error('\n❌  APP_URL is not set.');
  console.error('    Run: export APP_URL=https://your-project.vercel.app\n');
  process.exit(1);
}

const webhookUrl = `${appUrl}/api/telegram/webhook`;

async function run() {
  const { default: fetch } = await import('node-fetch');

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  Registering Telegram Webhook');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`  URL: ${webhookUrl}\n`);

  // Register
  const setRes = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url:                  webhookUrl,
      secret_token:         secret,
      allowed_updates:      ['message'],
      max_connections:      40,
      drop_pending_updates: true,
    }),
  });
  const setData = await setRes.json();

  if (!setData.ok) {
    console.error('❌  Failed to register webhook:');
    console.error('    ' + setData.description);
    console.error('\n    Check your TELEGRAM_BOT_TOKEN is correct.\n');
    process.exit(1);
  }

  console.log('✅  Webhook registered!\n');

  // Verify
  const infoRes  = await fetch(`https://api.telegram.org/bot${token}/getWebhookInfo`);
  const infoData = await infoRes.json();
  const info     = infoData.result;

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  Webhook Info');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`  URL:              ${info.url}`);
  console.log(`  Pending updates:  ${info.pending_update_count}`);
  console.log(`  Last error:       ${info.last_error_message || 'none ✅'}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  if (info.last_error_message) {
    console.warn('⚠️   There is an error. Check your APP_URL is correct and Vercel is deployed.\n');
  } else {
    console.log('🎉  Everything looks good!');
    console.log('    Open Telegram and send your bot: /start\n');
  }
}

run().catch(err => {
  console.error('\n❌  Unexpected error:', err.message, '\n');
  process.exit(1);
});
