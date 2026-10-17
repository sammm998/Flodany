-- Fas 2b: inloggning. Bara e-postlänk (och koden i samma mejl) i version 1, BankID i version 2.
-- Supabase Auth har ingen inställning som stänger av lösenord helt. Hooken körs varje gång en
-- inloggning ska ge en token och stoppar den om användaren loggade in med lösenord.
-- I molnet ska hooken också slås på under Authentication, Hooks (docs/faser/fas-2b.md).

create function app.kontroll_inloggning(event jsonb) returns jsonb
language plpgsql stable set search_path = '' as $$
begin
  if event ->> 'authentication_method' = 'password' then
    return jsonb_build_object('error', jsonb_build_object(
      'http_code', 403,
      'message', 'Inloggning med lösenord används inte. Logga in med länken i e-posten.'));
  end if;
  return jsonb_build_object('claims', event -> 'claims');
end $$;

-- Bara Supabase Auth får köra hooken.
revoke execute on function app.kontroll_inloggning(jsonb) from public, anon, authenticated;
grant usage on schema app to supabase_auth_admin;
grant execute on function app.kontroll_inloggning(jsonb) to supabase_auth_admin;
