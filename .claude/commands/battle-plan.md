---
name: battle-plan
description: Generates a polished visual campaign battle-plan dossier for a product — positioning, offer, headlines, pricing, email sequence, objections, ads, and revenue math — and publishes it as an artifact.
---

# 💰 BATTLE PLAN — Visual Campaign Dossier

Produces a polished, shareable visual strategy dossier for a product.

## Input from user: $ARGUMENTS

Collect (ask if missing): product, audience, dream outcome, pain point, price, current CVR (%), monthly traffic.

## What to Do

1. **Run the engine** to generate real data with the user's brief:
   ```bash
   node .agents/skills/legendary-engine/engine.js '{"product":"...","audience":"...","dreamOutcome":"...","painPoint":"...","price":497,"currentRate":0.008,"traffic":12000}' --json
   ```
2. **Update the dossier** `.agents/skills/legendary-engine/battle-plan.html` with the generated values (headlines, offer ledger, money-ladder numbers, pricing, email sequence, objections, ads, viral concepts).
3. **Publish it** with the Artifact tool:
   - `file_path`: `.agents/skills/legendary-engine/battle-plan.html`
   - `favicon`: `💰`
   - Clear description naming the product.
4. Share the URL and walk the user through the sections.

## The Dossier Contains
Money ladder · Positioning · Top headlines (ranked) · Grand Slam Offer with value ratio · Pricing architecture · 7-day launch sequence · Objection handlers · Ad copy by platform · Viral engine.

## Also Available
- `/campaign-generator` — the LIVE interactive version (type + generate in-browser)
- `/legendary-engine` — the terminal/CLI version
