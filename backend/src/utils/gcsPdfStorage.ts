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
  const bucketUrlMatch = gcsUri.match(/^gs:\/\/([^/]+)\/(.+)$/);
  if (!bucketUrlMatch) {
    throw new Error(`Invalid GCS URI: ${gcsUri}`);
  }
  
  const parsedBucketName = bucketUrlMatch[1];
  const gcsPath = bucketUrlMatch[2];
  
  const bucket = storage.bucket(parsedBucketName);
  const file = bucket.file(gcsPath);
  
  await file.download({ destination: localDest });
  console.log(`[GCS] Downloaded ${gcsUri} to ${localDest}`);
}
