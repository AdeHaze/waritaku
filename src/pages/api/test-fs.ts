import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
export async function GET() {
  try {
    const data = fs.readdirSync(process.cwd());
    const spawnRes = spawnSync('node', ['-v']).stdout.toString();
    return new Response(JSON.stringify({ files: data.slice(0,5), node: spawnRes }));
  } catch(e: any) {
    return new Response(e.message, {status: 500});
  }
}
