import { format as F, localize as L } from "../localization.mjs";
import {
  SPELL_ABILITIES,
  actorFromUuid,
  appendMessage,
  appendTooltip,
  ensureDefenseMeta,
  getDefenses,
  normalizeAbility,
  targetNpcFromConfig,
  toInteger
} from "./defense-data.mjs";

function getSpellcastingAbility(config) {
  const configured = normalizeAbility(config?.cast?.ability, SPELL_ABILITIES, "");
  if (configured) return configured;
  return normalizeAbility(actorFromUuid(config?.actorUuid)?.system?.spellcasting?.ability, SPELL_ABILITIES, "any");
}

export function applySpellDefense(config) {
  const target = targetNpcFromConfig(config);
  if (!target || !config?.mainRoll) return true;
  const defenses = getDefenses(target);
  if (!defenses.spell.enabled) return true;
  const selectedAbility = defenses.spell.castingAbility;
  const actualAbility = getSpellcastingAbility(config);
  if (selectedAbility !== "any" && selectedAbility !== actualAbility) return true;

  const dc = toInteger(defenses.spell.dc, 15, 1);
  config.mainRoll.dc = dc;
  const abilityKey = { int: "Intelligence", wis: "Wisdom", cha: "Charisma" }[selectedAbility];
  const qualifier = selectedAbility === "any" ? "" : ` (${L(`GTWARBANDS.MonsterDefenses.${abilityKey}`)})`;
  const explanation = F("GTWARBANDS.MonsterDefenses.Chat.SpellDefense", { qualifier, dc });
  appendTooltip(config.mainRoll, explanation);
  appendMessage(config, `${target.name}: ${explanation}`);
  ensureDefenseMeta(config).spell = {
    applied: true, dc, castingAbility: actualAbility, selectedAbility, targetName: target.name
  };
  return true;
}
