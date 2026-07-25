'use strict';

const analyzer = require('../../services/analyzer');
const imgGen   = require('../../services/imageGenerator');
const log      = require('../../utils/logger');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'POST only' });
  }

  const { username, theme = 'light' } = req.body || {};
  if (!username) {
    return res.status(400).json({ error: 'username is required' });
  }

  try {
    log.info('Screenshots requested', { username, theme });
    const { data, score } = await analyzer.analyze(username);
    const images = await imgGen.generateImages(data, score, theme);

    return res.status(200).json({
      ok:     true,
      count:  images.length,
      images: images.map(img => ({
        name:    img.name,
        caption: img.caption,
      })),
    });
  } catch (err) {
    log.error('Screenshots error', { username, error: err.message });
    return res.status(500).json({ ok: false, error: err.message });
  }
};
