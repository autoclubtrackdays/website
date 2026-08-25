import type { CollectionEntry } from 'astro:content';

type Datos = CollectionEntry<'coches'>['data'];

/** Base del bucket R2, p. ej. https://cdn.autoclubtrackdays.com */
const CDN_BASE = import.meta.env.PUBLIC_CDN_BASE;

/** Red de seguridad para un coche que llegue sin fotos. */
const PLACEHOLDER = '/placeholders/1.jpg';

const enR2 = (referencia: unknown, indice: number) =>
	`${CDN_BASE.replace(/\/$/, '')}/coches/${referencia}/${String(indice).padStart(2, '0')}.webp`;

/** Las fotos se nombran por referencia, que es como las sube el panel. */
type ConFotos = { data: Pick<Datos, 'reference' | 'images'> };

export function portada(coche: ConFotos): string {
	return CDN_BASE && coche.data.reference ? enR2(coche.data.reference, 1) : PLACEHOLDER;
}

/** Todas las fotos, en orden. El número sale del campo `Fotos` del archivo. */
export function fotos(coche: ConFotos): string[] {
	const cuantas = coche.data.images ?? 0;

	if (!CDN_BASE || !coche.data.reference || cuantas < 1) return [PLACEHOLDER];

	return Array.from({ length: cuantas }, (_, indice) => enR2(coche.data.reference, indice + 1));
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

/** Los dos precios del coche. El financiado es opcional: si no está, o si
 *  coincide con el de contado, no se pinta y la tarjeta enseña una sola cifra. */
export function precios(data: Datos) {
	const financiado = data.price_financed_eur ?? null;

	return {
		contado: data.price_eur,
		financiado: financiado && financiado !== data.price_eur ? financiado : null,
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
