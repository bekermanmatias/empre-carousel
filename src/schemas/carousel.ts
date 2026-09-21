import { z } from 'zod'
import { slideSchema } from './templates'
export const carouselSchema = z.object({ version:z.literal('1'), slides:z.array(slideSchema).min(1, 'El carrusel debe tener al menos un slide').max(10, 'El carrusel admite un máximo de 10 slides') }).strict().superRefine(({slides}, ctx) => { const seen=new Set<number>(); slides.forEach((slide,index) => { if (slide.position !== undefined) { if (seen.has(slide.position)) ctx.addIssue({code:z.ZodIssueCode.custom,path:['slides',index,'position'],message:'La posición no puede repetirse'}); seen.add(slide.position) } }) })
export type Carousel = z.infer<typeof carouselSchema>
