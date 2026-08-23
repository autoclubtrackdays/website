import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const coches = defineCollection({
	loader: glob({ base: './src/content/coches', pattern: '**/*.md' }),
	schema: z.object({
		nombre: z.string(),
		version: z.string(),
		precioContado: z.number(),
		precioFinanciado: z.number().optional(),
		km: z.number(),
		/** Mes de matriculación, 'AAAA-MM'. */
		matriculacion: z.string().regex(/^\d{4}-\d{2}$/),
		/** Los CV se calculan a partir de los kW, no se escriben aquí. */
		potenciaKw: z.number(),
		cambio: z.enum(['Manual', 'Automático']),
		/** l/100 km. */
		consumo: z.number().optional(),
		combustible: z.enum(['Gasolina', 'Diésel', 'Híbrido', 'Eléctrico']),
		/** Prefijo de la carpeta en R2. */
		carpeta: z.string(),
		fotos: z.array(z.string()).min(1),
	}),
});

export const collections = { coches };
