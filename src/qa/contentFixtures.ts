import type { Slide } from '../schemas/templates'
import { demoSlides } from '../demo/demoData'

export type FixtureKind = 'short' | 'normal' | 'near-limit' | 'overflow' | 't06-real-overflow' | 't06-near-editorial-limit' | 't06-wordy-autofit' | 't06-long-word-overflow'
export type ContentFixture = { template:Slide['template']; kind:FixtureKind; slide:Slide; expectsOverflow:boolean; expectsAutoFit?:boolean }
function variant(slide: Slide, kind: FixtureKind): Slide {
  const excess = Array.from({length:14}, (_, index) => `Test line ${index + 1}`).join('\n')
  const short = 'Brief message.'
  const near = 'An editorial formulation that fills much of the available space without exceeding its defined text box.'
  const value = kind === 'short' ? short : kind === 'near-limit' ? near : kind === 'overflow' ? excess : undefined
  if (!value) return slide
  switch (slide.template) { case 'T01': return {...slide,summary:value}; case 'T02': case 'T04': case 'T07': return {...slide,body:value}; case 'T03': case 'T08': return {...slide,body:value}; case 'T06': return {...slide,quote:value}; case 'T09': return {...slide,body:value} }
}
const t06=demoSlides.find((slide): slide is Extract<Slide,{template:'T06'}> => slide.template==='T06')!
const realQuote='AI systems are getting more powerful, and they’re increasingly being used to build the next version of themselves. We want to illuminate that progress for the public.'
const nearEditorialLimitQuote=`${realQuote} Today.`
const wordyQuote='AI is moving fast. We need clear rules, open research, strong testing, and public debate so progress serves people, not only the systems being built, in daily life and work.'
const longWordQuote='Electroencephalographically electroencephalographically electroencephalographically electroencephalographically.'

export const contentFixtures: ContentFixture[] = [
  ...demoSlides.flatMap(slide => (['short','normal','near-limit','overflow'] as const).map(kind => ({template:slide.template,kind,slide:variant(slide,kind),expectsOverflow:kind==='overflow'}))),
  {template:'T06',kind:'t06-real-overflow',slide:{...t06,quote:realQuote},expectsOverflow:false,expectsAutoFit:true},
  {template:'T06',kind:'t06-near-editorial-limit',slide:{...t06,quote:nearEditorialLimitQuote},expectsOverflow:false,expectsAutoFit:true},
  {template:'T06',kind:'t06-wordy-autofit',slide:{...t06,quote:wordyQuote},expectsOverflow:false,expectsAutoFit:true},
  {template:'T06',kind:'t06-long-word-overflow',slide:{...t06,quote:longWordQuote},expectsOverflow:true},
]
