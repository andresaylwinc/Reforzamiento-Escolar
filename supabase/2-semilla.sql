-- =============================================================
--  Semilla opcional: estructura de ejemplo para probar
--  Ejecutar SOLO si quieres partir con Colegio 1..6 y
--  Estudiante 1..45. Después se pueden borrar o renombrar.
-- =============================================================

insert into public.colegios (id, nombre, comuna, color) values
  ('c1', 'Colegio 1', 'Los Parques', '#2F6F4E'),
  ('c2', 'Colegio 2', 'Los Parques', '#2B6CB0'),
  ('c3', 'Colegio 3', 'Los Parques', '#9C4221'),
  ('c4', 'Colegio 4', 'Los Parques', '#553C9A'),
  ('c5', 'Colegio 5', 'Los Parques', '#0F766E'),
  ('c6', 'Colegio 6', 'Los Parques', '#B7791F')
on conflict (id) do nothing;

insert into public.cursos (id, colegio_id, nombre) values
  ('k1', 'c1', 'Curso 1'), ('k2', 'c1', 'Curso 2'),
  ('k3', 'c2', 'Curso 1'),
  ('k4', 'c3', 'Curso 1'),
  ('k5', 'c4', 'Curso 1'), ('k6', 'c4', 'Curso 2'),
  ('k7', 'c5', 'Curso 1'),
  ('k8', 'c6', 'Curso 1')
on conflict (id) do nothing;

insert into public.estudiantes (id, colegio_id, curso_id, nombre)
select
  'e' || lpad(i::text, 3, '0'),
  case when i <= 9 then 'c1' when i <= 17 then 'c2' when i <= 24 then 'c3'
       when i <= 32 then 'c4' when i <= 38 then 'c5' else 'c6' end,
  case when i <= 5 then 'k1' when i <= 9 then 'k2' when i <= 17 then 'k3'
       when i <= 24 then 'k4' when i <= 28 then 'k5' when i <= 32 then 'k6'
       when i <= 38 then 'k7' else 'k8' end,
  'Estudiante ' || i
from generate_series(1, 45) as i
on conflict (id) do nothing;
