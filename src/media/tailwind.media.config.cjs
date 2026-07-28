/**
 * Stylesheet-local Tailwind config for src/media/mediaWorkspace.css.
 *
 * The root config mirrors pinned Seanime. Its forms plugin emits component selectors such
 * as `.form-input` without applying `important: "#media-workspace"`, which lets 26 rules
 * escape the Media workspace. This derived config removes only that plugin; equivalent
 * scoped rules live beside the Tailwind directives in mediaWorkspace.css.
 */
const path = require('node:path');
const createJiti = require('jiti');

const load = createJiti(__filename);
const rootConfig = load(path.resolve(__dirname, '../../tailwind.config.ts')).default;
const plugins = [...rootConfig.plugins];
const formsPlugin = plugins[1];

if (
  typeof formsPlugin !== 'function' ||
  !String(formsPlugin.__pluginFunction).includes('resolveChevronColor')
) {
  throw new Error('Tailwind forms plugin moved; re-check Media workspace containment');
}

plugins.splice(1, 1);

module.exports = {
  ...rootConfig,
  plugins,
};
