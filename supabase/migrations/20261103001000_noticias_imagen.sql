-- Miniatura de la noticia, tal como la entrega el feed (enlace al servidor del medio; no se copia el archivo).
alter table public.news add column image_url text;
