import { defineCollection, z } from 'astro:content';
import type { Loader, LoaderContext } from 'astro/loaders';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { componerTitulo, parsearTxt } from './lib/formato-txt.mjs';

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
	/** Coerce: en el .txt viene de un desplegable, o sea como texto. */
	doors: z.coerce.number().optional(),
	condition: z.string().optional(),
	reference: z.union([z.string(), z.number()]).optional(),
	listing_id: z.string().optional(),
	images: z.number().optional(),
	source_url: z.string().optional(),

	// Campos que en el volcado antiguo vivían dentro de las tablas del cuerpo y
	// que el formulario del panel sí rellena como campos.
	displacement_cc: z.number().optional(),
	seats: z.coerce.number().optional(),
	drivetrain: z.string().optional(),
	paint: z.string().optional(),
	consumption: z.string().optional(),
	accidents: z.string().optional(),
	service_book: z.string().optional(),
	itv: z.string().optional(),
	smoker: z.string().optional(),
	rental: z.string().optional(),
	warranty: z.string().optional(),
});

/**
 * Lee las entradas en .txt y las añade al store.
 *
 * Astro trae lectores para .md, .json y .yaml, pero no para .txt, así que hay
 * que ponerlo a mano. El id es el nombre del archivo sin extensión.
 */
async function cargarTxt(carpeta: string, contexto: LoaderContext) {
	const { store, parseData, generateDigest, logger } = contexto;

	let archivos: string[] = [];
	try {
		archivos = (await readdir(carpeta)).filter((nombre) => nombre.endsWith('.txt'));
	} catch {
		return; // La carpeta puede no existir todavía.
	}

	for (const archivo of archivos) {
		const ruta = join(carpeta, archivo);
		const { datos, comentario } = parsearTxt(await readFile(ruta, 'utf8'));

		const id = archivo.replace(/\.txt$/, '');
		const crudo = { ...datos, title: datos.title ?? componerTitulo(datos) };

		try {
			const data = await parseData({ id, data: crudo, filePath: ruta });
			store.set({ id, data, body: comentario, filePath: ruta, digest: generateDigest(crudo) });
		} catch (error) {
			logger.error(`No se pudo leer ${ruta}: ${(error as Error).message}`);
		}
	}
}

function lectorCoches(carpeta: string): Loader {
	return {
		name: 'coches',
		load: async (contexto) => {
			// Se vacía antes de recargar. El almacén de Astro sobrevive entre
			// ejecuciones en node_modules/.astro/, así que sin esto un coche
			// borrado del disco seguiría generando su página indefinidamente.
			contexto.store.clear();

			await cargarTxt(carpeta, contexto);
		},
	};
}

const coches = defineCollection({
	loader: lectorCoches('./src/content/coches'),
	schema: esquemaCoche,
});

/** Un coche vendido es la misma entrada movida a src/content/vendidos/. Su ficha
 *  sigue publicándose con el distintivo de vendido, pero sale del catálogo. */
const vendidos = defineCollection({
	loader: lectorCoches('./src/content/vendidos'),
	schema: esquemaCoche,
});

export const collections = { coches, vendidos };
