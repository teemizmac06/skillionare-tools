'use strict';

const analyzer = require('../../services/analyzer');
const log      = require('../../utils/logger');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const username = (
    req.query?.username ||
    req.body?.username  ||
    ''
  ).trim().toLowerCase().replace(/^@/, '');

  if (!username) {
    return res.status(400).json({ error: 'username is required' });
  }

  try {
    const { data, score } = await analyzer.analyze(username);
    return res.status(200).json({
      ok:       true,
      username: data.user.login,
      display:  data.user.display_name,
      avatar:   data.user.profile_image_url,
      isLive:   !!(data.stream),
      followers:score.followers,
      score,
    });
  } catch (err) {
    log.error('Analyze API error', { username, error: err.message });
    const status = err.message === 'notfound' ? 404 : 500;
    return res.status(status).json({ ok: false, error: err.message });
  }
};
