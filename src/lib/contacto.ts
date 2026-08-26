/** Datos de contacto del negocio. Un solo sitio: los usan la portada y el footer. */
export const CONTACTO = {
	/** Fijo de la tienda. `tel` es lo que marca el móvil al pulsar. */
	telefono: { texto: '649 96 31 31', tel: '+34649963131' },
	whatsapp: { texto: '649 96 31 31', numero: '34649963131' },
	direccion: 'Isla de Sumatra Nº 36, 28034 Madrid',
	horario: 'Todos los días de 8:00 a 21:00',
};

export const WHATSAPP_ENLACE = `https://wa.me/${CONTACTO.whatsapp.numero}`;

export const REDES = [
	{ nombre: 'Instagram', href: '#', icono: '/logos/instagram-icon.svg' },
	{ nombre: 'WhatsApp', href: WHATSAPP_ENLACE, icono: '/logos/whatsapp-icon.svg' },
];

/** Enlace al mapa incrustado. No necesita clave de API. */
export const MAPA_EMBED = `https://www.google.com/maps?q=${encodeURIComponent(CONTACTO.direccion)}&output=embed`;
