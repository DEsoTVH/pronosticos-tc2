-- 1) Solo datos públicos. Lo que es creación de Boxerbook (sus pronósticos y su ranking propio) no se usa: se elimina.
alter table public.bouts drop column bb_forecast_p_a;
alter table public.upcoming_bouts drop column p_a;
delete from public.rankings where publisher = 'boxerbook';

-- 2) El bot ahora vota por récord (datos públicos). Se renombra y se borran sus votos aún abiertos,
--    que se habían hecho con el pronóstico; el próximo sync los rehace con la regla nueva.
update public.profiles set username = 'bot_tc2', display_name = 'Bot TC2 (por récord)' where is_bot;
delete from public.predictions
where points is null
  and user_id in (select id from public.profiles where is_bot)
  and bout_id in (
    select b.id from public.bouts b join public.events e on e.id = b.event_id where e.status = 'abierto'
  );

-- 3) Fuente de cada dato: boxerbook | boxrec | manual (u otra que se agregue).
--    Permite saber qué vino de dónde el día que se quiera depender solo de datos propios.
alter table public.boxers add column source text not null default 'manual';
update public.boxers set source = 'boxerbook' where boxerbook_id is not null;
update public.boxers set source = 'boxrec'    where boxrec_id is not null;          -- lo cargado desde BoxRec manda
update public.boxers set source = 'boxerbook' where boxerbook_id is null and boxrec_id is null and is_manual = false;

alter table public.boxer_fights add column source text not null default 'manual';
update public.boxer_fights set source = 'boxerbook' where is_manual = false;
update public.boxer_fights f set source = b.source
  from public.boxers b where b.id = f.boxer_id and f.is_manual = true and b.source = 'boxrec';

-- 4) Foto de Wikimedia ya copiada a nuestro Storage: la búsqueda semanal no la vuelve a tocar.
alter table public.boxers add column photo_copied boolean not null default false;
