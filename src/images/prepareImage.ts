import { createHash } from 'node:crypto'
import { mkdir, stat, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { lookup } from 'node:dns/promises'
import sharp, { type Metadata } from 'sharp'
import { fitForTemplate, recommendedObjectPosition, type TemplateName } from '../renderer/imageMetrics'

const maxBytes=15*1024*1024
const cacheRoot=resolve('output','prepared')
const timeoutMs=15_000

export type PreparedImage = {
  valid:true; sourceUrl:string; url:string; filename:string; width:number; height:number;
  aspectRatio:number; mime:'image/jpeg'; fileSize:number; templateFit:number; recommendedObjectPosition:string
}

const privateIpv4=(address:string) => {
  const octets=address.split('.').map(Number)
  if (octets.length!==4 || octets.some(value=>!Number.isInteger(value) || value<0 || value>255)) return true
  const [a,b]=octets
  return a===0 || a===10 || a===127 || a>=224 || (a===100 && b>=64 && b<=127) || (a===169 && b===254) || (a===172 && b>=16 && b<=31) || (a===192 && b===168) || (a===198 && (b===18 || b===19))
}
const privateIpv6=(address:string) => {
  const normalized=address.toLowerCase()
  return normalized === '::1' || normalized.startsWith('::ffff:') && privateIpv4(normalized.slice(7)) || normalized.startsWith('fc') || normalized.startsWith('fd') || normalized.startsWith('fe80:')
}

async function assertPublicUrl(value:string) {
  const url=new URL(value)
  if (!['http:','https:'].includes(url.protocol)) throw new Error('La URL debe usar HTTP o HTTPS')
  if (url.username || url.password) throw new Error('La URL no puede incluir credenciales')
  const addresses=await lookup(url.hostname,{all:true})
  if (!addresses.length || addresses.some(item => privateIpv4(item.address) || privateIpv6(item.address))) throw new Error('La URL debe apuntar a una IP pública')
  return url
}

async function downloadPublicImage(sourceUrl:string):Promise<{data:Buffer; finalUrl:string}> {
  let current=await assertPublicUrl(sourceUrl)
  for (let redirects=0; redirects<=5; redirects++) {
    const response=await fetch(current,{redirect:'manual',signal:AbortSignal.timeout(timeoutMs)})
    if ([301,302,303,307,308].includes(response.status)) {
      const location=response.headers.get('location')
      if (!location) throw new Error('Redirect de imagen sin destino')
      current=await assertPublicUrl(new URL(location,current).toString())
      continue
    }
    if (!response.ok) throw new Error(`HTTP_${response.status}`)
    const declared=Number(response.headers.get('content-length') ?? 0)
    if (declared>maxBytes) throw new Error('La imagen supera el límite de 15 MB')
    const data=Buffer.from(await response.arrayBuffer())
    if (data.length>maxBytes) throw new Error('La imagen supera el límite de 15 MB')
    return {data,finalUrl:current.toString()}
  }
  throw new Error('Demasiados redirects al descargar la imagen')
}

export async function prepareImage(sourceUrl:string,template:TemplateName,objectPosition='50% 50%',publicBaseUrl:string):Promise<PreparedImage> {
  const key=createHash('sha256').update(`${sourceUrl}\n${template}\n${objectPosition}`).digest('hex')
  const filename=`${key}.jpg`
  const target=resolve(cacheRoot,filename)
  await mkdir(cacheRoot,{recursive:true})
  let metadata: Metadata
  try { metadata=await sharp(target,{limitInputPixels:40_000_000}).metadata() } catch {
    const {data}=await downloadPublicImage(sourceUrl)
    try {
      metadata=await sharp(data,{animated:false,limitInputPixels:40_000_000}).metadata()
      if (!metadata.width || !metadata.height || !metadata.format) throw new Error('La respuesta no contiene una imagen válida')
      await sharp(data,{animated:false,limitInputPixels:40_000_000}).rotate().toColorspace('srgb').jpeg({quality:89,progressive:false,mozjpeg:false}).toFile(target)
      metadata=await sharp(target).metadata()
    } catch (error) { throw new Error(error instanceof Error ? error.message : 'La respuesta no contiene una imagen válida') }
  }
  if (!metadata.width || !metadata.height) throw new Error('No se pudieron leer las dimensiones de la imagen')
  const file=await stat(target)
  const aspectRatio=Number((metadata.width/metadata.height).toFixed(4))
  const base=publicBaseUrl.replace(/\/+$/,'')
  return {valid:true,sourceUrl,url:`${base}/public/prepared/${filename}`,filename,width:metadata.width,height:metadata.height,aspectRatio,mime:'image/jpeg',fileSize:file.size,templateFit:fitForTemplate(aspectRatio,template),recommendedObjectPosition:recommendedObjectPosition(aspectRatio,template)}
}

export const preparedImagePath=(filename:string) => resolve(cacheRoot,filename)
