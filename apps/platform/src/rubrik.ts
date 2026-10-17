// Bolagets namn som rubrik i de nuvarande apparna (legacy-bryggan). Legacy-filerna ändras inte: ramen har samma
// ursprung som plattformen (srcdoc), så plattformen sätter rubriken utifrån och håller den kvar när appen skriver om
// sitt sidhuvud. Namnet kommer från kontot, samma som i bolagsväljaren och sidomenyn, aldrig från appens inställningar.
// Exporterna (SIE, Excel, PDF) läser fortfarande S.settings.foretag i appen och påverkas inte.
//
// Namnet skrivs alltid som text (textContent och setAttribute), aldrig som HTML.
// Funktionen är fristående (inga importer och inget utanför den), så att Playwright kan köra den i en testsida.

export type RubrikApp = 'avrakning' | 'akarkassan' | 'tripkassan' | 'foliering';

/**
 * Sätter bolagets namn som rubrik och appens namn som raden under, i appens dokument.
 * I kassornas demoläge blir raden "Tripkassan · Exempeldata". Utan namn står appens egen rubrik kvar som i dag.
 * Svarar med en funktion som slutar bevaka sidhuvudet.
 */
export function visaBolagsnamn(doc: Document, app: RubrikApp, bolag: string | null | undefined, appnamn: string): () => void {
  const namn = (bolag ?? '').trim();
  const satt = (el: Element | null, text: string) => { if (el && el.textContent !== text) el.textContent = text; };
  let manad = '', demo = false;

  const tillampa = () => {
    if (app === 'tripkassan' || app === 'akarkassan') {
      // <h1>Tripkassan</h1><small id="coName">bolaget ur appens inställningar, eller Exempeldata</small>
      const h1 = doc.querySelector('.co h1'), rad = doc.querySelector('#coName');
      if (!namn) { satt(h1, appnamn); return; }
      // Appen skriver "Exempeldata" i demoläge och annars bolaget ur sina inställningar. Våra egna texter räknas inte.
      const text = rad?.textContent ?? '', exempel = `${appnamn} · Exempeldata`;
      if (text === 'Exempeldata') demo = true;
      else if (text !== appnamn && text !== exempel) demo = false;
      satt(h1, namn); satt(rad, demo ? exempel : appnamn);
    } else if (app === 'avrakning') {
      // <small>…</small><h1 id="hMonth">månaden</h1>: appen skriver månaden i rubriken. Den flyttas till raden under.
      if (!namn) return;
      const h1 = doc.querySelector('#hMonth'), rad = doc.querySelector('.titles small');
      const text = h1?.textContent ?? '';
      if (text && text !== namn) manad = text;
      satt(h1, namn);
      satt(rad, manad && manad !== 'Månadsavräkning' ? `${appnamn} · ${manad}` : appnamn);
    } else {
      // Foliering: <div class="brand" aria-label="…"><div class="wm"><b>namn</b><small>beskrivning</small></div></div>
      if (!namn) return;
      satt(doc.querySelector('.wm b'), namn);
      satt(doc.querySelector('.wm small'), appnamn);
      const brand = doc.querySelector('.brand');
      if (brand && brand.getAttribute('aria-label') !== namn) brand.setAttribute('aria-label', namn);
    }
  };

  // Ett långt namn bryts i stället för att spräcka sidhuvudet, även ett långt ord.
  if (namn && doc.head && !doc.getElementById('flodia-rubrik')) {
    const stil = doc.createElement('style');
    stil.id = 'flodia-rubrik';
    stil.textContent = '.co h1, #hMonth, .wm b { overflow-wrap: anywhere; min-width: 0; }';
    doc.head.appendChild(stil);
  }
  tillampa();
  const sidhuvud = doc.querySelector('header');
  const Bevakare = doc.defaultView?.MutationObserver;
  if (!sidhuvud || !Bevakare) return () => {};
  const bevakare = new Bevakare(() => tillampa());
  bevakare.observe(sidhuvud, { subtree: true, childList: true, characterData: true });
  return () => bevakare.disconnect();
}

/** Flikens titel: "Bolagsnamn · Appnamn", eller bara appens namn om bolagsnamnet saknas. */
export const fliktitel = (bolag: string | null | undefined, appnamn: string) => ((bolag ?? '').trim() ? `${(bolag ?? '').trim()} · ${appnamn}` : appnamn);
