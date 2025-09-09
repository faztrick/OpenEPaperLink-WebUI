// Simple token bucket style in-memory rate limiting utilities
const _rateBuckets = new Map();
function _rateCheck(key, limit, intervalMs){
  const now = Date.now();
  const windowStart = now - intervalMs;
  let arr = _rateBuckets.get(key) || [];
  arr = arr.filter(ts => ts > windowStart);
  if (arr.length >= limit){
    _rateBuckets.set(key, arr);
    return false;
  }
  arr.push(now);
  _rateBuckets.set(key, arr);
  return true;
}
function rateLimit(req, res, keySuffix, limit, intervalMs = 60000){
  const key = `${req.ip || 'unknown'}:${keySuffix}`;
  if(!_rateCheck(key, limit, intervalMs)){
    res.status(429).json({ success:false, error:'rate limit exceeded' });
    return true;
  }
  return false;
}
module.exports = { rateLimit };
