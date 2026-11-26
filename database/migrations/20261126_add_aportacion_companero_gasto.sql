ALTER TABLE alquiler_gasto_companeros
ADD COLUMN IF NOT EXISTS aportacion NUMERIC(12, 2) NOT NULL DEFAULT 0
CHECK (aportacion >= 0);
