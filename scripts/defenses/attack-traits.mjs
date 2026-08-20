import { localize as L } from "../localization.mjs";
import {
  LEGACY_MODULE_ID,
  MODULE_ID,
  PHYSICAL_ABILITIES,
  actorFromUuid,
  documentFromUuidSync,
  monsterDefensesEnabled,
  normalizeAbility,
  standaloneMonsterDefensesActive
} from "./defense-data.mjs";

const GT_FLAG = "monsterDefenses";
const LEGACY_FLAG = "attackTraits";

function normalizeTraits(value) {
  return {
    magical: value?.magical === true,
    ability: normalizeAbility(value?.ability, PHYSICAL_ABILITIES)
  };
}

export function isNpcAttackItem(item) {
  return item?.type === "NPC Attack" || item?.system?.constructor?.name === "NpcAttackSD";
}

function sourceNamespace() {
  return standaloneMonsterDefensesActive() ? LEGACY_MODULE_ID : MODULE_ID;
}

export function getAttackTraits(item, { authoritative = true } = {}) {
  if (authoritative && standaloneMonsterDefensesActive()) return normalizeTraits(item?.flags?.[LEGACY_MODULE_ID]?.[LEGACY_FLAG]);
  const owned = item?.getFlag?.(MODULE_ID, GT_FLAG)?.attackTraits;
  return normalizeTraits(owned ?? item?.flags?.[LEGACY_MODULE_ID]?.[LEGACY_FLAG]);
}

export async function saveAttackTraits(item, traits) {
  const normalized = normalizeTraits(traits);
  if (sourceNamespace() === MODULE_ID) {
    const state = foundry.utils.deepClone(item.getFlag(MODULE_ID, GT_FLAG) ?? {});
    state.attackTraits = normalized;
    await item.setFlag(MODULE_ID, GT_FLAG, state);
  }
  else await item.setFlag(LEGACY_MODULE_ID, LEGACY_FLAG, normalized);
  return normalized;
}

export async function migrateAttackTraits(item) {
  if (!isNpcAttackItem(item) || item.getFlag(MODULE_ID, GT_FLAG)?.attackTraits !== undefined) return false;
  const legacy = item.flags?.[LEGACY_MODULE_ID]?.[LEGACY_FLAG];
  if (legacy === undefined) return false;
  const state = foundry.utils.deepClone(item.getFlag(MODULE_ID, GT_FLAG) ?? {});
  state.attackTraits = normalizeTraits(legacy);
  await item.setFlag(MODULE_ID, GT_FLAG, state);
  return true;
}

export function attackTraitControlsActive() {
  return monsterDefensesEnabled() || standaloneMonsterDefensesActive();
}

export function getMonsterDefensesSheetContext(item, editable) {
  if (!attackTraitControlsActive()) return { active: false };
  const traits = getAttackTraits(item);
  return {
    active: true,
    editable: Boolean(editable),
    magicalLabel: L("GTWARBANDS.Compatibility.MagicalAttack"),
    magical: traits.magical,
    selectedAbility: traits.ability,
    abilityLabel: L("GTWARBANDS.Compatibility.AttackAbility"),
    abilities: PHYSICAL_ABILITIES.map(value => ({
      value,
      label: L({ any: "GTWARBANDS.Compatibility.Any", str: "GTWARBANDS.Compatibility.Strength", dex: "GTWARBANDS.Compatibility.Dexterity" }[value]),
      selected: traits.ability === value
    }))
  };
}

export function activateMonsterDefensesSheetListeners({ sheet, item, root }) {
  if (!attackTraitControlsActive()) return;
  const editable = Boolean(sheet?.isEditable && item?.isOwner);
  const magical = root.querySelector('[data-gtw-defense-field="magical"]');
  magical?.addEventListener("change", async () => {
    const previous = magical.dataset.gtwPrevious === "true";
    magical.disabled = true;
    try { await saveAttackTraits(item, { ...getAttackTraits(item), magical: magical.checked }); }
    catch (error) {
      magical.checked = previous;
      console.error(`${MODULE_ID} | Failed to update Magical Attack.`, error);
    }
    finally { magical.disabled = !editable; }
  });

  const ability = root.querySelector('[data-gtw-defense-field="ability"]');
  ability?.addEventListener("change", async () => {
    const previous = ability.dataset.gtwPrevious ?? "any";
    ability.disabled = true;
    try { await saveAttackTraits(item, { ...getAttackTraits(item), ability: ability.value }); }
    catch (error) {
      ability.value = previous;
      console.error(`${MODULE_ID} | Failed to update Attack Ability.`, error);
    }
    finally { ability.disabled = !editable; }
  });
}

export function attachEffectiveMagicalOverride(config, magical) {
  if (!attackTraitControlsActive() || typeof magical !== "boolean" || !config) return false;
  config.gtWarbands ??= {};
  config.gtWarbands.monsterDefenses ??= {};
  config.gtWarbands.monsterDefenses.attackTraits ??= {};
  config.gtWarbands.monsterDefenses.attackTraits.magical = magical;
  // Transitional contract consumed by standalone DS-Monster-Defenses 0.5.1.
  if (standaloneMonsterDefensesActive()) {
    config.gtWarbands.attackTraits ??= {};
    config.gtWarbands.attackTraits.magical = magical;
  }
  return true;
}

export function getEffectiveMagicalBase(item) {
  return attackTraitControlsActive() ? getAttackTraits(item).magical : undefined;
}

export function isMagicalWeaponAttack(config) {
  const override = config?.gtWarbands?.monsterDefenses?.attackTraits?.magical;
  if (typeof override === "boolean") return override;
  const item = documentFromUuidSync(config?.itemUuid);
  if (!item) return null;
  if (isNpcAttackItem(item)) return getAttackTraits(item).magical;
  if (!item.system?.isWeapon) return null;
  if (item.system.magicItem === true) return true;
  const ammunition = documentFromUuidSync(config?.attack?.selectedAmmunition);
  return ammunition?.system?.magicItem === true;
}

export function getAttackAbility(config) {
  const item = documentFromUuidSync(config?.itemUuid);
  if (isNpcAttackItem(item)) return getAttackTraits(item).ability;
  const actor = actorFromUuid(config?.actorUuid);
  if (!actor || !item?.system?.isWeapon) return "any";
  const attackType = String(config?.attack?.type ?? item.system?.type ?? "").toLowerCase();
  if (attackType === "ranged") return "dex";
  if (attackType !== "melee") return "any";
  if (item.system?.isFinesse) {
    const str = Number(actor.system?.abilities?.str?.mod ?? 0);
    const dex = Number(actor.system?.abilities?.dex?.mod ?? 0);
    if (dex > str) return "dex";
  }
  return "str";
}
