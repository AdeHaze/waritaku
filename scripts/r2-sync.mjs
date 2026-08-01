#!/usr/bin/env node
/**
 * Waritaku CMS -> Cloudflare R2 Sync Utility
 * Uses AWS S3 SDK to recursively upload the local_uploads/ directory to R2.
 */
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { intro, outro, text, spinner, cancel, isCancel } from '@clack/prompts';
import pc from 'picocolors';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mime from 'mime-types';
import dotenv from 'dotenv';

dotenv.config({ path: '.dev.vars' }); // Try to load from Wrangler vars
dotenv.config(); // Try to load from .env

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOCAL_UPLOADS = path.resolve(__dirname, '..', 'local_uploads');

function* walkDir(dir) {
  if (!fs.existsSync(dir)) return;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walkDir(fullPath);
    } else if (entry.isFile()) {
      yield fullPath;
    }
  }
}

async function main() {
  console.clear();
  intro(pc.bgBlue(pc.white(' ☁️ Cloudflare R2 Media Sync ')));

  if (!fs.existsSync(LOCAL_UPLOADS)) {
    console.log(pc.yellow(`No local_uploads directory found at: ${LOCAL_UPLOADS}`));
    console.log('Nothing to sync. Run the WordPress image migration first.');
    process.exit(0);
  }

  const endpoint = await text({
    message: 'Cloudflare R2 Endpoint URL (e.g. https://<ACCOUNT_ID>.r2.cloudflarestorage.com):',
    initialValue: process.env.R2_ENDPOINT_URL || '',
    validate: (v) => !v ? 'Endpoint is required' : undefined
  });
  if (isCancel(endpoint)) { cancel('Sync cancelled'); process.exit(0); }

  const bucket = await text({
    message: 'R2 Bucket Name:',
    initialValue: process.env.R2_BUCKET_NAME || '',
    validate: (v) => !v ? 'Bucket name is required' : undefined
  });
  if (isCancel(bucket)) { cancel('Sync cancelled'); process.exit(0); }

  const accessKeyId = await text({
    message: 'R2 Access Key ID:',
    initialValue: process.env.R2_ACCESS_KEY_ID || '',
    validate: (v) => !v ? 'Access Key is required' : undefined
  });
  if (isCancel(accessKeyId)) { cancel('Sync cancelled'); process.exit(0); }

  const secretAccessKey = await text({
    message: 'R2 Secret Access Key:',
    initialValue: process.env.R2_SECRET_ACCESS_KEY || '',
    validate: (v) => !v ? 'Secret Key is required' : undefined
  });
  if (isCancel(secretAccessKey)) { cancel('Sync cancelled'); process.exit(0); }

  const s3 = new S3Client({
    region: 'auto',
    endpoint: endpoint,
    credentials: {
      accessKeyId,
      secretAccessKey,
    }
  });

  const files = Array.from(walkDir(LOCAL_UPLOADS));
  if (files.length === 0) {
    outro(pc.yellow('local_uploads directory is empty!'));
    process.exit(0);
  }

  console.log(pc.cyan(`\nFound ${files.length.toLocaleString()} files to upload.`));
  const s = spinner();
  s.start('Uploading files to R2...');

  let uploaded = 0;
  let errors = 0;

  // Upload in parallel batches of 20
  const BATCH_SIZE = 20;
  for (let i = 0; i < files.length; i += BATCH_SIZE) {
    const batch = files.slice(i, i + BATCH_SIZE);
    
    await Promise.all(batch.map(async (filePath) => {
      // Create S3 Key (e.g., 2020/01/image.jpg) - we strip the local_uploads part
      const relPath = path.relative(LOCAL_UPLOADS, filePath).replace(/\\/g, '/');
      const ext = path.extname(filePath);
      const contentType = mime.lookup(ext) || 'application/octet-stream';
      
      const fileStream = fs.createReadStream(filePath);

      try {
        await s3.send(new PutObjectCommand({
          Bucket: bucket,
          Key: relPath,
          Body: fileStream,
          ContentType: contentType,
        }));
        uploaded++;
      } catch (err) {
        errors++;
      }
      
      const pct = Math.floor(((uploaded + errors) / files.length) * 100);
      s.message(`Uploading files to R2... ${pct}% (${uploaded.toLocaleString()} uploaded)`);
    }));
  }

  s.stop(pc.green('Sync Complete!'));
  console.log(`\n✅ ${uploaded.toLocaleString()} files successfully uploaded to ${bucket}.`);
  if (errors > 0) {
    console.log(pc.red(`❌ ${errors.toLocaleString()} files failed to upload.`));
  }
  
  outro(pc.bgBlue(pc.white(' You are ready for production! ')));
}

main().catch(console.error);
