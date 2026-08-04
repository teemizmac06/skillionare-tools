'use strict';

module.exports = async function handler(req, res) {
  res.status(200).json({
    ok:        true,
    service:   'Twitch Skillionaire Tools',
    bot:       'Skillonaire AI Bot',
    version:   '1.0.0',
    timestamp: new Date().toISOString(),
  });
};
