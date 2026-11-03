-- Distingue a los boxeadores que se cargan o completan a mano de los que el sync crea sin ficha
-- (Boxerbook los lista sin id). Solo los manuales se muestran en la lista pública sin ficha sincronizada.
alter table public.boxers add column is_manual boolean not null default false;
