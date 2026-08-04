WITH duplicados AS (
  SELECT
    ctid,
    row_number() OVER (
      PARTITION BY persona_id, rol_id
      ORDER BY fecha_inicio DESC, updated_at DESC, created_at DESC, ctid DESC
    ) AS posicion
  FROM personas_roles
  WHERE estado = 'activo'
)
UPDATE personas_roles AS asignacion
SET
  estado = 'inactivo',
  fecha_fin = COALESCE(asignacion.fecha_fin, CURRENT_DATE),
  updated_at = NOW()
FROM duplicados
WHERE asignacion.ctid = duplicados.ctid
  AND duplicados.posicion > 1;--> statement-breakpoint
CREATE UNIQUE INDEX "personas_roles_activa_uq"
  ON "personas_roles" USING btree ("persona_id", "rol_id")
  WHERE "estado" = 'activo';
