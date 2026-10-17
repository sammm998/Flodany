// Kontoväljaren (spec v3 s. 26): välj bolag efter inloggning. En användare med ett konto hoppar över den.
import { useEffect } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { Fellage, Knapp, Laddning, TomtLage, initialer } from '@flodia/ui';
import { ROLL, TYP, sparaSenasteKonto, useMinaKonton, useSession } from '../data';
import { loggaUt } from '../supabase';

export function ValjKonto() {
  const nav = useNavigate();
  const session = useSession();
  const konton = useMinaKonton(session?.user.id);
  const valj = (slug: string) => { sparaSenasteKonto(slug); void nav({ to: '/$konto', params: { konto: slug } }); };

  useEffect(() => { if (session === null) void nav({ to: '/logga-in', replace: true }); }, [session, nav]);
  const ende = konton.data?.length === 1 ? konton.data[0]!.konto.slug : null;
  useEffect(() => { if (ende) { sparaSenasteKonto(ende); void nav({ to: '/$konto', params: { konto: ende }, replace: true }); } }, [ende, nav]);

  return (
    <main className="fl-inloggning" id="innehall">
      <h1>Välj bolag</h1>
      {konton.isLoading || session === undefined ? <Laddning /> : konton.isError ? <Fellage text="Kontona kunde inte hämtas." forsokIgen={() => void konton.refetch()} /> : !konton.data?.length ? (
        <TomtLage rubrik="Inget bolag än" text="Du är inte med i något bolag. Be den som bjöd in dig att lägga till dig." atgard={<Knapp onClick={() => void loggaUt().then(() => nav({ to: '/logga-in' }))}>Logga ut</Knapp>} />
      ) : (
        <>
          <p>Du har tillgång till {konton.data.length === 1 ? 'ett bolag' : `${konton.data.length} bolag`}. Du kan byta när som helst uppe till vänster.</p>
          <ul className="fl-lista fl-kontolista">
            {konton.data.map(m => (
              <li key={m.konto.id}>
                <button type="button" className="fl-kontoblock" onClick={() => valj(m.konto.slug)}>
                  <span className="fl-avatar" aria-hidden="true">{initialer(m.konto.name)}</span>
                  <span><strong>{m.konto.name}</strong><small>{TYP[m.konto.type]} · {ROLL[m.roll]}</small></span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </main>
  );
}
