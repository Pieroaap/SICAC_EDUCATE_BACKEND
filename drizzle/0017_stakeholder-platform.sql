CREATE TYPE "public"."estado_componente_evaluacion" AS ENUM('programada', 'en_curso', 'cerrada');--> statement-breakpoint
CREATE TYPE "public"."caracter_taller_plan" AS ENUM('obligatorio', 'electivo');--> statement-breakpoint
CREATE TYPE "public"."tipo_documento_academico" AS ENUM('REGLAMENTO', 'SILABUS', 'ACUERDO_ESTUDIANTIL', 'COMUNICADO', 'MATERIAL_ACADEMICO', 'OTRO');--> statement-breakpoint
CREATE TYPE "public"."ambito_documento" AS ENUM('INSTITUCION', 'CARRERA', 'PLAN_CURRICULAR', 'CURSO', 'CURSO_PROGRAMADO', 'PERIODO_ACADEMICO');--> statement-breakpoint
CREATE TYPE "public"."estado_documento_academico" AS ENUM('activo', 'eliminado');--> statement-breakpoint
CREATE TYPE "public"."estado_publicacion_curso" AS ENUM('activa', 'retirada');--> statement-breakpoint
CREATE TYPE "public"."estado_habilitacion_ciclo" AS ENUM('habilitado', 'sin_oferta', 'requiere_revision', 'ultimo_ciclo');--> statement-breakpoint
CREATE TYPE "public"."estado_preinscripcion_curso" AS ENUM('propuesto', 'sin_oferta', 'confirmado');--> statement-breakpoint
CREATE TYPE "public"."estado_preinscripcion_ciclo" AS ENUM('propuesta', 'requiere_revision', 'confirmada', 'cancelada');--> statement-breakpoint
CREATE TABLE "plan_talleres" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_curricular_id" uuid NOT NULL,
	"taller_id" uuid NOT NULL,
	"caracter" "caracter_taller_plan" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid
);
--> statement-breakpoint
CREATE TABLE "documentos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"storage_key" varchar(500) NOT NULL,
	"nombre_original" varchar(255) NOT NULL,
	"mime_type" varchar(150) NOT NULL,
	"tamano_bytes" integer NOT NULL,
	"tipo" "tipo_documento_academico" NOT NULL,
	"ambito" "ambito_documento" NOT NULL,
	"carrera_id" uuid,
	"plan_curricular_id" uuid,
	"curso_id" uuid,
	"curso_programado_id" uuid,
	"periodo_academico_id" uuid,
	"subido_por_persona_id" uuid NOT NULL,
	"estado" "estado_documento_academico" DEFAULT 'activo' NOT NULL,
	"eliminado_at" timestamp with time zone,
	"eliminado_por_persona_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	CONSTRAINT "documentos_tamano_ck" CHECK ("documentos"."tamano_bytes" > 0 and "documentos"."tamano_bytes" <= 10485760),
	CONSTRAINT "documentos_contexto_ck" CHECK (
    ("documentos"."ambito" = 'INSTITUCION' and num_nonnulls("documentos"."carrera_id", "documentos"."plan_curricular_id", "documentos"."curso_id", "documentos"."curso_programado_id", "documentos"."periodo_academico_id") = 0)
    or ("documentos"."ambito" = 'CARRERA' and "documentos"."carrera_id" is not null and num_nonnulls("documentos"."plan_curricular_id", "documentos"."curso_id", "documentos"."curso_programado_id", "documentos"."periodo_academico_id") = 0)
    or ("documentos"."ambito" = 'PLAN_CURRICULAR' and "documentos"."plan_curricular_id" is not null and num_nonnulls("documentos"."carrera_id", "documentos"."curso_id", "documentos"."curso_programado_id", "documentos"."periodo_academico_id") = 0)
    or ("documentos"."ambito" = 'CURSO' and "documentos"."curso_id" is not null and num_nonnulls("documentos"."carrera_id", "documentos"."plan_curricular_id", "documentos"."curso_programado_id", "documentos"."periodo_academico_id") = 0)
    or ("documentos"."ambito" = 'CURSO_PROGRAMADO' and "documentos"."curso_programado_id" is not null and num_nonnulls("documentos"."carrera_id", "documentos"."plan_curricular_id", "documentos"."curso_id", "documentos"."periodo_academico_id") = 0)
    or ("documentos"."ambito" = 'PERIODO_ACADEMICO' and "documentos"."periodo_academico_id" is not null and num_nonnulls("documentos"."carrera_id", "documentos"."plan_curricular_id", "documentos"."curso_id", "documentos"."curso_programado_id") = 0)
  ),
	CONSTRAINT "documentos_eliminacion_ck" CHECK (
    ("documentos"."estado" = 'activo' and "documentos"."eliminado_at" is null and "documentos"."eliminado_por_persona_id" is null)
    or ("documentos"."estado" = 'eliminado' and "documentos"."eliminado_at" is not null and "documentos"."eliminado_por_persona_id" is not null)
  )
);
--> statement-breakpoint
CREATE TABLE "publicaciones_curso" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"curso_programado_id" uuid NOT NULL,
	"autor_persona_id" uuid NOT NULL,
	"titulo" varchar(180) NOT NULL,
	"contenido" text NOT NULL,
	"fijada" boolean DEFAULT false NOT NULL,
	"estado" "estado_publicacion_curso" DEFAULT 'activa' NOT NULL,
	"publicada_at" timestamp with time zone DEFAULT now() NOT NULL,
	"editada_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid
);
--> statement-breakpoint
CREATE TABLE "publicaciones_documentos" (
	"publicacion_id" uuid NOT NULL,
	"documento_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "publicaciones_documentos_pk" PRIMARY KEY("publicacion_id","documento_id")
);
--> statement-breakpoint
CREATE TABLE "habilitaciones_ciclo" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"persona_id" uuid NOT NULL,
	"carrera_id" uuid NOT NULL,
	"plan_curricular_id" uuid NOT NULL,
	"periodo_origen_id" uuid,
	"ciclo_origen" integer NOT NULL,
	"ciclo_destino" integer,
	"estado" "estado_habilitacion_ciclo" NOT NULL,
	"detalles" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"evaluada_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid
);
--> statement-breakpoint
CREATE TABLE "preinscripciones_ciclo" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"habilitacion_id" uuid NOT NULL,
	"periodo_destino_id" uuid,
	"matricula_carrera_id" uuid,
	"estado" "estado_preinscripcion_ciclo" DEFAULT 'propuesta' NOT NULL,
	"confirmada_at" timestamp with time zone,
	"confirmada_por_persona_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid
);
--> statement-breakpoint
CREATE TABLE "preinscripciones_cursos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"preinscripcion_id" uuid NOT NULL,
	"plan_curso_id" uuid NOT NULL,
	"curso_programado_id" uuid,
	"estado" "estado_preinscripcion_curso" DEFAULT 'propuesto' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid
);
--> statement-breakpoint
CREATE TABLE "horarios_curso_programado" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"curso_programado_id" uuid NOT NULL,
	"dia" "dia_semana" NOT NULL,
	"hora_inicio" time NOT NULL,
	"hora_fin" time NOT NULL,
	"modalidad" "modalidad_taller" NOT NULL,
	"ubicacion" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	CONSTRAINT "horarios_curso_programado_horas_ck" CHECK ("horarios_curso_programado"."hora_fin" > "horarios_curso_programado"."hora_inicio")
);
--> statement-breakpoint
ALTER TABLE "cursos_programados" ADD COLUMN "cupo_maximo" integer;--> statement-breakpoint
ALTER TABLE "componentes_evaluacion" ADD COLUMN "tipo" varchar(60);--> statement-breakpoint
ALTER TABLE "componentes_evaluacion" ADD COLUMN "fecha_programada" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "componentes_evaluacion" ADD COLUMN "fecha_limite" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "componentes_evaluacion" ADD COLUMN "estado" "estado_componente_evaluacion" DEFAULT 'programada' NOT NULL;--> statement-breakpoint
ALTER TABLE "plan_talleres" ADD CONSTRAINT "plan_talleres_plan_curricular_id_planes_curriculares_id_fk" FOREIGN KEY ("plan_curricular_id") REFERENCES "public"."planes_curriculares"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_talleres" ADD CONSTRAINT "plan_talleres_taller_id_talleres_id_fk" FOREIGN KEY ("taller_id") REFERENCES "public"."talleres"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documentos" ADD CONSTRAINT "documentos_carrera_id_carreras_id_fk" FOREIGN KEY ("carrera_id") REFERENCES "public"."carreras"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documentos" ADD CONSTRAINT "documentos_plan_curricular_id_planes_curriculares_id_fk" FOREIGN KEY ("plan_curricular_id") REFERENCES "public"."planes_curriculares"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documentos" ADD CONSTRAINT "documentos_curso_id_cursos_id_fk" FOREIGN KEY ("curso_id") REFERENCES "public"."cursos"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documentos" ADD CONSTRAINT "documentos_curso_programado_id_cursos_programados_id_fk" FOREIGN KEY ("curso_programado_id") REFERENCES "public"."cursos_programados"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documentos" ADD CONSTRAINT "documentos_periodo_academico_id_periodos_academicos_id_fk" FOREIGN KEY ("periodo_academico_id") REFERENCES "public"."periodos_academicos"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documentos" ADD CONSTRAINT "documentos_subido_por_persona_id_personas_id_fk" FOREIGN KEY ("subido_por_persona_id") REFERENCES "public"."personas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documentos" ADD CONSTRAINT "documentos_eliminado_por_persona_id_personas_id_fk" FOREIGN KEY ("eliminado_por_persona_id") REFERENCES "public"."personas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publicaciones_curso" ADD CONSTRAINT "publicaciones_curso_curso_programado_id_cursos_programados_id_fk" FOREIGN KEY ("curso_programado_id") REFERENCES "public"."cursos_programados"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publicaciones_curso" ADD CONSTRAINT "publicaciones_curso_autor_persona_id_personas_id_fk" FOREIGN KEY ("autor_persona_id") REFERENCES "public"."personas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publicaciones_documentos" ADD CONSTRAINT "publicaciones_documentos_publicacion_id_publicaciones_curso_id_fk" FOREIGN KEY ("publicacion_id") REFERENCES "public"."publicaciones_curso"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publicaciones_documentos" ADD CONSTRAINT "publicaciones_documentos_documento_id_documentos_id_fk" FOREIGN KEY ("documento_id") REFERENCES "public"."documentos"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "habilitaciones_ciclo" ADD CONSTRAINT "habilitaciones_ciclo_persona_id_personas_id_fk" FOREIGN KEY ("persona_id") REFERENCES "public"."personas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "habilitaciones_ciclo" ADD CONSTRAINT "habilitaciones_ciclo_carrera_id_carreras_id_fk" FOREIGN KEY ("carrera_id") REFERENCES "public"."carreras"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "habilitaciones_ciclo" ADD CONSTRAINT "habilitaciones_ciclo_plan_curricular_id_planes_curriculares_id_fk" FOREIGN KEY ("plan_curricular_id") REFERENCES "public"."planes_curriculares"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "habilitaciones_ciclo" ADD CONSTRAINT "habilitaciones_ciclo_periodo_origen_id_periodos_academicos_id_fk" FOREIGN KEY ("periodo_origen_id") REFERENCES "public"."periodos_academicos"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preinscripciones_ciclo" ADD CONSTRAINT "preinscripciones_ciclo_habilitacion_id_habilitaciones_ciclo_id_fk" FOREIGN KEY ("habilitacion_id") REFERENCES "public"."habilitaciones_ciclo"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preinscripciones_ciclo" ADD CONSTRAINT "preinscripciones_ciclo_periodo_destino_id_periodos_academicos_id_fk" FOREIGN KEY ("periodo_destino_id") REFERENCES "public"."periodos_academicos"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preinscripciones_ciclo" ADD CONSTRAINT "preinscripciones_ciclo_matricula_carrera_id_matriculas_carrera_id_fk" FOREIGN KEY ("matricula_carrera_id") REFERENCES "public"."matriculas_carrera"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preinscripciones_ciclo" ADD CONSTRAINT "preinscripciones_ciclo_confirmada_por_persona_id_personas_id_fk" FOREIGN KEY ("confirmada_por_persona_id") REFERENCES "public"."personas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preinscripciones_cursos" ADD CONSTRAINT "preinscripciones_cursos_preinscripcion_id_preinscripciones_ciclo_id_fk" FOREIGN KEY ("preinscripcion_id") REFERENCES "public"."preinscripciones_ciclo"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preinscripciones_cursos" ADD CONSTRAINT "preinscripciones_cursos_plan_curso_id_plan_cursos_id_fk" FOREIGN KEY ("plan_curso_id") REFERENCES "public"."plan_cursos"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preinscripciones_cursos" ADD CONSTRAINT "preinscripciones_cursos_curso_programado_id_cursos_programados_id_fk" FOREIGN KEY ("curso_programado_id") REFERENCES "public"."cursos_programados"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "horarios_curso_programado" ADD CONSTRAINT "horarios_curso_programado_curso_programado_id_cursos_programados_id_fk" FOREIGN KEY ("curso_programado_id") REFERENCES "public"."cursos_programados"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "plan_talleres_plan_taller_uq" ON "plan_talleres" USING btree ("plan_curricular_id","taller_id");--> statement-breakpoint
CREATE INDEX "plan_talleres_taller_idx" ON "plan_talleres" USING btree ("taller_id");--> statement-breakpoint
CREATE UNIQUE INDEX "documentos_storage_key_uq" ON "documentos" USING btree ("storage_key");--> statement-breakpoint
CREATE INDEX "documentos_ambito_estado_fecha_idx" ON "documentos" USING btree ("ambito","estado","created_at");--> statement-breakpoint
CREATE INDEX "documentos_carrera_idx" ON "documentos" USING btree ("carrera_id");--> statement-breakpoint
CREATE INDEX "documentos_plan_idx" ON "documentos" USING btree ("plan_curricular_id");--> statement-breakpoint
CREATE INDEX "documentos_curso_idx" ON "documentos" USING btree ("curso_id");--> statement-breakpoint
CREATE INDEX "documentos_curso_programado_idx" ON "documentos" USING btree ("curso_programado_id");--> statement-breakpoint
CREATE INDEX "documentos_periodo_idx" ON "documentos" USING btree ("periodo_academico_id");--> statement-breakpoint
CREATE INDEX "documentos_autor_idx" ON "documentos" USING btree ("subido_por_persona_id");--> statement-breakpoint
CREATE INDEX "documentos_eliminado_por_idx" ON "documentos" USING btree ("eliminado_por_persona_id");--> statement-breakpoint
CREATE INDEX "publicaciones_curso_listado_idx" ON "publicaciones_curso" USING btree ("curso_programado_id","estado","fijada","publicada_at");--> statement-breakpoint
CREATE INDEX "publicaciones_curso_autor_idx" ON "publicaciones_curso" USING btree ("autor_persona_id");--> statement-breakpoint
CREATE INDEX "publicaciones_documentos_documento_idx" ON "publicaciones_documentos" USING btree ("documento_id");--> statement-breakpoint
CREATE UNIQUE INDEX "habilitaciones_persona_plan_ciclo_uq" ON "habilitaciones_ciclo" USING btree ("persona_id","plan_curricular_id","ciclo_origen");--> statement-breakpoint
CREATE INDEX "habilitaciones_carrera_estado_idx" ON "habilitaciones_ciclo" USING btree ("carrera_id","estado","evaluada_at");--> statement-breakpoint
CREATE INDEX "habilitaciones_periodo_idx" ON "habilitaciones_ciclo" USING btree ("periodo_origen_id");--> statement-breakpoint
CREATE UNIQUE INDEX "preinscripciones_habilitacion_uq" ON "preinscripciones_ciclo" USING btree ("habilitacion_id");--> statement-breakpoint
CREATE INDEX "preinscripciones_periodo_estado_idx" ON "preinscripciones_ciclo" USING btree ("periodo_destino_id","estado","created_at");--> statement-breakpoint
CREATE INDEX "preinscripciones_matricula_idx" ON "preinscripciones_ciclo" USING btree ("matricula_carrera_id");--> statement-breakpoint
CREATE INDEX "preinscripciones_confirmada_por_idx" ON "preinscripciones_ciclo" USING btree ("confirmada_por_persona_id");--> statement-breakpoint
CREATE UNIQUE INDEX "preinscripciones_cursos_uq" ON "preinscripciones_cursos" USING btree ("preinscripcion_id","plan_curso_id");--> statement-breakpoint
CREATE INDEX "preinscripciones_cursos_programado_idx" ON "preinscripciones_cursos" USING btree ("curso_programado_id");--> statement-breakpoint
CREATE INDEX "preinscripciones_cursos_plan_idx" ON "preinscripciones_cursos" USING btree ("plan_curso_id");--> statement-breakpoint
CREATE INDEX "horarios_curso_programado_curso_idx" ON "horarios_curso_programado" USING btree ("curso_programado_id");--> statement-breakpoint
CREATE UNIQUE INDEX "horarios_curso_programado_bloque_uq" ON "horarios_curso_programado" USING btree ("curso_programado_id","dia","hora_inicio","hora_fin");--> statement-breakpoint
ALTER TABLE "cursos_programados" ADD CONSTRAINT "cursos_programados_cupo_ck" CHECK ("cursos_programados"."cupo_maximo" is null or "cursos_programados"."cupo_maximo" > 0);