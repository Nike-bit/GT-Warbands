import { localize as localizeGtw } from "./localization.mjs";

const MODULE_ID = "gt-warbands";
export const SKIRMISH_RULES_SETTING = "skirmishRules";
export const SINGLE_NPC_SCALING_SETTING = "enhancedNpcAttackSheets";
export const SINGLE_NPC_RULES_SETTING = "singleNpcSkirmishRules";
export const SKIRMISH_RULES_MENU = "skirmishRulesMenu";
export const SINGLE_NPC_RULES_MENU = "singleNpcSkirmishRulesMenu";

export const DEFAULT_SKIRMISH_RULES = Object.freeze({
  fresh: Object.freeze({ attackCountModifier: 1, attackBonusModifier: 1, damageDiceCountModifier: 1, damageDieCategoryModifier: 1 }),
  worn: Object.freeze({ attackCountModifier: 0, attackBonusModifier: 1, damageDiceCountModifier: 1, damageDieCategoryModifier: 1 }),
  battered: Object.freeze({ attackCountModifier: 0, attackBonusModifier: 0, damageDiceCountModifier: 1, damageDieCategoryModifier: 0 })
});

export const DEFAULT_SINGLE_NPC_RULES = Object.freeze({
  fresh: Object.freeze({ attackCountModifier: 0, attackBonusModifier: 0, damageDiceCountModifier: 0, damageDieCategoryModifier: 0 }),
  worn: Object.freeze({ attackCountModifier: 0, attackBonusModifier: 0, damageDiceCountModifier: 0, damageDieCategoryModifier: 0 }),
  battered: Object.freeze({ attackCountModifier: 0, attackBonusModifier: 0, damageDiceCountModifier: 0, damageDieCategoryModifier: 0 })
});

const CONDITIONS = Object.freeze(["fresh", "worn", "battered"]);
const FIELDS = Object.freeze([
  "attackCountModifier", "attackBonusModifier", "damageDiceCountModifier", "damageDieCategoryModifier"
]);
const CONDITION_KEYS = Object.freeze({
  fresh: "GTWARBANDS.Skirmish.Fresh",
  worn: "GTWARBANDS.Skirmish.Worn",
  battered: "GTWARBANDS.Skirmish.Battered"
});

function L(key) { return localizeGtw(key); }
function clone(value) {
  return globalThis.foundry?.utils?.deepClone
    ? foundry.utils.deepClone(value)
    : JSON.parse(JSON.stringify(value));
}

function normalizeRules(value, defaults) {
  const stored = value && typeof value === "object" ? value : {};
  return Object.fromEntries(CONDITIONS.map(condition => [condition, Object.fromEntries(FIELDS.map(field => {
    const candidate = Number(stored[condition]?.[field]);
    return [field, Number.isFinite(candidate) ? Math.trunc(candidate) : defaults[condition][field]];
  }))]));
}

function getRules(setting, defaults) {
  try { return normalizeRules(game.settings.get(MODULE_ID, setting), defaults); }
  catch (_error) { return clone(defaults); }
}

export function getSkirmishRules() { return getRules(SKIRMISH_RULES_SETTING, DEFAULT_SKIRMISH_RULES); }
export function getSingleNpcRules() { return getRules(SINGLE_NPC_RULES_SETTING, DEFAULT_SINGLE_NPC_RULES); }
export function singleNpcScalingEnabled() {
  try { return Boolean(game.settings.get(MODULE_ID, SINGLE_NPC_SCALING_SETTING)); }
  catch (_error) { return false; }
}

const FormApplicationV1 = foundry.appv1.api.FormApplication;

class RulesConfigBase extends FormApplicationV1 {
  static setting = SKIRMISH_RULES_SETTING;
  static defaults = DEFAULT_SKIRMISH_RULES;
  static titleKey = "GTWARBANDS.SkirmishRules.Title";
  static descriptionKey = "GTWARBANDS.SkirmishRules.Description";
  static resetKey = "GTWARBANDS.SkirmishRules.ResetDefaults";
  static savedKey = "GTWARBANDS.Notification.SkirmishRulesSaved";
  static resetNoticeKey = "GTWARBANDS.Notification.SkirmishRulesReset";

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: "gt-warbands-skirmish-rules-config",
      template: `modules/${MODULE_ID}/templates/apps/skirmish-rules-config.hbs`,
      width: 720,
      height: "auto",
      resizable: true,
      closeOnSubmit: false,
      submitOnChange: false
    });
  }

  get title() { return L(this.constructor.titleKey); }
  get rules() { return getRules(this.constructor.setting, this.constructor.defaults); }

  async getData(options = {}) {
    const context = await super.getData(options);
    return {
      ...context,
      titleKey: this.constructor.titleKey,
      descriptionKey: this.constructor.descriptionKey,
      resetKey: this.constructor.resetKey,
      rows: CONDITIONS.map(condition => ({ condition, label: L(CONDITION_KEYS[condition]), ...this.rules[condition] }))
    };
  }

  activateListeners(html) {
    super.activateListeners(html);
    html.find('[data-action="reset-skirmish-rules"]').on("click", async event => {
      event.preventDefault();
      await game.settings.set(MODULE_ID, this.constructor.setting, clone(this.constructor.defaults));
      ui.notifications.info(L(this.constructor.resetNoticeKey));
      this.render(false);
    });
  }

  async _updateObject(_event, formData) {
    const expanded = foundry.utils.expandObject(formData);
    await game.settings.set(MODULE_ID, this.constructor.setting, normalizeRules(expanded.rules, this.constructor.defaults));
    ui.notifications.info(L(this.constructor.savedKey));
    this.render(false);
  }
}

class SkirmishRulesConfig extends RulesConfigBase {}
class SingleNpcRulesConfig extends RulesConfigBase {
  static setting = SINGLE_NPC_RULES_SETTING;
  static defaults = DEFAULT_SINGLE_NPC_RULES;
  static titleKey = "GTWARBANDS.SingleNpcRules.Title";
  static descriptionKey = "GTWARBANDS.SingleNpcRules.Description";
  static resetKey = "GTWARBANDS.SingleNpcRules.ResetDefaults";
  static savedKey = "GTWARBANDS.Notification.SingleNpcRulesSaved";
  static resetNoticeKey = "GTWARBANDS.Notification.SingleNpcRulesReset";
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, { id: "gt-warbands-single-npc-rules-config" });
  }
}

export function registerSkirmishRuleSettings() {
  game.settings.register(MODULE_ID, SINGLE_NPC_SCALING_SETTING, {
    name: L("GTWARBANDS.Settings.EnhancedNpcAttackSheets"),
    hint: L("GTWARBANDS.Settings.EnhancedNpcAttackSheetsHint"),
    scope: "world",
    config: true,
    type: Boolean,
    default: false,
    onChange: () => Hooks.callAll("gt-warbands.skirmishRulesChanged")
  });

  for (const [key, defaults, titleKey] of [
    [SKIRMISH_RULES_SETTING, DEFAULT_SKIRMISH_RULES, "GTWARBANDS.SkirmishRules.Title"],
    [SINGLE_NPC_RULES_SETTING, DEFAULT_SINGLE_NPC_RULES, "GTWARBANDS.SingleNpcRules.Title"]
  ]) {
    game.settings.register(MODULE_ID, key, {
      name: L(titleKey), scope: "world", config: false, type: Object, default: clone(defaults),
      onChange: () => Hooks.callAll("gt-warbands.skirmishRulesChanged")
    });
  }

  game.settings.registerMenu(MODULE_ID, SKIRMISH_RULES_MENU, {
    name: L("GTWARBANDS.SkirmishRules.Title"), label: L("GTWARBANDS.SkirmishRules.Configure"),
    hint: L("GTWARBANDS.SkirmishRules.Hint"), icon: "fas fa-people-group",
    type: SkirmishRulesConfig, restricted: true
  });
  game.settings.registerMenu(MODULE_ID, SINGLE_NPC_RULES_MENU, {
    name: L("GTWARBANDS.SingleNpcRules.Title"), label: L("GTWARBANDS.SingleNpcRules.Configure"),
    hint: L("GTWARBANDS.SingleNpcRules.Hint"), icon: "fas fa-person",
    type: SingleNpcRulesConfig, restricted: true
  });
}
