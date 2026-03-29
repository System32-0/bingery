/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║  BINGERY — _middleware.js                                       ║
 * ║  Lightweight Node.js HTTP server that intercepts every          ║
 * ║  request before serving the static app files.                  ║
 * ║                                                                  ║
 * ║  Features:                                                      ║
 * ║  • Session-based authentication (login required)               ║
 * ║  • Request logging (timestamp, method, path, IP)                ║
 * ║  • Security headers on every response                           ║
 * ║  • Path-traversal guard (no ../.. escapes)                      ║
 * ║  • Method allowlist (GET, HEAD, POST for login & API)          ║
 * ║  • Simple in-memory rate limiter (configurable req/min per IP) ║
 * ║  • URL metadata proxy for quick-add feature                    ║
 * ║  • Serves index.html for bare "/" requests                      ║
 * ║                                                                  ║
 * ║  Usage:  node _middleware.js [port]                             ║
 * ║  Default port: 8080                                             ║
 * ║                                                                  ║
 * ║  Environment Variables:                                         ║
 * ║    AUTH_USER     — Login username  (required)                  ║
 * ║    AUTH_PASS     — Login password  (required)                  ║
 * ║    PORT          — Server port     (default: 8080)             ║
 * ║    RATE_LIMIT    — Requests/min    (default: 100)              ║
 * ║    SESSION_TTL   — Session lifetime in ms (default: 86400000)  ║
 * ╚══════════════════════════════════════════════════════════════════╝
 */

'use strict';

const http  = require('http');
const https = require('https');
const fs    = require('fs');
const path  = require('path');
const crypto = require('crypto');
const { URL } = require('url');

/* ── Configuration ── */
const PORT        = parseInt(process.env.PORT            || process.argv[2] || '8080', 10);
const RATE_LIMIT  = parseInt(process.env.RATE_LIMIT      || '100',  10);
const RATE_WINDOW = parseInt(process.env.RATE_WINDOW_MS  || String(60 * 1000), 10);
const SESSION_TTL = parseInt(process.env.SESSION_TTL     || String(24 * 60 * 60 * 1000), 10);
const AUTH_USER   = process.env.AUTH_USER;
const AUTH_PASS   = process.env.AUTH_PASS;

if (!AUTH_USER || !AUTH_PASS) {
  console.error('[Bingery] AUTH_USER and AUTH_PASS environment variables are required.');
  process.exit(1);
}
const ROOT        = __dirname;

/* ── MIME type map ── */
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif':  'image/gif',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
  '.webp': 'image/webp',
};

/* ── Security headers added to every response ── */
const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options':        'SAMEORIGIN',
  'X-XSS-Protection':       '1; mode=block',
  'Referrer-Policy':        'no-referrer',
  'Permissions-Policy':     'camera=(), microphone=(), geolocation=()',
  'Content-Security-Policy':
    "default-src 'none'; " +
    "script-src 'self'; " +
    "style-src 'unsafe-inline'; " +
    "img-src 'self' data: blob:; " +
    "connect-src 'self' blob:; " +
    "font-src 'self'",
};

/* ── Simple in-memory rate limiter: configurable req / window per IP ── */
const rateLimitMap = new Map();

function isRateLimited(ip) {
  const now   = Date.now();
  let   entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    entry = { count: 0, resetAt: now + RATE_WINDOW };
  }
  entry.count++;
  rateLimitMap.set(ip, entry);
  return entry.count > RATE_LIMIT;
}

/* Periodically purge stale rate-limit entries to prevent memory growth */
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of rateLimitMap) {
    if (now > entry.resetAt) rateLimitMap.delete(ip);
  }
}, RATE_WINDOW);

/* ══════════════════════════════════════════════════════════════
   SESSION MANAGEMENT
   In-memory session store with secure random tokens.
   Sessions are stored as { token → { user, createdAt } }.
   ══════════════════════════════════════════════════════════════ */
const sessions = new Map();

function createSession(user) {
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, { user, createdAt: Date.now() });
  return token;
}

function validateSession(token) {
  if (!token) return false;
  const session = sessions.get(token);
  if (!session) return false;
  if (Date.now() - session.createdAt > SESSION_TTL) {
    sessions.delete(token);
    return false;
  }
  return true;
}

function getSessionToken(req) {
  const cookies = req.headers.cookie || '';
  const match = cookies.match(/(?:^|;\s*)bingery_session=([a-f0-9]{64})/);
  return match ? match[1] : null;
}

/* Purge expired sessions periodically */
setInterval(() => {
  const now = Date.now();
  for (const [token, session] of sessions) {
    if (now - session.createdAt > SESSION_TTL) sessions.delete(token);
  }
}, 60 * 60 * 1000);

/* ── Helper: send a plain-text error response ── */
function sendError(res, statusCode, message) {
  res.writeHead(statusCode, {
    'Content-Type': 'text/plain; charset=utf-8',
    ...SECURITY_HEADERS,
  });
  res.end(message);
}

/* ── Helper: serve a file from disk ── */
function serveFile(res, filePath) {
  fs.readFile(filePath, (err, data) => {
    if (err) {
      /* Serve the custom 404.html page if it exists.
         This provides a themed error page that matches the app's design
         instead of a bare "Not Found" text response. Falls back to the
         plain-text sendError() if 404.html itself cannot be read. */
      const notFoundPage = path.join(ROOT, '404.html');
      fs.readFile(notFoundPage, (err404, html404) => {
        if (err404) {
          sendError(res, 404, 'Not Found');
          return;
        }
        res.writeHead(404, {
          'Content-Type':   'text/html; charset=utf-8',
          'Content-Length': Buffer.byteLength(html404),
          'Cache-Control':  'no-store',
          ...SECURITY_HEADERS,
        });
        res.end(html404);
      });
      return;
    }
    const ext      = path.extname(filePath).toLowerCase();
    const mimeType = MIME[ext] || 'application/octet-stream';
    /* Cache static assets (images, fonts) but not HTML/JS/JSON which may change */
    const cacheable = ['.png','.jpg','.jpeg','.gif','.svg','.ico','.webp'].includes(ext);
    res.writeHead(200, {
      'Content-Type':   mimeType,
      'Content-Length': Buffer.byteLength(data),
      'Cache-Control':  cacheable ? 'public, max-age=86400, immutable' : 'no-store',
      ...SECURITY_HEADERS,
    });
    res.end(data);
  });
}

/* ── Helper: read POST body ── */
function readBody(req, maxBytes) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', chunk => {
      size += chunk.length;
      if (size > (maxBytes || 1024 * 64)) {
        req.destroy();
        reject(new Error('Body too large'));
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
    req.on('error', reject);
  });
}

/* ══════════════════════════════════════════════════════════════
   LOGIN PAGE HTML
   Served when user is not authenticated.
   Uses only inline styles (CSP-compliant).
   ══════════════════════════════════════════════════════════════ */
function getLoginPageHTML(errorMsg) {
  const errBlock = errorMsg
    ? '<p style="color:#e85050;font-size:13px;margin-bottom:16px;text-align:center">' + escapeHTMLServer(errorMsg) + '</p>'
    : '';
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Bingery — Login</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
      background:#0d0f14;color:#e8eaf0;min-height:100vh;display:flex;align-items:center;justify-content:center}
    .login-box{background:#131720;border:1px solid #252b3b;border-radius:16px;
      padding:40px 32px;width:100%;max-width:380px;box-shadow:0 8px 48px rgba(0,0,0,0.75)}
    .login-brand{display:flex;align-items:center;gap:8px;justify-content:center;margin-bottom:32px}
    .login-brand svg{width:28px;height:28px;color:#4a80d4}
    .login-brand span{font-size:20px;font-weight:700;letter-spacing:-0.02em}
    .login-subtitle{text-align:center;color:#8a90a8;font-size:14px;margin-bottom:24px}
    .form-group{margin-bottom:16px}
    .form-group label{display:block;font-size:12px;font-weight:700;color:#8a90a8;
      text-transform:uppercase;letter-spacing:0.08em;margin-bottom:6px}
    .form-group input{width:100%;padding:10px 14px;background:#1a1f2e;border:1px solid #252b3b;
      border-radius:8px;color:#e8eaf0;font-size:15px;font-family:inherit;outline:none;
      transition:border-color 120ms ease-out,box-shadow 120ms ease-out}
    .form-group input:focus{border-color:#4a80d4;box-shadow:0 0 0 3px rgba(74,128,212,0.45)}
    .form-group input::placeholder{color:#4a5068}
    .login-btn{width:100%;padding:11px;background:#4a80d4;color:#fff;border:none;
      border-radius:8px;font-size:14px;font-weight:500;cursor:pointer;font-family:inherit;
      transition:background 120ms ease-out;margin-top:8px}
    .login-btn:hover{background:#6298e8}
  </style>
</head>
<body>
  <div class="login-box">
    <div class="login-brand">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" aria-hidden="true">
        <rect x="2" y="4" width="28" height="24" rx="3" fill="none" stroke="currentColor" stroke-width="2"/>
        <path d="M10 10 L22 16 L10 22 Z" fill="currentColor"/>
      </svg>
      <span>Bingery</span>
    </div>
    <p class="login-subtitle">Sign in to access your media library</p>
    ${errBlock}
    <form method="POST" action="/login">
      <div class="form-group">
        <label for="username">Username</label>
        <input type="text" id="username" name="username" placeholder="Enter username" autocomplete="username" required autofocus/>
      </div>
      <div class="form-group">
        <label for="password">Password</label>
        <input type="password" id="password" name="password" placeholder="Enter password" autocomplete="current-password" required/>
      </div>
      <button type="submit" class="login-btn">Sign In</button>
    </form>
  </div>
</body>
</html>`;
}

function escapeHTMLServer(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

/* ══════════════════════════════════════════════════════════════
   URL METADATA PROXY
   Fetches a URL and extracts Open Graph / meta tags for the
   quick-add feature. Only allows known safe domains.
   ══════════════════════════════════════════════════════════════ */
const ALLOWED_DOMAINS = [
  'myanimelist.net',
  'anilist.co',
  'crunchyroll.com',
  'www.myanimelist.net',
  'www.crunchyroll.com',
  'kitsu.io',
  'www.kitsu.io',
  'mangadex.org',
  'www.mangadex.org',
];

function isAllowedDomain(hostname) {
  return ALLOWED_DOMAINS.some(d => hostname === d || hostname.endsWith('.' + d));
}

/* ── fetchURL ──
   Fetches the HTML content of a URL. Uses a realistic browser User-Agent
   to avoid being blocked by Cloudflare or bot protection on sites like
   MyAnimeList and AniList. Follows up to 5 redirects, enforces a 15-second
   timeout, and rejects responses over 512 KB or with non-2xx status codes. */
function fetchURL(targetUrl, redirectCount) {
  redirectCount = redirectCount || 0;
  if (redirectCount > 5) return Promise.reject(new Error('Too many redirects'));

  return new Promise((resolve, reject) => {
    const parsed = new URL(targetUrl);
    const client = parsed.protocol === 'https:' ? https : http;
    const options = {
      hostname: parsed.hostname,
      port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method: 'GET',
      headers: {
        /* Use a realistic browser User-Agent — many anime/manga sites
           (MAL, AniList, Crunchyroll) use Cloudflare and will return 403
           or a JS challenge page to obviously non-browser clients */
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'identity',
        'Cache-Control': 'no-cache',
      },
      timeout: 15000,
    };
    const req = client.request(options, res => {
      /* Follow redirects (up to 5 hops) */
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume(); /* drain the response body */
        try {
          const redirectUrl = new URL(res.headers.location, targetUrl).href;
          fetchURL(redirectUrl, redirectCount + 1).then(resolve).catch(reject);
          return;
        } catch { reject(new Error('Bad redirect URL')); return; }
      }

      /* Reject non-2xx responses with a descriptive error */
      if (res.statusCode < 200 || res.statusCode >= 300) {
        res.resume();
        reject(new Error('HTTP ' + res.statusCode + ' from ' + parsed.hostname));
        return;
      }

      const chunks = [];
      let size = 0;
      res.on('data', chunk => {
        size += chunk.length;
        if (size > 512 * 1024) { res.destroy(); reject(new Error('Response too large')); return; }
        chunks.push(chunk);
      });
      res.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Request timed out after 15s')); });
    req.end();
  });
}

/* ── extractMeta ──
   Parses HTML and extracts metadata using Open Graph tags, standard meta
   tags, and common HTML patterns found on anime/manga sites.
   Tries multiple regex patterns per field because different sites order
   their meta tag attributes differently (property before content, or
   content before property). Also decodes HTML entities in extracted values. */
function extractMeta(html) {
  const meta = {};

  /* Decode common HTML entities (&amp; &lt; &#039; etc.) in extracted strings */
  const decodeEntities = (str) => {
    if (!str) return str;
    return str
      .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/&#x27;/g, "'")
      .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)));
  };

  /* Match an Open Graph meta tag — tries both attribute orderings:
     <meta property="og:X" content="Y"> and <meta content="Y" property="og:X"> */
  const ogMatch = (prop) => {
    const re = new RegExp('<meta[^>]+(?:property|name)=["\']og:' + prop + '["\'][^>]+content=["\']([^"\']*)["\']', 'i');
    const m = html.match(re);
    if (m) return decodeEntities(m[1].trim());
    const re2 = new RegExp('<meta[^>]+content=["\']([^"\']*)["\'][^>]+(?:property|name)=["\']og:' + prop + '["\']', 'i');
    const m2 = html.match(re2);
    return m2 ? decodeEntities(m2[1].trim()) : null;
  };

  /* Match a standard <meta name="X" content="Y"> tag */
  const metaMatch = (name) => {
    const re = new RegExp('<meta[^>]+name=["\']' + name + '["\'][^>]+content=["\']([^"\']*)["\']', 'i');
    const m = html.match(re);
    if (m) return decodeEntities(m[1].trim());
    const re2 = new RegExp('<meta[^>]+content=["\']([^"\']*)["\'][^>]+name=["\']' + name + '["\']', 'i');
    const m2 = html.match(re2);
    return m2 ? decodeEntities(m2[1].trim()) : null;
  };

  /* Title — try OG, then Twitter card, then <title> tag */
  meta.title = ogMatch('title') || metaMatch('twitter:title') || (() => {
    const m = html.match(/<title[^>]*>([^<]+)</i);
    return m ? decodeEntities(m[1].trim()) : null;
  })();

  /* Cover image — try OG, then Twitter card image */
  meta.image = ogMatch('image') || metaMatch('twitter:image') || null;

  /* Description / synopsis — try OG, then standard description meta */
  meta.description = ogMatch('description') || metaMatch('description') || null;

  /* Try to extract genres from common patterns on anime/manga sites.
     Looks for "genre" or "genres" followed by a colon, angle bracket, or
     whitespace, then captures up to 100 chars of comma/pipe-separated values */
  const genreMatch = html.match(/(?:genre|genres)["\s:>]+([^<]{3,100})/i);
  if (genreMatch) {
    meta.genres = genreMatch[1].split(/[,|]/).map(g => g.trim()).filter(g => g.length > 0 && g.length < 30).slice(0, 10);
  }

  /* Try to extract episode count — looks for "episodes: 24" or "eps: 12" patterns */
  const epMatch = html.match(/(?:episodes?|eps?)\s*(?::|=)\s*(\d+)/i);
  if (epMatch) meta.episodes = parseInt(epMatch[1], 10);

  /* Try to extract author from common patterns */
  const authorMatch = html.match(/(?:author|creator|mangaka|artist)["\s:>]+([^<,]{2,50})/i);
  if (authorMatch) meta.author = decodeEntities(authorMatch[1].trim());

  return meta;
}

/* ── handleFetchMeta ──
   API endpoint handler for POST /api/fetch-meta.
   Validates the URL, checks the domain allowlist, fetches the page HTML,
   extracts metadata, and returns it as JSON. Provides descriptive error
   messages so the client-side can display helpful feedback to the user. */
async function handleFetchMeta(req, res) {
  try {
    const body = await readBody(req, 2048);
    let params;
    try { params = JSON.parse(body); } catch {
      sendJSON(res, 400, { error: 'Invalid request body.' });
      return;
    }
    const targetUrl = params.url;
    if (!targetUrl) { sendJSON(res, 400, { error: 'Missing url parameter.' }); return; }

    let parsed;
    try { parsed = new URL(targetUrl); } catch {
      sendJSON(res, 400, { error: 'Invalid URL format. Include https://' });
      return;
    }

    if (!isAllowedDomain(parsed.hostname)) {
      sendJSON(res, 403, { error: 'Domain not supported. Allowed: MyAnimeList, AniList, Crunchyroll, Kitsu, MangaDex' });
      return;
    }

    const html = await fetchURL(targetUrl);

    /* Check if we got a Cloudflare challenge page instead of real content */
    if (html.includes('Enable JavaScript and cookies to continue') ||
        html.includes('cf-challenge-running') ||
        html.includes('Checking your browser')) {
      sendJSON(res, 502, { error: 'Site returned a bot challenge page. Try a direct link to a specific anime/manga page.' });
      return;
    }

    const meta = extractMeta(html);

    /* Warn if we couldn't extract a title — probably got a non-content page */
    if (!meta.title) {
      sendJSON(res, 200, { ...meta, warning: 'Could not extract title. The page may require JavaScript or the URL may not point to a specific entry.' });
      return;
    }

    sendJSON(res, 200, meta);
  } catch (err) {
    /* Provide actionable error messages based on the failure type */
    const msg = err.message || 'Unknown error';
    if (msg.includes('HTTP 403')) {
      sendJSON(res, 502, { error: 'Site blocked the request (403 Forbidden). Try a different URL or check that the link is publicly accessible.' });
    } else if (msg.includes('HTTP 404')) {
      sendJSON(res, 502, { error: 'Page not found on the target site (404). Check that the URL is correct.' });
    } else if (msg.includes('timed out') || msg.includes('Timeout')) {
      sendJSON(res, 504, { error: 'Request timed out. The site may be slow or blocking automated requests.' });
    } else {
      sendJSON(res, 500, { error: 'Failed to fetch: ' + msg });
    }
  }
}

function sendJSON(res, statusCode, data) {
  const body = JSON.stringify(data);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    ...SECURITY_HEADERS,
  });
  res.end(body);
}

/* ── Main request handler ── */
const server = http.createServer(async (req, res) => {
  const ip        = req.socket?.remoteAddress || 'unknown';
  const timestamp = new Date().toISOString();

  /* 1. Rate limiting */
  if (isRateLimited(ip)) {
    console.warn(`[${timestamp}] 429 RATE_LIMITED  ${ip}  ${req.method} ${req.url}`);
    sendError(res, 429, 'Too Many Requests');
    return;
  }

  /* 2. Method allowlist */
  if (req.method !== 'GET' && req.method !== 'HEAD' && req.method !== 'POST') {
    console.warn(`[${timestamp}] 405 METHOD_NOT_ALLOWED  ${ip}  ${req.method} ${req.url}`);
    res.writeHead(405, { Allow: 'GET, HEAD, POST', ...SECURITY_HEADERS });
    res.end();
    return;
  }

  /* 3. Extract URL path */
  const urlPath = (req.url || '/').split('?')[0].split('#')[0];

  if (req.method === 'POST' && urlPath === '/login') {
    try {
      const body = await readBody(req, 4096);
      const params = new URLSearchParams(body);
      const user = params.get('username') || '';
      const pass = params.get('password') || '';

      if (user === AUTH_USER && pass === AUTH_PASS) {
        const token = createSession(user);
        console.log(`[${timestamp}] 302 LOGIN_SUCCESS  ${ip}`);
        res.writeHead(302, {
          Location: '/',
          'Set-Cookie': `bingery_session=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${Math.floor(SESSION_TTL / 1000)}`,
          ...SECURITY_HEADERS,
        });
        res.end();
      } else {
        console.warn(`[${timestamp}] 401 LOGIN_FAILED  ${ip}`);
        const html = getLoginPageHTML('Invalid username or password.');
        res.writeHead(200, {
          'Content-Type': 'text/html; charset=utf-8',
          ...SECURITY_HEADERS,
        });
        res.end(html);
      }
    } catch (err) {
      sendError(res, 400, 'Bad request');
    }
    return;
  }

  /* 4. Handle logout */
  if (urlPath === '/logout') {
    sessions.delete(getSessionToken(req));
    res.writeHead(302, {
      Location: '/',
      'Set-Cookie': 'bingery_session=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0',
      ...SECURITY_HEADERS,
    });
    res.end();
    return;
  }

  /* 5. Check authentication for all other requests */
  const sessionToken = getSessionToken(req);
  if (!validateSession(sessionToken)) {
    /* Not authenticated — serve login page */
    const html = getLoginPageHTML(null);
    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      ...SECURITY_HEADERS,
    });
    res.end(html);
    return;
  }

  /* 6. Handle API endpoints (authenticated) */
  if (req.method === 'POST' && urlPath === '/api/fetch-meta') {
    await handleFetchMeta(req, res);
    return;
  }

  /* 7. Only GET/HEAD past this point */
  if (req.method === 'POST') {
    sendError(res, 404, 'Not Found');
    return;
  }

  /* 8. Resolve file path — strip query string and fragment */
  let filePath = urlPath;
  if (filePath === '/' || filePath === '') filePath = '/index.html';

  /* 9. Path-traversal guard — two complementary checks:
        a) path.resolve must stay within ROOT (handles absolute escapes)
        b) path.relative must not escape with '..' (handles Windows slashes
           and any edge-case the resolve+startsWith check might miss)       */
  const resolved = path.resolve(ROOT, '.' + filePath);
  const relative = path.relative(ROOT, resolved);
  if (
    (!resolved.startsWith(ROOT + path.sep) && resolved !== ROOT) ||
    relative.startsWith('..')
  ) {
    console.warn(`[${timestamp}] 403 FORBIDDEN  ${ip}  ${req.url}`);
    sendError(res, 403, 'Forbidden');
    return;
  }

  /* 10. Log and serve */
  console.log(`[${timestamp}] 200  ${ip}  ${req.method} ${filePath}`);
  serveFile(res, resolved);
});

server.on('error', err => {
  if (err.code === 'EADDRINUSE') {
    console.error(`[Bingery] Port ${PORT} is already in use. Try: node _middleware.js <port>`);
  } else {
    console.error('[Bingery] Server error:', err.message);
  }
  process.exit(1);
});

server.listen(PORT, '127.0.0.1', () => {
  console.log('╔════════════════════════════════════════════════╗');
  console.log('║  Bingery Middleware Server                     ║');
  console.log(`║  Listening at  http://127.0.0.1:${String(PORT).padEnd(5)}        ║`);
  console.log('║  Authentication: ENABLED                       ║');
  console.log('║  Press Ctrl+C to stop.                         ║');
  console.log('╚════════════════════════════════════════════════╝');
});
