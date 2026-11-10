const fs = require('fs');
const path = require('path');

const dist = path.join(__dirname, 'dist');
if (fs.existsSync(dist)) {
  fs.rmSync(dist, { recursive: true, force: true });
}
fs.mkdirSync(dist, { recursive: true });

function copyRecursive(src, dest) {
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    fs.readdirSync(src).forEach(child => {
      copyRecursive(path.join(src, child), path.join(dest, child));
    });
  } else {
    fs.copyFileSync(src, dest);
  }
}

// Copy HTML files
fs.readdirSync(__dirname).forEach(file => {
  if (file.endsWith('.html') || file.endsWith('.js') && file !== 'build.js' && file !== 'local-server.js') {
    fs.copyFileSync(path.join(__dirname, file), path.join(dist, file));
  }
});

// Copy directories
['components', 'lib'].forEach(dir => {
  const src = path.join(__dirname, dir);
  if (fs.existsSync(src)) {
    copyRecursive(src, path.join(dist, dir));
  }
});

console.log('Build complete! Static assets prepared in ./dist');
