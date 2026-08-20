# GT-Warbands v0.4.0

First playable foundation for the profile-driven Warband Actor system developed for Shadowdark.

## Target

- Foundry VTT 14
- Shadowdark RPG 4.0.x
- Verified design target: Shadowdark 4.0.6

## Installation

Install GT-Warbands from Foundry VTT's **Add-on Modules** setup screen using this manifest URL:

```text
https://github.com/Nike-bit/GT-Warbands/releases/latest/download/module.json
```

For manual installation, download `gt-warbands.zip` from the latest GitHub release and extract its `gt-warbands` folder into Foundry's `Data/modules/` directory.

Versioned releases and release notes are available at:

```text
https://github.com/Nike-bit/GT-Warbands/releases
```

The module uses Foundry's module-provided Document subtype system to add:

- `gt-warbands.warband` Actor
- `gt-warbands.attack` Item


## Localization

GT-Warbands now externalizes its main user-facing interface strings so additional languages can be added without rewriting the rules engine.

Included languages:

- English (`en`)
- Modern Greek / Ελληνικά (`el`)
- German / Deutsch (`de`)
- French / Français (`fr`)
- Spanish / Español (`es`)
- Brazilian Portuguese / Português (Brasil) (`pt-BR`)
- Russian / Русский (`ru`)
- Japanese / 日本語 (`ja`)
- Simplified Chinese / 简体中文 (`zh-CN`)
- Polish / Polski (`pl`)
- Turkish / Türkçe (`tr`)
- Farsi / فارسی (`fa`)
- Italian / Italiano (`it`)
- Latin / Latina (`la`)
- Ancient Greek / Ἀρχαία Ἑλληνικά (`grc`)

The built-in **Shadowdark (Default)** profile localizes its visible labels per client language while retaining the same generic internal ability IDs and formulas. Custom Profile labels remain world-defined text, as expected for GM-authored content.

## Shadowdark (Default) Profile

Generic ability slots:

- Ability 1A
- Ability 2A
- Ability 1B
- Ability 2B
- Ability 1C
- Ability 2C

Shadowdark (Default) labels them:

- Ability 1A -> Might
- Ability 2A -> Vigor
- Ability 1B -> Maneuver
- Ability 2B -> Cohesion
- Ability 1C -> Magic
- Ability 2C -> Leadership

### Current formulas

Power:
`Base Power + Veterancy`

Effectiveness dice:
`Might + Vigor + Maneuver + Cohesion + Magic + Leadership`

Effectiveness:
`roll [Effectiveness Dice]d8`

Attack bonus:
`Power + Might + Magic`

AC:
`10 + Maneuver + Cohesion + Magic`

Number of attacks:
`1 + floor(Leadership / 2)`

## Damage

Each Warband has a default Dominant Ability. Individual Warband Attack items can override it.

Base damage dice:
`Dominant Ability`

Additional damage dice:
`Size/effect dice + max(0, Might - 5)`

Might die progression:

- Might +0 -> d4
- Might +1 -> d4
- Might +2 -> d6
- Might +3 -> d8
- Might +4 -> d10
- Might +5+ -> d12
- each point of Might over +5 adds one extra damage die

Flat damage:
`+ Magic`

Example: Might +2, Maneuver +3 as Dominant Ability, no Size bonus, Magic +0 -> `3d6`.
With +2 Size/effect damage dice -> `5d6`.

## Magical attacks

Shadowdark (Default) assigns the profile-defined special attack property to Ability 1C.

Magic +1 or greater:

- attacks are Magical
- Magic also contributes to Attack, AC, and flat damage

Warbands have a defense setting against attacks which lack this property:

- Normal
- Resistant: half damage, rounded down
- Immune: no damage

The underlying rule is profile-driven rather than hardcoded to the word Magic.

### Built-in Monster Defenses

GT-Warbands can provide Nonmagical Defense, Spell Defense, Magical Attack, and
Attack Ability interactions as an independent world option. Its persistent data
uses `flags.gt-warbands.monsterDefenses`.

Legacy `flags.ds-monster-defenses` data is copied non-destructively when the GT
destination is absent. If standalone DS-Monster-Defenses is still active, it
remains authoritative and GT-Warbands keeps its built-in defense roll processing
dormant until the standalone module is disabled.

## Rolled Effectiveness

Effectiveness is rolled and persists. It is not silently recalculated when ability values change.

The sheet displays the current Effectiveness formula and warns when the current ability total differs from the dice count used for the last Effectiveness roll.

Press **Roll Effectiveness** to roll a new maximum. The result becomes both current and maximum Effectiveness.

## Warband Attacks

Use **Add Attack** on a Warband sheet.

Attack Items currently contain:

- Name
- Melee / Ranged / Special classification
- optional Dominant Ability override
- attack-specific extra damage dice
- notes

The Leadership-derived attack count is used whenever an attack is rolled.

Clicking an attack:

- rolls all attacks
- if exactly one Warband is targeted, compares them with its AC
- rolls damage for successful hits
- previews resistance/immunity adjustments
- does not automatically apply the damage

## Simultaneous Melee Exchange

Set a default melee attack using the star icon.

Target exactly one other Warband and press **Melee Exchange**.

The module:

1. finds each Warband's default melee attack
2. determines both sides' attack counts
3. rolls both complete attack sets
4. calculates successful damage
5. applies property resistance/immunity
6. only then reduces both Actors' Effectiveness

This preserves the rule that Warbands attack simultaneously. A Warband reduced to 0 Effectiveness still resolves attacks it had already committed to that exchange.

Ranged exchanges are deliberately not automated yet.

## Size / Effects

Size is not a seventh core ability.

The Actor has:
`Extra Damage Dice (Size / Effects)`

This is the current numeric integration point for Size qualities and later effect automation.

Direct Shadowdark Active Effect integration is intentionally deferred because the custom Warband Actor has its own DataModel and should not rely on Shadowdark weapon-specific AE keys.

## Profile Menu

Open:

Configure Settings -> Module Settings -> GT-Warbands -> Warband Profiles

Available:

- Shadowdark (Default)
- Custom

Shadowdark (Default) is immutable. Clone it to Custom to edit:

- generic quality labels (Power, Veterancy, Effectiveness, Attack, AC, etc.)
- six ability labels
- Power formula
- Effectiveness dice formula
- Attack formula
- AC formula
- attack-count formula
- base / extra / flat damage formulas
- Effectiveness die size and thresholds
- Might damage die progression
- Might overflow cap
- Ability-triggered attack property and threshold

The Actor retains generic ability slots regardless of visible Profile labels.

## Deliberately unresolved

- Power scale
- Veterancy scale
- unit acquisition costs
- Magic acquisition cost
- final Vigor attrition mechanics
- morale and routing
- Size effect tiers
- Full/Half/Quarter combat degradation
- ranged exchange rules
- formations
- interactions with ordinary Player/NPC Actors
- critical attacks
- Effectiveness recovery
- final rule for Dominant Ability +0
- native Shadowdark Active Effect integration for Size/effect dice
