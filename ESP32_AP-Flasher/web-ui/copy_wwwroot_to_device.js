const fs = require('fs');
const path = require('path');

const src = path.join(__dirname, '..', 'wwwroot');
const dest = path.join(__dirname, 'public', 'device');

function copyRecursive(srcDir, destDir) {
    if (!fs.existsSync(srcDir)) return;
    if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });

    const entries = fs.readdirSync(srcDir, { withFileTypes: true });
    for (const entry of entries) {
        const srcPath = path.join(srcDir, entry.name);
        const destPath = path.join(destDir, entry.name);
        if (entry.isDirectory()) {
            copyRecursive(srcPath, destPath);
        } else if (entry.isFile()) {
            fs.copyFileSync(srcPath, destPath);
        }
    }
}

try {
    copyRecursive(src, dest);
    console.log(`Copied files from ${src} to ${dest}`);
} catch (err) {
    console.error('Copy failed:', err);
    process.exit(1);
}
