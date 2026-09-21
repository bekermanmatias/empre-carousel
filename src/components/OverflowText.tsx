import { useLayoutEffect, useRef, useState } from 'react'

export type AutoFitConfig = {
  defaultFontSize: number
  minFontSize: number
  step: number
  preserveLineHeightRatio?: boolean
}

type AutoFitMetadata = { originalFontSize:number; finalFontSize:number } | undefined
const isOverflowing = (node:HTMLElement) => node.scrollHeight > node.clientHeight + 1 || node.scrollWidth > node.clientWidth + 1

export function OverflowText({ children, className = '', field, autoFit }: { children?: string; className?: string; field?: string; autoFit?:AutoFitConfig }) {
  const ref = useRef<HTMLDivElement>(null)
  const [status,setStatus] = useState<{overflow:boolean;autoFit?:AutoFitMetadata}>({overflow:false})

  useLayoutEffect(() => {
    const node=ref.current
    if (!node) return
    node.style.removeProperty('font-size')
    node.style.removeProperty('line-height')
    const initialOverflow=isOverflowing(node)
    if (!autoFit || !initialOverflow) {
      setStatus({overflow:initialOverflow})
      if (initialOverflow) console.warn(`Empre Carousel: overflow detected in ${field || className || 'text box'}`)
      return
    }
    const computed=getComputedStyle(node)
    const computedFontSize=Number.parseFloat(computed.fontSize)
    const computedLineHeight=Number.parseFloat(computed.lineHeight)
    const lineHeightRatio=autoFit.preserveLineHeightRatio && Number.isFinite(computedLineHeight) && computedFontSize > 0 ? computedLineHeight/computedFontSize : undefined
    let finalFontSize=autoFit.defaultFontSize
    let resolved=false
    for (let size=autoFit.defaultFontSize-autoFit.step; size>=autoFit.minFontSize; size-=autoFit.step) {
      node.style.fontSize=`${size}px`
      if (lineHeightRatio) node.style.lineHeight=`${lineHeightRatio*size}px`
      finalFontSize=size
      if (!isOverflowing(node)) { resolved=true; break }
    }
    const overflow=!resolved
    setStatus({overflow,autoFit:{originalFontSize:autoFit.defaultFontSize,finalFontSize}})
    if (overflow) console.warn(`Empre Carousel: overflow detected in ${field || className || 'text box'} after auto-fit`)
  },[children,className,field,autoFit])

  const autoFitApplied=Boolean(status.autoFit)
  return <div ref={ref} data-overflow-field={field} data-overflow-status={status.overflow ? 'unresolved' : autoFitApplied ? 'fitted' : 'none'} data-auto-fit-applied={autoFitApplied || undefined} data-original-font-size={status.autoFit?.originalFontSize} data-final-font-size={status.autoFit?.finalFontSize} className={`${className} ${status.overflow ? 'has-overflow' : ''}`}>{children}</div>
}
