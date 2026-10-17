// Plattformen. Adresser: /logga-in, /logga-in/bekrafta, /valj-konto, /:konto (chatten med assistenten),
// /:konto/chatt/:samtal (ett sparat samtal), /:konto/hem (översikten), /:konto/:modul och
// /:konto/:modul/legacy (bryggan, bara interna konton). Typsnitten ligger lokalt, inga anrop till Google.
import '@fontsource/geist-sans/400.css';
import '@fontsource/geist-sans/500.css';
import '@fontsource/geist-sans/600.css';
import '@fontsource/geist-mono/400.css';
import '@fontsource/instrument-serif/400.css';
import '@flodia/ui/tokens.css';
import '@flodia/ui/stil.css';
import '@flodia/ui/chatt.css';
import { StrictMode, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Outlet, RouterProvider, createRootRoute, createRoute, createRouter, useNavigate } from '@tanstack/react-router';
import { Laddning } from '@flodia/ui';
import { senasteKonto, useSession } from './data';
import { Bekrafta, Inloggning } from './sidor/Inloggning';
import { ValjKonto } from './sidor/ValjKonto';
import { KontoSkal } from './sidor/KontoSkal';
import { Hem } from './sidor/Hem';
import { Chatt } from './sidor/Chatt';
import { Modul } from './sidor/Modul';
import { Brygga } from './sidor/Brygga';
import { startaPlattformensFellogg } from './fellogg';
import { KONFIGURERAD } from './supabase';

/** Start: inloggad till senaste kontot eller kontoväljaren, annars inloggningen. */
function Start() {
  const nav = useNavigate(), session = useSession();
  useEffect(() => {
    if (session === null) void nav({ to: '/logga-in', replace: true });
    else if (session) { const s = senasteKonto(); void (s ? nav({ to: '/$konto', params: { konto: s }, replace: true }) : nav({ to: '/valj-konto', replace: true })); }
  }, [session, nav]);
  return <main id="innehall"><Laddning /></main>;
}

const rot = createRootRoute({ component: () => <Outlet /> });
const start = createRoute({ getParentRoute: () => rot, path: '/', component: Start });
const loggaIn = createRoute({ getParentRoute: () => rot, path: '/logga-in', component: Inloggning });
const bekrafta = createRoute({ getParentRoute: () => rot, path: '/logga-in/bekrafta', component: Bekrafta });
const valj = createRoute({ getParentRoute: () => rot, path: '/valj-konto', component: ValjKonto });
const konto = createRoute({ getParentRoute: () => rot, path: '/$konto', component: KontoSkal });
const chatt = createRoute({ getParentRoute: () => konto, path: '/', component: Chatt });
const samtal = createRoute({ getParentRoute: () => konto, path: 'chatt/$samtal', component: Chatt });
const hem = createRoute({ getParentRoute: () => konto, path: 'hem', component: Hem });
const modul = createRoute({ getParentRoute: () => konto, path: '$modul', component: Modul });
const brygga = createRoute({ getParentRoute: () => konto, path: '$modul/legacy', component: Brygga });

const router = createRouter({ routeTree: rot.addChildren([start, loggaIn, bekrafta, valj, konto.addChildren([chatt, samtal, hem, modul, brygga])]) });
declare module '@tanstack/react-router' { interface Register { router: typeof router } }

void startaPlattformensFellogg();

const qc = new QueryClient({ defaultOptions: { queries: { retry: 1, staleTime: 30_000 } } });
/** Utan Supabase (VITE_SUPABASE_URL och VITE_SUPABASE_ANON_KEY i bygget) går ingen inloggning. */
function EjKopplad() {
  return (
    <main className="fl-inloggning" id="innehall">
      <h1>Flödia</h1>
      <p>Plattformen är publicerad men inte kopplad till databasen än. Inloggning, chatten och apparna fungerar när Supabase är kopplat.</p>
      <p className="fl-hjalptext">Lägg till VITE_SUPABASE_URL och VITE_SUPABASE_ANON_KEY under Variables och bygg om.</p>
    </main>
  );
}

createRoot(document.getElementById('rot')!).render(
  <StrictMode>{KONFIGURERAD ? <QueryClientProvider client={qc}><RouterProvider router={router} /></QueryClientProvider> : <EjKopplad />}</StrictMode>,
);
