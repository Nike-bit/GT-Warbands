import { format as F, localize as L } from "../localization.mjs";
import {
  appendMessage,
  appendTooltip,
  ensureDefenseMeta,
  getDefenses,
  targetNpcFromConfig,
  toInteger
} from "./defense-data.mjs";
import { getAttackAbility, isMagicalWeaponAttack } from "./attack-traits.mjs";

function abilityMatches(selected, actual) { return selected === "any" || selected === actual; }
function abilityLabel(ability) {
  return L({ any: "GTWARBANDS.Compatibility.Any", str: "GTWARBANDS.Compatibility.Strength", dex: "GTWARBANDS.Compatibility.Dexterity" }[ability]);
}

export function applyNonmagicalDefense(config) {
  const target = targetNpcFromConfig(config);
  if (!target) return true;
  const defenses = getDefenses(target);
  const mode = defenses.nonmagical.mode;
  if (mode === "normal") return true;
  const magical = isMagicalWeaponAttack(config);
  if (magical === null || magical === true) return true;

  const selectedAbility = defenses.nonmagical.attackAbility;
  const actualAbility = getAttackAbility(config);
  if (!abilityMatches(selectedAbility, actualAbility)) return true;
  const originalFormula = config?.damageRoll?.formula;
  if (!originalFormula || config.gtWarbands?.monsterDefenses?.nonmagical?.applied) return true;

  const meta = ensureDefenseMeta(config);
  meta.nonmagical = {
    applied: true, mode, originalFormula, targetName: target.name,
    attackAbility: actualAbility, selectedAbility
  };
  const qualifier = selectedAbility === "any" ? "" : ` (${abilityLabel(selectedAbility)})`;

  if (mode === "resistant") {
    config.damageRoll.formula = `floor((${originalFormula}) / 2)`;
  }
  else if (mode === "immune") {
    config.damageRoll.formula = "0";
    const explanation = F("GTWARBANDS.MonsterDefenses.Chat.Immune", { qualifier });
    appendTooltip(config.damageRoll, explanation);
    appendMessage(config, `${target.name}: ${explanation}`);
  }
  else if (mode === "override") {
    const damage = toInteger(defenses.nonmagical.override, 1, 0);
    config.damageRoll.formula = String(damage);
    meta.nonmagical.override = damage;
    const explanation = F("GTWARBANDS.MonsterDefenses.Chat.Override", { qualifier, damage });
    appendTooltip(config.damageRoll, explanation);
    appendMessage(config, `${target.name}: ${explanation}`);
  }
  return true;
}

function htmlRoot(html) {
  if (html instanceof HTMLElement) return html;
  if (html?.[0] instanceof HTMLElement) return html[0];
  return null;
}

export function beautifyResistanceChat(message, html) {
  const defense = message?.getFlag?.("shadowdark", "rollConfig")?.gtWarbands?.monsterDefenses?.nonmagical
    ?? message?.flags?.shadowdark?.rollConfig?.gtWarbands?.monsterDefenses?.nonmagical;
  if (!defense?.applied || defense.mode !== "resistant") return;
  const root = htmlRoot(html);
  if (!root || root.querySelector(".gtw-defense-resistance-badge")) return;
  const formulas = [...root.querySelectorAll(".dice-formula")];
  const damageFormula = formulas.findLast?.(element => element.textContent?.includes("floor(")) ?? formulas.at(-1);
  if (damageFormula) {
    damageFormula.textContent = `½ × (${defense.originalFormula})`;
    damageFormula.title = L("GTWARBANDS.MonsterDefenses.ResistanceHint");
    damageFormula.classList.add("gtw-defense-resisted-formula");
  }
  const heading = [...root.querySelectorAll("h3.sub-heading")].at(-1);
  if (!heading) return;
  const badge = document.createElement("span");
  badge.className = "gtw-defense-resistance-badge";
  const suffix = defense.selectedAbility === "any" ? "" : ` · ${abilityLabel(defense.selectedAbility)}`;
  badge.textContent = `${L("GTWARBANDS.MonsterDefenses.Resisted")} ½${suffix}`;
  badge.title = L("GTWARBANDS.MonsterDefenses.ResistanceHint");
  heading.append(badge);
}
