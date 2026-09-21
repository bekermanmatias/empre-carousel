import Fastify from 'fastify'
import { randomUUID } from 'node:crypto'
import { access, mkdir, readFile, writeFile } from 'node:fs/promises'
import { constants } from 'node:fs'
import { resolve, relative, extname } from 'node:path'
import { chromium } from 'playwright'
import { z } from 'zod'
import { carouselSchema } from '../src/schemas/carousel'
import { carouselJsonSchema } from '../src/schemas/jsonSchema'
import { renderCarousel, type RenderWarning } from '../src/renderer/renderCarousel'
import { inspectImageUrl } from '../src/images/inspectImage'
import { fitForTemplate, orientationFor, recommendedObjectPosition, type TemplateName } from '../src/renderer/imageMetrics'
import { ImagePreparationError, prepareImage, preparedImagePath, type PreparedImage } from '../src/images/prepareImage'

const app=Fastify({logger:true,trustProxy:true})
const jobsRoot=resolve('output','jobs')
const jobIdPattern=/^[0-9a-f-]{36}$/i
const imageNamePattern=/^\d{2}\.png$/
const instagramImageNamePattern=/^\d{2}\.jpg$/
const imageInspectionSchema=z.object({url:z.string().url()}).strict()
const imageScoreSchema=imageInspectionSchema.extend({template:z.enum(['T01','T02','T03','T04','T06','T07','T08','T09'])}).strict()
const prepareImageSchema=imageScoreSchema.extend({objectPosition:z.string().optional()}).strict()
const errors=(issues: {path:PropertyKey[];message:string;code:string}[]) => issues.map(issue=>({path:issue.path.join('.'),message:issue.message,code:issue.code}))
const jobDirectory=(jobId:string) => resolve(jobsRoot,jobId)
const insideJobs=(target:string) => { const path=relative(jobsRoot,target); return path !== '' && !path.startsWith('..') && !path.includes(':') }
const instagramDirectory=(jobId:string) => resolve(jobDirectory(jobId),'instagram')
const publicBaseUrl=(request:{protocol:string;headers:{host?:string}}) => {
  const configured=process.env.PUBLIC_BASE_URL?.trim().replace(/\/+$/,'')
  if (configured) return configured
  return `${request.protocol}://${request.headers.host ?? 'localhost'}`
}
const imageErrorCode=(error:unknown) => error instanceof ImagePreparationError ? error.code : 'IMAGE_PREPARATION_FAILED'

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

app.post('/inspect-image',async(request,reply)=>{
  const parsed=imageInspectionSchema.safeParse(request.body)
  if (!parsed.success) return reply.code(400).send({valid:false,errors:errors(parsed.error.issues)})
  try { return await inspectImageUrl(parsed.data.url) } catch (error) { request.log.warn(error,'image inspection failed'); return reply.code(400).send({valid:false,error:error instanceof Error ? error.message : 'No se pudo inspeccionar la imagen'}) }
})

app.post('/score-image',async(request,reply)=>{
  const parsed=imageScoreSchema.safeParse(request.body)
  if (!parsed.success) return reply.code(400).send({valid:false,errors:errors(parsed.error.issues)})
  try {
    const image=await inspectImageUrl(parsed.data.url)
    return {...image,orientation:orientationFor(image.aspectRatio),templateFit:fitForTemplate(image.aspectRatio,parsed.data.template as TemplateName),recommendedObjectPosition:recommendedObjectPosition(image.aspectRatio,parsed.data.template as TemplateName)}
  } catch (error) { request.log.warn(error,'image score failed'); return reply.code(400).send({valid:false,error:error instanceof Error ? error.message : 'No se pudo inspeccionar la imagen'}) }
})

app.post('/prepare-image',async(request,reply)=>{
  const parsed=prepareImageSchema.safeParse(request.body)
  if (!parsed.success) return reply.code(400).send({valid:false,errors:errors(parsed.error.issues)})
  try { return await prepareImage(parsed.data.url,parsed.data.template,parsed.data.objectPosition,publicBaseUrl(request)) }
  catch (error) { request.log.warn(error,'image preparation failed'); return reply.code(400).send({valid:false,sourceUrl:parsed.data.url,error:imageErrorCode(error)}) }
})

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
    const prepared: Array<PreparedImage|undefined>=[]
    for (const slide of parsed.data.slides) {
      if (!slide.image) { prepared.push(undefined); continue }
      try { prepared.push(await prepareImage(slide.image.url,slide.template as TemplateName,slide.image.objectPosition,publicBaseUrl(request))) }
      catch (error) {
        const warning={field:'image',type:'image_load_error' as const,position:slide.position,url:slide.image.url,error:imageErrorCode(error)}
        await writeFile(resolve(directory,'render-report.json'),JSON.stringify({version:parsed.data.version,valid:false,slides:parsed.data.slides.map(candidate=>({template:candidate.template,position:candidate.position,valid:false,warnings:candidate===slide?[warning]:[],autoFits:[],textMetrics:[],imageMetrics:candidate===slide?{sourceUrl:slide.image!.url,loaded:false,error:warning.error}:undefined,dimensions:{width:1080,height:1350},file:`${String(candidate.position ?? 0).padStart(2,'0')}.png`}))},null,2)+'\n')
        return {success:false,jobId,valid:false,slideCount:parsed.data.slides.length,files:[],warnings:[warning]}
      }
    }
    const renderInput={...parsed.data,slides:parsed.data.slides.map((slide,index)=>slide.image && prepared[index] ? {...slide,image:{...slide.image,url:prepared[index].url,objectPosition:slide.image.objectPosition ?? prepared[index].recommendedObjectPosition}} : slide)}
    const report=await renderCarousel(renderInput,directory,(index,position)=>`${String(position ?? index + 1).padStart(2,'0')}.png`,prepared)
    const warnings: (RenderWarning & {position?:number})[]=report.slides.flatMap(slide=>slide.warnings.map(warning=>({...warning,position:slide.position})))
    return {success:report.valid,jobId,valid:report.valid,slideCount:report.slides.length,files:report.slides.map(slide=>({position:slide.position,filename:slide.file})),warnings}
  } catch (error) {
    request.log.error(error,'render job failed')
    return reply.code(500).send({success:false,jobId,valid:false,slideCount:parsed.data.slides.length,files:[],warnings:[],error:'No se pudo completar el render'})
  }
})

app.get('/public/prepared/:filename',async(request,reply)=>{
  const {filename}=request.params as {filename:string}
  if (!/^[a-f0-9]{64}\.jpg$/i.test(filename)) return reply.code(400).send({error:'Ruta de archivo inválida'})
  try { return reply.type('image/jpeg').send(await readFile(preparedImagePath(filename))) } catch { return reply.code(404).send({error:'Archivo no encontrado'}) }
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
