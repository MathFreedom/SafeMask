
## SafeMask — Local PII & Secrets Anonymizer for the Chrome Built‑in AI Challenge 2025

### Why SafeMask
Every day, sensitive snippets leave companies before anyone notices: names in a support ticket, IBANs in a sales email, API keys pasted into a chat box, or legal drafts shared with AI tools. In highly regulated industries (finance, healthcare, public sector), many organizations restrict or even block GenAI usage on corporate devices to prevent data leakage.

SafeMask solves this, locally. It anonymizes your text on the device, before you share it and lets you de‑anonymize later when you need to. No servers. No logs. No network dependency.

### What SafeMask does (in one line)
Paste. Anonymize. Share. Copy back. De‑anonymize when needed, all locally.

**Demo video:**
 https://www.youtube.com/watch?v=nW7QPgtpqM8


### Key Benefits
- Privacy by design: 100% on‑device processing. Your content never leaves the browser.
- Business‑ready: Reduce data‑leak risk without blocking productivity; works on any website, editor, or form field.
- Reversible when allowed: Deterministic tokens like EMAIL_8A1B2C enable safe collaboration and accurate traceability.
- International: Detects PII and secrets across regions (emails, phones, addresses, IBAN/BIC, VAT, credit cards, API keys, tokens, business IDs…).
- Ultra‑fast UX: A floating button, 3 clicks, and you’re done. Diff view makes changes obvious and trustworthy.

### How it feels to use
1) Click the SafeMask button (bottom‑right) → paste your text into “Original”.
2) Press “Anonymize” → SafeMask highlights and replaces sensitive items per policy (Ignore, Pseudo, Redact).
3) Copy and share safely. 
4) Need the original? Paste the anonymized text into “Anonymized”, click “De‑anonymize”.

### What’s inside (for business users)
- Floating, non‑intrusive UI: Tabs for Original / Anonymized / Diff / Settings.
- Detection Categories with simple policies:
  - Ignore (don’t touch)
  - Pseudo (reversible token: TYPE_XXXXXXXX)
  - Redact (irreversible mask)
- Ready‑made profiles: Legal, Sales, Dev : switch policies with one click.
- Diff view: visual side‑by‑side changes so reviewers trust the output.
- Local encrypted mapping: token ↔ original pairs are stored locally and exportable/importable as a `.safemap` file.
- Keyboard shortcuts and context menu: anonymize or de‑anonymize selections quickly.

### Powered by Chrome’s Built‑in AI (local)
SafeMask takes advantage of Chrome’s on‑device AI to enhance detection and usability, still fully local:
- Prompt API: refines detection spans per category (PII, financial IDs, secrets) with structured outputs.
- Proofreader API: cleans up text after anonymization while freezing tokens.
- Summarizer API: produces short insights to speed up reviews.
- Rewriter API: optional clarity improvements without touching tokens.



### How SafeMask meets judging criteria
- Functionality
  - Scales across regions and use cases (Legal, Sales, Dev), with international detection and policy profiles.
  - Built‑in AI APIs are used meaningfully (Prompt, Proofreader, Summarizer, Rewriter) and run locally.
  - Works everywhere users type: web apps, forms, email, docs : no integration required.
- Purpose
  - Removes the main blocker to AI‑assisted work: the fear of leaking sensitive data.
  - Unlocks a previously impractical workflow: on‑device, reversible anonymization that’s fast and trustworthy.
- Content
  - Clean, modern UI with a floating action button and a focused, distraction‑free panel.
  - Visual diff and succinct insights improve comprehension and confidence.
- User Experience
  - Paste → Anonymize → Copy: intuitive in seconds. One‑click copy and keyboard shortcuts accelerate everyday tasks.
  - Detection policies are simple (Ignore, Pseudo, Redact), with profiles for zero‑setup usage.
- Technological Execution
  - Showcases multiple Chrome Built‑in AI APIs entirely on device; provides robust fallbacks.
  - Privacy‑by‑design architecture with local encrypted mapping and no network dependency.

### Who SafeMask is for
- Legal teams anonymizing drafts, contracts, and case notes.
- Sales/Support anonymizing transcripts and CRM updates.
- Developers/DevOps removing secrets from logs, issue tickets, and bug reports.
- Any enterprise aiming to enable GenAI adoption without compromising data protection.

### Try it in 30 seconds (judges)
1) Open Chrome → `chrome://extensions` → Developer mode.
2) “Load unpacked” → select the `safemask` folder.
3) Visit any page → click the SafeMask button (bottom‑right) → paste text → Anonymize.

### Why now
AI is moving from the cloud to the client. With Chrome’s Built‑in AI, enterprises can finally combine productivity and privacy. SafeMask gives teams a safe, familiar way to work with text on any site without sending sensitive data anywhere.




