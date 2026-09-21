import { contentFixtures } from '../src/qa/contentFixtures'
import { slideSchema } from '../src/schemas/templates'
import { chromium } from 'playwright'
import { createServer } from 'node:http'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createServer as createViteServer } from 'vite'

const invalid = contentFixtures.filter(fixture => !slideSchema.safeParse(fixture.slide).success)
if (invalid.length) throw new Error(`Fixtures inválidos: ${invalid.map(f=>`${f.template}/${f.kind}`).join(', ')}`)
const vite = await createViteServer({server:{middlewareMode:true},appType:'spa'})
const server = createServer((req,res) => vite.middlewares(req,res,() => {res.statusCode=404;res.end('Not found')}))
await new Promise<void>(ok=>server.listen(4174,'127.0.0.1',ok))
const browser = await chromium.launch({headless:true})
const results: {template:string;kind:string;expectedOverflow:boolean;warnings:string[]}[]=[]
try { for (const fixture of contentFixtures) { const page=await browser.newPage({viewport:{width:1080,height:1350}}); await page.goto(`http://127.0.0.1:4174/?slide=${encodeURIComponent(JSON.stringify(fixture.slide))}`,{waitUntil:'networkidle'}); await page.evaluate(async()=>{await document.fonts.ready}); const warnings=await page.locator('.has-overflow').evaluateAll(nodes=>nodes.map(node=>(node as HTMLElement).dataset.overflowField ?? 'unknown')); results.push({template:fixture.template,kind:fixture.kind,expectedOverflow:fixture.expectsOverflow,warnings}); await page.close() } } finally { await browser.close(); await new Promise<void>(ok=>server.close(()=>ok())); await vite.close() }
await mkdir(resolve('output'),{recursive:true}); await writeFile(resolve('output','content-fixtures-report.json'),JSON.stringify(results,null,2)+'\n')
const mismatches=results.filter(result=>(result.warnings.length>0)!==result.expectedOverflow)
if (mismatches.length) throw new Error(`Resultado de overflow inesperado: ${mismatches.map(r=>`${r.template}/${r.kind}`).join(', ')}`)
console.log(`Fixtures verificados en navegador: ${results.length}; los 8 casos overflow emitieron warning y los demás conservaron sus cajas.`)
