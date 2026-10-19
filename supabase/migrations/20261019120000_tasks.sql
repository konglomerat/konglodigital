begin;

-- Aufgabenlisten. Zuerst für den Vorstand (Leiste rechts unter Vorstand),
-- angelegt aber für beliebige Bereiche: `board` sagt, wem die Liste gehört —
-- 'vorstand' oder künftig z. B. 'scope:<scopeId>' für einen Werkbereich.
-- Wer welches Board sehen darf, entscheidet die App (src/lib/tasks/boards.ts).
create table if not exists public.task_projects (
  id uuid primary key default gen_random_uuid(),
  board text not null,
  name text not null check (length(btrim(name)) > 0),
  position integer not null default 0,
  created_at timestamptz not null default now(),
  unique (board, name)
);

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.task_projects (id) on delete cascade,
  title text not null check (length(btrim(title)) > 0),
  due_date date,
  -- 1 = Hoch, 2 = Mittel, 3 = Niedrig.
  priority smallint check (priority between 1 and 3),
  done_at timestamptz,
  done_by uuid,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists tasks_project_idx on public.tasks (project_id, done_at);

insert into public.task_projects (board, name, position) values
  ('vorstand', 'Mitgliederverwaltung', 0),
  ('vorstand', 'Mitarbeiter', 1),
  ('vorstand', 'Allgemein', 2)
on conflict (board, name) do nothing;

-- Zugriff nur über den Service-Role-Client, nachdem die App das Board geprüft hat.
alter table public.task_projects enable row level security;
alter table public.tasks enable row level security;

commit;
