import type { CollectionEntry } from 'astro:content';

type Datos = CollectionEntry<'coches'>['data'];

/** Base del bucket R2, p. ej. https://cdn.autoclubtrackdays.com */
const CDN_BASE = import.meta.env.PUBLIC_CDN_BASE;

/** Mientras no haya R2, las fotos salen de la carpeta media/ de cada coche. */
const GALERIAS = import.meta.glob<string>('/src/content/coches/*/media/*.jpg', {
	eager: true,
	query: '?url',
	import: 'default',
});

/** Red de seguridad para un coche que llegue sin fotos. */
const PLACEHOLDER = '/placeholders/1.jpg';

/** Foto de portada. Cuando exista PUBLIC_CDN_BASE tirará de R2 y la carpeta
 *  media/ dejará de usarse sin tocar ningún componente. */
export function portada(id: string): string {
	if (CDN_BASE) return `${CDN_BASE.replace(/\/$/, '')}/coches/${id}/01-640.webp`;
	return GALERIAS[`/src/content/coches/${id}/media/01.jpg`] ?? PLACEHOLDER;
}

/** Todas las fotos del coche, en el orden en que las numeró el origen. */
export function fotos(id: string): string[] {
	const prefijo = `/src/content/coches/${id}/media/`;
	const encontradas = Object.entries(GALERIAS)
		.filter(([ruta]) => ruta.startsWith(prefijo))
		.sort(([a], [b]) => a.localeCompare(b))
		.map(([, url]) => url);

	return encontradas.length > 0 ? encontradas : [PLACEHOLDER];
}

/** 'BMW M4 M4A' + referencia -> 'bmw-m4-m4a-19903975'.
 *  La referencia va siempre, para que dos coches iguales nunca choquen y para
 *  que la URL lleve el mismo número que el cliente ve en el anuncio. */
export function slugCoche(data: Datos): string {
	const texto = [data.make, data.model, data.variant].filter(Boolean).join(' ');
	const base = normalizar(texto)
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/-+/g, '-')
		.replace(/^-|-$/g, '');

	return `${base}-${data.reference}`;
}

export const rutaCoche = (data: Datos) => `/catalogo/${slugCoche(data)}`;

const precioFmt = new Intl.NumberFormat('es-ES', {
	style: 'currency',
	currency: 'EUR',
	maximumFractionDigits: 0,
});
const kmFmt = new Intl.NumberFormat('es-ES');

export const precioTexto = (euros: number) => precioFmt.format(euros);

export const kmTexto = (km: number) => `${kmFmt.format(km)} km`;

/** 'BMW M4', 'Ford Mustang'. Sin `model` (algún clásico) tira del título. */
export const nombreCorto = (data: Datos) => (data.model ? `${data.make} ${data.model}` : data.title);

/** '431 CV (317 kW)', o null en los coches que no declaran potencia. */
export function potenciaTexto(data: Datos): string | null {
	if (!data.power_kw && !data.power_hp) return null;
	if (data.power_kw && data.power_hp) return `${data.power_hp} CV (${data.power_kw} kW)`;
	return data.power_hp ? `${data.power_hp} CV` : `${data.power_kw} kW`;
}

/** El origen manda 'manual' y 'Automático' sin criterio fijo. */
export const cambioTexto = (transmission: string) =>
	transmission.charAt(0).toUpperCase() + transmission.slice(1).toLowerCase();

/** OJO: `price_eur` no es el precio al contado. En los coches que lo declaran,
 *  el cuerpo del anuncio da uno 100 € mayor. Se devuelven los dos para que cada
 *  cifra salga con la etiqueta que le corresponde. */
export function precios(data: Datos, body?: string) {
	const encontrado = body?.match(/Precio al contado[^\d]*(\d[\d.]*)/);
	const contado = encontrado ? Number(encontrado[1].replace(/\./g, '')) : null;

	return {
		contado: contado ?? data.price_eur,
		/** Solo cuando de verdad difiere del de contado. */
		financiado: contado && contado !== data.price_eur ? data.price_eur : null,
	};
}

/** El consumo no está en el frontmatter sino en la tabla del cuerpo. */
export function consumoTexto(body?: string): string | null {
	const encontrado = body?.match(/Consumo combinado\s*\|\s*([\d.,]+)\s*l\/100\s*km/i);
	return encontrado ? `${encontrado[1]} l/100 km` : null;
}

/** '11/2017' -> 201711. Un número así ordena por fecha sin parsear nada. */
export function ordenFecha(first_registration: string): number {
	const [mes, anio] = first_registration.split('/');
	return Number(anio) * 100 + Number(mes);
}

/** Minúsculas y sin tildes, para que 'citroen' encuentre 'Citroën'. */
export const normalizar = (texto: string) =>
	texto
		.toLowerCase()
		.normalize('NFD')
		.replace(/[̀-ͯ]/g, '');

/** Todo lo que debería encontrar el buscador de un coche, en una sola cadena. */
export const textoBusqueda = (data: Datos) =>
	normalizar(
		[data.title, data.make, data.model, data.variant, data.color, data.body_type, data.fuel]
			.filter(Boolean)
			.join(' '),
	);
