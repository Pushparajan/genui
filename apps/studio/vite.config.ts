import { defineConfig } from 'vite';
export default defineConfig({ server: { port: 5174, strictPort: true, proxy: { '/api': 'http://127.0.0.1:3002', '/v1': 'http://127.0.0.1:3002' } } });
