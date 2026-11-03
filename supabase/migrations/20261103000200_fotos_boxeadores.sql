-- Foto del boxeador (Wikimedia Commons, vía el id de Wikidata del slug de Boxerbook) con su crédito.
alter table public.boxers
  add column photo_url        text,          -- miniatura (400 px de ancho)
  add column photo_page_url   text,          -- ficha de la imagen en Commons
  add column photo_author     text,
  add column photo_license    text,          -- ej. "CC BY-SA 4.0"
  add column photo_license_url text,
  add column photo_checked_at timestamptz;   -- última vez que se buscó (aunque no tenga foto)
