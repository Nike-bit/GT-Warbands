const MODULE_ID = "gt-warbands";

function htmlRoot(html) {
  if (html instanceof HTMLElement) return html;
  if (html?.[0] instanceof HTMLElement) return html[0];
  return null;
}

function groupForSetting(root, key) {
  return root.querySelector(`[name="${MODULE_ID}.${key}"]`)?.closest(".form-group") ?? null;
}

function groupForMenu(root, key) {
  return root.querySelector(`[data-action="openSubmenu"][data-key="${MODULE_ID}.${key}"]`)?.closest(".form-group") ?? null;
}

function setVisible(group, visible) {
  if (!group) return;
  group.hidden = !visible;
  group.classList.toggle("gtw-setting-hidden", !visible);
}

function applyVisibility(root) {
  const master = root.querySelector(`[name="${MODULE_ID}.enableSkirmishNpcSupport"]`);
  const single = root.querySelector(`[name="${MODULE_ID}.enhancedNpcAttackSheets"]`);
  const masterEnabled = master?.checked ?? Boolean(game.settings.get(MODULE_ID, "enableSkirmishNpcSupport"));
  const singleEnabled = single?.checked ?? Boolean(game.settings.get(MODULE_ID, "enhancedNpcAttackSheets"));
  setVisible(groupForMenu(root, "skirmishRulesMenu"), masterEnabled);
  setVisible(groupForSetting(root, "enhancedNpcAttackSheets"), masterEnabled);
  setVisible(groupForMenu(root, "singleNpcSkirmishRulesMenu"), masterEnabled && singleEnabled);
}

export function registerSettingsVisibilityHooks() {
  Hooks.on("renderSettingsConfig", (_application, html) => {
    const root = htmlRoot(html);
    if (!root) return;
    applyVisibility(root);
    for (const key of ["enableSkirmishNpcSupport", "enhancedNpcAttackSheets"]) {
      const input = root.querySelector(`[name="${MODULE_ID}.${key}"]`);
      if (!input || input.dataset.gtwVisibilityBound === "true") continue;
      input.dataset.gtwVisibilityBound = "true";
      input.addEventListener("change", () => applyVisibility(root));
    }
  });
}
