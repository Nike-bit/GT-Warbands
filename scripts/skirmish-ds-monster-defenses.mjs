import { localize as localizeGtw } from "./localization.mjs";

const MODULE_ID = "gt-warbands";
const DS_MODULE_ID = "ds-monster-defenses";
const CONTROLS_CLASS = "gt-wb-ds-monster-defenses";

function L(key) {
  return localizeGtw(key);
}

function dsLocalize(candidates, fallbackKey) {
  for (const key of candidates) {
    const value = game.i18n.localize(key);
    if (value !== key) return value;
  }
  return L(fallbackKey);
}

export function dsMonsterDefensesActive() {
  return Boolean(game.modules.get(DS_MODULE_ID)?.active);
}

export function injectDsMonsterDefensesControls({ sheet, item, container }) {
  if (!dsMonsterDefensesActive() || container.querySelector(`.${CONTROLS_CLASS}`)) return;

  const editable = Boolean(sheet?.isEditable && item?.isOwner);
  const traits = item.getFlag(DS_MODULE_ID, "attackTraits") ?? {};
  const section = document.createElement("section");
  section.classList.add(CONTROLS_CLASS);
  section.dataset.moduleVersion = game.modules.get(DS_MODULE_ID)?.version ?? "";

  const heading = document.createElement("h3");
  heading.textContent = dsLocalize(
    ["DSMONSTERDEFENSES.AttackTraits.Title", "DSMD.AttackTraits.Title"],
    "GTWARBANDS.Compatibility.DsMonsterDefenses"
  );

  const fields = document.createElement("div");
  fields.classList.add("gt-wb-ds-monster-defenses-fields");

  const magicalLabel = document.createElement("label");
  const magicalText = document.createElement("span");
  magicalText.textContent = dsLocalize(
    ["DSMONSTERDEFENSES.AttackTraits.Magical", "DSMD.AttackTraits.Magical"],
    "GTWARBANDS.Compatibility.MagicalAttack"
  );
  const magical = document.createElement("input");
  magical.type = "checkbox";
  magical.checked = Boolean(traits.magical);
  magical.disabled = !editable;
  magical.addEventListener("change", async () => {
    const previous = !magical.checked;
    magical.disabled = true;
    try {
      await item.update({ [`flags.${DS_MODULE_ID}.attackTraits.magical`]: magical.checked });
    }
    catch (error) {
      magical.checked = previous;
      console.error(`${MODULE_ID} | Failed to update the DS-Monster-Defenses magical attack trait.`, error);
    }
    finally {
      magical.disabled = !editable;
    }
  });
  magicalLabel.append(magicalText, magical);

  const abilityLabel = document.createElement("label");
  const abilityText = document.createElement("span");
  abilityText.textContent = dsLocalize(
    ["DSMONSTERDEFENSES.AttackTraits.Ability", "DSMD.AttackTraits.Ability"],
    "GTWARBANDS.Compatibility.AttackAbility"
  );
  const ability = document.createElement("select");
  ability.disabled = !editable;
  for (const [value, candidates, fallback] of [
    ["any", ["DSMONSTERDEFENSES.Ability.Any", "DSMD.Ability.Any"], "GTWARBANDS.Compatibility.Any"],
    ["str", ["DSMONSTERDEFENSES.Ability.Strength", "DSMD.Ability.Strength"], "GTWARBANDS.Compatibility.Strength"],
    ["dex", ["DSMONSTERDEFENSES.Ability.Dexterity", "DSMD.Ability.Dexterity"], "GTWARBANDS.Compatibility.Dexterity"]
  ]) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = dsLocalize(candidates, fallback);
    ability.append(option);
  }
  ability.value = ["any", "str", "dex"].includes(traits.ability) ? traits.ability : "any";
  ability.addEventListener("change", async () => {
    const previous = ["any", "str", "dex"].includes(traits.ability) ? traits.ability : "any";
    ability.disabled = true;
    try {
      await item.update({ [`flags.${DS_MODULE_ID}.attackTraits.ability`]: ability.value });
    }
    catch (error) {
      ability.value = previous;
      console.error(`${MODULE_ID} | Failed to update the DS-Monster-Defenses attack ability trait.`, error);
    }
    finally {
      ability.disabled = !editable;
    }
  });
  abilityLabel.append(abilityText, ability);

  fields.append(magicalLabel, abilityLabel);
  section.append(heading, fields);
  container.append(section);
}
