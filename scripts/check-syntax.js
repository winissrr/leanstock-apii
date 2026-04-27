const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (entry.isFile() && full.endsWith('.js')) out.push(full);
  }
  return out;
}

const files = walk(path.join(__dirname, '..', 'src'))
  .concat(walk(path.join(__dirname, '..', 'tests')));

for (const file of files) {
  execFileSync(process.execPath, ['--check', file], { stdio: 'inherit' });
}

console.log(`Syntax OK for ${files.length} JavaScript files`);
