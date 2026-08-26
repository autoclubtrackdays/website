/** Datos de contacto del negocio. Un solo sitio: los usan la portada y el footer. */
export const CONTACTO = {
	/** Fijo de la tienda. `tel` es lo que marca el móvil al pulsar. */
	telefono: { texto: '649 96 31 31', tel: '+34649963131' },
	whatsapp: { texto: '649 96 31 31', numero: '34649963131' },
	direccion: 'Isla de Sumatra Nº 36, 28034 Madrid',
	horario: 'Todos los días de 8:00 a 21:00',
};

/**
 * Datos de la sociedad, distintos de los de la tienda.
 *
 * El domicilio social no es donde se atiende al público, pero es el que figura
 * en el registro mercantil y el que repiten Iberinform, eInforma y compañía. Se
 * declara en el aviso legal, junto al CIF, para que quede claro que la web y esa
 * sociedad son lo mismo: es lo que Google necesita para no tratarlos como dos
 * negocios distintos.
 */
export const EMPRESA = {
	razonSocial: 'Autoclub Trackdays S.L.',
	cif: 'B42771279',
	domicilioSocial: "Calle O'Donnell 4, 1º 12, 28009 Madrid",
};

/** Coordenadas de la tienda, para el `geo` de la ficha del negocio.
 *  Salen de los propios anuncios de Wallapop, que las dan sin aproximar. */
export const COORDENADAS = { latitud: 40.4951488, longitud: -3.6861293 };

export const WHATSAPP_ENLACE = `https://wa.me/${CONTACTO.whatsapp.numero}`;

/**
 * Perfiles del negocio en otros sitios.
 *
 * Van al `sameAs` del JSON-LD, que es como Google ata la web a cada perfil. Hoy
 * esas páginas salen en la búsqueda en lugar de la web, así que enlazarlas en
 * los dos sentidos es lo que hace que Google entienda que es el mismo negocio.
 *
 * Los que están en blanco se descartan solos, así que se pueden ir rellenando
 * de uno en uno sin romper nada.
 */
export const PERFILES = {
	instagram: 'https://www.instagram.com/autoclub.trackdays/',
	wallapop: 'https://es.wallapop.com/user/demottaj-29191797',
	milanuncios:
		'https://www.milanuncios.com/tiendas-profesionales/autoclub-trackdays-s.l.-225387',
	autoscout24: 'https://www.autoscout24.es/profesionales/autoclub-trackdays',
	// coches.net publica los anuncios pero no da página de perfil propia: el
	// enlace que sale en el buscador acaba en su directorio general, así que no
	// hay nada que declarar aquí.
	cochesNet: '',
};

/** Los perfiles que ya tienen dirección, en el formato que espera schema.org. */
export const MISMO_QUE = Object.values(PERFILES).filter(Boolean);

// Instagram solo se pinta cuando hay perfil: un icono que lleva a '#' es un
// enlace muerto en todas las páginas del sitio.
export const REDES = [
	...(PERFILES.instagram
		? [{ nombre: 'Instagram', href: PERFILES.instagram, icono: '/logos/instagram-icon.svg' }]
		: []),
	{ nombre: 'WhatsApp', href: WHATSAPP_ENLACE, icono: '/logos/whatsapp-icon.svg' },
];

/** Enlace al mapa incrustado. No necesita clave de API. */
export const MAPA_EMBED = `https://www.google.com/maps?q=${encodeURIComponent(CONTACTO.direccion)}&output=embed`;

/** Ficha del sitio en Google Maps, para el `hasMap` de la ficha del negocio. */
export const MAPA_ENLACE = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(CONTACTO.direccion)}`;
