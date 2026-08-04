'use strict';

const FormData = require('form-data');
const log      = require('../utils/logger');
const config   = require('../config');

const BASE = `${config.telegram.apiBase}/bot${config.telegram.token}`;

async function call(method, body = {}) {
  const { default: fetch } = await import('node-fetch');
  const res  = await fetch(`${BASE}/${method}`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  });
  const data = await res.json();
  if (!data.ok) {
    log.warn('Telegram API error', { method, desc: data.description });
    throw new Error(`Telegram ${method}: ${data.description}`);
  }
  return data.result;
}

// Send plain text message
async function sendMessage(chatId, text, extra = {}) {
  return call('sendMessage', {
    chat_id:    chatId,
    text,
    parse_mode: 'HTML',
    ...extra,
  });
}

// Edit existing message (for live status updates)
async function editMessage(chatId, messageId, text) {
  return call('editMessageText', {
    chat_id:    chatId,
    message_id: messageId,
    text,
    parse_mode: 'HTML',
  });
}

// Send a single photo from a Buffer
async function sendPhoto(chatId, imageBuffer, filename, caption) {
  const { default: fetch } = await import('node-fetch');
  const form = new FormData();
  form.append('chat_id', String(chatId));
  form.append('caption', caption || '');
  form.append('photo', imageBuffer, { filename, contentType: 'image/png' });
  const res  = await fetch(`${BASE}/sendPhoto`, { method: 'POST', body: form });
  const data = await res.json();
  if (!data.ok) throw new Error(`sendPhoto failed: ${data.description}`);
  return data.result;
}

// Register the webhook with Telegram
async function setWebhook(webhookUrl, secret) {
  return call('setWebhook', {
    url:                  webhookUrl,
    secret_token:         secret,
    allowed_updates:      ['message'],
    max_connections:      40,
    drop_pending_updates: true,
  });
}

// Check webhook status
async function getWebhookInfo() {
  return call('getWebhookInfo');
}

module.exports = { sendMessage, editMessage, sendPhoto, setWebhook, getWebhookInfo };
