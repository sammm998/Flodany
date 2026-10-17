-- Uttryckliga rättigheter för service_role (serverfunktionerna motor och legacy, och scripts/konto.mjs).
-- I molnprojektet är "Automatically expose new tables" avstängt, så ingen roll får något av sig själv.
-- service_role går förbi radsäkerheten men behöver ändå rättigheter på tabellerna.
-- anon får fortfarande ingenting. authenticated får det som ges i respektive migration.

grant usage on schema public to service_role;
grant select, insert, update, delete on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;
grant execute on function public.logga(uuid, text, text, jsonb), public.markera_delning_oppnad(uuid),
  public.dok_skriv(uuid, text, text, jsonb, text), public.dok_ta_bort(uuid, text, text) to service_role;
-- Rensningen av granskningsloggen körs av servern (schemaläggs i drift).
grant execute on function app.rensa_granskningslogg() to service_role;
