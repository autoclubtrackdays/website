import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

// Claves tal y como las escupe el origen de datos: no se renombran aquí para
// que volver a importar el stock no obligue a tocar el esquema.
//
// Va en su propia constante, y no como `coches.schema`, porque así TypeScript
// resuelve el tipo de las entradas de las dos colecciones en vez de darlas por
// desconocidas.
const esquemaCoche = z.object({
	title: z.string(),
	make: z.string(),
	/** Coerce porque YAML lee un modelo como '325' en número. */
	model: z.coerce.string().optional(),
	variant: z.coerce.string(),
	price_eur: z.number(),
	price_formatted: z.string().optional(),
	mileage_km: z.number(),
	/** MM/AAAA. */
	first_registration: z.string().regex(/^\d{2}\/\d{4}$/),
	fuel: z.string(),
	/** Llega despistado en mayúsculas y minúsculas; se normaliza al mostrarlo. */
	transmission: z.string(),
	/** Los clásicos no la traen. */
	power_kw: z.number().optional(),
	power_hp: z.number().optional(),
	body_type: z.string().optional(),
	color: z.string().optional(),
	doors: z.number().optional(),
	condition: z.string().optional(),
	reference: z.union([z.string(), z.number()]).optional(),
	listing_id: z.string().optional(),
	images: z.number().optional(),
	source_url: z.string().optional(),
});

// Cada coche es una carpeta con su .md y su media/. El id es la carpeta, no la
// ruta del archivo, para no arrastrar el nombre repetido.
const rutaComoId = ({ entry }: { entry: string }) => entry.split('/')[0];

const coches = defineCollection({
	loader: glob({ base: './src/content/coches', pattern: '**/*.md', generateId: rutaComoId }),
	schema: esquemaCoche,
});

/** Un coche vendido es el mismo .md movido a src/content/vendidos/. Su ficha
 *  sigue publicándose con el distintivo de vendido, pero sale del catálogo. */
const vendidos = defineCollection({
	loader: glob({ base: './src/content/vendidos', pattern: '**/*.md', generateId: rutaComoId }),
	schema: esquemaCoche,
});

export const collections = { coches, vendidos };
