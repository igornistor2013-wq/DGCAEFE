'use strict';
// Setarea „trust proxy” din Express: de la ce adrese se acceptă antetele X-Forwarded-For / X-Forwarded-Proto.
// Contează pentru două lucruri: cookie-ul de sesiune se marchează „Secure” doar dacă aplicația știe că vizitatorul
// folosește HTTPS, iar limitarea încercărilor de autentificare trebuie făcută pe adresa vizitatorului, nu a proxy-ului.
//
// Valori pentru TRUST_PROXY:
//   gol                  fără proxy (rulare locală)
//   1, 2, 3 ...          numărul de proxy-uri din fața aplicației (nginx, Caddy, Railway, Fly.io etc.)
//   render | cloudflare  găzduire în spatele Cloudflare (Render): se ignoră adresele interne și cele Cloudflare,
//                        iar adresa vizitatorului este prima adresă din dreapta care nu aparține lor
//   o listă de adrese    de ex. „loopback, 10.0.0.0/8”
//
// Intervalele Cloudflare: https://www.cloudflare.com/ips-v4 și https://www.cloudflare.com/ips-v6 (verificate în octombrie 2026).
// Se schimbă rar; dacă Cloudflare adaugă un interval nou, actualizați lista de mai jos.
const CLOUDFLARE = [
  '173.245.48.0/20',
  '103.21.244.0/22',
  '103.22.200.0/22',
  '103.31.4.0/22',
  '141.101.64.0/18',
  '108.162.192.0/18',
  '190.93.240.0/20',
  '188.114.96.0/20',
  '197.234.240.0/22',
  '198.41.128.0/17',
  '162.158.0.0/15',
  '104.16.0.0/13',
  '104.24.0.0/14',
  '172.64.0.0/13',
  '131.0.72.0/22',
  '2400:cb00::/32',
  '2606:4700::/32',
  '2803:f800::/32',
  '2405:b500::/32',
  '2405:8100::/32',
  '2a06:98c0::/29',
  '2c0f:f248::/32'
];

const INTERNAL = ['loopback', 'linklocal', 'uniquelocal'];

function trustProxySetting(value) {
  const v = String(value === undefined || value === null ? '' : value).trim();
  if (!v || v === '0' || v.toLowerCase() === 'false') return false;
  if (/^\d+$/.test(v)) return Number(v);
  if (v.toLowerCase() === 'true') return 1;
  if (/^(render|cloudflare)$/i.test(v)) return [...INTERNAL, ...CLOUDFLARE];
  return v;
}

module.exports = { trustProxySetting, CLOUDFLARE };
