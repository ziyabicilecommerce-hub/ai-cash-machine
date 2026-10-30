# Tonspur der Schatten-Story: alles kostenlos aus ffmpeg erzeugt, dazu Erzähler- und Monsterstimme.
import os, subprocess


def tonspur(plan, gesamt, ordner, schlicht=False):
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
    glas, rauschen = [], []
    if schlicht:
        teile = ['0'] + [f"0.9*gte(t,{s['start']:.2f})*exp(-5*max(t-{s['start']:.2f},0))*sin(2*PI*42*t)" for s in plan if s['art'] == 'fratze']
        fr = next((s['start'] for s in plan if s['art'] == 'fratze'), 0)
        if fr > 6:  # Spannung: Brummen wird bis zum Jumpscare lauter, kurz davor steigt ein Ton an
            teile.append(f"0.14*lt(t,{fr:.2f})*(t/{fr:.2f})*(0.6+0.4*sin(2*PI*0.5*t))*sin(2*PI*55*t)")
            r0 = fr - 2.5
            teile.append(f"0.2*between(t,{r0:.2f},{fr:.2f})*pow((t-{r0:.2f})/2.5,2)*sin(2*PI*(160+260*(t-{r0:.2f}))*t)")
        for s in plan[1:]:  # dumpfer Schlag bei jedem Szenenwechsel: alle paar Sekunden passiert etwas
            if s['art'] not in ('fratze', 'teil2'):
                teile.append(f"0.35*gte(t,{s['start']:.2f})*exp(-16*max(t-{s['start']:.2f},0))*sin(2*PI*50*t)")
        for s in plan:
            if s['art'] == 'scheibe':  # Handschlag, dann Bruch: dumpfer Schlag + Glasklirren
                for k, st in ((s['start'] + s.get('schlag', 0.25), 0.6), (s['start'] + s.get('schreck_bei', 1.0), 1.0)):
                    teile.append(f"{st}*gte(t,{k:.2f})*exp(-7*max(t-{k:.2f},0))*sin(2*PI*55*t)")
                glas.append(s['start'] + s.get('schreck_bei', 1.0))
            if s['art'] in ('masken', 'taschenlampe'):  # dumpfer Schlag beim Strom-Aus / Klick der Lampe
                teile.append(f"0.6*gte(t,{s['start']:.2f})*exp(-12*max(t-{s['start']:.2f},0))*sin(2*PI*70*t)")
            if s['art'] == 'turbulenz':  # Dröhnen und Rütteln
                a, e = s['start'], s['start'] + s['dauer']
                teile.append(f"0.5*between(t,{a:.2f},{e:.2f})*(0.6+0.4*sin(2*PI*7*t))*sin(2*PI*36*t)")
            if s['art'] == 'zelt':  # langsame Schritte ums Zelt
                a, e = s['start'], s['start'] + s['dauer'] - 1.3
                teile.append(f"0.45*between(t,{a:.2f},{e:.2f})*exp(-22*mod(t-{a:.2f},0.75))*sin(2*PI*58*t)")
            if s['art'] in ('klopfen', 'klinke'):  # drei dumpfe Klopfer an Tür/Fenster
                for i in range(3):
                    k = s['start'] + s.get('schreck_bei', 0.55) + i * 0.32
                    teile.append(f"0.8*gte(t,{k:.2f})*exp(-28*max(t-{k:.2f},0))*sin(2*PI*85*t)")
            if s['art'] == 'licht':  # Klack, wenn das Licht ausgeht
                k = s['start'] + 1.3
                teile.append(f"0.5*gte(t,{k:.2f})*exp(-40*max(t-{k:.2f},0))*sin(2*PI*160*t)")
            if s['art'] == 'fernseher':  # Fernseh-Rauschen
                rauschen.append((s['start'], s['start'] + s['dauer']))
            if s['art'] == 'rennen':  # Schritte
                a, e = s['start'], s['start'] + s['dauer']
                teile.append(f"0.55*between(t,{a:.2f},{e:.2f})*exp(-30*mod(t-{a:.2f},0.3))*sin(2*PI*62*t)")
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
    mix = ['[b]', '[n]'] if schlicht else ['[b]', '[n]', '[w]', '[at]']
    if schlicht:
        filter_ = filter_.split('[n];')[0] + '[n];'
        if rauschen:
            zeit = '+'.join(f"between(t,{a:.2f},{e:.2f})" for a, e in rauschen)
            filter_ += f"[3]lowpass=f=6000,volume='0.45*gt({zeit},0)':eval=frame[rs];"
            mix.append('[rs]')
        if glas:
            huelle = '+'.join(f"gte(t,{g:.2f})*exp(-3.5*max(t-{g:.2f},0))" for g in glas)
            filter_ += f"[2]highpass=f=2200,volume='1.6*({huelle})':eval=frame[gl];"
            mix.append('[gl]')
    for i, s in enumerate(x for x in plan if x['datei']):
        eingaben += ['-i', s['datei']]
        ms = int(s['start'] * 1000) + 120
        hall = 'aecho=0.8:0.4:35:0.12' if schlicht else 'aecho=0.8:0.6:70|140:0.25|0.12'
        filter_ += f'[{i + 4}]aresample=44100,{hall},volume=2.4,adelay={ms}|{ms}[v{i}];'
        mix.append(f'[v{i}]')
    nr = eingaben.count('-i')  # Eingang der ersten Monster-Datei (nach den 4 Geraeusch-Quellen und allen Erzaehler-Saetzen)
    for j, s in enumerate(x for x in plan if x.get('mdatei')):
        eingaben += ['-i', s['mdatei']]
        ms = int((s['start'] + s['mbei']) * 1000)
        effekt = 'aecho=0.8:0.5:60:0.25' if schlicht else 'asetrate=44100*0.82,aresample=44100,aecho=0.8:0.85:40|90|170:0.5|0.35|0.22'
        filter_ += f'[{nr + j}]aresample=44100,{effekt},highpass=f=60,volume=2.6,adelay={ms}|{ms}[m{j}];'
        mix.append(f'[m{j}]')
    angst = [x for x in plan if x.get('stille') or x.get('angst', 0) >= 0.8]
    if schlicht and angst:  # Herzschlag in den stillen und panischen Szenen - eigene Quelle, damit die Stille ihn nicht wegdreht
        zeit = '+'.join(f"between(t,{x['start']:.2f},{x['start'] + x['dauer']:.2f})" for x in angst)
        herz = f"gt({zeit},0)*(exp(-22*mod(t,0.8))+0.7*exp(-22*mod(max(t-0.17,0),0.8)))*sin(2*PI*46*t)"
        eingaben += ['-f', 'lavfi', '-i', f"aevalsrc='0.55*{herz}':s=44100:d={gesamt:.2f}"]
        filter_ += f"[{eingaben.count('-i') - 1}]lowpass=f=120[hz];"
        mix.append('[hz]')
    filter_ += f"{''.join(mix)}amix=inputs={len(mix)}:normalize=0,afade=t=out:st={gesamt - 1.5:.2f}:d=1.5,alimiter=limit=0.92[a]"
    ton = os.path.join(ordner, 'ton.m4a')
    subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', *eingaben, '-filter_complex', filter_, '-map', '[a]', '-ac', '2', '-c:a', 'aac', '-b:a', '192k', ton], check=True)
    return ton
