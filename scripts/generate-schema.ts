import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { carouselJsonSchema } from '../src/schemas/jsonSchema'

const directory=resolve('schemas')
await mkdir(directory,{recursive:true})
await writeFile(resolve(directory,'carousel.schema.json'),JSON.stringify(carouselJsonSchema,null,2)+'\n')
console.log('Schema generado: schemas/carousel.schema.json')
