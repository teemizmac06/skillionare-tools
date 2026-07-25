'use strict';

const { fetchChannelData } = require('../lib/twitch');
const log = require('../utils/logger');

function parseDur(s) {
  if (!s) return 0;
  const h  = (s.match(/(\d+)h/) || [0, 0])[1];
  const m  = (s.match(/(\d+)m/) || [0, 0])[1];
  const se = (s.match(/(\d+)s/) || [0, 0])[1];
  return (+h * 3600) + (+m * 60) + +se;
}

function fmtN(n) {
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
  return String(n);
}

function ageFmt(d) {
  if (d >= 365) return Math.floor(d / 365) + 'y ' + Math.floor((d % 365) / 30) + 'mo';
  if (d >= 30)  return Math.floor(d / 30) + 'mo';
  return d + 'd';
}

function scoreChannel(d) {
  const { user, chan, stream, followers, clips, vods, panels } = d;

  const hasBio    = (user.description || '').trim().length > 10;
  const hasAvatar = !!(user.profile_image_url && !user.profile_image_url.includes('user-default'));
  const hasBanner = !!(user.offline_image_url && user.offline_image_url.trim());
  const tags      = chan?.tags || [];
  const tagCount  = tags.length;
  const hasGame   = !!(chan?.game_name);
  const title     = stream?.title || chan?.title || '';
  const goodTitle = title.length > 18 && title.length < 90;
  const panelArr  = Array.isArray(panels) ? panels : [];
  const panelCnt  = panelArr.length;
  const hasSocial = panelArr.some(p => /twitter|discord|youtube|instagram|tiktok/i.test(JSON.stringify(p)));
  const hasSched  = panelArr.some(p => /schedule|sched/i.test(JSON.stringify(p)));
  const hasDonate = panelArr.some(p => /donat|tip|paypal|streamlab|streamelem/i.test(JSON.stringify(p)));
  const clipCnt   = clips.length;
  const isPartner = user.broadcaster_type === 'partner';
  const isAff     = user.broadcaster_type === 'affiliate';
  const daysOld   = Math.floor((Date.now() - new Date(user.created_at)) / 86400000);

  let streamFreq = 0;
  if (vods.length >= 2) {
    const oldest = new Date(vods[vods.length - 1].created_at);
    const newest = new Date(vods[0].created_at);
    const weeks  = Math.max(1, (newest - oldest) / (7 * 86400000));
    streamFreq   = Math.round(vods.length / weeks);
  }

  // Sub-scores
  const brand = Math.min(100,
    (hasAvatar ? 26 : 0) + (hasBanner ? 26 : 0) + Math.min(20, panelCnt * 4) +
    (hasSocial ? 14 : 0) + (hasSched ? 10 : 0) + (hasDonate ? 4 : 0));

  const profile = Math.min(100,
    (hasBio ? 26 : 0) + (hasGame ? 16 : 0) + (goodTitle ? 20 : 0) +
    Math.min(24, tagCount * 3.5) + (isPartner || isAff ? 14 : 0));

  const community = Math.min(100,
    Math.min(36, clipCnt * 3.5) + (hasSocial ? 24 : 0) +
    (panelCnt >= 3 ? 18 : panelCnt * 4) + Math.min(22, streamFreq * 5));

  const growth = Math.min(100, Math.floor(
    Math.min(28, Math.log10(Math.max(followers, 10)) * 9) +
    Math.min(24, streamFreq * 5) +
    (daysOld > 365 ? 18 : Math.floor(daysOld / 365 * 18)) +
    Math.min(20, clipCnt * 2)));

  const overall = Math.floor(brand * .28 + profile * .28 + community * .22 + growth * .22);

  const promoScore = Math.min(100, Math.floor(
    Math.min(22, Math.log10(Math.max(followers, 10)) * 7) +
    (streamFreq >= 3 ? 18 : streamFreq * 5) +
    (hasAvatar ? 8 : 0) + (hasBanner ? 8 : 0) + (hasBio ? 7 : 0) +
    Math.min(12, tagCount * 1.5) + (clipCnt >= 5 ? 8 : clipCnt) +
    (hasSocial ? 7 : 0) + (goodTitle ? 10 : 0)));

  const iq = Math.floor(
    brand * .22 + profile * .22 + community * .2 + growth * .2 +
    Math.min(tagCount * 10, 10) * .08 + (clipCnt >= 5 ? 8 : clipCnt) * .08);

  const viral = Math.min(100, Math.floor(
    Math.min(40, clipCnt * 4) + (hasSocial ? 25 : 0) +
    (streamFreq >= 3 ? 20 : streamFreq * 6) + (d.highlights?.length > 5 ? 15 : 0)));

  // Estimated performance metrics
  const avgViewers  = Math.max(1,  Math.floor(followers * 0.004));
  const peakViewers = Math.max(2,  Math.floor(avgViewers * 2.8));
  const chatters    = Math.max(0,  Math.floor(avgViewers * 0.28));
  const chatMsgs    = Math.max(0,  Math.floor(chatters * 4.5));
  const avgViews    = Math.max(10, Math.floor(avgViewers * 190));
  const retaining   = community >= 40
    ? Math.floor(avgViewers * .38)
    : Math.floor(avgViewers * .18);

  // Growth lost (creates urgency — conservative numbers)
  const gapF    = (100 - overall) / 100;
  const discF   = (100 - Math.min(100, tagCount * 10)) / 100;
  const missedF = Math.round(followers * gapF * 0.10 + discF * 140 + (!hasBanner ? 42 : 0) + (!hasBio ? 28 : 0));
  const missedV = Math.round(missedF * 1.9);
  const missedS = Math.round(missedF * (isPartner ? .07 : isAff ? .04 : .01));
  const revLow  = Math.round(missedS * 2.5 + missedV * .002 + 10);
  const revHigh = Math.round(revLow * 3.4 + 15);

  // Growth projection — moderate, not dramatic
  const curMo = Math.max(1, Math.floor(followers * 0.005));
  const potMo = Math.max(curMo + 2, Math.floor(curMo * 1.42));
  const cur90 = curMo * 3;
  const pot90 = potMo * 3;

  return {
    overall, brand, profile, community, growth,
    iq, viral, promoScore,
    hasAvatar, hasBanner, hasBio, hasGame, goodTitle,
    hasSocial, hasSched, hasDonate,
    tags, tagCount, panelCnt, clipCnt,
    isPartner, isAff, daysOld, followers,
    streamFreq, title,
    avgViewers, peakViewers, chatters, chatMsgs, avgViews, retaining,
    missedF, missedV, missedS, revLow, revHigh,
    curMo, potMo, cur90, pot90,
    // Formatted helpers
    fmtFollowers: fmtN(followers),
    ageStr:       ageFmt(daysOld),
    gameName:     chan?.game_name || '',
    bestClip:     clips.length ? fmtN(clips[0].view_count || 0) + ' views' : 'No clips yet',
  };
}

async function analyze(username) {
  const t0   = Date.now();
  const data  = await fetchChannelData(username);
  const score = scoreChannel(data);
  log.info('Analysis complete', { username, overall: score.overall, ms: Date.now() - t0 });
  return { data, score };
}

module.exports = { analyze, scoreChannel };
