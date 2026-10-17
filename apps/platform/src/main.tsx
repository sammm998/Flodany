// Plattformen. Adresser: /logga-in, /logga-in/bekrafta, /valj-konto, /:konto (Hem), /:konto/:modul och
// /:konto/:modul/legacy (bryggan, bara interna konton). Typsnitten ligger lokalt, inga anrop till Google.
import '@fontsource/geist-sans/400.css';
import '@fontsource/geist-sans/500.css';
import '@fontsource/geist-sans/600.css';
import '@fontsource/geist-mono/400.css';
import '@fontsource/instrument-serif/400.css';
import '@flodia/ui/tokens.css';
import '@flodia/ui/stil.css';
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
import { Modul } from './sidor/Modul';
import { Brygga } from './sidor/Brygga';
import { startaPlattformensFellogg } from './fellogg';

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
const hem = createRoute({ getParentRoute: () => konto, path: '/', component: Hem });
const modul = createRoute({ getParentRoute: () => konto, path: '$modul', component: Modul });
const brygga = createRoute({ getParentRoute: () => konto, path: '$modul/legacy', component: Brygga });

const router = createRouter({ routeTree: rot.addChildren([start, loggaIn, bekrafta, valj, konto.addChildren([hem, modul, brygga])]) });
declare module '@tanstack/react-router' { interface Register { router: typeof router } }

void startaPlattformensFellogg();

const qc = new QueryClient({ defaultOptions: { queries: { retry: 1, staleTime: 30_000 } } });
createRoot(document.getElementById('rot')!).render(
  <StrictMode><QueryClientProvider client={qc}><RouterProvider router={router} /></QueryClientProvider></StrictMode>,
);
