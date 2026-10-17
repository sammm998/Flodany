/// <reference types="vite/client" />
interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
  /** Sentrys EU-region. Utan den är felloggningen avstängd. */
  readonly VITE_SENTRY_DSN?: string;
  readonly VITE_FLODIA_MILJO?: string;
}
