-- Historial de peleas de cada boxeador (copia de Boxerbook). La web solo lee de aquí.
-- Una fila por boxeador y pelea, vista desde ese boxeador (resultado = el suyo).
-- No es la tabla "bouts": esa es solo para las peleas que el club vota.
create table public.boxer_fights (
  boxer_id               bigint not null references public.boxers (id) on delete cascade,
  boxerbook_bout_id      bigint not null,
  fight_date             date not null,
  opponent_name          text not null,
  opponent_boxerbook_id  bigint,
  result                 text check (result in ('W', 'L', 'D', 'NC')),   -- null = sin resultado claro
  method                 text,                                           -- KO, TKO, RTD, UD, SD, MD, PTS, DQ…
  round                  int,
  fight_time             text,                                           -- tiempo del round, ej. 2:15
  scheduled_rounds       int,
  title_text             text,
  exhibition             boolean not null default false,
  record_before          text,                                           -- récord del boxeador antes de la pelea
  opponent_record_before text,
  boxerbook_url          text,
  primary key (boxer_id, boxerbook_bout_id)
);

create index boxer_fights_date_idx on public.boxer_fights (boxer_id, fight_date desc);
create index boxer_fights_opponent_idx on public.boxer_fights (opponent_boxerbook_id);

alter table public.boxer_fights enable row level security;
create policy "historial visible" on public.boxer_fights for select using (true);

-- Última vez que se bajó el historial (para ir refrescándolo por tandas)
alter table public.boxers add column history_synced_at timestamptz;
