/**
 * Formato de las entradas de coche en .txt.
 *
 * Se eligió .txt y no .md porque en Windows se abre en el Bloc de notas de un
 * doble clic. El archivo es `Clave: valor`, una por línea, y al final un bloque
 * `Comentario:` que se lleva todo lo que venga detrás.
 *
 * Va en .mjs, no en .ts, para que lo puedan importar tanto la web (a través de
 * Vite) como el servidor del panel (Node a pelo), sin compilar nada.
 */

/** Etiqueta que ve el usuario -> clave interna del esquema y tipo de dato.
 *  Las claves internas son las que ya usan los componentes, así que cambiar el
 *  idioma del archivo no obliga a tocar la web. */
export const CAMPOS = [
	{ etiqueta: 'Referencia', clave: 'reference', tipo: 'texto', automatico: true },
	{ etiqueta: 'Marca', clave: 'make', tipo: 'texto', obligatorio: true },
	{ etiqueta: 'Modelo', clave: 'model', tipo: 'texto' },
	{ etiqueta: 'Version', clave: 'variant', tipo: 'texto', obligatorio: true },
	{ etiqueta: 'Precio', clave: 'price_eur', tipo: 'entero', obligatorio: true, sufijo: '€' },
	{ etiqueta: 'Kilometros', clave: 'mileage_km', tipo: 'entero', obligatorio: true, sufijo: 'km' },
	{ etiqueta: 'Fecha', clave: 'first_registration', tipo: 'fecha', obligatorio: true },
	{
		etiqueta: 'Combustible',
		clave: 'fuel',
		tipo: 'opciones',
		obligatorio: true,
		opciones: ['Gasolina', 'Diésel', 'Híbrido', 'Híbrido enchufable', 'Eléctrico', 'GLP', 'GNC'],
	},
	{
		etiqueta: 'Cambio',
		clave: 'transmission',
		tipo: 'opciones',
		obligatorio: true,
		opciones: ['Manual', 'Automático'],
	},
	{ etiqueta: 'Potencia CV', clave: 'power_hp', tipo: 'entero', sufijo: 'CV' },
	{ etiqueta: 'Potencia kW', clave: 'power_kw', tipo: 'entero', sufijo: 'kW' },
	{ etiqueta: 'Cilindrada', clave: 'displacement_cc', tipo: 'entero', sufijo: 'cm³' },
	{
		etiqueta: 'Carroceria',
		clave: 'body_type',
		tipo: 'opciones',
		opciones: [
			'Berlina',
			'Compacto',
			'Coupé',
			'Cabrio',
			'Familiar',
			'SUV o todoterreno',
			'Monovolumen',
			'Furgoneta',
			'Pick-up',
		],
	},
	{ etiqueta: 'Puertas', clave: 'doors', tipo: 'opciones', opciones: ['3', '4', '5'] },
	{ etiqueta: 'Plazas', clave: 'seats', tipo: 'opciones', opciones: ['2', '4', '5', '7', '9'] },
	{
		etiqueta: 'Traccion',
		clave: 'drivetrain',
		tipo: 'opciones',
		opciones: ['Delantera', 'Trasera', 'Cuatro ruedas'],
	},
	{ etiqueta: 'Color', clave: 'color', tipo: 'texto' },
	{
		etiqueta: 'Pintura',
		clave: 'paint',
		tipo: 'opciones',
		opciones: ['Sólido', 'Metalizado', 'Perlado', 'Mate'],
	},
	{ etiqueta: 'Consumo', clave: 'consumption', tipo: 'texto', ayuda: 'Por ejemplo: 8,3 l/100 km' },
	{ etiqueta: 'Accidentes', clave: 'accidents', tipo: 'sino' },
	{ etiqueta: 'Libro de mantenimiento', clave: 'service_book', tipo: 'sino' },
	{ etiqueta: 'ITV nueva', clave: 'itv', tipo: 'sino' },
	{ etiqueta: 'Fumador', clave: 'smoker', tipo: 'sino' },
	{ etiqueta: 'Vehiculo de alquiler', clave: 'rental', tipo: 'sino' },
	{ etiqueta: 'Garantia', clave: 'warranty', tipo: 'texto', ayuda: 'Por ejemplo: 12 meses' },
	{ etiqueta: 'Fotos', clave: 'images', tipo: 'entero', automatico: true },
];


const SEPARADOR_COMENTARIO = 'Comentario:';

/** Sin tildes y en minúsculas, para que 'Versión' y 'Version' valgan igual. */
const normalizarEtiqueta = (texto) =>
	texto
		.toLowerCase()
		.normalize('NFD')
		.replace(/[̀-ͯ]/g, '')
		.trim();

const PORETIQUETA = new Map(CAMPOS.map((campo) => [normalizarEtiqueta(campo.etiqueta), campo]));

/**
 * Texto del archivo -> `{ datos, comentario }`.
 * Las líneas que no reconoce las ignora, para que un archivo tocado a mano con
 * una nota suelta no reviente el sitio entero.
 */
export function parsearTxt(texto) {
	const [cabecera, ...resto] = texto.split(new RegExp(`^${SEPARADOR_COMENTARIO}\\s*$`, 'm'));
	const comentario = resto.join(SEPARADOR_COMENTARIO).trim();
	const datos = {};

	for (const linea of cabecera.split('\n')) {
		const corte = linea.indexOf(':');
		if (corte === -1) continue;

		const campo = PORETIQUETA.get(normalizarEtiqueta(linea.slice(0, corte)));
		if (!campo) continue;

		const valor = linea.slice(corte + 1).trim();
		if (!valor) continue;

		if (campo.tipo === 'entero') {
			// Se admiten '84.941' y '84941': el usuario escribe como le sale.
			const numero = Number(valor.replace(/[.\s]/g, ''));
			if (Number.isFinite(numero)) datos[campo.clave] = numero;
		} else {
			datos[campo.clave] = valor;
		}
	}

	return { datos, comentario };
}

/** `{ datos, comentario }` -> texto del archivo. Lo usa el panel al dar de alta. */
export function generarTxt(datos, comentario = '') {
	const lineas = CAMPOS.filter(
		(campo) => datos[campo.clave] !== undefined && datos[campo.clave] !== '',
	).map((campo) => `${campo.etiqueta}: ${datos[campo.clave]}`);

	return `${lineas.join('\n')}\n\n${SEPARADOR_COMENTARIO}\n${comentario.trim()}\n`;
}

/** El esquema exige `title`; en el archivo no se pide para no escribirlo dos veces. */
export const componerTitulo = (datos) =>
	[datos.make, datos.model, datos.variant].filter(Boolean).join(' ');
