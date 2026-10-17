-- Fotoläsning av klädlistan (ägarens uppdrag 2026-10-14), avstängd tills ägaren slår på den.
-- Funktioner per konto enligt docs/faser/fas-3-moduler-plan.md, i ett första steg: katalogen och kontots rader.
-- Spärren på dokument (documents.funktion och funktion_sokvagar) byggs med resten av fas 3.

-- ============ Katalogen ============

create type public.funktion_typ as enum ('paket', 'tillval');

create table public.funktioner (
  nyckel text primary key check (nyckel ~ '^[a-z][a-z0-9-]*\.[a-z][a-z0-9-]*$'),
  module_key text not null references public.modules (key),
  namn text not null,
  typ public.funktion_typ not null,
  kraver text[] not null default '{}',
  standard_pa boolean not null default false
);
comment on table public.funktioner is 'Paket och tillval inom en modul. Skrivs bara av plattformen.';

-- ============ Per konto ============
-- Skrivs bara av plattformen (service-nyckeln, scripts/konto.mjs). Ingen kund kan slå på något själv:
-- det är en fråga om pris och avtal. Medlemmar i kontot läser sina rader, så att skärmarna kan visa knappar.

create table public.konto_funktioner (
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  nyckel text not null references public.funktioner (nyckel),
  status public.licens_status not null default 'aktiv',
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  price numeric(12, 2) check (price >= 0),
  installningar jsonb not null default '{}'::jsonb,
  primary key (tenant_id, nyckel)
);
create index konto_funktioner_nyckel_idx on public.konto_funktioner (nyckel);
create trigger las_konto before update on public.konto_funktioner for each row execute function app.las_konto('tenant_id', 'nyckel');

-- Beroenden: det en funktion kräver måste vara aktivt i kontot, och det som krävs kan inte stängas av.
create function app.konto_funktion_kontroll() returns trigger
language plpgsql security definer set search_path = '' as $$
declare saknas text; kravs_av text;
begin
  -- Kontot håller på att tas bort: inget att skydda.
  if tg_op = 'DELETE' and not exists (select 1 from public.tenants t where t.id = old.tenant_id) then return old; end if;
  if tg_op in ('INSERT', 'UPDATE') and new.status = 'aktiv' then
    select k into saknas from public.funktioner f, unnest(f.kraver) k
    where f.nyckel = new.nyckel and not exists (
      select 1 from public.konto_funktioner x where x.tenant_id = new.tenant_id and x.nyckel = k and x.status = 'aktiv'
    ) limit 1;
    if saknas is not null then
      raise exception 'Funktionen % kräver % i kontot.', new.nyckel, saknas using errcode = '23514';
    end if;
  end if;
  if tg_op = 'DELETE' or (tg_op = 'UPDATE' and new.status <> 'aktiv') then
    select x.nyckel into kravs_av from public.konto_funktioner x join public.funktioner f on f.nyckel = x.nyckel
    where x.tenant_id = old.tenant_id and x.status = 'aktiv' and old.nyckel = any (f.kraver) limit 1;
    if kravs_av is not null then
      raise exception 'Funktionen % krävs av % i kontot.', old.nyckel, kravs_av using errcode = '23514';
    end if;
  end if;
  return coalesce(new, old);
end $$;

-- Varje ändring loggas i granskningsloggen, efter att den gjorts (en upsert loggas som det den blev).
create function app.konto_funktion_andrad() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' and not exists (select 1 from public.tenants t where t.id = old.tenant_id) then return null; end if;
  perform app.logga_intern(coalesce(new.tenant_id, old.tenant_id), 'funktion.' || lower(tg_op), coalesce(new.nyckel, old.nyckel),
    jsonb_build_object('status', case when tg_op = 'DELETE' then null else new.status end));
  return null;
end $$;
revoke execute on function app.konto_funktion_kontroll(), app.konto_funktion_andrad() from public, anon, authenticated;
create trigger konto_funktion_kontroll before insert or update or delete on public.konto_funktioner
  for each row execute function app.konto_funktion_kontroll();
create trigger konto_funktion_andrad after insert or update or delete on public.konto_funktioner
  for each row execute function app.konto_funktion_andrad();

-- ============ Radsäkerhet och rättigheter ============

alter table public.funktioner enable row level security;
alter table public.funktioner force row level security;
alter table public.konto_funktioner enable row level security;
alter table public.konto_funktioner force row level security;
revoke all on public.funktioner, public.konto_funktioner from anon, authenticated;
grant select on public.funktioner, public.konto_funktioner to authenticated;
grant select, insert, update, delete on public.funktioner, public.konto_funktioner to service_role;

create policy "inloggade läser" on public.funktioner for select to authenticated using (true);
create policy "medlem läser" on public.konto_funktioner for select to authenticated using (tenant_id in (select app.mina_konton()));

-- ============ Fotoläsningen ============
-- Av i alla konton. Får slås på först när villkoren i docs/fotolasning.md är uppfyllda.

insert into public.funktioner (nyckel, module_key, namn, typ) values
  ('avrakning.fotolasning', 'avrakning', 'Fotoläsning av klädlistan', 'tillval');

-- Tak för fotoläsningar per konto och dag (svensk tid), utöver taket för alla anrop.
alter table public.tak add column foto_per_dag integer not null default 20 check (foto_per_dag > 0);
comment on column public.tak.foto_per_dag is 'Högsta antal fotoläsningar (anrop till Anthropic) per konto och dag.';
