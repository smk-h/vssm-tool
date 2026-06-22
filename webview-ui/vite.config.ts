import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * @file webview-ui 的 Vite 构建配置
 * @module vite.config
 * @details 关键点：
 *          1. cssCodeSplit:false + assetFileNames，把所有 CSS 合并成固定的 assets/index.css
 *          2. entryFileNames 去掉 hash，固定 assets/index.js
 *          扩展侧因此能用固定路径 asWebviewUri 引用，无需感知构建产物的 hash。
 *          不设置 rollupOptions.input —— Vite 默认以根目录 index.html 为入口，产物名为 index。
 */
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    cssCodeSplit: false,
    sourcemap: false,
    rollupOptions: {
      output: {
        entryFileNames: 'assets/[name].js',
        assetFileNames: (assetInfo) => {
          const name = assetInfo.name ?? '';
          return name.endsWith('.css') ? 'assets/index.css' : 'assets/[name][extname]';
        }
      }
    }
  }
});
