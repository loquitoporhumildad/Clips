-- Tablas de clips dentro del proyecto Supabase `nba-predictor` (prefijo clips_). Ya aplicado el 2026-11-14.
create table if not exists clips_videos (
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

create table if not exists clips_metrics (
  id bigint generated always as identity primary key,
  video_id bigint references clips_videos(id) on delete cascade,
  platform text not null,          -- tiktok | instagram | youtube
  captured_at timestamptz default now(),
  views int, likes int, comments int, shares int,
  retention_pct numeric, earnings_usd numeric
);

create table if not exists clips_trends (
  id bigint generated always as identity primary key,
  day date not null,
  source text not null,            -- google_trends | youtube | tiktok | whop ...
  topic text not null,
  score numeric, payload jsonb,
  created_at timestamptz default now()
);

create table if not exists clips_bitacora (
  id bigint generated always as identity primary key,
  day date not null,
  who text not null,               -- 'juan' | 'socio'
  published text, tested text, learned text, next text,
  created_at timestamptz default now()
);

alter table clips_videos enable row level security;
alter table clips_metrics enable row level security;
alter table clips_trends enable row level security;
alter table clips_bitacora enable row level security;

-- Solo usuarios con sesión (Juan y el socio) pueden leer y escribir desde la página.
create policy "auth all" on clips_videos for all to authenticated using (true) with check (true);
create policy "auth all" on clips_metrics for all to authenticated using (true) with check (true);
create policy "auth all" on clips_trends for all to authenticated using (true) with check (true);
create policy "auth all" on clips_bitacora for all to authenticated using (true) with check (true);

-- Bucket privado para los videos.
insert into storage.buckets (id, name, public) values ('clips-videos', 'clips-videos', false)
on conflict (id) do nothing;
create policy "auth read videos" on storage.objects for select to authenticated using (bucket_id = 'clips-videos');
