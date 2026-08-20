export const MODULE_ID = "gt-warbands";
export const LEGACY_MODULE_ID = "ds-monster-defenses";
export const DEFENSES_FLAG = "monsterDefenses";
export const MIGRATION_SETTING = "monsterDefensesMigrationVersion";
export const MIGRATION_VERSION = 1;

export const PHYSICAL_ABILITIES = Object.freeze(["any", "str", "dex"]);
export const SPELL_ABILITIES = Object.freeze(["any", "int", "wis", "cha"]);
export const DEFENSE_MODES = Object.freeze(["normal", "resistant", "immune", "override"]);

export const DEFAULT_DEFENSES = Object.freeze({
  nonmagical: Object.freeze({ mode: "normal", override: 1, attackAbility: "any" }),
  spell: Object.freeze({ enabled: false, dc: 15, castingAbility: "any" })
});

export function standaloneMonsterDefensesActive() {
  return Boolean(game.modules.get(LEGACY_MODULE_ID)?.active);
}

export function monsterDefensesEnabled() {
  try { return Boolean(game.settings.get(MODULE_ID, "enableMonsterDefenses")); }
  catch (_error) { return false; }
}

export function toInteger(value, fallback, minimum = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(minimum, Math.floor(number)) : fallback;
}

export function normalizeAbility(value, allowed, fallback = "any") {
  const key = String(value ?? "").trim().toLowerCase();
  return allowed.includes(key) ? key : fallback;
}

export function normalizeDefenses(value) {
  const stored = value && typeof value === "object" ? value : {};
  return {
    nonmagical: {
      mode: DEFENSE_MODES.includes(stored.nonmagical?.mode) ? stored.nonmagical.mode : DEFAULT_DEFENSES.nonmagical.mode,
      override: toInteger(stored.nonmagical?.override, DEFAULT_DEFENSES.nonmagical.override, 0),
      attackAbility: normalizeAbility(stored.nonmagical?.attackAbility, PHYSICAL_ABILITIES)
    },
    spell: {
      enabled: stored.spell?.enabled === true,
      dc: toInteger(stored.spell?.dc, DEFAULT_DEFENSES.spell.dc, 1),
      castingAbility: normalizeAbility(stored.spell?.castingAbility, SPELL_ABILITIES)
    }
  };
}

export function getLegacyDefenses(actor) {
  return actor?.flags?.[LEGACY_MODULE_ID]?.defenses;
}

export function getDefenses(actor, { authoritative = true } = {}) {
  if (authoritative && standaloneMonsterDefensesActive()) return normalizeDefenses(getLegacyDefenses(actor));
  const owned = actor?.getFlag?.(MODULE_ID, DEFENSES_FLAG);
  return normalizeDefenses(owned ?? getLegacyDefenses(actor));
}

export async function saveDefenses(actor, defenses) {
  const normalized = normalizeDefenses(defenses);
  if (standaloneMonsterDefensesActive()) await actor.setFlag(LEGACY_MODULE_ID, "defenses", normalized);
  else await actor.setFlag(MODULE_ID, DEFENSES_FLAG, normalized);
  return normalized;
}

export async function migrateActorDefenses(actor) {
  if (!actor || actor.type !== "NPC" || actor.getFlag(MODULE_ID, DEFENSES_FLAG) !== undefined) return false;
  const legacy = getLegacyDefenses(actor);
  if (legacy === undefined) return false;
  await actor.setFlag(MODULE_ID, DEFENSES_FLAG, normalizeDefenses(legacy));
  return true;
}

export function documentFromUuidSync(uuid) {
  if (!uuid) return null;
  try { return globalThis.fromUuidSync?.(uuid) ?? null; }
  catch (error) {
    console.warn(`${MODULE_ID} | Could not resolve UUID ${uuid}.`, error);
    return null;
  }
}

export function actorFromUuid(uuid) {
  const document = documentFromUuidSync(uuid);
  if (document?.documentName === "Actor") return document;
  return document?.actor ?? null;
}

export function targetNpcFromConfig(config) {
  const actor = actorFromUuid(config?.targetUuid);
  return actor?.type === "NPC" ? actor : null;
}

export function appendTooltip(rollConfig, text) {
  if (!rollConfig) return;
  rollConfig.tooltips = rollConfig.tooltips ? `${rollConfig.tooltips}, ${text}` : text;
}

export function appendMessage(config, text) {
  config.messages ??= {};
  config.messages.any ??= [];
  if (!config.messages.any.includes(text)) config.messages.any.push(text);
}

export function ensureDefenseMeta(config) {
  config.gtWarbands ??= {};
  config.gtWarbands.monsterDefenses ??= {};
  return config.gtWarbands.monsterDefenses;
}
