CREATE TABLE IF NOT EXISTS companeros (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nombre TEXT NOT NULL UNIQUE,
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO companeros (nombre)
SELECT DISTINCT btrim(nombre)
FROM alquiler_companeros
WHERE btrim(nombre) <> ''
ON CONFLICT (nombre) DO NOTHING;

ALTER TABLE alquiler_companeros
  ADD COLUMN IF NOT EXISTS companero_id BIGINT REFERENCES companeros(id) ON DELETE SET NULL;

UPDATE alquiler_companeros AS alquiler_companero
SET companero_id = companero.id
FROM companeros AS companero
WHERE alquiler_companero.companero_id IS NULL
  AND lower(btrim(alquiler_companero.nombre)) = lower(btrim(companero.nombre));

CREATE TABLE IF NOT EXISTS alquiler_gasto_companeros (
  gasto_id BIGINT NOT NULL REFERENCES alquiler_gastos(id) ON DELETE CASCADE,
  companero_id BIGINT NOT NULL REFERENCES companeros(id) ON DELETE CASCADE,
  PRIMARY KEY (gasto_id, companero_id)
);
