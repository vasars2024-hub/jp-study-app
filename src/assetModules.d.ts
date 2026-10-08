// Vite resolves these imports at build time; this tells TypeScript what they
// evaluate to so side-effect CSS imports and bundled image URLs type-check.
declare module '*.css';
declare module '*.png' {
  const url: string;
  export default url;
}
