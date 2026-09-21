import { z } from 'zod'
import { carouselSchema } from './carousel'

/** JSON Schema derived directly from the Zod source of truth. */
export const carouselJsonSchema = z.toJSONSchema(carouselSchema, {target:'draft-2020-12'})
