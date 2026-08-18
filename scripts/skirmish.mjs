import { format as formatGtw, localize as localizeGtw } from "./localization.mjs";

const MODULE_ID = "gt-warbands";
const SHADOWDARK_SYSTEM_ID = "shadowdark";
const SHADOWDARK_NPC_TYPE = "NPC";
const SHADOWDARK_NPC_ATTACK_TYPE = "NPC Attack";
const SKIRMISH_SETTING = "enableSkirmishNpcSupport";
const SKIRMISH_FLAG = "isSkirmishWarband";
const CONDITION_OVERRIDE_FLAG = "conditionOverride";
const SKIRMISH_PROFILES_FLAG = "skirmishProfiles";
const TOGGLE_CLASS = "gt-wb-skirmish-toggle";
const CONDITION_CLASS = "gt-wb-skirmish-condition";
const PROFILES_CLASS = "gt-wb-skirmish-profiles";

const COMBAT_CONDITIONS = Object.freeze(["fresh", "worn", "battered"]);
const ALL_CONDITIONS = Object.freeze([...COMBAT_CONDITIONS, "defeated"]);
const CONDITION_KEYS = Object.freeze({
  fresh: "GTWARBANDS.Skirmish.Fresh",
  worn: "GTWARBANDS.Skirmish.Worn",
  battered: "GTWARBANDS.Skirmish.Battered",
  defeated: "GTWARBANDS.Skirmish.Defeated"
});

function L(key) {
  return localizeGtw(key);
}

function F(key, data = {}) {
  return formatGtw(key, data);
}

function conditionLabel(condition) {
  return L(CONDITION_KEYS[condition] ?? CONDITION_KEYS.fresh);
}

function getSheetActor(sheet) {
  const actor = sheet?.actor ?? sheet?.document ?? sheet?.object;
  return actor?.documentName === "Actor" ? actor : null;
}

function getSheetItem(sheet) {
  const item = sheet?.item ?? sheet?.document ?? sheet?.object;
  return item?.documentName === "Item" ? item : null;
}

function isShadowdarkNpc(actor) {
  return game.system.id === SHADOWDARK_SYSTEM_ID && actor?.type === SHADOWDARK_NPC_TYPE;
}

function isShadowdarkNpcAttack(item) {
  return game.system.id === SHADOWDARK_SYSTEM_ID && item?.type === SHADOWDARK_NPC_ATTACK_TYPE;
}

function isSkirmishEnabled() {
  return Boolean(game.settings.get(MODULE_ID, SKIRMISH_SETTING));
}

function isSkirmishWarband(actor) {
  return isShadowdarkNpc(actor) && Boolean(actor.getFlag(MODULE_ID, SKIRMISH_FLAG));
}

function getHtmlRoot(html) {
  if (html instanceof HTMLElement) return html;
  if (html?.[0] instanceof HTMLElement) return html[0];
  return null;
}

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

function nativeAttackProfile(item) {
  return {
    attackCount: Math.max(1, Math.floor(Number(item?.system?.attack?.num ?? 1) || 1)),
    attackBonus: Math.trunc(Number(item?.system?.bonuses?.attackBonus ?? 0) || 0),
    damage: String(item?.system?.damage?.value ?? "").trim()
  };
}

function normalizeProfile(profile, fallback) {
  const attackCount = Number(profile?.attackCount);
  const attackBonus = Number(profile?.attackBonus);
  const damage = typeof profile?.damage === "string" ? profile.damage.trim() : "";

  return {
    attackCount: Number.isFinite(attackCount) && attackCount >= 1
      ? Math.floor(attackCount)
      : fallback.attackCount,
    attackBonus: Number.isFinite(attackBonus)
      ? Math.trunc(attackBonus)
      : fallback.attackBonus,
    damage: damage || fallback.damage
  };
}

function getSkirmishProfiles(item) {
  const fallback = nativeAttackProfile(item);
  const stored = item?.getFlag(MODULE_ID, SKIRMISH_PROFILES_FLAG) ?? {};
  return Object.fromEntries(COMBAT_CONDITIONS.map(condition => [
    condition,
    normalizeProfile(stored[condition], fallback)
  ]));
}

function rerenderOpenSkirmishSheets(actor = null) {
  for (const sheet of Object.values(ui.windows ?? {})) {
    const sheetActor = getSheetActor(sheet);
    if (isShadowdarkNpc(sheetActor) && (!actor || sheetActor.uuid === actor.uuid)) {
      sheet.render(false);
      continue;
    }

    const item = getSheetItem(sheet);
    const parent = item?.parent;
    if (isShadowdarkNpcAttack(item) && isShadowdarkNpc(parent) && (!actor || parent.uuid === actor.uuid)) {
      sheet.render(false);
    }
  }
}

function injectSkirmishToggle(sheet, root, actor) {
  if (root.querySelector(`.${TOGGLE_CLASS}`)) return;

  const title = root.querySelector(".SD-header .SD-title");
  if (!title) {
    console.warn(`${MODULE_ID} | Shadowdark NPC sheet header was not found; Skirmish toggle was not injected.`);
    return;
  }

  const editable = Boolean(sheet.isEditable && actor.isOwner);
  const control = document.createElement("label");
  control.classList.add(TOGGLE_CLASS);
  control.dataset.tooltip = L("GTWARBANDS.Skirmish.ToggleHint");

  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.checked = isSkirmishWarband(actor);
  checkbox.disabled = !editable;
  checkbox.setAttribute("aria-label", L("GTWARBANDS.Skirmish.Warband"));

  const label = document.createElement("span");
  label.textContent = L("GTWARBANDS.Skirmish.Warband");

  checkbox.addEventListener("change", async event => {
    event.stopPropagation();
    const requestedState = checkbox.checked;
    checkbox.disabled = true;
    try {
      await actor.setFlag(MODULE_ID, SKIRMISH_FLAG, requestedState);
      rerenderOpenSkirmishSheets(actor);
    }
    catch (error) {
      checkbox.checked = !requestedState;
      ui.notifications.error(L("GTWARBANDS.Notification.SkirmishFlagUpdateFailed"));
      console.error(`${MODULE_ID} | Failed to update Skirmish Warband flag.`, error);
      checkbox.disabled = !editable;
    }
  });

  control.append(checkbox, label);
  title.append(control);
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

  const override = getConditionOverride(actor);
  const activeCondition = getActiveCondition(actor);
  const row = document.createElement("div");
  row.classList.add(CONDITION_CLASS);
  if (override !== "automatic") row.classList.add("is-override");

  const summary = document.createElement("div");
  summary.classList.add("gt-wb-skirmish-condition-summary");

  const conditionText = document.createElement("span");
  conditionText.textContent = `${L("GTWARBANDS.Skirmish.Condition")}: `;

  const conditionValue = document.createElement("strong");
  conditionValue.textContent = conditionLabel(activeCondition);
  conditionText.append(conditionValue);
  summary.append(conditionText);

  if (override !== "automatic") {
    const badge = document.createElement("span");
    badge.classList.add("gt-wb-skirmish-override-badge");
    badge.textContent = L("GTWARBANDS.Skirmish.OverrideActive");
    summary.append(badge);
  }

  row.append(summary);

  const mayOverride = Boolean(game.user.isGM && sheet.isEditable && actor.isOwner);
  if (mayOverride) {
    const select = document.createElement("select");
    select.classList.add("gt-wb-skirmish-override");
    select.dataset.tooltip = L("GTWARBANDS.Skirmish.ConditionOverride");
    select.setAttribute("aria-label", L("GTWARBANDS.Skirmish.ConditionOverride"));

    const choices = ["automatic", ...ALL_CONDITIONS];
    for (const choice of choices) {
      const option = document.createElement("option");
      option.value = choice;
      option.textContent = choice === "automatic"
        ? L("GTWARBANDS.Skirmish.Automatic")
        : conditionLabel(choice);
      select.append(option);
    }
    select.value = override;

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
        select.value = override;
        select.disabled = false;
        ui.notifications.error(L("GTWARBANDS.Notification.SkirmishOverrideUpdateFailed"));
        console.error(`${MODULE_ID} | Failed to update Skirmish Condition override.`, error);
      }
    });

    row.append(select);
  }

  valueGrid.insertAdjacentElement("afterend", row);
}

function injectSkirmishActorUi(sheet, html) {
  const actor = getSheetActor(sheet);
  if (!isShadowdarkNpc(actor) || !isSkirmishEnabled()) return;

  const root = getHtmlRoot(html);
  if (!root) return;

  injectSkirmishToggle(sheet, root, actor);
  injectConditionDisplay(sheet, root, actor);
}

function createProfileInput(type, field, value, editable, labelKey) {
  const input = document.createElement("input");
  input.type = type;
  input.dataset.profileField = field;
  input.value = String(value ?? "");
  input.disabled = !editable;
  input.setAttribute("aria-label", L(labelKey));
  if (type === "number") input.step = "1";
  if (field === "attackCount") input.min = "1";
  return input;
}

function readProfilesFromSection(section) {
  const profiles = {};

  for (const row of section.querySelectorAll("[data-condition]")) {
    const condition = row.dataset.condition;
    const attackCount = Number(row.querySelector('[data-profile-field="attackCount"]')?.value);
    const attackBonus = Number(row.querySelector('[data-profile-field="attackBonus"]')?.value);
    const damage = String(row.querySelector('[data-profile-field="damage"]')?.value ?? "").trim();

    if (!Number.isFinite(attackCount) || attackCount < 1 || !Number.isFinite(attackBonus)) return null;
    if (damage && typeof Roll !== "undefined" && typeof Roll.validate === "function" && !Roll.validate(damage)) {
      ui.notifications.error(F("GTWARBANDS.Notification.SkirmishInvalidDamage", { formula: damage }));
      return null;
    }

    profiles[condition] = {
      attackCount: Math.floor(attackCount),
      attackBonus: Math.trunc(attackBonus),
      damage
    };
  }

  return profiles;
}

function injectSkirmishAttackProfiles(sheet, html) {
  const item = getSheetItem(sheet);
  const actor = item?.parent;
  if (!isSkirmishEnabled() || !isShadowdarkNpcAttack(item) || !isSkirmishWarband(actor)) return;

  const root = getHtmlRoot(html);
  if (!root || root.querySelector(`.${PROFILES_CLASS}`)) return;

  const nativeDetails = root.querySelector('.tab-details[data-tab="tab-details"] > .grid-3-columns');
  if (!nativeDetails) {
    console.warn(`${MODULE_ID} | Shadowdark NPC Attack details tab was not found; Skirmish profiles were not injected.`);
    return;
  }

  const editable = Boolean(sheet.isEditable && item.isOwner && actor.isOwner);
  const activeCondition = getActiveCondition(actor);
  const profiles = getSkirmishProfiles(item);
  const section = document.createElement("section");
  section.classList.add(PROFILES_CLASS);

  const heading = document.createElement("h3");
  heading.textContent = L("GTWARBANDS.Skirmish.ConditionProfiles");

  const status = document.createElement("div");
  status.classList.add("gt-wb-skirmish-profile-status");
  status.textContent = `${L("GTWARBANDS.Skirmish.Condition")}: ${conditionLabel(activeCondition)}`;

  const grid = document.createElement("div");
  grid.classList.add("gt-wb-skirmish-profile-grid");

  for (const [text, className] of [
    ["", "gt-wb-skirmish-profile-label"],
    [L("GTWARBANDS.Skirmish.AttackCount"), ""],
    [L("GTWARBANDS.Skirmish.AttackBonus"), ""],
    [L("GTWARBANDS.Skirmish.Damage"), ""]
  ]) {
    const header = document.createElement("strong");
    if (className) header.classList.add(className);
    header.textContent = text;
    grid.append(header);
  }

  for (const condition of COMBAT_CONDITIONS) {
    const profile = profiles[condition];
    const row = document.createElement("div");
    row.classList.add("gt-wb-skirmish-profile-row");
    if (condition === activeCondition) row.classList.add("is-active");
    row.dataset.condition = condition;

    const label = document.createElement("strong");
    label.textContent = conditionLabel(condition);
    row.append(
      label,
      createProfileInput("number", "attackCount", profile.attackCount, editable, "GTWARBANDS.Skirmish.AttackCount"),
      createProfileInput("number", "attackBonus", profile.attackBonus, editable, "GTWARBANDS.Skirmish.AttackBonus"),
      createProfileInput("text", "damage", profile.damage, editable, "GTWARBANDS.Skirmish.Damage")
    );
    grid.append(row);
  }

  section.append(heading, status, grid);
  nativeDetails.insertAdjacentElement("afterend", section);

  for (const input of section.querySelectorAll("input")) {
    input.addEventListener("change", async event => {
      event.stopPropagation();
      if (!editable) return;

      const updated = readProfilesFromSection(section);
      if (!updated) return;

      for (const field of section.querySelectorAll("input")) field.disabled = true;
      try {
        await item.setFlag(MODULE_ID, SKIRMISH_PROFILES_FLAG, updated);
        sheet.render(false);
      }
      catch (error) {
        for (const field of section.querySelectorAll("input")) field.disabled = false;
        ui.notifications.error(L("GTWARBANDS.Notification.SkirmishProfilesUpdateFailed"));
        console.error(`${MODULE_ID} | Failed to update Skirmish Condition profiles.`, error);
      }
    });
  }
}

function signedBonus(value) {
  const number = Math.trunc(Number(value) || 0);
  return number >= 0 ? `+${number}` : String(number);
}

function resolveUuidSync(uuid) {
  try {
    return typeof fromUuidSync === "function" ? fromUuidSync(uuid) : null;
  }
  catch (error) {
    console.warn(`${MODULE_ID} | Could not resolve Shadowdark NPC Attack UUID.`, error);
    return null;
  }
}

function applySkirmishAttackProfile(config) {
  if (!isSkirmishEnabled()) return true;

  const item = resolveUuidSync(config?.itemUuid);
  const actor = item?.parent;
  if (!isShadowdarkNpcAttack(item) || !isSkirmishWarband(actor)) return true;

  const condition = getActiveCondition(actor);
  if (condition === "defeated") {
    ui.notifications.warn(L("GTWARBANDS.Notification.SkirmishDefeatedCannotAttack"));
    return false;
  }

  const profile = getSkirmishProfiles(item)[condition];
  if (!profile) return true;

  const attackBonus = signedBonus(profile.attackBonus);
  if (config.mainRoll?.base) {
    config.mainRoll.bonus = attackBonus;
    config.mainRoll.formula = `${config.mainRoll.base}${attackBonus}`;
  }

  const damage = String(profile.damage ?? "").trim();
  const validDamage = typeof Roll === "undefined" || typeof Roll.validate !== "function" || Roll.validate(damage);
  if (damage && validDamage) {
    config.damageRoll ??= {};
    config.damageRoll.label ??= game.i18n.localize("SHADOWDARK.roll.damage");
    config.damageRoll.base = damage;
    config.damageRoll.formula = `${damage}${signedBonus(item.system.bonuses?.damageBonus ?? 0)}`;
    config.damageRoll.criticalMultiplier ??= item.system.bonuses?.critical?.multiplier;
  }

  return true;
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
}

export function registerSkirmishHooks() {
  Hooks.on("renderActorSheet", injectSkirmishActorUi);
  Hooks.on("renderItemSheet", injectSkirmishAttackProfiles);
  Hooks.on("SD-NPC-Attack", applySkirmishAttackProfile);
}
