import { getEnv } from '../src/config/env.js';
import { getSupabaseAdminClient } from '../src/infrastructure/supabase/client.js';
import { MAX_DOCUMENT_BYTES } from '../src/modules/documents/service.js';

const env = getEnv();
const storage = getSupabaseAdminClient().storage;
const { data, error } = await storage.getBucket(env.SUPABASE_STORAGE_BUCKET);
if (error && !error.message.toLowerCase().includes('not found')) throw error;
if (!data) {
  const result = await storage.createBucket(env.SUPABASE_STORAGE_BUCKET, {
    public: false,
    fileSizeLimit: MAX_DOCUMENT_BYTES,
    allowedMimeTypes: [
      'application/pdf', 'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'image/jpeg', 'image/png',
    ],
  });
  if (result.error) throw result.error;
} else {
  const result = await storage.updateBucket(env.SUPABASE_STORAGE_BUCKET, { public: false, fileSizeLimit: MAX_DOCUMENT_BYTES });
  if (result.error) throw result.error;
}
console.info(`Bucket privado ${env.SUPABASE_STORAGE_BUCKET} verificado`);
