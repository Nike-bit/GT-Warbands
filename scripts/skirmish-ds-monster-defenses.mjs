import { localize as localizeGtw } from "./localization.mjs";

const MODULE_ID = "gt-warbands";
const DS_MODULE_ID = "ds-monster-defenses";

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

export function getDsMonsterDefensesSheetContext(item, editable) {
  if (!dsMonsterDefensesActive()) return { active: false };

  const traits = item.getFlag(DS_MODULE_ID, "attackTraits") ?? {};
  const selectedAbility = ["any", "str", "dex"].includes(traits.ability) ? traits.ability : "any";
  return {
    active: true,
    editable: Boolean(editable),
    title: dsLocalize(
      ["DSMONSTERDEFENSES.AttackTraits.Title", "DSMD.AttackTraits.Title"],
      "GTWARBANDS.Compatibility.DsMonsterDefenses"
    ),
    magicalLabel: dsLocalize(
      ["DSMONSTERDEFENSES.AttackTraits.Magical", "DSMD.AttackTraits.Magical"],
      "GTWARBANDS.Compatibility.MagicalAttack"
    ),
    magical: Boolean(traits.magical),
    abilityLabel: dsLocalize(
      ["DSMONSTERDEFENSES.AttackTraits.Ability", "DSMD.AttackTraits.Ability"],
      "GTWARBANDS.Compatibility.AttackAbility"
    ),
    abilities: [
      {
        value: "any",
        label: dsLocalize(["DSMONSTERDEFENSES.Ability.Any", "DSMD.Ability.Any"], "GTWARBANDS.Compatibility.Any"),
        selected: selectedAbility === "any"
      },
      {
        value: "str",
        label: dsLocalize(["DSMONSTERDEFENSES.Ability.Strength", "DSMD.Ability.Strength"], "GTWARBANDS.Compatibility.Strength"),
        selected: selectedAbility === "str"
      },
      {
        value: "dex",
        label: dsLocalize(["DSMONSTERDEFENSES.Ability.Dexterity", "DSMD.Ability.Dexterity"], "GTWARBANDS.Compatibility.Dexterity"),
        selected: selectedAbility === "dex"
      }
    ]
  };
}

export function activateDsMonsterDefensesSheetListeners({ sheet, item, root }) {
  if (!dsMonsterDefensesActive()) return;
  const editable = Boolean(sheet?.isEditable && item?.isOwner);

  const magical = root.querySelector('[data-gtw-ds-field="magical"]');
  magical?.addEventListener("change", async () => {
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

  const ability = root.querySelector('[data-gtw-ds-field="ability"]');
  ability?.addEventListener("change", async () => {
    const previous = ability.querySelector("option[selected]")?.value ?? "any";
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
}
