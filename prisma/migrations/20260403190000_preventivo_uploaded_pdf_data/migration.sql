-- PDF caricati senza Vercel Blob: contenuto in DB (serverless filesystem read-only)
ALTER TABLE "preventivi" ADD COLUMN "uploaded_pdf_data" BYTEA;
