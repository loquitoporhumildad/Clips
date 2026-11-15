-- Esquema del proyecto Supabase `clips` (org nbapicks). Ejecutar una vez en el SQL Editor.
create table if not exists videos (
  id bigint generated always as identity primary key,
  day date not null,
  spec_id text not null,
  brand text not null,
  lang text not null,
  account text,
  owner text,                      -- 'juan' | 'socio'
  storage_path text not null,
  title text, description text, hashtags text[] default '{}', notes text,
  status text not null default 'listo',   -- listo | publicado | descartado
  created_at timestamptz default now(),
  unique (day, spec_id, lang)
);

create table if not exists metrics (
  id bigint generated always as identity primary key,
  video_id bigint references videos(id) on delete cascade,
  platform text not null,          -- tiktok | instagram | youtube
  captured_at timestamptz default now(),
  views int, likes int, comments int, shares int,
  retention_pct numeric, earnings_usd numeric
);

create table if not exists trends (
  id bigint generated always as identity primary key,
  day date not null,
  source text not null,            -- google_trends | youtube | tiktok | whop ...
  topic text not null,
  score numeric, payload jsonb,
  created_at timestamptz default now()
);

create table if not exists bitacora (
  id bigint generated always as identity primary key,
  day date not null,
  who text not null,               -- 'juan' | 'socio'
  published text, tested text, learned text, next text,
  created_at timestamptz default now()
);

alter table videos enable row level security;
alter table metrics enable row level security;
alter table trends enable row level security;
alter table bitacora enable row level security;

-- Solo usuarios con sesión (Juan y el socio) pueden leer y escribir desde la página.
create policy "auth all" on videos for all to authenticated using (true) with check (true);
create policy "auth all" on metrics for all to authenticated using (true) with check (true);
create policy "auth all" on trends for all to authenticated using (true) with check (true);
create policy "auth all" on bitacora for all to authenticated using (true) with check (true);

-- Bucket privado para los videos.
insert into storage.buckets (id, name, public) values ('videos', 'videos', false)
on conflict (id) do nothing;
create policy "auth read videos" on storage.objects for select to authenticated using (bucket_id = 'videos');
