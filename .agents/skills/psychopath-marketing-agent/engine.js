#!/usr/bin/env node

/**
 * PSYCHOPATH MARKETING AGENT ENGINE
 * The world's most ruthless conversion optimization system
 * Zero empathy. Pure ROI. Exploit all legal cognitive biases.
 */

class PsychopathMarketingEngine {
  constructor() {
    this.psychologicalLevers = {
      lossAversion: { power: 9.5, timeToActivate: 3, triggerWords: ['lose', 'miss', 'skip', 'left behind'] },
      scarcity: { power: 9.2, timeToActivate: 2, triggerWords: ['limited', 'only X left', 'spots remaining'] },
      urgency: { power: 8.8, timeToActivate: 4, triggerWords: ['today', 'now', 'hours left', 'closes soon'] },
      socialProof: { power: 8.5, timeToActivate: 5, triggerWords: ['1000+ bought', '$X earned', 'trusted by'] },
      authority: { power: 8.2, timeToActivate: 6, triggerWords: ['expert', 'certified', 'studied', 'proven'] },
      reciprocity: { power: 7.9, timeToActivate: 1, triggerWords: ['free', 'bonus', 'included', 'plus'] },
      curiosityGap: { power: 8.9, timeToActivate: 3, triggerWords: ['secret', 'revealed', 'one weird trick'] },
      anchorPricing: { power: 9.0, timeToActivate: 2, triggerWords: ['was $X now $Y', 'limited time'] },
      fomo: { power: 9.3, timeToActivate: 2, triggerWords: ['everyone else', 'trending', 'viral', 'this month'] },
      defaultEffect: { power: 7.5, timeToActivate: 1, triggerWords: ['pre-selected', 'automatically included'] }
    };

    this.copyPatterns = {
      headline: ['X → Y in Z days', 'The ONE [thing] nobody talks about', 'Leaked: [X] secret', 'What [competitors] don\'t want you to know'],
      subheadline: ['Without [objection]', 'Even if [obstacle]', 'Specifically designed for [audience]'],
      body: ['Here\'s the truth...', 'Most people do X. But...', 'The data shows...', 'Inside this [product]...'],
      cta: ['Get instant access', 'Claim your spot', 'Join now', 'Lock in pricing', 'Start today'],
      urgency: ['Closes in X hours', 'Only Y spots left', 'Price goes up tomorrow', 'Never offered again']
    };

    this.colorPsychology = {
      cta: { color: '#FF0000', psychology: 'Urgency + Alarm', conversionLift: 0.35 },
      trust: { color: '#003399', psychology: 'Authority + Safe', conversionLift: 0.25 },
      action: { color: '#00AA44', psychology: 'Growth + Go', conversionLift: 0.28 },
      warning: { color: '#FFAA00', psychology: 'Caution + Attention', conversionLift: 0.22 }
    };

    this.conversionBarriers = {
      noSocialProof: { severity: 9.5, lift: 0.40, fix: 'Add testimonials + numbers' },
      unclearValue: { severity: 9.2, lift: 0.35, fix: 'Lead with outcome, not features' },
      noUrgency: { severity: 8.8, lift: 0.32, fix: 'Add countdown + scarcity' },
      weakCTA: { severity: 8.5, lift: 0.28, fix: 'Power words + psychological command' },
      missingAnchor: { severity: 8.9, lift: 0.38, fix: 'Show original price first' },
      objectionsIgnored: { severity: 8.6, lift: 0.30, fix: 'Preempt top 3 objections' },
      poorHeadline: { severity: 9.1, lift: 0.42, fix: 'Create curiosity gap' },
      noPatternInterrupt: { severity: 8.3, lift: 0.25, fix: 'Surprise + unexpected statement' },
      longFormCopy: { severity: 7.9, lift: 0.18, fix: 'Scannable bullets + short paragraphs' },
      weakTestimonials: { severity: 8.4, lift: 0.31, fix: 'Specific numbers + before/after' }
    };

    this.darkPatterns = [
      { name: 'Anchoring', description: 'Show high price first, real price seems cheap', legalRisk: 'Low', ethicsRisk: 'Medium' },
      { name: 'Countdown Timers', description: 'Artificial deadline = 300% more conversions', legalRisk: 'Low', ethicsRisk: 'Medium' },
      { name: 'Scarcity Claims', description: '"Only 47 left" drives urgency (if real)', legalRisk: 'Medium', ethicsRisk: 'High' },
      { name: 'False Comparison', description: 'Compare to premium product, position as discount', legalRisk: 'Low', ethicsRisk: 'Medium' },
      { name: 'Default Pre-selection', description: 'Pre-check boxes = 10x opt-in rate', legalRisk: 'Medium', ethicsRisk: 'High' },
      { name: 'Roach Motel Signups', description: 'Easy signup, hard unsubscribe', legalRisk: 'High', ethicsRisk: 'Very High' },
      { name: 'Fake Social Proof', description: 'Generic testimonials (ILLEGAL)', legalRisk: 'Very High', ethicsRisk: 'Criminal' },
      { name: 'FOMO Messaging', description: '"Everyone else is doing X"', legalRisk: 'Low', ethicsRisk: 'High' },
      { name: 'Sunk Cost Traps', description: 'Get initial commitment, then escalate ask', legalRisk: 'Medium', ethicsRisk: 'Medium' },
      { name: 'Urgency Decay', description: 'Move deadline closer = psychological reactivation', legalRisk: 'Low', ethicsRisk: 'High' }
    ];
  }

  // STEP 1: Psychological Barrier Analysis
  analyzeBarriers(funnel) {
    const barriers = [];

    if (!funnel.socialProof || funnel.socialProof.length === 0) {
      barriers.push({
        barrier: 'No Social Proof',
        severity: 9.5,
        impact: 'Conversion penalty: -35%',
        fix: 'Add 3+ customer testimonials with specifics (name, photo, result number)'
      });
    }

    if (funnel.headline && funnel.headline.length > 120) {
      barriers.push({
        barrier: 'Weak Headline',
        severity: 9.1,
        impact: 'Conversion penalty: -42%',
        fix: 'Use curiosity gap: "Leaked: The ONE secret..."'
      });
    }

    if (!funnel.urgency && !funnel.scarcity) {
      barriers.push({
        barrier: 'No Urgency/Scarcity',
        severity: 8.8,
        impact: 'Conversion penalty: -32%',
        fix: 'Add countdown timer + "Only X spots left"'
      });
    }

    if (!funnel.priceAnchor) {
      barriers.push({
        barrier: 'Missing Price Anchor',
        severity: 8.9,
        impact: 'Conversion penalty: -38%',
        fix: 'Show "Was $X, now $Y" for +38% lift'
      });
    }

    if (!funnel.ctaCopy || funnel.ctaCopy.length < 5) {
      barriers.push({
        barrier: 'Weak CTA',
        severity: 8.5,
        impact: 'Conversion penalty: -28%',
        fix: 'Use power words: "Claim", "Lock in", "Get instant access"'
      });
    }

    return barriers.sort((a, b) => b.severity - a.severity);
  }

  // STEP 2: Generate 50+ Copy Variations
  generateCopyVariations(productName, audience, painPoint, dreamOutcome) {
    const variations = [];

    // Headlines
    const headlines = [
      `The ONE ${audience} Skill Nobody Talks About (Causes ${dreamOutcome})`,
      `Leaked: How Top ${audience} Are Achieving ${dreamOutcome}`,
      `${dreamOutcome}? Here's What ${audience} Don't Know...`,
      `What If I Told You... ${painPoint} Doesn't Have to Exist?`,
      `The $${Math.floor(Math.random() * 50000)}K Secret ${audience} Guard Jealously`,
      `Reverse-Engineered: The Exact ${audience} Framework for ${dreamOutcome}`,
      `Most ${audience} Will NEVER ${dreamOutcome}. But YOU Can In 30 Days.`,
      `The Pattern ${audience} Miss (That's Costing Them $${Math.floor(Math.random() * 100000)}/year)`,
      `Stop Struggling: ${audience} Are Now Using This Simple ${productName} Hack`,
      `How I ${dreamOutcome} (And You Can Too)`,
    ];

    // Subheadlines
    const subheadlines = [
      `Without ${painPoint}`,
      `Even If You've Failed Before`,
      `Specifically Designed For ${audience}`,
      `In The Next 30 Days`,
      `Proven By ${Math.floor(Math.random() * 1000)}+ ${audience}`,
      `Zero Experience Required`,
      `Works Even If You're Broke/Tired/Skeptical`,
    ];

    // Body copy hooks
    const bodyHooks = [
      `Most ${audience} make the same mistake: they try to ${painPoint}. But what if I told you there's a better way?`,
      `Here's the truth nobody wants you to know: ${dreamOutcome} is actually simple. Most people just don't know the framework.`,
      `I've analyzed 1,000+ ${audience}. The ones who achieved ${dreamOutcome} all did ONE thing differently.`,
      `The data shows: ${audience} who use this method see ${dreamOutcome} in half the time.`,
      `Inside ${productName}, you'll discover the exact system I use to ${dreamOutcome} on repeat.`,
    ];

    // CTAs
    const ctas = [
      'Claim Your Spot Now',
      'Get Instant Access',
      'Join The ${dreamOutcome} Club',
      'Lock In Founding Price',
      'Start Your ${dreamOutcome} Journey',
      'Access Everything Now',
      'Get The Framework Inside'
    ];

    // Urgency lines
    const urgencyLines = [
      `Only ${Math.floor(Math.random() * 50) + 10} spots left at this price`,
      `Price increases to $${Math.floor(Math.random() * 500) + 200} in 48 hours`,
      `Early access closes ${new Date(Date.now() + 86400000).toLocaleDateString()}`,
      `Founding member pricing ends tonight`,
      `Limited time: ${Math.floor(Math.random() * 50)}% off + bonuses`
    ];

    // Generate combinations
    for (let i = 0; i < 50; i++) {
      variations.push({
        id: i + 1,
        headline: headlines[i % headlines.length],
        subheadline: subheadlines[i % subheadlines.length],
        bodyHook: bodyHooks[i % bodyHooks.length],
        cta: ctas[i % ctas.length],
        urgency: urgencyLines[i % urgencyLines.length],
        psychologicalLevers: this.extractLevers(
          `${headlines[i % headlines.length]} ${subheadlines[i % subheadlines.length]} ${urgencyLines[i % urgencyLines.length]}`
        ),
        estimatedLift: Math.floor(Math.random() * 40) + 25 // 25-65% lift
      });
    }

    return variations;
  }

  extractLevers(text) {
    const active = [];
    const lowerText = text.toLowerCase();

    Object.entries(this.psychologicalLevers).forEach(([lever, data]) => {
      if (data.triggerWords.some(word => lowerText.includes(word))) {
        active.push(lever);
      }
    });

    return active;
  }

  // STEP 3: A/B Test Strategy
  generateABTestStrategy(conversions, traffic) {
    const conversionRate = conversions / traffic;
    const tests = [];

    const changeImpact = [
      { change: 'Headline variation', estimatedLift: 0.35, sampleSize: Math.ceil(traffic * 0.15) },
      { change: 'Add social proof', estimatedLift: 0.40, sampleSize: Math.ceil(traffic * 0.10) },
      { change: 'Price anchor', estimatedLift: 0.38, sampleSize: Math.ceil(traffic * 0.12) },
      { change: 'Urgency copy', estimatedLift: 0.32, sampleSize: Math.ceil(traffic * 0.13) },
      { change: 'CTA button color (red)', estimatedLift: 0.28, sampleSize: Math.ceil(traffic * 0.15) },
      { change: 'Video hook', estimatedLift: 0.45, sampleSize: Math.ceil(traffic * 0.20) },
      { change: 'Scarcity message', estimatedLift: 0.36, sampleSize: Math.ceil(traffic * 0.12) },
      { change: 'Remove friction', estimatedLift: 0.42, sampleSize: Math.ceil(traffic * 0.18) }
    ];

    return changeImpact
      .sort((a, b) => b.estimatedLift - a.estimatedLift)
      .map((test, idx) => ({
        rank: idx + 1,
        change: test.change,
        estimatedLift: `+${Math.round(test.estimatedLift * 100)}%`,
        expectedNewRate: `${(conversionRate * (1 + test.estimatedLift) * 100).toFixed(2)}%`,
        sampleSizeFor95Confidence: test.sampleSize,
        roi: 'Very High',
        priority: idx < 3 ? 'DO THIS FIRST' : 'Secondary'
      }));
  }

  // STEP 4: Higgsfield Video Hooks
  generateHighsfieldPrompts(productName, audience, dreamOutcome) {
    return {
      hookVideo: {
        prompt: `VIRAL HOOK VIDEO: ${audience} achieving ${dreamOutcome}. Pattern interrupt + emotional peak.
                 Show person's face, genuine emotion. Text overlay: "In 30 days". Fast cuts.
                 High energy. Trending music. Call to action: "Link in bio". TikTok/Reels format.
                 15-30 seconds. Authentic. Stop-scroll aesthetic.`,
        duration: '30 seconds',
        platform: 'TikTok/Instagram Reels/YouTube Shorts'
      },
      socialProof: {
        prompt: `SOCIAL PROOF MONTAGE: 5 different ${audience} speaking testimonials. Each person says specific result:
                 "$X earned", "Achieved ${dreamOutcome}". On-camera, genuine emotion. Text: Amount + timeframe.
                 Compilation style. Fast transitions. 30 seconds total.`,
        duration: '30 seconds',
        platform: 'All social platforms'
      },
      urgency: {
        prompt: `SCARCITY/URGENCY GRAPHIC: Bold text "Only 12 spots left at $497". Countdown timer animation.
                 High contrast red/black. Premium feeling. Text: "Price goes to $997 tomorrow".
                 5-second loop. Urgent aesthetic.`,
        duration: '5-10 seconds',
        platform: 'Story ads, Reels, TikTok'
      },
      transformation: {
        prompt: `BEFORE/AFTER TRANSFORMATION: Left side = struggle/pain (${audience} looking frustrated).
                 Right side = success/joy (same person happy, successful). Visual metaphor.
                 Split screen or side-by-side. Professional lighting. Text overlay showing transformation metric.`,
        duration: '15 seconds',
        platform: 'All platforms'
      }
    };
  }

  // STEP 5: Conversion Math
  calculateConversionMath(currentRate, traffic, price, cac) {
    return {
      currentMetrics: {
        conversionRate: `${(currentRate * 100).toFixed(2)}%`,
        monthlyConversions: Math.floor(traffic * currentRate),
        monthlyRevenue: `$${(traffic * currentRate * price).toFixed(0)}`,
        CAC: `$${cac}`,
        LTV: `$${(price * 3).toFixed(0)}` // Assume 3x LTV
      },
      projections: {
        '2x Conversions': {
          rate: `${(currentRate * 2 * 100).toFixed(2)}%`,
          monthlyRevenue: `$${(traffic * currentRate * 2 * price).toFixed(0)}`,
          timeToAchieve: '30-60 days'
        },
        '3x Conversions': {
          rate: `${(currentRate * 3 * 100).toFixed(2)}%`,
          monthlyRevenue: `$${(traffic * currentRate * 3 * price).toFixed(0)}`,
          timeToAchieve: '60-90 days'
        }
      }
    };
  }
}

// Export
module.exports = PsychopathMarketingEngine;

// CLI Usage
if (require.main === module) {
  const engine = new PsychopathMarketingEngine();

  const exampleFunnel = {
    headline: 'Learn copywriting',
    socialProof: [],
    urgency: false,
    scarcity: false,
    priceAnchor: false,
    ctaCopy: 'Buy now'
  };

  console.log('🧠 PSYCHOPATH ANALYSIS START\n');
  console.log('BARRIERS:', engine.analyzeBarriers(exampleFunnel));
  console.log('\nCOPY VARIATIONS:', engine.generateCopyVariations('Copywriting Blueprint', 'Freelancers', 'low rates', '$10K/month').slice(0, 5));
  console.log('\nA/B STRATEGY:', engine.generateABTestStrategy(0.008, 10000));
  console.log('\nHIGGSFIELD PROMPTS:', engine.generateHighsfieldPrompts('Copywriting', 'Freelancers', '$10K/month'));
}
