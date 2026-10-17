-- Fas 2d (krav från granskningen av 2c): sökvägar lagras alltid i NFC. "å" kan skrivas som ett tecken
-- eller som a plus ring (NFD, vanligt från macOS). Utan normalisering blir det två olika dokument.
-- API:t normaliserar också (packages/api), men servern ska inte lita på klienten.

create function app.normalisera_sokvag() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.path := normalize(new.path, nfc);
  return new;
end $$;
revoke execute on function app.normalisera_sokvag() from public, anon, authenticated;

-- Körs före las_konto (triggrar körs i bokstavsordning), så att en sökväg som redan är NFC inte räknas som ändrad.
create trigger a_normalisera_sokvag before insert or update on public.documents for each row execute function app.normalisera_sokvag();

update public.documents set path = normalize(path, nfc) where path is not nfc normalized;
alter table public.documents add constraint documents_path_nfc check (path is nfc normalized);

-- Skrivning och borttagning normaliserar sökvägen innan den används, så att också sökningen träffar rätt.
create or replace function public.dok_skriv(konto uuid, modul text, sokvag text, innehall jsonb, lage text default 'ersatt') returns integer
language plpgsql security invoker set search_path = '' as $$
declare v integer;
begin
  if lage not in ('ersatt', 'sammanfoga') then
    raise exception 'Okänt läge %', lage using errcode = '22023';
  end if;
  insert into public.documents as d (tenant_id, module_key, path, data) values (konto, modul, normalize(sokvag, nfc), innehall)
  on conflict (tenant_id, module_key, path) do update
    set data = case when lage = 'sammanfoga' then d.data || excluded.data else excluded.data end
  returning d.version into v;
  return v;
end $$;

create or replace function public.dok_ta_bort(konto uuid, modul text, sokvag text) returns void
language plpgsql security invoker set search_path = '' as $$
declare s text := normalize(sokvag, nfc);
begin
  delete from public.documents d where d.tenant_id = konto and d.module_key = modul and d.path = s;
  if not found and exists (select 1 from public.documents d where d.tenant_id = konto and d.module_key = modul and d.path = s) then
    raise exception 'Ingen behörighet' using errcode = '42501';
  end if;
end $$;
