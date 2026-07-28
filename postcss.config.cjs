/**
 * PostCSS for the adopted Media workspace.
 *
 * Vite auto-discovers this file for the whole renderer, so it is deliberately minimal.
 * `tailwindcss` only emits anything into a stylesheet that actually contains `@tailwind`
 * directives — today that is exactly one file, src/media/mediaWorkspace.css — so every
 * pre-existing Study OS stylesheet passes through untouched apart from autoprefixer's
 * vendor prefixes.
 */
module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
