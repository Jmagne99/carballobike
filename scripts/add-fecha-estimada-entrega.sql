-- Ejecutar en Supabase SQL Editor si aún no existe la columna:
alter table public.services
  add column if not exists fecha_estimada_entrega date;
