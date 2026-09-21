import { z } from 'zod'
const slideNumber = z.string().regex(/^\d{2}\s*\/\s*\d{2}$/, 'Usar el formato 01 / 09')
const text = (max: number) => z.string().trim().min(1).max(max)
const imageSchema = z.object({ url: z.string().min(1), objectPosition: z.string().optional(), alt: z.string().max(180).optional() }).strict()
const positioned = { slideNumber, position: z.number().int().min(1).max(10).optional() }
export const t01Schema = z.object({ template:z.literal('T01'), ...positioned, title:text(180), summary:text(260), image:imageSchema }).strict()
export const t02Schema = z.object({ template:z.literal('T02'), ...positioned, section:text(40), title:text(180), body:text(520), highlight:text(180), image:imageSchema }).strict()
export const t03Schema = z.object({ template:z.literal('T03'), ...positioned, title:text(200), body:text(520), image:imageSchema }).strict()
export const t04Schema = z.object({ template:z.literal('T04'), ...positioned, section:text(40), title:text(180), body:text(520), highlight:text(180), image:imageSchema }).strict()
// Chromium QA shows ordinary quotes around 166 characters fit with bounded auto-fit,
// while wordier copy near 200 characters can exceed the fixed T06 quote box.
export const t06Schema = z.object({ template:z.literal('T06'), ...positioned, section:text(40), quote:text(180), context:text(200), image:imageSchema }).strict()
export const t07Schema = z.object({ template:z.literal('T07'), ...positioned, section:text(40), title:text(180), body:text(520), highlight:text(180), image:imageSchema }).strict()
export const t08Schema = z.object({ template:z.literal('T08'), ...positioned, title:text(200), body:text(520), image:imageSchema }).strict()
export const t09Schema = z.object({ template:z.literal('T09'), ...positioned, title:text(180), body:text(340), highlight:text(180).optional(), image:imageSchema.optional(), signature:text(100).optional() }).strict()
export const slideSchema = z.discriminatedUnion('template', [t01Schema,t02Schema,t03Schema,t04Schema,t06Schema,t07Schema,t08Schema,t09Schema])
export type Slide = z.infer<typeof slideSchema>
