import { useState } from 'react'

export type ImageSlotProps = { imageUrl?: string; objectPosition?: string; alt?: string; className?: string }
export function ImageSlot({ imageUrl, objectPosition = '50% 50%', alt = '', className = '' }: ImageSlotProps) {
  const [status,setStatus]=useState<'loading'|'loaded'|'error'>(imageUrl ? 'loading' : 'error')
  if (!imageUrl) return <div className={`image-slot ${className}`} data-image-status="error" data-image-error="missing_image"><div className="image-slot__empty" /></div>
  return <div className={`image-slot ${className}`} data-image-status={status} data-image-url={imageUrl} data-image-error={status==='error' ? 'image_load_error' : undefined}>
    <img src={imageUrl} alt="" style={{objectPosition}} onLoad={event=>setStatus(event.currentTarget.naturalWidth>0 && event.currentTarget.naturalHeight>0 ? 'loaded' : 'error')} onError={()=>setStatus('error')} />
    {status==='error' && <div className="image-slot__error" aria-hidden="true" />}
  </div>
}
