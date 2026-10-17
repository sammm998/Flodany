-- Ägarens beslut efter 2d (2026-10-12):
-- 1. Läs-rollen har ingen åtkomst alls till kassorna (personnummer, bankkonton, löner), varken i
--    databasen, i livevisningen eller i serverfunktionen. En maskad vy kan komma i version 2.
-- 2. Taket för anrop läses från en tabell per konto, så att det kan ändras utan driftsättning.

-- ============ Känsliga moduler ============

alter table public.modules add column kanslig boolean not null default false;
comment on column public.modules.kanslig is 'Modulen innehåller personuppgifter om anställda (lön). Läs-rollen har ingen åtkomst.';
update public.modules set kanslig = true where key in ('akarkassan', 'tripkassan');

-- Får den inloggade läsa modulens data i kontot? Medlem, och admin eller ekonomi om modulen är känslig.
create function app.far_lasa(konto uuid, modul text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.memberships m join public.modules mo on mo.key = modul
    where m.user_id = (select auth.uid()) and m.tenant_id = konto and (m.role in ('admin', 'ekonomi') or not mo.kanslig)
  )
$$;
revoke execute on function app.far_lasa(uuid, text) from public, anon;
grant execute on function app.far_lasa(uuid, text) to authenticated;

drop policy "medlem läser" on public.documents;
create policy "medlem läser" on public.documents for select to authenticated
  using (app.far_lasa(tenant_id, module_key) and app.har_licens(tenant_id, module_key));
drop policy "medlem läser" on public.file_runs;
create policy "medlem läser" on public.file_runs for select to authenticated
  using (app.far_lasa(tenant_id, module_key) and app.har_licens(tenant_id, module_key));
drop policy "medlem läser" on public.periods;
create policy "medlem läser" on public.periods for select to authenticated
  using (app.far_lasa(tenant_id, module_key) and app.har_licens(tenant_id, module_key));
drop policy "avsändare eller mottagare läser" on public.shares;
create policy "avsändare eller mottagare läser" on public.shares for select to authenticated
  using (app.far_lasa(from_tenant, module_key) or app.far_lasa(to_tenant, module_key));

-- Livevisningen: samma regel för kanalen dok:<konto>:<modul>.
create or replace function app.dok_kanal_tillaten(amne text) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare m text[] := regexp_match(amne, '^dok:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}):([a-z][a-z0-9-]*)$');
begin
  if m is null then return false; end if;
  return app.far_lasa(m[1]::uuid, m[2]) and app.har_licens(m[1]::uuid, m[2]);
end $$;

-- ============ Tak för anrop per konto ============
-- Raden utan konto (tenant_id null) är standard. En rad för ett konto ersätter standarden för det kontot.
-- Ändras av plattformen (service-nyckeln, senare admin). Kontots admin kan läsa sitt tak.

create table public.tak (
  tenant_id uuid references public.tenants (id) on delete cascade,
  per_anvandare_minut integer not null check (per_anvandare_minut > 0),
  per_konto_timme integer not null check (per_konto_timme > 0),
  andrad_at timestamptz not null default now(),
  unique nulls not distinct (tenant_id)
);
alter table public.tak enable row level security;
alter table public.tak force row level security;
revoke all on public.tak from anon, authenticated;
grant select on public.tak to authenticated;
create policy "admin läser" on public.tak for select to authenticated using (tenant_id is not null and app.har_roll(tenant_id, '{admin}'));

insert into public.tak (tenant_id, per_anvandare_minut, per_konto_timme) values (null, 60, 3000);
