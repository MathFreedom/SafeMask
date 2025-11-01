// Anonymization engine: redact & pseudo using Vault, with overlap resolution

import { TYPES, detectAll, resolveOverlaps } from './detectors.js';

const RED_MASKS = {
  [TYPES.EMAIL]: (v) => {
    const parts = String(v).split('@');
    if (parts.length === 2) return '***@***.***';
    return '[REDACTED:EMAIL]';
  },
  [TYPES.PHONE]: () => '[REDACTED:PHONE]',
  [TYPES.ADDRESS]: () => '[REDACTED:ADDRESS]',
  [TYPES.CREDIT_CARD]: () => '[REDACTED:CREDIT_CARD]',
  [TYPES.IBAN]: () => '[REDACTED:IBAN]',
  [TYPES.RIB]: () => '[REDACTED:RIB]',
  [TYPES.BIC]: () => '[REDACTED:BIC]',
  [TYPES.SIREN]: () => '[REDACTED:SIREN]',
  [TYPES.SIRET]: () => '[REDACTED:SIRET]',
  [TYPES.VAT]: () => '[REDACTED:VAT]',
  [TYPES.API_KEY]: () => '[REDACTED:API_KEY]',
  [TYPES.TOKEN]: () => '[REDACTED:TOKEN]',
  [TYPES.FULL_NAME]: () => '[REDACTED:NAME]',
  [TYPES.ORGANIZATION]: () => '[REDACTED:ORG]',
  [TYPES.OTHER]: () => '[REDACTED]'
};

const TYPE_ORDER = Object.values(TYPES);

function modeFor(type, settings) {
  const m = settings?.modes?.[type];
  return m || 'ignore';
}

export async function anonymizeText(text, settings, vault) {
  const matches = detectAll(text, settings);
  const filtered = matches.filter((m) => modeFor(m.type, settings) !== 'ignore');
  const resolved = resolveOverlaps(filtered);
  let cursor = 0;
  let out = '';
  const replacements = [];
  for (const m of resolved) {
    out += text.slice(cursor, m.start);
    const mode = modeFor(m.type, settings);
    let replacement = text.slice(m.start, m.end);
    if (mode === 'redact') {
      const fn = RED_MASKS[m.type] || (() => '[REDACTED]');
      replacement = fn(m.value);
    } else if (mode === 'pseudo') {
      const token = await vault.computeToken(m.type, m.value);
      await vault.putToken(token, m.value);
      replacement = token;
      replacements.push({ type: m.type, value: m.value, token });
    }
    out += replacement;
    cursor = m.end;
  }
  out += text.slice(cursor);
  return { text: out, replacements, matches: resolved };
}

export async function deanonymizeText(text, vault) {
  if (!vault?.isUnlocked?.()) return text;
  const tokenRe = /\b([A-Z_]+_[0-9A-F]{8})\b/g;
  return text.replace(tokenRe, (m, token) => {
    const orig = vault.getOriginal(token);
    return orig || m;
  });
}

export async function anonymizeTextSmart(text, settings, vault, ai) {
  // 1) Baseline regex/validator detection
  const base = detectAll(text, settings);
  // 2) AI refinement (Prompt API) – mandatory path
  let refined = base;
  try { if (ai?.refineDetectionsPrompt) refined = await ai.refineDetectionsPrompt(text, base); } catch (_) {}
  // 3) Filter modes and resolve overlaps
  const filtered = refined.filter((m) => (settings?.modes?.[m.type] || 'ignore') !== 'ignore');
  const resolved = resolveOverlaps(filtered);
  // 4) Apply
  let cursor = 0; let out = ''; const replacements = [];
  for (const m of resolved) {
    out += text.slice(cursor, m.start);
    const mode = (settings?.modes?.[m.type] || 'ignore');
    let replacement = text.slice(m.start, m.end);
    if (mode === 'redact') {
      const fn = RED_MASKS[m.type] || (() => '[REDACTED]');
      replacement = fn(m.value);
    } else if (mode === 'pseudo') {
      const token = await vault.computeToken(m.type, m.value);
      await vault.putToken(token, m.value);
      replacement = token; replacements.push({ type: m.type, value: m.value, token });
    }
    out += replacement; cursor = m.end;
  }
  out += text.slice(cursor);
  return { text: out, replacements, matches: resolved };
}


