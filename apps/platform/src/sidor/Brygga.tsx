// Legacy-bryggan (beslut 8): den nuvarande appen i en ram, bara för interna konton.
// HTML:en hämtas från Edge Function legacy med användarens token. Den ligger aldrig som en öppen fil
// (undantaget från beslut 26 i packages/server/legacy.ts). Appen når databasen via window.flodiaClaude,
// alltså documents-API:t med användarens rättigheter. Legacy-filerna ändras inte: bara ramen runt dem.
// Ramen fyller hela ytan till höger om menyn. Helskärm döljer menyn och toppraden, Esc eller knappen går tillbaka.
// Appens rubrik visar kontots namn och flikens titel är "Bolagsnamn · Appnamn" (rubrik.ts).
// Ramen (LegacyRam) används också i chattens panel till höger.
import { useEffect, useId, useRef, useState, type RefObject } from 'react';
import { Link, useParams } from '@tanstack/react-router';
import { skapaClaude } from '@flodia/api';
import { Fellage, Knapp, Laddning } from '@flodia/ui';
import { fliktitel, visaBolagsnamn, type RubrikApp } from '../rubrik';
import { ANON, URL_SUPABASE, supabase } from '../supabase';
import { useKonto } from './KontoSkal';

declare global {
  interface Window {
    flodiaClaude?: { use: (namn: string) => Promise<unknown> };
    /** Runtime per ram (data-flodia), när chattens panel visar flera appar samtidigt. */
    flodiaClaudeRam?: Record<string, { use: (namn: string) => Promise<unknown> }>;
  }
}

/**
 * Den nuvarande appen i en ram. Används av bryggan (egen sida) och av chattens panel.
 * HTML:en hämtas med användarens token, och appens runtime läggs per ram (data-flodia), så att flera appar
 * kan vara öppna samtidigt. Bolagets namn sätts som rubrik när appen laddats.
 */
export function LegacyRam({ modul, ramRef, tangent, titel }: { modul: string; ramRef?: RefObject<HTMLIFrameElement | null>; tangent?: (e: KeyboardEvent) => void; titel?: string }) {
  const k = useKonto();
  const [html, setHtml] = useState<string | null>(null), [fel, setFel] = useState<string | null>(null);
  const kontoId = k.medlemskap.konto.id, { id: anvId, namn: anvNamn } = k.anvandare;
  const egen = useRef<HTMLIFrameElement>(null);
  const ram = ramRef ?? egen;
  const nyckel = useId();
  const bolag = k.medlemskap.konto.name;
  const appnamn = k.moduler.find(m => m.modul.nyckel === modul)?.modul.namn ?? modul;
  const slutaBevaka = useRef<(() => void) | null>(null);
  useEffect(() => () => { slutaBevaka.current?.(); }, []);

  /** När appen har laddats i ramen: bolagets namn som rubrik. Utan åtkomst till ramen står appens rubrik kvar. */
  const laddad = () => {
    slutaBevaka.current?.();
    slutaBevaka.current = null;
    try {
      const doc = ram.current?.contentDocument;
      if (doc) slutaBevaka.current = visaBolagsnamn(doc, modul as RubrikApp, bolag, appnamn);
      if (tangent) ram.current?.contentWindow?.addEventListener('keydown', tangent);
    } catch { /* ramen går inte att nå: appens egen rubrik står kvar */ }
  };

  useEffect(() => {
    let avbruten = false;
    setHtml(null); setFel(null);
    void (async () => {
      const { data } = await supabase.auth.getSession();
      const r = await fetch(`${URL_SUPABASE}/functions/v1/legacy?konto=${kontoId}&app=${encodeURIComponent(modul)}`, {
        headers: { authorization: 'Bearer ' + (data.session?.access_token ?? ''), apikey: ANON },
      }).catch(() => null);
      if (avbruten) return;
      if (!r) { setFel('Servern svarar inte. Försök igen om en stund.'); return; }
      if (!r.ok) { const j = await r.json().catch(() => null) as { fel?: { text?: string } } | null; setFel(j?.fel?.text ?? 'Appen kunde inte öppnas.'); return; }
      const runtime = skapaClaude({ supabase, konto: kontoId, modul, anvandare: { id: anvId, namn: anvNamn } });
      window.flodiaClaude = runtime;
      (window.flodiaClaudeRam ??= {})[nyckel] = runtime;
      setHtml(await r.text());
    })();
    return () => { avbruten = true; if (window.flodiaClaudeRam) delete window.flodiaClaudeRam[nyckel]; };
  }, [kontoId, modul, anvId, anvNamn, nyckel]);

  if (fel) return <Fellage text={fel} />;
  if (html === null) return <Laddning text="Öppnar appen" />;
  return <iframe ref={ram} className="fl-brygga" title={titel ?? appnamn} data-flodia={nyckel} srcDoc={html} onLoad={laddad} />;
}

export function Brygga() {
  const k = useKonto();
  const { modul } = useParams({ strict: false }) as { modul: string };
  const ram = useRef<HTMLIFrameElement>(null);
  const { helskarm, setHelskarm } = k;
  const bolag = k.medlemskap.konto.name;
  const appnamn = k.moduler.find(m => m.modul.nyckel === modul)?.modul.namn ?? modul;

  useEffect(() => {
    const fore = document.title;
    document.title = fliktitel(bolag, appnamn);
    return () => { document.title = fore; };
  }, [bolag, appnamn]);

  // Esc avslutar helskärm, även när fokus är inne i appen (ramen har samma ursprung, srcdoc, och lyssnar när den laddats).
  const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setHelskarm(false); };
  useEffect(() => {
    if (!helskarm) return;
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  });

  return (
    <div className="fl-brygga-yta">
      {helskarm ? (
        <Knapp className="fl-helskarm-ut" onClick={() => setHelskarm(false)}>Avsluta helskärm (Esc)</Knapp>
      ) : (
        <div className="fl-brygga-rad">
          <Link to={`/${k.medlemskap.konto.slug}/${modul}` as never}>Tillbaka</Link>
          <Knapp variant="diskret" onClick={() => setHelskarm(true)}>Helskärm</Knapp>
        </div>
      )}
      <LegacyRam modul={modul} ramRef={ram} tangent={esc} titel="Nuvarande app" />
    </div>
  );
}
