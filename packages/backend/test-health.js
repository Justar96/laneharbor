import { createServer } from 'node:http';

// Create simple HTTP server
const server = createServer((req, res) => {
  console.log(`Request received: ${req.method} ${req.url}`);
  
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('OK');
  } else {
    res.writeHead(404);
    res.end('Not Found');
  }
});

const port = 8787;
server.listen(port, '0.0.0.0', () => {
  console.log(`Test server running at http://0.0.0.0:${port}/`);
  console.log(`Health check endpoint: http://localhost:${port}/health`);
});