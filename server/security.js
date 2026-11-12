// Security headers and request limits for the HTTP routes. No outside packages.
const isLoopback = (ip) => ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';

// Same-origin only: the app loads nothing from other websites. GATS_CSP=report-only or off is an emergency switch
// if a browser ever blocks something it should not.
function securityHeaders() {
  const mode = process.env.GATS_CSP || 'on';
  const csp = [
    "default-src 'self'", "script-src 'self'", "style-src 'self' 'unsafe-inline'", "img-src 'self' data: blob:",
    "font-src 'self' data:", "connect-src 'self' ws: wss:", "media-src 'self' blob:", "object-src 'none'",
    "base-uri 'self'", "form-action 'self'", "frame-ancestors 'none'",
  ].join('; ');
  return (req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    if (mode === 'report-only') res.setHeader('Content-Security-Policy-Report-Only', csp);
    else if (mode !== 'off') res.setHeader('Content-Security-Policy', csp);
    if (req.path && req.path.startsWith('/api')) res.setHeader('Cache-Control', 'no-store'); // never cache sales data
    next();
  };
}

// Fixed-window limiter per client address. skipLoopback keeps the main terminal itself from ever being limited.
function rateLimit({ windowMs, max, message, skipLoopback = false, key = (req) => req.ip }) {
  const hits = new Map();
  const sweep = setInterval(() => {
    const now = Date.now();
    for (const [k, v] of hits) if (v.resetAt <= now) hits.delete(k);
  }, Math.max(windowMs, 1000));
  if (sweep.unref) sweep.unref();

  const mw = (req, res, next) => {
    if (skipLoopback && isLoopback(req.ip)) return next();
    const k = key(req);
    const now = Date.now();
    let h = hits.get(k);
    if (!h || h.resetAt <= now) { h = { count: 0, resetAt: now + windowMs }; hits.set(k, h); }
    h.count += 1;
    if (h.count > max) {
      const seconds = Math.max(1, Math.ceil((h.resetAt - now) / 1000));
      res.setHeader('Retry-After', String(seconds));
      return res.status(429).json({ success: false, error: `${message} Try again in ${seconds} seconds.` });
    }
    return next();
  };
  mw.stop = () => clearInterval(sweep);
  return mw;
}

module.exports = { securityHeaders, rateLimit, isLoopback };
