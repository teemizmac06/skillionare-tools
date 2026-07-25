'use strict';

const log = require('../utils/logger');

const { clientId, clientSecret } = require('../config').twitch;

let _token = { value: null, expiresAt: 0 };

async function getToken() {
  if (_token.value && Date.now() < _token.expiresAt - 60000) return _token.value;
  const { default: fetch } = await import('node-fetch');
  const res = await fetch(
    `https://id.twitch.tv/oauth2/token?client_id=${clientId}&client_secret=${clientSecret}&grant_type=client_credentials`,
    { method: 'POST' }
  );
  if (!res.ok) throw new Error(`Twitch token failed: ${res.status}`);
  const data = await res.json();
  _token = { value: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
  log.info('Twitch token refreshed');
  return _token.value;
}

async function twitchGET(path) {
  const { default: fetch } = await import('node-fetch');
  const token = await getToken();
  const res = await fetch(`https://api.twitch.tv/helix/${path}`, {
    headers: {
      'Client-ID': clientId,
      'Authorization': `Bearer ${token}`,
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `Twitch API error ${res.status}`);
  }
  return res.json();
}

async function fetchChannelData(username) {
  log.info('Fetching channel data', { username });

  const userRes = await twitchGET(`users?login=${encodeURIComponent(username)}`);
  if (!userRes.data || !userRes.data[0]) throw new Error('notfound');
  const user = userRes.data[0];
  const id   = user.id;

  const [chanRes, streamRes, follRes, clipRes, vodRes, hlRes] = await Promise.all([
    twitchGET(`channels?broadcaster_id=${id}`),
    twitchGET(`streams?user_id=${id}`),
    twitchGET(`channels/followers?broadcaster_id=${id}&first=1`),
    twitchGET(`clips?broadcaster_id=${id}&first=20&sort=views`),
    twitchGET(`videos?user_id=${id}&type=archive&first=20`),
    twitchGET(`videos?user_id=${id}&type=highlight&first=10`),
  ]);

  // Panels (v5 endpoint — fails gracefully)
  let panels = [];
  try {
    const { default: fetch } = await import('node-fetch');
    const token = await getToken();
    const pr = await fetch(`https://api.twitch.tv/v5/channels/${id}/panels`, {
      headers: { 'Client-ID': clientId, 'Authorization': `Bearer ${token}` },
    });
    if (pr.ok) panels = await pr.json();
  } catch (e) {
    log.warn('Panels fetch skipped', { username });
  }

  return {
    user,
    chan:       chanRes.data?.[0]  || null,
    stream:    streamRes.data?.[0] || null,
    followers: follRes.total       || 0,
    clips:     clipRes.data        || [],
    vods:      vodRes.data         || [],
    highlights:hlRes.data          || [],
    panels:    Array.isArray(panels) ? panels : [],
  };
}

module.exports = { fetchChannelData, getToken };
