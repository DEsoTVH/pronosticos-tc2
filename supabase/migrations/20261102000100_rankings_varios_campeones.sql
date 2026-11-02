-- Algunos organismos (ej. WBA) tienen varios campeones por división (super, regular, interino)
-- y todos vienen con position = 0. La clave pasa a ser el boxeador, no la posición.
alter table public.rankings drop constraint rankings_pkey;
alter table public.rankings add primary key (publisher, division, boxer_id);
