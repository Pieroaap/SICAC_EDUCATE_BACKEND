CREATE TYPE "public"."clasificacion_beneficio" AS ENUM('regular', 'media_beca', 'tercio_beca', 'especial', 'beca_completa');--> statement-breakpoint
CREATE TYPE "public"."modalidad_beneficio" AS ENUM('becado', 'credito', 'becado_credito', 'normal');--> statement-breakpoint
CREATE TYPE "public"."estado_operativo_alumno" AS ENUM('activo', 'en_pausa', 'retirado', 'sin_contestar', 'graduado');--> statement-breakpoint
CREATE TABLE "perfiles_alumno" (
	"persona_id" uuid PRIMARY KEY NOT NULL,
	"estado" "estado_operativo_alumno" DEFAULT 'activo' NOT NULL,
	"anio_ingreso" integer NOT NULL,
	"periodo_ingreso" varchar(30) NOT NULL,
	"beneficio" "modalidad_beneficio" DEFAULT 'normal' NOT NULL,
	"tipo_beneficio" "clasificacion_beneficio" DEFAULT 'regular' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	CONSTRAINT "perfiles_alumno_anio_ingreso_ck" CHECK ("perfiles_alumno"."anio_ingreso" between 1900 and 2100),
	CONSTRAINT "perfiles_alumno_periodo_formato_ck" CHECK ("perfiles_alumno"."periodo_ingreso" ~ '^[0-9]{4}[[:space:]]*-[[:space:]]*(I|II|III)$')
);
--> statement-breakpoint
ALTER TABLE "matriculas_carrera" DROP CONSTRAINT "matriculas_carrera_beneficio_ck";--> statement-breakpoint
ALTER TABLE "matriculas_carrera" ADD COLUMN "beneficio" "modalidad_beneficio";--> statement-breakpoint
ALTER TABLE "matriculas_carrera" ADD COLUMN "clasificacion_beneficio" "clasificacion_beneficio";--> statement-breakpoint
UPDATE "matriculas_carrera"
SET
  "beneficio" = CASE
    WHEN "tipo_beneficio" = 'credito' THEN 'credito'::"modalidad_beneficio"
    WHEN "tipo_beneficio" = 'beca' THEN 'becado'::"modalidad_beneficio"
    ELSE 'normal'::"modalidad_beneficio"
  END,
  "clasificacion_beneficio" = CASE
    WHEN "porcentaje_beneficio" = 100 THEN 'beca_completa'::"clasificacion_beneficio"
    WHEN "porcentaje_beneficio" = 50 THEN 'media_beca'::"clasificacion_beneficio"
    WHEN "porcentaje_beneficio" IS NOT NULL THEN 'especial'::"clasificacion_beneficio"
    ELSE 'regular'::"clasificacion_beneficio"
  END;
--> statement-breakpoint
ALTER TABLE "perfiles_alumno" ADD CONSTRAINT "perfiles_alumno_persona_id_personas_id_fk" FOREIGN KEY ("persona_id") REFERENCES "public"."personas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "perfiles_alumno_estado_idx" ON "perfiles_alumno" USING btree ("estado");--> statement-breakpoint
CREATE INDEX "perfiles_alumno_periodo_idx" ON "perfiles_alumno" USING btree ("periodo_ingreso");
