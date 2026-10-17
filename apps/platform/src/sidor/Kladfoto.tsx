// Fotoläsning av klädlistan i Avräkning. Visas bara när funktionen är påslagen för kontot (spärren sitter på servern).
// Fotot förminskas här, skickas till serverfunktionen motor och kastas sedan. Tolkningen och statusarna räknas på
// servern. Granskningstabellen: kryssruta per rad, status, och sedan "Lägg till valda". AI:n föreslår, människan bestämmer.
import { useRef, useState } from 'react';
import { anropaMotor, KLAD_STATUS, MotorSvarFel, PLAGG, type FotoLast, type FotoMediaTyp, type FotoTillagt, type GranskadRad } from '@flodia/api';
import { Falt, Fellage, Knapp, Laddning } from '@flodia/ui';
import { supabase } from '../supabase';

const MAX_SIDA = 2000;
const MAX_BASE64 = 5 * 1024 * 1024;

const dennaManad = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };

/** Förminskar fotot till högst 2000 punkter på längsta sidan, som JPEG. Bilden lämnar aldrig minnet på annat sätt. */
async function forminska(fil: File): Promise<{ mediaTyp: FotoMediaTyp; base64: string }> {
  const bild = await createImageBitmap(fil);
  const skala = Math.min(1, MAX_SIDA / Math.max(bild.width, bild.height));
  const duk = document.createElement('canvas');
  duk.width = Math.round(bild.width * skala); duk.height = Math.round(bild.height * skala);
  duk.getContext('2d')!.drawImage(bild, 0, 0, duk.width, duk.height);
  bild.close();
  for (const kvalitet of [0.85, 0.7, 0.5]) {
    const base64 = duk.toDataURL('image/jpeg', kvalitet).split(',')[1]!;
    if (base64.length <= MAX_BASE64) return { mediaTyp: 'image/jpeg', base64 };
  }
  throw new MotorSvarFel('for_stor', 'Fotot är för stort. Ta det på nytt eller förminska det.', 413);
}

export function Kladfoto({ konto }: { konto: string }) {
  const [period, setPeriod] = useState(dennaManad);
  const [lage, setLage] = useState<'vila' | 'laser' | 'sparar'>('vila');
  const [rader, setRader] = useState<GranskadRad[] | null>(null);
  const [valda, setValda] = useState<boolean[]>([]);
  const [fel, setFel] = useState<string | null>(null);
  const [klart, setKlart] = useState<string | null>(null);
  const fil = useRef<HTMLInputElement>(null);
  const motor = <T,>(data: unknown) => anropaMotor<T>(supabase, { konto, modul: 'avrakning', operation: 'fotolasning', data });
  const felText = (e: unknown) => (e instanceof MotorSvarFel ? e.message : 'Fotot kunde inte läsas. Försök igen.');

  async function las(f: File) {
    setFel(null); setKlart(null); setRader(null); setLage('laser');
    try {
      const svar = await motor<FotoLast>({ steg: 'las', period, bild: await forminska(f) });
      setRader(svar.rader); setValda(svar.rader.map(r => r.vald));
    } catch (e) { setFel(felText(e)); } finally {
      setLage('vila');
      if (fil.current) fil.current.value = '';
    }
  }

  async function laggTill() {
    if (!rader) return;
    setFel(null); setLage('sparar');
    try {
      const svar = await motor<FotoTillagt>({ steg: 'lagg_till', period, rader: rader.filter((_, i) => valda[i]) });
      setKlart(`${svar.tillagda} ${svar.tillagda === 1 ? 'rad' : 'rader'} tillagda för ${svar.period}.${svar.hoppade ? ` ${svar.hoppade} fanns redan.` : ''}`);
      setRader(null);
    } catch (e) { setFel(felText(e)); } finally { setLage('vila'); }
  }

  const antalValda = valda.filter(Boolean).length;
  return (
    <section className="fl-kort" aria-labelledby="kladfoto">
      <h2 id="kladfoto">Klädlista från foto</h2>
      <p className="fl-hjalptext">Fotografera den ifyllda klädlistan. Fotot sparas inte. Granska raderna innan du lägger till dem. Papperslistan är underlaget.</p>
      <div className="fl-rad-falt">
        <Falt etikett="Månad" type="month" value={period} onChange={e => { setPeriod(e.target.value); setRader(null); }} required />
        <Knapp onClick={() => fil.current?.click()} disabled={lage !== 'vila' || !period}>Läs klädlista från foto</Knapp>
      </div>
      <input ref={fil} type="file" accept="image/jpeg,image/png,image/webp" capture="environment" hidden aria-label="Foto av klädlistan"
        onChange={e => { const f = e.target.files?.[0]; if (f) void las(f); }} />
      {lage === 'laser' && <Laddning text="Läser fotot" />}
      {lage === 'sparar' && <Laddning text="Lägger till" />}
      {fel && <Fellage text={fel} />}
      {klart && <p role="status">{klart}</p>}

      {rader && (rader.length === 0 ? <p role="status">Inga rader hittades på fotot.</p> : (
        <>
          <div className="fl-tabell-yta">
            <table className="fl-tabell">
              <caption className="fl-dold">Rader från fotot</caption>
              <thead>
                <tr>
                  <th scope="col">Välj</th><th scope="col">Datum</th><th scope="col">Bil</th><th scope="col">Utbildning</th>
                  {PLAGG.map(p => <th key={p.nyckel} scope="col" className="fl-tal">{p.namn}</th>)}
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {rader.map((r, i) => (
                  <tr key={i}>
                    <td><input type="checkbox" checked={!!valda[i]} aria-label={`Välj rad ${i + 1}`} onChange={e => setValda(v => v.map((x, j) => (j === i ? e.target.checked : x)))} /></td>
                    <td>{r.datum ?? 'Oläsligt'}</td>
                    <td>{r.bil ?? 'Oläsligt'}</td>
                    <td>{r.utbildning ? 'Ja' : 'Nej'}</td>
                    {PLAGG.map(p => <td key={p.nyckel} className="fl-tal">{r.antal[p.nyckel] || ''}</td>)}
                    <td>{r.status.length ? r.status.map(s => <span key={s} className={`fl-status ${s === 'osaker' || s === 'bil_saknas' ? 'fl-status-avvikelse' : 'fl-status-vantar'}`}>{KLAD_STATUS[s]}</span>) : <span className="fl-status fl-status-klar">Ok</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="fl-dialog-knappar">
            <Knapp variant="diskret" onClick={() => setRader(null)}>Avbryt</Knapp>
            <Knapp variant="primar" onClick={() => void laggTill()} disabled={lage !== 'vila' || antalValda === 0}>Lägg till valda ({antalValda})</Knapp>
          </div>
        </>
      ))}
    </section>
  );
}
