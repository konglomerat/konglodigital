-- Mitglieder dürfen ihr Profil nur noch lesen. Bisher durften sie die eigene
-- Zeile auch anlegen und ändern — samt campai_contact_id und campai_name.
-- Damit ließ sich ein fremder Campai-Kontakt verknüpfen oder ein fremder Name
-- eintragen, über den die App Belege zuordnet.
--
-- Geschrieben wird nur noch serverseitig mit dem Service-Role-Client
-- (Verknüpfen in /admin/users, Registrierung, Einstellungen unter /account).
-- Erst einspielen, wenn der Code live ist, der Einstellungen so speichert —
-- vorher scheitert das Speichern der Einstellungen.
begin;

drop policy if exists "Users can insert own member profile" on public.member_profiles;
drop policy if exists "Users can update own member profile" on public.member_profiles;

-- Zweite Sicherung neben RLS: ohne Schreibrecht hilft auch eine später
-- versehentlich angelegte Policy nicht.
revoke insert, update, delete on public.member_profiles from anon, authenticated;

commit;
