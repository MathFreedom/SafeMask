// Detection rules for PII, financial IDs, business IDs, and secrets

export const TYPES = {
  FULL_NAME: 'FULL_NAME',
  ORGANIZATION: 'ORGANIZATION',
  EMAIL: 'EMAIL',
  PHONE: 'PHONE',
  ADDRESS: 'ADDRESS',
  IBAN: 'IBAN',
  RIB: 'RIB',
  BIC: 'BIC',
  CREDIT_CARD: 'CREDIT_CARD',
  SIREN: 'SIREN',
  SIRET: 'SIRET',
  VAT: 'VAT',
  API_KEY: 'API_KEY',
  TOKEN: 'TOKEN',
  OTHER: 'OTHER'
};

export const PRIORITY = {
  [TYPES.API_KEY]: 100,
  [TYPES.TOKEN]: 100,
  [TYPES.CREDIT_CARD]: 90,
  [TYPES.IBAN]: 90,
  [TYPES.RIB]: 90,
  [TYPES.BIC]: 80,
  [TYPES.VAT]: 70,
  [TYPES.SIREN]: 70,
  [TYPES.SIRET]: 70,
  [TYPES.EMAIL]: 60,
  [TYPES.PHONE]: 60,
  [TYPES.ADDRESS]: 50,
  [TYPES.ORGANIZATION]: 40,
  [TYPES.FULL_NAME]: 30,
  [TYPES.OTHER]: 10
};

const luhnCheck = (numStr) => {
  const s = (numStr || '').replace(/\D+/g, '');
  let sum = 0, dbl = false;
  for (let i = s.length - 1; i >= 0; i--) {
    let d = parseInt(s[i], 10);
    if (dbl) { d *= 2; if (d > 9) d -= 9; }
    sum += d; dbl = !dbl;
  }
  return sum % 10 === 0;
};

const ibanCheck = (iban) => {
  const s = (iban || '').replace(/\s+/g, '').toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(s)) return false;
  const moved = s.slice(4) + s.slice(0, 4);
  const converted = moved.replace(/[A-Z]/g, (c) => (c.charCodeAt(0) - 55).toString());
  let remainder = 0;
  for (let i = 0; i < converted.length; i += 7) {
    const part = remainder.toString() + converted.substring(i, i + 7);
    remainder = parseInt(part, 10) % 97;
  }
  return remainder === 1;
};

const ribCheck = (s) => {
  const digits = (s || '').replace(/\s+/g, '');
  const m = digits.match(/^(\d{5})(\d{5})([A-Za-z0-9]{11})(\d{2})$/);
  if (!m) return false;
  const toNum = (str) => str.toUpperCase().replace(/[A-Z]/g, (c) => (c.charCodeAt(0) - 55).toString()).replace(/[^0-9]/g, '0');
  const base = toNum(m[1] + m[2] + m[3]);
  const key = parseInt(m[4], 10);
  const mod = 97 - (BigInt(base) % 97n);
  return Number(mod === BigInt(key));
};

const sirenCheck = (s) => {
  const n = (s || '').replace(/\D+/g, ''); if (n.length !== 9) return false; return luhnCheck(n);
};
const siretCheck = (s) => {
  const n = (s || '').replace(/\D+/g, ''); if (n.length !== 14) return false; return luhnCheck(n);
};

const frVatCheck = (s) => {
  const v = (s || '').toUpperCase().replace(/\s+/g, '');
  if (!/^FR[0-9A-Z]{2}\d{9}$/.test(v)) return false;
  // Approximation; full check depends on SIREN. Accept format.
  return true;
};

const makeMatch = (type, start, end, value) => ({ type, start, end, value });

function detectEmails(text) {
  const re = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
  const out = []; let m;
  while ((m = re.exec(text))) out.push(makeMatch(TYPES.EMAIL, m.index, m.index + m[0].length, m[0]));
  return out;
}

function detectPhones(text) {
  const re = /(?<!\w)(?:\+\d{1,3}[\s.-]?)?(?:\(?\d{1,4}\)?[\s.-]?){2,6}\d{2,4}(?!\w)/g;
  const out = []; let m;
  while ((m = re.exec(text))) {
    const digits = m[0].replace(/\D+/g, '');
    if (digits.length >= 9 && digits.length <= 15) out.push(makeMatch(TYPES.PHONE, m.index, m.index + m[0].length, m[0]));
  }
  return out;
}

function detectAddresses(text) {
  // Broad, international street type lexicon (not exhaustive; AI refines)
  const re = new RegExp(
    String.raw`\b\d{1,5}\s+(?:`
    + [
      'street', 'st\\.?', 'strasse', 'straße', 'str\\.?', 'avenue', 'ave\\.?', 'av\\.?',
      'boulevard', 'blvd\\.?', 'road', 'rd\\.?', 'route', 'chemin', 'rue', 'calle', 'carrer', 'via', 'rua',
      'place', 'plaza', 'piazza', 'platz', 'square', 'allee', 'allée', 'way', 'drive', 'dr\\.?', 'lane', 'ln\\.?',
      'court', 'ct\\.?', 'highway', 'hwy\\.?'
    ].join('|') +
    String.raw`)\s+[\\wÀ-ÿ'\-\.]+(?:\s+[\wÀ-ÿ'\-\.]+)*\b`, 'gi'
  );
  const out = []; let m;
  while ((m = re.exec(text))) out.push(makeMatch(TYPES.ADDRESS, m.index, m.index + m[0].length, m[0]));
  return out;
}

function detectFullNames(text) {
  const re = /\b([A-ZÉÈÀÂÎÏÔÛ][a-zàâçéèêëîïôûùüÿñæœ]+)\s+([A-ZÉÈÀÂÎÏÔÛ][a-zàâçéèêëîïôûùüÿñæœ]+)\b/g;
  const out = []; let m;
  while ((m = re.exec(text))) out.push(makeMatch(TYPES.FULL_NAME, m.index, m.index + m[0].length, m[0]));
  return out;
}

function detectOrganizations(text) {
  // International legal suffixes
  const re = new RegExp(
    String.raw`\b([\wÀ-ÿ'\-\.&,]+?)\s+(?:`
    + [
      'Inc\\.?', 'LLC', 'Ltd\\.?', 'Limited', 'PLC', 'GmbH', 'AG', 'BV', 'NV', 'AB', 'Oy', 'AS', 'A\\.S\\.?',
      'KK', 'K\\.K\\.?', 'Pty\\.?\s+Ltd\\.?', 'Pty', 'LLP', 'LP', 'Co\\.?', 'Company', 'Corp\\.?', 'Corporation',
      // Keep French too
      'SASU', 'SAS', 'SARL', 'EURL', 'SA', 'S\\.A\\.?', 'S\\.p\\.A\\.?', 'Srl', 'SL'
    ].join('|') + String.raw`)\b`, 'gi'
  );
  const out = []; let m;
  while ((m = re.exec(text))) out.push(makeMatch(TYPES.ORGANIZATION, m.index, m.index + m[0].length, m[0]));
  return out;
}

function detectIBANs(text) {
  const re = /\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b/g;
  const out = []; let m;
  while ((m = re.exec(text))) { if (ibanCheck(m[0])) out.push(makeMatch(TYPES.IBAN, m.index, m.index + m[0].length, m[0])); }
  return out;
}

function detectBIC(text) {
  const re = /\b[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}(?:[A-Z0-9]{3})?\b/g;
  const out = []; let m;
  while ((m = re.exec(text))) out.push(makeMatch(TYPES.BIC, m.index, m.index + m[0].length, m[0]));
  return out;
}

function detectCreditCards(text) {
  const re = /\b(?:\d[ -]?){13,19}\b/g;
  const out = []; let m;
  while ((m = re.exec(text))) { const digits = m[0].replace(/\D+/g,''); if (digits.length>=13 && digits.length<=19 && luhnCheck(digits)) out.push(makeMatch(TYPES.CREDIT_CARD, m.index, m.index + m[0].length, m[0])); }
  return out;
}

function detectSiren(text) {
  const re = /\b\d{9}\b/g; const out = []; let m; while ((m = re.exec(text))) { if (sirenCheck(m[0])) out.push(makeMatch(TYPES.SIREN, m.index, m.index + 9, m[0])); }
  return out;
}

function detectSiret(text) {
  const re = /\b\d{14}\b/g; const out = []; let m; while ((m = re.exec(text))) { if (siretCheck(m[0])) out.push(makeMatch(TYPES.SIRET, m.index, m.index + 14, m[0])); }
  return out;
}

function detectVat(text) {
  // Broad EU VAT formats (approximate). AI will refine.
  const re = new RegExp(
    String.raw`\b(?:`
    + [
      'ATU\d{8}', 'BE0?\d{9}', 'BG\d{9,10}', 'CY\d{8}[A-Z]', 'CZ\d{8,10}', 'DE\d{9}', 'DK\d{8}',
      'EE\d{9}', 'EL\d{9}', 'ES[A-Z0-9]\d{7}[A-Z0-9]', 'FI\d{8}', 'FR[0-9A-Z]{2}\d{9}', 'GB(?:\d{9}|\d{12}|GD\d{3}|HA\d{3})',
      'HR\d{11}', 'HU\d{8}', 'IE\d[A-Z0-9]\d{5}[A-Z]{1,2}', 'IT\d{11}', 'LT\d{9,12}', 'LU\d{8}', 'LV\d{11}', 'MT\d{8}',
      'NL\d{9}B\d{2}', 'PL\d{10}', 'PT\d{9}', 'RO\d{2,10}', 'SE\d{12}', 'SI\d{8}', 'SK\d{10}'
    ].join('|') + String.raw`)\b`, 'g'
  );
  const out = []; let m; while ((m = re.exec(text))) out.push(makeMatch(TYPES.VAT, m.index, m.index + m[0].length, m[0]));
  return out;
}

function detectRIB(text) {
  // Accept spaced form: 5 5 11 2
  const re = /\b\d{5}\s?\d{5}\s?[A-Za-z0-9]{11}\s?\d{2}\b/g; const out = []; let m; while ((m = re.exec(text))) { if (ribCheck(m[0].replace(/\s+/g, ''))) out.push(makeMatch(TYPES.RIB, m.index, m.index + m[0].length, m[0])); }
  return out;
}

function detectAPIKeys(text) {
  const out = [];
  const patterns = [
    { re: /\bsk-[A-Za-z0-9]{32,}\b/g, type: TYPES.API_KEY }, // OpenAI
    { re: /\bgithub_pat_[A-Za-z0-9_]{70,}\b/g, type: TYPES.API_KEY },
    { re: /\bgh[pousr]_[A-Za-z0-9]{36}\b/g, type: TYPES.API_KEY },
    { re: /\bglpat-[A-Za-z0-9_-]{20,}\b/g, type: TYPES.API_KEY },
    { re: /\bxox(?:a|b|p|s)-[A-Za-z0-9-]{10,}-[A-Za-z0-9-]{10,}(?:-[A-Za-z0-9-]{10,})?\b/g, type: TYPES.API_KEY },
    { re: /\bAKIA[0-9A-Z]{16}\b/g, type: TYPES.API_KEY }, // AWS Access Key ID
    { re: /\bASIA[0-9A-Z]{16}\b/g, type: TYPES.API_KEY }, // AWS temp
    { re: /\bAIza[0-9A-Za-z\-_]{35}\b/g, type: TYPES.API_KEY }, // Google API key
    { re: /\bsk_live_[0-9A-Za-z]{24,}\b/g, type: TYPES.API_KEY }, // Stripe live secret
    { re: /\bSG\.[A-Za-z0-9_\-]{22}\.[A-Za-z0-9_\-]{43}\b/g, type: TYPES.API_KEY }, // SendGrid
    { re: /\bBearer\s+[A-Za-z0-9\-._~+/]+=*\b/g, type: TYPES.TOKEN },
    { re: /\beyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*\b/g, type: TYPES.TOKEN } // JWT
  ];
  for (const { re, type } of patterns) {
    let m; while ((m = re.exec(text))) out.push(makeMatch(type, m.index, m.index + m[0].length, m[0]));
  }
  return out;
}

function detectOther(text) {
  const out = [];
  const reHex = /\b[a-fA-F0-9]{32,}\b/g; let m;
  while ((m = reHex.exec(text))) out.push(makeMatch(TYPES.OTHER, m.index, m.index + m[0].length, m[0]));
  const reB64 = /\b[A-Za-z0-9+/]{40,}=*\b/g;
  while ((m = reB64.exec(text))) out.push(makeMatch(TYPES.OTHER, m.index, m.index + m[0].length, m[0]));
  return out;
}

export function detectAll(text, settings) {
  const items = [];
  const push = (arr, key) => {
    // If settings ignore, still detect; we'll filter later by mode
    for (const it of arr) items.push(it);
  };
  push(detectAPIKeys(text));
  push(detectCreditCards(text));
  push(detectIBANs(text));
  push(detectRIB(text));
  push(detectBIC(text));
  push(detectVat(text));
  push(detectSiret(text));
  push(detectSiren(text));
  push(detectEmails(text));
  push(detectPhones(text));
  push(detectAddresses(text));
  push(detectOrganizations(text));
  push(detectFullNames(text));
  push(detectOther(text));
  return items;
}

export function resolveOverlaps(matches) {
  const used = [];
  const sorted = matches.slice().sort((a, b) => {
    const pa = (PRIORITY[a.type] || 0), pb = (PRIORITY[b.type] || 0);
    if (pa !== pb) return pb - pa; // desc priority
    const la = a.end - a.start, lb = b.end - b.start; return lb - la; // longer first
  });
  const out = [];
  for (const m of sorted) {
    if (used.some(u => !(m.end <= u.start || m.start >= u.end))) continue;
    used.push({ start: m.start, end: m.end });
    out.push(m);
  }
  return out.sort((a, b) => a.start - b.start);
}


