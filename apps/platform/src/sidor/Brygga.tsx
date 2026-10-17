// Legacy-bryggan (beslut 8): den nuvarande appen i en ram, bara för interna konton.
// HTML:en hämtas från Edge Function legacy med användarens token. Den ligger aldrig som en öppen fil
// (undantaget från beslut 26 i packages/server/legacy.ts). Appen når databasen via window.flodiaClaude,
// alltså documents-API:t med användarens rättigheter. Legacy-filerna ändras inte: bara ramen runt dem.
// Ramen fyller hela ytan till höger om menyn. Helskärm döljer menyn och toppraden, Esc eller knappen går tillbaka.
// Appens rubrik visar kontots namn och flikens titel är "Bolagsnamn · Appnamn" (rubrik.ts).
import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from '@tanstack/react-router';
import { skapaClaude } from '@flodia/api';
import { Fellage, Knapp, Laddning } from '@flodia/ui';
import { fliktitel, visaBolagsnamn, type RubrikApp } from '../rubrik';
import { ANON, URL_SUPABASE, supabase } from '../supabase';
import { useKonto } from './KontoSkal';

declare global { interface Window { flodiaClaude?: { use: (namn: string) => Promise<unknown> } } }

export function Brygga() {
  const k = useKonto();
  const { modul } = useParams({ strict: false }) as { modul: string };
  const [html, setHtml] = useState<string | null>(null), [fel, setFel] = useState<string | null>(null);
  const kontoId = k.medlemskap.konto.id, { id: anvId, namn: anvNamn } = k.anvandare;
  const ram = useRef<HTMLIFrameElement>(null);
  const { helskarm, setHelskarm } = k;
  // Bolagets namn från kontot (samma som i bolagsväljaren och sidomenyn) och appens namn från modulen.
  const bolag = k.medlemskap.konto.name;
  const appnamn = k.moduler.find(m => m.modul.nyckel === modul)?.modul.namn ?? modul;
  const slutaBevaka = useRef<(() => void) | null>(null);

  useEffect(() => {
    const fore = document.title;
    document.title = fliktitel(bolag, appnamn);
    return () => { document.title = fore; };
  }, [bolag, appnamn]);
  useEffect(() => () => { slutaBevaka.current?.(); }, []);

  /** När appen har laddats i ramen: bolagets namn som rubrik. Utan åtkomst till ramen står appens rubrik kvar. */
  const laddad = () => {
    slutaBevaka.current?.();
    slutaBevaka.current = null;
    try {
      const doc = ram.current?.contentDocument;
      if (doc) slutaBevaka.current = visaBolagsnamn(doc, modul as RubrikApp, bolag, appnamn);
    } catch { /* ramen går inte att nå: appens egen rubrik står kvar */ }
  };

  useEffect(() => {
    let avbruten = false;
    void (async () => {
      const { data } = await supabase.auth.getSession();
      const r = await fetch(`${URL_SUPABASE}/functions/v1/legacy?konto=${kontoId}&app=${encodeURIComponent(modul)}`, {
        headers: { authorization: 'Bearer ' + (data.session?.access_token ?? ''), apikey: ANON },
      }).catch(() => null);
      if (avbruten) return;
      if (!r) { setFel('Servern svarar inte. Försök igen om en stund.'); return; }
      if (!r.ok) { const j = await r.json().catch(() => null) as { fel?: { text?: string } } | null; setFel(j?.fel?.text ?? 'Appen kunde inte öppnas.'); return; }
      window.flodiaClaude = skapaClaude({ supabase, konto: kontoId, modul, anvandare: { id: anvId, namn: anvNamn } });
      setHtml(await r.text());
    })();
    return () => { avbruten = true; };
  }, [kontoId, modul, anvId, anvNamn]);

  // Esc avslutar helskärm, även när fokus är inne i appen (ramen har samma ursprung, srcdoc).
  useEffect(() => {
    if (!helskarm) return;
    const tangent = (e: KeyboardEvent) => { if (e.key === 'Escape') setHelskarm(false); };
    const iRam = () => { try { return ram.current?.contentWindow ?? null; } catch { return null; } };
    document.addEventListener('keydown', tangent);
    const w = iRam(); w?.addEventListener('keydown', tangent);
    return () => { document.removeEventListener('keydown', tangent); w?.removeEventListener('keydown', tangent); };
  }, [helskarm, setHelskarm, html]);

  return (
    <div className="fl-brygga-yta">
      {helskarm ? (
        <Knapp className="fl-helskarm-ut" onClick={() => setHelskarm(false)}>Avsluta helskärm (Esc)</Knapp>
      ) : (
        <div className="fl-brygga-rad">
          <Link to={`/${k.medlemskap.konto.slug}/${modul}` as never}>Tillbaka</Link>
          <Knapp variant="diskret" onClick={() => setHelskarm(true)} disabled={html === null}>Helskärm</Knapp>
        </div>
      )}
      {fel ? <Fellage text={fel} /> : html === null ? <Laddning text="Öppnar appen" /> : <iframe ref={ram} className="fl-brygga" title="Nuvarande app" srcDoc={html} onLoad={laddad} />}
    </div>
  );
}
