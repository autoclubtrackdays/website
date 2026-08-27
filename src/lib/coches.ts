import type { CollectionEntry } from 'astro:content';
import { nombresDeFotos } from './formato-txt.mjs';

type Datos = CollectionEntry<'coches'>['data'];

/** Base del bucket R2, p. ej. https://cdn.autoclubtrackdays.com */
const CDN_BASE = import.meta.env.PUBLIC_CDN_BASE;

/** Red de seguridad para un coche que llegue sin fotos. */
const PLACEHOLDER = '/media/sin-foto.svg';

const enR2 = (referencia: unknown, nombre: string) =>
	`${CDN_BASE.replace(/\/$/, '')}/coches/${referencia}/${nombre}.webp`;

/** Las fotos se nombran por referencia, que es como las sube el panel. */
type ConFotos = { data: Pick<Datos, 'reference' | 'images'> };

export function portada(coche: ConFotos): string {
	return fotos(coche)[0];
}

/** Todas las fotos, en el orden en que las dejó el panel. */
export function fotos(coche: ConFotos): string[] {
	const nombres = nombresDeFotos(coche.data.images);

	if (!CDN_BASE || !coche.data.reference || nombres.length === 0) return [PLACEHOLDER];

	return nombres.map((nombre) => enR2(coche.data.reference, nombre));
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

/** Lo que se pinta donde un dato no está determinado. */
export const GUION = '—';

/** Un coche puede estar a la venta sin precio cerrado, y ahí un guión se lee
 *  como un fallo de la web en vez de como una decisión. */
export const SIN_PRECIO = 'Consultar precio';

// `useGrouping: 'always'` no es un capricho: en español la norma es no agrupar
// los números de cuatro cifras, así que por defecto Intl daba «6900 €» al lado
// de «127.900 €». En una lista de precios eso parece una errata.
const precioFmt = new Intl.NumberFormat('es-ES', {
	style: 'currency',
	currency: 'EUR',
	maximumFractionDigits: 0,
	useGrouping: 'always',
});
const kmFmt = new Intl.NumberFormat('es-ES', { useGrouping: 'always' });

export const precioTexto = (euros?: number | null) =>
	euros == null ? SIN_PRECIO : precioFmt.format(euros);

export const kmTexto = (km?: number | null) => (km == null ? GUION : `${kmFmt.format(km)} km`);

/** 'BMW M4', 'Ford Mustang'. Sin `model` (algún clásico) tira del título. */
export const nombreCorto = (data: Datos) => (data.model ? `${data.make} ${data.model}` : data.title);

/** 'Mazda 3 2.0 e-Skyactiv-G Zenith Safety Black'. Sin version, solo el nombre. */
export const nombreCompleto = (data: Datos) =>
	[nombreCorto(data), data.variant].filter(Boolean).join(' ');

/** '431 CV (317 kW)', o null en los coches que no declaran potencia. */
export function potenciaTexto(data: Datos): string | null {
	if (!data.power_kw && !data.power_hp) return null;
	if (data.power_kw && data.power_hp) return `${data.power_hp} CV (${data.power_kw} kW)`;
	return data.power_hp ? `${data.power_hp} CV` : `${data.power_kw} kW`;
}

/** El origen manda 'manual' y 'Automático' sin criterio fijo. Devuelve undefined
 *  si el coche no lo declara, para que quien lo pinte decida qué poner. */
export const cambioTexto = (transmission?: string) =>
	transmission
		? transmission.charAt(0).toUpperCase() + transmission.slice(1).toLowerCase()
		: undefined;

/** Los dos precios del coche. El financiado es opcional: si no está, o si
 *  coincide con el de contado, no se pinta y la tarjeta enseña una sola cifra. */
export function precios(data: Datos) {
	const financiado = data.price_financed_eur ?? null;

	return {
		contado: data.price_eur ?? null,
		financiado: financiado && financiado !== data.price_eur ? financiado : null,
	};
}


/** '26/08/2026' -> 20260826. Mismo truco, con el día. Sin fecha devuelve 0, que
 *  manda al final a los coches que entraron antes de que existiera el campo. */
export function ordenAlta(listed_on?: string): number {
	if (!listed_on) return 0;
	const [dia, mes, anio] = listed_on.split('/');
	return Number(anio) * 10000 + Number(mes) * 100 + Number(dia);
}

/** '11/2017' -> 201711. Un número así ordena por fecha sin parsear nada. */
export function ordenFecha(first_registration?: string): number {
	if (!first_registration) return 0;
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
