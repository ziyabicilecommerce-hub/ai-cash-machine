---
name: launch-machine
description: The ultimate one-command launch. From a single product brief → full campaign battle plan → real landing page → Higgsfield video/image assets. End to end, everything at once.
---

# 🚀 LAUNCH MACHINE — One Command, Full Launch

The final orchestrator. Takes a product from idea to launch-ready in one pass, combining every part of the arsenal.

## Input from user: $ARGUMENTS

Collect (ask if missing): product, audience, dream outcome, pain point, price, current CVR (%), monthly traffic.

## The Launch Sequence

Run these in order and present each result:

### 1. Strategy + Battle Plan
```bash
node .agents/skills/legendary-engine/engine.js '{"product":"...","audience":"...","dreamOutcome":"...","painPoint":"...","price":497,"currentRate":0.008,"traffic":12000}' --json
```
Show positioning, top headlines, Grand Slam Offer (value ratio), pricing, email sequence, sales letter, VSL, and conversion projections.

### 2. Live Interactive Tool
Publish `.agents/skills/legendary-engine/live-generator.html` via the Artifact tool (favicon `⚡💰`) so the user can tweak the brief live.

### 3. Real Landing Page
```bash
node .agents/skills/legendary-engine/engine.js '{...same brief...}' --landing > .agents/skills/legendary-engine/landing.html
```
Publish it as an artifact (favicon `🏗️`) — an actual sellable page.

### 4. Visual Assets (Higgsfield)
The plan's `higgsfield` section has ready prompts (hero image, hook videos, testimonial, urgency graphic). **Offer to actually generate** the hero image or a hook video via the Higgsfield MCP tools (`generate_image` / `generate_video`) — note it uses the user's Higgsfield credits, so confirm first.

## Final Deliverable
Summarize what was produced with all the URLs:
- 📊 Battle plan (strategy)
- ⚡ Live tool (URL)
- 🏗️ Landing page (URL)
- 🎬 Video assets (generated or prompts ready)
- 📈 Revenue projection (the money math)

Then recommend the single highest-leverage first move to deploy.

## Also Available
- `/arsenal` — the full command index
- `/campaign-generator` · `/battle-plan` · `/landing-forge` · `/legendary-council`
