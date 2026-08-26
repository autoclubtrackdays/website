import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { rutaCoche } from '../lib/coches';

/**
 * Índice de la web para Google.
 *
 * Se genera a mano, sin @astrojs/sitemap, porque el sitio son seis páginas
 * fijas más una por coche: la lista cabe aquí y así no hay una dependencia más
 * que mantener. Al dar de alta o vender un coche, el archivo se rehace solo en
 * el siguiente build.
 *
 * La prioridad va por importancia real: la portada y el catálogo primero, las
 * fichas de coche después, y el histórico de vendidos al final.
 */
export const GET: APIRoute = async ({ site }) => {
	const coches = await getCollection('coches');

	const paginas: Array<[ruta: string, prioridad: string]> = [
		['/', '1.0'],
		['/catalogo', '0.9'],
		...coches.map((coche) => [rutaCoche(coche.data), '0.8'] as [string, string]),
		['/vendemos-tu-coche', '0.7'],
		['/compramos-tu-coche', '0.7'],
		['/pedidos-custom', '0.7'],
		['/vendidos', '0.4'],
	];

	// Con barra al final: sin ella el servidor responde una redirección y Google
	// se encuentra el sitemap entero apuntando a direcciones que no son la buena.
	const urls = paginas
		.map(
			([ruta, prioridad]) =>
				`\t<url>\n\t\t<loc>${new URL(ruta.replace(/\/?$/, '/'), site).href}</loc>\n\t\t<priority>${prioridad}</priority>\n\t</url>`,
		)
		.join('\n');

	return new Response(
		`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`,
		{ headers: { 'Content-Type': 'application/xml; charset=utf-8' } },
	);
};
