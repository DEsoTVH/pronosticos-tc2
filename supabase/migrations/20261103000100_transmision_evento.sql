-- Enlace de la transmisión en vivo (YouTube o Twitch) que se muestra en la página del evento.
alter table public.events add column stream_url text;
