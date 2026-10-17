// Grundkomponenter enligt spec v3 s. 15 (del B). Bara färger från tokens.css. En grön knapp per skärm.
// Alla har tydlig fokusmarkering, etiketter och roller för skärmläsare (WCAG 2.2 AA).
import { useEffect, useId, useRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from 'react';

type KnappVariant = 'primar' | 'sekundar' | 'diskret';

export function Knapp({ variant = 'sekundar', className = '', ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: KnappVariant }) {
  return <button type="button" {...p} className={`fl-knapp fl-knapp-${variant} ${className}`.trim()} />;
}

export function Falt({ etikett, fel, hjalp, id, ...p }: InputHTMLAttributes<HTMLInputElement> & { etikett: string; fel?: string | null; hjalp?: string }) {
  const eget = useId(), faltId = id ?? eget;
  const beskrivning = [hjalp ? faltId + '-hjalp' : '', fel ? faltId + '-fel' : ''].filter(Boolean).join(' ') || undefined;
  return (
    <div className="fl-falt">
      <label htmlFor={faltId}>{etikett}</label>
      <input id={faltId} aria-invalid={fel ? true : undefined} aria-describedby={beskrivning} {...p} />
      {hjalp && <p id={faltId + '-hjalp'} className="fl-hjalptext">{hjalp}</p>}
      {fel && <p id={faltId + '-fel'} className="fl-feltext" role="alert">{fel}</p>}
    </div>
  );
}

/** Tomt läge: säger alltid vad nästa steg är (spec v3 s. 16). Aldrig bara "Ingen data". */
export function TomtLage({ rubrik, text, atgard }: { rubrik: string; text: string; atgard?: ReactNode }) {
  return (
    <section className="fl-tomt" aria-label={rubrik}>
      <h2>{rubrik}</h2>
      <p>{text}</p>
      {atgard && <div className="fl-tomt-atgard">{atgard}</div>}
    </section>
  );
}

export function Laddning({ text = 'Laddar' }: { text?: string }) {
  return <div className="fl-laddning" role="status" aria-live="polite"><span className="fl-snurra" aria-hidden="true" />{text}</div>;
}

export function Fellage({ text, forsokIgen }: { text: string; forsokIgen?: () => void }) {
  return (
    <div className="fl-fel" role="alert">
      <p>{text}</p>
      {forsokIgen && <Knapp onClick={forsokIgen}>Försök igen</Knapp>}
    </div>
  );
}

/** Brytare med förklaring (spec v3 s. 15). */
export function Brytare({ etikett, forklaring, pa, andra, inaktiv }: { etikett: string; forklaring: string; pa: boolean; andra: (pa: boolean) => void; inaktiv?: boolean }) {
  const id = useId();
  return (
    <div className="fl-brytare">
      <button type="button" role="switch" aria-checked={pa} aria-labelledby={id + '-e'} aria-describedby={id + '-f'} disabled={inaktiv} onClick={() => andra(!pa)} className="fl-brytare-knapp">
        <span aria-hidden="true" />
      </button>
      <div>
        <span id={id + '-e'} className="fl-brytare-etikett">{etikett}</span>
        <p id={id + '-f'} className="fl-hjalptext">{forklaring}</p>
      </div>
    </div>
  );
}

/** Exempelläge (spec v3 s. 16): tydlig gul banderoll, inget sparas. */
export function Exempelbanderoll({ avsluta }: { avsluta: () => void }) {
  return (
    <div className="fl-exempel" role="status">
      <span><strong>Exempeldata.</strong> Inget du gör här sparas.</span>
      <Knapp variant="diskret" onClick={avsluta}>Avsluta exempelläget</Knapp>
    </div>
  );
}

/** Modal dialog eller sidopanel: fokus flyttas in, Esc stänger, fokus går tillbaka efteråt. */
export function Dialog({ rubrik, oppen, stang, children, sida = false }: { rubrik: string; oppen: boolean; stang: () => void; children: ReactNode; sida?: boolean }) {
  const ref = useRef<HTMLDivElement>(null), id = useId();
  useEffect(() => {
    if (!oppen) return;
    const fore = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')?.focus();
    const tangent = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); stang(); }
      if (e.key === 'Tab' && ref.current) {
        const f = [...ref.current.querySelectorAll<HTMLElement>('button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')];
        if (!f.length) return;
        if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f.at(-1)!.focus(); }
        else if (!e.shiftKey && document.activeElement === f.at(-1)) { e.preventDefault(); f[0]!.focus(); }
      }
    };
    document.addEventListener('keydown', tangent);
    return () => { document.removeEventListener('keydown', tangent); fore?.focus?.(); };
  }, [oppen, stang]);
  if (!oppen) return null;
  return (
    <div className={sida ? 'fl-overlagg fl-overlagg-sida' : 'fl-overlagg'} onMouseDown={e => { if (e.target === e.currentTarget) stang(); }}>
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby={id} className={sida ? 'fl-panel' : 'fl-dialog'}>
        <div className="fl-dialog-huvud">
          <h2 id={id}>{rubrik}</h2>
          <Knapp variant="diskret" onClick={stang} aria-label="Stäng">Stäng</Knapp>
        </div>
        {children}
      </div>
    </div>
  );
}
