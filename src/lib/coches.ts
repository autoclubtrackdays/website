import type { CollectionEntry } from 'astro:content';

type Datos = CollectionEntry<'coches'>['data'];

/** Base del bucket R2, p. ej. https://cdn.autoclubtrackdays.com */
const CDN_BASE = import.meta.env.PUBLIC_CDN_BASE;

/** Mientras no haya R2, las fotos salen de la carpeta media/ de cada coche.
 *  Solo se enlaza la primera: es la única que usan las cards. */
const PORTADAS = import.meta.glob<string>('/src/content/coches/*/media/01.jpg', {
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
	return PORTADAS[`/src/content/coches/${id}/media/01.jpg`] ?? PLACEHOLDER;
}

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

/** '317 kW (431 CV)', o null en los coches que no declaran potencia. */
export function potenciaTexto(data: Datos): string | null {
	if (!data.power_kw && !data.power_hp) return null;
	if (data.power_kw && data.power_hp) return `${data.power_kw} kW (${data.power_hp} CV)`;
	return data.power_kw ? `${data.power_kw} kW` : `${data.power_hp} CV`;
}

/** El origen manda 'manual' y 'Automático' sin criterio fijo. */
export const cambioTexto = (transmission: string) =>
	transmission.charAt(0).toUpperCase() + transmission.slice(1).toLowerCase();

/** El consumo no está en el frontmatter sino en la tabla del cuerpo. */
export function consumoTexto(body?: string): string | null {
	const encontrado = body?.match(/Consumo combinado\s*\|\s*([\d.,]+)\s*l\/100\s*km/i);
	return encontrado ? `${encontrado[1]} l/100 km` : null;
}
