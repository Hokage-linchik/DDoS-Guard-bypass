Многослойный обход DDoS-Guard. Покрывает старую защиту (JS Challenge через check.js), новую (ddgu endpoint handshake с /g - /c - /ddgu/), ML-детекцию 2026 года.

6 уровней обхода:
Layer 1 - прямой GET с TLS impersonate (Chrome 124 / Firefox 115) + proxy rotation
Layer 2 - check.js solver: GET check.ddos-guard.net/check.js, парсинг new Image().src, валидация, целевой запрос
Layer 3 - ddgu endpoint handshake: /g - /c - POST /ddgu/ с base64-параметрами
Layer 4 - advanced multi-step: комбинация всех методов в правильной последовательности
Layer 5 - ML/behavioural bypass (2026): эмуляция естественного поведения с задержками и referer chain
Layer 6 - brute force: перебор всех методов с разными прокси и TLS профилями

Возможности:
TLS Fingerprint Spoof (2 профиля)
HTTP/HTTPS/SOCKS4/SOCKS5 прокси с аутентификацией
Cookie caching (20 минут)
WAF bypass заголовки (X-Forwarded-For, Via, Cache)
User-Agent rotation (5 вариантов)
Challenge detection (ddosguard, captcha, blank, redirect)
Cookie validation (проверка перед возвратом)
