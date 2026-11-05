// English horror stories for the English channel - written (not machine-translated) from the Skript-Bot patterns.
// Same rules: hook <= 70 chars, the two key sentences come last (short mode keeps only those), answers <= 18 chars.
// hook2 = "you" hook for the hook A/B test.
import { pruefen, slug } from './videobot.mjs';

const S = (titel, muster, ort, boesewicht, stimme, hook, hook2, saetze, ende, monster, frage, wahl, extra = {}) =>
  ({ titel, muster, ort, boesewicht, stimme, hook, hook2, saetze, ende, monster, frage, wahl, sprache: 'en', herkunft: 'skriptbot-en', ...extra });
const RUN = ['Check it out', 'Run'];
const ANSWER = ['Answer', 'Hang up'];

export const SKRIPTE_EN = [
  S('Two Coffee Cups', 'allein', 'haus', 'schatten', 'mann', 'I live alone. Today there are two warm coffee cups on my table.', 'You live alone. Still, there are two warm cups on your table.',
    ['At first I think I made two by mistake.', 'Then my neighbor texts me.', 'He asks who is sitting in my kitchen.', 'But the second chair is still warm.'],
    'I only made one cup. The other one is empty.', 'The coffee was good.', 'What would you have done?', RUN, { absender: 'Neighbor', nachricht: 'Who is that sitting in your kitchen?' }),
  S('Nice Book', 'fremd', 'zug', 'schatten', 'mann', 'At 3:12 AM a stranger texts me: Nice book.', 'If a stranger knows what you are reading, do not turn around.',
    ['I look around.', 'I text back: Who is this?', 'I am alone in the last car. And I really am reading.', 'The reply comes instantly: Do not turn around.'],
    'In the dark window I see myself. And a hand on my shoulder.', 'Too late.', 'Would you have turned around?', ['Turn around', 'Run'], { absender: 'Unknown', nachricht: 'Nice book.' }),
  S('Doorbell Camera', 'kamera', 'haus', 'frau', 'mann', 'My doorbell camera recorded someone at 3:12 AM.', 'Never check your doorbell camera at 3:12 AM.',
    ['I watch the clip.', 'At first there is nothing.', 'A woman stands at my door and stares right into the camera.', 'She does not ring. She has a key.'],
    'In the last frame she is behind the camera. So, inside my hallway.', 'I live here.', 'What would you have done?', RUN),
  S('Calling Myself', 'anruf', 'haus', 'schatten', 'mann', 'My phone rings. The caller is me.', 'If your own number calls you, do not pick up.',
    ['I pick up.', 'At first it is silent.', 'I hear my own voice.', 'It whispers: Do not go into the basement.'],
    'I hear footsteps on the basement stairs. Coming up. They sound like mine.', 'I am coming up.', 'Would you have picked up?', ANSWER),
  S('Room Service', 'regel', 'haus', 'schatten', 'mann', 'A note in my hotel room says: Never open the door at night.', 'If a note in your hotel room says never open at night, listen.',
    ['I laugh about it.', 'At 3 AM I hear it.', 'A knock. A voice says: Room service.', 'I follow the rule.'],
    'In the morning there is a new note. Thanks for waiting. Tonight I come in.', 'Tonight I come in.', 'Would you have followed the rule?', ['Follow it', 'Break it']),
  S('The Dog Growls', 'tier', 'haus', 'schatten', 'mann', 'My dog has been growling at an empty wall for an hour.', 'If your dog growls at an empty wall, it sees more than you.',
    ['I think it is a mouse.', 'I look closely. Nothing.', 'He does not back off a single step.', 'Then he suddenly wags his tail. Like he knows someone.'],
    'He walks to the wall and lies down. Like someone is petting him.', 'Good boy.', 'What would you have done?', RUN),
  S('Late Blink', 'spiegel', 'haus', 'frau', 'frau', 'My reflection blinked one second too late at 3 AM.', 'Tonight, check if your reflection blinks with you.',
    ['I brush my teeth like always.', 'At first I notice nothing.', 'I blink again. This time it does not blink at all.', 'It smiles. I am not smiling.'],
    'I turn away. In the mirror she stays and watches me leave.', 'Your turn.', 'Would you have stayed?', ['Stay', 'Lights off']),
  S('Step Counter', 'geraet', 'haus', 'schatten', 'mann', 'My fitness app counts 3000 steps every night. I am asleep.', 'Check how many steps you took in your sleep last night.',
    ['I think it is a bug.', 'I restart everything.', 'Today it shows the route on the map.', 'It goes from my bed to the basement. And back.'],
    'Tonight I stay awake. At 3 AM my body gets up. Without me.', 'Let us go for a walk.', 'What would you have done?', RUN),
  S('Man in the Closet', 'kind', 'haus', 'schatten', 'frau', 'The kid I babysit says: The man in the closet is not mean.', 'If a kid tells you about a nice man in the closet, listen.',
    ['I laugh and ask about him.', 'The laugh does not last.', 'She whispers: He says you are not allowed to see him.', 'The closet door is open a crack. It is dark inside.'],
    'The parents come home. There is no closet in the kids room.', 'Good night.', 'Would you have looked?', ['Look', 'Do not look']),
  S('Wrong Button', 'fremd', 'aufzug', 'schatten', 'mann', 'At 3:12 AM a stranger texts me: Wrong button.', 'If someone texts you in an elevator: Wrong button, get out.',
    ['I look around.', 'I text back: Who is this?', 'I am alone in the elevator. I pressed floor four.', 'The reply comes instantly: Do not turn around.'],
    'The elevator passes the ground floor. The display says minus three.', 'Too late.', 'Would you have turned around?', ['Turn around', 'Run'], { absender: 'Unknown', nachricht: 'Wrong button.' }),
  S('Mom Is Calling', 'anruf', 'haus', 'frau', 'frau', 'My mom is calling me. But she is sitting right next to me.', 'If your mom calls while she sits next to you, hang up.',
    ['I pick up.', 'At first it is silent.', 'It really is her voice.', 'She whispers: Who is with you? I am still at work.'],
    'The mom next to me smiles. Way too wide.', 'Hang up, sweetie.', 'Would you have picked up?', ANSWER),
  S('Do Not Count', 'regel', 'haus', 'gremlin', 'mann', 'A note in the cabin says: Never count the doors at night.', 'If a note tells you not to count the doors at night, do not.',
    ['I laugh about it.', 'At 3 AM I hear it.', 'Someone in the hallway whispers numbers. One. Two. Three.', 'I follow the rule.'],
    'In the morning I count anyway. The house has one more door than yesterday.', 'Four.', 'Would you have followed the rule?', ['Follow it', 'Break it']),
  S('The Cat Stares', 'tier', 'haus', 'gremlin', 'mann', 'Every night at 3 AM my cat stares under my bed.', 'If your cat stares under your bed at 3 AM, do not check.',
    ['I think it is a mouse.', 'I look closely. Nothing.', 'Tonight she hisses and runs away.', 'Under the bed someone slowly pulls my blanket down.'],
    'I pull the blanket back. Under the bed lies my cat. She was there the whole time.', 'She does not like me.', 'What would you have done?', RUN),
  S('Voice Assistant', 'geraet', 'haus', 'gremlin', 'mann', 'My voice assistant laughs at 3 AM. For no reason.', 'If your voice assistant laughs at night, do not ask why.',
    ['I think it is a bug.', 'I restart everything.', 'I ask it why it is laughing.', 'It answers: Because you cannot see who is behind you.'],
    'I turn around. Nobody. It laughs again. This time from the hallway.', 'Hello.', 'What would you have done?', RUN),
  S('Two Pillows', 'allein', 'haus', 'frau', 'frau', 'I live alone. Today there are two dents in my pillows.', 'You live alone. Still, two pillows in your bed are dented.',
    ['At first I think I made a mistake.', 'Then my sister texts me.', 'She asks who is lying next to me in my photo.', 'But under the blanket something is breathing.'],
    'I never took a photo. It was taken from inside my bed.', 'I was always here.', 'What would you have done?', RUN, { absender: 'Sister', nachricht: 'Who is lying next to you in that photo?' }),
  S('Dashcam', 'kamera', 'wald', 'schatten', 'mann', 'My dashcam filmed something on the forest road. I drove alone.', 'Never watch your dashcam after driving alone at night.',
    ['I watch the clip.', 'At first there is nothing.', 'Someone is sitting in the back seat.', 'I drove the whole way alone. No stops.'],
    'I look in the rear view mirror. The dashcam did not lie.', 'Keep driving.', 'What would you have done?', RUN),
  S('911 Calls Back', 'anruf', 'haus', 'gremlin', 'mann', 'My phone rings. It is 911 calling back. I never called.', 'If 911 calls you back and you never called, do not whisper.',
    ['I pick up.', 'At first it is silent.', 'A woman asks if I am safe.', 'She says: You just whispered that someone is under your bed.'],
    'I look under the bed. My phone is there. It is dialing.', 'Shh.', 'Would you have picked up?', ANSWER),
  S('Do Not Answer', 'regel', 'wald', 'hirsch', 'mann', 'A sign at the campsite says: Do not answer anyone at night.', 'If someone calls your name outside your tent, do not answer.',
    ['I laugh about it.', 'At 3 AM I hear it.', 'Outside, my girlfriend calls my name.', 'I follow the rule.'],
    'She is lying next to me in the tent. And outside she is still calling.', 'Come out.', 'Would you have followed the rule?', ['Follow it', 'Break it']),
  S('Phone Tracking', 'geraet', 'haus', 'frau', 'mann', 'My phone tracker shows two phones. I only own one.', 'Never check at night where your phone tracker says you are.',
    ['I think it is a bug.', 'I restart everything.', 'The second phone is inside my apartment.', 'It moves. Slowly. Toward my room.'],
    'The dot stops outside my door. Then my phone rings. The call comes from there.', 'Found you.', 'What would you have done?', RUN),
  S('Wrong Hand', 'spiegel', 'haus', 'frau', 'frau', 'I raise my right hand. My reflection does not.', 'Raise your right hand in front of your mirror. Look closely.',
    ['I brush my teeth like always.', 'At first I notice nothing.', 'It keeps its hands behind its back.', 'Then it shows me what it is holding. My house key.'],
    'I reach into my pocket. My key is gone. The front door slams shut.', 'I am leaving now.', 'Would you have stayed?', ['Stay', 'Lights off']),
  S('Baby Monitor App', 'geraet', 'haus', 'gremlin', 'mann', 'My baby monitor app is streaming breathing. I have no baby.', 'Never install a baby monitor app if you do not have a baby.',
    ['I think it is a bug.', 'I restart everything.', 'The breathing is close to the mic.', 'The phone is lying on my pillow.'],
    'I turn to the pillow. The breathing stops. Then it whispers my name.', 'Sleep tight.', 'What would you have done?', RUN),
  S('Grandma Calls', 'anruf', 'haus', 'frau', 'frau', 'My grandma is calling. She died three years ago.', 'If your dead grandma calls, do exactly what she says.',
    ['I pick up.', 'At first it is silent.', 'She sounds very calm.', 'She says: Lock the door. He is already inside.'],
    'I lock the door. Behind me someone says: Thank you.', 'Thank you.', 'Would you have picked up?', ANSWER),
  S('Elevator Mirror', 'spiegel', 'aufzug', 'schatten', 'frau', 'The elevator mirror shows one more person. I am alone.', 'If you ride an elevator alone, never count the people in the mirror.',
    ['I check my phone like always.', 'At first I notice nothing.', 'The man in the mirror stands right behind me.', 'He raises a finger to his lips.'],
    'The doors open. I step out. In the mirror he rides on with me.', 'Shh.', 'Would you have stayed?', ['Stay', 'Get out']),
  S('Seat Taken', 'kind', 'zug', 'schatten', 'frau', 'On the night train a kid points at my seat: Someone is sitting there.', 'If a kid says your seat is already taken, believe them.',
    ['I laugh and ask about it.', 'The laugh does not last.', 'I sit down anyway.', 'The kid starts crying: Now you are sitting on him.'],
    'The seat under me is warm. And it is breathing.', 'Get up.', 'Would you have stood up?', ['Stand up', 'Stay seated']),
];

export const TAGS_EN = '#horror #scary #creepypasta #scarystories #horrorstory';

export function naechstesSkriptEn(bekannt = []) {
  const weg = new Set(bekannt);
  return SKRIPTE_EN.filter((s) => !pruefen(s).length).find((s) => !weg.has(slug(s.titel))) || null;
}
