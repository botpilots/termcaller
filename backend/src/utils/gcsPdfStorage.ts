import { Storage } from '@google-cloud/storage';
import path from 'path';
import fs from 'fs';

const storage = new Storage();
const bucketName = process.env.GCS_BUCKET_NAME || 'termcaller-sqlite-data'; // Re-using the same bucket for PDFs

export async function uploadPdfToGcs(localPath: string, projectId: string): Promise<string> {
  const bucket = storage.bucket(bucketName);
  const gcsPath = `pdfs/${projectId}.pdf`;
  
  await bucket.upload(localPath, {
    destination: gcsPath,
    metadata: {
      contentType: 'application/pdf',
    },
  });
  
  console.log(`[GCS] Uploaded PDF to gs://${bucketName}/${gcsPath}`);
  return `gs://${bucketName}/${gcsPath}`;
}

export async function downloadPdfFromGcs(gcsUri: string, localDest: string): Promise<void> {
  if (!gcsUri.startsWith(`gs://${bucketName}/`)) {
    throw new Error(`Invalid GCS URI or bucket mismatch: ${gcsUri}`);
  }
  
  const gcsPath = gcsUri.replace(`gs://${bucketName}/`, '');
  const bucket = storage.bucket(bucketName);
  const file = bucket.file(gcsPath);
  
  await file.download({ destination: localDest });
  console.log(`[GCS] Downloaded ${gcsUri} to ${localDest}`);
}
