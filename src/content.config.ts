import { defineCollection, z } from 'astro:content';
import type { Loader, LoaderContext } from 'astro/loaders';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { componerTitulo, parsearTxt } from './lib/formato-txt.mjs';

// Salvo la marca, todos los campos son opcionales. No es dejadez: hay entradas
// que no tienen ni van a tener ficha completa —una moto, un clásico del 57 sin
// kilometraje conocido— y forzar un valor obligaba a inventárselo. Lo que no se
// sabe se pinta con un guión, y en los datos estructurados simplemente no se
// declara, que es lo que exige Google.
//
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
	/** Opcional: un MINI 1000 o un M4 no tienen mas version que el modelo. */
	variant: z.coerce.string().optional(),
	price_eur: z.number().optional(),
	price_financed_eur: z.number().optional(),
	price_formatted: z.string().optional(),
	mileage_km: z.number().optional(),
	/** MM/AAAA. */
	first_registration: z
		.string()
		.regex(/^\d{2}\/\d{4}$/)
		.optional(),
	fuel: z.string().optional(),
	/** Llega despistado en mayúsculas y minúsculas; se normaliza al mostrarlo. */
	transmission: z.string().optional(),
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
	/** Lista de nombres: '01,02,05'. Admite un número por compatibilidad. */
	images: z.coerce.string().optional(),
	source_url: z.string().optional(),

	/** DD/MM/AAAA: cuando entró en el catálogo. Ordena la lista por defecto. */
	listed_on: z
		.string()
		.regex(/^\d{2}\/\d{2}\/\d{4}$/)
		.optional(),

	/** DD/MM/AAAA: cuando se marco vendido. Solo la traen los de esa colección. */
	sold_on: z
		.string()
		.regex(/^\d{2}\/\d{2}\/\d{4}$/)
		.optional(),

	// Campos que en el volcado antiguo vivían dentro de las tablas del cuerpo y
	// que el formulario del panel sí rellena como campos.
	displacement_cc: z.number().optional(),
	seats: z.coerce.number().optional(),
	drivetrain: z.string().optional(),
	paint: z.string().optional(),
	consumption: z.string().optional(),
	environmental_label: z.string().optional(),
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

/**
 * Un coche vendido puede llegar por dos caminos.
 *
 * Si lo marca el panel, es la entrada de siempre movida a src/content/vendidos/
 * y la trae todo. Si es una venta antigua que se vuelca a mano, de la tarjeta
 * solo salen la foto, el nombre y el modelo, así que exigirle precio, fecha o
 * combustible obligaría a inventárselos para que no enseñe ninguno de ellos.
 *
 * Ahora da igual: el esquema es el mismo y casi todo es opcional, así que un
 * volcado a mano entra sin inventarse nada.
 */
const vendidos = defineCollection({
	loader: lectorCoches('./src/content/vendidos'),
	schema: esquemaCoche,
});

export const collections = { coches, vendidos };
