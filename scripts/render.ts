import { readFile } from 'node:fs/promises'
import { resolve, basename } from 'node:path'
import { carouselSchema } from '../src/schemas/carousel'
import { renderCarousel } from '../src/renderer/renderCarousel'

const input=process.argv[2] ?? 'examples/carousel.json'
const carousel=carouselSchema.parse(JSON.parse(await readFile(resolve(input),'utf8')))
const real=basename(input,'.json') === 'demo-real'
const directory=real ? resolve('output','demo-real') : resolve('output')
await renderCarousel(carousel,directory,(index,position,template)=>real ? `${String(position ?? index + 1).padStart(2,'0')}.png` : `${template}.png`)
