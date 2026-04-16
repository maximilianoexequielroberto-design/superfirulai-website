const globalStore = globalThis.__SUPERFIRULAI_RATE_LIMIT__ || new Map();
globalThis.__SUPERFIRULAI_RATE_LIMIT__ = globalStore;

export function applySecurityHeaders(res, { privateResponse = true } = {}) {
  if (!res || typeof res.setHeader !== 'function') return;
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), browsing-topics=()');
  if (privateResponse) {
    res.setHeader('Cache-Control', 'no-store, max-age=0');
  }
}

export function getClientIp(req) {
  const forwarded = String(req?.headers?.['x-forwarded-for'] || '').split(',')[0].trim();
  return forwarded || String(req?.socket?.remoteAddress || req?.ip || 'unknown');
}

export function enforceRateLimit(req, res, {
  key,
  limit = 10,
  windowMs = 60_000,
  scope = 'global'
} = {}) {
  const ip = getClientIp(req);
  const bucketKey = `${scope}:${key || ip}`;
  const now = Date.now();
  const bucket = globalStore.get(bucketKey) || { count: 0, resetAt: now + windowMs };

  if (now > bucket.resetAt) {
    bucket.count = 0;
    bucket.resetAt = now + windowMs;
  }

  bucket.count += 1;
  globalStore.set(bucketKey, bucket);

  if (bucket.count > limit) {
    const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
    res.setHeader('Retry-After', String(retryAfter));
    return false;
  }

  return true;
}

export function serverError(res, fallback = 'Server error', error = null) {
  const message = fallback || 'Server error';
  if (error) {
    console.error(message, error);
  }
  return res.status(500).json({ error: message });
}
