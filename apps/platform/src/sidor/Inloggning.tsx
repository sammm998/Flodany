// Inloggning med e-postlänk eller koden i samma mejl (version 1, BankID i version 2).
// Svaret är detsamma oavsett om adressen har ett konto, så att ingen kan pröva fram vilka som finns.
import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { Falt, Fellage, Knapp } from '@flodia/ui';
import { supabase } from '../supabase';

export function Inloggning() {
  const nav = useNavigate();
  const [epost, setEpost] = useState(''), [kod, setKod] = useState('');
  const [skickat, setSkickat] = useState(false), [arbetar, setArbetar] = useState(false), [fel, setFel] = useState<string | null>(null);

  async function skicka(e: FormEvent) {
    e.preventDefault();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(epost.trim())) { setFel('Skriv en e-postadress, till exempel namn@foretag.se.'); return; }
    setArbetar(true); setFel(null);
    // Felet för en okänd adress visas inte: samma svar som när mejlet skickas.
    await supabase.auth.signInWithOtp({ email: epost.trim(), options: { shouldCreateUser: false, emailRedirectTo: location.origin + '/logga-in/bekrafta' } });
    setArbetar(false); setSkickat(true);
  }

  async function medKod(e: FormEvent) {
    e.preventDefault();
    setArbetar(true); setFel(null);
    const { error } = await supabase.auth.verifyOtp({ email: epost.trim(), token: kod.trim(), type: 'email' });
    setArbetar(false);
    if (error) { setFel('Koden stämmer inte eller har gått ut. Be om en ny länk.'); return; }
    await nav({ to: '/valj-konto' });
  }

  return (
    <main className="fl-inloggning" id="innehall">
      <h1>Logga in</h1>
      <p>Till alla appar för ditt bolag, på ett ställe.</p>
      {!skickat ? (
        <form onSubmit={skicka} noValidate>
          <Falt etikett="E-post" type="email" autoComplete="email" placeholder="namn@foretag.se" value={epost} onChange={e => setEpost(e.target.value)} fel={fel} required />
          <Knapp variant="primar" type="submit" disabled={arbetar}>Skicka inloggningslänk</Knapp>
        </form>
      ) : (
        <>
          <p role="status">Om adressen har ett konto har vi skickat en länk till {epost.trim()}. Länken gäller i 15 minuter.</p>
          <form onSubmit={medKod} noValidate>
            <Falt etikett="Eller skriv koden från mejlet" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={kod} onChange={e => setKod(e.target.value.replace(/\D/g, ''))} />
            <Knapp variant="primar" type="submit" disabled={arbetar || kod.length !== 6}>Logga in med koden</Knapp>
          </form>
          {fel && <Fellage text={fel} />}
          <p><button type="button" className="fl-lanklik" onClick={() => { setSkickat(false); setKod(''); }}>Använd en annan adress</button></p>
        </>
      )}
      <footer>Drivs av Flödia</footer>
    </main>
  );
}

const ANVANDA = new Set<string>();

/** /logga-in/bekrafta?token_hash=...&type=email, från länken i mejlet. */
export function Bekrafta() {
  const nav = useNavigate();
  const [fel, setFel] = useState<string | null>(null);
  useEffect(() => {
    const hash = new URLSearchParams(location.search).get('token_hash');
    if (!hash) { setFel('Länken är ofullständig. Be om en ny länk.'); return; }
    // En länk kan bara användas en gång. React kan köra effekten två gånger i utvecklingsläge.
    if (ANVANDA.has(hash)) return;
    ANVANDA.add(hash);
    void supabase.auth.verifyOtp({ token_hash: hash, type: 'email' }).then(({ error }) => {
      if (error) setFel('Länken har redan använts eller gått ut. Be om en ny länk.');
      else void nav({ to: '/valj-konto', replace: true });
    });
  }, [nav]);
  return (
    <main className="fl-inloggning" id="innehall">
      <h1>Logga in</h1>
      {fel ? <><Fellage text={fel} /><p><a href="/logga-in">Till inloggningen</a></p></> : <p role="status">Loggar in</p>}
    </main>
  );
}
