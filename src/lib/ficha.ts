/** Trocea el cuerpo del markdown del origen en secciones utilizables.
 *
 *  El formato es siempre el mismo: un `## Titulo` por bloque, y dentro o bien
 *  una tabla `| Campo | Valor |` o bien listas con `### Subtitulo`. Se parsea a
 *  mano en vez de renderizar el markdown para poder darle estilo propio y para
 *  descartar la cabecera, que repite el título y el precio que ya salen arriba.
 */

export interface Fila {
	campo: string;
	valor: string;
}

export interface Grupo {
	titulo: string;
	items: string[];
}

export interface Seccion {
	titulo: string;
	filas: Fila[];
	grupos: Grupo[];
	parrafos: string[];
}

const esSeparadorDeTabla = (linea: string) => /^\|[\s|:-]+\|$/.test(linea);

export function secciones(body = ''): Seccion[] {
	const encontradas: Seccion[] = [];
	let actual: Seccion | null = null;
	let grupo: Grupo | null = null;

	for (const linea of body.split('\n')) {
		const texto = linea.trim();

		if (texto.startsWith('## ')) {
			actual = { titulo: texto.slice(3).trim(), filas: [], grupos: [], parrafos: [] };
			grupo = null;
			encontradas.push(actual);
			continue;
		}

		// Todo lo anterior al primer ## es la cabecera duplicada: se ignora.
		if (!actual) continue;

		if (texto.startsWith('### ')) {
			grupo = { titulo: texto.slice(4).trim(), items: [] };
			actual.grupos.push(grupo);
			continue;
		}

		if (texto.startsWith('- ')) {
			const item = texto.slice(2).trim();
			if (!grupo) {
				grupo = { titulo: '', items: [] };
				actual.grupos.push(grupo);
			}
			grupo.items.push(item);
			continue;
		}

		// Cualquier línea de tabla se consume aquí, incluida la de guiones: si no,
		// el separador acababa colándose como párrafo al final de cada bloque.
		if (texto.startsWith('|')) {
			if (esSeparadorDeTabla(texto)) continue;

			const celdas = texto
				.split('|')
				.slice(1, -1)
				.map((celda) => celda.trim());

			// La fila de encabezado (Campo | Valor) no aporta nada.
			if (celdas.length === 2 && celdas[0] !== 'Campo') {
				actual.filas.push({ campo: celdas[0], valor: celdas[1] });
			}
			continue;
		}

		// Texto suelto: la descripción del anuncio. Se le quitan las negritas.
		if (texto) actual.parrafos.push(texto.replace(/\*\*/g, ''));
	}

	return encontradas.filter(
		(seccion) =>
			seccion.filas.length > 0 || seccion.grupos.length > 0 || seccion.parrafos.length > 0,
	);
}
