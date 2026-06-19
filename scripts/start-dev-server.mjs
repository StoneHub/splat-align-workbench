#!/usr/bin/env node
import { spawn } from 'node:child_process';
import http from 'node:http';
import net from 'node:net';

const host = process.env.HOST || '127.0.0.1';
const preferredPort = Number(process.env.PORT || process.argv.find(arg => arg.startsWith('--port='))?.split('=')[1] || 5175);
const maxPort = preferredPort + 20;

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

const canConnect = port => new Promise(resolve => {
  const socket = net.createConnection({ host, port });
  socket.setTimeout(300);
  socket.once('connect', () => {
    socket.destroy();
    resolve(true);
  });
  socket.once('timeout', () => {
    socket.destroy();
    resolve(false);
  });
  socket.once('error', () => resolve(false));
});

const head = port => new Promise(resolve => {
  const request = http.request({ host, port, method: 'HEAD', path: '/', timeout: 800 }, response => {
    response.resume();
    resolve({ ok: response.statusCode >= 200 && response.statusCode < 500, statusCode: response.statusCode });
  });
  request.once('timeout', () => {
    request.destroy();
    resolve({ ok: false, statusCode: 0 });
  });
  request.once('error', () => resolve({ ok: false, statusCode: 0 }));
  request.end();
});

const findPort = async () => {
  for (let port = preferredPort; port <= maxPort; port += 1) {
    const connected = await canConnect(port);
    if (!connected) return { port, existing: false };

    const response = await head(port);
    if (response.ok) return { port, existing: true, statusCode: response.statusCode };

    console.error(`Port ${port} accepts TCP but failed HTTP verification; skipping it.`);
  }
  throw new Error(`No usable port found from ${preferredPort} to ${maxPort}.`);
};

const waitForHttp = async port => {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 10000) {
    const response = await head(port);
    if (response.ok) return response;
    await wait(150);
  }
  throw new Error(`Vite did not pass HTTP verification on http://${host}:${port}/ within 10s.`);
};

const main = async () => {
  const selected = await findPort();
  const url = `http://${host}:${selected.port}/`;

  if (selected.existing) {
    console.log(`Existing dev server verified: ${url} (${selected.statusCode})`);
    return;
  }

  console.log(`Starting Splat Align Workbench at ${url}`);
  const child = spawn('npm', ['run', 'dev', '--', '--host', host, '--port', String(selected.port)], {
    cwd: process.cwd(),
    env: process.env,
    stdio: ['inherit', 'pipe', 'pipe']
  });

  child.stdout.on('data', chunk => process.stdout.write(chunk));
  child.stderr.on('data', chunk => process.stderr.write(chunk));

  child.once('exit', code => {
    if (code !== 0) {
      console.error(`Dev server exited with code ${code ?? 'unknown'}.`);
      process.exitCode = code ?? 1;
    }
  });

  const stop = () => {
    child.kill('SIGINT');
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);

  const response = await waitForHttp(selected.port);
  console.log(`Verified dev server: ${url} (${response.statusCode})`);
};

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
