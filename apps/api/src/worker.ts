setInterval(() => {
  process.stdout.write(`${JSON.stringify({ level: 'info', service: 'worker', event: 'heartbeat', time: new Date().toISOString() })}\n`);
}, 30000);

