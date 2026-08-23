/** Datos de contacto del negocio. Un solo sitio: los usan la portada y el footer. */
export const CONTACTO = {
	/** Fijo de la tienda. `tel` es lo que marca el móvil al pulsar. */
	telefono: { texto: '919 379 322', tel: '+34919379322' },
	/** Móvil de WhatsApp. PENDIENTE DE CONFIRMAR: es el que estuvo un rato en el header. */
	whatsapp: { texto: '625 390 963', numero: '34625390963' },
	/** PLACEHOLDER: cambiar por el correo real. */
	email: 'info@autoclubtrackdays.com',
	direccion: 'Isla de Sumatra Nº 36, 28034 Madrid',
	/** PLACEHOLDER: horario inventado, confirmar antes de publicar. */
	horario: [
		{ dias: 'Lunes a viernes', horas: '09:30 – 14:00 · 16:30 – 20:00' },
		{ dias: 'Sábados', horas: '10:00 – 14:00' },
		{ dias: 'Domingos', horas: 'Cerrado' },
	],
};

/** Enlace al mapa incrustado. No necesita clave de API. */
export const MAPA_EMBED = `https://www.google.com/maps?q=${encodeURIComponent(CONTACTO.direccion)}&output=embed`;

/** Enlace para abrir la ficha en Google Maps y tirar de navegador. */
export const MAPA_ENLACE = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(CONTACTO.direccion)}`;
