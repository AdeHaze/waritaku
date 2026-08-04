import fs from 'fs';

// Read tags.json
const rawData = fs.readFileSync('tags.json', 'utf8');

// The output from wrangler has some header/footer text, so we need to extract the JSON array.
const startIdx = rawData.indexOf('[');
const endIdx = rawData.lastIndexOf(']');

if (startIdx === -1 || endIdx === -1) {
    console.error("Could not find JSON array in tags.json");
    process.exit(1);
}

const jsonStr = rawData.substring(startIdx, endIdx + 1);
let tags = [];
try {
    const parsed = JSON.parse(jsonStr);
    if (parsed[0] && parsed[0].results) {
        tags = parsed[0].results;
    } else {
        tags = parsed;
    }
} catch (e) {
    console.error("Failed to parse JSON");
    process.exit(1);
}

let sql = '';
let changedCount = 0;

for (const tag of tags) {
    const originalName = tag.name;
    const normalizedName = originalName.normalize('NFKC');
    
    // If the name changed after normalization
    if (originalName !== normalizedName) {
        // Calculate new slug
        const newSlug = normalizedName.toLowerCase()
            .normalize('NFD').replace(/[\u0300-\u036f]/g, "") // remove accents
            .replace(/[^a-z0-9\s-]/g, '') // remove invalid chars
            .replace(/\s+/g, '-'); // replace spaces with dashes
            
        sql += `UPDATE tags SET name = '${normalizedName.replace(/'/g, "''")}', slug = '${newSlug.replace(/'/g, "''")}' WHERE id = ${tag.id};\n`;
        changedCount++;
        console.log(`Changed: ${originalName} -> ${normalizedName} (${newSlug})`);
    }
}

if (changedCount > 0) {
    fs.writeFileSync('cleanup.sql', sql);
    console.log(`Successfully generated cleanup.sql with ${changedCount} updates.`);
} else {
    console.log("No alien tags found!");
}
