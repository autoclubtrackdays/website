# Flujo de trabajo

Cómo se da de alta un coche, cómo se marca como vendido y qué hay que tener en cuenta.

Los coches se gestionan **a mano**. No hay panel de administración, ni bot, ni publicación automática
en portales: se decidió así a propósito, porque las alternativas añaden cuota fija y piezas que se
rompen sin avisar.

---

## Alta de un coche

1. **Asignar la referencia.** Es el identificador que acaba en la URL (`/catalogo/bmw-m4-m4a-19903975`)
   y el que el cliente dice por teléfono. Tiene que ser única y **no reutilizarse nunca**, ni siquiera
   cuando el coche se venda.

2. **Crear la carpeta** `src/content/coches/<marca-modelo-version-referencia>/` con un `.md` dentro
   del mismo nombre.

   Cada coche es una carpeta aunque dentro solo haya un archivo. No vale un `.md` suelto: el
   `generateId` de `src/content.config.ts` toma el primer tramo de la ruta, así que un archivo suelto
   daría un id con el `.md` pegado y rompería la URL.

3. **Rellenar el frontmatter.** Obligatorios:

   | Campo | Ejemplo | Nota |
   |---|---|---|
   | `title` | `BMW M4 M4A` | |
   | `make` | `BMW` | Alimenta la cinta de marcas de la portada |
   | `variant` | `M4A` | |
   | `price_eur` | `53800` | Número, sin puntos ni símbolo |
   | `mileage_km` | `70500` | Número |
   | `first_registration` | `11/2017` | **MM/AAAA**, con la barra |
   | `fuel` | `Gasolina` | |
   | `transmission` | `Automático` | |
   | `reference` | `19903975` | La del paso 1 |

   Opcionales, que solo salen en la ficha si están: `model`, `power_kw`, `power_hp`, `body_type`,
   `color`, `doors`, `condition`, `price_formatted`, `listing_id`, `images`, `source_url`.

4. **Escribir el cuerpo** del `.md` con los comentarios del vendedor, en texto normal.

5. **Subir las fotos a R2** en `coches/<id-de-la-carpeta>/01.jpg`, `02.jpg`, `03.jpg`…

   El orden manda: la `01` es la que sale en el catálogo, en el carrusel de destacados y como primera
   de la galería.

6. **Revisar en local** con `npm run dev`. Si falta un campo obligatorio o el formato de la fecha está
   mal, el build no arranca y dice exactamente cuál es el problema.

7. **`git push`**, que dispara la compilación en Cloudflare Pages.

### Para destacarlo en la portada

Añadir su id (el nombre de la carpeta) a la lista de `src/lib/destacados.ts`. El orden de la lista es
el orden del carrusel.

---

## Marcar un coche como vendido

1. **Mover la carpeta** de `src/content/coches/` a `src/content/vendidos/`.

2. **Quitar su línea de `src/lib/destacados.ts`** si estaba destacado. Si se olvida, el build falla
   con «Destacado sin coche»: es una red de seguridad, no un problema.

3. **`git push`**.

**Las fotos no se tocan.** Se quedan en `coches/<id>` dentro de R2 y la ficha las sigue encontrando.

El coche desaparece del catálogo, del carrusel y del contador de la portada, pero **su ficha sigue
viva en la misma URL** con el distintivo de vendido. Eso conserva los enlaces ya compartidos y lo que
Google haya indexado.

---

## Pendiente antes de que el alta contra R2 funcione

Dos incoherencias en `src/lib/coches.ts` que hoy no se ven porque las fotos están en local:

1. **`fotos()` no mira R2.** `portada()` sí tiene su rama con `PUBLIC_CDN_BASE`, pero `fotos()` solo
   recorre el glob de `src/content/coches/*/media/*.jpg`. Con las fotos en R2, la portada saldría bien
   y la galería de la ficha caería al placeholder.

2. **Los nombres no cuadran.** `portada()` pide `01-640.webp` —un archivo redimensionado que en un
   flujo manual nadie va a generar— mientras `fotos()` busca `01.jpg`. Hay que unificar en `01.jpg`.

---

## Cosas que muerden

- **Si tocas `src/content.config.ts`, reinicia el servidor de desarrollo.** El hot reload cubre
  componentes, páginas y entradas, pero no la definición de las colecciones ni los ids, que se
  resuelven al arrancar y quedan cacheados en `.astro/`. Si ves ids raros o entradas fantasma,
  `rm -rf .astro` y arrancar de nuevo.

- **Las fotos no deben entrar en el repositorio.** Van a R2. Lo que se commitea se queda en el
  historial de git para siempre aunque después se borre.

- **El precio del frontmatter es el que se publica.** Sin puntos, sin `€` y sin decimales.
