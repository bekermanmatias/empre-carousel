import { useLayoutEffect, useRef, useState } from 'react'

export type AutoFitConfig = {
  defaultFontSize: number
  minFontSize: number
  step: number
  preserveLineHeightRatio?: boolean
  maxLines?: number
}

export type TextMetrics = {lineCount:number;scrollHeight:number;clientHeight:number;overflow:boolean;fontSizeUsed:number;autoFitApplied:boolean;maxLines?:number;originalFontSize?:number}
const measure = (node:HTMLElement,maxLines?:number):TextMetrics => {
  const styles=getComputedStyle(node)
  const fontSize=Number.parseFloat(styles.fontSize) || 0
  const lineHeight=Number.parseFloat(styles.lineHeight) || fontSize*1.2
  const range=document.createRange()
  range.selectNodeContents(node)
  const lineCount=Math.max(1,Math.round(range.getBoundingClientRect().height/lineHeight))
  const overflow=node.scrollHeight > node.clientHeight + 1 || node.scrollWidth > node.clientWidth + 1 || (maxLines !== undefined && lineCount > maxLines)
  return {lineCount,scrollHeight:node.scrollHeight,clientHeight:node.clientHeight,overflow,fontSizeUsed:fontSize,autoFitApplied:false,maxLines}
}

export function OverflowText({ children, className = '', field, autoFit }: { children?: string; className?: string; field?: string; autoFit?:AutoFitConfig }) {
  const ref = useRef<HTMLDivElement>(null)
  const [status,setStatus] = useState<TextMetrics>({lineCount:0,scrollHeight:0,clientHeight:0,overflow:false,fontSizeUsed:0,autoFitApplied:false})

  useLayoutEffect(() => {
    const node=ref.current
    if (!node) return
    node.style.removeProperty('font-size')
    node.style.removeProperty('line-height')
    const initial=measure(node,autoFit?.maxLines)
    if (!autoFit || !initial.overflow) {
      setStatus(initial)
      if (initial.overflow) console.warn(`Empre Carousel: overflow detected in ${field || className || 'text box'}`)
      return
    }
    const computed=getComputedStyle(node)
    const computedFontSize=Number.parseFloat(computed.fontSize)
    const computedLineHeight=Number.parseFloat(computed.lineHeight)
    const lineHeightRatio=autoFit.preserveLineHeightRatio && Number.isFinite(computedLineHeight) && computedFontSize > 0 ? computedLineHeight/computedFontSize : undefined
    let finalFontSize=autoFit.defaultFontSize
    let resolved=false
    const sizes=[]
    for (let size=autoFit.defaultFontSize-autoFit.step; size>autoFit.minFontSize; size-=autoFit.step) sizes.push(size)
    sizes.push(autoFit.minFontSize)
    for (const size of sizes) {
      node.style.fontSize=`${size}px`
      if (lineHeightRatio) node.style.lineHeight=`${lineHeightRatio*size}px`
      finalFontSize=size
      if (!measure(node,autoFit.maxLines).overflow) { resolved=true; break }
    }
    const final=measure(node,autoFit.maxLines)
    setStatus({...final,autoFitApplied:true,originalFontSize:autoFit.defaultFontSize})
    if (!resolved) console.warn(`Empre Carousel: overflow detected in ${field || className || 'text box'} after auto-fit`)
  },[children,className,field,autoFit])

  return <div ref={ref} data-overflow-field={field} data-text-field={field} data-overflow-status={status.overflow ? 'unresolved' : status.autoFitApplied ? 'fitted' : 'none'} data-line-count={status.lineCount} data-scroll-height={status.scrollHeight} data-client-height={status.clientHeight} data-overflow={status.overflow} data-font-size-used={status.fontSizeUsed} data-original-font-size={status.originalFontSize} data-auto-fit-applied={status.autoFitApplied} data-max-lines={status.maxLines} className={`${className} ${status.overflow ? 'has-overflow' : ''}`}>{children}</div>
}
