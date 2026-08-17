# GT-Warbands — Current Design Snapshot

## Architecture

The Warband Actor stores generic data. The active Profile supplies visible labels and mechanical interpretation.

Default profile: **Shadowdark (Default)**.

## Generic ability layout

Ability 1A | Ability 2A  
Ability 1B | Ability 2B  
Ability 1C | Ability 2C

Shadowdark (Default):

Might | Vigor  
Maneuver | Cohesion  
Magic | Leadership

## Ability guidelines

Most values range from +0 to +5, although exceptional units may exceed +5.

- Might: +0 Feeble; +1 Light; +2 Capable; +3 Powerful; +4 Crushing; +5 Overwhelming.
- Vigor: +0 Frail; +1 Limited; +2 Hardy; +3 Resilient; +4 Tireless; +5 Relentless.
- Maneuver: +0 Ponderous; +1 Slow; +2 Mobile; +3 Agile; +4 Highly Mobile; +5 Elusive.
- Cohesion: +0 Disorganized; +1 Loose; +2 Organized; +3 Disciplined; +4 Unified; +5 Singular.
- Magic: +0 Mundane; +1 Minor Supernatural Advantage; +2 Significant Magical Component; +3 Powerful Supernatural Warband; +4 Exceptional Magical Force; +5 Extraordinary.
- Leadership: +0 Leaderless; +1 Weak; +2 Reliable; +3 Strong; +4 Exceptional; +5 Unbreakable.

## Current encoded rules

Power = Base Power + Veterancy.

Attack = d20 + Power + Might + Magic.

AC = 10 + Maneuver + Cohesion + Magic.

Attacks = 1 + floor(Leadership / 2).

Effectiveness Dice = sum of all six abilities.

Effectiveness = rolled Effectiveness Dice d8.

Damage dice count = Dominant Ability + Size/effect dice + Might overflow.

Damage die quality from Might:
+0/+1 d4; +2 d6; +3 d8; +4 d10; +5+ d12.

Each point of Might over +5 adds one damage die.

Magic is flat bonus damage.

Magic +1 or higher makes attacks Magical in Shadowdark (Default).

Melee Warband engagements resolve simultaneously.
