-- Boxeadores de Boxerbook que el admin corrigió a mano: la sincronización ya no los sobrescribe.
alter table public.boxers add column sync_locked boolean not null default false;
