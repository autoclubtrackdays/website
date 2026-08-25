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
import { readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { AwsClient } from 'aws4fetch';
import sharp from 'sharp';
import { CAMPOS, generarTxt, parsearTxt } from '../lib/formato-txt.mjs';

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

	const faltan = ['make', 'variant', 'price_eur', 'mileage_km', 'first_registration'].filter(
		(clave) => datos[clave] === undefined || datos[clave] === '',
	);

	if (faltan.length > 0) {
		return json(respuesta, 400, { error: `Faltan campos obligatorios: ${faltan.join(', ')}` });
	}

	const referencia = await generarReferencia();
	const completos = { ...datos, reference: referencia };

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

	if (!referencia || !Number.isInteger(indice)) {
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

	const cliente = new AwsClient({
		accessKeyId: R2.clave,
		secretAccessKey: R2.secreto,
		service: 's3',
		region: 'auto',
	});

	const nombre = String(indice).padStart(2, '0');
	const url = `https://${R2.cuenta}.r2.cloudflarestorage.com/${R2.bucket}/coches/${referencia}/${nombre}.webp`;

	const subida = await cliente.fetch(url, {
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

/** Publica: add, commit y push. Devuelve la salida tal cual para poder leerla. */
async function publicar(peticion, respuesta) {
	const { mensaje = 'Nuevo coche desde el panel' } = JSON.parse(
		(await leerCuerpo(peticion)).toString() || '{}',
	);

	try {
		await ejecutar('git', ['add', 'src/content'], { cwd: RAIZ });

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

/**
 * Saca un coche de la lista de destacados.
 *
 * Sin esto, marcar como vendido o eliminar un coche destacado deja una
 * referencia rota en src/lib/destacados.ts y el build falla entero: la web se
 * quedaría sin actualizar y quien usa el panel no tendría forma de saber por qué.
 */
async function quitarDeDestacados(id) {
	try {
		const original = await readFile(DESTACADOS, 'utf8');
		const limpio = original
			.split('\n')
			.filter((linea) => !linea.includes(`'${id}'`))
			.join('\n');

		if (limpio !== original) await writeFile(DESTACADOS, limpio, 'utf8');
	} catch {
		// Si el archivo no existe, no hay nada que limpiar.
	}
}

/** Borra las fotos del coche en R2. Best effort: no se para el borrado por esto. */
async function borrarFotos(referencia, cuantas) {
	if (!r2Configurado() || !referencia || !cuantas) return 0;

	const cliente = new AwsClient({
		accessKeyId: R2.clave,
		secretAccessKey: R2.secreto,
		service: 's3',
		region: 'auto',
	});

	let borradas = 0;

	for (let indice = 1; indice <= cuantas; indice++) {
		const nombre = String(indice).padStart(2, '0');
		const url = `https://${R2.cuenta}.r2.cloudflarestorage.com/${R2.bucket}/coches/${referencia}/${nombre}.webp`;
		const respuesta = await cliente.fetch(url, { method: 'DELETE' }).catch(() => null);
		if (respuesta?.ok) borradas++;
	}

	return borradas;
}

/** Lista lo que hay en venta, para la pantalla de edición. */
async function listarCoches(respuesta) {
	let entradas = [];
	try {
		entradas = await readdir(COCHES, { withFileTypes: true });
	} catch {
		return json(respuesta, 200, { coches: [] });
	}

	const coches = [];

	for (const entrada of entradas) {
		if (entrada.isFile() && entrada.name.endsWith('.txt')) {
			const id = entrada.name.replace(/\.txt$/, '');
			const { datos } = await leerEntrada(COCHES, id);

			coches.push({
				id,
				editable: true,
				titulo: [datos.make, datos.model, datos.variant].filter(Boolean).join(' '),
				referencia: datos.reference ?? '',
				precio: datos.price_eur ?? '',
				fotos: datos.images ?? 0,
			});
			continue;
		}

		// Entradas del volcado antiguo: se pueden vender o borrar, pero no editar
		// desde aquí, porque su formato es otro.
		if (entrada.isDirectory()) {
			const md = join(COCHES, entrada.name, `${entrada.name}.md`);
			const contenido = await readFile(md, 'utf8').catch(() => '');
			const dato = (clave) => contenido.match(new RegExp(`^${clave}: *"?(.+?)"?$`, 'm'))?.[1] ?? '';

			coches.push({
				id: entrada.name,
				editable: false,
				titulo: dato('title'),
				referencia: dato('reference'),
				precio: dato('price_eur'),
				fotos: Number(dato('images')) || 0,
			});
		}
	}

	coches.sort((a, b) => a.titulo.localeCompare(b.titulo));
	json(respuesta, 200, { coches });
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

	// La referencia no se toca nunca: es lo que el cliente tiene apuntado.
	const completos = { ...datos, reference: anterior.datos.reference };
	const nuevoId = nombreDeArchivo(completos);

	await writeFile(join(COCHES, `${nuevoId}.txt`), generarTxt(completos, comentario), 'utf8');

	if (nuevoId !== id) {
		await rm(anterior.ruta);
		await quitarDeDestacados(id);
	}

	json(respuesta, 200, { id: nuevoId, renombrado: nuevoId !== id });
}

/** Mueve el coche a vendidos. Las fotos se quedan: su ficha sigue publicada. */
async function marcarVendido(respuesta, id) {
	const esTxt = await readFile(join(COCHES, `${id}.txt`), 'utf8').then(
		() => true,
		() => false,
	);

	const origen = esTxt ? join(COCHES, `${id}.txt`) : join(COCHES, id);
	const destino = esTxt ? join(VENDIDOS, `${id}.txt`) : join(VENDIDOS, id);

	await rename(origen, destino);
	await quitarDeDestacados(id);

	json(respuesta, 200, { vendido: true, id });
}

/** Borra el coche y, si se puede, sus fotos de R2. */
async function eliminarCoche(respuesta, id) {
	let referencia = '';
	let fotos = 0;

	const entrada = await leerEntrada(COCHES, id).catch(() => null);
	if (entrada) {
		referencia = String(entrada.datos.reference ?? '');
		fotos = entrada.datos.images ?? 0;
		await rm(entrada.ruta);
	} else {
		await rm(join(COCHES, id), { recursive: true, force: true });
	}

	await quitarDeDestacados(id);
	const borradas = await borrarFotos(referencia, fotos);

	json(respuesta, 200, { eliminado: true, fotosBorradas: borradas });
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
			return await listarCoches(respuesta);
		}

		const deCoche = url.pathname.match(/^\/api\/coche\/([^/]+?)(\/vendido)?$/);

		if (deCoche) {
			const id = decodeURIComponent(deCoche[1]);

			if (peticion.method === 'GET') return await obtenerCoche(respuesta, id);
			if (peticion.method === 'PUT') return await actualizarCoche(peticion, respuesta, id);
			if (peticion.method === 'DELETE') return await eliminarCoche(respuesta, id);
			if (peticion.method === 'POST' && deCoche[2]) return await marcarVendido(respuesta, id);
		}

		if (peticion.method === 'POST' && url.pathname === '/api/fotos') {
			return await subirFoto(peticion, respuesta, url.searchParams);
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
