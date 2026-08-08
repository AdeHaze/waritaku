import fs from 'fs';
import { spawnSync } from 'child_process';
import readline from 'readline';

const DB_NAME = 'waritaku-d1';
const DUMP_FILE = 'local-dump.sql';
const CHUNK_SIZE_LIMIT = 50 * 1024; // 50 KB per chunk (very safe)

async function run() {
  if (!fs.existsSync(DUMP_FILE)) {
    console.error(`File not found: ${DUMP_FILE}`);
    process.exit(1);
  }

  console.log(`Reading ${DUMP_FILE} and splitting into ultra-safe chunks...`);
  console.log(`Using INSERT OR IGNORE to safely skip already inserted data!`);

  const fileStream = fs.createReadStream(DUMP_FILE);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  let currentChunk = '';
  let chunkIndex = 1;

  for await (const line of rl) {
    // Skip transaction wrappers
    if (line.trim().toUpperCase() === 'BEGIN TRANSACTION;') continue;
    if (line.trim().toUpperCase() === 'COMMIT;') continue;

    // Convert INSERT INTO to INSERT OR IGNORE INTO so we can safely retry
    let safeLine = line;
    if (safeLine.startsWith('INSERT INTO')) {
      safeLine = safeLine.replace('INSERT INTO', 'INSERT OR IGNORE INTO');
    }

    if (safeLine.length > 90000) {
      console.warn(`\n⚠️ WARNING: Skipping extremely large statement (Length: ${safeLine.length}). This is likely a massive HTML article that exceeds Cloudflare D1's single-statement size limits.`);
      continue;
    }

    currentChunk += safeLine + '\n';

    // If chunk is large enough, execute it
    if (currentChunk.length >= CHUNK_SIZE_LIMIT && safeLine.trim().endsWith(';')) {
      await executeChunk(currentChunk, chunkIndex);
      chunkIndex++;
      currentChunk = '';
    }
  }

  // Execute remaining chunk
  if (currentChunk.trim().length > 0) {
    await executeChunk(currentChunk, chunkIndex);
  }

  console.log('✅ All chunks executed successfully!');
}

async function executeChunk(chunkSql, index) {
  const tempFile = `temp_chunk_${index}.sql`;
  fs.writeFileSync(tempFile, chunkSql);
  
  console.log(`⏳ Executing Chunk ${index} (${(chunkSql.length / 1024).toFixed(2)} KB)...`);
  
  const result = spawnSync('npx', ['wrangler', 'd1', 'execute', DB_NAME, '--remote', `--file=${tempFile}`, '--yes'], {
    stdio: 'inherit',
    shell: true
  });

  if (result.status !== 0) {
    console.error(`❌ Error executing Chunk ${index}. See output above.`);
    process.exit(1);
  }

  // Clean up temp file
  fs.unlinkSync(tempFile);
}

run().catch(console.error);
