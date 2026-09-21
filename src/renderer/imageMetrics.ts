export type TemplateName = 'T01'|'T02'|'T03'|'T04'|'T06'|'T07'|'T08'|'T09'
export type ImageOrientation = 'landscape'|'portrait'|'square'

const templateImageAspectRatio: Record<TemplateName,number> = {
  T01: 1000/555,
  T02: 468/1015,
  T03: 990/556,
  T04: 486/1062,
  T06: 426/929,
  T07: 473/1027,
  T08: 990/556,
  T09: 760/270,
}

export const orientationFor = (aspectRatio:number):ImageOrientation => aspectRatio > 1.05 ? 'landscape' : aspectRatio < .95 ? 'portrait' : 'square'
export const fitForTemplate = (aspectRatio:number,template:TemplateName) => Number(Math.min(aspectRatio/templateImageAspectRatio[template],templateImageAspectRatio[template]/aspectRatio).toFixed(2))
export const recommendedObjectPosition = (aspectRatio:number,template:TemplateName) => {
  const source=orientationFor(aspectRatio)
  const target=orientationFor(templateImageAspectRatio[template])
  if (source==='landscape' && target==='portrait') return '45% 50%'
  return '50% 50%'
}
