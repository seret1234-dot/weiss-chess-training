import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const stockfishHeaders = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
}

export default defineConfig({
  plugins: [react()],
  server: {
    headers: stockfishHeaders,
  },
  preview: {
    headers: stockfishHeaders,
  },
})