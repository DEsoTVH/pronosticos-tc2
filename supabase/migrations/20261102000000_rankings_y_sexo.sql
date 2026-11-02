-- Rankings de Boxerbook y organismos (WBC, WBA, IBF, WBO, The Ring, TBRB) + sexo del boxeador.
-- Sirve para la página de boxeadores: filtrar por división y mostrar quién está rankeado.

alter table public.boxers add column sex text check (sex in ('male', 'female'));

create index boxers_name_idx     on public.boxers (lower(name));
create index boxers_division_idx on public.boxers (division);

create table public.rankings (
  publisher      text   not null,                 -- boxerbook | wbc | wba | ibf | wbo | ring | tbrb
  division       text   not null,                 -- código Boxerbook: hea, smid, w_fea...
  position       int    not null,                 -- 0 = campeón
  boxer_id       bigint not null references public.boxers (id) on delete cascade,
  champion_flag  text,                            -- champion, interim, etc. (cuando el organismo lo indica)
  list_date      date,
  synced_at      timestamptz not null default now(),
  primary key (publisher, division, position)
);

create index rankings_boxer_idx on public.rankings (boxer_id);

alter table public.rankings enable row level security;
create policy "rankings visibles" on public.rankings for select using (true);
create policy "admin rankings"    on public.rankings for all
  using (public.is_admin()) with check (public.is_admin());
