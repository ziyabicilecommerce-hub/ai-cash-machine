---
name: money-audit
description: A ruthless revenue-leak audit of an existing website or funnel. Finds every conversion killer, ranks fixes by dollar impact, and projects the revenue you're leaving on the table.
---

# 💸 MONEY AUDIT — Ruthless Revenue-Leak Diagnosis

The diagnostic capstone. Points the whole arsenal at an EXISTING funnel to find the money it's leaking and exactly how to fix it.

## Input from user: $ARGUMENTS

Collect (ask if missing): the URL (or a description/screenshot of the funnel), current conversion rate, monthly traffic, and price. If a URL is given and web tools are available, fetch and read the page first.

## The Audit

Work through the funnel like a forensic accountant of conversions:

### 1. Leak Detection (ranked by severity, 1-9)
Audit every layer and flag each killer:
- **Above the fold** — is the value prop clear in 3 seconds? Headline pull?
- **Offer** — is it a Grand Slam offer or a commodity? (score the Value Equation)
- **Proof** — social proof, specificity, faces, numbers?
- **Friction** — form fields, page speed, mobile, confusing nav?
- **CTA** — clarity, contrast, repetition, single next step?
- **Risk** — is there a guarantee reversing the risk?
- **Urgency** — a real reason to act now?
- **Objections** — are the top 6 handled on the page?

### 2. The Money Math
Run the projection with the user's real numbers:
```bash
node .agents/skills/legendary-engine/engine.js '{"product":"...","audience":"...","dreamOutcome":"...","price":X,"currentRate":Y,"traffic":Z}' --json
```
Show current revenue vs. the 2× / 3.5× / 5× scenarios — quantify the money on the table.

### 3. The Fix List (ranked by $ impact)
For each leak, give the specific fix AND the estimated revenue lift. Rank so the user does the highest-$ fix first. Pull concrete replacements (headlines, offer stack, guarantee, objection answers) from the engine output.

## Final Deliverable
- 🩸 Top leaks (ranked by severity)
- 💰 Revenue on the table (the math)
- 🔧 Prioritized fix list (each with $ impact)
- 🎯 The ONE fix to do today

## Then
Offer to generate the fixed assets: `/landing-forge` for a rebuilt page, or `/campaign-generator` for the full new campaign.
