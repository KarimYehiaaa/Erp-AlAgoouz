import fs from 'fs';
import path from 'path';

const appDataDir = 'C:/Users/Karim Yehia/.gemini/antigravity';
const brainsDir = path.join(appDataDir, 'brain');

async function run() {
    try {
        if (!fs.existsSync(brainsDir)) {
            console.log("Brains directory not found!");
            return;
        }
        
        const conversations = fs.readdirSync(brainsDir);
        console.log(`Found ${conversations.length} conversations.`);

        for (const cid of conversations) {
            const transcriptPath = path.join(brainsDir, cid, '.system_generated/logs/transcript.jsonl');
            if (fs.existsSync(transcriptPath)) {
                console.log(`\n=== Searching transcript for: ${cid} ===`);
                const content = fs.readFileSync(transcriptPath, 'utf8');
                const lines = content.split('\n');
                
                lines.forEach((line, idx) => {
                    if (line.includes('STYLE_PRESETS') || line.includes('اللوجو') || line.includes('شفاف') || line.includes('سيدج') || line.includes('Sage Flow')) {
                        console.log(`  Line ${idx+1}: ${line.substring(0, 300)}`);
                    }
                });
            }
        }
    } catch (e) {
        console.error(e);
    }
}

run();
