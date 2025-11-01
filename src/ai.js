// Chrome Built-in AI integration for SafeMask
// - Prompt API: per-category detection with structured JSON output
// - Proofreader: grammar pass with token freeze/thaw
// - Summarizer: brief insights after anonymization
// - Rewriter/Translator: optional polishing (keeps tokens frozen)

import { TYPES, resolveOverlaps } from './detectors.js';

const TOKEN_RE = /\b([A-Z_]+_[0-9A-F]{8})\b/g;

function freezeTokens(text) {
  const tokens = [];
  const frozen = text.replace(TOKEN_RE, (_, t) => {
    const id = tokens.push(t) - 1; return `⟦T${id}⟧`;
  });
  return { frozen, tokens };
}

function thawTokens(text, tokens) {
  return text.replace(/⟦T(\d+)⟧/g, (_, i) => tokens[Number(i)] || _);
}

async function getTextSession() {
  if (!globalThis.ai || typeof globalThis.ai.createTextSession !== 'function') throw new Error('Prompt API unavailable');
  return await globalThis.ai.createTextSession({ temperature: 0.1, topK: 20 });
}

function chunkText(text, maxLen = 6000) {
  const chunks = [];
  for (let i = 0; i < text.length; i += maxLen) chunks.push({ start: i, text: text.slice(i, i + maxLen) });
  return chunks;
}

function safeJson(str) {
  try { return JSON.parse(str); } catch (_) {}
  try {
    const first = str.indexOf('{');
    const last = str.lastIndexOf('}');
    if (first >= 0 && last > first) return JSON.parse(str.slice(first, last + 1));
  } catch (_) {}
  return null;
}

const categorySpecs = [
  { type: TYPES.API_KEY, name: 'API Key', hint: 'OpenAI sk-..., GitHub PAT, GitLab, Slack xox*, Google API AIza..., AWS AKIA/ASIA..., Stripe sk_live_, SendGrid SG., etc. Prefer known prefixes; be conservative.' },
  { type: TYPES.TOKEN, name: 'Token', hint: 'Bearer tokens, JWT (three Base64url segments), generic opaque secrets.' },
  { type: TYPES.CREDIT_CARD, name: 'Credit Card', hint: '13-19 digits; must pass Luhn.' },
  { type: TYPES.IBAN, name: 'IBAN', hint: 'International bank account number; CC + checksum + BBAN, mod 97 = 1.' },
  { type: TYPES.RIB, name: 'RIB', hint: 'France-specific RIB (bank code, branch code, account, key). Only detect if present.' },
  { type: TYPES.BIC, name: 'BIC/SWIFT', hint: '8 or 11 chars: 4 bank, 2 country, 2 location, optional 3 branch.' },
  { type: TYPES.VAT, name: 'VAT Number', hint: 'International VAT/TIN with country code prefixes (EU formats like DE, IT, NL, etc.). Prefer valid country-specific structures where possible.'},
  { type: TYPES.SIREN, name: 'SIREN', hint: 'France-specific: 9 digits, Luhn.' },
  { type: TYPES.SIRET, name: 'SIRET', hint: 'France-specific: 14 digits, Luhn.' },
  { type: TYPES.EMAIL, name: 'Email', hint: 'user@domain.tld; typical email formats.' },
  { type: TYPES.PHONE, name: 'Phone', hint: 'International (E.164-friendly) numbers; 9–15 digits; context-aware separators.' },
  { type: TYPES.ADDRESS, name: 'Address', hint: 'International addresses; common street types (Street/St., Avenue/Ave., Blvd., Road/Rd., Rua, Via, Calle, Strasse/straße, etc.).' },
  { type: TYPES.ORGANIZATION, name: 'Organization', hint: 'Company or organisation names or departments. Depending on the context, it may be a person or a company.' },
  { type: TYPES.FULL_NAME, name: 'Full Name', hint: 'Likely human first + last names based on context; avoid organizations.' },
  { type: TYPES.OTHER, name: 'Other', hint: 'Other secrets like long hex/base64 keys that resemble credentials or tokens.' },
];

function detectionPrompt(typeSpec, text) {
  return `You are an information security detector. Identify all occurrences of ${typeSpec.name}.
Return ONLY strict JSON with the following shape:
{
  "matches": [ { "start": number, "end": number, "value": string } ]
}
Rules:
- Indices are JS string indices on the exact provided text (UTF-16 code units).
- ${typeSpec.hint}
- Avoid overlaps within this category; keep the longest/most precise span.
- Be conservative; minimize false positives.
- Do not include any commentary or code fences.

TEXT:
${text}`;
}

async function detectCategorySession(session, typeSpec, text, chunkStart) {
  const prompt = detectionPrompt(typeSpec, text);
  const out = await session.prompt(prompt);
  const json = safeJson(out);
  if (!json || !Array.isArray(json.matches)) return [];
  return json.matches
    .filter(m => Number.isFinite(m.start) && Number.isFinite(m.end) && m.end > m.start && typeof m.value === 'string')
    .map(m => ({ type: typeSpec.type, start: chunkStart + m.start, end: chunkStart + m.end, value: m.value }));
}

export async function refineDetectionsPrompt(text, baseMatches) {
  const session = await getTextSession();
  const chunks = chunkText(text);
  const found = [];
  for (const spec of categorySpecs) {
    for (const ch of chunks) {
      try {
        const items = await detectCategorySession(session, spec, ch.text, ch.start);
        for (const it of items) found.push(it);
      } catch (_) {}
    }
  }
  // Merge base and AI results; prefer AI but keep base when AI missed
  const all = [...found, ...baseMatches];
  // Dedup near-identical spans per type
  const seen = new Map();
  for (const m of all) {
    const key = `${m.type}:${m.start}:${m.end}`;
    if (!seen.has(key)) seen.set(key, m);
  }
  return resolveOverlaps(Array.from(seen.values()));
}

export async function proofreadFreezeThaw(text) {
  if (!globalThis.ai || typeof globalThis.ai.createProofreader !== 'function') return text;
  const pr = await globalThis.ai.createProofreader();
  const { frozen, tokens } = freezeTokens(text);
  const corrected = await pr.proofread(frozen);
  return thawTokens(corrected, tokens);
}

export async function summarize(text) {
  try {
    if (!globalThis.ai || typeof globalThis.ai.createSummarizer !== 'function') return '';
    const s = await globalThis.ai.createSummarizer({ type: 'keypoints' });
    return await s.summarize(text);
  } catch (_) { return ''; }
}

export async function rewriteFreezeThaw(text) {
  try {
    if (!globalThis.ai || typeof globalThis.ai.createRewriter !== 'function') return text;
    const rw = await globalThis.ai.createRewriter();
    const { frozen, tokens } = freezeTokens(text);
    const out = await rw.rewrite(frozen, { goal: 'Improve clarity and fluency without changing placeholders ⟦Tn⟧ or semantics.' });
    return thawTokens(out, tokens);
  } catch (_) { return text; }
}

export async function translateKeepLanguage(text) {
  // No-op translator placeholder; kept for future multi-lingual polishing without altering tokens
  return text;
}


