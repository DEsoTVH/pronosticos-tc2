-- Últimas 6 peleas de cada boxeador, de la más reciente a la más antigua (rn = 1 es la última).
-- Sirve para los puntos de forma en la lista de boxeadores.
create view public.boxer_recent_fights
with (security_invoker = on)
as
select boxer_id, boxerbook_bout_id, fight_date, result, opponent_name, method, round, rn
from (
  select f.*, row_number() over (
    partition by f.boxer_id order by f.fight_date desc, f.boxerbook_bout_id desc
  ) as rn
  from public.boxer_fights f
) t
where rn <= 6;
