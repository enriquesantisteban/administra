ALTER TABLE alquiler_gastos
ADD COLUMN IF NOT EXISTS dividir_entre SMALLINT NOT NULL DEFAULT 1
CHECK (dividir_entre >= 1);
