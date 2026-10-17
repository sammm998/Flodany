// Legacy-HTML som text i serverfunktionens paket (esbuild, loader text). Bara i legacy-ingang.ts.
declare module '*.html' {
  const text: string;
  export default text;
}
