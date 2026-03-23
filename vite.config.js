import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // Change 'invoice-reconciler' to match your GitHub repo name
  base: '/invoice-reconciler/',
})
