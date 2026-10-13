import { createServer } from 'vite';
import config from '../vite.config.ts';
const server = await createServer({ ...config, configFile: false, cacheDir: '.qa-results/vite-ui-cache', server: { host: '127.0.0.1', port: 5181, strictPort: true } });
await server.listen();
server.printUrls();
