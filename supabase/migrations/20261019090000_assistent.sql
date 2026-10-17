-- Assistenten: chatten med agenten (ägarens uppdrag 2026-10-17, utökar SPEC-v3.1 avsnitt 14).
-- Samtalen sparas per användare och konto i 90 dagar (avsnitt 14.5). Serverfunktionen assistent läser och skriver
-- dem med användarens token, så varje användare ser bara sina egna samtal, och bara i konton hon är med i.

-- Modulen assistent finns för att frågorna ska räknas i usage (fakturaunderlag och tak). Den har ingen licens.
insert into public.modules (key, name) values ('assistent', 'Assistenten') on conflict (key) do nothing;

-- Tak för frågor till assistenten per konto och dygn. Samma rader som taket för anrop (tak).
alter table public.tak add column assistent_per_dag integer not null default 200 check (assistent_per_dag > 0);
comment on column public.tak.assistent_per_dag is 'Högsta antal frågor till assistenten per konto och dygn.';

create table public.assistent_samtal (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  titel text not null check (length(titel) between 1 and 200),
  -- Systemtexten för samtalet. Sätts när samtalet skapas och ändras inte (historien till modellen är append-only).
  system text not null check (length(system) <= 20000),
  -- Historien till modellen (Anthropics format), det chatten visar och panelerna som öppnades.
  meddelanden jsonb not null default '[]'::jsonb check (jsonb_typeof(meddelanden) = 'array' and octet_length(meddelanden::text) <= 8388608),
  visning jsonb not null default '[]'::jsonb check (jsonb_typeof(visning) = 'array' and octet_length(visning::text) <= 8388608),
  paneler jsonb not null default '[]'::jsonb check (jsonb_typeof(paneler) = 'array' and octet_length(paneler::text) <= 16777216),
  skapad timestamptz not null default now(),
  andrad timestamptz not null default now()
);
create index assistent_samtal_anvandare_idx on public.assistent_samtal (user_id, tenant_id, andrad desc);
create trigger las_konto before update on public.assistent_samtal for each row execute function app.las_konto('tenant_id', 'user_id', 'system');

alter table public.assistent_samtal enable row level security;
alter table public.assistent_samtal force row level security;
revoke all on public.assistent_samtal from anon, authenticated;
grant select, insert, update, delete on public.assistent_samtal to authenticated;
grant select, insert, update, delete on public.assistent_samtal to service_role;
create policy "egna samtal läses" on public.assistent_samtal for select to authenticated
  using (user_id = (select auth.uid()) and tenant_id in (select app.mina_konton()));
create policy "egna samtal skapas" on public.assistent_samtal for insert to authenticated
  with check (user_id = (select auth.uid()) and tenant_id in (select app.mina_konton()));
create policy "egna samtal ändras" on public.assistent_samtal for update to authenticated
  using (user_id = (select auth.uid()) and tenant_id in (select app.mina_konton()))
  with check (user_id = (select auth.uid()) and tenant_id in (select app.mina_konton()));
create policy "egna samtal tas bort" on public.assistent_samtal for delete to authenticated
  using (user_id = (select auth.uid()) and tenant_id in (select app.mina_konton()));
