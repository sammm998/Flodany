// Kontots skal: sidomeny från modulernas manifest (bara aktiv licens, inga kassor för läs-rollen),
// kontoblocket som kontoväljare, toppfält, hjälppanel och exempelläge. Kontots huvudfärg (nivå 1).
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { Link, Outlet, useNavigate, useParams, useRouterState } from '@tanstack/react-router';
import { Dialog, Exempelbanderoll, Fellage, Kontoblock, Laddning, Skal, TomtLage, valjAccent, type Lank, type MenyGrupp } from '@flodia/ui';
import { synligaModuler, type ModulManifest } from '@flodia/modules';
import { ROLL, TYP, sparaSenasteKonto, useLicenser, useMinaKonton, useSession, type Medlemskap } from '../data';
import { loggaUt } from '../supabase';
import { ChattLeverantor } from '../chatt/ChattLage';

export interface KontoKontext {
  medlemskap: Medlemskap;
  anvandare: { id: string; namn: string };
  moduler: { modul: ModulManifest; variant: 'main' | 'sub' }[];
  exempel: boolean;
  setExempel: (pa: boolean) => void;
  /** Innehållet i hjälppanelen för vyn man står i ("Så funkar det"). */
  setHjalp: (h: { rubrik: string; innehall: ReactNode } | null) => void;
  /** Helskärm i den nuvarande appen: menyn och toppraden döljs. */
  helskarm: boolean;
  setHelskarm: (pa: boolean) => void;
  /** Öppnar kontoväljaren, hjälpen och utloggningen (chatten har eget sidhuvud). */
  bytKonto: () => void;
  oppnaHjalp: () => void;
  loggaUt: () => void;
}
const Kontext = createContext<KontoKontext | null>(null);
export const useKonto = () => useContext(Kontext)!;

const lank: Lank = p => <Link to={p.href as never} className={p.className} aria-current={p['aria-current']} onClick={p.onClick}>{p.children}</Link>;

export function KontoSkal() {
  const nav = useNavigate();
  const { konto: slug } = useParams({ strict: false }) as { konto: string };
  const sokvag = useRouterState({ select: s => s.location.pathname });
  const session = useSession();
  const konton = useMinaKonton(session?.user.id);
  const medlemskap = konton.data?.find(m => m.konto.slug === slug);
  const licenser = useLicenser(medlemskap?.konto.id);
  const [valjare, setValjare] = useState(false), [hjalpOppen, setHjalpOppen] = useState(false);
  const [hjalp, setHjalp] = useState<{ rubrik: string; innehall: ReactNode } | null>(null);
  const [helskarm, setHelskarm] = useState(false);
  // Den nuvarande appen (bryggan) fyller hela ytan till höger om menyn.
  const legacyVy = /\/legacy\/?$/.test(sokvag);
  // Chatten (startsidan och sparade samtal) har eget skal, som Claude: meny, samtal och panel till höger.
  const chattVy = sokvag === `/${slug}` || sokvag === `/${slug}/` || sokvag.startsWith(`/${slug}/chatt/`);
  useEffect(() => { if (!legacyVy) setHelskarm(false); }, [legacyVy]);
  const [exempel, setExempelState] = useState(() => { try { return sessionStorage.getItem('flodia:exempel') === '1'; } catch { return false; } });
  const setExempel = (pa: boolean) => { setExempelState(pa); try { sessionStorage.setItem('flodia:exempel', pa ? '1' : '0'); } catch { /* lagringen är avstängd */ } };

  useEffect(() => { if (session === null) void nav({ to: '/logga-in', replace: true }); }, [session, nav]);
  useEffect(() => { if (medlemskap) sparaSenasteKonto(medlemskap.konto.slug); }, [medlemskap]);
  // Varumärke nivå 1: kontots huvudfärg om den klarar kontrastkravet, annars standardfärgen.
  useEffect(() => {
    document.documentElement.style.setProperty('--accent', valjAccent(medlemskap?.konto.brand?.accent).farg);
    return () => { document.documentElement.style.removeProperty('--accent'); };
  }, [medlemskap]);

  if (session === undefined || konton.isLoading) return <main id="innehall"><Laddning /></main>;
  if (konton.isError) return <main id="innehall" className="fl-inloggning"><Fellage text="Kontot kunde inte hämtas." forsokIgen={() => void konton.refetch()} /></main>;
  if (!session) return null;
  if (!medlemskap) {
    return (
      <main id="innehall" className="fl-inloggning">
        <TomtLage rubrik="Ingen åtkomst" text="Du är inte med i det här bolaget, eller så finns det inte." atgard={<Link to="/valj-konto">Välj ett av dina bolag</Link>} />
      </main>
    );
  }

  const anvandare = { id: session.user.id, namn: (session.user.user_metadata?.name as string | undefined) || session.user.email || 'Du' };
  const moduler = licenser.data ? synligaModuler(licenser.data, medlemskap.roll) : [];
  const bas = `/${medlemskap.konto.slug}`;
  const grupper: MenyGrupp[] = [
    { poster: [{ nyckel: 'chatt', namn: 'Assistenten', href: bas, aktiv: chattVy }, { nyckel: 'hem', namn: 'Hem', href: `${bas}/hem`, aktiv: sokvag.startsWith(`${bas}/hem`) }] },
    { rubrik: 'Mina appar', poster: moduler.map(({ modul, variant }) => ({ nyckel: modul.nyckel, namn: modul.varianter[variant]!.namn, href: `${bas}/${modul.nyckel}`, aktiv: sokvag.startsWith(`${bas}/${modul.nyckel}`) })) },
  ];
  const aktivModul = moduler.find(m => sokvag.startsWith(`${bas}/${m.modul.nyckel}`));
  const brodsmulor = [{ namn: medlemskap.konto.name, href: bas }, ...(aktivModul ? [{ namn: aktivModul.modul.varianter[aktivModul.variant]!.namn }] : [{ namn: 'Hem' }])];
  const utloggning = () => void loggaUt().then(() => nav({ to: '/logga-in' }));
  const ctx: KontoKontext = {
    medlemskap, anvandare, moduler, exempel, setExempel, setHjalp, helskarm: helskarm && legacyVy, setHelskarm,
    bytKonto: () => setValjare(true), oppnaHjalp: () => setHjalpOppen(true), loggaUt: utloggning,
  };

  return (
    <Kontext.Provider value={ctx}>
     <ChattLeverantor key={medlemskap.konto.id} konto={medlemskap.konto.id} slug={medlemskap.konto.slug}>
      {chattVy ? (licenser.isLoading ? <main id="innehall"><Laddning /></main> : licenser.isError ? <main id="innehall" className="fl-inloggning"><Fellage text="Apparna kunde inte hämtas." forsokIgen={() => void licenser.refetch()} /></main> : <Outlet />) : (
      <Skal
        lank={lank}
        kontoblock={<Kontoblock namn={medlemskap.konto.name} typ={`${TYP[medlemskap.konto.type]} · ${ROLL[medlemskap.roll]}`} onClick={() => setValjare(true)} />}
        grupper={grupper}
        brodsmulor={brodsmulor}
        hjalp={() => setHjalpOppen(true)}
        anvandare={{ namn: anvandare.namn, loggaUt: utloggning }}
        driverAv
        fyll={legacyVy}
        helskarm={helskarm && legacyVy}
        banderoll={exempel ? <Exempelbanderoll avsluta={() => setExempel(false)} /> : undefined}
      >
        {licenser.isLoading ? <Laddning /> : licenser.isError ? <Fellage text="Apparna kunde inte hämtas." forsokIgen={() => void licenser.refetch()} /> : <Outlet />}
      </Skal>
      )}
     </ChattLeverantor>
      <Dialog rubrik="Byt bolag" oppen={valjare} stang={() => setValjare(false)}>
        <ul className="fl-lista fl-kontolista">
          {konton.data!.map(m => (
            <li key={m.konto.id}>
              <Kontoblock namn={m.konto.name} typ={`${TYP[m.konto.type]} · ${ROLL[m.roll]}`} onClick={() => { setValjare(false); void nav({ to: '/$konto', params: { konto: m.konto.slug } }); }} />
            </li>
          ))}
        </ul>
      </Dialog>
      <Dialog rubrik={hjalp?.rubrik ?? 'Så funkar det'} oppen={hjalpOppen} stang={() => setHjalpOppen(false)} sida>
        {hjalp?.innehall ?? <p>Välj en app i menyn. Varje app har en välkomstguide och hjälp för varje steg.</p>}
      </Dialog>
    </Kontext.Provider>
  );
}
