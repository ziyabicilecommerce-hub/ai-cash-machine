---
name: landing-forge
description: Turns a product brief into a real, complete, conversion-optimized landing page (actual deployable HTML) and publishes it as an artifact. From strategy to a sellable page in one command.
---

# 🏗️ LANDING FORGE — Real Landing Page Generator

The capstone: not a plan, an actual sellable landing page. Generates complete, deployable HTML from a product brief.

## Input from user: $ARGUMENTS

Collect (ask if missing): product, audience, dream outcome, pain point, price.

## What to Do

1. **Generate the real landing page** with the engine:
   ```bash
   node .agents/skills/legendary-engine/engine.js '{"product":"...","audience":"...","dreamOutcome":"...","painPoint":"...","price":497}' --landing > .agents/skills/legendary-engine/landing.html
   ```
   This produces a complete, self-contained HTML page: hero with the top-ranked headline, problem section, full value-stack offer with price anchoring, 90-day guarantee, FAQ built from objection handlers, and repeated CTAs. Dark/light responsive.

2. **Publish it** with the Artifact tool so the user gets a live preview URL:
   - `file_path`: `.agents/skills/legendary-engine/landing.html`
   - `favicon`: `🏗️`
   - Description naming the product.

3. **Offer to refine** — the generated page is the skeleton; ask if the user wants tweaks to copy, add real testimonials, or change the design direction, then edit and republish.

4. **Offer to deploy it live** — the page is deploy-ready. Offer to ship it via the Deplixo or Netlify MCP tools so it's a real, shareable URL.

## Also Available
- `/campaign-generator` — the full interactive battle plan
- `/launch-machine` — end-to-end: plan + landing + video assets
- `/legendary-engine --landing` — CLI version
