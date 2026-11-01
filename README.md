# Pronósticos TC2 🥊

Página web de pronósticos de boxeo para el club: cada fin de semana se publican las peleas, los miembros votan quién gana (y opcionalmente cómo y en qué round), y una tabla de posiciones muestra quién acierta más.

## Stack

- **Base de datos, login y API:** [Supabase](https://supabase.com) (PostgreSQL + Auth por correo)
- **Datos de peleadores y peleas:** [Boxerbook](https://boxerbook.com), datos abiertos bajo licencia [ODbL](https://opendatacommons.org/licenses/odbl/). Hay que mostrar la atribución "Datos: Boxerbook".
- **Frontend:** por definir (propuesta: Next.js)

## Cómo funciona

1. El admin elige una cartelera de Boxerbook y selecciona las peleas a votar. Se guarda una copia mínima en la base de datos con los ids de Boxerbook.
2. Los usuarios se registran con su correo y votan hasta la hora de inicio de la cartelera.
3. Al cerrar la votación, los votos de todos se hacen visibles.
4. Una tarea programada consulta los resultados en Boxerbook y los puntos se calculan solos.

> Las horas de Boxerbook vienen en UTC y corresponden al inicio de la cartelera, no al de cada pelea. Hay que mostrarlas en hora de Chile.

## Sistema de puntos

| Acierto | Puntos |
|---|---|
| Ganador | 3 |
| + Método (KO / Decisión / Otro) | +1 |
| + Round (solo si fue KO) | +1 |
| Empate | 5 |
| Pelea cancelada o sin decisión | no cuenta |

Máximo por pelea: **5 puntos**. Hay un usuario "bot" opcional que vota siempre por el favorito del modelo de Boxerbook, para que el club compita contra él.

## Base de datos

El esquema completo está en [`supabase/schema.sql`](supabase/schema.sql): tablas, cálculo automático de puntos, tablas de posiciones y seguridad (RLS).

| Tabla | Contenido |
|---|---|
| `profiles` | Usuarios (se crean solos al registrarse) |
| `boxers` | Peleadores (copia desde Boxerbook o agregados a mano) |
| `events` | Carteleras y hora de cierre de la votación |
| `bouts` | Peleas, resultado y pronóstico de Boxerbook |
| `predictions` | Votos de cada usuario y sus puntos |

Vistas: `leaderboard` (general) y `event_leaderboard` (por fin de semana).

### Instalación

1. Crear un proyecto en Supabase.
2. En **SQL Editor**, pegar `supabase/schema.sql` y ejecutar.
3. Registrarse en la app y hacerse admin:
   ```sql
   update profiles set is_admin = true where username like 'tuusuario%';
   ```

## Pendiente

- [ ] Script de sincronización con Boxerbook (importar carteleras y traer resultados)
- [ ] Frontend: login, votación, tabla de posiciones
- [ ] Panel de admin para armar los eventos
