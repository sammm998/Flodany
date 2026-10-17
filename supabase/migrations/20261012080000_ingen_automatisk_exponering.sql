-- Samma läge lokalt och i CI som i molnprojektet, där "Automatically expose new tables" är avstängt
-- (ägarens inställning 2026-10-12): nya tabeller, sekvenser och funktioner i public får inga rättigheter
-- av sig själva, varken för anon, authenticated eller service_role. Varje migration ger rättigheter
-- uttryckligen. I molnet ändrar den här migrationen ingenting, eftersom läget redan är så där.
-- Körs före alla andra migrationer.

alter default privileges in schema public revoke all on tables from anon, authenticated, service_role;
alter default privileges in schema public revoke all on sequences from anon, authenticated, service_role;
alter default privileges in schema public revoke all on functions from anon, authenticated, service_role;
alter default privileges revoke execute on functions from public;
