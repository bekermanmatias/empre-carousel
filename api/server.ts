import Fastify from 'fastify'
import { randomUUID } from 'node:crypto'
import { access, mkdir, readFile, writeFile } from 'node:fs/promises'
import { constants } from 'node:fs'
import { resolve, relative, extname } from 'node:path'
import { chromium } from 'playwright'
import { carouselSchema } from '../src/schemas/carousel'
import { carouselJsonSchema } from '../src/schemas/jsonSchema'
import { renderCarousel, type RenderWarning } from '../src/renderer/renderCarousel'

const app=Fastify({logger:true,trustProxy:true})
const jobsRoot=resolve('output','jobs')
const jobIdPattern=/^[0-9a-f-]{36}$/i
const imageNamePattern=/^\d{2}\.png$/
const instagramImageNamePattern=/^\d{2}\.jpg$/
const errors=(issues: {path:PropertyKey[];message:string;code:string}[]) => issues.map(issue=>({path:issue.path.join('.'),message:issue.message,code:issue.code}))
const jobDirectory=(jobId:string) => resolve(jobsRoot,jobId)
const insideJobs=(target:string) => { const path=relative(jobsRoot,target); return path !== '' && !path.startsWith('..') && !path.includes(':') }
const instagramDirectory=(jobId:string) => resolve(jobDirectory(jobId),'instagram')
const publicBaseUrl=(request:{protocol:string;headers:{host?:string}}) => {
  const configured=process.env.PUBLIC_BASE_URL?.trim().replace(/\/+$/,'')
  if (configured) return configured
  return `${request.protocol}://${request.headers.host ?? 'localhost'}`
}

async function exportPngAsJpeg(browser:Awaited<ReturnType<typeof chromium.launch>>,source:string,target:string) {
  const image=await readFile(source)
  const page=await browser.newPage({viewport:{width:1080,height:1350},deviceScaleFactor:1})
  await page.setContent(`<img src="data:image/png;base64,${image.toString('base64')}">`)
  await page.locator('img').waitFor({state:'visible'})
  await page.evaluate(async()=>{const image=document.querySelector('img')!; if (!image.complete) await new Promise<void>(resolve=>image.addEventListener('load',()=>resolve(),{once:true}))})
  await page.addStyleTag({content:'html,body{margin:0;background:#fff;overflow:hidden}img{display:block;width:1080px;height:1350px}'})
  await page.screenshot({path:target,type:'jpeg',quality:95,clip:{x:0,y:0,width:1080,height:1350}})
  await page.close()
}

app.get('/health',async()=>({status:'ok'}))
app.get('/schema',async()=>carouselJsonSchema)

app.post('/validate',async(request,reply)=>{
  const parsed=carouselSchema.safeParse(request.body)
  if (!parsed.success) return reply.code(400).send({valid:false,errors:errors(parsed.error.issues)})
  return {valid:true,errors:[]}
})

app.post('/render',async(request,reply)=>{
  const parsed=carouselSchema.safeParse(request.body)
  if (!parsed.success) return reply.code(400).send({success:false,valid:false,errors:errors(parsed.error.issues),warnings:[]})
  const jobId=randomUUID()
  const directory=jobDirectory(jobId)
  await mkdir(directory,{recursive:true})
  await writeFile(resolve(directory,'input.json'),JSON.stringify(parsed.data,null,2)+'\n')
  try {
    const report=await renderCarousel(parsed.data,directory,(index,position)=>`${String(position ?? index + 1).padStart(2,'0')}.png`)
    const warnings: (RenderWarning & {position?:number})[]=report.slides.flatMap(slide=>slide.warnings.map(warning=>({...warning,position:slide.position})))
    return {success:report.valid,jobId,valid:report.valid,slideCount:report.slides.length,files:report.slides.map(slide=>({position:slide.position,filename:slide.file})),warnings}
  } catch (error) {
    request.log.error(error,'render job failed')
    return reply.code(500).send({success:false,jobId,valid:false,slideCount:parsed.data.slides.length,files:[],warnings:[],error:'No se pudo completar el render'})
  }
})

app.get('/jobs/:jobId',async(request,reply)=>{
  const {jobId}=request.params as {jobId:string}
  if (!jobIdPattern.test(jobId)) return reply.code(400).send({error:'jobId inválido'})
  const directory=jobDirectory(jobId)
  const reportPath=resolve(directory,'render-report.json')
  if (!insideJobs(directory)) return reply.code(400).send({error:'Ruta inválida'})
  try { await access(reportPath,constants.R_OK); const report=JSON.parse(await readFile(reportPath,'utf8')); const input=JSON.parse(await readFile(resolve(directory,'input.json'),'utf8')); return {jobId,slideCount:input.slides.length,report} } catch { return reply.code(404).send({error:'Job no encontrado o todavía incompleto'}) }
})

app.get('/jobs/:jobId/files/:filename',async(request,reply)=>{
  const {jobId,filename}=request.params as {jobId:string;filename:string}
  if (!jobIdPattern.test(jobId) || !imageNamePattern.test(filename)) return reply.code(400).send({error:'Ruta de archivo inválida'})
  const target=resolve(jobDirectory(jobId),filename)
  if (!insideJobs(target) || extname(target)!=='.png') return reply.code(400).send({error:'Ruta de archivo inválida'})
  try { const image=await readFile(target); return reply.type('image/png').send(image) } catch { return reply.code(404).send({error:'Archivo no encontrado'}) }
})

app.post('/jobs/:jobId/export-instagram-assets',async(request,reply)=>{
  const {jobId}=request.params as {jobId:string}
  if (!jobIdPattern.test(jobId)) return reply.code(400).send({success:false,error:'jobId inválido'})
  const directory=jobDirectory(jobId)
  const reportPath=resolve(directory,'render-report.json')
  if (!insideJobs(directory)) return reply.code(400).send({success:false,error:'Ruta inválida'})
  try {
    const report=JSON.parse(await readFile(reportPath,'utf8')) as {slides:{position?:number;file:string}[]}
    if (!Array.isArray(report.slides) || report.slides.length===0) throw new Error('render report inválido')
    const exportDirectory=instagramDirectory(jobId)
    await mkdir(exportDirectory,{recursive:true})
    const files=[]
    const browser=await chromium.launch({headless:true})
    try {
      for (const [index,slide] of report.slides.entries()) {
        if (!imageNamePattern.test(slide.file)) throw new Error('nombre de render inválido')
        const source=resolve(directory,slide.file)
        const filename=`${String(slide.position ?? index+1).padStart(2,'0')}.jpg`
        const target=resolve(exportDirectory,filename)
        if (!insideJobs(source) || !insideJobs(target)) throw new Error('ruta de exportación inválida')
        await exportPngAsJpeg(browser,source,target)
        files.push({position:slide.position ?? index+1,filename,url:`${publicBaseUrl(request)}/public/jobs/${jobId}/instagram/${filename}`})
      }
    } finally { await browser.close() }
    return {success:true,jobId,files}
  } catch (error) {
    request.log.error(error,'instagram asset export failed')
    return reply.code(404).send({success:false,jobId,error:'Job no encontrado, incompleto o no exportable'})
  }
})

app.get('/public/jobs/:jobId/instagram/:filename',async(request,reply)=>{
  const {jobId,filename}=request.params as {jobId:string;filename:string}
  if (!jobIdPattern.test(jobId) || !instagramImageNamePattern.test(filename)) return reply.code(400).send({error:'Ruta de archivo inválida'})
  const target=resolve(instagramDirectory(jobId),filename)
  if (!insideJobs(target) || extname(target)!=='.jpg') return reply.code(400).send({error:'Ruta de archivo inválida'})
  try { const image=await readFile(target); return reply.type('image/jpeg').send(image) } catch { return reply.code(404).send({error:'Archivo no encontrado'}) }
})

await mkdir(jobsRoot,{recursive:true})
await app.listen({port:Number(process.env.PORT ?? 3001),host:'0.0.0.0'})
