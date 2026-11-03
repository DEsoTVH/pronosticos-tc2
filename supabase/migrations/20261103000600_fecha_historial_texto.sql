-- Boxerbook entrega a veces solo el año o el mes ("2025", "2025-03") en peleas antiguas.
-- Se guarda tal cual: el formato ISO ordena bien como texto.
alter table public.boxer_fights alter column fight_date type text using fight_date::text;
