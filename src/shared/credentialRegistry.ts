/**
 * Every user-facing credential the app can hold, described once.
 *
 * This is a module-level data array, so it cannot call `useT()` — CLAUDE.md
 * i18n rule 7. Every piece of translatable text here is an i18n *key*
 * (`descKey`, `freeTierKey`, `usedByKeys`, each field's `labelKey`), resolved
 * with `t()` at render time by the consumer. A sentence written as a literal
 * here would be invisible to `tools/i18n-check.cjs` and untranslatable forever
 * after. The single exception is `label`, the provider's own proper noun — see
 * the comment on that field for why routing a brand through the catalogs is
 * worse than not.
 *
 * The registry lives in `shared/` rather than beside the vault because both
 * sides need it: main resolves `id` → storage, and the settings page renders
 * the rows. It therefore imports nothing from `main/` or `renderer/`.
 *
 * ## What `store` means, and why it is not always 'vault'
 *
 * Credentials are moving into one encrypted store. This field records the
 * module that still owns each credential's bytes at rest today:
 *
 *   'vault'             — `main/credentials/vault.ts`, `<userData>/credentials.dat`
 *   'malSync'           — a remaining provider-owned legacy store
 *
 * `refusesWhenUnencrypted` is the part that matters to a user. The vault (and
 * the scraper store it shares its policy with) *refuses to write* when the OS
 * cannot encrypt. A remaining legacy store may behave differently. That is a
 * real difference in what a machine without a
 * working keychain does with your API key, so the page surfaces it instead of
 * presenting every row as equally safe.
 */

/** How a credential is obtained, which decides what the row can offer. */
export type CredentialKind =
  /** A key the user pastes in. */
  | 'apiKey'
  /** A browser round-trip; the row links out rather than taking a paste. */
  | 'oauth';

export type CredentialCategory = 'ai' | 'subtitles' | 'reading' | 'sync';

/** Which module holds the bytes at rest. See the file header. */
export type CredentialStore = 'vault' | 'mining' | 'subtitleProviders' | 'malSync';

export interface CredentialField {
  /** Stable field name; the vault keys on `<credentialId>.<name>`. */
  name: string;
  /** i18n key — resolve with t() at render time, never read directly. */
  labelKey: string;
  /** Masked in the UI and never returned to the renderer once stored. */
  secret: boolean;
  /** i18n key for the input placeholder. */
  placeholderKey?: string;
}

export interface CredentialSpec {
  id: string;
  /**
   * The provider's own name, rendered as-is.
   *
   * The one literal in this file, and deliberately not a `labelKey`. "Google
   * Gemini" and "OpenSubtitles" are proper nouns that read identically in all
   * four UI languages — CLAUDE.md i18n rule 4's carve-out for data that is not
   * app chrome. Routing them through the catalogs would add four byte-identical
   * entries per provider, which `tools/i18n-check.cjs` reports as untranslated
   * and which the existing `subtitle.provider.*` brand keys already had to be
   * exempted from. Everything a translator can actually translate — the
   * description, the free-tier note, the field labels — is a key below.
   */
  label: string;
  /** i18n key — resolve with t() at render time, never read directly. */
  descKey: string;
  kind: CredentialKind;
  category: CredentialCategory;
  fields: CredentialField[];
  /**
   * Secret field names stored by main-process flows but never pasted or shown
   * by the generic settings row. OAuth access/refresh tokens are the first use.
   */
  storedSecretFields?: string[];
  /** Where the user gets the key. Opened with `openExternal`, never fetched. */
  signupUrl: string;
  /** i18n key for the free-tier note, shown before the user signs up. */
  freeTierKey?: string;
  /** Whether the row offers a Test button (a real call the owning module makes). */
  testable: boolean;
  /** i18n keys naming what stops working without this credential. */
  usedByKeys: string[];
  store: CredentialStore;
  /**
   * True when the owning store refuses to write rather than downgrading to
   * plaintext on a machine with no OS encryption. False is not a bug in this
   * file — it is an accurate report of a store that still downgrades.
   */
  refusesWhenUnencrypted: boolean;
  /**
   * Settings page that owns the credential's own panel, for a "manage there"
   * link. Only set when a richer surface exists than a key field.
   */
  managedOnPage?: 'study' | 'scraper';
  /**
   * The `SettingsCard` id of that panel, so the Manage link scrolls to and
   * highlights the panel rather than the top of a long page. Same contract the
   * settings-search results already use.
   */
  managedSettingId?: string;
}

/**
 * The credentials that exist in this tree today.
 *
 * Deliberately not the long provider wish-list in
 * `docs/plans/PROFESSIONAL_DICTIONARY_PLAN.md` §0.3. A row here renders a key
 * field that claims a key will be used; adding rows for providers with no
 * client behind them would build exactly the dead surface an audit is supposed
 * to catch. Providers join this list in the phase that adds their client.
 */
export const CREDENTIAL_REGISTRY: CredentialSpec[] = [
  {
    id: 'gemini',
    label: 'Google Gemini',
    descKey: 'credential.gemini.desc',
    kind: 'apiKey',
    category: 'ai',
    fields: [
      {
        name: 'apiKey',
        labelKey: 'credential.field.apiKey',
        secret: true,
        placeholderKey: 'credential.field.apiKey.placeholder',
      },
    ],
    signupUrl: 'https://aistudio.google.com/apikey',
    freeTierKey: 'credential.gemini.freeTier',
    testable: false,
    usedByKeys: ['credential.use.aiMining', 'credential.use.translateAnalysis', 'credential.use.aiOcr'],
    store: 'vault',
    refusesWhenUnencrypted: true,
  },
  {
    id: 'deepseek',
    label: 'DeepSeek',
    descKey: 'credential.deepseek.desc',
    kind: 'apiKey',
    category: 'ai',
    fields: [
      {
        name: 'apiKey',
        labelKey: 'credential.field.apiKey',
        secret: true,
        placeholderKey: 'credential.field.apiKey.placeholder',
      },
    ],
    signupUrl: 'https://platform.deepseek.com/api_keys',
    // No `freeTierKey`: the field states a fact about someone else's pricing,
    // and an unverified one printed in the UI ages badly. Omitted is honest.
    testable: false,
    usedByKeys: ['credential.use.aiMining', 'credential.use.translateAnalysis'],
    store: 'vault',
    refusesWhenUnencrypted: true,
  },
  {
    id: 'jimaku',
    label: 'Jimaku',
    descKey: 'credential.jimaku.desc',
    kind: 'apiKey',
    category: 'subtitles',
    fields: [
      {
        name: 'apiKey',
        labelKey: 'credential.field.apiKey',
        secret: true,
        placeholderKey: 'credential.field.apiKey.placeholder',
      },
    ],
    signupUrl: 'https://jimaku.cc/login',
    freeTierKey: 'credential.jimaku.freeTier',
    testable: true,
    usedByKeys: ['credential.use.subtitleSearch'],
    store: 'vault',
    refusesWhenUnencrypted: true,
  },
  {
    id: 'opensubtitles',
    label: 'OpenSubtitles',
    descKey: 'credential.opensubtitles.desc',
    kind: 'apiKey',
    category: 'subtitles',
    fields: [
      {
        name: 'apiKey',
        labelKey: 'credential.field.apiKey',
        secret: true,
        placeholderKey: 'credential.field.apiKey.placeholder',
      },
    ],
    signupUrl: 'https://www.opensubtitles.com/consumers',
    freeTierKey: 'credential.opensubtitles.freeTier',
    testable: true,
    usedByKeys: ['credential.use.subtitleSearch'],
    store: 'vault',
    refusesWhenUnencrypted: true,
  },
  {
    id: 'jiten',
    label: 'Jiten.moe',
    descKey: 'credential.jiten.desc',
    kind: 'apiKey',
    category: 'reading',
    fields: [
      {
        name: 'apiKey',
        labelKey: 'credential.field.apiKey',
        secret: true,
        placeholderKey: 'credential.field.apiKey.placeholder',
      },
    ],
    signupUrl: 'https://jiten.moe',
    freeTierKey: 'credential.jiten.freeTier',
    testable: false,
    usedByKeys: ['credential.use.jitenDecks'],
    store: 'vault',
    refusesWhenUnencrypted: true,
  },
  {
    id: 'mal',
    label: 'MyAnimeList',
    descKey: 'credential.mal.desc',
    kind: 'oauth',
    category: 'sync',
    fields: [{ name: 'clientId', labelKey: 'credential.field.clientId', secret: false }],
    storedSecretFields: ['accessToken', 'refreshToken'],
    signupUrl: 'https://myanimelist.net/apiconfig',
    testable: false,
    usedByKeys: ['credential.use.malSync'],
    store: 'vault',
    refusesWhenUnencrypted: true,
    // `MalSyncPanel` is mounted only by `ScraperPage.tsx`. This said `study`,
    // so the row's Manage button navigated to a page that does not contain the
    // panel — the same wrong-page routing the settings search had.
    managedOnPage: 'scraper',
    // …and `scraper` is an ADVANCED page, so pointing at it was only half the
    // fix: `SettingsApp`'s bounce-home guard sent a default-mode user straight
    // back to Home. The Manage button routes `{ guided: true }` for that
    // reason; this id is what it then scrolls to. It matches the card in
    // `ScraperPage.tsx` and the `mal-sync` settings-registry entry.
    managedSettingId: 'mal-sync',
  },
];

/** Category rendering order. Categories absent from the registry render nothing. */
export const CREDENTIAL_CATEGORY_ORDER: CredentialCategory[] = ['ai', 'reading', 'subtitles', 'sync'];

const CATEGORY_LABEL_KEYS: Record<CredentialCategory, string> = {
  ai: 'credential.category.ai',
  subtitles: 'credential.category.subtitles',
  reading: 'credential.category.reading',
  sync: 'credential.category.sync',
};

/** i18n key for a category heading — resolve with t() at render time. */
export function credentialCategoryLabelKey(category: CredentialCategory): string {
  return CATEGORY_LABEL_KEYS[category];
}

export function credentialSpec(id: string): CredentialSpec | undefined {
  return CREDENTIAL_REGISTRY.find((entry) => entry.id === id);
}

/** Registry entries in a category, in declaration order. */
export function credentialsInCategory(category: CredentialCategory): CredentialSpec[] {
  return CREDENTIAL_REGISTRY.filter((entry) => entry.category === category);
}

/** Only the categories that actually have entries, in `CREDENTIAL_CATEGORY_ORDER`. */
export function populatedCredentialCategories(): CredentialCategory[] {
  return CREDENTIAL_CATEGORY_ORDER.filter((category) => credentialsInCategory(category).length > 0);
}

/**
 * What the renderer is allowed to know about a stored credential.
 *
 * There is no `value` and there will never be one. The secret is written by the
 * renderer once and read back only inside the main process; a shape with
 * nowhere to put a key is the cheapest way to keep that true.
 */
export interface CredentialStatus {
  id: string;
  /** At least one secret field has a stored value (or an env override supplies one). */
  configured: boolean;
  /** Epoch ms of the last Test, or 0 when never tested. */
  lastTestedAt: number;
  /** Last Test failure text, or '' when the last Test passed or none ran. */
  lastError: string;
  /**
   * The value comes from an environment variable, so the page must not offer to
   * edit or remove it — the vault is not where it lives this session.
   */
  fromEnv?: boolean;
}

/**
 * Environment variable that overrides a credential's field, matching the
 * pattern `malSync.ts` already uses for its client id.
 *
 * `JPSTUDY_KEY_GEMINI` for a credential's primary field, and
 * `JPSTUDY_KEY_MAL_CLIENTID` for a named one. Non-alphanumerics are dropped so
 * an id like `open-subtitles` cannot produce an unusable variable name.
 */
export function credentialEnvVar(id: string, field?: string): string {
  const clean = (value: string): string => value.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  const base = `JPSTUDY_KEY_${clean(id)}`;
  return field ? `${base}_${clean(field)}` : base;
}
