/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

// 打包成单个 index.html，可直接用浏览器打开、发给家人或部署到任意静态托管。
export default defineConfig({
  base: './',
  plugins: [react(), viteSingleFile()],
  test: { environment: 'node' },
});
