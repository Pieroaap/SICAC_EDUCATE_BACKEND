import { describe, expect, it } from 'vitest';
import { AppError } from '../src/shared/errors.js';
import { assertDocumentFile, assertDocumentSignature, MAX_DOCUMENT_BYTES } from '../src/modules/documents/service.js';

describe('assertDocumentFile', () => {
  it('acepta un PDF dentro del límite', () => {
    expect(() => assertDocumentFile({ filename: 'silabo.pdf', mimeType: 'application/pdf', size: 1024 }))
      .not.toThrow();
  });

  it('rechaza archivos demasiado grandes', () => {
    expect(() => assertDocumentFile({
      filename: 'silabo.pdf', mimeType: 'application/pdf', size: MAX_DOCUMENT_BYTES + 1,
    })).toThrow(AppError);
  });

  it('rechaza MIME peligroso y extensiones inconsistentes', () => {
    expect(() => assertDocumentFile({ filename: 'pagina.html', mimeType: 'text/html', size: 10 }))
      .toThrow(AppError);
    expect(() => assertDocumentFile({ filename: 'archivo.exe', mimeType: 'application/pdf', size: 10 }))
      .toThrow(AppError);
  });

  it('valida la firma binaria y no confía solo en el MIME', () => {
    expect(() => assertDocumentSignature(Buffer.from('%PDF-1.7'), 'application/pdf')).not.toThrow();
    expect(() => assertDocumentSignature(Buffer.from('<html>'), 'application/pdf')).toThrow(AppError);
  });
});
