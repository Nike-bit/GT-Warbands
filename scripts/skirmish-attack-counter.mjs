import { format as formatGtw, localize as localizeGtw } from "./localization.mjs";

const MODULE_ID = "gt-warbands";
const COUNTER_CLASS = "gt-wb-attack-counter";
const META_KEY = "gtWarbandsAttackCounter";

function L(key) {
  return localizeGtw(key);
}

function F(key, data = {}) {
  return formatGtw(key, data);
}

function clampSelected(value, maximum) {
  const max = Math.max(1, Math.floor(Number(maximum) || 1));
  return Math.min(max, Math.max(1, Math.floor(Number(value) || max)));
}

function updateCounterUi(control, config, selected) {
  const metadata = config[META_KEY];
  const maximum = Math.max(1, Math.floor(Number(metadata?.maximum) || 1));
  const value = clampSelected(selected, maximum);
  metadata.selected = value;

  const input = control.querySelector("input");
  const output = control.querySelector("output");
  const decrease = control.querySelector('[data-action="decrease"]');
  const increase = control.querySelector('[data-action="increase"]');
  input.value = String(value);
  output.textContent = `${value}/${maximum}`;
  control.dataset.tooltip = F("GTWARBANDS.Skirmish.AttackQuantityHint", {
    selected: value,
    maximum
  });
  control.setAttribute("aria-label", control.dataset.tooltip);
  decrease.disabled = value <= 1;
  increase.disabled = value >= maximum;
}

export function setAttackCounterMaximum(config, maximum) {
  const max = Math.max(1, Math.floor(Number(maximum) || 1));
  const previous = config[META_KEY];
  config[META_KEY] = {
    maximum: max,
    selected: clampSelected(previous?.selected ?? max, max)
  };
}

export function hasAttackCounter(config) {
  return Boolean(config?.[META_KEY]);
}

export function injectAttackCounter(application, root, config) {
  const metadata = config?.[META_KEY];
  if (!metadata || root.querySelector(`.${COUNTER_CLASS}`)) return;

  const mainInput = root.querySelector(`input[name="${CSS.escape(config.mainRoll?.key ?? "mainRoll.formula")}"]`)
    ?? root.querySelector('input[name="mainRoll.formula"]');
  const rollInput = mainInput?.closest(".roll-input");
  if (!rollInput) {
    console.warn(`${MODULE_ID} | Shadowdark attack-roll input was not found; attack quantity was not injected.`);
    return;
  }

  const control = document.createElement("div");
  control.classList.add(COUNTER_CLASS);

  const label = document.createElement("span");
  label.classList.add("gt-wb-attack-counter-label");
  label.textContent = L("GTWARBANDS.Skirmish.AttackQuantity");

  const decrease = document.createElement("button");
  decrease.type = "button";
  decrease.dataset.action = "decrease";
  decrease.dataset.tooltip = L("GTWARBANDS.Skirmish.DecreaseAttackQuantity");
  decrease.setAttribute("aria-label", decrease.dataset.tooltip);
  decrease.innerHTML = '<i class="fas fa-minus" aria-hidden="true"></i>';

  const input = document.createElement("input");
  input.type = "number";
  input.name = "gtWarbandsAttackQuantity";
  input.min = "1";
  input.max = String(metadata.maximum);
  input.step = "1";
  input.classList.add("gt-wb-attack-counter-input");
  input.setAttribute("aria-label", L("GTWARBANDS.Skirmish.SelectedAttacks"));

  const output = document.createElement("output");
  output.classList.add("gt-wb-attack-counter-output");
  output.setAttribute("aria-live", "polite");

  const increase = document.createElement("button");
  increase.type = "button";
  increase.dataset.action = "increase";
  increase.dataset.tooltip = L("GTWARBANDS.Skirmish.IncreaseAttackQuantity");
  increase.setAttribute("aria-label", increase.dataset.tooltip);
  increase.innerHTML = '<i class="fas fa-plus" aria-hidden="true"></i>';

  control.append(label, decrease, input, output, increase);
  rollInput.insertAdjacentElement("afterend", control);
  updateCounterUi(control, config, metadata.selected);

  decrease.addEventListener("click", () => updateCounterUi(control, config, Number(input.value) - 1));
  increase.addEventListener("click", () => updateCounterUi(control, config, Number(input.value) + 1));
  input.addEventListener("change", () => updateCounterUi(control, config, input.value));
  input.addEventListener("input", () => {
    const numeric = Number(input.value);
    if (Number.isFinite(numeric)) metadata.selected = clampSelected(numeric, metadata.maximum);
  });

  const form = root.matches("form") ? root : root.querySelector("form") ?? root.closest("form");
  form?.addEventListener("submit", () => updateCounterUi(control, config, input.value), { capture: true });
}

export async function executeSelectedAttacks(config, executor = globalThis.shadowdark?.dice?.rollFromConfig) {
  const metadata = config?.[META_KEY];
  if (!metadata || typeof executor !== "function") return { handled: false, count: 0, results: [] };

  const selected = clampSelected(metadata.selected, metadata.maximum);
  const pristine = foundry.utils.deepClone(config);
  const results = [];
  for (let index = 0; index < selected; index += 1) {
    const attackConfig = foundry.utils.deepClone(pristine);
    attackConfig[META_KEY].attackIndex = index + 1;
    attackConfig[META_KEY].selected = selected;
    results.push(await executor(attackConfig));
  }
  return { handled: true, count: selected, results };
}

export const attackCounterTestApi = Object.freeze({ executeSelectedAttacks, clampSelected });
