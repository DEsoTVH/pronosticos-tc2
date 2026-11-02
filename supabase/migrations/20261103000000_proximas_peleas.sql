-- Copia del calendario de Boxerbook para la página "Peleas".
-- La llena la sincronización (service_role); la web solo lee, nunca consulta la API.
create table public.upcoming_bouts (
  boxerbook_bout_id  bigint primary key,
  event_key          text not null,               -- identifica la cartelera (e<id> o b<primera pelea>)
  event_date         date not null,
  start_utc          timestamptz,
  venue              text,
  city               text,
  country            text,
  division           text,
  title_text         text,
  scheduled_rounds   int,
  a_name             text not null,
  a_record           text,
  b_name             text not null,
  b_record           text,
  display_first      text not null default 'a' check (display_first in ('a', 'b')),
  p_a                numeric,                     -- pronóstico del modelo Boxerbook (gana a)
  synced_at          timestamptz not null default now()
);

create index upcoming_bouts_start_idx on public.upcoming_bouts (start_utc, event_key);

alter table public.upcoming_bouts enable row level security;
create policy "peleas próximas visibles" on public.upcoming_bouts for select using (true);
