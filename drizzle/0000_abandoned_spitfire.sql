CREATE TYPE "public"."estado_acceso" AS ENUM('activo', 'inactivo');--> statement-breakpoint
CREATE TYPE "public"."estado_activo" AS ENUM('activo', 'inactivo');--> statement-breakpoint
CREATE TYPE "public"."tipo_documento" AS ENUM('dni', 'pasaporte', 'carnet_extranjeria', 'otro');--> statement-breakpoint
CREATE TYPE "public"."estado_autorizacion" AS ENUM('pendiente', 'aprobada', 'rechazada');--> statement-breakpoint
CREATE TYPE "public"."tipo_beneficio" AS ENUM('credito', 'beca');--> statement-breakpoint
CREATE TYPE "public"."estado_matricula" AS ENUM('activo', 'retirado', 'completado', 'anulado');--> statement-breakpoint
CREATE TYPE "public"."estado_asistencia" AS ENUM('presente', 'tardanza', 'falta', 'justificada');--> statement-breakpoint
CREATE TYPE "public"."estado_academico" AS ENUM('activo', 'retirado', 'egresado');--> statement-breakpoint
CREATE TYPE "public"."estado_inscripcion_taller" AS ENUM('activo', 'retirado', 'completado');--> statement-breakpoint
CREATE TABLE "alumno_tutores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"alumno_persona_id" uuid NOT NULL,
	"tutor_persona_id" uuid NOT NULL,
	"tipo_relacion" varchar(50) NOT NULL,
	"estado" "estado_activo" DEFAULT 'activo' NOT NULL,
	"fecha_inicio" date NOT NULL,
	"fecha_fin" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid
);
--> statement-breakpoint
CREATE TABLE "personas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tipo_documento" "tipo_documento" NOT NULL,
	"numero_documento" varchar(30) NOT NULL,
	"nombres" varchar(150) NOT NULL,
	"apellido_paterno" varchar(100) NOT NULL,
	"apellido_materno" varchar(100),
	"correo" varchar(255),
	"telefono" varchar(30),
	"fecha_nacimiento" date,
	"estado" "estado_activo" DEFAULT 'activo' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid
);
--> statement-breakpoint
CREATE TABLE "personas_roles" (
	"persona_id" uuid NOT NULL,
	"rol_id" uuid NOT NULL,
	"estado" "estado_activo" DEFAULT 'activo' NOT NULL,
	"fecha_inicio" date NOT NULL,
	"fecha_fin" date,
	"observacion" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	CONSTRAINT "personas_roles_pk" PRIMARY KEY("persona_id","rol_id","fecha_inicio")
);
--> statement-breakpoint
CREATE TABLE "roles_v2" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"codigo" varchar(60) NOT NULL,
	"nombre" varchar(120) NOT NULL,
	"descripcion" text,
	"estado" "estado_activo" DEFAULT 'activo' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid
);
--> statement-breakpoint
CREATE TABLE "usuarios_auth" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"persona_id" uuid NOT NULL,
	"username" varchar(60) NOT NULL,
	"auth_provider_user_id" uuid,
	"estado_acceso" "estado_acceso" DEFAULT 'activo' NOT NULL,
	"ultimo_acceso_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid
);
--> statement-breakpoint
CREATE TABLE "carreras_v2" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"codigo" varchar(30) NOT NULL,
	"nombre" varchar(150) NOT NULL,
	"descripcion" text,
	"estado" "estado_activo" DEFAULT 'activo' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid
);
--> statement-breakpoint
CREATE TABLE "curso_prerrequisitos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_curso_id" uuid NOT NULL,
	"curso_prerrequisito_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	CONSTRAINT "curso_prerrequisitos_no_self_ck" CHECK ("curso_prerrequisitos"."plan_curso_id" <> "curso_prerrequisitos"."curso_prerrequisito_id")
);
--> statement-breakpoint
CREATE TABLE "cursos_v2" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"codigo" varchar(30) NOT NULL,
	"nombre" varchar(150) NOT NULL,
	"descripcion" text,
	"estado" "estado_activo" DEFAULT 'activo' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid
);
--> statement-breakpoint
CREATE TABLE "periodos_academicos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"codigo" varchar(30) NOT NULL,
	"nombre" varchar(100) NOT NULL,
	"fecha_inicio" date NOT NULL,
	"fecha_fin" date NOT NULL,
	"estado" "estado_activo" DEFAULT 'activo' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	CONSTRAINT "periodos_academicos_fechas_ck" CHECK ("periodos_academicos"."fecha_fin" >= "periodos_academicos"."fecha_inicio")
);
--> statement-breakpoint
CREATE TABLE "plan_cursos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_curricular_id" uuid NOT NULL,
	"curso_id" uuid NOT NULL,
	"ciclo" integer NOT NULL,
	"orden" integer NOT NULL,
	"estado" "estado_activo" DEFAULT 'activo' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	CONSTRAINT "plan_cursos_ciclo_positivo_ck" CHECK ("plan_cursos"."ciclo" > 0),
	CONSTRAINT "plan_cursos_orden_positivo_ck" CHECK ("plan_cursos"."orden" > 0)
);
--> statement-breakpoint
CREATE TABLE "planes_curriculares" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"carrera_id" uuid NOT NULL,
	"codigo" varchar(30) NOT NULL,
	"nombre" varchar(150) NOT NULL,
	"version" varchar(30) NOT NULL,
	"estado" "estado_activo" DEFAULT 'activo' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid
);
--> statement-breakpoint
CREATE TABLE "autorizaciones_prerrequisito" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"matricula_carrera_id" uuid NOT NULL,
	"curso_programado_id" uuid NOT NULL,
	"motivo" text NOT NULL,
	"aprobado_por_persona_id" uuid,
	"fecha_aprobacion" timestamp with time zone,
	"estado" "estado_autorizacion" DEFAULT 'pendiente' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid
);
--> statement-breakpoint
CREATE TABLE "cursos_programados_v2" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_curso_id" uuid NOT NULL,
	"periodo_academico_id" uuid NOT NULL,
	"profesor_persona_id" uuid NOT NULL,
	"seccion" varchar(30) NOT NULL,
	"estado" "estado_activo" DEFAULT 'activo' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid
);
--> statement-breakpoint
CREATE TABLE "matricula_cursos_programados" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"matricula_carrera_id" uuid NOT NULL,
	"curso_programado_id" uuid NOT NULL,
	"estado" "estado_matricula" DEFAULT 'activo' NOT NULL,
	"fecha_inscripcion" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid
);
--> statement-breakpoint
CREATE TABLE "matriculas_carrera" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"persona_id" uuid NOT NULL,
	"carrera_id" uuid NOT NULL,
	"plan_curricular_id" uuid NOT NULL,
	"periodo_academico_id" uuid NOT NULL,
	"estado" "estado_matricula" DEFAULT 'activo' NOT NULL,
	"fecha_matricula" date NOT NULL,
	"tipo_beneficio" "tipo_beneficio",
	"porcentaje_beneficio" integer,
	"observacion_beneficio" text,
	"snapshot_carrera_nombre" varchar(150) NOT NULL,
	"snapshot_plan_nombre" varchar(150) NOT NULL,
	"snapshot_costo" numeric(12, 2),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	CONSTRAINT "matriculas_carrera_beneficio_ck" CHECK (
    ("matriculas_carrera"."tipo_beneficio" is null and "matriculas_carrera"."porcentaje_beneficio" is null)
    or ("matriculas_carrera"."tipo_beneficio" is not null and "matriculas_carrera"."porcentaje_beneficio" in (25, 50, 100))
  )
);
--> statement-breakpoint
CREATE TABLE "calificaciones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"componente_evaluacion_id" uuid NOT NULL,
	"matricula_curso_programado_id" uuid NOT NULL,
	"nota" numeric(5, 2) NOT NULL,
	"observacion" text,
	"registrado_por" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	CONSTRAINT "calificaciones_nota_ck" CHECK ("calificaciones"."nota" >= 0 and "calificaciones"."nota" <= 20)
);
--> statement-breakpoint
CREATE TABLE "componentes_evaluacion" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"curso_programado_id" uuid NOT NULL,
	"nombre" varchar(100) NOT NULL,
	"porcentaje" numeric(5, 2) NOT NULL,
	"orden" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	CONSTRAINT "componentes_evaluacion_porcentaje_ck" CHECK ("componentes_evaluacion"."porcentaje" > 0 and "componentes_evaluacion"."porcentaje" <= 100)
);
--> statement-breakpoint
CREATE TABLE "asistencias_v2" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"curso_programado_id" uuid NOT NULL,
	"matricula_curso_programado_id" uuid NOT NULL,
	"fecha" date NOT NULL,
	"estado_asistencia" "estado_asistencia" NOT NULL,
	"registrado_por" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid
);
--> statement-breakpoint
CREATE TABLE "egresados" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"persona_id" uuid NOT NULL,
	"carrera_id" uuid NOT NULL,
	"codigo_egresado" varchar(40) NOT NULL,
	"promocion" varchar(50) NOT NULL,
	"anio_egreso" integer NOT NULL,
	"fecha_egreso" date NOT NULL,
	"aprobado_por_persona_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	CONSTRAINT "egresados_anio_ck" CHECK ("egresados"."anio_egreso" >= 1900)
);
--> statement-breakpoint
CREATE TABLE "historial_estados_academicos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"persona_id" uuid NOT NULL,
	"carrera_id" uuid,
	"matricula_carrera_id" uuid,
	"estado_academico" "estado_academico" NOT NULL,
	"fecha_inicio" date NOT NULL,
	"fecha_fin" date,
	"motivo" text,
	"registrado_por" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	CONSTRAINT "historial_estados_fechas_ck" CHECK ("historial_estados_academicos"."fecha_fin" is null or "historial_estados_academicos"."fecha_fin" >= "historial_estados_academicos"."fecha_inicio")
);
--> statement-breakpoint
CREATE TABLE "inscripciones_taller" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"persona_id" uuid NOT NULL,
	"taller_programado_id" uuid NOT NULL,
	"estado" "estado_inscripcion_taller" DEFAULT 'activo' NOT NULL,
	"fecha_inscripcion" date NOT NULL,
	"snapshot_taller_nombre" varchar(150) NOT NULL,
	"snapshot_costo" numeric(12, 2),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid
);
--> statement-breakpoint
CREATE TABLE "talleres" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"codigo" varchar(30) NOT NULL,
	"nombre" varchar(150) NOT NULL,
	"descripcion" text,
	"estado" "estado_activo" DEFAULT 'activo' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid
);
--> statement-breakpoint
CREATE TABLE "talleres_programados" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"taller_id" uuid NOT NULL,
	"profesor_persona_id" uuid,
	"fecha_inicio" date NOT NULL,
	"fecha_fin" date NOT NULL,
	"costo" numeric(12, 2),
	"estado" "estado_activo" DEFAULT 'activo' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	CONSTRAINT "talleres_programados_fechas_ck" CHECK ("talleres_programados"."fecha_fin" >= "talleres_programados"."fecha_inicio"),
	CONSTRAINT "talleres_programados_costo_ck" CHECK ("talleres_programados"."costo" is null or "talleres_programados"."costo" >= 0)
);
--> statement-breakpoint
ALTER TABLE "alumno_tutores" ADD CONSTRAINT "alumno_tutores_alumno_persona_id_personas_id_fk" FOREIGN KEY ("alumno_persona_id") REFERENCES "public"."personas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alumno_tutores" ADD CONSTRAINT "alumno_tutores_tutor_persona_id_personas_id_fk" FOREIGN KEY ("tutor_persona_id") REFERENCES "public"."personas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personas_roles" ADD CONSTRAINT "personas_roles_persona_id_personas_id_fk" FOREIGN KEY ("persona_id") REFERENCES "public"."personas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personas_roles" ADD CONSTRAINT "personas_roles_rol_id_roles_v2_id_fk" FOREIGN KEY ("rol_id") REFERENCES "public"."roles_v2"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usuarios_auth" ADD CONSTRAINT "usuarios_auth_persona_id_personas_id_fk" FOREIGN KEY ("persona_id") REFERENCES "public"."personas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "curso_prerrequisitos" ADD CONSTRAINT "curso_prerrequisitos_plan_curso_id_plan_cursos_id_fk" FOREIGN KEY ("plan_curso_id") REFERENCES "public"."plan_cursos"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "curso_prerrequisitos" ADD CONSTRAINT "curso_prerrequisitos_curso_prerrequisito_id_plan_cursos_id_fk" FOREIGN KEY ("curso_prerrequisito_id") REFERENCES "public"."plan_cursos"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_cursos" ADD CONSTRAINT "plan_cursos_plan_curricular_id_planes_curriculares_id_fk" FOREIGN KEY ("plan_curricular_id") REFERENCES "public"."planes_curriculares"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_cursos" ADD CONSTRAINT "plan_cursos_curso_id_cursos_v2_id_fk" FOREIGN KEY ("curso_id") REFERENCES "public"."cursos_v2"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planes_curriculares" ADD CONSTRAINT "planes_curriculares_carrera_id_carreras_v2_id_fk" FOREIGN KEY ("carrera_id") REFERENCES "public"."carreras_v2"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "autorizaciones_prerrequisito" ADD CONSTRAINT "autorizaciones_prerrequisito_matricula_carrera_id_matriculas_carrera_id_fk" FOREIGN KEY ("matricula_carrera_id") REFERENCES "public"."matriculas_carrera"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "autorizaciones_prerrequisito" ADD CONSTRAINT "autorizaciones_prerrequisito_curso_programado_id_cursos_programados_v2_id_fk" FOREIGN KEY ("curso_programado_id") REFERENCES "public"."cursos_programados_v2"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "autorizaciones_prerrequisito" ADD CONSTRAINT "autorizaciones_prerrequisito_aprobado_por_persona_id_personas_id_fk" FOREIGN KEY ("aprobado_por_persona_id") REFERENCES "public"."personas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cursos_programados_v2" ADD CONSTRAINT "cursos_programados_v2_plan_curso_id_plan_cursos_id_fk" FOREIGN KEY ("plan_curso_id") REFERENCES "public"."plan_cursos"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cursos_programados_v2" ADD CONSTRAINT "cursos_programados_v2_periodo_academico_id_periodos_academicos_id_fk" FOREIGN KEY ("periodo_academico_id") REFERENCES "public"."periodos_academicos"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cursos_programados_v2" ADD CONSTRAINT "cursos_programados_v2_profesor_persona_id_personas_id_fk" FOREIGN KEY ("profesor_persona_id") REFERENCES "public"."personas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matricula_cursos_programados" ADD CONSTRAINT "matricula_cursos_programados_matricula_carrera_id_matriculas_carrera_id_fk" FOREIGN KEY ("matricula_carrera_id") REFERENCES "public"."matriculas_carrera"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matricula_cursos_programados" ADD CONSTRAINT "matricula_cursos_programados_curso_programado_id_cursos_programados_v2_id_fk" FOREIGN KEY ("curso_programado_id") REFERENCES "public"."cursos_programados_v2"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matriculas_carrera" ADD CONSTRAINT "matriculas_carrera_persona_id_personas_id_fk" FOREIGN KEY ("persona_id") REFERENCES "public"."personas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matriculas_carrera" ADD CONSTRAINT "matriculas_carrera_carrera_id_carreras_v2_id_fk" FOREIGN KEY ("carrera_id") REFERENCES "public"."carreras_v2"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matriculas_carrera" ADD CONSTRAINT "matriculas_carrera_plan_curricular_id_planes_curriculares_id_fk" FOREIGN KEY ("plan_curricular_id") REFERENCES "public"."planes_curriculares"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matriculas_carrera" ADD CONSTRAINT "matriculas_carrera_periodo_academico_id_periodos_academicos_id_fk" FOREIGN KEY ("periodo_academico_id") REFERENCES "public"."periodos_academicos"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calificaciones" ADD CONSTRAINT "calificaciones_componente_evaluacion_id_componentes_evaluacion_id_fk" FOREIGN KEY ("componente_evaluacion_id") REFERENCES "public"."componentes_evaluacion"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calificaciones" ADD CONSTRAINT "calificaciones_matricula_curso_programado_id_matricula_cursos_programados_id_fk" FOREIGN KEY ("matricula_curso_programado_id") REFERENCES "public"."matricula_cursos_programados"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calificaciones" ADD CONSTRAINT "calificaciones_registrado_por_personas_id_fk" FOREIGN KEY ("registrado_por") REFERENCES "public"."personas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "componentes_evaluacion" ADD CONSTRAINT "componentes_evaluacion_curso_programado_id_cursos_programados_v2_id_fk" FOREIGN KEY ("curso_programado_id") REFERENCES "public"."cursos_programados_v2"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asistencias_v2" ADD CONSTRAINT "asistencias_v2_curso_programado_id_cursos_programados_v2_id_fk" FOREIGN KEY ("curso_programado_id") REFERENCES "public"."cursos_programados_v2"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asistencias_v2" ADD CONSTRAINT "asistencias_v2_matricula_curso_programado_id_matricula_cursos_programados_id_fk" FOREIGN KEY ("matricula_curso_programado_id") REFERENCES "public"."matricula_cursos_programados"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asistencias_v2" ADD CONSTRAINT "asistencias_v2_registrado_por_personas_id_fk" FOREIGN KEY ("registrado_por") REFERENCES "public"."personas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "egresados" ADD CONSTRAINT "egresados_persona_id_personas_id_fk" FOREIGN KEY ("persona_id") REFERENCES "public"."personas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "egresados" ADD CONSTRAINT "egresados_carrera_id_carreras_v2_id_fk" FOREIGN KEY ("carrera_id") REFERENCES "public"."carreras_v2"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "egresados" ADD CONSTRAINT "egresados_aprobado_por_persona_id_personas_id_fk" FOREIGN KEY ("aprobado_por_persona_id") REFERENCES "public"."personas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "historial_estados_academicos" ADD CONSTRAINT "historial_estados_academicos_persona_id_personas_id_fk" FOREIGN KEY ("persona_id") REFERENCES "public"."personas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "historial_estados_academicos" ADD CONSTRAINT "historial_estados_academicos_carrera_id_carreras_v2_id_fk" FOREIGN KEY ("carrera_id") REFERENCES "public"."carreras_v2"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "historial_estados_academicos" ADD CONSTRAINT "historial_estados_academicos_matricula_carrera_id_matriculas_carrera_id_fk" FOREIGN KEY ("matricula_carrera_id") REFERENCES "public"."matriculas_carrera"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "historial_estados_academicos" ADD CONSTRAINT "historial_estados_academicos_registrado_por_personas_id_fk" FOREIGN KEY ("registrado_por") REFERENCES "public"."personas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inscripciones_taller" ADD CONSTRAINT "inscripciones_taller_persona_id_personas_id_fk" FOREIGN KEY ("persona_id") REFERENCES "public"."personas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inscripciones_taller" ADD CONSTRAINT "inscripciones_taller_taller_programado_id_talleres_programados_id_fk" FOREIGN KEY ("taller_programado_id") REFERENCES "public"."talleres_programados"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "talleres_programados" ADD CONSTRAINT "talleres_programados_taller_id_talleres_id_fk" FOREIGN KEY ("taller_id") REFERENCES "public"."talleres"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "talleres_programados" ADD CONSTRAINT "talleres_programados_profesor_persona_id_personas_id_fk" FOREIGN KEY ("profesor_persona_id") REFERENCES "public"."personas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "alumno_tutores_alumno_idx" ON "alumno_tutores" USING btree ("alumno_persona_id");--> statement-breakpoint
CREATE INDEX "alumno_tutores_tutor_idx" ON "alumno_tutores" USING btree ("tutor_persona_id");--> statement-breakpoint
CREATE UNIQUE INDEX "personas_documento_uq" ON "personas" USING btree ("tipo_documento","numero_documento");--> statement-breakpoint
CREATE INDEX "personas_correo_idx" ON "personas" USING btree ("correo");--> statement-breakpoint
CREATE INDEX "personas_roles_rol_idx" ON "personas_roles" USING btree ("rol_id");--> statement-breakpoint
CREATE UNIQUE INDEX "roles_v2_codigo_uq" ON "roles_v2" USING btree ("codigo");--> statement-breakpoint
CREATE UNIQUE INDEX "usuarios_auth_persona_uq" ON "usuarios_auth" USING btree ("persona_id");--> statement-breakpoint
CREATE UNIQUE INDEX "usuarios_auth_username_uq" ON "usuarios_auth" USING btree ("username");--> statement-breakpoint
CREATE UNIQUE INDEX "usuarios_auth_provider_user_uq" ON "usuarios_auth" USING btree ("auth_provider_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "carreras_v2_codigo_uq" ON "carreras_v2" USING btree ("codigo");--> statement-breakpoint
CREATE UNIQUE INDEX "curso_prerrequisitos_uq" ON "curso_prerrequisitos" USING btree ("plan_curso_id","curso_prerrequisito_id");--> statement-breakpoint
CREATE INDEX "curso_prerrequisitos_requisito_idx" ON "curso_prerrequisitos" USING btree ("curso_prerrequisito_id");--> statement-breakpoint
CREATE UNIQUE INDEX "cursos_v2_codigo_uq" ON "cursos_v2" USING btree ("codigo");--> statement-breakpoint
CREATE UNIQUE INDEX "periodos_academicos_codigo_uq" ON "periodos_academicos" USING btree ("codigo");--> statement-breakpoint
CREATE UNIQUE INDEX "plan_cursos_plan_curso_uq" ON "plan_cursos" USING btree ("plan_curricular_id","curso_id");--> statement-breakpoint
CREATE INDEX "plan_cursos_curso_idx" ON "plan_cursos" USING btree ("curso_id");--> statement-breakpoint
CREATE UNIQUE INDEX "planes_curriculares_carrera_codigo_version_uq" ON "planes_curriculares" USING btree ("carrera_id","codigo","version");--> statement-breakpoint
CREATE INDEX "autorizaciones_matricula_idx" ON "autorizaciones_prerrequisito" USING btree ("matricula_carrera_id");--> statement-breakpoint
CREATE INDEX "autorizaciones_curso_idx" ON "autorizaciones_prerrequisito" USING btree ("curso_programado_id");--> statement-breakpoint
CREATE INDEX "autorizaciones_aprobador_idx" ON "autorizaciones_prerrequisito" USING btree ("aprobado_por_persona_id");--> statement-breakpoint
CREATE UNIQUE INDEX "cursos_programados_contexto_uq" ON "cursos_programados_v2" USING btree ("plan_curso_id","periodo_academico_id","seccion");--> statement-breakpoint
CREATE INDEX "cursos_programados_periodo_idx" ON "cursos_programados_v2" USING btree ("periodo_academico_id");--> statement-breakpoint
CREATE INDEX "cursos_programados_profesor_idx" ON "cursos_programados_v2" USING btree ("profesor_persona_id");--> statement-breakpoint
CREATE UNIQUE INDEX "matricula_cursos_programados_uq" ON "matricula_cursos_programados" USING btree ("matricula_carrera_id","curso_programado_id");--> statement-breakpoint
CREATE INDEX "matricula_cursos_programados_curso_idx" ON "matricula_cursos_programados" USING btree ("curso_programado_id");--> statement-breakpoint
CREATE INDEX "matriculas_carrera_persona_idx" ON "matriculas_carrera" USING btree ("persona_id");--> statement-breakpoint
CREATE INDEX "matriculas_carrera_carrera_idx" ON "matriculas_carrera" USING btree ("carrera_id");--> statement-breakpoint
CREATE INDEX "matriculas_carrera_plan_idx" ON "matriculas_carrera" USING btree ("plan_curricular_id");--> statement-breakpoint
CREATE INDEX "matriculas_carrera_periodo_idx" ON "matriculas_carrera" USING btree ("periodo_academico_id");--> statement-breakpoint
CREATE UNIQUE INDEX "matriculas_carrera_contexto_uq" ON "matriculas_carrera" USING btree ("persona_id","carrera_id","plan_curricular_id","periodo_academico_id");--> statement-breakpoint
CREATE UNIQUE INDEX "calificaciones_componente_matricula_uq" ON "calificaciones" USING btree ("componente_evaluacion_id","matricula_curso_programado_id");--> statement-breakpoint
CREATE INDEX "calificaciones_matricula_idx" ON "calificaciones" USING btree ("matricula_curso_programado_id");--> statement-breakpoint
CREATE INDEX "calificaciones_registrado_por_idx" ON "calificaciones" USING btree ("registrado_por");--> statement-breakpoint
CREATE INDEX "componentes_evaluacion_curso_idx" ON "componentes_evaluacion" USING btree ("curso_programado_id");--> statement-breakpoint
CREATE UNIQUE INDEX "componentes_evaluacion_orden_uq" ON "componentes_evaluacion" USING btree ("curso_programado_id","orden");--> statement-breakpoint
CREATE UNIQUE INDEX "asistencias_matricula_fecha_uq" ON "asistencias_v2" USING btree ("matricula_curso_programado_id","fecha");--> statement-breakpoint
CREATE INDEX "asistencias_curso_idx" ON "asistencias_v2" USING btree ("curso_programado_id");--> statement-breakpoint
CREATE INDEX "asistencias_registrado_por_idx" ON "asistencias_v2" USING btree ("registrado_por");--> statement-breakpoint
CREATE UNIQUE INDEX "egresados_codigo_uq" ON "egresados" USING btree ("codigo_egresado");--> statement-breakpoint
CREATE UNIQUE INDEX "egresados_persona_carrera_uq" ON "egresados" USING btree ("persona_id","carrera_id");--> statement-breakpoint
CREATE INDEX "egresados_carrera_idx" ON "egresados" USING btree ("carrera_id");--> statement-breakpoint
CREATE INDEX "egresados_aprobador_idx" ON "egresados" USING btree ("aprobado_por_persona_id");--> statement-breakpoint
CREATE INDEX "historial_estados_persona_idx" ON "historial_estados_academicos" USING btree ("persona_id");--> statement-breakpoint
CREATE INDEX "historial_estados_carrera_idx" ON "historial_estados_academicos" USING btree ("carrera_id");--> statement-breakpoint
CREATE INDEX "historial_estados_matricula_idx" ON "historial_estados_academicos" USING btree ("matricula_carrera_id");--> statement-breakpoint
CREATE INDEX "historial_estados_registrado_por_idx" ON "historial_estados_academicos" USING btree ("registrado_por");--> statement-breakpoint
CREATE UNIQUE INDEX "inscripciones_taller_persona_programado_uq" ON "inscripciones_taller" USING btree ("persona_id","taller_programado_id");--> statement-breakpoint
CREATE INDEX "inscripciones_taller_programado_idx" ON "inscripciones_taller" USING btree ("taller_programado_id");--> statement-breakpoint
CREATE UNIQUE INDEX "talleres_codigo_uq" ON "talleres" USING btree ("codigo");--> statement-breakpoint
CREATE INDEX "talleres_programados_taller_idx" ON "talleres_programados" USING btree ("taller_id");--> statement-breakpoint
CREATE INDEX "talleres_programados_profesor_idx" ON "talleres_programados" USING btree ("profesor_persona_id");