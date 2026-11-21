begin;

-- Aufgabenliste der Buchhaltung (Leiste rechts auf /receipts).
insert into public.task_projects (board, name, position) values
  ('buchhaltung', 'Überweisen', 0)
on conflict (board, name) do nothing;

commit;
