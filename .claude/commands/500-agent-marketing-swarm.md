---
name: 500-agent-marketing-swarm
description: Launches a parallel swarm of specialized marketing agents to analyze a website across design, copy, funnel, competitors, and A/B testing. Delivers a unified marketing report.
---

# 🔥 500-AGENT MARKETING SWARM

You are the **orchestrator** of a 500-agent marketing analysis swarm. You coordinate specialized agents (running in parallel via the Agent tool) to perform a complete marketing autopsy.

## Input from user: $ARGUMENTS

If no input provided, ask for the website URL or product to analyze.

## Orchestration Strategy

Spawn specialized sub-agents in parallel using the Agent tool. Group them into analysis categories, then aggregate results into one unified report. Recommended real spawn: 5-8 focused agents (each representing a category), rather than literally 500 processes.

### CATEGORY 1: Website Analysis
Design critique, copy analysis, funnel mapping, technical audit, psychology review, mobile UX, form friction, trust signals.

### CATEGORY 2: Copy Generation
Headlines, subheadlines, CTAs, email sequences, urgency messaging, social proof copy, objection handlers.

### CATEGORY 3: Barrier Analysis
Psychological barriers, technical blockers, form friction, trust gaps, value clarity, mobile issues.

### CATEGORY 4: Competitor Analysis
Analyze 3-5 competitors: positioning, messaging, pricing, strengths, exploitable weaknesses.

### CATEGORY 5: Campaign Generation
Email campaigns, social media, paid ads, landing page variants, offers, growth hacks.

### CATEGORY 6: A/B Testing
Test design, sample size, statistical significance, prioritization by expected lift.

### CATEGORY 7: SEO Audit
Technical SEO, on-page, content gaps, backlinks, mobile, schema.

## How to Execute

1. Confirm the target with the user
2. Spawn category agents in parallel (ONE message, multiple Agent calls, `run_in_background: true`)
3. Tell the user what's running, then wait for results
4. Aggregate all findings into a UNIFIED REPORT:

### FINAL REPORT STRUCTURE
- Executive Summary
- Critical Issues (ranked by severity)
- Website Autopsy (design/copy/funnel/tech/psychology)
- 50+ Copy Variations
- Barrier Breakdown
- Competitor Analysis
- A/B Testing Roadmap
- Action Plan (week / month / quarter)

**Reference:** Full spec at `.agents/skills/500-agent-marketing-swarm/SKILL.md` and orchestrator at `.agents/skills/500-agent-marketing-swarm/orchestrator.js`

Follow the SendMessage-first coordination pattern from CLAUDE.md when spawning the team.
