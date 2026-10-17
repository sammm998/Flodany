// Chattens rena delar, utan Supabase och React: strömmen från servern och hur händelserna bygger meddelandet
// och panelerna. Testas i chatt.test.ts.
import type { AssistentHandelse, ChattMeddelande, Del, Panel } from '@flodia/api';

/** Läser en ström av server-sent events (en JSON per data-rad) och anropar vid för varje händelse. */
export async function lasHandelser(kropp: ReadableStream<Uint8Array>, vid: (h: AssistentHandelse) => void): Promise<void> {
  const lasare = kropp.getReader(), avkodare = new TextDecoder();
  let buffert = '';
  for (;;) {
    const { value, done } = await lasare.read();
    buffert += avkodare.decode(value ?? new Uint8Array(), { stream: !done });
    let slut: number;
    while ((slut = buffert.indexOf('\n\n')) >= 0) {
      const rad = buffert.slice(0, slut);
      buffert = buffert.slice(slut + 2);
      const data = rad.split('\n').filter(r => r.startsWith('data:')).map(r => r.slice(5).trimStart()).join('\n');
      if (data) vid(JSON.parse(data) as AssistentHandelse);
    }
    if (done) return;
  }
}

/** Lägger till en händelse i meddelandet som byggs. Ren funktion, så att den kan testas. */
export function tillampa(m: ChattMeddelande, h: AssistentHandelse): ChattMeddelande {
  const delar = [...m.delar];
  if (h.typ === 'text') {
    const sista = delar.at(-1);
    if (sista?.typ === 'text') delar[delar.length - 1] = { typ: 'text', text: sista.text + h.text };
    else delar.push({ typ: 'text', text: h.text });
  } else if (h.typ === 'verktyg') {
    const i = delar.findIndex(d => d.typ === 'verktyg' && d.verktyg.id === h.verktyg.id);
    if (i >= 0) delar[i] = { ...(delar[i] as Extract<Del, { typ: 'verktyg' }>), verktyg: h.verktyg };
    else delar.push({ typ: 'verktyg', verktyg: h.verktyg });
  } else if (h.typ === 'panel') {
    const i = delar.findIndex(d => d.typ === 'verktyg' && d.verktyg.id === h.verktyg);
    if (i >= 0) delar[i] = { ...(delar[i] as Extract<Del, { typ: 'verktyg' }>), panel: h.panel.id };
  } else if (h.typ === 'fel') {
    delar.push({ typ: 'text', text: (delar.length ? '\n\n' : '') + h.text });
  }
  return { ...m, delar };
}

/** Lägger till en panel. En app som redan är öppen öppnas inte igen: den nya panelen pekar på den gamla. */
export function laggTillPanel(paneler: Panel[], p: Panel): { paneler: Panel[]; id: string } {
  if (p.typ === 'app') {
    const finns = paneler.find(x => x.typ === 'app' && x.app === p.app);
    if (finns) return { paneler: paneler.map(x => (x.id === finns.id ? { ...p, id: finns.id } : x)), id: finns.id };
  }
  return { paneler: [...paneler, p], id: p.id };
}

