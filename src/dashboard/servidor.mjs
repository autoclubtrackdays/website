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
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { AwsClient } from 'aws4fetch';
import sharp from 'sharp';
import { CAMPOS, generarTxt } from '../lib/formato-txt.mjs';

const ejecutar = promisify(execFile);

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, '..', '..');
const COCHES = join(RAIZ, 'src', 'content', 'coches');
const VENDIDOS = join(RAIZ, 'src', 'content', 'vendidos');

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
