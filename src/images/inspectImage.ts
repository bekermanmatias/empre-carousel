import sharp from 'sharp'

const maxBytes=15*1024*1024
const mimeForFormat: Record<string,string> = {jpeg:'image/jpeg',png:'image/png',webp:'image/webp',avif:'image/avif',gif:'image/gif',tiff:'image/tiff'}

export type InspectedImage = {valid:true;width:number;height:number;aspectRatio:number;mime:string;fileSize:number}

export async function inspectImageUrl(url:string):Promise<InspectedImage> {
  const parsed=new URL(url)
  if (!['http:','https:'].includes(parsed.protocol)) throw new Error('La URL debe usar HTTP o HTTPS')
  const response=await fetch(parsed,{redirect:'follow',signal:AbortSignal.timeout(15_000)})
  if (!response.ok) throw new Error(`No se pudo descargar la imagen (${response.status})`)
  const declaredLength=Number(response.headers.get('content-length') ?? 0)
  if (declaredLength>maxBytes) throw new Error('La imagen supera el límite de 15 MB')
  const data=Buffer.from(await response.arrayBuffer())
  if (data.length>maxBytes) throw new Error('La imagen supera el límite de 15 MB')
  const metadata=await sharp(data,{animated:false,limitInputPixels:40_000_000}).metadata()
  if (!metadata.width || !metadata.height || !metadata.format) throw new Error('No se pudieron leer las dimensiones de la imagen')
  return {valid:true,width:metadata.width,height:metadata.height,aspectRatio:Number((metadata.width/metadata.height).toFixed(4)),mime:mimeForFormat[metadata.format] ?? `image/${metadata.format}`,fileSize:data.length}
}
