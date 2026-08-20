import {
  clearAttackCounter,
  executeSelectedAttacks,
  hasAttackCounter,
  injectAttackCounter,
  setAttackCounterMaximum
} from "./skirmish-attack-counter.mjs";
import {
  activateDsMonsterDefensesSheetListeners,
  attachDsMonsterDefensesMagicalOverride,
  getDsMonsterDefensesBaseMagical,
  getDsMonsterDefensesSheetContext
} from "./skirmish-ds-monster-defenses.mjs";
import {
  enhancedNpcAttackSheetsEnabled,
  getSkirmishRules,
  registerSkirmishRuleSettings
} from "./skirmish-rules.mjs";
import { format as formatGtw, localize as localizeGtw } from "./localization.mjs";

const MODULE_ID = "gt-warbands";
const SHADOWDARK_SYSTEM_ID = "shadowdark";
const SHADOWDARK_NPC_TYPE = "NPC";
const SHADOWDARK_NPC_ATTACK_TYPE = "NPC Attack";
const SKIRMISH_SETTING = "enableSkirmishNpcSupport";
const SKIRMISH_FLAG = "isSkirmishWarband";
const CONDITION_OVERRIDE_FLAG = "conditionOverride";
const SKIRMISH_PROFILES_FLAG = "skirmishProfiles";
const SKIRMISH_ATTACK_OVERRIDES_FLAG = "skirmishAttackOverrides";
const TOGGLE_CLASS = "gt-wb-skirmish-toggle";
const CONDITION_CLASS = "gt-wb-skirmish-condition";
const EFFECTIVE_DISPLAY_CLASS = "gt-wb-skirmish-effective-attack";
const ENHANCED_NPC_ATTACK_TEMPLATE = `modules/${MODULE_ID}/templates/item/enhanced-npc-attack-sheet.hbs`;
let EnhancedNpcAttackSheet = null;

const COMBAT_CONDITIONS = Object.freeze(["fresh", "worn", "battered"]);
const ALL_CONDITIONS = Object.freeze([...COMBAT_CONDITIONS, "defeated"]);
const CONDITION_KEYS = Object.freeze({
  fresh: "GTWARBANDS.Skirmish.Fresh",
  worn: "GTWARBANDS.Skirmish.Worn",
  battered: "GTWARBANDS.Skirmish.Battered",
  defeated: "GTWARBANDS.Skirmish.Defeated"
});
const DAMAGE_DIE_LADDER = Object.freeze([4, 6, 8, 10, 12]);
const MODIFIER_FIELDS = Object.freeze([
  "attackCountModifier", "attackBonusModifier", "damageDiceCountModifier", "damageDieCategoryModifier"
]);

function L(key) { return localizeGtw(key); }
function F(key, data = {}) { return formatGtw(key, data); }
function conditionLabel(condition) { return L(CONDITION_KEYS[condition] ?? CONDITION_KEYS.fresh); }

function getSheetActor(sheet) {
  const actor = sheet?.actor ?? sheet?.document ?? sheet?.object;
  return actor?.documentName === "Actor" ? actor : null;
}

function getSheetItem(sheet) {
  const item = sheet?.item ?? sheet?.document ?? sheet?.object;
  return item?.documentName === "Item" ? item : null;
}

function getHtmlRoot(html) {
  if (html instanceof HTMLElement) return html;
  if (html?.[0] instanceof HTMLElement) return html[0];
  return null;
}

function isShadowdarkNpc(actor) {
  return game.system.id === SHADOWDARK_SYSTEM_ID && actor?.type === SHADOWDARK_NPC_TYPE;
}

function isShadowdarkNpcAttack(item) {
  return game.system.id === SHADOWDARK_SYSTEM_ID && item?.type === SHADOWDARK_NPC_ATTACK_TYPE;
}

function isSkirmishEnabled() { return Boolean(game.settings.get(MODULE_ID, SKIRMISH_SETTING)); }
function isSkirmishWarband(actor) { return isShadowdarkNpc(actor) && Boolean(actor.getFlag(MODULE_ID, SKIRMISH_FLAG)); }
function mayEdit(sheet, document) { return Boolean(sheet?.isEditable && document?.isOwner); }

function deriveAutomaticCondition(actor) {
  const current = Number(actor?.system?.attributes?.hp?.value ?? 0);
  const maximum = Number(actor?.system?.attributes?.hp?.max ?? 0);
  if (!Number.isFinite(current) || current <= 0) return "defeated";
  if (!Number.isFinite(maximum) || maximum <= 0) return "fresh";
  const ratio = current / maximum;
  if (ratio > 0.5) return "fresh";
  if (ratio > 0.25) return "worn";
  return "battered";
}

function getConditionOverride(actor) {
  const stored = String(actor?.getFlag(MODULE_ID, CONDITION_OVERRIDE_FLAG) ?? "automatic");
  return ALL_CONDITIONS.includes(stored) ? stored : "automatic";
}

function getActiveCondition(actor) {
  const override = getConditionOverride(actor);
  return override === "automatic" ? deriveAutomaticCondition(actor) : override;
}

function hpPercentage(actor) {
  const current = Number(actor?.system?.attributes?.hp?.value ?? 0);
  const maximum = Number(actor?.system?.attributes?.hp?.max ?? 0);
  if (!Number.isFinite(maximum) || maximum <= 0) return current > 0 ? 100 : 0;
  return Math.min(100, Math.max(0, (Number.isFinite(current) ? current : 0) / maximum * 100));
}

function nativeAttackProfile(item) {
  return {
    attackCount: Math.max(1, Math.floor(Number(item?.system?.attack?.num ?? 1) || 1)),
    attackBonus: Math.trunc(Number(item?.system?.bonuses?.attackBonus ?? 0) || 0),
    damage: String(item?.system?.damage?.value ?? "").trim(),
    criticalMultiplier: Math.max(1, Math.trunc(Number(item?.system?.bonuses?.critical?.multiplier) || 2)),
    magical: getDsMonsterDefensesBaseMagical(item)
  };
}

function parseSimpleDamage(formula) {
  const match = String(formula ?? "").trim().match(/^(\d*)\s*d\s*(4|6|8|10|12)\s*([+-]\s*\d+)?$/i);
  if (!match) return null;
  const count = match[1] === "" ? 1 : Number(match[1]);
  const faces = Number(match[2]);
  const flat = match[3] ? Number(match[3].replace(/\s/g, "")) : 0;
  if (!Number.isInteger(count) || count < 1 || !DAMAGE_DIE_LADDER.includes(faces) || !Number.isFinite(flat)) return null;
  return { count, faces, flat };
}

function formatSimpleDamage({ count, faces, flat }) {
  return `${count}d${faces}${flat === 0 ? "" : flat > 0 ? `+${flat}` : flat}`;
}

function transformDamageFormula(formula, diceCountModifier, dieCategoryModifier) {
  const parsed = parseSimpleDamage(formula);
  if (!parsed) return { formula: String(formula ?? "").trim(), transformed: false };
  const currentIndex = DAMAGE_DIE_LADDER.indexOf(parsed.faces);
  const requestedIndex = currentIndex + Math.trunc(Number(dieCategoryModifier) || 0);
  const overflow = Math.max(0, requestedIndex - (DAMAGE_DIE_LADDER.length - 1));
  const targetIndex = Math.min(DAMAGE_DIE_LADDER.length - 1, Math.max(0, requestedIndex));
  const count = Math.max(1, parsed.count + Math.trunc(Number(diceCountModifier) || 0) + overflow);
  return { formula: formatSimpleDamage({ count, faces: DAMAGE_DIE_LADDER[targetIndex], flat: parsed.flat }), transformed: true };
}

function normalizeModifiers(profile, defaults) {
  return Object.fromEntries(MODIFIER_FIELDS.map(field => {
    const value = Number(profile?.[field]);
    return [field, Number.isFinite(value) ? Math.trunc(value) : defaults[field]];
  }));
}

function isModifierProfile(profile) { return MODIFIER_FIELDS.some(field => Object.hasOwn(profile ?? {}, field)); }

function normalizeLegacyProfile(profile, base) {
  const attackCount = Number(profile?.attackCount);
  const attackBonus = Number(profile?.attackBonus);
  const damage = typeof profile?.damage === "string" ? profile.damage.trim() : "";
  return {
    attackCount: Number.isFinite(attackCount) && attackCount >= 1 ? Math.floor(attackCount) : base.attackCount,
    attackBonus: Number.isFinite(attackBonus) ? Math.trunc(attackBonus) : base.attackBonus,
    damage: damage || base.damage
  };
}

function inferLegacyModifiers(condition, legacy, base) {
  const defaults = getSkirmishRules()[condition];
  const baseDamage = parseSimpleDamage(base.damage);
  const legacyDamage = parseSimpleDamage(legacy.damage);
  let damageDiceCountModifier = defaults.damageDiceCountModifier;
  let damageDieCategoryModifier = defaults.damageDieCategoryModifier;
  if (baseDamage && legacyDamage && baseDamage.flat === legacyDamage.flat) {
    damageDieCategoryModifier = DAMAGE_DIE_LADDER.indexOf(legacyDamage.faces) - DAMAGE_DIE_LADDER.indexOf(baseDamage.faces);
    damageDiceCountModifier = legacyDamage.count - baseDamage.count;
  }
  return {
    attackCountModifier: legacy.attackCount - base.attackCount,
    attackBonusModifier: legacy.attackBonus - base.attackBonus,
    damageDiceCountModifier,
    damageDieCategoryModifier
  };
}

function getConditionProfile(item, condition) {
  const base = nativeAttackProfile(item);
  const stored = item?.getFlag(MODULE_ID, SKIRMISH_PROFILES_FLAG)?.[condition];
  const rules = getSkirmishRules();
  const defaults = rules[condition] ?? rules.battered;
  if (!stored || isModifierProfile(stored)) return { mode: "modifiers", modifiers: normalizeModifiers(stored, defaults) };
  const absolute = normalizeLegacyProfile(stored, base);
  return { mode: "legacy", absolute, modifiers: inferLegacyModifiers(condition, absolute, base) };
}

function getResolvedOverride(item, condition) {
  const stored = item?.getFlag(MODULE_ID, SKIRMISH_ATTACK_OVERRIDES_FLAG)?.[condition];
  return stored && typeof stored === "object" ? stored : {};
}

function hasResolvedOverrideField(item, condition, field) {
  const override = getResolvedOverride(item, condition);
  if (!Object.hasOwn(override, field) || override[field] == null) return false;
  return field !== "magical" || typeof override[field] === "boolean";
}

function resolveEffectiveMagicalAttack(item, condition, override = getResolvedOverride(item, condition)) {
  const base = getDsMonsterDefensesBaseMagical(item);
  if (base === undefined) return undefined;
  return Object.hasOwn(override, "magical") && typeof override.magical === "boolean"
    ? override.magical
    : base;
}

function hasItemCustomization(item, condition) {
  const legacy = item?.getFlag(MODULE_ID, SKIRMISH_PROFILES_FLAG)?.[condition];
  const resolved = getResolvedOverride(item, condition);
  return Boolean(legacy || Object.keys(resolved).some(field => hasResolvedOverrideField(item, condition, field)));
}

function applyResolvedOverride(effective, override) {
  const attackCount = Number(override.attackCount);
  const attackBonus = Number(override.attackBonus);
  const damage = typeof override.damage === "string" ? override.damage.trim() : "";
  const criticalMultiplier = Number(override.criticalMultiplier);
  return {
    ...effective,
    attackCount: Number.isFinite(attackCount) && attackCount >= 1 ? Math.floor(attackCount) : effective.attackCount,
    attackBonus: Number.isFinite(attackBonus) ? Math.trunc(attackBonus) : effective.attackBonus,
    damage: damage || effective.damage,
    criticalMultiplier: Number.isFinite(criticalMultiplier) && criticalMultiplier >= 1
      ? Math.trunc(criticalMultiplier)
      : effective.criticalMultiplier,
    manualOverride: Object.keys(override).length > 0
  };
}

function deriveEffectiveAttack(item, condition = getActiveCondition(item?.parent)) {
  const base = nativeAttackProfile(item);
  if (!COMBAT_CONDITIONS.includes(condition)) return { ...base, condition, base, damageTransformed: false, legacy: false };
  const profile = getConditionProfile(item, condition);
  const override = getResolvedOverride(item, condition);
  if (profile.mode === "legacy") {
    const effective = applyResolvedOverride({
      ...profile.absolute,
      criticalMultiplier: base.criticalMultiplier,
      condition,
      base,
      damageTransformed: profile.absolute.damage !== base.damage,
      legacy: true
    }, override);
    return { ...effective, magical: resolveEffectiveMagicalAttack(item, condition, override) };
  }
  const modifiers = profile.modifiers;
  const damage = transformDamageFormula(base.damage, modifiers.damageDiceCountModifier, modifiers.damageDieCategoryModifier);
  const effective = applyResolvedOverride({
    attackCount: Math.max(1, base.attackCount + modifiers.attackCountModifier),
    attackBonus: base.attackBonus + modifiers.attackBonusModifier,
    damage: damage.formula,
    criticalMultiplier: base.criticalMultiplier,
    condition,
    base,
    damageTransformed: damage.transformed,
    legacy: false
  }, override);
  return { ...effective, magical: resolveEffectiveMagicalAttack(item, condition, override) };
}

function signedBonus(value) {
  const number = Math.trunc(Number(value) || 0);
  return number >= 0 ? `+${number}` : String(number);
}

function appendBonus(formula, bonus) {
  const numeric = Math.trunc(Number(bonus) || 0);
  return numeric === 0 ? formula : `${formula}${signedBonus(numeric)}`;
}

function resolveUuidSync(uuid) {
  try { return typeof fromUuidSync === "function" ? fromUuidSync(uuid) : null; }
  catch (error) {
    console.warn(`${MODULE_ID} | Could not resolve Shadowdark NPC Attack UUID.`, error);
    return null;
  }
}

function resolveConfigAttack(config) {
  const item = resolveUuidSync(config?.itemUuid);
  const actor = item?.parent;
  if (!isShadowdarkNpcAttack(item) || !isShadowdarkNpc(actor)) return null;
  const skirmish = isSkirmishEnabled() && isSkirmishWarband(actor);
  if (!skirmish && !enhancedNpcAttackSheetsEnabled()) return null;
  const condition = skirmish ? getActiveCondition(actor) : null;
  const effective = skirmish ? deriveEffectiveAttack(item, condition) : nativeAttackProfile(item);
  return { item, actor, condition, effective, skirmish };
}

function applyEffectiveAttackConfig(config, { setCounter = true } = {}) {
  const resolved = resolveConfigAttack(config);
  if (!resolved) return null;
  const { item, actor, condition, effective, skirmish } = resolved;
  if (skirmish && condition === "defeated") return { item, actor, condition, effective, skirmish, defeated: true };
  if (skirmish && config.mainRoll?.base) {
    config.mainRoll.bonus = signedBonus(effective.attackBonus);
    config.mainRoll.formula = `${config.mainRoll.base}${signedBonus(effective.attackBonus)}`;
  }
  if (skirmish && effective.damage) {
    config.damageRoll ??= {};
    config.damageRoll.label ??= game.i18n.localize("SHADOWDARK.roll.damage");
    config.damageRoll.base = effective.damage;
    config.damageRoll.formula = appendBonus(effective.damage, item.system.bonuses?.damageBonus);
    config.damageRoll.criticalMultiplier = effective.criticalMultiplier;
  }
  if (skirmish) attachDsMonsterDefensesMagicalOverride(config, effective.magical);
  if (setCounter) setAttackCounterMaximum(config, effective.attackCount);
  return { item, actor, condition, effective, skirmish, defeated: false };
}

function rerenderOpenSkirmishSheets(actor = null) {
  const applications = new Set([
    ...Object.values(ui.windows ?? {}),
    ...Array.from(globalThis.foundry?.applications?.instances?.values?.() ?? [])
  ]);
  for (const sheet of applications) {
    const sheetActor = getSheetActor(sheet);
    if (isShadowdarkNpc(sheetActor) && (!actor || sheetActor.uuid === actor.uuid)) {
      sheet.render(false);
      continue;
    }
    const item = getSheetItem(sheet);
    const parent = item?.parent;
    if (isShadowdarkNpcAttack(item) && isShadowdarkNpc(parent) && (!actor || parent.uuid === actor.uuid)) sheet.render(false);
  }
}

function injectSkirmishToggle(sheet, root, actor) {
  if (root.querySelector(`.${TOGGLE_CLASS}`)) return;
  const hpValue = root.querySelector('input[name="system.attributes.hp.value"]');
  const hpBox = hpValue?.closest(".SD-box");
  const dice = hpBox?.querySelector('.header [data-action="roll-hp"]');
  const controls = dice?.parentElement ?? hpBox?.querySelector(".header span");
  if (!controls) {
    console.warn(`${MODULE_ID} | Shadowdark NPC HP header was not found; Skirmish toggle was not injected.`);
    return;
  }
  const editable = mayEdit(sheet, actor);
  const active = isSkirmishWarband(actor);
  const button = document.createElement("a");
  button.classList.add(TOGGLE_CLASS, "fas", "fa-users");
  button.classList.toggle("is-active", active);
  button.classList.toggle("is-inactive", !active);
  button.classList.toggle("is-disabled", !editable);
  button.dataset.tooltip = L(active ? "GTWARBANDS.Skirmish.DisableSkirmish" : "GTWARBANDS.Skirmish.EnableSkirmish");
  button.setAttribute("aria-label", button.dataset.tooltip);
  button.setAttribute("aria-pressed", String(active));
  if (!editable) button.setAttribute("aria-disabled", "true");
  if (editable) {
    button.addEventListener("click", async event => {
      event.preventDefault();
      event.stopPropagation();
      button.classList.add("is-pending");
      try {
        await actor.setFlag(MODULE_ID, SKIRMISH_FLAG, !active);
        rerenderOpenSkirmishSheets(actor);
      }
      catch (error) {
        button.classList.remove("is-pending");
        ui.notifications.error(L("GTWARBANDS.Notification.SkirmishFlagUpdateFailed"));
        console.error(`${MODULE_ID} | Failed to update Skirmish Warband flag.`, error);
      }
    });
  }
  dice?.insertAdjacentElement("afterend", button);
  if (!dice) controls.append(button);
}

function injectConditionDisplay(sheet, root, actor) {
  if (!isSkirmishWarband(actor) || root.querySelector(`.${CONDITION_CLASS}`)) return;
  const hpValue = root.querySelector('input[name="system.attributes.hp.value"]');
  const hpBox = hpValue?.closest(".SD-box");
  const valueGrid = hpBox?.querySelector(".content .value-grid");
  if (!valueGrid) {
    console.warn(`${MODULE_ID} | Shadowdark NPC HP box was not found; Skirmish Condition was not injected.`);
    return;
  }
  const activeCondition = getActiveCondition(actor);
  const percentage = hpPercentage(actor);
  const section = document.createElement("div");
  section.classList.add(CONDITION_CLASS, `is-${activeCondition}`);

  const summary = document.createElement("div");
  summary.classList.add("gt-wb-skirmish-condition-summary");
  const text = document.createElement("span");
  text.textContent = `${L("GTWARBANDS.Skirmish.Condition")}: `;
  const value = document.createElement("strong");
  value.textContent = conditionLabel(activeCondition);
  text.append(value);
  summary.append(text);

  const track = document.createElement("div");
  track.classList.add("gt-wb-skirmish-condition-track");
  track.setAttribute("role", "meter");
  track.setAttribute("aria-valuemin", "0");
  track.setAttribute("aria-valuemax", "100");
  track.setAttribute("aria-valuenow", String(Math.round(percentage)));
  track.setAttribute("aria-label", F("GTWARBANDS.Skirmish.ConditionBarLabel", { condition: conditionLabel(activeCondition), percentage: Math.round(percentage) }));
  const fill = document.createElement("span");
  fill.classList.add("gt-wb-skirmish-condition-fill");
  fill.style.width = `${percentage}%`;
  track.append(fill);
  section.append(summary, track);
  valueGrid.insertAdjacentElement("afterend", section);
}

async function renderEffectiveAttackDisplay(item, effective) {
  return foundry.applications.handlebars.renderTemplate("systems/shadowdark/templates/_partials/npc-attack.hbs", {
    attackType: item.system.attackType,
    attackName: item.name,
    numAttacks: effective.attackCount,
    attackBonus: effective.attackBonus,
    baseDamage: effective.damage,
    bonusDamage: Math.trunc(Number(item.system.bonuses?.damageBonus ?? 0) || 0),
    itemId: item.id,
    special: item.system.damage.special,
    ranges: item.system.ranges.map(range => game.i18n.localize(CONFIG.SHADOWDARK.RANGES[range])).join("/")
  });
}

async function updateEffectiveAttackDisplays(root, actor) {
  if (!isSkirmishWarband(actor)) return;
  const condition = getActiveCondition(actor);
  for (const row of root.querySelectorAll(".item.attack[data-item-id]")) {
    const item = actor.items.get(row.dataset.itemId);
    if (!isShadowdarkNpcAttack(item)) continue;
    const existingLink = row.querySelector('[data-action="item-attack"]');
    const container = document.createElement("div");
    container.innerHTML = await renderEffectiveAttackDisplay(item, deriveEffectiveAttack(item, condition));
    const replacementLink = container.querySelector('[data-action="item-attack"]');
    if (!existingLink || !replacementLink) continue;
    existingLink.replaceChildren(...replacementLink.childNodes);
    row.classList.add(EFFECTIVE_DISPLAY_CLASS);
    row.dataset.gtwCondition = condition;
  }
}

function buildSkirmishHpFormula(actor) {
  const conModifier = Math.trunc(Number(actor.system.abilities.con.mod) || 0);
  const conBonus = shadowdark.dice.formatBonus(2 * conModifier);
  const level = actor.system.level.value ?? 1;
  return level ? `${2 * level}d8${conBonus}` : `1${conBonus}`;
}

async function rollSkirmishHp(actor) {
  const formula = buildSkirmishHpFormula(actor);
  const config = {
    actorUuid: actor.uuid,
    mainRoll: { label: L("GTWARBANDS.Skirmish.HpRoll"), formula },
    rollMode: CONST.DICE_ROLL_MODES.PRIVATE
  };
  const result = await shadowdark.dice.rollFromConfig(config);
  if (!result) return;
  const newHp = Number(result.total);
  await actor.update({ "system.attributes.hp.max": newHp, "system.attributes.hp.value": newHp });
}

function interceptSkirmishHpRoll(root, actor) {
  const hpButton = root.querySelector('[data-action="roll-hp"]');
  if (!hpButton || hpButton.dataset.gtwSkirmishHpBound === "true") return;
  hpButton.dataset.gtwSkirmishHpBound = "true";
  hpButton.dataset.tooltip = L("GTWARBANDS.Skirmish.HpRoll");
  hpButton.addEventListener("click", event => {
    if (!isSkirmishEnabled() || !isSkirmishWarband(actor)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    void rollSkirmishHp(actor).catch(error => {
      ui.notifications.error(L("GTWARBANDS.Notification.SkirmishHpRollFailed"));
      console.error(`${MODULE_ID} | Skirmish HP roll failed.`, error);
    });
  }, { capture: true });
}

async function injectSkirmishActorUi(sheet, html) {
  const actor = getSheetActor(sheet);
  if (!isShadowdarkNpc(actor) || !isSkirmishEnabled()) return;
  const root = getHtmlRoot(html);
  if (!root) return;
  injectSkirmishToggle(sheet, root, actor);
  if (!isSkirmishWarband(actor)) return;
  injectConditionDisplay(sheet, root, actor);
  interceptSkirmishHpRoll(root, actor);
  await updateEffectiveAttackDisplays(root, actor);
}

async function setResolvedOverride(item, condition, field, value) {
  const overrides = foundry.utils.deepClone(item.getFlag(MODULE_ID, SKIRMISH_ATTACK_OVERRIDES_FLAG) ?? {});
  overrides[condition] ??= {};
  overrides[condition][field] = value;
  await item.setFlag(MODULE_ID, SKIRMISH_ATTACK_OVERRIDES_FLAG, overrides);
}

async function clearResolvedOverrideField(item, condition, field) {
  const overrides = foundry.utils.deepClone(item.getFlag(MODULE_ID, SKIRMISH_ATTACK_OVERRIDES_FLAG) ?? {});
  if (!Object.hasOwn(overrides[condition] ?? {}, field)) return;
  delete overrides[condition][field];
  if (!Object.keys(overrides[condition]).length) delete overrides[condition];
  if (Object.keys(overrides).length) await item.setFlag(MODULE_ID, SKIRMISH_ATTACK_OVERRIDES_FLAG, overrides);
  else await item.unsetFlag(MODULE_ID, SKIRMISH_ATTACK_OVERRIDES_FLAG);
}

function shouldUseEnhancedNpcAttackSheet(item) {
  const actor = item?.parent;
  if (!isShadowdarkNpcAttack(item) || !isShadowdarkNpc(actor)) return false;
  const skirmish = isSkirmishEnabled() && isSkirmishWarband(actor);
  return skirmish || enhancedNpcAttackSheetsEnabled();
}

function buildEnhancedNpcAttackContext(sheet, item) {
  const actor = item.parent;
  const skirmish = isSkirmishEnabled() && isSkirmishWarband(actor);
  const editable = mayEdit(sheet, item) && actor.isOwner;
  const current = getConditionOverride(actor);
  const activeCondition = getActiveCondition(actor);
  const ds = getDsMonsterDefensesSheetContext(item, editable);
  return {
    enhanced: true,
    skirmish,
    canEditProfiles: editable,
    canOverrideCondition: Boolean(game.user.isGM && mayEdit(sheet, actor)),
    conditionOptions: ["automatic", ...ALL_CONDITIONS].map(value => ({
      value,
      label: value === "automatic" ? L("GTWARBANDS.Skirmish.Automatic") : conditionLabel(value),
      selected: value === current
    })),
    profiles: skirmish ? COMBAT_CONDITIONS.map(condition => {
      const effective = deriveEffectiveAttack(item, condition);
      const override = getResolvedOverride(item, condition);
      const manual = hasItemCustomization(item, condition);
      const manualFields = Object.fromEntries([
        "attackCount", "attackBonus", "damage", "criticalMultiplier", "magical"
      ].map(field => [field, hasResolvedOverrideField(item, condition, field)]));
      const canResetFields = Object.fromEntries(Object.entries(manualFields)
        .map(([field, manualField]) => [field, editable && manualField]));
      return {
        condition,
        label: conditionLabel(condition),
        attackCount: effective.attackCount,
        attackBonus: signedBonus(effective.attackBonus),
        damage: effective.damage,
        criticalMultiplier: effective.criticalMultiplier,
        magical: ds.active && effective.magical === true,
        manualFields,
        canResetFields,
        active: condition === activeCondition,
        manual,
        editable
      };
    }) : [],
    ds
  };
}

function activateConditionOverrideListener(sheet, root, actor) {
  const select = root.querySelector("[data-gtw-condition-override]");
  if (!select || !game.user.isGM || !mayEdit(sheet, actor)) return;
  const current = getConditionOverride(actor);
  select.addEventListener("change", async event => {
    event.stopPropagation();
    const requested = select.value;
    select.disabled = true;
    try {
      if (requested === "automatic") await actor.unsetFlag(MODULE_ID, CONDITION_OVERRIDE_FLAG);
      else await actor.setFlag(MODULE_ID, CONDITION_OVERRIDE_FLAG, requested);
      rerenderOpenSkirmishSheets(actor);
    }
    catch (error) {
      select.value = current;
      select.disabled = false;
      ui.notifications.error(L("GTWARBANDS.Notification.SkirmishOverrideUpdateFailed"));
      console.error(`${MODULE_ID} | Failed to update Skirmish Condition override.`, error);
    }
  });
}

function activateProfileOverrideListeners(sheet, item, root, actor) {
  if (!mayEdit(sheet, item) || !actor.isOwner) return;
  for (const input of root.querySelectorAll("[data-condition] [data-profile-field]")) {
    input.addEventListener("change", async event => {
      event.stopPropagation();
      const condition = input.closest("[data-condition]")?.dataset.condition;
      if (!COMBAT_CONDITIONS.includes(condition)) return;
      const effective = deriveEffectiveAttack(item, condition);
      const field = input.dataset.profileField;
      let value;
      if (field === "damage") {
        value = String(input.value ?? "").trim();
        const invalidFormula = typeof Roll !== "undefined" && typeof Roll.validate === "function" && !Roll.validate(value);
        if (!value || invalidFormula) {
          ui.notifications.error(F("GTWARBANDS.Notification.SkirmishInvalidDamage", { formula: value }));
          input.value = effective.damage;
          return;
        }
      }
      else if (field === "magical") {
        value = input.checked;
      }
      else {
        value = Number(input.value);
        const mustBePositive = ["attackCount", "criticalMultiplier"].includes(field);
        if (!Number.isFinite(value) || (mustBePositive && value < 1)) {
          input.value = field === "attackCount"
            ? effective.attackCount
            : field === "criticalMultiplier"
              ? effective.criticalMultiplier
              : signedBonus(effective.attackBonus);
          return;
        }
        value = Math.trunc(value);
      }

      input.disabled = true;
      try {
        await setResolvedOverride(item, condition, field, value);
        rerenderOpenSkirmishSheets(actor);
      }
      catch (error) {
        if (field === "magical") input.checked = input.dataset.gtwPrevious === "true";
        input.disabled = false;
        ui.notifications.error(L("GTWARBANDS.Notification.SkirmishProfilesUpdateFailed"));
        console.error(`${MODULE_ID} | Failed to update Skirmish attack override.`, error);
      }
    });
  }

  for (const reset of root.querySelectorAll('[data-action="gtw-reset-profile-field"]')) {
    reset.addEventListener("click", async event => {
      event.preventDefault();
      event.stopPropagation();
      const condition = reset.closest("[data-condition]")?.dataset.condition;
      const field = reset.dataset.profileField;
      if (!COMBAT_CONDITIONS.includes(condition) || !field) return;
      reset.disabled = true;
      try {
        await clearResolvedOverrideField(item, condition, field);
        rerenderOpenSkirmishSheets(actor);
      }
      catch (error) {
        reset.disabled = false;
        ui.notifications.error(L("GTWARBANDS.Notification.SkirmishProfilesUpdateFailed"));
        console.error(`${MODULE_ID} | Failed to reset Skirmish attack override.`, error);
      }
    });
  }
}

function activateEnhancedNpcAttackListeners(sheet, html) {
  const item = getSheetItem(sheet);
  if (!shouldUseEnhancedNpcAttackSheet(item)) return;
  const root = getHtmlRoot(html);
  if (!root) return;
  const actor = item.parent;
  if (isSkirmishEnabled() && isSkirmishWarband(actor)) {
    activateConditionOverrideListener(sheet, root, actor);
    activateProfileOverrideListeners(sheet, item, root, actor);
  }
  activateDsMonsterDefensesSheetListeners({ sheet, item, root });
  Hooks.callAll("gt-warbands.renderEnhancedNpcAttackDetails", { sheet, item, actor, root });
}

function registerEnhancedNpcAttackSheet() {
  if (EnhancedNpcAttackSheet || game.system.id !== SHADOWDARK_SYSTEM_ID) return;
  const ShadowdarkItemSheet = globalThis.shadowdark?.sheets?.ItemSheetSD;
  if (!ShadowdarkItemSheet) {
    console.error(`${MODULE_ID} | Shadowdark ItemSheetSD was unavailable; enhanced NPC Attack sheets were not registered.`);
    return;
  }

  EnhancedNpcAttackSheet = class GTWarbandsNpcAttackSheet extends ShadowdarkItemSheet {
    get template() {
      return shouldUseEnhancedNpcAttackSheet(this.item) ? ENHANCED_NPC_ATTACK_TEMPLATE : super.template;
    }

    async getData(options) {
      const context = await super.getData(options);
      if (shouldUseEnhancedNpcAttackSheet(this.item)) {
        context.gtw = buildEnhancedNpcAttackContext(this, this.item);
      }
      return context;
    }

    activateListeners(html) {
      super.activateListeners(html);
      activateEnhancedNpcAttackListeners(this, html);
    }
  };

  const DSC = foundry.applications.apps.DocumentSheetConfig;
  DSC.registerSheet(foundry.documents.Item, MODULE_ID, EnhancedNpcAttackSheet, {
    types: [SHADOWDARK_NPC_ATTACK_TYPE],
    makeDefault: true,
    label: L("GTWARBANDS.Settings.EnhancedNpcAttackSheets")
  });
  console.log(`${MODULE_ID} | Registered runtime-selected enhanced Shadowdark NPC Attack sheet.`);
}

async function executePreparedNpcAttack(config) {
  clearAttackCounter(config);
  if (!Hooks.call("SD-NPC-Attack", config)) return false;
  return shadowdark.dice.rollFromConfig(config);
}

function onShadowdarkNpcAttack(config) {
  if (hasAttackCounter(config)) {
    const applied = applyEffectiveAttackConfig(config, { setCounter: false });
    if (!applied) return true;
    if (applied.defeated) {
      ui.notifications.warn(L("GTWARBANDS.Notification.SkirmishDefeatedCannotAttack"));
      return false;
    }

    // Foundry hooks are synchronous. Cancel Shadowdark's one native execution
    // immediately, then send every independent clone through the normal NPC
    // attack hook chain before rolling it. The transient DS compatibility trait
    // survives cloning while the quantity marker is removed to prevent recursion.
    void executeSelectedAttacks(config, executePreparedNpcAttack).catch(error => {
      ui.notifications.error(L("GTWARBANDS.Notification.MultiAttackFailed"));
      console.error(`${MODULE_ID} | Multi-attack execution failed.`, error);
    });
    return false;
  }

  // Shadowdark's Shift-click path skips the dialog. Preserve its single-roll
  // semantics instead of silently treating the effective attack count as a selection.
  const applied = applyEffectiveAttackConfig(config, { setCounter: false });
  if (!applied) return true;
  if (applied.defeated) {
    ui.notifications.warn(L("GTWARBANDS.Notification.SkirmishDefeatedCannotAttack"));
    return false;
  }
  return true;
}

function onRenderRollDialog(application, html) {
  const root = getHtmlRoot(html);
  const config = application?.config;
  if (!root || !config) return;
  const applied = applyEffectiveAttackConfig(config);
  if (!applied || applied.defeated) return;
  const mainKey = config.mainRoll?.key ?? "mainRoll.formula";
  const damageKey = config.damageRoll?.key ?? "damageRoll.formula";
  const mainInput = root.querySelector(`input[name="${mainKey}"]`);
  const damageInput = root.querySelector(`input[name="${damageKey}"]`);
  if (mainInput) mainInput.value = config.mainRoll.formula;
  if (damageInput) damageInput.value = config.damageRoll.formula;
  injectAttackCounter(application, root, config);
}

export function registerSkirmishSettings() {
  game.settings.register(MODULE_ID, SKIRMISH_SETTING, {
    name: L("GTWARBANDS.Settings.EnableSkirmishNpcSupport"),
    hint: L("GTWARBANDS.Settings.EnableSkirmishNpcSupportHint"),
    scope: "world",
    config: true,
    type: Boolean,
    default: false,
    onChange: () => rerenderOpenSkirmishSheets()
  });
  registerSkirmishRuleSettings();
}

export function registerSkirmishHooks() {
  registerEnhancedNpcAttackSheet();
  Hooks.on("renderActorSheet", injectSkirmishActorUi);
  Hooks.on("renderRollDialogSD", onRenderRollDialog);
  Hooks.on("SD-NPC-Attack", onShadowdarkNpcAttack);
  Hooks.on("gt-warbands.skirmishRulesChanged", () => rerenderOpenSkirmishSheets());
}

export const skirmishTestApi = Object.freeze({
  deriveAutomaticCondition,
  parseSimpleDamage,
  transformDamageFormula,
  deriveEffectiveAttack,
  applyEffectiveAttackConfig,
  executePreparedNpcAttack,
  clearResolvedOverrideField,
  buildSkirmishHpFormula
});
