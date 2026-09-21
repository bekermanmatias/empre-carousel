import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
export default defineConfig({ plugins: [react(), { name:'reference-preview-only', configureServer(server) { server.middlewares.use('/references', async (req,res,next) => { try { const name=(req.url ?? '').replace(/^\//,''); if (!/^empre_template_[0-9_]+\.png\.png$/.test(name)) return next(); const image=await readFile(resolve('references',name)); res.setHeader('Content-Type','image/png'); res.end(image) } catch { next() } }) } }] })
