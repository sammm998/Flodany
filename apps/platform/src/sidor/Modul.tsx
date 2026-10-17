// En moduls sida: välkomstguiden första gången (per användare), hjälp för vyn man står i, filhjälp,
// och för interna konton en väg till den nuvarande appen (legacy-bryggan). Skärmarna byggs i fas 3.
import { useEffect, useState } from 'react';
import { Link, useParams } from '@tanstack/react-router';
import { Dialog, Fellage, Knapp, Laddning, TomtLage } from '@flodia/ui';
import { VALKOMMEN_KLAR, guideFor } from '@flodia/guides';
import { modulFor } from '@flodia/modules';
import { FOTOLASNING } from '@flodia/api';
import { useFunktion, useGuidesteg } from '../data';
import { Kladfoto } from './Kladfoto';
import { useKonto } from './KontoSkal';

export function Modul() {
  const { modul: nyckel } = useParams({ strict: false }) as { modul: string };
  return <ModulInnehall nyckel={nyckel} />;
}

/**
 * Modulens innehåll. Som egen sida, eller i chattens panel (iPanel): då visas ingen välkomstguide och ingen
 * hjälp i sidhuvudet, och startvyn kan väljas av agenten.
 */
export function ModulInnehall({ nyckel, startvy = null, iPanel = false }: { nyckel: string; startvy?: string | null; iPanel?: boolean }) {
  const k = useKonto();
  const post = k.moduler.find(m => m.modul.nyckel === nyckel);
  const guide = post ? guideFor(post.modul.nyckel, post.variant) : null;
  const steg = useGuidesteg(k.medlemskap.konto.id, nyckel);
  // Fotoläsningen av klädlistan: knappen visas bara när funktionen är påslagen för kontot.
  const foto = useFunktion(nyckel === 'avrakning' ? k.medlemskap.konto.id : undefined, FOTOLASNING);
  const visaFoto = foto.data === true && !k.exempel && (k.medlemskap.roll === 'admin' || k.medlemskap.roll === 'ekonomi');
  const [visaGuide, setVisaGuide] = useState(false), [kort, setKort] = useState(0);
  const variant = post ? post.modul.varianter[post.variant]! : null;
  const [vy, setVy] = useState<string | null>(startvy);
  const aktivVy = variant?.vyer.find(v => v.nyckel === vy) ?? variant?.vyer[0] ?? null;
  const ejKlar = !iPanel && !!guide && steg.isSuccess && !steg.data.includes(VALKOMMEN_KLAR);

  useEffect(() => { if (ejKlar) { setVisaGuide(true); setKort(0); } }, [ejKlar]);
  useEffect(() => {
    if (!post || !aktivVy || iPanel) return;
    k.setHjalp({
      rubrik: `Så funkar ${aktivVy.namn.toLowerCase()}`,
      innehall: (
        <>
          <p>{guide?.help[aktivVy.nyckel] ?? 'Hjälpen för den här vyn kommer snart.'}</p>
          {guide && <Knapp onClick={() => { setKort(0); setVisaGuide(true); }}>Visa välkomstguiden igen</Knapp>}
        </>
      ),
    });
    return () => k.setHjalp(null);
  }, [post?.modul.nyckel, aktivVy?.nyckel, guide, k.setHjalp, iPanel]); // nycklar, inte objekt: listan skapas på nytt vid varje rendering

  if (!post || !variant) {
    const finns = modulFor(nyckel);
    return <TomtLage rubrik="Ingen åtkomst" text={finns ? 'Kontot har inte appen, eller så har din roll inte åtkomst till den.' : 'Appen finns inte.'} atgard={<Link to={`/${k.medlemskap.konto.slug}` as never}>Till Hem</Link>} />;
  }

  const klar = async () => { setVisaGuide(false); try { await steg.klar(VALKOMMEN_KLAR); } catch { /* visas igen nästa gång */ } };
  const bas = `/${k.medlemskap.konto.slug}/${post.modul.nyckel}`;

  return (
    <>
      {iPanel ? null : <h1>{variant.namn}</h1>}
      <div role="group" aria-label="Vyer" className="fl-vyer">
        {variant.vyer.map(v => <Knapp key={v.nyckel} variant="diskret" aria-pressed={v.nyckel === aktivVy?.nyckel} onClick={() => setVy(v.nyckel)}>{v.namn}</Knapp>)}
      </div>

      {steg.isLoading ? <Laddning /> : steg.isError ? <Fellage text="Guiden kunde inte hämtas." forsokIgen={() => void steg.refetch()} /> : (
        <TomtLage
          rubrik={aktivVy!.namn}
          text={k.exempel ? 'Exempelläge: här visas exempeldata när skärmen är byggd. Inget sparas.' : 'Appens skärmar flyttar hit i nästa steg. Tills dess används den nuvarande appen.'}
          atgard={k.medlemskap.konto.intern ? <Link className="fl-knapp fl-knapp-primar" to={`${bas}/legacy` as never}>Öppna nuvarande app</Link> : undefined}
        />
      )}

      {visaFoto && aktivVy?.nyckel === variant.vyer[0]!.nyckel && <Kladfoto konto={k.medlemskap.konto.id} />}

      {post.modul.uppladdningar.length > 0 && aktivVy?.nyckel === variant.vyer[0]!.nyckel && (
        <section className="fl-kort" aria-labelledby="filer">
          <h2 id="filer">Filer varje månad</h2>
          <ul className="fl-lista">
            {post.modul.uppladdningar.map(u => (
              <li key={u.nyckel}>
                <strong>{u.etikett}</strong>{u.kravs ? '' : ' (om den finns)'}
                <details><summary>Var hittar jag filen?</summary><p>Var: {guide?.fileHelp[u.nyckel]?.var ?? 'Ägaren fyller i.'} När: {guide?.fileHelp[u.nyckel]?.nar ?? 'Ägaren fyller i.'}</p></details>
              </li>
            ))}
          </ul>
        </section>
      )}

      {guide && (
        <Dialog rubrik={guide.welcome[kort]!.rubrik} oppen={visaGuide} stang={() => void klar()}>
          <p>{guide.welcome[kort]!.text}</p>
          <p className="fl-hjalptext">{kort + 1} av {guide.welcome.length}</p>
          <div className="fl-dialog-knappar">
            {kort === 0 && <Knapp onClick={() => { k.setExempel(true); void klar(); }}>Prova med exempeldata</Knapp>}
            <Knapp variant="diskret" onClick={() => void klar()}>Hoppa över</Knapp>
            {kort < guide.welcome.length - 1
              ? <Knapp variant="primar" onClick={() => setKort(kort + 1)}>Nästa</Knapp>
              : <Knapp variant="primar" onClick={() => void klar()}>Klar</Knapp>}
          </div>
        </Dialog>
      )}
    </>
  );
}
