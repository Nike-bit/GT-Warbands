const MODULE_ID = "gt-warbands";
export const LANGUAGE_SETTING = "language";
export const FOLLOW_FOUNDRY_LANGUAGE = "follow";

export const LOCALE_DEFINITIONS = Object.freeze([
  { id: "de", name: "Deutsch", path: "lang/de.json" },
  { id: "el", name: "Ελληνικά", path: "lang/el.json" },
  { id: "en", name: "English", path: "lang/en.json" },
  { id: "es", name: "Español", path: "lang/es.json" },
  { id: "fa", name: "فارسی", path: "lang/fa.json" },
  { id: "fr", name: "Français", path: "lang/fr.json" },
  { id: "grc", name: "Ἀρχαία Ἑλληνικά", path: "lang/grc.json" },
  { id: "it", name: "Italiano", path: "lang/it.json" },
  { id: "ja", name: "日本語", path: "lang/ja.json" },
  { id: "la", name: "Latina", path: "lang/la.json" },
  { id: "pl", name: "Polski", path: "lang/pl.json" },
  { id: "pt-BR", name: "Português (Brasil)", path: "lang/pt-BR.json" },
  { id: "ru", name: "Русский", path: "lang/ru.json" },
  { id: "tr", name: "Türkçe", path: "lang/tr.json" },
  { id: "zh-CN", name: "中文", path: "lang/zh-CN.json" }
]);

const LOCALES_BY_ID = new Map(LOCALE_DEFINITIONS.map(locale => [locale.id, locale]));
const localeCache = new Map();
const pendingLocaleLoads = new Map();
let initialized = false;
let activationSequence = 0;
let helperRegistered = false;
let chatHookRegistered = false;

function isModuleKey(key) {
  const text = String(key ?? "");
  return text.startsWith("GTWARBANDS.")
    || text.startsWith("TYPES.Actor.gt-warbands.")
    || text.startsWith("TYPES.Item.gt-warbands.");
}

function foundryLocalize(key) {
  return globalThis.game?.i18n?.localize?.(key) ?? String(key);
}

function canonicalLocale(locale) {
  const requested = String(locale ?? "").trim();
  if (LOCALES_BY_ID.has(requested)) return requested;

  const lowered = requested.toLowerCase();
  const exact = LOCALE_DEFINITIONS.find(entry => entry.id.toLowerCase() === lowered);
  if (exact) return exact.id;

  const base = lowered.split("-")[0];
  const baseMatches = LOCALE_DEFINITIONS.filter(entry => entry.id.toLowerCase().split("-")[0] === base);
  return baseMatches.length === 1 ? baseMatches[0].id : null;
}

export function getLanguagePreference() {
  try {
    const stored = game.settings.get(MODULE_ID, LANGUAGE_SETTING);
    return stored === FOLLOW_FOUNDRY_LANGUAGE
      ? FOLLOW_FOUNDRY_LANGUAGE
      : canonicalLocale(stored) ?? FOLLOW_FOUNDRY_LANGUAGE;
  }
  catch (_error) {
    return FOLLOW_FOUNDRY_LANGUAGE;
  }
}

export function getActiveLocale(preference = getLanguagePreference()) {
  if (preference !== FOLLOW_FOUNDRY_LANGUAGE) return canonicalLocale(preference) ?? "en";
  return canonicalLocale(globalThis.game?.i18n?.lang) ?? "en";
}

function localeUrl(locale) {
  const relative = `modules/${MODULE_ID}/${LOCALES_BY_ID.get(locale).path}`;
  return globalThis.foundry?.utils?.getRoute?.(relative) ?? relative;
}

async function loadLocale(locale) {
  const canonical = canonicalLocale(locale);
  if (!canonical) return null;
  if (localeCache.has(canonical)) return localeCache.get(canonical);
  if (pendingLocaleLoads.has(canonical)) return pendingLocaleLoads.get(canonical);

  const pending = (async () => {
    const response = await fetch(localeUrl(canonical));
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const dictionary = await response.json();
    if (!dictionary || typeof dictionary !== "object" || Array.isArray(dictionary)) {
      throw new Error("Localization file did not contain a JSON object.");
    }
    localeCache.set(canonical, dictionary);
    return dictionary;
  })();

  pendingLocaleLoads.set(canonical, pending);
  try {
    return await pending;
  }
  finally {
    pendingLocaleLoads.delete(canonical);
  }
}

async function loadLocaleSafely(locale) {
  try {
    return await loadLocale(locale);
  }
  catch (error) {
    console.error(`${MODULE_ID} | Failed to load locale ${locale}; English fallback will be used.`, error);
    return null;
  }
}

function lookup(dictionary, key) {
  if (!dictionary || !Object.hasOwn(dictionary, key)) return null;
  const value = dictionary[key];
  return typeof value === "string" ? value : null;
}

export function localize(key) {
  if (!isModuleKey(key)) return foundryLocalize(key);

  const active = getActiveLocale();
  const selected = lookup(localeCache.get(active), key);
  if (selected !== null) return selected;

  const english = lookup(localeCache.get("en"), key);
  if (english !== null) return english;

  if (!initialized) {
    const globalValue = foundryLocalize(key);
    if (globalValue !== key) return globalValue;
  }

  return String(key);
}

export function format(key, data = {}) {
  return localize(key).replace(/\{([^{}]+)\}/g, (match, token) => (
    Object.hasOwn(data, token) ? String(data[token]) : match
  ));
}

function languageChoices() {
  return Object.fromEntries([
    [FOLLOW_FOUNDRY_LANGUAGE, localize("GTWARBANDS.Settings.FollowFoundryLanguage")],
    ...LOCALE_DEFINITIONS.map(locale => [locale.id, locale.name])
  ]);
}

function registerTemplateHelper() {
  if (helperRegistered) return;
  const handlebars = globalThis.Handlebars;
  if (!handlebars?.registerHelper) {
    console.error(`${MODULE_ID} | Handlebars was unavailable; the GT-Warbands localization helper was not registered.`);
    return;
  }

  handlebars.registerHelper("gtwLocalize", (key, options = {}) => {
    const data = options.hash ?? {};
    return Object.keys(data).length ? format(key, data) : localize(key);
  });
  helperRegistered = true;
}

export function localizeChatElements(root) {
  if (!root?.querySelectorAll) return;
  for (const element of root.querySelectorAll(".gt-wb-chat-card [data-gtw-localize]")) {
    const key = element.dataset.gtwLocalize;
    if (isModuleKey(key)) element.textContent = localize(key);
  }
}

function registerChatLocalizationHook() {
  if (chatHookRegistered || !globalThis.Hooks?.on) return;
  Hooks.on("renderChatMessageHTML", (_message, html) => localizeChatElements(html));
  chatHookRegistered = true;
}

function updateRegistryEntry(registry, key, values) {
  const entry = registry?.get?.(`${MODULE_ID}.${key}`);
  if (!entry || typeof entry !== "object") return;
  try {
    Object.assign(entry, values);
  }
  catch (error) {
    console.warn(`${MODULE_ID} | Could not refresh the registered label for ${key}.`, error);
  }
}

function refreshRegisteredLabels() {
  updateRegistryEntry(game.settings.settings, LANGUAGE_SETTING, {
    name: localize("GTWARBANDS.Settings.Language"),
    hint: localize("GTWARBANDS.Settings.LanguageHint"),
    choices: languageChoices()
  });
  updateRegistryEntry(game.settings.settings, "activeProfile", {
    name: localize("GTWARBANDS.Settings.ActiveProfile")
  });
  updateRegistryEntry(game.settings.settings, "customProfile", {
    name: localize("GTWARBANDS.Settings.CustomProfile")
  });
  updateRegistryEntry(game.settings.settings, "enableSkirmishNpcSupport", {
    name: localize("GTWARBANDS.Settings.EnableSkirmishNpcSupport"),
    hint: localize("GTWARBANDS.Settings.EnableSkirmishNpcSupportHint")
  });
  updateRegistryEntry(game.settings.menus, "profileMenu", {
    name: localize("GTWARBANDS.ProfileMenu.Name"),
    label: localize("GTWARBANDS.ProfileMenu.Label"),
    hint: localize("GTWARBANDS.ProfileMenu.Hint")
  });
}

function shouldRerenderApplication(application) {
  if (application?.id === "gt-warbands-profile-config" || application?.options?.id === "gt-warbands-profile-config") {
    return true;
  }

  const actor = application?.actor
    ?? (application?.document?.documentName === "Actor" ? application.document : null);
  if (actor?.documentName === "Actor") {
    if (actor.type === `${MODULE_ID}.warband`) return true;
    if (game.system.id !== "shadowdark" || actor.type !== "NPC") return false;
    try {
      return Boolean(game.settings.get(MODULE_ID, "enableSkirmishNpcSupport"));
    }
    catch (_error) {
      return false;
    }
  }

  const item = application?.item ?? (application?.document?.documentName === "Item" ? application.document : null);
  if (item?.type === `${MODULE_ID}.attack`) return true;
  if (game.system.id !== "shadowdark" || item?.type !== "NPC Attack") return false;
  try {
    return Boolean(game.settings.get(MODULE_ID, "enableSkirmishNpcSupport"))
      && item.parent?.type === "NPC"
      && Boolean(item.parent.getFlag(MODULE_ID, "isSkirmishWarband"));
  }
  catch (_error) {
    return false;
  }
}

function rerenderOpenApplications() {
  for (const application of Object.values(ui.windows ?? {})) {
    if (shouldRerenderApplication(application)) application.render(false);
  }

  const settingsSheet = game.settings.sheet;
  if (settingsSheet?.rendered) settingsSheet.render({ force: false });
  localizeChatElements(globalThis.document);
}

export async function activateLanguage(preference = getLanguagePreference(), { rerender = true } = {}) {
  const sequence = ++activationSequence;
  const active = getActiveLocale(preference);
  await Promise.all([
    loadLocaleSafely("en"),
    active === "en" ? Promise.resolve() : loadLocaleSafely(active)
  ]);

  if (sequence !== activationSequence) return;
  initialized = true;
  refreshRegisteredLabels();
  if (rerender) rerenderOpenApplications();
}

export function registerLocalization() {
  game.settings.register(MODULE_ID, LANGUAGE_SETTING, {
    name: foundryLocalize("GTWARBANDS.Settings.Language"),
    hint: foundryLocalize("GTWARBANDS.Settings.LanguageHint"),
    scope: "client",
    config: true,
    type: String,
    choices: languageChoices(),
    default: FOLLOW_FOUNDRY_LANGUAGE,
    onChange: preference => {
      void activateLanguage(preference).catch(error => {
        console.error(`${MODULE_ID} | Failed to activate the selected module language.`, error);
      });
    }
  });
  registerTemplateHelper();
  registerChatLocalizationHook();
}

export function getLocalizationApi() {
  return {
    LANGUAGE_SETTING,
    FOLLOW_FOUNDRY_LANGUAGE,
    LOCALE_DEFINITIONS,
    getLanguagePreference,
    getActiveLocale,
    localize,
    format,
    localizeChatElements,
    activateLanguage
  };
}
