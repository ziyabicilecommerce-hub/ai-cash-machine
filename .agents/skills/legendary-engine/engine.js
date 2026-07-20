#!/usr/bin/env node
'use strict';

/**
 * LEGENDARY ENGINE — real marketing generation, not prompts.
 * Implements the frameworks of agents 151-160 in code and produces
 * actual, usable marketing assets from a product brief.
 *
 * Usage:
 *   node engine.js '{"product":"...","audience":"...","dreamOutcome":"...","price":497,"painPoint":"...","currentRate":0.008,"traffic":10000}'
 *   node engine.js            # runs the built-in AI Cash Machine demo brief
 */

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------
const pick = (arr, i) => arr[i % arr.length];
const money = (n) => '$' + Number(n).toLocaleString('en-US');

function validateBrief(b) {
  if (!b || typeof b !== 'object') throw new Error('Brief must be an object');
  const required = ['product', 'audience', 'dreamOutcome', 'price'];
  for (const k of required) {
    if (b[k] === undefined || b[k] === null || b[k] === '') {
      throw new Error(`Missing required field: ${k}`);
    }
  }
  const price = Number(b.price);
  if (!Number.isFinite(price) || price <= 0) throw new Error('price must be a positive number');
  return {
    product: String(b.product),
    audience: String(b.audience),
    dreamOutcome: String(b.dreamOutcome),
    painPoint: String(b.painPoint || 'staying stuck where they are'),
    price,
    currentRate: Number.isFinite(Number(b.currentRate)) ? Number(b.currentRate) : 0.01,
    traffic: Number.isFinite(Number(b.traffic)) ? Number(b.traffic) : 10000,
  };
}

// ---------------------------------------------------------------------------
// 152 — Direct-Response Legend: headline generation (25, ranked)
// ---------------------------------------------------------------------------
function headlines(b) {
  const { dreamOutcome, audience, painPoint, product, price } = b;
  const templates = [
    { t: `How ${audience} Get ${dreamOutcome} — Without ${painPoint}`, angle: 'benefit + objection removal', score: 9.6 },
    { t: `The ${product} That Turns ${painPoint} Into ${dreamOutcome}`, angle: 'transformation', score: 9.4 },
    { t: `Give Me 20 Minutes And I'll Give You ${dreamOutcome}`, angle: 'time-bound promise', score: 9.3 },
    { t: `Warning: Don't Try To Get ${dreamOutcome} Until You Read This`, angle: 'pattern interrupt + curiosity', score: 9.5 },
    { t: `${audience}: Here's Exactly How To Get ${dreamOutcome} This Month`, angle: 'specific + direct call-out', score: 9.2 },
    { t: `They Laughed When I Promised ${dreamOutcome} — Until It Happened`, angle: 'story + social proof', score: 9.1 },
    { t: `The Ugly Truth About Why You Still Haven't Got ${dreamOutcome}`, angle: 'contrarian + curiosity gap', score: 9.0 },
    { t: `What If ${dreamOutcome} Was Actually The Easy Part?`, angle: 'reframe', score: 8.7 },
    { t: `${dreamOutcome} In 90 Days Or You Don't Pay`, angle: 'risk reversal in headline', score: 9.4 },
    { t: `The 1 Skill Separating ${audience} Who Win From Everyone Else`, angle: 'curiosity + status', score: 8.9 },
    { t: `Stop ${painPoint}. Start ${dreamOutcome}.`, angle: 'command + contrast', score: 8.8 },
    { t: `The Fastest Path From "${painPoint}" To "${dreamOutcome}"`, angle: 'before→after bridge', score: 9.0 },
    { t: `Finally: A ${product} Built For ${audience} Who Are Done Waiting`, angle: 'identity + urgency', score: 8.6 },
    { t: `Why ${audience} Fail At ${dreamOutcome} (And The 3-Step Fix)`, angle: 'problem + mechanism', score: 9.1 },
    { t: `${dreamOutcome}: The Boring, Repeatable System Nobody Talks About`, angle: 'anti-hype credibility', score: 8.8 },
    { t: `Read This If You've Ever Felt ${painPoint}`, angle: 'empathy hook', score: 8.5 },
    { t: `The ${product} 10,000 ${audience} Wish They'd Found Sooner`, angle: 'social proof + regret', score: 8.9 },
    { t: `Get ${dreamOutcome} While Everyone Else Is Still ${painPoint}`, angle: 'FOMO + status', score: 9.0 },
    { t: `I Reverse-Engineered ${dreamOutcome}. Here's The Blueprint.`, angle: 'authority + specificity', score: 9.2 },
    { t: `The ${price < 100 ? 'Tiny' : 'Small'} Investment That Ends ${painPoint} For Good`, angle: 'value framing', score: 8.7 },
    { t: `${audience}, This Is Your Unfair Advantage For ${dreamOutcome}`, angle: 'identity + edge', score: 8.8 },
    { t: `From ${painPoint} To ${dreamOutcome} — My Exact Playbook`, angle: 'transformation + proof', score: 9.1 },
    { t: `The Real Reason You're Still ${painPoint} (It's Not What You Think)`, angle: 'curiosity + reframe', score: 9.0 },
    { t: `Everything You Were Told About ${dreamOutcome} Is Wrong`, angle: 'contrarian bomb', score: 8.9 },
    { t: `Do This Today And ${dreamOutcome} Becomes Inevitable`, angle: 'action + certainty', score: 9.0 },
  ];
  return templates.sort((a, b2) => b2.score - a.score);
}

// ---------------------------------------------------------------------------
// 151 — Offer Architect: Grand Slam Offer via the Value Equation
// ---------------------------------------------------------------------------
function grandSlamOffer(b) {
  const { product, dreamOutcome, audience, painPoint, price } = b;
  const core = { name: product, value: price * 5 };
  const bonuses = [
    { name: `The ${dreamOutcome} Quick-Start (get first win in 48h)`, value: Math.round(price * 1.5), kills: 'time-delay objection' },
    { name: `Done-For-You Templates & Swipe Files`, value: Math.round(price * 2), kills: 'effort objection' },
    { name: `Private Community + Weekly Live Q&A`, value: Math.round(price * 3), kills: '"what if I get stuck" objection' },
    { name: `The Anti-${painPoint} Troubleshooting Vault`, value: Math.round(price * 1.2), kills: 'fear-of-failure objection' },
    { name: `Case-Study Library: ${audience} Who Did It`, value: Math.round(price * 1), kills: '"will it work for me" objection' },
  ];
  const stackValue = core.value + bonuses.reduce((s, x) => s + x.value, 0);
  const guarantees = [
    { type: 'Unconditional', text: `30 days, full refund, no questions — try it risk-free.` },
    { type: 'Conditional (better-than-money-back)', text: `Follow the plan for 90 days; if you don't reach ${dreamOutcome}, we work with you free until you do.` },
    { type: 'Anti-guarantee framing', text: `If you're the type to buy and not do the work, please don't buy — this is for ${audience} who act.` },
  ];
  const names = [
    `The ${dreamOutcome} Accelerator`,
    `${product}: 90-Day ${dreamOutcome} System`,
    `The Anti-${painPoint} Blueprint`,
    `${dreamOutcome} On Autopilot`,
    `The ${audience} Fast-Track`,
  ];
  return { core, bonuses, stackValue, price, ratio: (stackValue / price).toFixed(1), guarantees, names };
}

// ---------------------------------------------------------------------------
// 154 — Funnel Story Master: value ladder + email sequence
// ---------------------------------------------------------------------------
function valueLadder(b) {
  const { price, dreamOutcome, product } = b;
  return [
    { rung: 'Bait (free)', offer: `Free guide: "3 Moves To ${dreamOutcome}"`, price: 0 },
    { rung: 'Frontend (tripwire)', offer: `${product} mini-course`, price: Math.max(7, Math.round(price * 0.05)) },
    { rung: 'Core offer', offer: `${product} (full)`, price },
    { rung: 'Backend (high-ticket)', offer: `1:1 ${dreamOutcome} coaching`, price: price * 10 },
    { rung: 'Continuity', offer: `Membership / ongoing support`, price: Math.round(price * 0.1) + '/mo' },
  ];
}

function emailSequence(b) {
  const { dreamOutcome, painPoint, product, audience } = b;
  return [
    { day: 0, subject: `Your "${dreamOutcome}" starts now`, goal: 'Deliver lead magnet + set the epiphany', hook: 'Welcome + the one belief that changes everything' },
    { day: 1, subject: `The real reason you're still ${painPoint}`, goal: 'Break false belief #1 (the vehicle)', hook: 'Epiphany Bridge story' },
    { day: 2, subject: `"But will it work for ME?"`, goal: 'Break false belief #2 (themselves)', hook: 'Case study of a similar ' + audience },
    { day: 3, subject: `What's really stopping you`, goal: 'Break false belief #3 (external)', hook: 'Reframe the excuse' },
    { day: 4, subject: `Introducing ${product}`, goal: 'Present the Grand Slam Offer', hook: 'Full value stack + guarantee' },
    { day: 5, subject: `The bonuses disappear at midnight`, goal: 'Urgency (real deadline)', hook: 'Scarcity + recap' },
    { day: 6, subject: `Last chance for ${dreamOutcome}`, goal: 'Close + loss-aversion', hook: 'What they lose by not acting' },
  ];
}

// ---------------------------------------------------------------------------
// 158 — Viral Growth Scientist: STEPPS concepts
// ---------------------------------------------------------------------------
function viralConcepts(b) {
  const { dreamOutcome, audience, painPoint } = b;
  return [
    { concept: `Shareable stat card: "% of ${audience} never reach ${dreamOutcome} — here's why"`, drivers: ['Social currency', 'Practical value'] },
    { concept: `A daily-life trigger phrase tying a common moment to ${dreamOutcome}`, drivers: ['Triggers'] },
    { concept: `Awe-driven transformation reel: ${painPoint} → ${dreamOutcome} in 30s`, drivers: ['Emotion (awe)', 'Stories'] },
    { concept: `Public badge/streak members show off`, drivers: ['Public', 'Social currency'] },
    { concept: `The "one number" challenge people screenshot and share`, drivers: ['Practical value', 'Public'] },
  ];
}

// ---------------------------------------------------------------------------
// 156/160 — Conversion math + projected impact
// ---------------------------------------------------------------------------
function conversionMath(b) {
  const { currentRate, traffic, price } = b;
  const targets = [currentRate * 2, currentRate * 3.5, currentRate * 5];
  const current = { rate: currentRate, sales: Math.round(traffic * currentRate), revenue: Math.round(traffic * currentRate * price) };
  const projections = targets.map((r, i) => ({
    scenario: ['Conservative (2x)', 'Realistic (3.5x)', 'Aggressive (5x)'][i],
    rate: +(r).toFixed(4),
    sales: Math.round(traffic * r),
    revenue: Math.round(traffic * r * price),
    lift: money(Math.round(traffic * r * price - current.revenue)),
  }));
  return { current, projections };
}

// ---------------------------------------------------------------------------
// Orchestration — the Grand Master battle plan
// ---------------------------------------------------------------------------
function battlePlan(brief) {
  const b = validateBrief(brief);
  return {
    brief: b,
    positioning: {
      oneWord: `the ${b.dreamOutcome}-in-90-days ${b.product}`,
      statement: `For ${b.audience}, ${b.product} is the system that delivers ${b.dreamOutcome} without ${b.painPoint} — unlike generic alternatives that just add information overload.`,
    },
    headlines: headlines(b),
    offer: grandSlamOffer(b),
    valueLadder: valueLadder(b),
    emailSequence: emailSequence(b),
    viral: viralConcepts(b),
    math: conversionMath(b),
  };
}

// ---------------------------------------------------------------------------
// Pretty printer
// ---------------------------------------------------------------------------
function render(plan) {
  const b = plan.brief;
  const L = [];
  L.push('═'.repeat(70));
  L.push('  👑 LEGENDARY ENGINE — WORLD-CLASS MARKETING BATTLE PLAN');
  L.push('═'.repeat(70));
  L.push(`  Product : ${b.product}`);
  L.push(`  Audience: ${b.audience}`);
  L.push(`  Dream   : ${b.dreamOutcome}   |   Price: ${money(b.price)}`);
  L.push('');
  L.push('🧭 POSITIONING (Agent 157)');
  L.push('   Own the word: ' + plan.positioning.oneWord);
  L.push('   ' + plan.positioning.statement);
  L.push('');
  L.push('✍️  TOP 10 HEADLINES (Agent 152, ranked by pull)');
  plan.headlines.slice(0, 10).forEach((h, i) =>
    L.push(`   ${String(i + 1).padStart(2)}. [${h.score}] ${h.t}  — ${h.angle}`));
  L.push('');
  L.push('🏆 GRAND SLAM OFFER (Agent 151)');
  L.push(`   Core: ${plan.offer.core.name}  (value ${money(plan.offer.core.value)})`);
  plan.offer.bonuses.forEach((x) =>
    L.push(`   + Bonus: ${x.name}  (${money(x.value)}) — kills ${x.kills}`));
  L.push(`   ── Total stack value: ${money(plan.offer.stackValue)}  →  Price ${money(plan.offer.price)}  (${plan.offer.ratio}x value)`);
  L.push('   Guarantees:');
  plan.offer.guarantees.forEach((g) => L.push(`     • ${g.type}: ${g.text}`));
  L.push('   Offer names: ' + plan.offer.names.join(' | '));
  L.push('');
  L.push('🎬 VALUE LADDER (Agent 154)');
  plan.valueLadder.forEach((r) =>
    L.push(`   ${r.rung.padEnd(24)} ${typeof r.price === 'number' ? money(r.price) : r.price}  — ${r.offer}`));
  L.push('');
  L.push('📧 7-EMAIL LAUNCH SEQUENCE (Agent 154)');
  plan.emailSequence.forEach((e) =>
    L.push(`   Day ${e.day}: "${e.subject}"  — ${e.goal}`));
  L.push('');
  L.push('🦠 VIRAL CONCEPTS (Agent 158, STEPPS)');
  plan.viral.forEach((v) => L.push(`   • ${v.concept}  [${v.drivers.join(', ')}]`));
  L.push('');
  L.push('📊 CONVERSION MATH (Agent 160)');
  const m = plan.math;
  L.push(`   Now: ${(m.current.rate * 100).toFixed(2)}%  →  ${m.current.sales} sales  →  ${money(m.current.revenue)}`);
  m.projections.forEach((p) =>
    L.push(`   ${p.scenario.padEnd(20)} ${(p.rate * 100).toFixed(2)}%  →  ${p.sales} sales  →  ${money(p.revenue)}  (+${p.lift})`));
  L.push('');
  L.push('═'.repeat(70));
  return L.join('\n');
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------
const DEMO_BRIEF = {
  product: 'AI Cash Machine',
  audience: 'solo founders and side-hustlers',
  dreamOutcome: 'a profitable automated income stream',
  painPoint: 'trading time for money',
  price: 497,
  currentRate: 0.008,
  traffic: 12000,
};

module.exports = { battlePlan, render, validateBrief, headlines, grandSlamOffer, conversionMath };

if (require.main === module) {
  let brief = DEMO_BRIEF;
  const arg = process.argv[2];
  if (arg) {
    try { brief = JSON.parse(arg); }
    catch (e) { console.error('Invalid JSON brief:', e.message); process.exit(1); }
  }
  try {
    console.log(render(battlePlan(brief)));
  } catch (e) {
    console.error('Error:', e.message);
    process.exit(1);
  }
}
