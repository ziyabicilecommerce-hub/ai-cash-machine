// Englische Fassung der Serie (#119) für YouTube: Wochenbericht 22.11. - YouTube Englisch Ø 359 Aufrufe, Deutsch Ø 15.
// Gleiche Szenen (Bildschirmfotos) wie die deutsche Folge, nur Texte, Stimme und Caption auf Englisch.
// texte[i] = [Titel, Untertitel] der i-ten Szene. Platzhalter wie in serieFolgen.mjs: {bots}, {deals}.
export const FOLGEN_EN = {
  1: {
    hook: ['{bots} AI BOTS.', '$0 EARNED.'],
    texte: [['{bots} automations', 'all built by me'], ['My control center.', 'Runs 24/7. Without me.'], ['Bots that test', 'TikToks on their own.'],
      ['Bots that find deals', 'while I sleep.'], ['And my bank account?', '$0.00']],
    stimme: 'I built {bots} AI bots. Money made: zero. Starting today, that changes. Day one of one hundred.',
    caption: 'Built {bots} AI bots, made $0. Every day I show you if I can turn it around.',
  },
  2: {
    hook: ['THIS BOT WORKS', 'WHILE I SLEEP.'],
    texte: [['Reselling radar', 'scans shops + stores'], ['{deals} deals found', 'in just 24 hours'], ['Money made?', 'Still $0. For now.']],
    stimme: 'Day two. While I sleep, this bot scans shops and stores for deals. In the last 24 hours it found {deals}. I still have not made a single dollar. Not yet.',
    caption: 'This bot hunts deals for me around the clock. {deals} in 24 hours. Money made: $0.',
  },
  3: {
    hook: ['MY AI DECIDES', 'WHICH TIKTOKS I POST.'],
    texte: [['The idea lab', 'tests hooks automatically'], ['Winners stay,', 'losers get cut.'], ['And this video?', 'Being tested right now.']],
    stimme: 'Day three. I let an AI test which videos work. It tracks views and watch time and kills everything that flops. Yes, this video is being tested right now.',
    caption: 'My AI decides which videos I post. It is testing this one right now.',
  },
  4: {
    hook: ['AN AI PITCHED ME', '8 BUSINESS IDEAS.'],
    texte: [['I said no to all of them.', 'I know.'], ['What I do instead:', 'this series.']],
    liste: ['✗ Reselling alerts', '✗ AI receptionist', '✗ Lead radar', '✗ Postcard robot', '✗ Anime shop', '✗ Viral app', '✗ Agent checkout', '✗ AI court'],
    stimme: 'Day four. An AI pitched me eight business ideas. AI receptionist, anime shop, viral app. I rejected every single one. Which one would you have picked? Tell me in the comments.',
    caption: 'An AI pitched me 8 business ideas. I said no to all of them. Which one would you pick? 👇',
  },
  5: {
    hook: ['MY AI BOSS TELLS ME', 'WHAT TO DO EVERY MORNING.'],
    texte: [['Headquarters', 'plans my day'], ['Every system', 'on one screen'], ['Task for today:', 'the first dollar.']],
    stimme: 'Day five. Every morning my AI headquarters tells me what to do. Today there is only one task: make the first dollar.',
    caption: 'My AI boss plans my day every morning. Only one task today: the first dollar.',
  },
  6: {
    hook: ['{bots} BOTS.', 'WHICH ONE MAKES MONEY?'],
    texte: [['Pick one.', 'Your comment decides.'], ['Most mentioned bot', 'becomes my first product.']],
    stimme: 'Day six. I have {bots} bots and I cannot decide. So you decide. The bot mentioned most in the comments becomes my first product.',
    caption: '{bots} bots. You decide which one becomes my first product. Comment below 👇',
  },
  7: {
    hook: ['ONE WEEK IN.', 'HERE IS WHERE I AM.'],
    texte: [['Week 1', '{bots} bots, 7 videos'], ['Reach', 'growing every day'], ['Money made:', 'coming this week.']],
    stimme: 'Day seven. One week of this series. {bots} bots, seven videos, and you picked my first product. Next week I build it.',
    caption: 'Week 1 is done. Next week I build the first product. Stay tuned.',
  },
  8: {
    hook: ['YOU VOTED.', '{produkt} BECOMES MY PRODUCT.'],
    texte: [['The winner:', '{produkt}'], ['Goal this week:', 'the first customer.']],
    stimme: 'Day eight. You voted, and {produkt} won. This week I turn it into something people can buy. Goal: the first paying customer.',
    caption: 'You voted: {produkt} becomes my first product. Goal this week: the first customer.',
  },
  9: {
    hook: ['HOW MUCH IS', 'AN AI BOT WORTH?'],
    texte: [['What would you pay?', 'Your comment sets the price'], ['The price', 'is up to you.']],
    liste: ['Free version?', '$9 a month?', '$29 one-time?', '$99 with setup?'],
    stimme: 'Day nine. I need to set a price and I have no idea. Free, nine dollars a month, or twenty-nine one-time? Tell me in the comments what you would pay.',
    caption: 'I need a price for {produkt}. What would you pay? 👇',
  },
  10: {
    hook: ['AN AI BUILDS', 'MY SALES PAGE.'],
    texte: [['Prompt in,', 'page out.'], ['Time:', 'under one hour.']],
    stimme: 'Day ten. I am letting an AI build the sales page for {produkt}. Copy, design, checkout button. It goes live tomorrow.',
    caption: 'An AI is building the sales page for {produkt}. Live tomorrow.',
  },
  11: {
    hook: ['THE PAGE IS LIVE.', 'YOU CAN BUY IT NOW.'],
    texte: [['Online since today.', 'Link in bio.'], ['Sales:', 'still 0.']],
    stimme: 'Day eleven. The page is live. You can buy {produkt} now. Sales so far: zero. Link is in my bio.',
    caption: '{produkt} is live. Sales so far: 0. Link in bio.',
  },
  12: {
    hook: ['24 HOURS LIVE.', 'THIS MANY PEOPLE BOUGHT.'],
    texte: [['Visitors, clicks,', 'sales'], ['What I change now:', 'coming tomorrow.']],
    stimme: 'Day twelve. The page has been live for one day. I will show you honestly how many clicked and how many bought. And what I change next.',
    caption: '24 hours live. The honest numbers behind {produkt}.',
  },
  13: {
    hook: ['MY BOT NOW FINDS', 'CUSTOMERS ON ITS OWN.'],
    texte: [['The next bot:', 'runs the ads.'], ['Bots selling', 'bots.']],
    stimme: 'Day thirteen. If I have a hundred bots, one of them can market {produkt}. Starting today, bots sell my bots.',
    caption: 'Starting today a bot markets {produkt}. Bots selling bots.',
  },
  14: {
    hook: ['TWO WEEKS.', 'THE FIRST DOLLAR?'],
    texte: [['Week 2', 'product built + live'], ['Money made:', 'the answer is in this video.']],
    stimme: 'Day fourteen. Two weeks into the series. The product is built and live. The big question: did I make my first dollar? Here is the answer.',
    caption: 'Two weeks. {produkt} is live. Did I make my first dollar?',
  },
};

export function standardEn(tag, ziel) {
  return {
    hook: [`DAY ${tag}.`, 'WHERE I AM TODAY.'],
    texte: [['{bots} bots', 'still running'], ['{deals} deals', 'in 24 hours'], [`${ziel - tag} days left`, 'until the goal']],
    stimme: `Day ${tag}. {bots} bots are running, and in the last 24 hours they found {deals} deals. ${ziel - tag} days left. Follow to see how it ends.`,
    caption: `{bots} bots, {deals} deals in 24 hours. ${ziel - tag} days to go.`,
  };
}
