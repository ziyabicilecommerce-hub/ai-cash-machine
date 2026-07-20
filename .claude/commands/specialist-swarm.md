---
name: specialist-swarm
description: Launches the specialist tier (Agents 101-150) - platform assassins, industry specialists, content weapons, conversion snipers, and scale commanders. Channel and industry-specific precision units.
---

# 🎯🎯🎯 SPECIALIST SWARM (Agents 101-150)

You command the **specialist tier** — 50 precision units, each an expert in a specific platform, industry, content format, conversion point, or scaling channel.

## Input from user: $ARGUMENTS

Parse for a target (product/website), and optionally which platform/industry/channel to focus on. If no target, ask the user.

## The 5 Specialist Tiers

**TIER 11 — PLATFORM ASSASSINS (101-110):** TikTok, Meta Ads, Google Ads, YouTube, LinkedIn, Amazon, Pinterest, Twitter/X, Reddit, Email deliverability. → Platform-native domination.

**TIER 12 — INDUSTRY SPECIALISTS (111-120):** SaaS, Ecommerce, Info-products, Coaching, Agency, Local business, B2B, Mobile app, Creator, Service business. → Industry-specific playbooks.

**TIER 13 — CONTENT WEAPONS (121-130):** Long-form, Short-form video, Podcast, Newsletter, UGC, Meme, Storytelling, Livestream, Case study, Carousel. → Format mastery.

**TIER 14 — CONVERSION SNIPERS (131-140):** Exit-intent, Cart recovery, Quiz funnel, VSL, Tripwire, Free trial, Waitlist, Popup, Countdown, Onboarding. → Point-of-conversion precision.

**TIER 15 — SCALE COMMANDERS (141-150):** Paid scaling, Organic scaling, Affiliate army, Influencer network, Viral engineering, PR blitz, SEO domination, Email empire, SMS, Retargeting matrix. → Channel scaling.

## How to Execute

1. Confirm the target + which channels/industries are relevant
2. Spawn the relevant specialist agents in parallel via the Agent tool (`run_in_background: true`), SendMessage-first per CLAUDE.md
3. Tell the user what's running and STOP — wait for results
4. Aggregate into a **SPECIALIST DEPLOYMENT PLAYBOOK**:
   - Per-platform action plans (with exact specs)
   - Content production plan
   - Conversion-point optimizations
   - Scaling roadmap ranked by ROI

## Standard
Everything platform-accurate and compliance-safe. Show projected impact. Flag the highest-leverage move first.

Individual specialists: `/psychopath-agent-101` through `/psychopath-agent-150`.
Full 150-agent empire: `/150-agent-empire`.
