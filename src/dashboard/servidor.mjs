/**
 * Servidor del panel de administración. Solo escucha en localhost.
 *
 * Existe porque una página web no puede escribir en el disco, subir a R2 ni
 * hacer un commit. Todo lo que no puede hacer el navegador, lo hace esto.
 *
 * Se arranca con `npm run admin` (o con el acceso directo Panel.bat).
 */
import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import { readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { AwsClient } from 'aws4fetch';
import sharp from 'sharp';
import { CAMPOS, generarTxt, nombresDeFotos, parsearTxt } from '../lib/formato-txt.mjs';

const ejecutar = promisify(execFile);

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, '..', '..');
const COCHES = join(RAIZ, 'src', 'content', 'coches');
const VENDIDOS = join(RAIZ, 'src', 'content', 'vendidos');
const DESTACADOS = join(RAIZ, 'src', 'lib', 'destacados.ts');

const PUERTO = 4322;

// Las credenciales viven en .env, que no entra en git.
try {
	process.loadEnvFile(join(RAIZ, '.env'));
} catch {
	// Sin .env se puede dar de alta igual; lo que fallará es subir fotos.
}

const R2 = {
	cuenta: process.env.R2_ACCOUNT_ID,
	clave: process.env.R2_ACCESS_KEY_ID,
	secreto: process.env.R2_SECRET_ACCESS_KEY,
	bucket: process.env.R2_BUCKET,
};

const r2Configurado = () => Object.values(R2).every(Boolean);

// --- Utilidades ------------------------------------------------------------

const json = (respuesta, codigo, cuerpo) => {
	respuesta.writeHead(codigo, { 'content-type': 'application/json; charset=utf-8' });
	respuesta.end(JSON.stringify(cuerpo));
};

const leerCuerpo = (peticion) =>
	new Promise((resolver, rechazar) => {
		const trozos = [];
		peticion.on('data', (trozo) => trozos.push(trozo));
		peticion.on('end', () => resolver(Buffer.concat(trozos)));
		peticion.on('error', rechazar);
	});

/** Sin tildes, en minúsculas y con guiones: vale para nombre de archivo y URL. */
const aSlug = (texto) =>
	texto
		.toLowerCase()
		.normalize('NFD')
		.replace(/[̀-ͯ]/g, '')
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-|-$/g, '');

/** Referencia de 6 dígitos que no choque con ninguna existente. */
async function generarReferencia() {
	const usadas = new Set();

	for (const carpeta of [COCHES, VENDIDOS]) {
		let entradas = [];
		try {
			entradas = await readdir(carpeta);
		} catch {
			continue;
		}

		for (const entrada of entradas) {
			const encontrada = entrada.match(/(\d{5,})(?:\.txt)?$/);
			if (encontrada) usadas.add(encontrada[1]);
		}
	}

	for (let intento = 0; intento < 50; intento++) {
		const referencia = String(Math.floor(100000 + Math.random() * 900000));
		if (!usadas.has(referencia)) return referencia;
	}

	throw new Error('No se encontró una referencia libre');
}

// --- Endpoints -------------------------------------------------------------

/** Da de alta el coche: genera la referencia y escribe el .txt. */
async function altaCoche(peticion, respuesta) {
	const { datos = {}, comentario = '' } = JSON.parse(await leerCuerpo(peticion));

	const faltan = ['make'].filter(
		(clave) => datos[clave] === undefined || datos[clave] === '',
	);

	if (faltan.length > 0) {
		return json(respuesta, 400, { error: `Faltan campos obligatorios: ${faltan.join(', ')}` });
	}

	const referencia = await generarReferencia();

	// La fecha de alta la pone el servidor, no el formulario: es lo que ordena el
	// catálogo por defecto, con lo último en entrar arriba.
	const completos = { ...datos, reference: referencia, listed_on: hoyEnEspanol() };

	const nombre = `${aSlug([datos.make, datos.model, datos.variant].filter(Boolean).join(' '))}-${referencia}`;
	const ruta = join(COCHES, `${nombre}.txt`);

	await writeFile(ruta, generarTxt(completos, comentario), 'utf8');

	json(respuesta, 200, { referencia, id: nombre, ruta });
}

/** Redimensiona una foto y la sube a R2 como coches/<referencia>/NN.webp */
async function subirFoto(peticion, respuesta, parametros) {
	if (!r2Configurado()) {
		return json(respuesta, 503, {
			error: 'R2 sin configurar. Faltan R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY o R2_BUCKET en el archivo .env',
		});
	}

	const referencia = parametros.get('referencia');
	const indice = Number(parametros.get('indice'));

	if (!referencia || !Number.isInteger(indice) || indice < 1) {
		return json(respuesta, 400, { error: 'Falta la referencia o el índice de la foto' });
	}

	const original = await leerCuerpo(peticion);

	// 1600px basta para la galería a pantalla completa y deja las fotos de móvil
	// en una décima parte: sin esto, cien coches se comen el tramo gratis de R2.
	const optimizada = await sharp(original)
		.rotate()
		.resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
		.webp({ quality: 82 })
		.toBuffer();

	const nombre = String(indice).padStart(2, '0');
	const url = `${urlBucket()}/coches/${referencia}/${nombre}.webp`;

	const subida = await clienteR2().fetch(url, {
		method: 'PUT',
		body: optimizada,
		headers: { 'content-type': 'image/webp' },
	});

	if (!subida.ok) {
		return json(respuesta, 502, { error: `R2 respondió ${subida.status}: ${await subida.text()}` });
	}

	json(respuesta, 200, {
		nombre: `${nombre}.webp`,
		bytesOriginal: original.length,
		bytesSubidos: optimizada.length,
	});
}

/** Nombres de las fotos que hay ahora mismo en R2 para un coche. */
async function fotosEnR2(referencia) {
	if (!r2Configurado() || !referencia) return [];

	const listado = await clienteR2()
		.fetch(`${urlBucket()}?list-type=2&prefix=${encodeURIComponent(`coches/${referencia}/`)}`)
		.catch(() => null);

	if (!listado?.ok) return [];

	const xml = await listado.text();

	return [...xml.matchAll(/<Key>[^<]*\/([^<\/]+)\.webp<\/Key>/g)]
		.map((encontrada) => encontrada[1])
		.sort();
}

/** Fotos de un coche, para pintarlas al editar. */
async function listarFotos(respuesta, parametros) {
	const referencia = parametros.get('referencia');
	const nombres = await fotosEnR2(referencia);

	json(respuesta, 200, {
		fotos: nombres.map((nombre) => ({
			nombre,
			url: `${process.env.PUBLIC_CDN_BASE?.replace(/\/$/, '')}/coches/${referencia}/${nombre}.webp`,
		})),
	});
}

/** Borra una foto suelta. Las demás no se renumeran: el .txt guarda sus nombres. */
async function borrarFoto(respuesta, parametros) {
	const referencia = parametros.get('referencia');
	const nombre = parametros.get('nombre');

	if (!referencia || !nombre) return json(respuesta, 400, { error: 'Falta referencia o nombre' });

	const borrado = await clienteR2()
		.fetch(`${urlBucket()}/coches/${referencia}/${nombre}.webp`, { method: 'DELETE' })
		.catch(() => null);

	if (!borrado?.ok) return json(respuesta, 502, { error: 'R2 no pudo borrar la foto' });

	json(respuesta, 200, { borrada: nombre });
}

/** ¿Hay cambios hechos y sin publicar? Lo consulta el panel para saber si al
 *  cerrar hay que publicar o puede apagarse sin más. */
async function hayPendiente(respuesta) {
	const { stdout: sinGuardar } = await ejecutar(
		'git',
		['status', '--porcelain', 'src/content', 'src/lib/destacados.ts'],
		{ cwd: RAIZ },
	);

	const { stdout: sinEnviar } = await ejecutar('git', ['log', '--oneline', '@{u}..HEAD'], {
		cwd: RAIZ,
	}).catch(() => ({ stdout: '' }));

	const cambios = sinGuardar.trim().split('\n').filter(Boolean).length;
	const commits = sinEnviar.trim().split('\n').filter(Boolean).length;

	json(respuesta, 200, { hay: cambios + commits > 0, cambios, commits });
}

/** Publica: add, commit y push. Devuelve la salida tal cual para poder leerla. */
async function publicar(peticion, respuesta) {
	const { mensaje = 'Nuevo coche desde el panel' } = JSON.parse(
		(await leerCuerpo(peticion)).toString() || '{}',
	);

	try {
		// destacados.ts va en el mismo commit a propósito: vender o borrar un coche
		// destacado lo modifica, y publicar solo el contenido dejaría la lista
		// apuntando a un coche que ya no existe. El build de Cloudflare fallaría.
		await ejecutar('git', ['add', 'src/content', 'src/lib/destacados.ts'], { cwd: RAIZ });

		// Solo lo preparado: `git status` a secas incluiría cambios de código que
		// no tienen nada que ver con dar de alta un coche.
		const { stdout: preparado } = await ejecutar(
			'git',
			['diff', '--cached', '--name-only'],
			{ cwd: RAIZ },
		);

		if (preparado.trim()) {
			await ejecutar('git', ['commit', '-m', mensaje], { cwd: RAIZ });
		}

		// El push va siempre, haya habido commit o no: si un intento anterior
		// guardó pero no llegó a enviar, este lo recupera en vez de dar por
		// bueno un «no hay nada que publicar» con el coche sin publicar.
		const { stdout: sinEnviar } = await ejecutar(
			'git',
			['log', '--oneline', '@{u}..HEAD'],
			{ cwd: RAIZ },
		).catch(() => ({ stdout: 'sin rama de seguimiento' }));

		if (!preparado.trim() && !sinEnviar.trim()) {
			return json(respuesta, 200, { publicado: false, detalle: 'No había nada que publicar' });
		}

		const { stdout, stderr } = await ejecutar('git', ['push'], { cwd: RAIZ });

		json(respuesta, 200, { publicado: true, detalle: (stdout + stderr).trim() });
	} catch (error) {
		const detalle = error.stderr?.trim() || error.message;

		// El coche ya está guardado en el ordenador aunque el envío falle; hay que
		// decirlo, porque si no la sensación es que se ha perdido el trabajo.
		json(respuesta, 500, {
			error: `El coche está guardado en este ordenador, pero no se pudo enviar a la web.\n\n${detalle}`,
		});
	}
}

/** Nombre de archivo a partir de los datos, con la referencia al final. */
const nombreDeArchivo = (datos) =>
	`${aSlug([datos.make, datos.model, datos.variant].filter(Boolean).join(' '))}-${datos.reference}`;

/** Lee un .txt de coche y devuelve sus datos ya parseados. */
async function leerEntrada(carpeta, id) {
	const ruta = join(carpeta, `${id}.txt`);
	const { datos, comentario } = parsearTxt(await readFile(ruta, 'utf8'));
	return { ruta, datos, comentario };
}

// Tolera la anotación de tipo: cuando la lista se queda vacía el archivo pasa a
// `DESTACADOS: string[] = []`, y un patrón más estricto dejaba de encontrarla y
// se limitaba a no escribir nada, sin avisar.
const ARRAY_DESTACADOS = /(export const DESTACADOS[^=]*=\s*\[)([\s\S]*?)(\];)/;

/** Ids de la lista de destacados, en el orden en que salen en el carrusel. */
async function leerDestacados() {
	const texto = await readFile(DESTACADOS, 'utf8').catch(() => '');
	const bloque = texto.match(ARRAY_DESTACADOS);

	return bloque ? [...bloque[2].matchAll(/'([^']+)'/g)].map((linea) => linea[1]) : [];
}

/** Reescribe solo el array, respetando el comentario de cabecera del archivo. */
async function escribirDestacados(ids) {
	const texto = await readFile(DESTACADOS, 'utf8');

	if (!ARRAY_DESTACADOS.test(texto)) {
		throw new Error('No se encontró la lista DESTACADOS en src/lib/destacados.ts');
	}

	const cuerpo = ids.map((id) => `\t'${id}',`).join('\n');

	await writeFile(
		DESTACADOS,
		texto.replace(ARRAY_DESTACADOS, (_, inicio, __, fin) =>
			ids.length > 0 ? `${inicio}\n${cuerpo}\n${fin}` : `${inicio}${fin}`,
		),
		'utf8',
	);
}

/**
 * Saca un coche de la lista de destacados.
 *
 * Sin esto, marcar como vendido o eliminar un coche destacado deja una
 * referencia rota en src/lib/destacados.ts y el build falla entero: la web se
 * quedaría sin actualizar y quien usa el panel no tendría forma de saber por qué.
 */
async function quitarDeDestacados(id) {
	const actuales = await leerDestacados();
	if (!actuales.includes(id)) return;

	await escribirDestacados(actuales.filter((otro) => otro !== id));
}

const clienteR2 = () =>
	new AwsClient({
		accessKeyId: R2.clave,
		secretAccessKey: R2.secreto,
		service: 's3',
		region: 'auto',
	});

const urlBucket = () => `https://${R2.cuenta}.r2.cloudflarestorage.com/${R2.bucket}`;

/**
 * Borra todas las fotos del coche en R2.
 *
 * Se le pregunta a R2 qué hay bajo la carpeta en vez de deducirlo del contador
 * del archivo: si ese número está mal, o alguien subió fotos aparte, borrar
 * `01..N` dejaría huérfanas las demás ocupando espacio para siempre.
 */
async function borrarFotos(referencia) {
	if (!r2Configurado() || !referencia) return { borradas: 0, configurado: r2Configurado() };

	const cliente = clienteR2();
	const prefijo = `coches/${referencia}/`;

	const listado = await cliente
		.fetch(`${urlBucket()}?list-type=2&prefix=${encodeURIComponent(prefijo)}`)
		.catch(() => null);

	if (!listado?.ok) return { borradas: 0, configurado: true, error: 'No se pudo listar en R2' };

	const xml = await listado.text();
	const claves = [...xml.matchAll(/<Key>([^<]+)<\/Key>/g)].map((encontrada) => encontrada[1]);

	let borradas = 0;

	for (const clave of claves) {
		const respuesta = await cliente
			.fetch(`${urlBucket()}/${clave}`, { method: 'DELETE' })
			.catch(() => null);

		if (respuesta?.ok) borradas++;
	}

	return { borradas, configurado: true };
}

/** Coches de una carpeta, para las pantallas de listado. */
async function listarDe(carpeta) {
	let entradas = [];
	try {
		entradas = await readdir(carpeta, { withFileTypes: true });
	} catch {
		return [];
	}

	const coches = [];

	for (const entrada of entradas) {
		if (!entrada.isFile() || !entrada.name.endsWith('.txt')) continue;

		const id = entrada.name.replace(/\.txt$/, '');
		const { datos } = await leerEntrada(carpeta, id);

		coches.push({
			id,
			titulo: [datos.make, datos.model, datos.variant].filter(Boolean).join(' '),
			referencia: datos.reference ?? '',
			precio: datos.price_eur ?? '',
			fotos: nombresDeFotos(datos.images).length,
		});
	}

	return coches.sort((a, b) => a.titulo.localeCompare(b.titulo));
}

/** Devuelve un coche para rellenar el formulario de edición. */
async function obtenerCoche(respuesta, id) {
	const { datos, comentario } = await leerEntrada(COCHES, id);
	json(respuesta, 200, { datos, comentario });
}

/** Reemplaza el .txt. Si cambia marca, modelo o versión, el archivo se renombra
 *  para que su nombre siga cuadrando con la URL, que sale de esos mismos datos. */
async function actualizarCoche(peticion, respuesta, id) {
	const { datos = {}, comentario = '' } = JSON.parse(await leerCuerpo(peticion));
	const anterior = await leerEntrada(COCHES, id);

	// La referencia no se toca nunca: es lo que el cliente tiene apuntado. Y si el
	// formulario no manda fotos se conservan las de antes, porque editar el
	// nombre de un coche no debería vaciarle la galería.
	const completos = {
		...datos,
		reference: anterior.datos.reference,
		images: datos.images ?? anterior.datos.images,
		// Automáticos los dos: el formulario no los manda, así que hay que
		// arrastrarlos a mano o se pierden en cada guardado.
		listed_on: anterior.datos.listed_on,
	};
	const nuevoId = nombreDeArchivo(completos);

	await writeFile(join(COCHES, `${nuevoId}.txt`), generarTxt(completos, comentario), 'utf8');

	if (nuevoId !== id) {
		await rm(anterior.ruta);
		await quitarDeDestacados(id);
	}

	json(respuesta, 200, { id: nuevoId, renombrado: nuevoId !== id });
}

/** Mueve el coche a vendidos. Las fotos se quedan: su ficha sigue publicada. */
/** Escribe o quita la línea `Vendido:` sin tocar nada más del archivo.
 *
 *  Se edita el texto a mano en vez de volver a generarlo con `generarTxt`:
 *  regenerar pasa el archivo entero por el parser y cualquier campo que este no
 *  reconozca se perdería por el camino. */
function conFechaDeVenta(texto, fecha) {
	const limpio = texto.replace(/^Vendido:.*\n?/m, '');
	if (!fecha) return limpio;

	const corte = limpio.search(/^Comentario:/m);
	const linea = `Vendido: ${fecha}`;

	return corte === -1
		? `${limpio.trimEnd()}\n${linea}\n`
		: `${limpio.slice(0, corte).trimEnd()}\n${linea}\n\n${limpio.slice(corte)}`;
}

const hoyEnEspanol = () => {
	const hoy = new Date();
	return [
		String(hoy.getDate()).padStart(2, '0'),
		String(hoy.getMonth() + 1).padStart(2, '0'),
		hoy.getFullYear(),
	].join('/');
};

async function marcarVendido(respuesta, id) {
	const origen = join(COCHES, `${id}.txt`);

	// Se sella la fecha: es lo que ordena la página de vendidos, los últimos
	// arriba. Sin ella el coche se iría al final de la lista.
	const texto = await readFile(origen, 'utf8');
	await writeFile(join(VENDIDOS, `${id}.txt`), conFechaDeVenta(texto, hoyEnEspanol()), 'utf8');
	await rm(origen);

	await quitarDeDestacados(id);

	json(respuesta, 200, { vendido: true, id });
}

/** Lo contrario: vuelve al catálogo. Útil cuando una venta se cae, o cuando se
 *  marcó vendido por error. Las fotos nunca se movieron, así que no hay nada
 *  que reponer en R2. */
async function devolverAlCatalogo(respuesta, id) {
	const origen = join(VENDIDOS, `${id}.txt`);

	// Se le quita la fecha de venta: vuelve a estar a la venta.
	const texto = await readFile(origen, 'utf8');
	await writeFile(join(COCHES, `${id}.txt`), conFechaDeVenta(texto, null), 'utf8');
	await rm(origen);

	json(respuesta, 200, { devuelto: true, id });
}

/** Borra el coche y, si se puede, sus fotos de R2. */
async function eliminarCoche(respuesta, id, carpeta = COCHES) {
	const entrada = await leerEntrada(carpeta, id).catch(() => null);

	if (!entrada) return json(respuesta, 404, { error: `No se encontró ${id}` });

	await rm(entrada.ruta);
	await quitarDeDestacados(id);

	const fotos = await borrarFotos(String(entrada.datos.reference ?? ''));

	json(respuesta, 200, { eliminado: true, fotos });
}

/** Destacados actuales y candidatos, para la pantalla de destacados. */
async function pantallaDestacados(respuesta) {
	const ids = await leerDestacados();
	const coches = await listarDe(COCHES);

	const porId = new Map(coches.map((coche) => [coche.id, coche]));

	json(respuesta, 200, {
		// El orden de la lista es el del carrusel, así que se respeta tal cual.
		destacados: ids.map((id) => porId.get(id) ?? { id, titulo: id, referencia: '', perdido: true }),
		candidatos: coches.filter((coche) => !ids.includes(coche.id)),
	});
}

async function anadirDestacado(respuesta, id) {
	const actuales = await leerDestacados();
	if (!actuales.includes(id)) await escribirDestacados([...actuales, id]);

	json(respuesta, 200, { destacado: true, id });
}

// --- Servidor --------------------------------------------------------------

const servidor = createServer(async (peticion, respuesta) => {
	const url = new URL(peticion.url, `http://localhost:${PUERTO}`);

	try {
		if (peticion.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
			const pagina = await readFile(join(AQUI, 'panel.html'));
			respuesta.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
			return respuesta.end(pagina);
		}

		// El formulario se dibuja a partir de la misma lista que parsea los .txt,
		// así que no hay dos sitios donde añadir un campo.
		if (peticion.method === 'GET' && url.pathname === '/api/campos') {
			return json(respuesta, 200, { campos: CAMPOS, r2: r2Configurado() });
		}

		if (peticion.method === 'POST' && url.pathname === '/api/coche') {
			return await altaCoche(peticion, respuesta);
		}

		if (peticion.method === 'GET' && url.pathname === '/api/coches') {
			return json(respuesta, 200, { coches: await listarDe(COCHES) });
		}

		if (peticion.method === 'GET' && url.pathname === '/api/vendidos') {
			return json(respuesta, 200, { coches: await listarDe(VENDIDOS) });
		}

		const deVendido = url.pathname.match(/^\/api\/vendido\/([^/]+?)(\/devolver)?$/);

		if (deVendido) {
			const id = decodeURIComponent(deVendido[1]);

			if (peticion.method === 'DELETE') return await eliminarCoche(respuesta, id, VENDIDOS);
			if (peticion.method === 'POST' && deVendido[2]) return await devolverAlCatalogo(respuesta, id);
		}

		if (peticion.method === 'GET' && url.pathname === '/api/destacados') {
			return await pantallaDestacados(respuesta);
		}

		const deDestacado = url.pathname.match(/^\/api\/destacados\/([^/]+)$/);

		if (deDestacado) {
			const id = decodeURIComponent(deDestacado[1]);

			if (peticion.method === 'POST') return await anadirDestacado(respuesta, id);

			if (peticion.method === 'DELETE') {
				await quitarDeDestacados(id);
				return json(respuesta, 200, { quitado: true, id });
			}
		}

		const deCoche = url.pathname.match(/^\/api\/coche\/([^/]+?)(\/vendido)?$/);

		if (deCoche) {
			const id = decodeURIComponent(deCoche[1]);

			if (peticion.method === 'GET') return await obtenerCoche(respuesta, id);
			if (peticion.method === 'PUT') return await actualizarCoche(peticion, respuesta, id);
			if (peticion.method === 'DELETE') return await eliminarCoche(respuesta, id);
			if (peticion.method === 'POST' && deCoche[2]) return await marcarVendido(respuesta, id);
		}

		if (url.pathname === '/api/fotos') {
			if (peticion.method === 'POST') return await subirFoto(peticion, respuesta, url.searchParams);
			if (peticion.method === 'GET') return await listarFotos(respuesta, url.searchParams);
			if (peticion.method === 'DELETE') return await borrarFoto(respuesta, url.searchParams);
		}

		if (peticion.method === 'GET' && url.pathname === '/api/pendiente') {
			return await hayPendiente(respuesta);
		}

		if (peticion.method === 'POST' && url.pathname === '/api/publicar') {
			return await publicar(peticion, respuesta);
		}

		if (peticion.method === 'POST' && url.pathname === '/api/apagar') {
			json(respuesta, 200, { adios: true });
			return setTimeout(() => process.exit(0), 100);
		}

		json(respuesta, 404, { error: 'No existe' });
	} catch (error) {
		json(respuesta, 500, { error: error.message });
	}
});

// Solo localhost: el panel no debe ser accesible desde la red.
servidor.listen(PUERTO, '127.0.0.1', () => {
	console.log(`\n  Panel abierto en http://localhost:${PUERTO}`);
	console.log(r2Configurado() ? '  R2 configurado.' : '  R2 SIN configurar: las fotos fallarán.');
	console.log('\n  Para cerrar: el botón del panel, o esta ventana.\n');
});
