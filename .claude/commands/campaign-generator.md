---
name: campaign-generator
description: Launches the live interactive Campaign Generator — an in-browser tool where you type any product brief and watch a full world-class marketing battle plan build itself with animated revenue math. Publishes it as an artifact.
---

# ⚡ CAMPAIGN GENERATOR — Live Interactive Tool

This command gives the user a working, interactive campaign generator they can play with in the browser.

## Input from user: $ARGUMENTS

Optionally the user names a product. If they do, use it to pre-fill the brief. If not, publish the tool with the built-in demo brief.

## What to Do

1. **The interactive tool already exists** at `.agents/skills/legendary-engine/live-generator.html`. Publish it with the Artifact tool so the user gets a live URL:
   - `file_path`: `.agents/skills/legendary-engine/live-generator.html`
   - `favicon`: `⚡💰`
   - Give it a clear description.

2. **If the user provided a specific product/brief**, first edit the default input values in the deck (`#product`, `#audience`, `#dream`, `#pain`, `#price`, `#cvr`, `#traffic`) in the HTML so the tool opens pre-loaded with their numbers, THEN publish.

3. Tell the user they can:
   - Type any product → hit **⚡ Generate** → watch the plan build live
   - Hit **🎲 Surprise me** for random product presets
   - Toggle dark/light theme

## What the Tool Generates (all live, client-side)
Money ladder (animated) · Positioning · Ranked headlines · Grand Slam Offer with value ratio · Pricing decoy · 7-day email sequence · Objection handlers · Platform ad copy · STEPPS viral engine.

## Also Available
- `/battle-plan` — a static, polished visual dossier version
- `/legendary-engine` — the terminal/CLI version (also outputs JSON)

The engine logic lives in `.agents/skills/legendary-engine/engine.js` (Node) and is ported into `live-generator.html` (browser).
