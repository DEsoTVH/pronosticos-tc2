-- Boxeadores cargados a mano: ciudad, enlace a BoxRec, historial propio y fotos propias.

alter table public.boxers
  add column city          text,
  add column boxrec_id     bigint,            -- solo para enlazar a su ficha en BoxRec
  add column photo_manual  boolean not null default false;  -- foto subida por el admin: la búsqueda en Commons no la toca

-- Peleas sin id de Boxerbook: clave propia, y el id de Boxerbook pasa a ser opcional.
alter table public.boxer_fights add constraint boxer_fights_boxer_bout_key unique (boxer_id, boxerbook_bout_id);
alter table public.boxer_fights drop constraint boxer_fights_pkey;
alter table public.boxer_fights add column id bigint generated always as identity primary key;
alter table public.boxer_fights alter column boxerbook_bout_id drop not null;
alter table public.boxer_fights add column is_manual boolean not null default false;

create policy "admin historial" on public.boxer_fights for all
  using (public.is_admin()) with check (public.is_admin());

-- Fotos propias: bucket público de lectura; solo los admin escriben.
insert into storage.buckets (id, name, public)
values ('boxer-photos', 'boxer-photos', true)
on conflict (id) do nothing;

create policy "fotos boxeadores: admin sube" on storage.objects for insert
  with check (bucket_id = 'boxer-photos' and public.is_admin());
create policy "fotos boxeadores: admin reemplaza" on storage.objects for update
  using (bucket_id = 'boxer-photos' and public.is_admin());
create policy "fotos boxeadores: admin borra" on storage.objects for delete
  using (bucket_id = 'boxer-photos' and public.is_admin());
