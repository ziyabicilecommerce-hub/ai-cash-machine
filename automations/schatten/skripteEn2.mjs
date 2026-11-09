// More English stories in our two strongest YouTube patterns (07.11.: "Doorbell Camera" 1100 views, "Calling Myself" 950).
// Written by hand, same rules as skripteEn.mjs: hook <= 70 chars, key sentences last, "you" hook for the A/B test.
const S = (titel, muster, ort, boesewicht, stimme, hook, hook2, saetze, ende, monster, frage, wahl) =>
  ({ titel, muster, ort, boesewicht, stimme, hook, hook2, saetze, ende, monster, frage, wahl, sprache: 'en', herkunft: 'skriptbot-en' });
const ANSWER = ['Answer', 'Hang up'];
const RUN = ['Check it out', 'Run'];
const ruf = (titel, boese, stimme, hook, hook2, voice, says, ende, monster) =>
  S(titel, 'anruf', 'haus', boese, stimme, hook, hook2, ['I pick up.', 'At first it is silent.', voice, says], ende, monster, 'Would you have picked up?', ANSWER);
const cam = (titel, ort, boese, hook, hook2, sees, then, ende, monster) =>
  S(titel, 'kamera', ort, boese, 'mann', hook, hook2, ['I watch the clip.', 'At first there is nothing.', sees, then], ende, monster, 'What would you have done?', RUN);

export const SKRIPTE_EN2 = [
  ruf('Dead Brother Calls', 'schatten', 'mann', 'My phone rings at 3 AM. It is my dead brother.', 'If your dead brother calls you, never go to the basement.',
    'He sounds like he did at twelve.', 'He whispers: You left me in the basement that day.', 'Downstairs the basement door opens. Very slowly.', 'I am still here.'),
  ruf('Sister in the Shower', 'frau', 'frau', 'My sister is calling. But I can hear her singing in the shower.', 'If your sister calls from the shower, do not open the door.',
    'She is crying.', 'She says: I am locked out. Who is in the house with you?', 'The shower stops. The bathroom door opens.', 'Who was that, honey?'),
  ruf('Baby Monitor Call', 'gremlin', 'mann', 'At 3 AM the baby monitor calls my phone. We have no baby.', 'If your baby monitor calls you and you have no baby, hang up.',
    'I hear a music box.', 'A small voice says: I already warmed up your bed.', 'I look at my bed. The blanket is rising.', 'Come cuddle.'),
  ruf('Call From the Grave', 'schatten', 'mann', 'My grandpa was buried with his phone. Today it is calling me.', 'Never bury a phone. One day it will call you.',
    'I hear dirt falling.', 'He says calmly: It is tight in here. Come get me.', 'In the morning my hands are full of dirt. And wood under my nails.', 'Hurry.'),
  ruf('Call From Tomorrow', 'schatten', 'mann', 'My phone rings. The call is from tomorrow, 3:12 AM.', 'If your future self calls you, do exactly what it says.',
    'It is my own voice. Hoarse.', 'I say: Whatever happens, do not sleep in your bed tonight.', 'I sleep on the couch. At 3:12 AM someone lies down in my bed.', 'Good night.'),
  ruf('The Landline', 'schatten', 'mann', 'The old phone in my hall is ringing. It has no cable.', 'If your phone rings without a cable, do not pick up.',
    'It crackles like the old days.', 'A man says: I am calling from your bedroom.', 'I hear him from the bedroom. At the same time. Without a phone.', 'Do not hang up.'),
  ruf('Video Call at 3 AM', 'frau', 'frau', 'At 3:12 AM an unknown number video calls me.', 'If a stranger video calls you at 3 AM, do not answer.',
    'The screen is dark. Only breathing.', 'Then a light turns on in the video. It is my bedroom.', 'In the video someone lies next to me. Next to me there is no one.', 'Look left.'),
  ruf('Silent Caller', 'gremlin', 'mann', 'Every night at 3 AM someone calls me and says nothing.', 'If someone calls you every night and says nothing, listen closely.',
    'Tonight I listen closer.', 'I hear my own TV. With a delay.', 'He is not on the phone. He is in my living room. And he hangs up now.', 'Soon.'),
  ruf('Dad in the Car', 'schatten', 'mann', 'My dad is calling. But his phone is on the table next to me.', 'If your dad calls and his phone is next to you, run.',
    'I hear an engine.', 'He says: I am almost home. Do not let in anyone who looks like me.', 'The doorbell rings. Through the peephole Dad waves. Phone at his ear.', 'Open up, it is me.'),
  ruf('The Hotline Knows', 'gremlin', 'frau', 'I call a hotline at night. The voice knows my name.', 'If a hotline knows your name at night, hang up now.',
    'She sounds friendly.', 'She says: Your problem is standing behind you. We are sending someone.', 'The doorbell rings. The hold music is playing in my hallway.', 'Please hold.'),
  cam('Garage Camera', 'haus', 'schatten', 'My garage camera shows my car leaving at 3 AM. I have the keys.', 'If your garage camera shows your car leaving, stay inside.',
    'The garage door opens by itself.', 'The headlights turn on. Nobody is in the driver seat.', 'In the morning the car is back. The seat is set for someone much taller.', 'Thanks for the ride.'),
  cam('Window Camera', 'haus', 'frau', 'My window camera filmed a woman outside at 3 AM. I live on floor 9.', 'If your camera shows someone outside a high window, close the blinds.',
    'Her face is pressed against the glass.', 'She is not standing on anything.', 'She knocks twice. Then she points at my bed.', 'Let me in.'),
  cam('Old Tape', 'haus', 'gremlin', 'I found an old tape in my new house. It has my name on it.', 'If you find a tape with your name on it, do not play it.',
    'It shows my bedroom, but older.', 'A child walks in and lies down in my bed. Then he looks at the camera.', 'The date on the tape is next week.', 'Welcome home.'),
  cam('Elevator Camera', 'aufzug', 'schatten', 'The elevator camera shows me riding with someone. I was alone.', 'If an elevator camera shows you were not alone, take the stairs.',
    'A tall man stands right behind me.', 'His head is bent because the ceiling is too low for him.', 'When I get out, he stays. And presses the button for my floor again.', 'See you tonight.'),
  cam('Baby Cam', 'haus', 'frau', 'The baby cam shows someone rocking the crib at 3 AM.', 'If your baby cam shows someone at the crib, do not go in.',
    'A tall woman in grey stands at the crib.', 'My wife is asleep next to me. I check twice.', 'She turns to the camera and puts a finger to her lips.', 'Shh.'),
  cam('Store Camera', 'haus', 'schatten', 'The store camera shows me in aisle 4. I am at the register.', 'If you see yourself on a store camera, do not go looking.',
    'The other me stands still and stares at the camera.', 'Then he walks toward the register. Toward me.', 'I look up from the screen. He is standing in the doorway.', 'My turn.'),
  cam('Night Shift Camera', 'haus', 'schatten', 'I guard an empty office at night. Camera 4 shows a man at my desk.', 'If you work nights, never look at camera 4.',
    'He is typing on my computer.', 'I am in the security room. Two floors down.', 'He stops typing. He looks right at camera 4.', 'Come upstairs.'),
  cam('Pet Camera', 'haus', 'schatten', 'My pet camera sent an alert at 3 AM. My cat is with me.', 'If your pet camera alerts you at night, do not open the clip.',
    'Something crawls across the kitchen floor.', 'It is too long to be a cat. Too flat to be a person.', 'It stops under the camera and looks up. It has my mouth.', 'Meow.'),
  cam('Hotel Peephole', 'haus', 'frau', 'My phone filmed my hotel peephole all night. I set no timer.', 'Never film the peephole of your hotel room at night.',
    'Hour after hour, an empty hallway.', 'At 3:12 AM an eye appears on the other side. It does not blink.', 'At 6 AM the eye is still there. On my side of the door.', 'Good morning.'),
  cam('Selfie Mode', 'haus', 'gremlin', 'My front camera turned on by itself at 3 AM. I was in bed.', 'If your front camera turns on alone at night, do not look.',
    'It shows my face, asleep.', 'Behind my pillow a hand comes out of the wall.', 'The hand reaches for my phone. My phone is gone.', 'Say cheese.'),
];

// Pattern "zahl" (one too many) - our TikTok hits of 07./08.11. (774 / 744 views), now in English too
const zahl = (titel, ort, boese, hook, hook2, doubt, proof, then, ende, monster) =>
  S(titel, 'zahl', ort, boese, 'mann', hook, hook2, ['I count again.', doubt, proof, then], ende, monster, 'Would you have counted again?', ['Count again', 'Run']);
SKRIPTE_EN2.push(
  zahl('One Extra on Every Photo', 'wald', 'schatten', 'We hiked as 3 people. On every photo there are 4 of us.', 'After a hike, count the people on your photos.',
    'There really are only three of us.', 'On every photo someone stands behind me.', 'In every picture he is a little closer.', 'On the last photo there are only two of us. I am missing.', 'I belong here.'),
  zahl('Fourteen Steps', 'haus', 'schatten', 'My stairs have 13 steps. Tonight I hear 14 footsteps.', 'Tonight, count the footsteps on your stairs.',
    'I stop on step thirteen.', 'The footsteps keep going. One step more.', 'The extra step is right behind me.', 'In the morning my stairs have 14 steps. The new one is warm.', 'Fourteen.'),
  zahl('The Class Photo', 'haus', 'gremlin', 'My class photo has 24 kids. The app counts 25 faces.', 'Let an app count the faces on your class photo.',
    'I count the kids myself. Twenty-four.', 'The app marks a face in the very back.', 'It is my face. As a child.', 'On the photo the child slowly turns to the camera.', 'I am still at school.'),
  zahl('The Third Plate', 'haus', 'frau', 'I set the table for 2. At night there is a 3rd plate.', 'If there is an extra plate on your table at night, do not touch it.',
    'My boyfriend swears it was not him.', 'The third plate has been used.', 'Next to it lies a knife. Licked clean.', 'In the morning there are 3 toothbrushes. One is wet.', 'Delicious.'),
  zahl('The Second Bed', 'haus', 'frau', 'My hotel room has 1 bed. My phone photo shows 2.', 'Take a photo of your hotel bed before you sleep.',
    'There really is only one bed.', 'On the photo someone lies in the second bed.', 'The blanket is pulled up to the chin.', 'I look back into the room. Someone is lying in my bed now.', 'Good night.'),
  zahl('Elevator Scale', 'aufzug', 'schatten', 'There are 2 of us in the elevator. The scale says 3 people.', 'If the elevator scale shows more than you weigh, get out.',
    'My girlfriend and me. No one else.', 'The scale shows 80 kilos too many.', 'Something breathes on my neck.', 'The door opens. My girlfriend gets out. I do not.', 'Basement.'),
  zahl('Sixth in the Chat', 'haus', 'gremlin', 'My group chat has 5 people. Tonight 6 are typing.', 'If one too many is typing in your group chat, do not read it.',
    'There are only five of us in the group.', 'The sixth message comes from my phone.', 'I wrote nothing. I was asleep.', 'The message says: He is asleep. Come now.', 'Hi guys.'),
  zahl('Two Tickets', 'haus', 'schatten', 'I sit alone in row 13 of the cinema. The app shows 2 tickets.', 'If the seat next to you folds down in an empty cinema, stay seated.',
    'I really am alone in the room.', 'The seat next to me folds down.', 'Popcorn crackles. Right next to me.', 'In the credits I see my name. And next to it: plus one.', 'Shh, the movie is starting.'),
  zahl('Thirty-One Candles', 'haus', 'frau', 'My cake has 30 candles. On the photo 31 are burning.', 'Count the candles on your birthday photo.',
    'I am turning thirty. There were thirty candles.', 'On the photo one more candle is burning.', 'It is right in front of my face.', 'I blow them all out. The last one keeps burning.', 'Make a wish.'),
  zahl('Third Sleeping Bag', 'wald', 'hirsch', 'There are 2 of us in the tent. At 3 AM I count 3 sleeping bags.', 'Never count the sleeping bags if you wake up in your tent at night.',
    'My buddy is asleep next to me.', 'Three sleeping bags. One does not move.', 'A hoof sticks out of the third one.', 'In the morning the third bag is empty. So is my buddy.', 'Go back to sleep.'),
  zahl('Fifth Window', 'haus', 'frau', 'My house has 4 windows at the front. At night 5 are lit.', 'Go outside and count the windows of your home.',
    'I go out and count from the street.', 'The fifth window is between kitchen and bathroom.', 'Inside there is only a wall.', 'Someone stands in the fifth window and waves. With my hand.', 'I see you.'),
  zahl('Fourth Key', 'haus', 'schatten', 'I own 3 keys. Tonight 4 are hanging on the hook.', 'If you have one more key than you ever made, run.',
    'I only ever had three made.', 'The fourth key is still warm.', 'It fits my bedroom door. From the inside.', 'In the morning the fourth key is gone. And my door is locked.', 'I have one too.'),
);
