// Hem (spec v3 s. 27): det viktigaste just nu med en knapp till nästa steg, kom igång tills allt är klart,
// och appar. Kom igång läses live, så att en bock syns direkt när någon i kontot gjort steget.
import { useEffect } from 'react';
import { Link } from '@tanstack/react-router';
import { Fellage, Laddning, TomtLage } from '@flodia/ui';
import { guideFor, komIgang } from '@flodia/guides';
import { useKontoLage } from '../data';
import { useKonto } from './KontoSkal';

const halsning = (nu = new Date()) => {
  const h = +new Intl.DateTimeFormat('sv-SE', { hour: 'numeric', hourCycle: 'h23', timeZone: 'Europe/Stockholm' }).format(nu);
  return h < 10 ? 'God morgon' : h < 18 ? 'Hej' : 'God kväll';
};
const datum = (nu = new Date()) => { const s = new Intl.DateTimeFormat('sv-SE', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/Stockholm' }).format(nu); return s[0]!.toUpperCase() + s.slice(1); };

export function Hem() {
  const k = useKonto();
  const forsta = k.moduler.find(m => guideFor(m.modul.nyckel, m.variant));
  const guide = forsta ? guideFor(forsta.modul.nyckel, forsta.variant) : null;
  const { lage, fel } = useKontoLage(k.medlemskap.konto.id, forsta?.modul.nyckel ?? '', !!guide, guide?.samlingar);
  const status = guide && lage ? komIgang(guide, lage) : null;
  const bas = `/${k.medlemskap.konto.slug}`;

  useEffect(() => { k.setHjalp({ rubrik: 'Så funkar Hem', innehall: <p>Här ser du det viktigaste just nu och vad som är kvar att göra för att komma igång.</p> }); return () => k.setHjalp(null); }, [k.setHjalp]);

  return (
    <>
      <h1>{halsning()}, {k.anvandare.namn.split(' ')[0]}</h1>
      <p className="fl-hjalptext">{datum()} · {k.medlemskap.konto.name}</p>

      <section className="fl-kort" aria-labelledby="viktigast">
        <h2 id="viktigast">Det viktigaste just nu</h2>
        {!k.moduler.length ? (
          <TomtLage rubrik="Inga appar än" text="Kontot har inga appar. Kontakta Flödia för att komma igång." />
        ) : guide && !lage && !fel ? <Laddning /> : fel ? <Fellage text="Läget kunde inte hämtas." /> : status?.nasta && forsta ? (
          <>
            <p>Nästa steg i {forsta.modul.varianter[forsta.variant]!.namn}: <strong>{status.nasta.text}</strong></p>
            <Link className="fl-knapp fl-knapp-primar" to={`${bas}/${forsta.modul.nyckel}` as never}>Gå till {forsta.modul.varianter[forsta.variant]!.namn}</Link>
          </>
        ) : <p>Allt är klart för nu.</p>}
      </section>

      {status && status.klara < status.totalt && (
        <section className="fl-kort" aria-labelledby="komigang">
          <h2 id="komigang">Kom igång {status.klara} av {status.totalt}</h2>
          <ul className="fl-lista fl-checklista">
            {status.steg.map(s => (
              <li key={s.nyckel} data-steg={s.nyckel} data-klar={s.klar}>
                <span className={s.klar ? 'fl-bock klar' : 'fl-bock'} aria-hidden="true">{s.klar ? '✓' : ''}</span>
                <span>{s.text}<span className="fl-dold">{s.klar ? ', klart' : ', inte klart'}</span></span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="fl-kort" aria-labelledby="appar">
        <h2 id="appar">Appar</h2>
        {k.moduler.length ? (
          <ul className="fl-lista">{k.moduler.map(m => <li key={m.modul.nyckel}><Link to={`${bas}/${m.modul.nyckel}` as never}>{m.modul.varianter[m.variant]!.namn}</Link></li>)}</ul>
        ) : <p>Inga appar än.</p>}
      </section>
    </>
  );
}
