import { registerSkirmishHooks, registerSkirmishSettings } from "./skirmish.mjs";

const MODULE_ID = "gt-warbands";
const WARBAND_TYPE = `${MODULE_ID}.warband`;
const ATTACK_TYPE = `${MODULE_ID}.attack`;

const ABILITY_KEYS = ["ability1A", "ability2A", "ability1B", "ability2B", "ability1C", "ability2C"];
const GENERIC_ABILITY_KEYS = {
  ability1A: "GTWARBANDS.Generic.Ability1A",
  ability2A: "GTWARBANDS.Generic.Ability2A",
  ability1B: "GTWARBANDS.Generic.Ability1B",
  ability2B: "GTWARBANDS.Generic.Ability2B",
  ability1C: "GTWARBANDS.Generic.Ability1C",
  ability2C: "GTWARBANDS.Generic.Ability2C"
};

const DEFAULT_PROFILE = Object.freeze({
  id: "shadowdark-default",
  name: "Shadowdark (Default)",
  labels: {
    basePower: "Base Power",
    power: "Power",
    veterancy: "Veterancy",
    effectiveness: "Effectiveness",
    attack: "Attack",
    ac: "AC",
    attacks: "Attacks",
    damage: "Damage",
    dominantAbility: "Dominant Ability",
    extraDamageDice: "Extra Damage Dice"
  },
  abilities: {
    ability1A: { generic: "Ability 1A", label: "Might" },
    ability2A: { generic: "Ability 2A", label: "Vigor" },
    ability1B: { generic: "Ability 1B", label: "Maneuver" },
    ability2B: { generic: "Ability 2B", label: "Cohesion" },
    ability1C: { generic: "Ability 1C", label: "Magic" },
    ability2C: { generic: "Ability 2C", label: "Leadership" }
  },
  formulas: {
    power: "basePower + veterancy",
    effectivenessDice: "ability1A + ability2A + ability1B + ability2B + ability1C + ability2C",
    attackBonus: "power + ability1A + ability1C",
    ac: "10 + ability1B + ability2B + ability1C",
    attacks: "1 + floor(ability2C / 2)",
    baseDamageDice: "dominantAbility",
    extraDamageDice: "extraDamageDice + max(0, ability1A - mightCap)",
    flatDamage: "ability1C"
  },
  effectiveness: {
    dieFaces: 8,
    bands: { full: 0.50, half: 0.25 }
  },
  damage: {
    mightCap: 5,
    mightDieFaces: { "0": 4, "1": 4, "2": 6, "3": 8, "4": 10, "5": 12 },
    ability1CProperty: {
      abilityKey: "ability1C",
      threshold: 1,
      label: "Magical",
      defenseLabel: "Nonmagical Damage"
    }
  }
});

const ALLOWED_VARIABLES = new Set([
  "basePower", "veterancy", "power",
  "ability1A", "ability2A", "ability1B", "ability2B", "ability1C", "ability2C",
  "dominantAbility", "extraDamageDice", "mightCap"
]);
const ALLOWED_FUNCTIONS = new Set(["floor", "ceil", "round", "min", "max", "abs"]);

function clone(obj) { return foundry.utils.deepClone(obj); }
function isWarband(actor) { return actor?.type === WARBAND_TYPE; }
function isWarbandAttack(item) { return item?.type === ATTACK_TYPE; }
function formatBonus(value) { const n = Number(value) || 0; return n >= 0 ? `+${n}` : `${n}`; }
function L(key) { return game.i18n.localize(key); }
function F(key, data = {}) { return game.i18n.format(key, data); }
function genericAbilityName(key) { return L(GENERIC_ABILITY_KEYS[key] ?? key); }

function getLocalizedDefaultProfile() {
  const p = clone(DEFAULT_PROFILE);
  p.name = L("GTWARBANDS.Profile.DefaultName");
  p.labels = {
    basePower: L("GTWARBANDS.Profile.Labels.BasePower"),
    power: L("GTWARBANDS.Profile.Labels.Power"),
    veterancy: L("GTWARBANDS.Profile.Labels.Veterancy"),
    effectiveness: L("GTWARBANDS.Profile.Labels.Effectiveness"),
    attack: L("GTWARBANDS.Profile.Labels.Attack"),
    ac: L("GTWARBANDS.Profile.Labels.AC"),
    attacks: L("GTWARBANDS.Profile.Labels.Attacks"),
    damage: L("GTWARBANDS.Profile.Labels.Damage"),
    dominantAbility: L("GTWARBANDS.Profile.Labels.DominantAbility"),
    extraDamageDice: L("GTWARBANDS.Profile.Labels.ExtraDamageDice")
  };
  p.abilities.ability1A.label = L("GTWARBANDS.Profile.Abilities.Might");
  p.abilities.ability2A.label = L("GTWARBANDS.Profile.Abilities.Vigor");
  p.abilities.ability1B.label = L("GTWARBANDS.Profile.Abilities.Maneuver");
  p.abilities.ability2B.label = L("GTWARBANDS.Profile.Abilities.Cohesion");
  p.abilities.ability1C.label = L("GTWARBANDS.Profile.Abilities.Magic");
  p.abilities.ability2C.label = L("GTWARBANDS.Profile.Abilities.Leadership");
  for (const key of ABILITY_KEYS) p.abilities[key].generic = genericAbilityName(key);
  p.damage.ability1CProperty.label = L("GTWARBANDS.Profile.Property.Magical");
  p.damage.ability1CProperty.defenseLabel = L("GTWARBANDS.Profile.Property.NonmagicalDamage");
  return p;
}

function stateLabel(state) {
  const keys = {
    full: "GTWARBANDS.State.Full",
    half: "GTWARBANDS.State.Half",
    quarter: "GTWARBANDS.State.Quarter",
    broken: "GTWARBANDS.State.Broken"
  };
  return L(keys[state] ?? keys.full);
}
function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, ch => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  })[ch]);
}

function registerSettings() {
  game.settings.register(MODULE_ID, "activeProfile", {
    name: L("GTWARBANDS.Settings.ActiveProfile"), scope: "world", config: false, type: String, default: "shadowdark-default"
  });
  game.settings.register(MODULE_ID, "customProfile", {
    name: L("GTWARBANDS.Settings.CustomProfile"), scope: "world", config: false, type: Object, default: clone(DEFAULT_PROFILE)
  });
  game.settings.registerMenu(MODULE_ID, "profileMenu", {
    name: game.i18n.localize("GTWARBANDS.ProfileMenu.Name"),
    label: game.i18n.localize("GTWARBANDS.ProfileMenu.Label"),
    hint: game.i18n.localize("GTWARBANDS.ProfileMenu.Hint"),
    icon: "fas fa-users-gear",
    type: WarbandProfileConfig,
    restricted: true
  });
}

function getCustomProfile() {
  const stored = game.settings.get(MODULE_ID, "customProfile") ?? {};
  return foundry.utils.mergeObject(clone(DEFAULT_PROFILE), clone(stored), {
    inplace: false, overwrite: true, insertKeys: true, insertValues: true
  });
}
function getActiveProfile() {
  return game.settings.get(MODULE_ID, "activeProfile") === "custom" ? getCustomProfile() : getLocalizedDefaultProfile();
}

function validateFormula(formula) {
  const text = String(formula ?? "").trim();
  if (!text) throw new Error(L("GTWARBANDS.Error.EmptyFormula"));
  if (!/^[0-9A-Za-z_+\-*/%().,\s]+$/.test(text)) throw new Error(F("GTWARBANDS.Error.UnsupportedFormula", { formula: text }));
  const ids = text.match(/[A-Za-z_][A-Za-z0-9_]*/g) ?? [];
  for (const id of ids) {
    if (!ALLOWED_VARIABLES.has(id) && !ALLOWED_FUNCTIONS.has(id)) throw new Error(F("GTWARBANDS.Error.UnknownIdentifier", { identifier: id }));
  }
  return text;
}
function evaluateFormula(formula, context) {
  const text = validateFormula(formula);
  const scope = { ...context, floor: Math.floor, ceil: Math.ceil, round: Math.round, min: Math.min, max: Math.max, abs: Math.abs };
  const fn = Function(...Object.keys(scope), `"use strict"; return (${text});`);
  const result = Number(fn(...Object.values(scope)));
  if (!Number.isFinite(result)) throw new Error(F("GTWARBANDS.Error.NonFiniteFormula", { formula: text }));
  return result;
}

function getFormulaContext(actor, additions = {}, profile = getActiveProfile()) {
  const s = actor?.system ?? {};
  return {
    basePower: Number(s.basePower ?? 0),
    veterancy: Number(s.veterancy ?? 0),
    power: Number(additions.power ?? 0),
    ability1A: Number(s.abilities?.ability1A ?? 0),
    ability2A: Number(s.abilities?.ability2A ?? 0),
    ability1B: Number(s.abilities?.ability1B ?? 0),
    ability2B: Number(s.abilities?.ability2B ?? 0),
    ability1C: Number(s.abilities?.ability1C ?? 0),
    ability2C: Number(s.abilities?.ability2C ?? 0),
    dominantAbility: Number(additions.dominantAbility ?? 0),
    extraDamageDice: Number(additions.extraDamageDice ?? 0),
    mightCap: Number(additions.mightCap ?? profile.damage.mightCap ?? 5)
  };
}

function getEffectivenessState(actor, profile = getActiveProfile()) {
  const current = Number(actor?.system?.effectiveness?.value ?? 0);
  const max = Number(actor?.system?.effectiveness?.max ?? 0);
  if (current <= 0) return "broken";
  if (max <= 0) return "full";
  const ratio = current / max;
  if (ratio > Number(profile.effectiveness.bands.full ?? 0.5)) return "full";
  if (ratio > Number(profile.effectiveness.bands.half ?? 0.25)) return "half";
  return "quarter";
}

function deriveWarband(actor, profile = getActiveProfile()) {
  const context = getFormulaContext(actor, {}, profile);
  const power = evaluateFormula(profile.formulas.power, context);
  context.power = power;
  const effectivenessDice = Math.max(0, Math.floor(evaluateFormula(profile.formulas.effectivenessDice, context)));
  const dieFaces = Math.max(2, Math.floor(Number(profile.effectiveness.dieFaces ?? 8)));
  return {
    power,
    effectivenessDice,
    effectivenessFormula: effectivenessDice > 0 ? `${effectivenessDice}d${dieFaces}` : "0",
    attackBonus: evaluateFormula(profile.formulas.attackBonus, context),
    ac: Math.max(0, Math.floor(evaluateFormula(profile.formulas.ac, context))),
    attacks: Math.max(1, Math.floor(evaluateFormula(profile.formulas.attacks, context))),
    state: getEffectivenessState(actor, profile)
  };
}

function getDominantAbilityKey(actor, attack = null) {
  const itemKey = String(attack?.system?.dominantAbility ?? "actor");
  if (ABILITY_KEYS.includes(itemKey)) return itemKey;
  const actorKey = String(actor?.system?.dominantAbility ?? "ability1A");
  return ABILITY_KEYS.includes(actorKey) ? actorKey : "ability1A";
}

function getDamageDieFaces(might, profile = getActiveProfile()) {
  const cap = Math.max(0, Math.floor(Number(profile.damage.mightCap ?? 5)));
  const capped = Math.min(Math.max(0, Math.floor(Number(might) || 0)), cap);
  const map = profile.damage.mightDieFaces ?? {};
  return Math.max(2, Math.floor(Number(map[String(capped)] ?? map[String(cap)] ?? 4)));
}

function hasAbility1CAttackProperty(actor, profile = getActiveProfile()) {
  const rule = profile.damage.ability1CProperty ?? {};
  const key = ABILITY_KEYS.includes(rule.abilityKey) ? rule.abilityKey : "ability1C";
  return Number(actor?.system?.abilities?.[key] ?? 0) >= Number(rule.threshold ?? 1);
}

function deriveDamage(actor, attack = null, profile = getActiveProfile()) {
  const dominantKey = getDominantAbilityKey(actor, attack);
  const dominantValue = Number(actor.system.abilities?.[dominantKey] ?? 0);
  const extraDamageDice = Number(actor.system.modifiers?.extraDamageDice ?? 0) + Number(attack?.system?.extraDamageDice ?? 0);
  const mightCap = Number(profile.damage.mightCap ?? 5);
  const context = getFormulaContext(actor, {
    power: deriveWarband(actor, profile).power,
    dominantAbility: dominantValue,
    extraDamageDice,
    mightCap
  }, profile);
  const baseDice = Math.max(0, Math.floor(evaluateFormula(profile.formulas.baseDamageDice, context)));
  const addedDice = Math.floor(evaluateFormula(profile.formulas.extraDamageDice, context));
  const dice = Math.max(0, baseDice + addedDice);
  const faces = getDamageDieFaces(context.ability1A, profile);
  const flat = Math.floor(evaluateFormula(profile.formulas.flatDamage, context));
  const magical = hasAbility1CAttackProperty(actor, profile);
  let formula = "0";
  if (dice > 0) formula = `${dice}d${faces}`;
  if (flat !== 0) formula = formula === "0" ? `${flat}` : `${formula}${flat >= 0 ? "+" : ""}${flat}`;
  return {
    dominantKey, dominantValue, baseDice, addedDice, dice, faces, flat, formula, magical,
    propertyLabel: profile.damage.ability1CProperty?.label ?? "Special"
  };
}

function getWarbandAttacks(actor) { return actor.items.filter(isWarbandAttack); }
function getDefaultAttack(actor, { meleeOnly = false } = {}) {
  const attacks = getWarbandAttacks(actor);
  const id = actor.system.defaultAttackId;
  const preferred = id ? actor.items.get(id) : null;
  if (preferred && isWarbandAttack(preferred) && (!meleeOnly || preferred.system.range === "melee")) return preferred;
  return attacks.find(i => !meleeOnly || i.system.range === "melee") ?? null;
}

function applyPropertyDefense(damage, attacker, defender, profile = getActiveProfile()) {
  const raw = Math.max(0, Math.floor(Number(damage) || 0));
  const special = hasAbility1CAttackProperty(attacker, profile);
  const mode = String(defender?.system?.defenses?.ability1CProperty ?? "normal");
  if (special || mode === "normal") return { raw, final: raw, mode: "normal", bypassed: special };
  if (mode === "immune") return { raw, final: 0, mode: "immune", bypassed: false };
  if (mode === "resistant") return { raw, final: Math.floor(raw / 2), mode: "resistant", bypassed: false };
  return { raw, final: raw, mode: "normal", bypassed: false };
}

async function rollEffectiveness(actor) {
  if (!isWarband(actor)) return;
  const profile = getActiveProfile();
  const d = deriveWarband(actor, profile);
  let total = 0;
  if (d.effectivenessDice > 0) {
    const roll = await new Roll(d.effectivenessFormula).evaluate();
    total = Math.max(0, Math.floor(roll.total));
    await roll.toMessage({
      speaker: ChatMessage.getSpeaker({ actor }),
      flavor: `${actor.name} — ${profile.labels.effectiveness} (${d.effectivenessFormula})`
    });
  }
  await actor.update({
    "system.effectiveness.value": total,
    "system.effectiveness.max": total,
    "system.effectiveness.rolledDice": d.effectivenessDice
  });
}

async function rollAbility(actor, key) {
  if (!isWarband(actor) || !ABILITY_KEYS.includes(key)) return;
  const profile = getActiveProfile();
  const label = profile.abilities[key]?.label ?? genericAbilityName(key);
  const bonus = Number(actor.system.abilities?.[key] ?? 0);
  const roll = await new Roll(`1d20 + ${bonus}`).evaluate();
  await roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor }), flavor: `${actor.name} — ${label} ${L("GTWARBANDS.Chat.Check")} (${formatBonus(bonus)})` });
}

async function rollPower(actor) {
  const profile = getActiveProfile();
  const power = deriveWarband(actor, profile).power;
  const roll = await new Roll(`1d20 + ${power}`).evaluate();
  await roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor }), flavor: `${actor.name} — ${profile.labels.power} ${L("GTWARBANDS.Chat.Check")} (${formatBonus(power)})` });
}

async function evaluateAttackSet(attacker, attack, defender = null) {
  const profile = getActiveProfile();
  const derived = deriveWarband(attacker, profile);
  const damage = deriveDamage(attacker, attack, profile);
  const targetAC = defender ? deriveWarband(defender, profile).ac : null;
  const results = [];

  for (let i = 0; i < derived.attacks; i++) {
    const attackRoll = await new Roll(`1d20 + ${derived.attackBonus}`).evaluate();
    const hit = defender ? attackRoll.total >= targetAC : null;
    let damageRoll = null;
    let defense = null;
    if (hit !== false) {
      if (damage.formula !== "0") damageRoll = await new Roll(damage.formula).evaluate();
      if (defender) defense = applyPropertyDefense(damageRoll?.total ?? 0, attacker, defender, profile);
    }
    results.push({ attackRoll, hit, damageRoll, defense });
  }

  return {
    attacker, defender, attack, derived, damage, targetAC, results,
    totalDamage: results.reduce((sum, r) => sum + (defender ? Number(r.defense?.final ?? 0) : Number(r.damageRoll?.total ?? 0)), 0)
  };
}

function renderAttackSetHtml(data) {
  const profile = getActiveProfile();
  const target = data.defender ? ` ${escapeHtml(L("GTWARBANDS.Chat.Versus"))} ${escapeHtml(data.defender.name)} (${escapeHtml(profile.labels.ac)} ${data.targetAC})` : "";
  const prop = data.damage.magical ? `<span class="gt-wb-chat-property">${escapeHtml(data.damage.propertyLabel)}</span>` : "";
  const rows = data.results.map((r, i) => {
    const hit = r.hit === null ? "" : r.hit ? ` — ${L("GTWARBANDS.Chat.Hit")}` : ` — ${L("GTWARBANDS.Chat.Miss")}`;
    const damage = r.hit === false ? "" : ` | ${L("GTWARBANDS.Chat.Damage")} ${r.damageRoll?.total ?? 0}${r.defense && r.defense.final !== r.defense.raw ? ` → ${r.defense.final}` : ""}`;
    return `<li><strong>#${i + 1}</strong> ${escapeHtml(profile.labels.attack)} ${r.attackRoll.total}${hit}${damage}</li>`;
  }).join("");
  return `<div class="gt-wb-chat-card"><h3>${escapeHtml(data.attacker.name)} — ${escapeHtml(data.attack?.name ?? profile.labels.attack)}${target}</h3><p><strong>${escapeHtml(profile.labels.attack)}:</strong> ${formatBonus(data.derived.attackBonus)} &nbsp; <strong>${escapeHtml(profile.labels.damage)}:</strong> ${escapeHtml(data.damage.formula)} ${prop}</p><ol>${rows}</ol>${data.defender ? `<p><strong>${escapeHtml(L("GTWARBANDS.Chat.TotalEffectivenessDamage"))}:</strong> ${data.totalDamage}</p>` : ""}</div>`;
}

async function rollAttack(actor, attack) {
  const targets = [...game.user.targets].map(t => t.actor).filter(a => a && isWarband(a) && a.id !== actor.id);
  if (targets.length > 1) return ui.notifications.warn(L("GTWARBANDS.Notification.TargetZeroOrOne"));
  const data = await evaluateAttackSet(actor, attack, targets[0] ?? null);
  await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: renderAttackSetHtml(data) });
}

async function resolveMeleeExchange(attacker) {
  if (!isWarband(attacker)) return;
  const targets = [...game.user.targets].map(t => t.actor).filter(a => a && isWarband(a) && a.id !== attacker.id);
  if (targets.length !== 1) return ui.notifications.warn(L("GTWARBANDS.Notification.TargetExactlyOne"));
  const defender = targets[0];
  const aAttack = getDefaultAttack(attacker, { meleeOnly: true });
  const dAttack = getDefaultAttack(defender, { meleeOnly: true });
  if (!aAttack) return ui.notifications.warn(F("GTWARBANDS.Notification.NoMeleeAttack", { name: attacker.name }));
  if (!dAttack) return ui.notifications.warn(F("GTWARBANDS.Notification.NoMeleeAttack", { name: defender.name }));

  // Both complete attack sets are rolled before either Effectiveness value is changed.
  const aResult = await evaluateAttackSet(attacker, aAttack, defender);
  const dResult = await evaluateAttackSet(defender, dAttack, attacker);
  const aBefore = Number(attacker.system.effectiveness.value ?? 0);
  const dBefore = Number(defender.system.effectiveness.value ?? 0);
  const aAfter = Math.max(0, aBefore - dResult.totalDamage);
  const dAfter = Math.max(0, dBefore - aResult.totalDamage);
  await attacker.update({ "system.effectiveness.value": aAfter });
  await defender.update({ "system.effectiveness.value": dAfter });

  const p = getActiveProfile();
  const content = `<div class="gt-wb-chat-card gt-wb-exchange-card"><h2>${escapeHtml(L("GTWARBANDS.Chat.MeleeExchange"))}</h2>${renderAttackSetHtml(aResult)}<p><strong>${escapeHtml(defender.name)}:</strong> ${dBefore} → ${dAfter} ${escapeHtml(p.labels.effectiveness)}</p><hr>${renderAttackSetHtml(dResult)}<p><strong>${escapeHtml(attacker.name)}:</strong> ${aBefore} → ${aAfter} ${escapeHtml(p.labels.effectiveness)}</p><p><em>${escapeHtml(L("GTWARBANDS.Chat.SimultaneousNote"))}</em></p></div>`;
  await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor: attacker }), content });
}

class WarbandModel extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    const f = foundry.data.fields;
    const ability = () => new f.NumberField({ required: true, nullable: false, integer: true, min: 0, initial: 0 });
    return {
      basePower: new f.NumberField({ required: true, nullable: false, integer: true, min: 0, initial: 0 }),
      veterancy: new f.NumberField({ required: true, nullable: false, integer: true, min: 0, initial: 0 }),
      abilities: new f.SchemaField({
        ability1A: ability(), ability2A: ability(), ability1B: ability(), ability2B: ability(), ability1C: ability(), ability2C: ability()
      }),
      dominantAbility: new f.StringField({ required: true, nullable: false, initial: "ability1A" }),
      defaultAttackId: new f.StringField({ required: true, nullable: false, blank: true, initial: "" }),
      modifiers: new f.SchemaField({
        extraDamageDice: new f.NumberField({ required: true, nullable: false, integer: true, initial: 0 })
      }),
      effectiveness: new f.SchemaField({
        value: new f.NumberField({ required: true, nullable: false, integer: true, min: 0, initial: 0 }),
        max: new f.NumberField({ required: true, nullable: false, integer: true, min: 0, initial: 0 }),
        rolledDice: new f.NumberField({ required: true, nullable: false, integer: true, min: 0, initial: 0 })
      }),
      defenses: new f.SchemaField({
        ability1CProperty: new f.StringField({ required: true, nullable: false, initial: "normal" })
      }),
      notes: new f.StringField({ required: true, nullable: false, blank: true, initial: "" })
    };
  }
}

class WarbandAttackModel extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    const f = foundry.data.fields;
    return {
      range: new f.StringField({ required: true, nullable: false, initial: "melee" }),
      dominantAbility: new f.StringField({ required: true, nullable: false, initial: "actor" }),
      extraDamageDice: new f.NumberField({ required: true, nullable: false, integer: true, initial: 0 }),
      notes: new f.StringField({ required: true, nullable: false, blank: true, initial: "" })
    };
  }
}

const ActorSheetV1 = foundry.appv1.sheets.ActorSheet;
const ItemSheetV1 = foundry.appv1.sheets.ItemSheet;
const FormApplicationV1 = foundry.appv1.api.FormApplication;

class WarbandSheet extends ActorSheetV1 {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["gt-warbands", "sheet", "actor", "warband"],
      width: 700,
      height: 820,
      resizable: true,
      submitOnChange: true,
      closeOnSubmit: false
    });
  }

  get template() { return `modules/${MODULE_ID}/templates/actor/warband-sheet.hbs`; }

  async getData(options = {}) {
    const context = await super.getData(options);
    const profile = getActiveProfile();
    const derived = deriveWarband(this.actor, profile);
    const source = this.actor.system;
    const staleEffectiveness = Number(source.effectiveness.rolledDice ?? 0) !== derived.effectivenessDice;
    const abilityRows = [
      ["ability1A", "ability2A"],
      ["ability1B", "ability2B"],
      ["ability1C", "ability2C"]
    ].map(row => row.map(key => ({
      key,
      generic: genericAbilityName(key),
      label: profile.abilities[key]?.label ?? genericAbilityName(key),
      value: Number(source.abilities?.[key] ?? 0)
    })));
    const dominantOptions = ABILITY_KEYS.map(key => ({
      key,
      label: profile.abilities[key]?.label ?? genericAbilityName(key),
      selected: source.dominantAbility === key
    }));
    const fallback = getDefaultAttack(this.actor);
    const attacks = getWarbandAttacks(this.actor).map(item => {
      const damage = deriveDamage(this.actor, item, profile);
      return {
        id: item.id,
        name: item.name,
        range: item.system.range,
        rangeLabel: L({
          melee: "GTWARBANDS.Range.Melee",
          ranged: "GTWARBANDS.Range.Ranged",
          special: "GTWARBANDS.Range.Special"
        }[item.system.range] ?? "GTWARBANDS.Range.Special"),
        isDefault: item.id === source.defaultAttackId || (!source.defaultAttackId && item.id === fallback?.id),
        damageFormula: damage.formula,
        dominantLabel: profile.abilities[damage.dominantKey]?.label ?? genericAbilityName(damage.dominantKey),
        magical: damage.magical,
        propertyLabel: damage.propertyLabel
      };
    });
    const defenseOptions = [
      { value: "normal", label: L("GTWARBANDS.Defense.Normal"), selected: source.defenses.ability1CProperty === "normal" },
      { value: "resistant", label: L("GTWARBANDS.Defense.Resistant"), selected: source.defenses.ability1CProperty === "resistant" },
      { value: "immune", label: L("GTWARBANDS.Defense.Immune"), selected: source.defenses.ability1CProperty === "immune" }
    ];
    return {
      ...context,
      actor: this.actor,
      system: source,
      profile,
      derived,
      abilityRows,
      dominantOptions,
      attacks,
      defenseOptions,
      staleEffectiveness,
      currentDamage: deriveDamage(this.actor, null, profile),
      stateLabel: stateLabel(derived.state)
    };
  }

  activateListeners(html) {
    super.activateListeners(html);
    html.find("[data-action='roll-effectiveness']").on("click", async e => { e.preventDefault(); await rollEffectiveness(this.actor); });
    html.find("[data-action='roll-power']").on("click", async e => { e.preventDefault(); await rollPower(this.actor); });
    html.find("[data-action='roll-ability']").on("click", async e => { e.preventDefault(); await rollAbility(this.actor, e.currentTarget.dataset.ability); });
    html.find("[data-action='create-attack']").on("click", async e => {
      e.preventDefault();
      const [item] = await this.actor.createEmbeddedDocuments("Item", [{ name: L("GTWARBANDS.AttackSheet.AttackName"), type: ATTACK_TYPE }]);
      item?.sheet?.render(true);
    });
    html.find("[data-action='edit-attack']").on("click", e => {
      e.preventDefault();
      const id = e.currentTarget.closest("[data-item-id]")?.dataset.itemId;
      this.actor.items.get(id)?.sheet?.render(true);
    });
    html.find("[data-action='delete-attack']").on("click", async e => {
      e.preventDefault();
      const id = e.currentTarget.closest("[data-item-id]")?.dataset.itemId;
      if (id) await this.actor.deleteEmbeddedDocuments("Item", [id]);
    });
    html.find("[data-action='set-default-attack']").on("click", async e => {
      e.preventDefault();
      const id = e.currentTarget.closest("[data-item-id]")?.dataset.itemId ?? "";
      await this.actor.update({ "system.defaultAttackId": id });
    });
    html.find("[data-action='roll-attack']").on("click", async e => {
      e.preventDefault();
      const id = e.currentTarget.closest("[data-item-id]")?.dataset.itemId;
      const item = id ? this.actor.items.get(id) : null;
      if (item) await rollAttack(this.actor, item);
    });
    html.find("[data-action='melee-exchange']").on("click", async e => { e.preventDefault(); await resolveMeleeExchange(this.actor); });
  }
}

class WarbandAttackSheet extends ItemSheetV1 {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["gt-warbands", "sheet", "item", "warband-attack"],
      width: 500,
      height: 500,
      resizable: true,
      submitOnChange: true,
      closeOnSubmit: false
    });
  }

  get template() { return `modules/${MODULE_ID}/templates/item/warband-attack-sheet.hbs`; }

  async getData(options = {}) {
    const context = await super.getData(options);
    const profile = getActiveProfile();
    const actor = this.item.parent?.documentName === "Actor" && isWarband(this.item.parent) ? this.item.parent : null;
    const dominantOptions = [
      { key: "actor", label: L("GTWARBANDS.AttackSheet.UseDefault"), selected: this.item.system.dominantAbility === "actor" },
      ...ABILITY_KEYS.map(key => ({
        key,
        label: `${profile.abilities[key]?.label ?? genericAbilityName(key)} (${genericAbilityName(key)})`,
        selected: this.item.system.dominantAbility === key
      }))
    ];
    const rangeOptions = [
      { value: "melee", label: L("GTWARBANDS.Range.Melee"), selected: this.item.system.range === "melee" },
      { value: "ranged", label: L("GTWARBANDS.Range.Ranged"), selected: this.item.system.range === "ranged" },
      { value: "special", label: L("GTWARBANDS.Range.Special"), selected: this.item.system.range === "special" }
    ];
    return {
      ...context,
      item: this.item,
      system: this.item.system,
      profile,
      actor,
      dominantOptions,
      rangeOptions,
      damage: actor ? deriveDamage(actor, this.item, profile) : null
    };
  }
}

class WarbandProfileConfig extends FormApplicationV1 {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: "gt-warbands-profile-config",
      title: L("GTWARBANDS.ProfileConfig.Title"),
      template: `modules/${MODULE_ID}/templates/apps/profile-config.hbs`,
      width: 760,
      height: 820,
      resizable: true,
      closeOnSubmit: false,
      submitOnChange: false
    });
  }

  async getData(options = {}) {
    const context = await super.getData(options);
    const activeProfile = game.settings.get(MODULE_ID, "activeProfile");
    const custom = getCustomProfile();
    return {
      ...context,
      profiles: [
        { value: "shadowdark-default", label: L("GTWARBANDS.Profile.DefaultName"), selected: activeProfile !== "custom" },
        { value: "custom", label: custom.name || L("GTWARBANDS.Profile.CustomName"), selected: activeProfile === "custom" }
      ],
      custom,
      qualityLabelRows: [
        ["basePower", "GTWARBANDS.Quality.Base"], ["power", "GTWARBANDS.Quality.Derived"], ["veterancy", "GTWARBANDS.Quality.Experience"],
        ["effectiveness", "GTWARBANDS.Quality.Durability"], ["attack", "GTWARBANDS.Quality.Attack"], ["ac", "GTWARBANDS.Quality.Defense"],
        ["attacks", "GTWARBANDS.Quality.AttackCount"], ["damage", "GTWARBANDS.Quality.Damage"], ["dominantAbility", "GTWARBANDS.Quality.DominantAbility"],
        ["extraDamageDice", "GTWARBANDS.Quality.ExtraDamageDice"]
      ].map(([key, genericKey]) => ({ key, generic: L(genericKey), label: custom.labels[key] ?? L(genericKey) })),
      abilityRows: ABILITY_KEYS.map(key => ({ key, generic: genericAbilityName(key), label: custom.abilities[key]?.label ?? genericAbilityName(key) })),
      formulaRows: [
        ["power", "GTWARBANDS.Formula.Power"], ["effectivenessDice", "GTWARBANDS.Formula.EffectivenessDice"], ["attackBonus", "GTWARBANDS.Formula.AttackBonus"], ["ac", "GTWARBANDS.Formula.AC"],
        ["attacks", "GTWARBANDS.Formula.Attacks"], ["baseDamageDice", "GTWARBANDS.Formula.BaseDamageDice"], ["extraDamageDice", "GTWARBANDS.Formula.AdditionalDamageDice"], ["flatDamage", "GTWARBANDS.Formula.FlatDamage"]
      ].map(([key, labelKey]) => ({ key, label: L(labelKey), value: custom.formulas[key] })),
      propertyAbilityOptions: ABILITY_KEYS.map(key => ({
        key,
        label: `${genericAbilityName(key)} — ${custom.abilities[key]?.label ?? genericAbilityName(key)}`,
        selected: custom.damage.ability1CProperty.abilityKey === key
      }))
    };
  }

  activateListeners(html) {
    super.activateListeners(html);
    html.find("[data-action='clone-default']").on("click", async e => {
      e.preventDefault();
      const profile = getLocalizedDefaultProfile();
      profile.id = "custom";
      profile.name = L("GTWARBANDS.Profile.CustomName");
      await game.settings.set(MODULE_ID, "customProfile", profile);
      await game.settings.set(MODULE_ID, "activeProfile", "custom");
      ui.notifications.info(L("GTWARBANDS.Notification.Cloned"));
      this.render(false);
    });
    html.find("[data-action='reset-custom']").on("click", async e => {
      e.preventDefault();
      const profile = getLocalizedDefaultProfile();
      profile.id = "custom";
      profile.name = L("GTWARBANDS.Profile.CustomName");
      await game.settings.set(MODULE_ID, "customProfile", profile);
      ui.notifications.info(L("GTWARBANDS.Notification.Reset"));
      this.render(false);
    });
  }

  async _updateObject(_event, formData) {
    const data = foundry.utils.expandObject(formData);
    const active = data.activeProfile === "custom" ? "custom" : "shadowdark-default";
    await game.settings.set(MODULE_ID, "activeProfile", active);

    if (active === "custom") {
      const p = getCustomProfile();
      p.id = "custom";
      p.name = String(data.custom?.name ?? L("GTWARBANDS.Profile.CustomName")).trim() || L("GTWARBANDS.Profile.CustomName");
      for (const key of Object.keys(p.labels)) {
        p.labels[key] = String(data.custom?.labels?.[key] ?? p.labels[key]).trim() || p.labels[key];
      }
      for (const key of ABILITY_KEYS) {
        p.abilities[key].generic = genericAbilityName(key);
        p.abilities[key].label = String(data.custom?.abilities?.[key]?.label ?? genericAbilityName(key)).trim() || genericAbilityName(key);
      }
      for (const key of Object.keys(p.formulas)) {
        p.formulas[key] = validateFormula(String(data.custom?.formulas?.[key] ?? p.formulas[key]).trim());
      }
      p.effectiveness.dieFaces = Math.max(2, Math.floor(Number(data.custom?.effectiveness?.dieFaces ?? p.effectiveness.dieFaces)));
      const full = Number(data.custom?.effectiveness?.bands?.full);
      const half = Number(data.custom?.effectiveness?.bands?.half);
      if (!(full > half && full < 1 && half >= 0)) throw new Error(L("GTWARBANDS.Error.BadThresholds"));
      p.effectiveness.bands.full = full;
      p.effectiveness.bands.half = half;
      p.damage.mightCap = Math.max(0, Math.floor(Number(data.custom?.damage?.mightCap ?? p.damage.mightCap)));
      for (const n of ["0", "1", "2", "3", "4", "5"]) {
        p.damage.mightDieFaces[n] = Math.max(2, Math.floor(Number(data.custom?.damage?.mightDieFaces?.[n] ?? p.damage.mightDieFaces[n])));
      }
      const rule = p.damage.ability1CProperty;
      const ruleKey = String(data.custom?.damage?.ability1CProperty?.abilityKey ?? rule.abilityKey);
      rule.abilityKey = ABILITY_KEYS.includes(ruleKey) ? ruleKey : "ability1C";
      rule.threshold = Number(data.custom?.damage?.ability1CProperty?.threshold ?? rule.threshold);
      rule.label = String(data.custom?.damage?.ability1CProperty?.label ?? rule.label).trim() || "Special";
      rule.defenseLabel = String(data.custom?.damage?.ability1CProperty?.defenseLabel ?? rule.defenseLabel).trim() || "Property Defense";

      const fake = { system: {
        basePower: 1, veterancy: 1,
        abilities: Object.fromEntries(ABILITY_KEYS.map(k => [k, 1])),
        dominantAbility: "ability1A", modifiers: { extraDamageDice: 0 },
        effectiveness: { value: 1, max: 1, rolledDice: 6 }
      }};
      deriveWarband(fake, p);
      deriveDamage(fake, null, p);
      await game.settings.set(MODULE_ID, "customProfile", p);
    }

    for (const actor of game.actors.filter(isWarband)) actor.sheet?.render(false);
    ui.notifications.info(F("GTWARBANDS.Notification.ProfileActive", { name: getActiveProfile().name }));
    this.render(false);
  }
}

Hooks.once("init", () => {
  registerSettings();
  registerSkirmishSettings();
  registerSkirmishHooks();
  Object.assign(CONFIG.Actor.dataModels, { [WARBAND_TYPE]: WarbandModel });
  Object.assign(CONFIG.Item.dataModels, { [ATTACK_TYPE]: WarbandAttackModel });
  const DSC = foundry.applications.apps.DocumentSheetConfig;
  DSC.registerSheet(foundry.documents.Actor, MODULE_ID, WarbandSheet, { types: [WARBAND_TYPE], makeDefault: true, label: "GT-Warbands" });
  DSC.registerSheet(foundry.documents.Item, MODULE_ID, WarbandAttackSheet, { types: [ATTACK_TYPE], makeDefault: true, label: L("TYPES.Item.gt-warbands.attack") });
  console.log(`${MODULE_ID} | Registered Warband Actor and Attack subtypes.`);
});

Hooks.once("ready", () => {
  const mod = game.modules.get(MODULE_ID);
  if (mod) mod.api = {
    WARBAND_TYPE, ATTACK_TYPE, DEFAULT_PROFILE, getActiveProfile, deriveWarband, deriveDamage,
    rollEffectiveness, rollAttack, resolveMeleeExchange, applyPropertyDefense
  };
  if (game.system.id !== "shadowdark") ui.notifications.warn(L("GTWARBANDS.Notification.WrongSystem"));
  console.log(`${MODULE_ID} | Ready — ${getActiveProfile().name}`);
});
