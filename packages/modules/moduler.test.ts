import { describe, expect, it } from 'vitest';
import * as avr from '../core/avrakning/index';
import * as lon from '../core/lon/index';
import { akarkassanGuide, tripkassanGuide } from '@flodia/guides';
import { MODULER, VISNINGSNAMN, sokApp, synligaModuler, type Licens } from './index';

const lic = (module_key: string, o: Partial<Licens> = {}): Licens => ({ module_key, variant: 'main', status: 'aktiv', ended_at: null, ...o });

describe('modulernas manifest', () => {
  it('uppladdningarna pekar på parsrar som finns i serverfunktionen, med samma etikett', () => {
    const parsrar = new Map([...avr.parsrar, lon.ldlParser, lon.broParser, lon.sturupParser, lon.avrakningParser, lon.skattetabellParser].map(p => [p.key, p.label]));
    for (const m of MODULER) for (const u of m.uppladdningar) {
      expect(parsrar.has(u.parser), `${m.nyckel}: ${u.parser}`).toBe(true);
      expect(u.etikett).toBe(parsrar.get(u.parser));
    }
  });

  it('kassorna är känsliga, som i databasen', () => {
    expect(MODULER.filter(m => m.kanslig).map(m => m.nyckel)).toEqual(['akarkassan', 'tripkassan']);
  });

  it('menyn: bara aktiv licens, och läs-rollen ser inte kassorna', () => {
    const L = [lic('avrakning'), lic('akarkassan'), lic('tripkassan', { status: 'pausad' }), lic('foliering', { ended_at: '2020-01-01T00:00:00Z' })];
    expect(synligaModuler(L, 'ekonomi').map(x => x.modul.nyckel)).toEqual(['avrakning', 'akarkassan']);
    expect(synligaModuler(L, 'las').map(x => x.modul.nyckel)).toEqual(['avrakning']);
    expect(synligaModuler([lic('avrakning', { variant: 'sub' })], 'admin')[0]).toMatchObject({ variant: 'sub' });
    expect(synligaModuler([], 'admin')).toEqual([]);
  });
});

describe('appernas visningsnamn (ägarens beslut 2026-10-15)', () => {
  it('namnen kommer från VISNINGSNAMN, och nycklarna är oförändrade', () => {
    expect(Object.fromEntries(MODULER.map(m => [m.nyckel, m.namn]))).toEqual({ avrakning: 'Avräkning', akarkassan: 'Lön och kassa', tripkassan: 'Lön och bokföring', foliering: 'Verkstad' });
    for (const m of MODULER) expect(m.varianter.main.namn, m.nyckel).toBe(VISNINGSNAMN[m.nyckel as keyof typeof VISNINGSNAMN].namn);
    expect(akarkassanGuide.welcome[0]!.rubrik).toBe('Välkommen till Lön och kassa');
    expect(tripkassanGuide.welcome[0]!.rubrik).toBe('Välkommen till Lön och bokföring');
  });

  it('sökningen hittar apparna på nya och gamla namn', () => {
    expect(sokApp('tripkassan')).toEqual(['tripkassan']);
    expect(sokApp('Åkarkassan')).toEqual(['akarkassan']);
    expect(sokApp('bokföring')).toEqual(['tripkassan']);
    expect(sokApp('lön och')).toEqual(['akarkassan', 'tripkassan']);
    expect(sokApp('  ')).toEqual([]);
  });
});
