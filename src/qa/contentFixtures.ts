import type { Slide } from '../schemas/templates'
import { demoSlides } from '../demo/demoData'

export type FixtureKind = 'short' | 'normal' | 'near-limit' | 'overflow'
export type ContentFixture = { template:Slide['template']; kind:FixtureKind; slide:Slide; expectsOverflow:boolean }
function variant(slide: Slide, kind: FixtureKind): Slide {
  const excess = Array.from({length:14}, (_, index) => `Test line ${index + 1}`).join('\n')
  const short = 'Brief message.'
  const near = 'An editorial formulation that fills much of the available space without exceeding its defined text box.'
  const value = kind === 'short' ? short : kind === 'near-limit' ? near : kind === 'overflow' ? excess : undefined
  if (!value) return slide
  switch (slide.template) { case 'T01': return {...slide,summary:value}; case 'T02': case 'T04': case 'T07': return {...slide,body:value}; case 'T03': case 'T08': return {...slide,body:value}; case 'T06': return {...slide,quote:value}; case 'T09': return {...slide,body:value} }
}
export const contentFixtures: ContentFixture[] = demoSlides.flatMap(slide => (['short','normal','near-limit','overflow'] as FixtureKind[]).map(kind => ({template:slide.template,kind,slide:variant(slide,kind),expectsOverflow:kind==='overflow'})))
