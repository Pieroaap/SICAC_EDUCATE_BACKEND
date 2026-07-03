CREATE TYPE "public"."estado_retiro_asistencia" AS ENUM('vigente', 'reactivado');--> statement-breakpoint
CREATE TYPE "public"."estado_solicitud_reactivacion" AS ENUM('pendiente', 'aprobada', 'rechazada');--> statement-breakpoint
CREATE TABLE "retiros_asistencia" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"curso_programado_id" uuid NOT NULL,
	"matricula_curso_programado_id" uuid NOT NULL,
	"fecha_retiro" timestamp with time zone DEFAULT now() NOT NULL,
	"faltas_al_retiro" integer NOT NULL,
	"tardanzas_al_retiro" integer NOT NULL,
	"faltas_equivalentes_al_retiro" integer NOT NULL,
	"estado" "estado_retiro_asistencia" DEFAULT 'vigente' NOT NULL,
	"reactivado_at" timestamp with time zone,
	"reactivado_por" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid
);
--> statement-breakpoint
CREATE TABLE "solicitudes_reactivacion_asistencia" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"retiro_asistencia_id" uuid NOT NULL,
	"solicitada_por" uuid NOT NULL,
	"motivo" text NOT NULL,
	"estado" "estado_solicitud_reactivacion" DEFAULT 'pendiente' NOT NULL,
	"resuelta_por" uuid,
	"resuelta_at" timestamp with time zone,
	"observacion_resolucion" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid
);
--> statement-breakpoint
ALTER TABLE "retiros_asistencia" ADD CONSTRAINT "retiros_asistencia_curso_programado_id_cursos_programados_id_fk" FOREIGN KEY ("curso_programado_id") REFERENCES "public"."cursos_programados"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retiros_asistencia" ADD CONSTRAINT "retiros_asistencia_matricula_curso_programado_id_matricula_cursos_programados_id_fk" FOREIGN KEY ("matricula_curso_programado_id") REFERENCES "public"."matricula_cursos_programados"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retiros_asistencia" ADD CONSTRAINT "retiros_asistencia_reactivado_por_personas_id_fk" FOREIGN KEY ("reactivado_por") REFERENCES "public"."personas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "solicitudes_reactivacion_asistencia" ADD CONSTRAINT "solicitudes_reactivacion_asistencia_retiro_asistencia_id_retiros_asistencia_id_fk" FOREIGN KEY ("retiro_asistencia_id") REFERENCES "public"."retiros_asistencia"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "solicitudes_reactivacion_asistencia" ADD CONSTRAINT "solicitudes_reactivacion_asistencia_solicitada_por_personas_id_fk" FOREIGN KEY ("solicitada_por") REFERENCES "public"."personas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "solicitudes_reactivacion_asistencia" ADD CONSTRAINT "solicitudes_reactivacion_asistencia_resuelta_por_personas_id_fk" FOREIGN KEY ("resuelta_por") REFERENCES "public"."personas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "retiros_asistencia_curso_idx" ON "retiros_asistencia" USING btree ("curso_programado_id");--> statement-breakpoint
CREATE INDEX "retiros_asistencia_matricula_idx" ON "retiros_asistencia" USING btree ("matricula_curso_programado_id");--> statement-breakpoint
CREATE UNIQUE INDEX "retiros_asistencia_vigente_uq" ON "retiros_asistencia" USING btree ("matricula_curso_programado_id") WHERE "retiros_asistencia"."estado" = 'vigente';--> statement-breakpoint
CREATE INDEX "solicitudes_reactivacion_retiro_idx" ON "solicitudes_reactivacion_asistencia" USING btree ("retiro_asistencia_id");--> statement-breakpoint
CREATE INDEX "solicitudes_reactivacion_estado_idx" ON "solicitudes_reactivacion_asistencia" USING btree ("estado");--> statement-breakpoint
CREATE INDEX "solicitudes_reactivacion_solicitante_idx" ON "solicitudes_reactivacion_asistencia" USING btree ("solicitada_por");--> statement-breakpoint
CREATE INDEX "solicitudes_reactivacion_resolutor_idx" ON "solicitudes_reactivacion_asistencia" USING btree ("resuelta_por");--> statement-breakpoint
CREATE UNIQUE INDEX "solicitudes_reactivacion_pendiente_uq" ON "solicitudes_reactivacion_asistencia" USING btree ("retiro_asistencia_id") WHERE "solicitudes_reactivacion_asistencia"."estado" = 'pendiente';