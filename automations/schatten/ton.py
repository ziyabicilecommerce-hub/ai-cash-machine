# Tonspur der Schatten-Story: alles kostenlos aus ffmpeg erzeugt, dazu Erzähler- und Monsterstimme.
import os, subprocess


def tonspur(plan, gesamt, ordner):
    # Brummen + Rumpeln, Herzschlag wird schneller, Schläge bei Schrecks, Kreischen beim Jumpscare,
    # Flüstern, und Stille direkt vor dem Schreck (alles kostenlos aus ffmpeg erzeugt)
    herz = next((s['start'] for s in plan if s['art'] == 'schatten'), gesamt)
    ph = f"(t*(1+max(t-{herz:.2f},0)/18))"
    teile = [f"0.18*sin(2*PI*55*t)*(0.7+0.3*sin(2*PI*0.2*t))+0.1*sin(2*PI*82.4*t+sin(2*PI*0.5*t))",
             f"0.45*gte(t,{herz:.2f})*exp(-16*mod({ph},1))*sin(2*PI*48*t)",
             f"0.35*gte(t,{herz:.2f})*gte(mod({ph},1),0.25)*exp(-16*(mod({ph},1)-0.25))*sin(2*PI*44*t)"]
    bis = next((s['start'] for s in plan if s['art'] == 'station'), 0)
    if bis:
        teile.append(f"0.22*lt(t,{bis:.2f})*exp(-90*mod(t,0.5))*sin(2*PI*2600*t)")
    still = next((s['start'] for s in plan if s['art'] == 'dunkel'), 0)
    if still > 12:
        a0 = still - 14
        teile.append(f"0.3*between(t,{a0:.2f},{still:.2f})*pow((t-{a0:.2f})/14,2)*(sin(2*PI*(90+260*pow((t-{a0:.2f})/14,2))*t)+0.6*sin(2*PI*(181+520*pow((t-{a0:.2f})/14,2))*t))")
    for s in plan:
        a = f"{s['start']:.2f}"
        if s['art'] == 'klopfen':
            k = f"{s['start'] + s.get('schreck_bei', 0.55):.2f}"
            teile.append(f"1.0*gte(t,{k})*exp(-9*max(t-{k},0))*sin(2*PI*70*t)+0.5*gte(t,{k})*exp(-25*max(t-{k},0))*sin(2*PI*900*t*(1-0.3*(t-{k})))")
        if s.get('schreck'):
            teile.append(f"0.9*gte(t,{a})*exp(-3.5*max(t-{a},0))*sin(2*PI*38*t)")
        if s['art'] == 'fratze':
            teile.append(f"0.6*gte(t,{a})*exp(-2.2*max(t-{a},0))*sin(2*PI*(1300+700*sin(2*PI*11*t))*t)")
            teile.append(f"0.5*gte(t,{a})*exp(-2.2*max(t-{a},0))*sin(2*PI*(1750+500*sin(2*PI*17*t))*t)")
    stille = [s for s in plan if s.get('stille')]
    leise = '+'.join(f"between(t,{s['start']:.2f},{s['start'] + s['dauer']:.2f})" for s in stille) or '0'
    atem = '+'.join(f"between(t,{s['start']:.2f},{s['start'] + s['dauer']:.2f})" for s in plan if s.get('atem')) or '0'
    fluester = '+'.join(f"between(t,{s['start']:.2f},{s['start'] + s['dauer']:.2f})" for s in plan if s.get('fluestern')) or '0'
    eingaben = ['-f', 'lavfi', '-i', f"aevalsrc='{'+'.join(teile)}':s=44100:d={gesamt:.2f}",
                '-f', 'lavfi', '-i', f'anoisesrc=color=brown:amplitude=0.2:d={gesamt:.2f}',
                '-f', 'lavfi', '-i', f'anoisesrc=color=white:amplitude=0.5:d={gesamt:.2f}',
                '-f', 'lavfi', '-i', f'anoisesrc=color=pink:amplitude=0.6:d={gesamt:.2f}']
    filter_ = (f"[0]volume='if(gt({leise},0),0.03,1)':eval=frame[b];[1]lowpass=f=160,volume='if(gt({leise},0),0.05,1)':eval=frame[n];"
               f"[2]bandpass=f=2800:w=1800,volume='0.5*gt({fluester},0)*(0.4+0.6*abs(sin(2*PI*2.3*t)))':eval=frame,aecho=0.8:0.7:90:0.4[w];"
               f"[3]bandpass=f=700:w=900,volume='0.9*gt({atem},0)*pow(max(sin(2*PI*0.35*t),0),3)':eval=frame[at];")
    mix = ['[b]', '[n]', '[w]', '[at]']
    for i, s in enumerate(x for x in plan if x['datei']):
        eingaben += ['-i', s['datei']]
        ms = int(s['start'] * 1000) + 120
        filter_ += f'[{i + 4}]aresample=44100,aecho=0.8:0.6:70|140:0.25|0.12,volume=2.4,adelay={ms}|{ms}[v{i}];'
        mix.append(f'[v{i}]')
    nr = len(mix)
    for j, s in enumerate(x for x in plan if x.get('mdatei')):
        eingaben += ['-i', s['mdatei']]
        ms = int((s['start'] + s['mbei']) * 1000)
        filter_ += (f'[{nr + j}]aresample=44100,asetrate=44100*0.82,aresample=44100,aecho=0.8:0.85:40|90|170:0.5|0.35|0.22,'
                    f'highpass=f=60,volume=3.2,adelay={ms}|{ms}[m{j}];')
        mix.append(f'[m{j}]')
    filter_ += f"{''.join(mix)}amix=inputs={len(mix)}:normalize=0,afade=t=out:st={gesamt - 1.5:.2f}:d=1.5,alimiter=limit=0.92[a]"
    ton = os.path.join(ordner, 'ton.m4a')
    subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', *eingaben, '-filter_complex', filter_, '-map', '[a]', '-ac', '2', '-c:a', 'aac', '-b:a', '192k', ton], check=True)
    return ton
