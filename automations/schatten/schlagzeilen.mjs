// Schlagzeile für die ersten 2,6 Sekunden: höchstens 6 Wörter, groß im Bild - wer nur kurz hinschaut, weiß sofort, worum es geht.
// Eine Warnung je Geschichten-Muster (Skript-Bot + englische Geschichten). A/B-Feature "schlag" (#113), der Wochenbericht misst die Wirkung.
export const SCHLAGZEILEN = {
  de: {
    allein: 'DU BIST NICHT ALLEIN', fremd: 'DREH DICH NICHT UM', kamera: 'SCHAU ES DIR NICHT AN', anruf: 'GEH NICHT RAN', regel: 'BRICH NIE DIESE REGEL',
    tier: 'ER SIEHT MEHR ALS DU', spiegel: 'SCHAU NICHT IN DEN SPIEGEL', geraet: 'DEIN HANDY WEISS ES', kind: 'HÖR AUF DAS KIND',
    lieferung: 'MACH NICHT AUF', wand: 'KLOPF NIE ZURÜCK', doppel: 'DAS BIST NICHT DU', schicht: 'BLEIB HEUTE ZU HAUSE', memo: 'HÖR ES DIR NICHT AN',
    zahl: 'ZÄHL NOCHMAL NACH', traum: 'WACH AUF', himmel: 'SCHAU NICHT NACH OBEN',
    verlauf: 'DEIN HANDY WAR WACH', fund: 'HEB ES NICHT AUF', nachbar: 'TRAU DEINEM NACHBARN NICHT',
  },
  en: {
    allein: 'YOU ARE NOT ALONE', fremd: 'DO NOT TURN AROUND', kamera: 'DO NOT WATCH THE CLIP', anruf: 'DO NOT PICK UP', regel: 'NEVER BREAK THIS RULE',
    tier: 'HE SEES MORE THAN YOU', spiegel: 'DO NOT LOOK IN THE MIRROR', geraet: 'YOUR PHONE KNOWS', kind: 'LISTEN TO THE KID',
    lieferung: 'DO NOT OPEN THE DOOR', wand: 'NEVER KNOCK BACK', doppel: 'THAT IS NOT YOU', schicht: 'STAY HOME TONIGHT', memo: 'DO NOT LISTEN TO IT',
    zahl: 'COUNT AGAIN', traum: 'WAKE UP', himmel: 'DO NOT LOOK UP',
    verlauf: 'YOUR PHONE WAS AWAKE', fund: 'DO NOT PICK IT UP', nachbar: 'DO NOT TRUST YOUR NEIGHBOR',
  },
};
export const schlagzeile = (muster, sprache = 'de') => SCHLAGZEILEN[sprache === 'en' ? 'en' : 'de'][muster] || '';
