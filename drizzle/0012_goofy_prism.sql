CREATE TYPE "public"."estado_taller_programado" AS ENUM('borrador', 'abierto', 'en_curso', 'finalizado', 'cancelado');--> statement-breakpoint
CREATE TYPE "public"."dia_semana" AS ENUM('lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo');--> statement-breakpoint
CREATE TYPE "public"."modalidad_taller" AS ENUM('presencial', 'virtual', 'hibrido');--> statement-breakpoint
CREATE TABLE "auditoria_taller_programado" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"taller_programado_id" uuid NOT NULL,
	"cambios" jsonb NOT NULL,
	"actor_persona_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "historial_estados_inscripcion_taller" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"inscripcion_taller_id" uuid NOT NULL,
	"estado_anterior" "estado_inscripcion_taller",
	"estado_nuevo" "estado_inscripcion_taller" NOT NULL,
	"motivo" text,
	"actor_persona_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "historial_estados_taller_programado" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"taller_programado_id" uuid NOT NULL,
	"estado_anterior" "estado_taller_programado",
	"estado_nuevo" "estado_taller_programado" NOT NULL,
	"motivo" text,
	"actor_persona_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "horarios_taller_programado" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"taller_programado_id" uuid NOT NULL,
	"dia" "dia_semana" NOT NULL,
	"hora_inicio" time NOT NULL,
	"hora_fin" time NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	CONSTRAINT "horarios_taller_programado_horas_ck" CHECK ("horarios_taller_programado"."hora_fin" > "horarios_taller_programado"."hora_inicio")
);
--> statement-breakpoint
ALTER TABLE "historial_estados_inscripcion_taller" ALTER COLUMN "estado_anterior" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "historial_estados_inscripcion_taller" ALTER COLUMN "estado_nuevo" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "inscripciones_taller" ALTER COLUMN "estado" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "inscripciones_taller" ALTER COLUMN "estado" SET DEFAULT 'activa'::text;--> statement-breakpoint
UPDATE "inscripciones_taller" SET "estado" = CASE "estado"
	WHEN 'activo' THEN 'activa'
	WHEN 'retirado' THEN 'retirada'
	WHEN 'completado' THEN 'completada'
	ELSE 'anulada'
END;--> statement-breakpoint
DROP TYPE "public"."estado_inscripcion_taller";--> statement-breakpoint
CREATE TYPE "public"."estado_inscripcion_taller" AS ENUM('activa', 'retirada', 'completada', 'anulada');--> statement-breakpoint
ALTER TABLE "historial_estados_inscripcion_taller" ALTER COLUMN "estado_anterior" SET DATA TYPE "public"."estado_inscripcion_taller" USING "estado_anterior"::"public"."estado_inscripcion_taller";--> statement-breakpoint
ALTER TABLE "historial_estados_inscripcion_taller" ALTER COLUMN "estado_nuevo" SET DATA TYPE "public"."estado_inscripcion_taller" USING "estado_nuevo"::"public"."estado_inscripcion_taller";--> statement-breakpoint
ALTER TABLE "inscripciones_taller" ALTER COLUMN "estado" SET DEFAULT 'activa'::"public"."estado_inscripcion_taller";--> statement-breakpoint
ALTER TABLE "inscripciones_taller" ALTER COLUMN "estado" SET DATA TYPE "public"."estado_inscripcion_taller" USING "estado"::"public"."estado_inscripcion_taller";--> statement-breakpoint
DROP INDEX "inscripciones_taller_programado_idx";--> statement-breakpoint
DROP INDEX "talleres_programados_profesor_idx";--> statement-breakpoint
ALTER TABLE "inscripciones_taller" ALTER COLUMN "fecha_inscripcion" SET DEFAULT current_date;--> statement-breakpoint
ALTER TABLE "talleres_programados" ALTER COLUMN "profesor_persona_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "talleres_programados" ALTER COLUMN "estado" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "talleres_programados" ALTER COLUMN "estado" SET DATA TYPE text USING "estado"::text;--> statement-breakpoint
UPDATE "talleres_programados" SET "estado" = CASE "estado"
	WHEN 'activo' THEN 'borrador'
	ELSE 'cancelado'
END;--> statement-breakpoint
ALTER TABLE "talleres_programados" ALTER COLUMN "estado" SET DATA TYPE "public"."estado_taller_programado" USING "estado"::text::"public"."estado_taller_programado";--> statement-breakpoint
ALTER TABLE "talleres_programados" ALTER COLUMN "estado" SET DEFAULT 'borrador';--> statement-breakpoint
ALTER TABLE "talleres_programados" ADD COLUMN "modalidad" "modalidad_taller" DEFAULT 'presencial' NOT NULL;--> statement-breakpoint
ALTER TABLE "talleres_programados" ADD COLUMN "ubicacion" text DEFAULT 'Por definir' NOT NULL;--> statement-breakpoint
ALTER TABLE "talleres_programados" ADD COLUMN "cupo_maximo" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "auditoria_taller_programado" ADD CONSTRAINT "auditoria_taller_programado_taller_programado_id_talleres_programados_id_fk" FOREIGN KEY ("taller_programado_id") REFERENCES "public"."talleres_programados"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auditoria_taller_programado" ADD CONSTRAINT "auditoria_taller_programado_actor_persona_id_personas_id_fk" FOREIGN KEY ("actor_persona_id") REFERENCES "public"."personas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "historial_estados_inscripcion_taller" ADD CONSTRAINT "historial_estados_inscripcion_taller_inscripcion_taller_id_inscripciones_taller_id_fk" FOREIGN KEY ("inscripcion_taller_id") REFERENCES "public"."inscripciones_taller"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "historial_estados_inscripcion_taller" ADD CONSTRAINT "historial_estados_inscripcion_taller_actor_persona_id_personas_id_fk" FOREIGN KEY ("actor_persona_id") REFERENCES "public"."personas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "historial_estados_taller_programado" ADD CONSTRAINT "historial_estados_taller_programado_taller_programado_id_talleres_programados_id_fk" FOREIGN KEY ("taller_programado_id") REFERENCES "public"."talleres_programados"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "historial_estados_taller_programado" ADD CONSTRAINT "historial_estados_taller_programado_actor_persona_id_personas_id_fk" FOREIGN KEY ("actor_persona_id") REFERENCES "public"."personas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "horarios_taller_programado" ADD CONSTRAINT "horarios_taller_programado_taller_programado_id_talleres_programados_id_fk" FOREIGN KEY ("taller_programado_id") REFERENCES "public"."talleres_programados"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "auditoria_taller_programado_idx" ON "auditoria_taller_programado" USING btree ("taller_programado_id","created_at");--> statement-breakpoint
CREATE INDEX "historial_inscripcion_taller_idx" ON "historial_estados_inscripcion_taller" USING btree ("inscripcion_taller_id","created_at");--> statement-breakpoint
CREATE INDEX "historial_taller_programado_idx" ON "historial_estados_taller_programado" USING btree ("taller_programado_id","created_at");--> statement-breakpoint
CREATE INDEX "horarios_taller_programado_idx" ON "horarios_taller_programado" USING btree ("taller_programado_id");--> statement-breakpoint
CREATE UNIQUE INDEX "horarios_taller_programado_bloque_uq" ON "horarios_taller_programado" USING btree ("taller_programado_id","dia","hora_inicio","hora_fin");--> statement-breakpoint
CREATE INDEX "inscripciones_taller_programado_estado_idx" ON "inscripciones_taller" USING btree ("taller_programado_id","estado");--> statement-breakpoint
CREATE INDEX "inscripciones_taller_persona_idx" ON "inscripciones_taller" USING btree ("persona_id");--> statement-breakpoint
CREATE INDEX "talleres_programados_responsable_idx" ON "talleres_programados" USING btree ("profesor_persona_id");--> statement-breakpoint
CREATE INDEX "talleres_programados_estado_fechas_idx" ON "talleres_programados" USING btree ("estado","fecha_inicio");--> statement-breakpoint
ALTER TABLE "talleres" DROP COLUMN "estado";--> statement-breakpoint
ALTER TABLE "talleres_programados" ADD CONSTRAINT "talleres_programados_cupo_ck" CHECK ("talleres_programados"."cupo_maximo" > 0);
