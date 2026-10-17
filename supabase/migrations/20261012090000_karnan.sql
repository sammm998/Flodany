-- Fas 2a: kärnans tabeller med konto (tenant_id) och radsäkerhet på varje tabell.
-- Datamodellen följer spec v3 s. 9 och docs/faser/fas-2-plan.md avsnitt B.
-- Grundregel: anon får ingenting, authenticated får bara det som ges uttryckligen nedan,
-- och varje tabell har radsäkerhet påslagen och tvingad.

-- ============ Grund ============

create schema if not exists app;
revoke all on schema app from public, anon;
grant usage on schema app to authenticated, service_role;

-- Nya tabeller och funktioner får inga rättigheter av sig själva (Supabase ger annars allt till anon och authenticated).
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke execute on functions from anon, authenticated;
-- PUBLIC får köra nya funktioner som standard. Det går bara att ta bort globalt, inte per schema.
alter default privileges revoke execute on functions from public;

create type public.konto_typ as enum ('platform', 'main', 'sub', 'direct');
create type public.roll as enum ('admin', 'ekonomi', 'las');
create type public.period_status as enum ('oppen', 'godkand', 'publicerad');
create type public.licens_status as enum ('aktiv', 'pausad', 'avslutad');
create type public.anvandning_typ as enum ('motor', 'ai', 'export');
create type public.personal_roll as enum ('superadmin', 'support');

-- ============ Tabeller ============

create table public.tenants (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid references public.tenants (id) on delete restrict,
  type public.konto_typ not null,
  name text not null check (length(name) between 1 and 200),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) <= 63),
  org_nr text check (org_nr ~ '^\d{6}-\d{4}$'),
  brand jsonb not null default '{}'::jsonb check (jsonb_typeof(brand) = 'object'),
  domain text unique check (domain ~ '^[a-z0-9.-]+$'),
  intern boolean not null default false,
  created_at timestamptz not null default now(),
  -- Underkund har alltid en förälder, övriga aldrig.
  check ((type = 'sub') = (parent_id is not null))
);
create index tenants_parent_idx on public.tenants (parent_id);

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text check (length(name) <= 200),
  phone text check (length(phone) <= 40),
  -- Hash av BankID-identiteten, för version 2. Tom i version 1.
  bankid_subject text unique,
  created_at timestamptz not null default now()
);

create table public.memberships (
  user_id uuid not null references auth.users (id) on delete cascade,
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  role public.roll not null,
  created_at timestamptz not null default now(),
  primary key (user_id, tenant_id)
);
create index memberships_tenant_idx on public.memberships (tenant_id);

create table public.modules (
  key text primary key check (key ~ '^[a-z][a-z0-9-]*$'),
  name text not null,
  version text not null default '1.0.0',
  manifest jsonb not null default '{}'::jsonb
);

create table public.licenses (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  module_key text not null references public.modules (key),
  variant text not null default 'main' check (variant in ('main', 'sub')),
  status public.licens_status not null default 'aktiv',
  paid_by uuid references public.tenants (id) on delete set null,
  price numeric(12, 2) check (price >= 0),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  unique (tenant_id, module_key)
);

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  module_key text not null references public.modules (key),
  path text not null check (
    length(path) <= 512
    and path ~ '^[[:alnum:]_.:@-]+(/[[:alnum:]_.:@-]+)*$'
    and path !~ '(^|/)\.{1,2}(/|$)'
  ),
  -- Samlingen dokumentet ligger i ('' på toppnivå) och dokumentets id, för collection(path).get().
  parent text generated always as (case when strpos(path, '/') > 0 then regexp_replace(path, '/[^/]+$', '') else '' end) stored,
  doc_id text generated always as (regexp_replace(path, '^.*/', '')) stored,
  data jsonb not null check (jsonb_typeof(data) = 'object' and octet_length(data::text) <= 2097152),
  version integer not null default 1,
  updated_by uuid default auth.uid(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, module_key, path)
);
create index documents_samling_idx on public.documents (tenant_id, module_key, parent);

create table public.periods (
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  module_key text not null references public.modules (key),
  period text not null check (period ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  status public.period_status not null default 'oppen',
  version integer not null default 1,
  andrad_av uuid default auth.uid(),
  andrad_at timestamptz not null default now(),
  primary key (tenant_id, module_key, period)
);

create table public.file_runs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  module_key text not null references public.modules (key),
  period text check (period ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  kind text not null check (length(kind) <= 64),
  filename text not null check (length(filename) <= 255),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  summary jsonb not null default '{}'::jsonb,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  unique (tenant_id, module_key, sha256)
);
create index file_runs_period_idx on public.file_runs (tenant_id, module_key, period);

create table public.shares (
  id uuid primary key default gen_random_uuid(),
  from_tenant uuid not null references public.tenants (id) on delete cascade,
  to_tenant uuid not null references public.tenants (id) on delete cascade,
  module_key text not null references public.modules (key),
  period text check (period ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  kind text not null check (length(kind) <= 64),
  payload jsonb not null default '{}'::jsonb,
  version integer not null default 1,
  opened_at timestamptz,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  check (from_tenant <> to_tenant)
);
create index shares_to_idx on public.shares (to_tenant);
create index shares_from_idx on public.shares (from_tenant);

create table public.offers (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid not null references public.tenants (id) on delete cascade,
  module_key text not null references public.modules (key),
  variant text not null default 'sub' check (variant in ('main', 'sub')),
  paid_by text not null default 'underkund' check (paid_by in ('huvudkund', 'underkund')),
  price numeric(12, 2) check (price >= 0),
  auto_enable boolean not null default false,
  created_at timestamptz not null default now()
);
create index offers_parent_idx on public.offers (parent_id);

create table public.invites (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid not null references public.tenants (id) on delete cascade,
  org_nr text check (org_nr ~ '^\d{6}-\d{4}$'),
  email text not null check (email ~ '^[^@\s]+@[^@\s]+$'),
  modules text[] not null default '{}',
  status text not null default 'skickad' check (status in ('skickad', 'accepterad', 'aterkallad', 'utgangen')),
  expires_at timestamptz not null default now() + interval '14 days',
  token_hash text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create index invites_parent_idx on public.invites (parent_id);

create table public.guide_progress (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  module_key text not null references public.modules (key),
  step_key text not null check (step_key ~ '^[a-z0-9:_-]{1,64}$'),
  done_at timestamptz not null default now(),
  primary key (user_id, tenant_id, module_key, step_key)
);
create index guide_progress_tenant_idx on public.guide_progress (tenant_id, module_key);

create table public.audit_log (
  id bigint generated always as identity primary key,
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  actor uuid,
  action text not null check (length(action) <= 64),
  target text check (length(target) <= 512),
  at timestamptz not null default now(),
  via_support boolean not null default false,
  detalj jsonb not null default '{}'::jsonb
);
create index audit_log_tenant_idx on public.audit_log (tenant_id, at);

create table public.usage (
  id bigint generated always as identity primary key,
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  user_id uuid references auth.users (id) on delete set null,
  module_key text not null references public.modules (key),
  kind public.anvandning_typ not null,
  units integer not null default 1 check (units > 0),
  at timestamptz not null default now()
);
create index usage_tenant_idx on public.usage (tenant_id, at);
create index usage_user_idx on public.usage (user_id, at);

-- Skatter och avgifter med giltighetsdatum. Läses bara av servern (SPEC-v3.1 16.1.3). Fylls i fas 3.
create table public.satser (
  id uuid primary key default gen_random_uuid(),
  key text not null check (key ~ '^[a-z0-9._-]+$'),
  value jsonb not null,
  valid_from date not null,
  valid_to date,
  source text,
  unique (key, valid_from),
  check (valid_to is null or valid_to > valid_from)
);

-- Flödias personal. Ger ingen åtkomst till kunddata i fas 2.
create table public.platform_staff (
  user_id uuid primary key references auth.users (id) on delete cascade,
  role public.personal_roll not null
);

-- ============ Hjälpfunktioner för radsäkerheten ============
-- security definer så att policyerna på memberships inte blir rekursiva. search_path tom, allt med schemanamn.

create function app.mina_konton() returns setof uuid
language sql stable security definer set search_path = '' as $$
  select m.tenant_id from public.memberships m where m.user_id = (select auth.uid())
$$;

create function app.har_roll(konto uuid, roller public.roll[]) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.memberships m where m.user_id = (select auth.uid()) and m.tenant_id = konto and m.role = any (roller))
$$;

create function app.har_licens(konto uuid, modul text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.licenses l where l.tenant_id = konto and l.module_key = modul and l.status = 'aktiv' and (l.ended_at is null or l.ended_at > now()))
$$;

-- Användare som delar minst ett konto med den inloggade (för att visa namn i kontot).
create function app.delar_konto(anvandare uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.memberships a join public.memberships b on a.tenant_id = b.tenant_id
    where a.user_id = (select auth.uid()) and b.user_id = anvandare
  )
$$;

create function app.ar_underkund(huvud uuid, under uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.tenants t where t.id = under and t.parent_id = huvud and t.type = 'sub')
$$;


-- ============ Triggrar ============

-- Kontot på en rad kan aldrig bytas (skydd utöver policyernas with check).
create function app.las_konto() returns trigger
language plpgsql set search_path = '' as $$
declare kol text;
begin
  foreach kol in array tg_argv loop
    if (to_jsonb(new) ->> kol) is distinct from (to_jsonb(old) ->> kol) then
      raise exception 'Kolumnen % kan inte ändras', kol using errcode = '42501';
    end if;
  end loop;
  return new;
end $$;

create trigger las_konto before update on public.tenants for each row execute function app.las_konto('id', 'parent_id', 'type', 'slug');
create trigger las_konto before update on public.memberships for each row execute function app.las_konto('user_id', 'tenant_id');
create trigger las_konto before update on public.documents for each row execute function app.las_konto('tenant_id', 'module_key', 'path');
create trigger las_konto before update on public.periods for each row execute function app.las_konto('tenant_id', 'module_key', 'period');
create trigger las_konto before update on public.file_runs for each row execute function app.las_konto('tenant_id', 'module_key');
create trigger las_konto before update on public.shares for each row execute function app.las_konto('from_tenant', 'to_tenant', 'module_key');
create trigger las_konto before update on public.offers for each row execute function app.las_konto('parent_id');
create trigger las_konto before update on public.invites for each row execute function app.las_konto('parent_id');
create trigger las_konto before update on public.licenses for each row execute function app.las_konto('tenant_id', 'module_key');

-- Version och tidsstämpel vid varje ändring.
create function app.ny_version() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.version := old.version + 1;
  if tg_table_name = 'documents' then new.updated_at := now(); new.updated_by := auth.uid();
  elsif tg_table_name = 'periods' then new.andrad_at := now(); new.andrad_av := auth.uid();
  end if;
  return new;
end $$;
create trigger ny_version before update on public.documents for each row execute function app.ny_version();
create trigger ny_version before update on public.periods for each row execute function app.ny_version();

-- Granskningslogg från databasen själv.
create function app.logga_intern(konto uuid, handelse text, mal text, detalj jsonb) returns void
language sql security definer set search_path = '' as $$
  insert into public.audit_log (tenant_id, actor, action, target, detalj) values (konto, auth.uid(), handelse, mal, coalesce(detalj, '{}'::jsonb))
$$;

-- Medlemskap: logga ändringar, och kontot får aldrig stå utan admin.
create function app.medlemskap_andrat() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    perform app.logga_intern(new.tenant_id, 'medlemskap.tillagt', new.user_id::text, jsonb_build_object('roll', new.role));
    return new;
  end if;
  -- Kontot håller på att tas bort: inget att skydda eller logga.
  if not exists (select 1 from public.tenants t where t.id = old.tenant_id) then return coalesce(new, old); end if;
  if old.role = 'admin' and (tg_op = 'DELETE' or new.role <> 'admin')
     and not exists (select 1 from public.memberships m where m.tenant_id = old.tenant_id and m.role = 'admin' and m.user_id <> old.user_id) then
    raise exception 'Kontot måste ha minst en admin' using errcode = '23514';
  end if;
  if tg_op = 'UPDATE' then
    perform app.logga_intern(new.tenant_id, 'medlemskap.roll', new.user_id::text, jsonb_build_object('fran', old.role, 'till', new.role));
    return new;
  end if;
  perform app.logga_intern(old.tenant_id, 'medlemskap.borttaget', old.user_id::text, jsonb_build_object('roll', old.role));
  return old;
end $$;
create trigger medlemskap_andrat after insert on public.memberships for each row execute function app.medlemskap_andrat();
create trigger medlemskap_skydd before update or delete on public.memberships for each row execute function app.medlemskap_andrat();

create function app.konto_andrat() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform app.logga_intern(new.id, 'konto.andrat', null, jsonb_build_object('falt', (
    select coalesce(jsonb_agg(k), '[]'::jsonb) from jsonb_each(to_jsonb(new)) n(k, v) where v is distinct from to_jsonb(old) -> k)));
  return new;
end $$;
create trigger konto_andrat after update on public.tenants for each row execute function app.konto_andrat();

create function app.period_andrad() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    perform app.logga_intern(new.tenant_id, 'period.status', new.module_key || '/' || new.period,
      jsonb_build_object('fran', case when tg_op = 'UPDATE' then old.status end, 'till', new.status));
  end if;
  return new;
end $$;
create trigger period_andrad after insert or update on public.periods for each row execute function app.period_andrad();

-- Profil skapas när användaren skapas.
create function app.ny_anvandare() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, name) values (new.id, new.raw_user_meta_data ->> 'name') on conflict (id) do nothing;
  return new;
end $$;
create trigger ny_anvandare after insert on auth.users for each row execute function app.ny_anvandare();

-- ============ Funktioner som klienten får anropa ============

-- Händelse i granskningsloggen för ett konto där den inloggade är medlem.
create function public.logga(konto uuid, handelse text, mal text default null, detalj jsonb default '{}'::jsonb) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.memberships m where m.user_id = (select auth.uid()) and m.tenant_id = konto) then
    raise exception 'Ingen behörighet' using errcode = '42501';
  end if;
  perform app.logga_intern(konto, handelse, mal, detalj);
end $$;

-- Underkunden markerar en delning som öppnad.
create function public.markera_delning_oppnad(delning uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.shares s set opened_at = coalesce(s.opened_at, now())
  where s.id = delning and exists (select 1 from public.memberships m where m.user_id = (select auth.uid()) and m.tenant_id = s.to_tenant);
  if not found then raise exception 'Ingen behörighet' using errcode = '42501'; end if;
end $$;


-- Granskningsloggen sparas i 3 år (fas-2-beslut.md, beslut 10). Körs av servern varje natt.
create function app.rensa_granskningslogg() returns integer
language sql security definer set search_path = '' as $$
  with bort as (delete from public.audit_log where at < now() - interval '3 years' returning 1) select count(*)::integer from bort
$$;

-- ============ Vem får köra funktionerna ============
-- Ingen får köra något som inte ges uttryckligen här. Triggerfunktioner behöver inga rättigheter.

revoke execute on all functions in schema app from public, anon, authenticated;
revoke execute on all functions in schema public from public, anon, authenticated;
-- Hjälpfunktionerna anropas av policyerna med den inloggades rättigheter.
grant execute on function app.mina_konton(), app.har_roll(uuid, public.roll[]), app.har_licens(uuid, text), app.delar_konto(uuid), app.ar_underkund(uuid, uuid) to authenticated;
grant execute on function public.logga(uuid, text, text, jsonb), public.markera_delning_oppnad(uuid) to authenticated;

-- ============ Radsäkerhet ============

alter table public.tenants enable row level security;
alter table public.profiles enable row level security;
alter table public.memberships enable row level security;
alter table public.modules enable row level security;
alter table public.licenses enable row level security;
alter table public.documents enable row level security;
alter table public.periods enable row level security;
alter table public.file_runs enable row level security;
alter table public.shares enable row level security;
alter table public.offers enable row level security;
alter table public.invites enable row level security;
alter table public.guide_progress enable row level security;
alter table public.audit_log enable row level security;
alter table public.usage enable row level security;
alter table public.satser enable row level security;
alter table public.platform_staff enable row level security;

alter table public.tenants force row level security;
alter table public.profiles force row level security;
alter table public.memberships force row level security;
alter table public.modules force row level security;
alter table public.licenses force row level security;
alter table public.documents force row level security;
alter table public.periods force row level security;
alter table public.file_runs force row level security;
alter table public.shares force row level security;
alter table public.offers force row level security;
alter table public.invites force row level security;
alter table public.guide_progress force row level security;
alter table public.audit_log force row level security;
alter table public.usage force row level security;
alter table public.satser force row level security;
alter table public.platform_staff force row level security;

-- Bort med allt Supabase gett som standard, sedan bara det som behövs.
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

-- tenants: medlemmar läser, admin ändrar namn, org.nr och varumärke.
grant select on public.tenants to authenticated;
grant update (name, org_nr, brand) on public.tenants to authenticated;
create policy "medlem läser" on public.tenants for select to authenticated using (id in (select app.mina_konton()));
create policy "admin ändrar" on public.tenants for update to authenticated
  using (app.har_roll(id, '{admin}')) with check (app.har_roll(id, '{admin}'));

-- profiles: egen profil och profiler i samma konto. Bara egna namn och telefon kan ändras.
grant select on public.profiles to authenticated;
grant update (name, phone) on public.profiles to authenticated;
create policy "egen eller samma konto" on public.profiles for select to authenticated using (id = (select auth.uid()) or app.delar_konto(id));
create policy "egen ändras" on public.profiles for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- memberships: medlemmar läser kontots medlemmar, admin ändrar.
grant select, insert, delete on public.memberships to authenticated;
grant update (role) on public.memberships to authenticated;
create policy "medlem läser" on public.memberships for select to authenticated using (tenant_id in (select app.mina_konton()));
create policy "admin lägger till" on public.memberships for insert to authenticated with check (app.har_roll(tenant_id, '{admin}'));
create policy "admin ändrar" on public.memberships for update to authenticated using (app.har_roll(tenant_id, '{admin}')) with check (app.har_roll(tenant_id, '{admin}'));
create policy "admin tar bort" on public.memberships for delete to authenticated using (app.har_roll(tenant_id, '{admin}'));

-- modules: listan över appar läses av alla inloggade.
grant select on public.modules to authenticated;
create policy "inloggad läser" on public.modules for select to authenticated using (true);

-- licenses: medlemmar läser. Ändras bara av plattformen.
grant select on public.licenses to authenticated;
create policy "medlem läser" on public.licenses for select to authenticated using (tenant_id in (select app.mina_konton()));

-- documents och file_runs: medlemmar läser, ekonomi och admin skriver. Kräver licens för modulen.
grant select, insert, update, delete on public.documents to authenticated;
create policy "medlem läser" on public.documents for select to authenticated
  using (tenant_id in (select app.mina_konton()) and app.har_licens(tenant_id, module_key));
create policy "ekonomi skapar" on public.documents for insert to authenticated
  with check (app.har_roll(tenant_id, '{admin,ekonomi}') and app.har_licens(tenant_id, module_key));
create policy "ekonomi ändrar" on public.documents for update to authenticated
  using (app.har_roll(tenant_id, '{admin,ekonomi}') and app.har_licens(tenant_id, module_key))
  with check (app.har_roll(tenant_id, '{admin,ekonomi}') and app.har_licens(tenant_id, module_key));
create policy "ekonomi tar bort" on public.documents for delete to authenticated
  using (app.har_roll(tenant_id, '{admin,ekonomi}') and app.har_licens(tenant_id, module_key));

grant select, insert, update, delete on public.file_runs to authenticated;
create policy "medlem läser" on public.file_runs for select to authenticated
  using (tenant_id in (select app.mina_konton()) and app.har_licens(tenant_id, module_key));
create policy "ekonomi skapar" on public.file_runs for insert to authenticated
  with check (app.har_roll(tenant_id, '{admin,ekonomi}') and app.har_licens(tenant_id, module_key));
create policy "ekonomi ändrar" on public.file_runs for update to authenticated
  using (app.har_roll(tenant_id, '{admin,ekonomi}') and app.har_licens(tenant_id, module_key))
  with check (app.har_roll(tenant_id, '{admin,ekonomi}') and app.har_licens(tenant_id, module_key));
create policy "ekonomi tar bort" on public.file_runs for delete to authenticated
  using (app.har_roll(tenant_id, '{admin,ekonomi}') and app.har_licens(tenant_id, module_key));

-- periods: medlemmar läser, ekonomi och admin skriver. Tas inte bort.
grant select, insert on public.periods to authenticated;
grant update (status) on public.periods to authenticated;
create policy "medlem läser" on public.periods for select to authenticated
  using (tenant_id in (select app.mina_konton()) and app.har_licens(tenant_id, module_key));
create policy "ekonomi skapar" on public.periods for insert to authenticated
  with check (app.har_roll(tenant_id, '{admin,ekonomi}') and app.har_licens(tenant_id, module_key));
create policy "ekonomi ändrar" on public.periods for update to authenticated
  using (app.har_roll(tenant_id, '{admin,ekonomi}') and app.har_licens(tenant_id, module_key))
  with check (app.har_roll(tenant_id, '{admin,ekonomi}') and app.har_licens(tenant_id, module_key));

-- shares: avsändare och mottagare läser. Huvudkundens ekonomi och admin delar till egen underkund.
-- Mottagaren markerar som öppnad via markera_delning_oppnad. Ändras och tas inte bort av klienten.
grant select, insert on public.shares to authenticated;
create policy "avsändare eller mottagare läser" on public.shares for select to authenticated
  using (from_tenant in (select app.mina_konton()) or to_tenant in (select app.mina_konton()));
create policy "huvudkund delar" on public.shares for insert to authenticated
  with check (app.har_roll(from_tenant, '{admin,ekonomi}') and app.ar_underkund(from_tenant, to_tenant) and app.har_licens(from_tenant, module_key));

-- offers och invites: bara admin i huvudkontot. Inbjudans token läses aldrig av klienten.
grant select, insert, update, delete on public.offers to authenticated;
create policy "admin läser" on public.offers for select to authenticated using (app.har_roll(parent_id, '{admin}'));
create policy "admin skapar" on public.offers for insert to authenticated with check (app.har_roll(parent_id, '{admin}'));
create policy "admin ändrar" on public.offers for update to authenticated using (app.har_roll(parent_id, '{admin}')) with check (app.har_roll(parent_id, '{admin}'));
create policy "admin tar bort" on public.offers for delete to authenticated using (app.har_roll(parent_id, '{admin}'));

grant select (id, parent_id, org_nr, email, modules, status, expires_at, created_by, created_at) on public.invites to authenticated;
grant insert (parent_id, org_nr, email, modules) on public.invites to authenticated;
grant update (status) on public.invites to authenticated;
grant delete on public.invites to authenticated;
create policy "admin läser" on public.invites for select to authenticated using (app.har_roll(parent_id, '{admin}'));
create policy "admin skapar" on public.invites for insert to authenticated with check (app.har_roll(parent_id, '{admin}'));
create policy "admin ändrar" on public.invites for update to authenticated using (app.har_roll(parent_id, '{admin}')) with check (app.har_roll(parent_id, '{admin}'));
create policy "admin tar bort" on public.invites for delete to authenticated using (app.har_roll(parent_id, '{admin}'));

-- guide_progress: varje användare sina egna steg, i egna konton.
grant select, insert, delete on public.guide_progress to authenticated;
create policy "egna steg läses" on public.guide_progress for select to authenticated
  using (user_id = (select auth.uid()) and tenant_id in (select app.mina_konton()));
create policy "egna steg sparas" on public.guide_progress for insert to authenticated
  with check (user_id = (select auth.uid()) and tenant_id in (select app.mina_konton()));
create policy "egna steg tas bort" on public.guide_progress for delete to authenticated
  using (user_id = (select auth.uid()) and tenant_id in (select app.mina_konton()));

-- audit_log: admin läser sitt konto. Skrivs bara via logga() och triggrar. Ändras aldrig.
grant select on public.audit_log to authenticated;
create policy "admin läser" on public.audit_log for select to authenticated using (app.har_roll(tenant_id, '{admin}'));

-- usage: admin läser sitt konto. Skrivs bara av servern.
grant select on public.usage to authenticated;
create policy "admin läser" on public.usage for select to authenticated using (app.har_roll(tenant_id, '{admin}'));

-- satser och platform_staff: ingen klientåtkomst alls (inga rättigheter, inga policyer).

-- ============ Modulerna ============

insert into public.modules (key, name) values
  ('avrakning', 'Avräkning'),
  ('akarkassan', 'Åkarkassan'),
  ('tripkassan', 'Tripkassan'),
  ('foliering', 'Verkstad');
