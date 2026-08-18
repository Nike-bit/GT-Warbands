const MODULE_ID = "gt-warbands";
const SHADOWDARK_SYSTEM_ID = "shadowdark";
const SHADOWDARK_NPC_TYPE = "NPC";
const SKIRMISH_SETTING = "enableSkirmishNpcSupport";
const SKIRMISH_FLAG = "isSkirmishWarband";
const TOGGLE_CLASS = "gt-wb-skirmish-toggle";

function L(key) {
  return game.i18n.localize(key);
}

function getSheetActor(sheet) {
  const actor = sheet?.actor ?? sheet?.document ?? sheet?.object;
  return actor?.documentName === "Actor" ? actor : null;
}

function isShadowdarkNpc(actor) {
  return game.system.id === SHADOWDARK_SYSTEM_ID && actor?.type === SHADOWDARK_NPC_TYPE;
}

function getHtmlRoot(html) {
  if (html instanceof HTMLElement) return html;
  if (html?.[0] instanceof HTMLElement) return html[0];
  return null;
}

function rerenderOpenShadowdarkNpcSheets() {
  for (const sheet of Object.values(ui.windows ?? {})) {
    if (isShadowdarkNpc(getSheetActor(sheet))) sheet.render(false);
  }
}

function injectSkirmishToggle(sheet, html) {
  const actor = getSheetActor(sheet);
  if (!isShadowdarkNpc(actor)) return;
  if (!game.settings.get(MODULE_ID, SKIRMISH_SETTING)) return;

  const root = getHtmlRoot(html);
  if (!root || root.querySelector(`.${TOGGLE_CLASS}`)) return;

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
  checkbox.checked = Boolean(actor.getFlag(MODULE_ID, SKIRMISH_FLAG));
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
    }
    catch (error) {
      checkbox.checked = !requestedState;
      ui.notifications.error(L("GTWARBANDS.Notification.SkirmishFlagUpdateFailed"));
      console.error(`${MODULE_ID} | Failed to update Skirmish Warband flag.`, error);
    }
    finally {
      checkbox.disabled = !editable;
    }
  });

  control.append(checkbox, label);
  title.append(control);
}

export function registerSkirmishSettings() {
  game.settings.register(MODULE_ID, SKIRMISH_SETTING, {
    name: L("GTWARBANDS.Settings.EnableSkirmishNpcSupport"),
    hint: L("GTWARBANDS.Settings.EnableSkirmishNpcSupportHint"),
    scope: "world",
    config: true,
    type: Boolean,
    default: false,
    onChange: rerenderOpenShadowdarkNpcSheets
  });
}

export function registerSkirmishHooks() {
  Hooks.on("renderActorSheet", injectSkirmishToggle);
}
