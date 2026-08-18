import { localize as localizeGtw } from "./localization.mjs";

const MODULE_ID = "gt-warbands";
export const SKIRMISH_RULES_SETTING = "skirmishRules";
export const ENHANCED_NPC_ATTACK_SHEETS_SETTING = "enhancedNpcAttackSheets";
export const SKIRMISH_RULES_MENU = "skirmishRulesMenu";

export const DEFAULT_SKIRMISH_RULES = Object.freeze({
  fresh: Object.freeze({
    attackCountModifier: 1,
    attackBonusModifier: 1,
    damageDiceCountModifier: 1,
    damageDieCategoryModifier: 1
  }),
  worn: Object.freeze({
    attackCountModifier: 0,
    attackBonusModifier: 1,
    damageDiceCountModifier: 1,
    damageDieCategoryModifier: 1
  }),
  battered: Object.freeze({
    attackCountModifier: 0,
    attackBonusModifier: 0,
    damageDiceCountModifier: 1,
    damageDieCategoryModifier: 0
  })
});

const CONDITIONS = Object.freeze(["fresh", "worn", "battered"]);
const FIELDS = Object.freeze([
  "attackCountModifier",
  "attackBonusModifier",
  "damageDiceCountModifier",
  "damageDieCategoryModifier"
]);
const CONDITION_KEYS = Object.freeze({
  fresh: "GTWARBANDS.Skirmish.Fresh",
  worn: "GTWARBANDS.Skirmish.Worn",
  battered: "GTWARBANDS.Skirmish.Battered"
});

function L(key) {
  return localizeGtw(key);
}

function cloneDefaults() {
  if (globalThis.foundry?.utils?.deepClone) return foundry.utils.deepClone(DEFAULT_SKIRMISH_RULES);
  return JSON.parse(JSON.stringify(DEFAULT_SKIRMISH_RULES));
}

function normalizeRules(value) {
  const stored = value && typeof value === "object" ? value : {};
  const rules = {};
  for (const condition of CONDITIONS) {
    rules[condition] = {};
    for (const field of FIELDS) {
      const candidate = Number(stored[condition]?.[field]);
      rules[condition][field] = Number.isFinite(candidate)
        ? Math.trunc(candidate)
        : DEFAULT_SKIRMISH_RULES[condition][field];
    }
  }
  return rules;
}

export function getSkirmishRules() {
  try {
    return normalizeRules(game.settings.get(MODULE_ID, SKIRMISH_RULES_SETTING));
  }
  catch (_error) {
    return cloneDefaults();
  }
}

export function enhancedNpcAttackSheetsEnabled() {
  try {
    return Boolean(game.settings.get(MODULE_ID, ENHANCED_NPC_ATTACK_SHEETS_SETTING));
  }
  catch (_error) {
    return false;
  }
}

const FormApplicationV1 = foundry.appv1.api.FormApplication;

class SkirmishRulesConfig extends FormApplicationV1 {
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

  get title() {
    return L("GTWARBANDS.SkirmishRules.Title");
  }

  async getData(options = {}) {
    const context = await super.getData(options);
    const rules = getSkirmishRules();
    return {
      ...context,
      rows: CONDITIONS.map(condition => ({
        condition,
        label: L(CONDITION_KEYS[condition]),
        ...rules[condition]
      }))
    };
  }

  activateListeners(html) {
    super.activateListeners(html);
    html.find('[data-action="reset-skirmish-rules"]').on("click", async event => {
      event.preventDefault();
      await game.settings.set(MODULE_ID, SKIRMISH_RULES_SETTING, cloneDefaults());
      ui.notifications.info(L("GTWARBANDS.Notification.SkirmishRulesReset"));
      this.render(false);
    });
  }

  async _updateObject(_event, formData) {
    const expanded = foundry.utils.expandObject(formData);
    const rules = normalizeRules(expanded.rules);
    await game.settings.set(MODULE_ID, SKIRMISH_RULES_SETTING, rules);
    ui.notifications.info(L("GTWARBANDS.Notification.SkirmishRulesSaved"));
    this.render(false);
  }
}

export function registerSkirmishRuleSettings() {
  game.settings.register(MODULE_ID, ENHANCED_NPC_ATTACK_SHEETS_SETTING, {
    name: L("GTWARBANDS.Settings.EnhancedNpcAttackSheets"),
    hint: L("GTWARBANDS.Settings.EnhancedNpcAttackSheetsHint"),
    scope: "world",
    config: true,
    type: Boolean,
    default: false,
    onChange: () => Hooks.callAll("gt-warbands.skirmishRulesChanged")
  });

  game.settings.register(MODULE_ID, SKIRMISH_RULES_SETTING, {
    name: L("GTWARBANDS.SkirmishRules.Title"),
    scope: "world",
    config: false,
    type: Object,
    default: cloneDefaults(),
    onChange: () => Hooks.callAll("gt-warbands.skirmishRulesChanged")
  });

  game.settings.registerMenu(MODULE_ID, SKIRMISH_RULES_MENU, {
    name: L("GTWARBANDS.SkirmishRules.Title"),
    label: L("GTWARBANDS.SkirmishRules.Configure"),
    hint: L("GTWARBANDS.SkirmishRules.Hint"),
    icon: "fas fa-people-group",
    type: SkirmishRulesConfig,
    restricted: true
  });
}
