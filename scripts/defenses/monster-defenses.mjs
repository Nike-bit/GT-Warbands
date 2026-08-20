import { localize as L } from "../localization.mjs";
import {
  DEFENSES_FLAG,
  DEFENSE_MODES,
  MIGRATION_SETTING,
  MIGRATION_VERSION,
  MODULE_ID,
  PHYSICAL_ABILITIES,
  SPELL_ABILITIES,
  getDefenses,
  migrateActorDefenses,
  monsterDefensesEnabled,
  normalizeAbility,
  saveDefenses,
  standaloneMonsterDefensesActive,
  toInteger
} from "./defense-data.mjs";
import {
  activateMonsterDefensesSheetListeners,
  attackTraitControlsActive,
  getAttackTraits,
  isNpcAttackItem,
  migrateAttackTraits,
  saveAttackTraits
} from "./attack-traits.mjs";
import { applyNonmagicalDefense, beautifyResistanceChat } from "./physical-defense.mjs";
import { applySpellDefense } from "./spell-defense.mjs";

function htmlRoot(html) {
  if (html instanceof HTMLElement) return html;
  if (html?.[0] instanceof HTMLElement) return html[0];
  return null;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  })[character]);
}

function option(value, label, selected) {
  return `<option value="${escapeHtml(value)}"${value === selected ? " selected" : ""}>${escapeHtml(label)}</option>`;
}

function abilityOptions(values, selected) {
  const keys = {
    any: "GTWARBANDS.Compatibility.Any", str: "GTWARBANDS.Compatibility.Strength", dex: "GTWARBANDS.Compatibility.Dexterity",
    int: "GTWARBANDS.MonsterDefenses.Intelligence", wis: "GTWARBANDS.MonsterDefenses.Wisdom", cha: "GTWARBANDS.MonsterDefenses.Charisma"
  };
  return values.map(value => option(value, L(keys[value]), selected)).join("");
}

function defenseModeOptions(selected) {
  const keys = {
    normal: "GTWARBANDS.Defense.Normal", resistant: "GTWARBANDS.Defense.Resistant",
    immune: "GTWARBANDS.Defense.Immune", override: "GTWARBANDS.MonsterDefenses.Override"
  };
  return DEFENSE_MODES.map(value => option(value, L(keys[value]), selected)).join("");
}

async function updateDefense(actor, mutate) {
  const state = getDefenses(actor, { authoritative: false });
  mutate(state);
  try { await saveDefenses(actor, state); }
  catch (error) {
    ui.notifications.error(L("GTWARBANDS.Notification.MonsterDefensesSaveFailed"));
    console.error(`${MODULE_ID} | Failed to save Monster Defenses.`, error);
  }
}

function injectNpcDefenseFields(app, html) {
  if (game.system.id !== "shadowdark" || !monsterDefensesEnabled() || standaloneMonsterDefensesActive()) return;
  const actor = app?.actor ?? app?.document;
  if (actor?.type !== "NPC") return;
  const root = htmlRoot(html);
  if (!root || root.querySelector(".gtw-defenses-box")) return;
  const featuresBox = root.querySelector('a[data-action="item-create"][data-item-type="NPC Feature"]')?.closest?.(".SD-box");
  if (!featuresBox) return;

  const defenses = getDefenses(actor, { authoritative: false });
  const editable = Boolean(app?.isEditable && actor.isOwner);
  const disabled = editable ? "" : " disabled";
  const block = document.createElement("div");
  block.className = "SD-box gtw-defenses-box";
  block.innerHTML = `
    <div class="header gtw-defenses-header"><label>${escapeHtml(L("GTWARBANDS.MonsterDefenses.Title"))}</label></div>
    <div class="content gtw-defenses-content">
      <section class="gtw-defense-panel gtw-physical-panel">
        <div class="gtw-defense-panel-title">${escapeHtml(L("GTWARBANDS.Skirmish.Nonmagical"))}</div>
        <label class="gtw-defense-control gtw-defense-stacked">
          <span>${escapeHtml(L("GTWARBANDS.MonsterDefenses.Defense"))}</span>
          <select class="gtw-nonmagical-mode" data-tooltip="${escapeHtml(L("GTWARBANDS.MonsterDefenses.DefenseHint"))}"${disabled}>${defenseModeOptions(defenses.nonmagical.mode)}</select>
        </label>
        <label class="gtw-defense-control gtw-defense-stacked gtw-attack-ability-row">
          <span>${escapeHtml(L("GTWARBANDS.Compatibility.AttackAbility"))}</span>
          <select class="gtw-attack-ability" data-tooltip="${escapeHtml(L("GTWARBANDS.MonsterDefenses.AttackAbilityHint"))}"${disabled}>${abilityOptions(PHYSICAL_ABILITIES, defenses.nonmagical.attackAbility)}</select>
        </label>
        <label class="gtw-defense-control gtw-defense-inline gtw-override-row">
          <span>${escapeHtml(L("GTWARBANDS.Skirmish.Damage"))}</span>
          <input class="gtw-nonmagical-override" type="number" min="0" step="1" value="${defenses.nonmagical.override}" data-tooltip="${escapeHtml(L("GTWARBANDS.MonsterDefenses.OverrideHint"))}"${disabled}>
        </label>
      </section>
      <section class="gtw-defense-panel gtw-spell-panel">
        <label class="gtw-defense-panel-title gtw-spell-title">
          <span>${escapeHtml(L("GTWARBANDS.MonsterDefenses.SpellDefense"))}</span>
          <input class="gtw-spell-enabled" type="checkbox" data-tooltip="${escapeHtml(L("GTWARBANDS.MonsterDefenses.SpellDefenseHint"))}"${defenses.spell.enabled ? " checked" : ""}${disabled}>
        </label>
        <label class="gtw-defense-control gtw-defense-inline gtw-spell-dc-row">
          <span>${escapeHtml(L("GTWARBANDS.MonsterDefenses.SpellDc"))}</span>
          <input class="gtw-spell-dc" type="number" min="1" step="1" value="${defenses.spell.dc}"${disabled}>
        </label>
        <label class="gtw-defense-control gtw-defense-stacked gtw-spell-ability-row">
          <span>${escapeHtml(L("GTWARBANDS.MonsterDefenses.CastingAbility"))}</span>
          <select class="gtw-spell-ability"${disabled}>${abilityOptions(SPELL_ABILITIES, defenses.spell.castingAbility)}</select>
        </label>
      </section>
    </div>`;
  featuresBox.insertAdjacentElement("beforebegin", block);

  const mode = block.querySelector(".gtw-nonmagical-mode");
  const attackAbilityRow = block.querySelector(".gtw-attack-ability-row");
  const attackAbility = block.querySelector(".gtw-attack-ability");
  const overrideRow = block.querySelector(".gtw-override-row");
  const override = block.querySelector(".gtw-nonmagical-override");
  const spellEnabled = block.querySelector(".gtw-spell-enabled");
  const spellDcRow = block.querySelector(".gtw-spell-dc-row");
  const spellDc = block.querySelector(".gtw-spell-dc");
  const spellAbilityRow = block.querySelector(".gtw-spell-ability-row");
  const spellAbility = block.querySelector(".gtw-spell-ability");
  const refresh = () => {
    const physical = mode.value !== "normal";
    attackAbilityRow.classList.toggle("gtw-defense-hidden", !physical);
    attackAbility.disabled = !editable || !physical;
    const fixed = mode.value === "override";
    overrideRow.classList.toggle("gtw-defense-hidden", !fixed);
    override.disabled = !editable || !fixed;
    const spell = spellEnabled.checked;
    spellDcRow.classList.toggle("gtw-defense-hidden", !spell);
    spellAbilityRow.classList.toggle("gtw-defense-hidden", !spell);
    spellDc.disabled = !editable || !spell;
    spellAbility.disabled = !editable || !spell;
  };
  refresh();
  if (!editable) return;
  mode.addEventListener("change", async event => { event.stopPropagation(); refresh(); await updateDefense(actor, state => { state.nonmagical.mode = DEFENSE_MODES.includes(mode.value) ? mode.value : "normal"; }); });
  attackAbility.addEventListener("change", async event => { event.stopPropagation(); await updateDefense(actor, state => { state.nonmagical.attackAbility = normalizeAbility(attackAbility.value, PHYSICAL_ABILITIES); }); });
  override.addEventListener("change", async event => { event.stopPropagation(); await updateDefense(actor, state => { state.nonmagical.override = toInteger(override.value, state.nonmagical.override, 0); override.value = state.nonmagical.override; }); });
  spellEnabled.addEventListener("change", async event => { event.stopPropagation(); refresh(); await updateDefense(actor, state => { state.spell.enabled = spellEnabled.checked; }); });
  spellDc.addEventListener("change", async event => { event.stopPropagation(); await updateDefense(actor, state => { state.spell.dc = toInteger(spellDc.value, state.spell.dc, 1); spellDc.value = state.spell.dc; }); });
  spellAbility.addEventListener("change", async event => { event.stopPropagation(); await updateDefense(actor, state => { state.spell.castingAbility = normalizeAbility(spellAbility.value, SPELL_ABILITIES); }); });
}

function injectNativeNpcAttackTraits(app, html) {
  if (game.system.id !== "shadowdark" || !monsterDefensesEnabled() || standaloneMonsterDefensesActive()) return;
  const item = app?.item ?? app?.document;
  if (!isNpcAttackItem(item)) return;
  const root = htmlRoot(html);
  if (!root || root.matches('[data-gt-warbands-enhanced-npc-attack="true"]')
    || root.querySelector('[data-gt-warbands-enhanced-npc-attack="true"]')
    || root.querySelector(".gtw-npc-attack-traits")) return;
  const special = root.querySelector('input[name="system.damage.special"]');
  if (!special?.parentElement) return;
  const traits = getAttackTraits(item, { authoritative: false });
  const editable = Boolean(app?.isEditable && item.isOwner);
  const block = document.createElement("div");
  block.className = "gtw-npc-attack-traits";
  block.innerHTML = `
    <h3>${escapeHtml(L("GTWARBANDS.MonsterDefenses.AttackTraits"))}</h3>
    <label><span>${escapeHtml(L("GTWARBANDS.Compatibility.MagicalAttack"))}</span><input type="checkbox" data-gtw-defense-field="magical" data-gtw-previous="${traits.magical}"${traits.magical ? " checked" : ""}${editable ? "" : " disabled"}></label>
    <label><span>${escapeHtml(L("GTWARBANDS.Compatibility.AttackAbility"))}</span><select data-gtw-defense-field="ability" data-gtw-previous="${traits.ability}"${editable ? "" : " disabled"}>${abilityOptions(PHYSICAL_ABILITIES, traits.ability)}</select></label>`;
  special.parentElement.append(block);
  activateMonsterDefensesSheetListeners({ sheet: app, item, root: block });
}

async function migrateLegacyData() {
  if (!game.user.isGM) return;
  if (Number(game.settings.get(MODULE_ID, MIGRATION_SETTING) ?? 0) >= MIGRATION_VERSION) return;
  let actorCount = 0;
  let itemCount = 0;
  for (const actor of game.actors ?? []) {
    if (await migrateActorDefenses(actor)) actorCount++;
    for (const item of actor.items ?? []) if (await migrateAttackTraits(item)) itemCount++;
  }
  for (const scene of game.scenes ?? []) {
    for (const token of scene.tokens ?? []) {
      if (token.actorLink || !token.actor) continue;
      if (await migrateActorDefenses(token.actor)) actorCount++;
      for (const item of token.actor.items ?? []) if (await migrateAttackTraits(item)) itemCount++;
    }
  }
  await game.settings.set(MODULE_ID, MIGRATION_SETTING, MIGRATION_VERSION);
  if (actorCount || itemCount) {
    ui.notifications.info(L("GTWARBANDS.Notification.MonsterDefensesMigrated"));
    console.log(`${MODULE_ID} | Migrated Monster Defenses for ${actorCount} Actors and ${itemCount} Items; legacy flags were retained.`);
  }
}

function builtInRollsActive() {
  return game.system.id === "shadowdark" && monsterDefensesEnabled() && !standaloneMonsterDefensesActive();
}

export function registerMonsterDefensesSettings() {
  game.settings.register(MODULE_ID, "enableMonsterDefenses", {
    name: L("GTWARBANDS.Settings.EnableMonsterDefenses"),
    hint: L("GTWARBANDS.Settings.EnableMonsterDefensesHint"),
    scope: "world", config: true, type: Boolean, default: false,
    onChange: () => {
      for (const app of Object.values(ui.windows ?? {})) app?.render?.(false);
    }
  });
  game.settings.register(MODULE_ID, MIGRATION_SETTING, {
    name: "GT-Warbands Monster Defenses migration version",
    scope: "world", config: false, type: Number, default: 0
  });
}

export function registerMonsterDefensesHooks() {
  Hooks.on("renderActorSheet", injectNpcDefenseFields);
  Hooks.on("renderNpcSheetSD", injectNpcDefenseFields);
  Hooks.on("renderItemSheet", injectNativeNpcAttackTraits);
  Hooks.on("renderItemSheetSD", injectNativeNpcAttackTraits);
  Hooks.on("SD-Player-Attack", config => builtInRollsActive() ? applyNonmagicalDefense(config) : true);
  Hooks.on("SD-NPC-Attack", config => builtInRollsActive() ? applyNonmagicalDefense(config) : true);
  Hooks.on("SD-Player-Spell", config => builtInRollsActive() ? applySpellDefense(config) : true);
  Hooks.on("SD-NPC-Spell-Cast", config => builtInRollsActive() ? applySpellDefense(config) : true);
  Hooks.on("renderChatMessageHTML", (message, html) => { if (builtInRollsActive()) beautifyResistanceChat(message, html); });
}

export async function activateMonsterDefenses() {
  try { await migrateLegacyData(); }
  catch (error) { console.error(`${MODULE_ID} | Monster Defenses migration failed.`, error); }
  if (standaloneMonsterDefensesActive()) {
    ui.notifications.warn(L("GTWARBANDS.Notification.StandaloneMonsterDefensesActive"), { permanent: true });
  }
}

export { attackTraitControlsActive, DEFENSES_FLAG };
