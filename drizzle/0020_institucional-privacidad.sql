CREATE TABLE "consentimientos_privacidad" (
	"persona_id" uuid NOT NULL,
	"politica_id" uuid NOT NULL,
	"aceptada_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "consentimientos_privacidad_persona_id_politica_id_pk" PRIMARY KEY("persona_id","politica_id")
);
--> statement-breakpoint
CREATE TABLE "noticias_institucionales" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"titulo" varchar(180) NOT NULL,
	"contenido" text NOT NULL,
	"estado" varchar(20) DEFAULT 'borrador' NOT NULL,
	"fijada" boolean DEFAULT false NOT NULL,
	"autor_persona_id" uuid NOT NULL,
	"publicada_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	CONSTRAINT "noticias_estado_ck" CHECK ("noticias_institucionales"."estado" in ('borrador', 'publicada', 'retirada'))
);
--> statement-breakpoint
CREATE TABLE "noticias_documentos" (
	"noticia_id" uuid NOT NULL,
	"documento_id" uuid NOT NULL,
	CONSTRAINT "noticias_documentos_noticia_id_documento_id_pk" PRIMARY KEY("noticia_id","documento_id")
);
--> statement-breakpoint
CREATE TABLE "politicas_privacidad" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version" varchar(60) NOT NULL,
	"titulo" varchar(180) NOT NULL,
	"contenido" text NOT NULL,
	"provisional" boolean DEFAULT true NOT NULL,
	"vigente" boolean DEFAULT true NOT NULL,
	"publicada_at" timestamp with time zone DEFAULT now() NOT NULL,
	"publicada_por" uuid
);
--> statement-breakpoint
ALTER TABLE "documentos" ADD COLUMN "publicado_biblioteca" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "consentimientos_privacidad" ADD CONSTRAINT "consentimientos_privacidad_persona_id_personas_id_fk" FOREIGN KEY ("persona_id") REFERENCES "public"."personas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consentimientos_privacidad" ADD CONSTRAINT "consentimientos_privacidad_politica_id_politicas_privacidad_id_fk" FOREIGN KEY ("politica_id") REFERENCES "public"."politicas_privacidad"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "noticias_institucionales" ADD CONSTRAINT "noticias_institucionales_autor_persona_id_personas_id_fk" FOREIGN KEY ("autor_persona_id") REFERENCES "public"."personas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "noticias_documentos" ADD CONSTRAINT "noticias_documentos_noticia_id_noticias_institucionales_id_fk" FOREIGN KEY ("noticia_id") REFERENCES "public"."noticias_institucionales"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "noticias_documentos" ADD CONSTRAINT "noticias_documentos_documento_id_documentos_id_fk" FOREIGN KEY ("documento_id") REFERENCES "public"."documentos"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "politicas_privacidad" ADD CONSTRAINT "politicas_privacidad_publicada_por_personas_id_fk" FOREIGN KEY ("publicada_por") REFERENCES "public"."personas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "consentimientos_politica_idx" ON "consentimientos_privacidad" USING btree ("politica_id","aceptada_at");--> statement-breakpoint
CREATE INDEX "noticias_listado_idx" ON "noticias_institucionales" USING btree ("estado","fijada","publicada_at");--> statement-breakpoint
CREATE UNIQUE INDEX "politica_version_uq" ON "politicas_privacidad" USING btree ("version");--> statement-breakpoint
CREATE UNIQUE INDEX "politica_vigente_uq" ON "politicas_privacidad" USING btree ("vigente") WHERE "politicas_privacidad"."vigente" = true;--> statement-breakpoint
-- El índice personas_roles_activa_uq ya fue creado por 0019_role-lifecycle-integrity.
INSERT INTO "politicas_privacidad" ("version", "titulo", "contenido", "provisional", "vigente")
VALUES ('temporal-1', 'Uso de datos personales en SICAC — texto provisional',
$$Este texto es provisional y será revisado por la institución.

El Club de Arte y Cultura utiliza SICAC para administrar la relación académica con sus estudiantes. En el portal se utilizan datos de identificación, contacto y trayectoria académica para gestionar la cuenta, matrículas, cursos, evaluaciones, asistencias y comunicaciones institucionales.

Al seleccionar la casilla y pulsar «Aceptar y continuar», manifiesto mi aceptación del uso de mis datos para las finalidades académicas descritas. Esta aceptación no autoriza usos publicitarios, venta de datos ni publicación de mi información personal.

Puedo comunicarme con Administración para solicitar información sobre el tratamiento de mis datos, su actualización o la revisión de mi consentimiento. Si no deseo aceptar, puedo cerrar sesión y consultar con Administración.

SICAC conservará un registro de la versión de este texto que acepté y la fecha de aceptación. Los cambios se presentarán como una nueva versión para su lectura y aceptación.

La institución debe completar y revisar su política definitiva, incluidos los datos del responsable, canales de atención, conservación de la información y servicios que intervienen en su tratamiento.$$,
true, true);
