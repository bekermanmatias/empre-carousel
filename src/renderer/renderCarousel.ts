import { chromium } from 'playwright'
import { createServer } from 'node:http'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createServer as createViteServer } from 'vite'
import type { Carousel } from '../schemas/carousel'
import { fitForTemplate, type TemplateName } from './imageMetrics'
import type { PreparedImage } from '../images/prepareImage'

export type RenderWarning = { field:string; type:'overflow'|'image_load_error'; url?:string; error?:string }
export type AutoFitReport = { field:string; autoFitApplied:true; originalFontSize:number; finalFontSize:number; overflow:false }
export type TextMetricReport = {field:string;lineCount:number;scrollHeight:number;clientHeight:number;overflow:boolean;fontSizeUsed:number;autoFitApplied:boolean;maxLines?:number}
export type ImageMetricReport = {sourceUrl?:string;preparedUrl?:string;loaded:boolean;width?:number;height?:number;aspectRatio?:number;mime?:string;fileSize?:number;templateFit?:number;error?:string}
export type SlideReport = { template:string; position?:number; valid:boolean; warnings:RenderWarning[]; autoFits:AutoFitReport[]; textMetrics:TextMetricReport[]; imageMetrics?:ImageMetricReport; dimensions:{width:number;height:number}; file:string }
export type RenderReport = { version:'1'; valid:boolean; slides:SlideReport[] }

export async function renderCarousel(carousel: Carousel, outputDirectory: string, fileName: (index:number, position?:number, template?:string) => string, preparedImages: Array<PreparedImage|undefined>=[]): Promise<RenderReport> {
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
      let imagesReady=true
      try { await page.waitForFunction(() => [...document.images].every(image => image.complete && image.naturalWidth>0 && image.naturalHeight>0),undefined,{timeout:15_000}) } catch { imagesReady=false }
      const measured=await page.evaluate(() => { const root=document.querySelector('.slide')!; const rect=root.getBoundingClientRect(); const warnings=[...document.querySelectorAll<HTMLElement>('.has-overflow')].map(node=>({field:node.dataset.overflowField ?? 'unknown',type:'overflow' as const})); const images=[...document.querySelectorAll<HTMLImageElement>('.image-slot img')]; const imageErrors=images.filter(image=>!image.complete || image.naturalWidth===0 || image.naturalHeight===0).map(image=>({field:'image',type:'image_load_error' as const,url:image.currentSrc || image.src,error:image.complete ? 'image_load_error' : 'image_load_timeout'})); const textMetrics=[...document.querySelectorAll<HTMLElement>('[data-text-field]')].map(node=>({field:node.dataset.textField ?? 'unknown',lineCount:Number(node.dataset.lineCount),scrollHeight:Number(node.dataset.scrollHeight),clientHeight:Number(node.dataset.clientHeight),overflow:node.dataset.overflow==='true',fontSizeUsed:Number(node.dataset.fontSizeUsed),autoFitApplied:node.dataset.autoFitApplied==='true',maxLines:node.dataset.maxLines ? Number(node.dataset.maxLines) : undefined})); const image=images[0]; const imageMetrics=image?.naturalWidth && image.naturalHeight ? {width:image.naturalWidth,height:image.naturalHeight,aspectRatio:Number((image.naturalWidth/image.naturalHeight).toFixed(4))} : undefined; return {warnings:[...warnings,...imageErrors],textMetrics,imageMetrics,dimensions:{width:Math.round(rect.width),height:Math.round(rect.height)}} })
      const autoFits=(await page.locator('[data-text-field]').evaluateAll(nodes => nodes.filter(node => (node as HTMLElement).dataset.autoFitApplied==='true' && (node as HTMLElement).dataset.overflow==='false').map(node => { const element=node as HTMLElement; return {field:element.dataset.textField ?? 'unknown',originalFontSize:Number(element.dataset.originalFontSize),finalFontSize:Number(element.dataset.fontSizeUsed)} }))).map(metric=>({field:metric.field,autoFitApplied:true as const,originalFontSize:metric.originalFontSize,finalFontSize:metric.finalFontSize,overflow:false as const}))
      const prepared=preparedImages[index]
      const imageMetrics=measured.imageMetrics ? {sourceUrl:prepared?.sourceUrl,preparedUrl:prepared?.url,loaded:imagesReady,...measured.imageMetrics,mime:prepared?.mime,fileSize:prepared?.fileSize,templateFit:fitForTemplate(measured.imageMetrics.aspectRatio,slide.template as TemplateName)} : slide.image ? {sourceUrl:prepared?.sourceUrl ?? slide.image.url,preparedUrl:prepared?.url,loaded:false,error:measured.warnings.find(warning=>warning.type==='image_load_error')?.error ?? 'image_load_error'} : undefined
      const file=fileName(index,slide.position,slide.template)
      if (imagesReady && !measured.warnings.some(warning=>warning.type==='image_load_error')) await page.screenshot({path:resolve(outputDirectory,file),clip:{x:0,y:0,width:1080,height:1350}})
      slides.push({template:slide.template,position:slide.position,valid:measured.warnings.length===0 && measured.dimensions.width===1080 && measured.dimensions.height===1350,warnings:measured.warnings,autoFits,textMetrics:measured.textMetrics,imageMetrics,dimensions:measured.dimensions,file})
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
