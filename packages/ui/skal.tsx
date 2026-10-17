// Skalet enligt spec v3 s. 25 till 44: samma skal för alla kunder. Sidomeny med kontoblocket överst
// (kontoväljaren), grupper och en fot med hjälp. Toppfält med brödsmulor, sök, "Så funkar det" och avatar.
// På smal skärm (375 punkter) blir sidomenyn en meny bakom en knapp.
import { useState, type ReactNode } from 'react';
import { Knapp } from './komponenter';

export interface MenyPost { nyckel: string; namn: string; href: string; aktiv?: boolean; antal?: number }
export interface MenyGrupp { rubrik?: string; poster: MenyPost[] }
/** Länken som routern använder. */
export type Lank = (p: { href: string; className?: string; children: ReactNode; 'aria-current'?: 'page'; onClick?: () => void }) => ReactNode;

export const initialer = (namn: string) => namn.split(/\s+/).filter(w => /^[\p{L}\p{N}]/u.test(w)).slice(0, 2).map(w => w[0]!.toUpperCase()).join('') || '?';

export function Kontoblock({ namn, typ, onClick }: { namn: string; typ: string; onClick: () => void }) {
  return (
    <button type="button" className="fl-kontoblock" onClick={onClick} aria-label={`Konto: ${namn}, ${typ}. Byt konto`}>
      <span className="fl-avatar" aria-hidden="true">{initialer(namn)}</span>
      <span><strong>{namn}</strong><small>{typ}</small></span>
    </button>
  );
}

export function Skal(p: {
  kontoblock: ReactNode;
  grupper: MenyGrupp[];
  lank: Lank;
  brodsmulor: { namn: string; href?: string }[];
  hjalp: () => void;
  anvandare: { namn: string; loggaUt: () => void };
  driverAv: boolean;
  banderoll?: ReactNode;
  /** Innehållet fyller hela ytan till höger om menyn (bredd och höjd), till exempel den nuvarande appen i en ram. */
  fyll?: boolean;
  /** Helskärm: menyn och toppraden döljs. */
  helskarm?: boolean;
  children: ReactNode;
}) {
  const [menyOppen, setMenyOppen] = useState(false);
  const L = p.lank;
  return (
    <div className={['fl-skal', p.fyll ? 'fl-skal-fyll' : '', p.helskarm ? 'fl-skal-helskarm' : ''].filter(Boolean).join(' ')}>
      <a className="fl-hoppa" href="#innehall">Hoppa till innehållet</a>
      <aside className={menyOppen ? 'fl-sidomeny oppen' : 'fl-sidomeny'} aria-label="Sidomeny">
        {p.kontoblock}
        <nav aria-label="Huvudmeny">
          {p.grupper.map((g, i) => (
            <div key={i} className="fl-menygrupp">
              {g.rubrik && <h2>{g.rubrik}</h2>}
              <ul>
                {g.poster.map(m => (
                  <li key={m.nyckel}>
                    <L href={m.href} className={m.aktiv ? 'aktiv' : undefined} aria-current={m.aktiv ? 'page' : undefined} onClick={() => setMenyOppen(false)}>
                      {m.namn}{m.antal ? <span className="fl-antal">{m.antal}</span> : null}
                    </L>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
        <div className="fl-sidomeny-fot">
          <button type="button" className="fl-lanklik" onClick={p.hjalp}>Hjälp och guider</button>
          {p.driverAv && <small>Drivs av Flödia</small>}
        </div>
      </aside>
      <div className="fl-huvudyta">
        <header className="fl-toppfalt">
          <Knapp variant="diskret" className="fl-menyknapp" aria-expanded={menyOppen} onClick={() => setMenyOppen(!menyOppen)}>Meny</Knapp>
          <nav aria-label="Du är här" className="fl-brodsmulor">
            <ol>{p.brodsmulor.map((b, i) => <li key={i}>{b.href && i < p.brodsmulor.length - 1 ? <L href={b.href}>{b.namn}</L> : <span aria-current={i === p.brodsmulor.length - 1 ? 'page' : undefined}>{b.namn}</span>}</li>)}</ol>
          </nav>
          <span className="fl-grow" />
          <label className="fl-sok"><span className="fl-dold">Sök</span><input type="search" placeholder="Sök" disabled title="Sök kommer senare" /></label>
          <Knapp variant="diskret" onClick={p.hjalp}>Så funkar det</Knapp>
          {/* Plats för "Fråga" (assistenten, fas A). */}
          <span className="fl-fraga-plats" aria-hidden="true" />
          <details className="fl-anvandare">
            <summary aria-label={`Inloggad som ${p.anvandare.namn}`}><span className="fl-avatar" aria-hidden="true">{initialer(p.anvandare.namn)}</span></summary>
            <div><p>{p.anvandare.namn}</p><Knapp onClick={p.anvandare.loggaUt}>Logga ut</Knapp></div>
          </details>
        </header>
        {p.banderoll}
        <main id="innehall" className={p.fyll ? 'fl-innehall fl-innehall-fyll' : 'fl-innehall'} tabIndex={-1}>{p.children}</main>
      </div>
    </div>
  );
}
