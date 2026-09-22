import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Marketing site for campoutapp.com, deployed separately from the app.
export default defineConfig({
  root: 'landing',
  plugins: [react(), tailwindcss()],
  build: {
    outDir: '../dist-landing',
    emptyOutDir: true,
  },
})
