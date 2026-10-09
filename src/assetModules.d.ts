// Vite resolves these imports at build time; this tells TypeScript what they
// evaluate to so side-effect CSS imports and bundled image URLs type-check.
declare module '*.css';
// `?inline` CSS is the compiled sheet as a string (theme/themeSheets.ts injects
// it into an ordered slot instead of letting Vite append a <link>).
declare module '*.css?inline' {
  const css: string;
  export default css;
}
declare module '*.png' {
  const url: string;
  export default url;
}
