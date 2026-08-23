import type { CollectionEntry } from 'astro:content';

export type Coche = CollectionEntry<'coches'>;

/** Base del bucket R2, p. ej. https://cdn.autoclubtrackdays.com
 *  Sin definir, las cards caen al placeholder local. */
const CDN_BASE = import.meta.env.PUBLIC_CDN_BASE;

/** Fotos de relleno mientras no exista el bucket. Se reparten de forma estable
 *  segun la carpeta, para que cada coche se vea siempre igual entre recargas.
 *  En cuanto PUBLIC_CDN_BASE este definida, este camino deja de usarse. */
const PLACEHOLDERS = [
	'/placeholders/1.jpg',
	'/placeholders/2.jpg',
	'/placeholders/3.jpg',
	'/placeholders/4.jpg',
	'/placeholders/5.jpg',
];

function placeholder(carpeta: string): string {
	const hash = [...carpeta].reduce((acc, letra) => (acc * 31 + letra.charCodeAt(0)) | 0, 7);
	return PLACEHOLDERS[Math.abs(hash) % PLACEHOLDERS.length];
}

/** Anchos que genera el script de ingesta: 640 para las cards, 1600 para la ficha. */
export type TamanoFoto = 640 | 1600;

export function fotoUrl(carpeta: string, foto: string, tamano: TamanoFoto = 640): string {
	if (!CDN_BASE) return placeholder(carpeta);
	return `${CDN_BASE.replace(/\/$/, '')}/coches/${carpeta}/${foto}-${tamano}.webp`;
}

const precioFmt = new Intl.NumberFormat('es-ES', {
	style: 'currency',
	currency: 'EUR',
	maximumFractionDigits: 0,
});
const kmFmt = new Intl.NumberFormat('es-ES');
const consumoFmt = new Intl.NumberFormat('es-ES', {
	minimumFractionDigits: 1,
	maximumFractionDigits: 1,
});

export const precioTexto = (euros: number) => precioFmt.format(euros);

export const kmTexto = (km: number) => `${kmFmt.format(km)} km`;

/** 1 kW = 1,35962 CV. Se calcula para no tener que escribirlo en cada entrada. */
export const cv = (kw: number) => Math.round(kw * 1.35962);

export const potenciaTexto = (kw: number) => `${kw} kW (${cv(kw)} CV)`;

export const consumoTexto = (litros: number) => `${consumoFmt.format(litros)} l/100 km`;

/** '2015-03' -> '03/2015' */
export function fechaCorta(matriculacion: string): string {
	const [anio, mes] = matriculacion.split('-');
	return `${mes}/${anio}`;
}
