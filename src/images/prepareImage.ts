import { createHash } from 'node:crypto'
import { mkdir, stat, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'
import ipaddr from 'ipaddr.js'
import sharp, { type Metadata } from 'sharp'
import { fitForTemplate, recommendedObjectPosition, type TemplateName } from '../renderer/imageMetrics'

const maxBytes=15*1024*1024
const cacheRoot=resolve('output','prepared')
const timeoutMs=15_000

export type PreparedImage = {
  valid:true; sourceUrl:string; url:string; filename:string; width:number; height:number;
  aspectRatio:number; mime:'image/jpeg'; fileSize:number; templateFit:number; recommendedObjectPosition:string
}

export type ImagePreparationErrorCode = 'INVALID_URL'|'DNS_RESOLUTION_FAILED'|'PRIVATE_IP'|'REDIRECT_TO_PRIVATE_IP'|'HTTP_403'|'HTTP_404'|'HTTP_ERROR'|'INVALID_CONTENT_TYPE'|'IMAGE_TOO_LARGE'|'TIMEOUT'|'TOO_MANY_REDIRECTS'|'INVALID_IMAGE'
export class ImagePreparationError extends Error { constructor(public code:ImagePreparationErrorCode) { super(code); this.name='ImagePreparationError' } }

const hostWithoutBrackets=(host:string) => host.startsWith('[') && host.endsWith(']') ? host.slice(1,-1) : host
export const isPublicAddress=(address:string) => {
  let parsed:ipaddr.IPv4|ipaddr.IPv6
  try { parsed=ipaddr.parse(address) } catch { return false }
  if (parsed instanceof ipaddr.IPv6 && parsed.isIPv4MappedAddress()) parsed=parsed.toIPv4Address()
  return parsed.range()==='unicast'
}

export async function validatePublicUrl(value:string,redirect=false) {
  let url:URL
  try { url=new URL(value) } catch { throw new ImagePreparationError('INVALID_URL') }
  if (!['http:','https:'].includes(url.protocol) || url.username || url.password) throw new ImagePreparationError('INVALID_URL')
  const hostname=hostWithoutBrackets(url.hostname)
  let addresses:string[]
  if (isIP(hostname)) addresses=[hostname]
  else {
    try { addresses=(await lookup(hostname,{all:true,verbatim:true})).map(item=>item.address) }
    catch { throw new ImagePreparationError('DNS_RESOLUTION_FAILED') }
  }
  if (!addresses.length || addresses.some(address=>!isPublicAddress(address))) throw new ImagePreparationError(redirect ? 'REDIRECT_TO_PRIVATE_IP' : 'PRIVATE_IP')
  return url
}

async function downloadPublicImage(sourceUrl:string):Promise<{data:Buffer; finalUrl:string}> {
  let current=await validatePublicUrl(sourceUrl)
  for (let redirects=0; redirects<=5; redirects++) {
    let response:Response
    try { response=await fetch(current,{redirect:'manual',signal:AbortSignal.timeout(timeoutMs),headers:{accept:'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8','user-agent':'EmpreCarouselImageFetcher/1.0 (+https://render.pupuia.com)'}}) }
    catch (error) { if (error instanceof DOMException && error.name==='TimeoutError') throw new ImagePreparationError('TIMEOUT'); throw new ImagePreparationError('HTTP_ERROR') }
    if ([301,302,303,307,308].includes(response.status)) {
      const location=response.headers.get('location')
      if (!location) throw new Error('Redirect de imagen sin destino')
      current=await validatePublicUrl(new URL(location,current).toString(),true)
      continue
    }
    if (!response.ok) throw new ImagePreparationError(response.status===403 ? 'HTTP_403' : response.status===404 ? 'HTTP_404' : 'HTTP_ERROR')
    const contentType=response.headers.get('content-type')?.toLowerCase() ?? ''
    if (!contentType.startsWith('image/')) throw new ImagePreparationError('INVALID_CONTENT_TYPE')
    const declared=Number(response.headers.get('content-length') ?? 0)
    if (declared>maxBytes) throw new ImagePreparationError('IMAGE_TOO_LARGE')
    let data:Buffer
    try { data=Buffer.from(await response.arrayBuffer()) } catch (error) { if (error instanceof DOMException && error.name==='TimeoutError') throw new ImagePreparationError('TIMEOUT'); throw error }
    if (data.length>maxBytes) throw new ImagePreparationError('IMAGE_TOO_LARGE')
    return {data,finalUrl:current.toString()}
  }
  throw new ImagePreparationError('TOO_MANY_REDIRECTS')
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
    } catch (error) { if (error instanceof ImagePreparationError) throw error; throw new ImagePreparationError('INVALID_IMAGE') }
  }
  if (!metadata.width || !metadata.height) throw new Error('No se pudieron leer las dimensiones de la imagen')
  const file=await stat(target)
  const aspectRatio=Number((metadata.width/metadata.height).toFixed(4))
  const base=publicBaseUrl.replace(/\/+$/,'')
  return {valid:true,sourceUrl,url:`${base}/public/prepared/${filename}`,filename,width:metadata.width,height:metadata.height,aspectRatio,mime:'image/jpeg',fileSize:file.size,templateFit:fitForTemplate(aspectRatio,template),recommendedObjectPosition:recommendedObjectPosition(aspectRatio,template)}
}

export const preparedImagePath=(filename:string) => resolve(cacheRoot,filename)
