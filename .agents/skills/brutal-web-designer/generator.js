#!/usr/bin/env node

/**
 * BRUTAL WEB DESIGNER GENERATOR
 * Conversion-obsessed landing page specifications
 * No aesthetics. Pure ROI.
 */

class BrutalWebDesigner {
  constructor() {
    this.conversionPrinciples = {
      heroSection: { timeLimit: 3, focusOnValue: true, requireImage: true, requireCTA: true },
      socialProof: { placement: 'mid-page-right', faceRequired: true, numberRequired: true },
      colorPsych: { ctaColor: '#FF0000', bgColor: '#FFFFFF', textColor: '#222222', contrast: 4.5 },
      forms: { maxFields: 3, idealFields: 1, fieldOrder: ['email', 'name', 'phone'] },
      typography: { headlineSize: '32px', subheadlineSize: '20px', bodySize: '16px', lineHeight: 1.6 },
      cta: { repeatEvery: 300, primaryOnly: true, powerWords: ['Claim', 'Access', 'Get', 'Start'] },
      mobile: { vw100: true, thumbZone: true, minTouchTarget: 44, maxLoadTime: 2000 }
    };

    this.conversionKillers = [
      'Long body copy (>500 words)',
      'Unclear value proposition',
      'No social proof',
      'No mobile optimization',
      'Weak CTA copy',
      'Too many colors',
      'Slow load time (>3 seconds)',
      'No urgency/scarcity',
      'Unhandled objections',
      'Generic testimonials (no specifics)'
    ];
  }

  generateLandingSpec(productName, value, audience, price) {
    return {
      hero: this.generateHeroSpec(productName, value, audience),
      valueProp: this.generateValueProp(productName),
      socialProof: this.generateSocialProof(audience),
      objectionHandlers: this.generateObjectionHandlers(),
      ctas: this.generateCTAs(price),
      forms: this.generateFormSpec(),
      higgsfield: this.generateHighsfieldPrompts(),
      colors: this.generateColorPalette(),
      typography: this.generateTypography(),
      mobile: this.generateMobileSpec(),
      abTests: this.generateABTestVariants()
    };
  }

  generateHeroSpec(productName, value, audience) {
    return {
      section: 'hero',
      requirements: {
        headline: `The ONE ${audience} ${value}`,
        subheadline: `Proven by [NUMBER]+ ${audience}`,
        image: 'Higgsfield-generated: Successful outcome',
        cta: { text: 'Claim Your Access Now', color: '#FF0000', size: '45px' },
        timeToUnderstand: '3 seconds',
        aboveTheFold: true
      },
      layout: {
        structure: '50/50 (image left, text right) on desktop | Stacked on mobile',
        maxTextWidth: '600px',
        whitespace: 'generous',
        contrast: 'high'
      }
    };
  }

  generateValueProp(productName) {
    return {
      section: 'value-proposition',
      maxWords: 8,
      format: '3 bullet points',
      bullets: [
        { text: '[CORE BENEFIT: What they get]', highlight: true },
        { text: '[HOW: The mechanism/framework]', highlight: true },
        { text: '[PROOF: Social proof/results]', highlight: true }
      ],
      psychology: 'Loss aversion + authority + social proof'
    };
  }

  generateSocialProof(audience) {
    return {
      section: 'social-proof',
      placement: 'mid-page-right',
      components: {
        testimonials: {
          count: 3,
          format: 'Face + Quote + Result (specific number)',
          videoRequired: true,
          examples: ['Earned $X', 'Achieved [outcome]', '[Transformation] in X days']
        },
        numbers: {
          examples: ['X customers bought', 'X satisfied rate', 'X success stories']
        },
        authority: {
          examples: ['Expert recommendation', 'Media mention', 'Certification']
        }
      }
    };
  }

  generateObjectionHandlers() {
    return {
      section: 'objection-handling',
      placements: ['below-hero', 'mid-page', 'before-final-cta'],
      commonObjections: [
        { objection: 'Is this for me?', answer: '[Qualification section]', placement: 'mid-page' },
        { objection: 'What if it doesn\'t work?', answer: '[Guarantee/refund]', placement: 'before-cta' },
        { objection: 'Is this just...?', answer: '[Differentiation]', placement: 'mid-page' },
        { objection: 'Why you?', answer: '[Credibility/authority]', placement: 'mid-page' }
      ]
    };
  }

  generateCTAs(price) {
    return {
      primary: { text: 'Claim Your Access Now', color: '#FF0000', size: '45px', placement: 'above-fold' },
      secondary: { text: 'Get Instant Access', color: '#FF0000', size: '40px', placement: 'every-300px' },
      urgency: { text: `Only ${Math.floor(Math.random() * 50) + 10} spots left | Price goes to $${price * 2} tomorrow`, placement: 'bottom-page' },
      repetition: { strategy: 'Repeat CTA every 300px of scroll', theory: 'Multiple exposures = higher conversion' }
    };
  }

  generateFormSpec() {
    return {
      fields: ['email', 'name'],
      fieldCount: 2,
      maxAllowed: 3,
      buttonText: 'Get Access Now',
      progressBar: false,
      conditional: false,
      layout: 'single-column'
    };
  }

  generateHighsfieldPrompts() {
    return {
      heroImage: {
        description: 'Successful person achieving outcome | Professional lighting | Confident expression | Home office/professional setting',
        format: '16:9 aspect ratio',
        style: 'stock-photo, authentic, aspirational'
      },
      testimonialVideo: {
        description: '3 people on camera, each speaking (15 seconds): "[Name]: $X result/outcome"',
        format: 'Vertical 9:16 (mobile)',
        style: 'authentic, on-camera, genuine emotion'
      },
      urgencyGraphic: {
        description: 'Red background, white text: "ONLY 12 SPOTS LEFT" + "Price goes up tomorrow"',
        format: 'Square (1:1) or 16:9',
        animation: '5-second loop with countdown timer'
      }
    };
  }

  generateColorPalette() {
    return {
      primary: { color: '#FF0000', use: 'CTA buttons', conversionLift: '+35%' },
      background: { color: '#FFFFFF', use: 'Main background', psychology: 'Clean, trustworthy' },
      text: { color: '#222222', use: 'Body text', readability: '7:1 contrast ratio' },
      accent: { color: '#003399', use: 'Secondary elements', psychology: 'Trust/authority' },
      warning: { color: '#FFAA00', use: 'Urgency/scarcity', psychology: 'Caution/attention' },
      darkMode: {
        background: '#1a1a1a',
        text: '#EEEEEE',
        primary: '#FF4444'
      }
    };
  }

  generateTypography() {
    return {
      headlineSize: '32px',
      headlineWeight: 'bold',
      headlineLineHeight: 1.2,
      subheadlineSize: '20px',
      subheadlineWeight: 'semibold',
      bodySize: '16px',
      bodyWeight: 'regular',
      bodyLineHeight: 1.6,
      fonts: {
        headline: 'sans-serif (Inter, Helvetica, System)',
        body: 'sans-serif (same)',
        limit: 'Max 2 font families'
      }
    };
  }

  generateMobileSpec() {
    return {
      viewport: '100vw width',
      layout: 'Single column, vertical stacking',
      textSizes: { headline: '28px', body: '18px', cta: '20px' },
      touchTargets: { minSize: '44px', idealSize: '56px' },
      ctaPlacement: 'Bottom-center thumb zone',
      formFields: 'Max 2 fields, full width',
      loadTime: '< 2 seconds (image optimization critical)',
      imageOptimization: 'WebP, <50KB per image'
    };
  }

  generateABTestVariants() {
    return {
      variantA: { hero: 'Image + copy', testMetric: 'Baseline' },
      variantB: { hero: 'Video testimonial', testMetric: 'Social proof power' },
      variantC: { hero: 'Results graphic ($X earned)', testMetric: 'Urgency activation' },
      variantD: { hero: 'Scarcity visual (countdown)', testMetric: 'FOMO power' },
      sampleSize: 'Minimum 500 visitors per variant',
      confidenceLevel: '95%',
      testDuration: '7-14 days'
    };
  }
}

module.exports = BrutalWebDesigner;

if (require.main === module) {
  const designer = new BrutalWebDesigner();
  const spec = designer.generateLandingSpec(
    '$10K Copywriting Blueprint',
    'copywriting secret to $10K/month',
    'Freelancers',
    497
  );

  console.log('🎨 BRUTAL WEB DESIGNER SPEC\n');
  console.log(JSON.stringify(spec, null, 2));
}
