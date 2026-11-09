import { defineConfig } from 'vite'

// GitHub Pages 的子路径（如 /CET-4/）由工作流通过 BASE_PATH 传入，本地默认 /
export default defineConfig({
  base: process.env.BASE_PATH || '/',
  build: { target: 'es2022' },
})
