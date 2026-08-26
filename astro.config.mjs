// @ts-check
import { defineConfig } from 'astro/config';

import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
export default defineConfig({
  // Necesario para las URL absolutas: canónicas, Open Graph y sitemap.xml.
  // Sin esto Astro.site es undefined y Google indexa las páginas sueltas sin
  // saber cuál es la dirección buena.
  site: 'https://autoclubtrackdays.com',

  vite: {
    plugins: [tailwindcss()]
  }
});
