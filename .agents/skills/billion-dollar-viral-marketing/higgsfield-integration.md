# Higgsfield Integration Guide

Use Higgsfield to generate videos and images from the skill's output.

## Video Generation Workflow

After `/billion-dollar-viral-marketing` generates your scripts, use Higgsfield:

### Step 1: Hook Video (15-30 seconds)

**Script from skill:**
```
[0s] HOOK: "I made $150K without spending a dime on ads. Here's how."
[3s] Show surprising statistic
[6s] Introduce the problem
[9s] Quick glimpse of solution
[12s] CALL TO ACTION
```

**Higgsfield prompt:**
```
generate_video(
  prompt: "Professional, high-energy video of entrepreneur in modern home office having a breakthrough moment. 
           Cinematic lighting, quick dynamic transitions. Text overlay: 'I made $150K without ads'. 
           Modern aesthetic, trending 2024 style, suitable for TikTok/Reels.",
  duration: "30 seconds",
  style: "modern, fast-paced, engaging, professional"
)
```

### Step 2: Breakdown Video (30-60 seconds)

**Higgsfield prompt:**
```
generate_video(
  prompt: "Clean screen recording showing a 3-step marketing framework. 
           Animated diagrams with professional typography. Each step highlighted. 
           Bright color scheme, educational style, clear explanations on screen.",
  duration: "60 seconds",
  style: "educational, structured, clear, professional"
)
```

### Step 3: Social Proof Video (30 seconds)

**Higgsfield prompt:**
```
generate_video(
  prompt: "Authentic testimonial montage: diverse people on camera speaking about their success. 
           Results displayed on screen (earnings, metrics). Genuine emotions, warm lighting. 
           Professional color grading, on-camera interviews, diverse backgrounds.",
  duration: "30 seconds",
  style: "authentic, trustworthy, social proof, genuine"
)
```

### Step 4: Scarcity Video (15 seconds)

**Higgsfield prompt:**
```
generate_video(
  prompt: "High-urgency aesthetic: countdown timer animations, exclusive feeling. 
           Text: 'Only 12 spots left'. Bold typography, dynamic transitions, premium look. 
           Dark background, bright accents, urgency-driven design.",
  duration: "15 seconds",
  style: "urgent, premium, exclusive, high-energy"
)
```

## Image Generation Workflow

### Carousel Post Cover

**Higgsfield prompt:**
```
generate_image(
  prompt: "Professional thumbnail for marketing ebook. Bold centered text '[PRODUCT NAME]'. 
           Business professional looking confident. Modern flat design, high contrast colors. 
           Trending 2024 aesthetic, thumbnail-optimized."
)
```

### Before/After Transformation

**Higgsfield prompt:**
```
generate_image(
  prompt: "Split-screen before/after graphic. Left side: frustrated freelancer, low earnings. 
           Right side: same person successful, confident, laptop showing $50K earnings. 
           Visual metaphor showing transformation. Clean modern design, inspiring."
)
```

### Framework Infographic

**Higgsfield prompt:**
```
generate_image(
  prompt: "Infographic showing 3-step marketing framework. Clean typography, numbered steps. 
           Each step has icon and explanation. Modern color scheme, educational design. 
           Instagram-square optimized, easy to scan."
)
```

### Email Header

**Higgsfield prompt:**
```
generate_image(
  prompt: "Professional email header: successful entrepreneur at laptop showing results charts. 
           Inspiring composition, laptop on desk, notebook, coffee. Warm lighting. 
           1200x400px, crop-friendly for email headers."
)
```

## Template Examples

### TikTok/Reels Hook Script

```
[0:00] Pattern interrupt
"Wait, you're doing marketing wrong"

[0:02] Problem statement
"Most creators leave $50K on the table"

[0:04] Pattern break
"But here's what changed my game..."

[0:06] Solution teaser
"[Framework name] + these 3 secrets = viral"

[0:09] Social proof
"$200K creators use this"

[0:11] CTA
"Full breakdown in my bio ↓"
```

**Higgsfield:** Generate as trending TikTok with quick cuts, text overlays, trending audio

### YouTube Shorts Script

```
[0:00] HOOK (2 sec)
"The secret nobody wants you to know"

[0:02] PROBLEM (3 sec)
Show the struggle most people face

[0:05] INTRO (3 sec)
"I'm [name], and I've helped 1000+ people..."

[0:08] SOLUTION (15 sec)
Explain the framework/technique

[0:23] PROOF (10 sec)
Show results/testimonials

[0:33] CTA (4 sec)
Subscribe/Link/Learn more

[0:37] End screen (3 sec)
Subscribe prompt
```

**Higgsfield:** Generate as YouTube Short with B-roll, transitions, professional color grading

## Best Practices

1. **Video Scripts:** Always include exact timings (0:00, 0:03, etc.) so Higgsfield can pace content
2. **Urgency:** Use countdown timers, "only X spots" language in scarcity videos
3. **Social Proof:** Real testimonials work better than actor testimonials (show Higgsfield real customer clips if available)
4. **Platform-specific:** TikTok/Reels need faster pacing, vertical format. YouTube Shorts can be longer.
5. **Color:** Use 2-3 colors max for brand consistency across all generated content

## Automation Workflow

1. Run `/billion-dollar-viral-marketing`
2. Export scripts + prompts
3. Loop through each video script:
   - Call `higgsfield_generate_video(prompt, duration)`
   - Review and regenerate if needed
4. Loop through each image prompt:
   - Call `higgsfield_generate_image(prompt)`
   - Download or export to design tool
5. Compile all assets into 30-day posting schedule

## Cost Optimization

- **Start with images** (cheaper, good for testing positioning)
- **Then 1-2 key videos** (hook + proof)
- **Scale up** once first videos get traction
- Use Higgsfield's upscale_video for high-performing clips → convert to 4K

Typical budget for complete 30-day campaign: $100-500 depending on video count
