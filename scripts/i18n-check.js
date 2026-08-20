import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const loadPack = async (packPath) => {
    try {
        const fileContent = fs.readFileSync(packPath, 'utf8');
        const match = fileContent.match(/translations:\s*({[\s\S]*})\s*};/);
        if (match) {
            const translationBlock = match[1];
            const keys = {};
            const keyRegex = /'([^']+)'\s*:/g;
            let m;
            while ((m = keyRegex.exec(translationBlock)) !== null) {
                keys[m[1]] = true;
            }
            return keys;
        }
    } catch(e) {
        console.error(`Failed to parse ${packPath}:`, e.message);
    }
    return null;
};

async function checkTranslations() {
    const enPath = path.join(__dirname, '../src/i18n/en.ts');
    const idPath = path.join(__dirname, '../src/i18n/id.ts');
    const jpPath = path.join(__dirname, '../src/i18n/jp.ts');
    
    console.log('Loading language packs...');
    const enTrans = await loadPack(enPath) || {};
    const idTrans = await loadPack(idPath) || {};
    const jpTrans = await loadPack(jpPath) || {};
    
    const enKeys = Object.keys(enTrans);
    const idKeys = Object.keys(idTrans);
    const jpKeys = Object.keys(jpTrans);
    
    const allKeys = new Set([...enKeys, ...idKeys, ...jpKeys]);
    
    let hasMissing = false;
    
    console.log('\n--- Missing Translation Keys ---');
    for (const key of allKeys) {
        if (!enKeys.includes(key)) {
            console.log(`[EN] Missing: ${key}`);
            hasMissing = true;
        }
        if (!idKeys.includes(key)) {
            console.log(`[ID] Missing: ${key}`);
            hasMissing = true;
        }
        if (!jpKeys.includes(key)) {
            console.log(`[JP] Missing: ${key}`);
            hasMissing = true;
        }
    }
    
    if (!hasMissing) {
        console.log('✅ All translation files are perfectly synced!');
    }
}

checkTranslations();
