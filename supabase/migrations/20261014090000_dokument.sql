-- Fas 2c: documents-API. Skrivning i ett anrop (utan läs-och-skriv-race) och händelser för onSnapshot.
-- Funktionerna körs med den inloggades rättigheter (security invoker), så radsäkerheten gäller som vanligt.

-- set (lage 'ersatt') och set med merge eller update (lage 'sammanfoga', ytlig sammanfogning på toppnivå
-- som i claude-shim.js). Skapar dokumentet om det saknas. Svarar med den nya versionen.
create function public.dok_skriv(konto uuid, modul text, sokvag text, innehall jsonb, lage text default 'ersatt') returns integer
language plpgsql security invoker set search_path = '' as $$
declare v integer;
begin
  if lage not in ('ersatt', 'sammanfoga') then
    raise exception 'Okänt läge %', lage using errcode = '22023';
  end if;
  insert into public.documents as d (tenant_id, module_key, path, data) values (konto, modul, sokvag, innehall)
  on conflict (tenant_id, module_key, path) do update
    set data = case when lage = 'sammanfoga' then d.data || excluded.data else excluded.data end
  returning d.version into v;
  return v;
end $$;

-- delete. Ett dokument som inte finns är inget fel (som i claude-shim.js). Ett dokument som syns
-- men inte får tas bort ger fel, så att klienten får not_granted i stället för att inget händer.
create function public.dok_ta_bort(konto uuid, modul text, sokvag text) returns void
language plpgsql security invoker set search_path = '' as $$
begin
  delete from public.documents d where d.tenant_id = konto and d.module_key = modul and d.path = sokvag;
  if not found and exists (select 1 from public.documents d where d.tenant_id = konto and d.module_key = modul and d.path = sokvag) then
    raise exception 'Ingen behörighet' using errcode = '42501';
  end if;
end $$;

revoke execute on function public.dok_skriv(uuid, text, text, jsonb, text), public.dok_ta_bort(uuid, text, text) from public, anon;
grant execute on function public.dok_skriv(uuid, text, text, jsonb, text), public.dok_ta_bort(uuid, text, text) to authenticated;

-- ============ Händelser för onSnapshot ============
-- Varje ändring skickas på en privat kanal per konto och modul: dok:<konto>:<modul>.
-- Händelsen innehåller bara sökväg, samling, version och vad som hände, aldrig dokumentets data.
-- Klienten hämtar sedan dokumentet med sina egna rättigheter.

create function app.dok_andrad() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  konto uuid := case when tg_op = 'DELETE' then old.tenant_id else new.tenant_id end;
  modul text := case when tg_op = 'DELETE' then old.module_key else new.module_key end;
  sokvag text := case when tg_op = 'DELETE' then old.path else new.path end;
  samling text := case when tg_op = 'DELETE' then old.parent else new.parent end;
  version integer := case when tg_op = 'DELETE' then old.version else new.version end;
begin
  perform realtime.send(
    jsonb_build_object('path', sokvag, 'parent', samling, 'op', lower(tg_op), 'version', version),
    'dok', 'dok:' || konto || ':' || modul, true);
  return null;
end $$;
create trigger dok_andrad after insert or update or delete on public.documents for each row execute function app.dok_andrad();

-- Får den inloggade ta emot händelser på kanalen? Medlem i kontot och aktiv licens för modulen.
create function app.dok_kanal_tillaten(amne text) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare m text[] := regexp_match(amne, '^dok:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}):([a-z][a-z0-9-]*)$');
begin
  if m is null then return false; end if;
  return exists (select 1 from public.memberships x where x.user_id = (select auth.uid()) and x.tenant_id = m[1]::uuid)
    and app.har_licens(m[1]::uuid, m[2]);
end $$;
revoke execute on function app.dok_andrad(), app.dok_kanal_tillaten(text) from public, anon, authenticated;
grant execute on function app.dok_kanal_tillaten(text) to authenticated;

-- Klienten får ta emot händelser på tillåtna kanaler, men aldrig skicka (ingen insert-policy).
create policy "medlem tar emot dokumenthändelser" on realtime.messages for select to authenticated
  using (realtime.messages.extension = 'broadcast' and app.dok_kanal_tillaten((select realtime.topic())));

-- ============ Sökvägar med svenska tecken ============
-- I 2a godtogs bara [[:alnum:]], som i databasens C-locale bara är ASCII. Appernas id kan innehålla
-- å, ä och ö. Nu godtas allt utom snedstreck, blanksteg och styrtecken, och inga delar som är . eller ..
alter table public.documents drop constraint documents_path_check;
alter table public.documents add constraint documents_path_check check (
  length(path) <= 512
  and path ~ '^[^/[:space:][:cntrl:]]+(/[^/[:space:][:cntrl:]]+)*$'
  and path !~ '(^|/)\.{1,2}(/|$)'
);
