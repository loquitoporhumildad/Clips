-- Directos vigilados desde la página (pestaña Directos). Idempotente: se puede aplicar varias veces.
create table if not exists clips_vigilar (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  owner text not null default 'juan',          -- de quién son los minutos de GitHub: juan | socio
  cuenta text not null default 'Clip Vault',   -- Clip Vault (con campaña) | PeakClips (crecimiento)
  url text not null,
  campana text,
  minutos int not null default 330,            -- minutos de Actions reservados para esta ejecución
  hasta_utc timestamptz,
  estado text not null default 'pendiente',    -- pendiente | lanzado | vigilando | terminado | error
  clips int not null default 0,
  minutos_usados int not null default 0,
  detalle text,
  actualizado timestamptz not null default now()
);
alter table clips_vigilar enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'clips_vigilar' and policyname = 'auth all') then
    create policy "auth all" on clips_vigilar for all to authenticated using (true) with check (true);
  end if;
end $$;
create index if not exists clips_vigilar_creado on clips_vigilar (created_at desc);
