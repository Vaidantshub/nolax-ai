
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORTS = [3000, 5173, 8080, 80];

function requestHandler(req, res) {
  let reqPath = req.url.split('?')[0];
  if (reqPath === '/') reqPath = '/index.html';
  if (!path.extname(reqPath)) {
    if (fs.existsSync(path.join(__dirname, reqPath + '.html'))) {
      reqPath = reqPath + '.html';
    }
  }

  const filePath = path.join(__dirname, reqPath);
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('404 Not Found');
      return;
    }
    const ext = path.extname(filePath);
    let contentType = 'text/html';
    if (ext === '.js') contentType = 'text/javascript';
    if (ext === '.css') contentType = 'text/css';
    if (ext === '.json') contentType = 'application/json';
    if (ext === '.svg') contentType = 'image/svg+xml';
    if (ext === '.png') contentType = 'image/png';
    if (ext === '.jpg' || ext === '.jpeg') contentType = 'image/jpeg';
    if (ext === '.mjs') contentType = 'text/javascript';

    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  });
}

PORTS.forEach(port => {
  const s = http.createServer(requestHandler);
  s.on('error', (err) => {
    // Port might be in use or privileged (e.g. port 80)
  });
  s.listen(port, () => {
    console.log(`Server listening at: http://localhost:${port}`);
  });
});

