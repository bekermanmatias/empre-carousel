import { chromium } from 'playwright'
import { createServer } from 'node:http'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createServer as createViteServer } from 'vite'
import type { Carousel } from '../schemas/carousel'

export type RenderWarning = { field:string; type:'overflow' }
export type AutoFitReport = { field:string; autoFitApplied:true; originalFontSize:number; finalFontSize:number; overflow:false }
export type SlideReport = { template:string; position?:number; valid:boolean; warnings:RenderWarning[]; autoFits:AutoFitReport[]; dimensions:{width:number;height:number}; file:string }
export type RenderReport = { version:'1'; valid:boolean; slides:SlideReport[] }

export async function renderCarousel(carousel: Carousel, outputDirectory: string, fileName: (index:number, position?:number, template?:string) => string): Promise<RenderReport> {
  await mkdir(outputDirectory, {recursive:true})
  const vite = await createViteServer({server:{middlewareMode:true},appType:'spa'})
  const server = createServer((req,res) => vite.middlewares(req,res,() => {res.statusCode=404;res.end('Not found')}))
  await new Promise<void>(ok => server.listen(0,'127.0.0.1',ok))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('No se pudo iniciar el servidor de render')
  const browser = await chromium.launch({headless:true})
  const slides: SlideReport[]=[]
  try {
    for (const [index, slide] of carousel.slides.entries()) {
      const page=await browser.newPage({viewport:{width:1080,height:1350},deviceScaleFactor:1})
      await page.goto(`http://127.0.0.1:${address.port}/?slide=${encodeURIComponent(JSON.stringify(slide))}`,{waitUntil:'networkidle'})
      await page.evaluate(async()=>{await document.fonts.ready})
      const measured=await page.evaluate(() => { const root=document.querySelector('.slide')!; const rect=root.getBoundingClientRect(); const warnings=[...document.querySelectorAll<HTMLElement>('.has-overflow')].map(node=>({field:node.dataset.overflowField ?? 'unknown',type:'overflow' as const})); const autoFits=[...document.querySelectorAll<HTMLElement>('[data-auto-fit-applied="true"]')].filter(node=>node.dataset.overflowStatus==='fitted').map(node=>({field:node.dataset.overflowField ?? 'unknown',autoFitApplied:true as const,originalFontSize:Number(node.dataset.originalFontSize),finalFontSize:Number(node.dataset.finalFontSize),overflow:false as const})); return {warnings,autoFits,dimensions:{width:Math.round(rect.width),height:Math.round(rect.height)}} })
      const file=fileName(index,slide.position,slide.template)
      await page.screenshot({path:resolve(outputDirectory,file),clip:{x:0,y:0,width:1080,height:1350}})
      slides.push({template:slide.template,position:slide.position,valid:measured.warnings.length===0 && measured.dimensions.width===1080 && measured.dimensions.height===1350,warnings:measured.warnings,autoFits:measured.autoFits,dimensions:measured.dimensions,file})
      await page.close()
    }
  } finally {
    await browser.close()
    await new Promise<void>(ok=>server.close(()=>ok()))
    await vite.close()
  }
  const report: RenderReport={version:carousel.version,valid:slides.every(slide=>slide.valid),slides}
  await writeFile(resolve(outputDirectory,'render-report.json'),JSON.stringify(report,null,2)+'\n')
  return report
}
