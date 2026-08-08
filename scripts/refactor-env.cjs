const fs = require('fs');
const path = require('path');

function walk(dir, callback) {
  const files = fs.readdirSync(dir);
  for (const f of files) {
    const p = path.join(dir, f);
    if (fs.statSync(p).isDirectory()) {
      if (!p.includes('node_modules') && !p.includes('.astro')) walk(p, callback);
    } else {
      if (p.endsWith('.ts') || p.endsWith('.astro')) callback(p);
    }
  }
}

walk(path.join(__dirname, '../src'), (file) => {
  let content = fs.readFileSync(file, 'utf8');
  if (content.includes('cloudflare:workers')) {
    if (file.endsWith('.astro')) {
      content = content.replace(/import\s*\{\s*env\s*\}\s*from\s*['"]cloudflare:workers['"];?/, 'const env = Astro.locals?.runtime?.env;');
    } else if (file.endsWith('middleware.ts')) {
      content = content.replace(/import\s*\{\s*env\s*\}\s*from\s*['"]cloudflare:workers['"];?/, '');
      content = content.replace('const url = new URL(context.request.url);', 'const url = new URL(context.request.url);\n    const env = (context.locals as any).runtime?.env;');
    } else if (file.endsWith('sitemap.xml.ts')) {
      content = content.replace(/import\s*\{\s*env\s*\}\s*from\s*['"]cloudflare:workers['"];?/, '');
      content = content.replace('export const GET: APIRoute = async (context) => {', 'export const GET: APIRoute = async (context) => {\n    const env = (context.locals as any).runtime?.env;');
    }
    fs.writeFileSync(file, content);
    console.log('Fixed:', file);
  }
});
