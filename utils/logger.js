'use strict';

const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };
const current = LEVELS[process.env.LOG_LEVEL || 'info'] ?? 1;

function write(level, msg, meta) {
  if (LEVELS[level] < current) return;
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    msg,
    ...(meta || {}),
  });
  if (level === 'error') console.error(line);
  else console.log(line);
}

module.exports = {
  debug: (m, x) => write('debug', m, x),
  info:  (m, x) => write('info',  m, x),
  warn:  (m, x) => write('warn',  m, x),
  error: (m, x) => write('error', m, x),
};
