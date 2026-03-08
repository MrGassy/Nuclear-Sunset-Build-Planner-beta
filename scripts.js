/* --- STATE VARIABLES --- */
let mode = 'std', origin = 'CW', special = { STR: 5, PER: 5, END: 5, CHA: 5, INT: 5, AGI: 5, LCK: 5 };
let currentSort = 'az';
let skillPoints = { BARTER:0,'BIG GUNS':0,'ENERGY WEAPONS':0,EXPLOSIVES:0,GUNS:0,LOCKPICK:0,MEDICINE:0,'MELEE WEAPONS':0,REPAIR:0,SCIENCE:0,SNEAK:0,SPEECH:0,SURVIVAL:0,UNARMED:0 };
let charLevel = 1;
let showEligibleOnly = false;
let _lvlupSession = {}, _lvlupPointsLeft = 0;
let skillHistory = [];
let _itTargetRow = null; // tracks which prog-row triggered IT modal // [{level, allocation:{skill:pts_spent}, gains:{skill:pts_gained}, tagged:[...], pointsTotal}]
const sKeys = ["STR", "PER", "END", "CHA", "INT", "AGI", "LCK"];
const skills = ["BARTER", "BIG GUNS", "ENERGY WEAPONS", "EXPLOSIVES", "GUNS", "LOCKPICK", "MEDICINE", "MELEE WEAPONS", "REPAIR", "SCIENCE", "SNEAK", "SPEECH", "SURVIVAL", "UNARMED"];

/* ===== SKILL ENGINE ===== */
const SKILL_GOVERNING = {
    'BARTER':'CHA','BIG GUNS':'STR','ENERGY WEAPONS':'PER','EXPLOSIVES':'PER',
    'GUNS':'AGI','LOCKPICK':'PER','MEDICINE':'INT','MELEE WEAPONS':'STR',
    'REPAIR':'INT','SCIENCE':'INT','SNEAK':'AGI','SPEECH':'CHA','SURVIVAL':'END','UNARMED':'END'
};
const SKILL_REQ_MAP = [
    { pattern: /\bEner(?:gy)?\.\s*Weap(?:on)?(?:s|\.)*\s+(\d+)/i, skill: 'ENERGY WEAPONS' },
    { pattern: /\bBig\s+Guns\s+(\d+)/i,                            skill: 'BIG GUNS' },
    { pattern: /\bMelee\s+Weap(?:ons?)?\.*\s+(\d+)/i,              skill: 'MELEE WEAPONS' },
    { pattern: /\bGuns\s+(\d+)/i,                                   skill: 'GUNS' },
    { pattern: /\bUnarmed\s+(\d+)/i,                                skill: 'UNARMED' },
    { pattern: /\bExplos\.\s+(\d+)/i,                               skill: 'EXPLOSIVES' },
    { pattern: /\bSneak\s+(\d+)/i,                                  skill: 'SNEAK' },
    { pattern: /\bSpeech\s+(\d+)/i,                                 skill: 'SPEECH' },
    { pattern: /\bBarter\s+(\d+)/i,                                 skill: 'BARTER' },
    { pattern: /\bRepair\s+(\d+)/i,                                 skill: 'REPAIR' },
    { pattern: /\bScience\s+(\d+)/i,                                skill: 'SCIENCE' },
    { pattern: /\bMed(?:icine)?\.\s+(\d+)/i,                        skill: 'MEDICINE' },
    { pattern: /\bSurvival\s+(\d+)/i,                               skill: 'SURVIVAL' },
    { pattern: /\bLockpick\s+(\d+)/i,                               skill: 'LOCKPICK' },
];

// GECK formula: Skill = 2 + (GoverningSpecial * 2) + Ceil(Luck * 0.5)
function skillBase(s) {
    const stat = SKILL_GOVERNING[s];
    const primary = special[stat] || 1;
    const lck = special.LCK || 1;
    return 2 + (primary * 2) + Math.ceil(lck * 0.5);
}
function getTaggedSkills() {
    const t = new Set();
    document.querySelectorAll('#tag-area input').forEach((cb, i) => { if (cb.checked && skills[i]) t.add(skills[i]); });
    // Include 4th tag from Tag! perk if set
    if (_fourthTagSkill && !t.has(_fourthTagSkill)) t.add(_fourthTagSkill);
    return t;
}
function skillTotal(s) {
    return Math.min(100, skillBase(s) + (getTaggedSkills().has(s) ? 15 : 0) + (skillPoints[s] || 0));
}
// GECK wiki formula: Floor(Min(INT,9) * 0.5 + 10)
// This equals 10 + floor(INT/2), capped at INT 9 = 14 pts
// HC uses a reduced base of 3 with similar scaling
function pointsPerLevel() {
    const int = Math.max(1, special.INT || 1);
    if (mode === 'hc') return Math.floor(Math.min(int, 9) * 0.5) + 3;
    return Math.floor(Math.min(int, 9) * 0.5 + 10);
}

/* --- PERSISTENCE OBJECT --- */
let regionalStorage = { 'CW': { quests: [], colls: [] }, 'MW': { quests: [], colls: [] } };

/* --- PERK DATA (from Nuclear Sunset Perk Sheet) --- */
const PERKS_DATA = [{"name": "(Inexplicable) Feminist Agenda", "req": "Level 6, NOT Lady Killer, NOT Confirmed Bachelor, CHR 4, INT 5, PER 6", "ranks": 1, "desc": "Something stirs within you - something *interdisciplinary*. Is it a newly formed reaction to getting your head ventilated by a dashing rogue, or something you've always had? One thing is for sure: you're not a *mild* feminist. You're ready to let loose, on each and every member of the un-fairer sex! +Women appreciate your attitude. +5 Speech and Barter when speaking to women. +5% damage against men."}, {"name": "A Solitary Soul", "req": "Level 10", "ranks": 1, "desc": "Traveling with a crowd just isn't for you. When not accompanied by any companions, you recover 10% more health from healing sources, gain 15% more experience, and while facing more than one target at once, the adrenaline rush from any non-fatal critical hit will restore the hit's health damage by 2% per point of Endurance, if you have an equal amount of AP available."}, {"name": "A Stranger I Remain", "req": "Level 2, CHR < 6", "ranks": 1, "desc": "You don't belong here; the fewer factions that know of you, the higher your sneak bonus. (+26 Sneak,  reduced by 2 for each faction that knows you)"}, {"name": "Action Star", "req": "Level 4, AGL 5", "ranks": 3, "desc": "The life of an action star is an exciting one! As your career develops, you'll be able to choose to improve your total AP, your AP regeneration rate, or your weapon AP cost. If you take all three ranks, your AP is restored by an amount equal to your luck on each headshot outside of Bullet Time as well!"}, {"name": "Ain't Like That Now", "req": "Level 50, NOT Thought You Died, NOT Just Lucky I'm Alive, Evil Karma", "ranks": 1, "desc": "Maybe you were bad once, but you ain't like that now. Your Karma has been reset, you regenerate AP 20% faster, and your attack speed is increased by 20%. You are also 25% less susceptible to critical hits from Evil or Very Evil characters."}, {"name": "Alertness", "req": "Level 2, INT 5, PER 5", "ranks": 1, "desc": "You've learned to keep your senses alert to any danger. When crouched and not moving you gain a +2 to your Perception attribute to help you find enemies before they find you."}, {"name": "And Stay Back", "req": "Level 50, Guns 70, Shotgun Surgeon", "ranks": 1, "desc": "You've discovered a Shotgun technique that has a chance to knock an enemy back on any hits that penetrate the target's DT. Slugs have a much greater chance to cause knockdown."}, {"name": "Anodized Armor", "req": "Level 10, Science 40", "ranks": 1, "desc": "Holding onto all those scrap electronics has begun to magnetize your armor. When wearing any metal armor and carrying 10+ scrap electronics, your item condition is reduced by 35%, and you gain +8% DR."}, {"name": "Anodized Arsenal", "req": "Level 16, Anodized Armor, Ener. Weap. 65, Science 50", "ranks": 1, "desc": "You've devised a way to focus the anodized charge of your armor into your energy weapons. While wearing your metal armor and carrying your scrap electronics and an additional 3+ fission batteries, your energy weapon projectile speed is increased by 25%, and you gain 25% DT penetration with energy weapons."}, {"name": "Applied Ballistics", "req": "Level 12, STR 7, INT 5, Guns 60 or Explos. 60", "ranks": 1, "desc": "Your experience with conventionally sized weaponry has taught you fundamental skills that can be applied to more powerful weapons. You've gained +25 Big Guns."}, {"name": "Atom Bomb Baby", "req": "Level 8, STR < 9, END 8 or AGL 8, Big Guns 50", "ranks": 1, "desc": "It's hard to operate heavy weaponry while also wearing heavy armor! You gain increased equip and reload speed (30,20,10%), as well as increased Big Guns (+15/10/5), while wearing clothes/light, medium, or heavy (non-power) armors."}, {"name": "Atomic!", "req": "Level 20, END 6", "ranks": 1, "desc": "With the Atomic! perk, you are 25% faster and stronger whenever you're basking in the warm glow of radiation. Outside irradiated areas, your Action Points regenerate faster and faster the higher your level of radiation sickness becomes."}, {"name": "Automatic Artistry", "req": "Level 10, PER 4", "ranks": 1, "desc": "Automatic Artistry reduces your spread with automatic weapons by 15% and increases our crit. chance with them by 10%."}, {"name": "Avant Apocalypse", "req": "Level 4", "ranks": 1, "desc": "Fashion clearly didn't hit its peak until *after* the war. When wearing Raider Armor, you gain +2 Endurance, +1 Strength, +25 AP, and your Unarmed and Melee Weapon AP cost is reduced by 15%."}, {"name": "Balanced Load", "req": "Level 2, STR 6 or PER 6 or END 6", "ranks": 1, "desc": "You're experienced with leverage and fulcrums. With a little attention to the finer details, you've gained +10% carry weight, which increases to 15% when your weapon is holstered. Your backpack AP regen penalty will also be reduced by one tier."}, {"name": "Better Criticals", "req": "Level 16, PER 6, LCK 6", "ranks": 1, "desc": "With the Better Criticals perk, you gain a 3% critical damage bonus per point of Perception."}, {"name": "Big Iron", "req": "Level 14, AGL 8, Guns 60", "ranks": 1, "desc": "Like the legendary ranger of old, your handgun handling is extraordinary - only when you face your opponent in a fair fight. During combat, while not sneaking and using a ballistic handgun, you gain +20% draw speed, as well as +35% attack speed for three seconds after unholstering your weapon."}, {"name": "Blade In The Shadow", "req": "Level 2, Melee Weap. 30, Sneak 30", "ranks": 1, "desc": "You're most devastating when unnoticed. Your bladed weapon attacks gain +10 damage while outside of your target's line of sight, and another +10 and +50% crit. damage if they are also outside of combat."}, {"name": "Blood Bag", "req": "Level 2, END 7, Survival 25", "ranks": 1, "desc": "You're a universal donor in a world that needs blood transfusions more than ever. You gain an extra blood bag when using a blood draw kit, and your recovered health is increased by 25% and you gain extra AP regeneration while under the effect of a blood bag or blood draw kit."}, {"name": "Blue Moon", "req": "Level 24, PER 7, LCK 7", "ranks": 1, "desc": "Under the calming gaze of the moon, from 9PM-5AM, you gain +5% crit. chance and +50% crit. damage while also using a scope."}, {"name": "Blunt Force Trauma", "req": "Level 6, STR 7, Melee Weap. 35 or Unarmed 35", "ranks": 2, "desc": "Blunt Force Trauma increases your crit. chance and attack speed with blunt weapons by 10%, and the second rank increases your crit. dramage by 15% and your damage by an additional 15%."}, {"name": "Boiadero", "req": "Level 10, CHR 5, Survival 35", "ranks": 1, "desc": "Smoking, Courier. It will take a lot of tobacco-smoking for you to become a *boiadeiro*. In these wild, uncultured times, with a gun in one hand and two unfiltered cigarettes in the other, you make your own rules. +5 Crit Chance while holding 10+ individual cigarettes. +5 Speech while holding 8+ cigarette packs. +1 Charisma while holding 5+ cigarette cartons."}, {"name": "Bolt-Action Hero", "req": "Level 8, PER 7, AGL 5 , Guns 65", "ranks": 2, "desc": "Rack'em up! Bolt-action weapons gain 10% attack speed and +5 DT penetration. The second rank grants a 15% damage bonus and 5% faster attack speed."}, {"name": "Boozer", "req": "Level 16, END 6, INT < 6", "ranks": 1, "desc": "When under the effects of alcohol, your addiction duration is halved, and prives are reduced by 10%."}, {"name": "Boxer", "req": "Level 6, AGL 5, END 5, Unarmed 35", "ranks": 1, "desc": "You gotta roll with the punches. You've gained +10% attack speed with unarmed weapons, and +1 unarmed damage per point of Agility."}, {"name": "Broad Daylight", "req": "Level 10, Sneak 50", "ranks": 1, "desc": "You're so sneaky that you can sneak even with your Pip-Boy light on! Any time the Pip-Boy light is on, you gain a sneak bonus to offset the light's sneak penalty."}, {"name": "Buck Wild", "req": "Level 25, AGL 8, Guns 75", "ranks": 1, "desc": "It may not be mating season, but when you've got four walls around you and a shotgun in your hand, you're the most aggressive stag in the pack! Your shotgun spread, attack speed, and damage are all increased by 25% while in an interior."}, {"name": "Burden to Bear", "req": "Level 16, Strong Back, STR 8, END 8", "ranks": 1, "desc": "With the Burden To Bear perk, you can carry 4 more pounds of equipment for each point of both Strength and Endurance, on top of your Strong Back carry weight bonus."}, {"name": "Burning Sensation", "req": "Level 10, END 8", "ranks": 1, "desc": "Your anamolous body chemistry immediately rejects radiation, at the cost of your health. While you are irradiated, you will lose one point of health and disperse three points of radiation per second. This may be fatal!"}, {"name": "Burning Wasteland Sun", "req": "Level 14, END 6, Ener. Weap. 50", "ranks": 1, "desc": "Can you feel that blazing sun, beating down on you? Then your fire weapons have +8% crit. chance and +15% crit. damage, and they deal bonus limb and fatigue damage!"}, {"name": "Butcher", "req": "Level 8, Melee Weap. 35, Evil Karma", "ranks": 1, "desc": "Chop that meat! Thanks to your sadistic tendencies, you now gain bonus XP and restore action points when you cripple or dismember a limb, regardless of whether the target is living or dead. You also gain +20% non-power attack speed with one-handed melee weapons!"}, {"name": "Card Counter", "req": "Level 16, I Don't Believe In Luck, PER 9, INT 7", "ranks": 1, "desc": "All it takes is a keen eye and the discretion to not call attention to yourself. +Dramatically better results when gambling."}, {"name": "Center of Mass", "req": "Level 14, Ener. Weap. 70 or Guns 70 or Big Guns 70", "ranks": 1, "desc": "You don't fool around with fancy trick shots. Straight to the midsection and down they go. In Bullet Time, you do an additional 15% damage with attacks targeting the torso, and torso limb damage that you deal will be doubled."}, {"name": "Certified Tech", "req": "Level 24, INT 5, Science 60, Repair 60", "ranks": 1, "desc": "Your knowledge of robotic components allows you to break them more easily and salvage their mechanical corpses. You have a +25% chance to score critical hits against robots, and you'll also find more useful components on robots you destroy."}, {"name": "Chainsaw Carnage", "req": "Level 24, Butcher", "ranks": 1, "desc": "A hefty cleaver may hew bone, but you're starting to need high-volume viscera to fulfill your violent delights. You deal +20% damage with automatic melee weapons like the Chainsaw, and when you kill a target using such a weapon, you will gain +10 DT for four seconds and time will slow for a short duration. (The Thermic Lance does not qualify.)"}, {"name": "Chemist", "req": "Level 14, Med. 60", "ranks": 1, "desc": "With the Chemist perk, any chems you take last twice as long."}, {"name": "Clothes Make The Courier", "req": "Level 8, INT 7", "ranks": 1, "desc": "Since the time of Erasmus, people have known that dressing sharply is the key to success! While wearing clothing, you gain _10% XP, +7 to Barter, Speech, and Sneak, and suffer -50% limb damage."}, {"name": "Coiled Snake", "req": "Level 10, AGL 8, Survival 35", "ranks": 1, "desc": "You're extra dangerous when cornered or unseen. You gain +15% throwing velocity and attack speed with thrown melee weapons while crouched, as well as +25% movement speed and +15% attack speed while prone."}, {"name": "Cola Comrade", "req": "Level 8", "ranks": 1, "desc": "Sunset Sarsparilla may be nice, but when need that kick, Cola is the only thing that cuts it. When you drink Nuka-Colas, you gain +4% crit chance for two minutes. Special variants can also provide you extra permanent max health, carry weight, AP, or random skill bonuses."}, {"name": "Collective Consciousness", "req": "Level 20, CHR 6", "ranks": 1, "desc": "You're a master of manipulation. As you gain positive repuation with each faction, your Speech increases by +2 for each faction that likes you, and your Barter purchase prices are also reduced by 2% each if your karma is Evil or Very Evil."}, {"name": "Combustion Kid", "req": "Level 6, AGL 6, Explos. 30", "ranks": 1, "desc": "Wait, where did you get that grenade from? You gain +25% equip speed and +15% attack speed with throwable explosives and the detonator."}, {"name": "Commando", "req": "Level 12, PER 6, Guns 40 or Ener. Weap. 40 or Big Guns 40", "ranks": 2, "desc": "While using a rifle (or similar two-handed weapon), your accuracy is increased by 15% with each rank of the Commando perk."}, {"name": "Concentrated Fire", "req": "Level 18, Ener. Weap. 60 or Guns 60 or Big Guns 60", "ranks": 1, "desc": "With Concentrated Fire, your accuracy when targeting any body part in Bullet Time increases slightly with each subsequent attack on that body part, and your spread is decreased by 20% when using an automatic weapon."}, {"name": "Contents Under Pressure", "req": "Level 10, Explos. 50", "ranks": 2, "desc": "You're absolutely bursting at the seams with pyrotechnic pressure! While using a ranged fire-based weapon, you gain +20% attack speed, at the cost of 15% more condition damage. The second rank reduces the condition damage by 5%, and increases the attack speed bonus by 5%."}, {"name": "Cowboy", "req": "Level 10, Guns 45, Melee Weap. 25", "ranks": 1, "desc": "When using any cowboy weapon, your attack speed, accuracy, and damage are increased by 15%."}, {"name": "Critter Cruncher", "req": "Level 2, STR 6 or END 6", "ranks": 1, "desc": "The puny creatures of the wasteland can hardly scratch you. You suffer 50% less limb damage when being attacked by an insect or an animal, and you deal 50% more damage to them with your bare fists."}, {"name": "Cyborg", "req": "Level 14, Med. 60, Science 60", "ranks": 1, "desc": "You've made permanent enhancements to your body! The Cyborg perk instantly add +10% to your Poison, Radiation, Energy, and Fire resistances."}, {"name": "Cyborg Justice", "req": "Level 16, Cyborg, AGL 8, Melee Weap. 75, Science 50", "ranks": 1, "desc": "Your cybernetically enhanced arms vibrate your blade so finely that it can't be perceived by the naked eye. You've gained +15 DT penetration and doubled limb damage when using a bladed weapon, and +15% damage when attack a robot with your bladed weapon."}, {"name": "Daddy's Boy/Girl", "req": "Level 2, INT 6", "ranks": 3, "desc": "Just like dear old Dad, you've devoted your time to intellectual pursuits. With each rank, hacking gets easier and you use chems 10% more effectively."}, {"name": "Death Wish", "req": "Level 2", "ranks": 1, "desc": "The elation of feeling yourself at the precipice of death gives you a rush unlike any other. When an enemy lands a critical hit on you, you have a Luck based chance to receive an XP bonus equal to the damage dealt by that hit."}, {"name": "Deep Sleep", "req": "Level 6, Survival 30", "ranks": 1, "desc": "You sleep deeply no matter where you are. You get the Well Rested benefit no matter what bed you sleep in."}, {"name": "Demolition Expert", "req": "Level 6, Explos. 40", "ranks": 2, "desc": "With each rank of this perk, all of your Explosives weapons do an additional 10% damage and have 10% larger area of effect."}, {"name": "Desperado", "req": "Level 12, PER 7, Cowboy or Sweet Six Shooter", "ranks": 1, "desc": "You're a true desperado with impeccable precision. When using a cowboy weapon, you gain a crit. chance bonus that scales with your Perception (1% per point), an additional 3% crit. chance bonus if you're alone and facing more than three enemies at once, and you deal +20% damage against targets using ranged cowboy weapons."}, {"name": "Devil's Advocate", "req": "Level 14, CHR 8, Evil Karma", "ranks": 1, "desc": "You're most convincing when you lie; people immediately mistrust you when you're being truthful. You've gained +25 Speech, but only while your karma is Very Evil."}, {"name": "Direct Modes of Taxation", "req": "Level 12, PER 6, LCK 3, Barter 65", "ranks": 1, "desc": "You're the tax collector; the cold, icy grip of death won't part you from the money left on the bodies of NCR and Legion members. +Chance to find more NCR and Legion money on the bodies of their respective factions. +Perception-based chance to add NCR and Legion money to targets you hit with Unarmed strikes."}, {"name": "Discus Champ", "req": "Level 2, STR 5, Explos. 25", "ranks": 1, "desc": "There's nobody quite as good at throwing heavy, flat objects as you are! Your thrown mines travel with 2x/1.75x/1,5x speed while moving forward/backwards/sideways, respectively. You also gain +50% attack speed with mines, which increases to +75% while moving!"}, {"name": "Duck and Cover", "req": "Level 2, INT 5", "ranks": 1, "desc": "When danger threatens you, you never get hurt, you know just what to do! Duck.. and cover! You've gained 15% damage resistance against explosions."}, {"name": "Duelist", "req": "Level 10", "ranks": 1, "desc": "Fight'em on fair ground. When you kill a human or ghoul using a weapon of the same skill as you, you gain +15XP. For every 150 kills in this manner per each weapon type, you will gain +1 to that skill."}, {"name": "Entomologist", "req": "Level 4, Survival 45, INT 4", "ranks": 1, "desc": "With the Entomologist perk, you do an additional +50% damage every time you attack a mutated insect, like the Radroach, Giant Mantis, or Radscorpion, and you are able to find more of their parts in loot."}, {"name": "Extracurricular Knowledge", "req": "Level 10", "ranks": 1, "desc": "Selecting Extracurricular Knowledge will allow you to save a perk point for later, but you will be forced to take a new trait. This can be done multiple times. Your perk point can be used by activating this perk in the Pip-Boy."}, {"name": "Eye for An Eye", "req": "Level 4, LCK 5", "ranks": 1, "desc": "While your head is crippled, you gain an additional +25 crit damage and crit chance."}, {"name": "Fast Metabolism", "req": "Level 12, END 5, Survival 25", "ranks": 1, "desc": "With the Fast Metabolism perk, you gain a 20% Health bonus when using Stimpaks. Alcohol will also reduce your radiation twice as quickly."}, {"name": "Fatal Counter", "req": "Level 30, PER 5, STR 5, Unarmed 75 or Melee Weap. 75", "ranks": 1, "desc": "You're excellent at capitalizing on your enemy's vulnerabilities. When using unarmed or melee, you deal double damage and have doubled critical chance when attacking an enemy that has been staggered by a block/"}, {"name": "Ferocious Loyalty", "req": "Level 6, CHR 6", "ranks": 1, "desc": "The power of your personality inspires die-hard loyalty from your followers. When you drop below 50% Health, your companions gain much greater resistance to damage."}, {"name": "Fight Hungry", "req": "Level 2, Survival 20", "ranks": 1, "desc": "Desperation if your strongest motivator. In combat, when you have advanced or greater starvation, you gain +10% damage and +1 Endurance. "}, {"name": "Fight the Power!", "req": "Level 10", "ranks": 1, "desc": "You've had enough of the so-called \"authorities\" pushing poor folks around! You gain +2 DT, and +5% Critical Chance against anyone wearing the faction armor of the NCR, Legion, Enclave, or Brotherhood."}, {"name": "Finesse", "req": "Level 10, AGL 5", "ranks": 1, "desc": "With the Finesse perk, you have a higher chance to score a critical hit on an opponent in combat, equivalent to 5 extra points of Luck."}, {"name": "Fortune Finder", "req": "Level 6, LCK 5, Survival 35", "ranks": 1, "desc": "With the Fortune Finder perk, you'll find considerably more bottle caps in containers than you normally would. You can also punch locked containers with no weapon equipped to check if there is anything inside!"}, {"name": "Freeze!", "req": "Level 2, PER 5 or Trigger Discipline", "ranks": 1, "desc": "Hands in the air! Keep'em there! Don't move a muscle! One wrong move, and I'll blow you away, punk! +25% accuracy in Bullet Time while not moving. -15% accuracy outside of Bullet Time."}, {"name": "Friction Addiction", "req": "Level 8, END 7", "ranks": 1, "desc": "The best offense is a good defense, and you're at your toughest when taking punishment. You gain +1 DT and your enemy crit. chance is reduced by 3% per each point in Strength while you're blocking, and a percentage of your action points are restored each time you are hit. ((Luck / 20) * Max AP)"}, {"name": "Friend of the Night", "req": "Level 2, PER 7, Sneak 40 or Survival 40", "ranks": 1, "desc": "You are a true friend of the night. Your eyes adapt quickly to low-light conditions indoors and when darkness falls across the wastelands."}, {"name": "Full Metal Jacket", "req": "Level 18, Grunt, PER 7, END 6", "ranks": 1, "desc": "Full Metal Jacket grants 8 DT penetration, 10% crit. chance, +15% reload speed, and -15% enemy crit. chance when using a Grunt weapon and wearing medium armor."}, {"name": "Gallows Humor", "req": "Level 2, PER 5 , CHR 5, Evil Karma", "ranks": 1, "desc": "You know just the right time to \"lighten\" the mood with a dark joke. +10 Speech and Barter for 30 seconds after killing something. +25% increased XP and +1 Charisma for 30 seconds after killing something if you have an Evil or Very Evil companion."}, {"name": "Ghastly Scavenger", "req": "Level 12, Cannibal, END 8", "ranks": 1, "desc": "With Ghastly Scavenger, when you're in Sneak mode, you gain the option to eat a Super Mutant or Feral Ghoul corpse to regain Health equal to your Survival skill. If this act is witnessed, it is considered a crime against nature."}, {"name": "Grim Reaper's Sprint", "req": "Level 14, LCK 6", "ranks": 2, "desc": "If you kill a target in Bullet Time, 20 Action Points are restored upon exiting Bullet Time. The second rank increases the amount to 60."}, {"name": "Grunt", "req": "Level 10, Guns 45, Explos. 25, Melee Weap. 20", "ranks": 1, "desc": "Just good, honest infantry work! When using U.S. Army weapons, your Explosives, Unarmed, and Melee Weapons gain +15% damage, your Unarmed and Melee Weapons gain +25% equip speed, your automatic weapon spread is reduced by 20%, your semi-automatic spread is reduced by 10%, you gain +15% reload speed, and Strength requirements are reduced by 1."}, {"name": "Gun Guru", "req": "Level 10, INT 6, Guns 60", "ranks": 1, "desc": "You're so good with brass and powders that they'd hire you at the Gun Runners as a reloader. You gain +30 Repair while using a physical Reloading Bench."}, {"name": "Gun Nut", "req": "Level 2, INT 4, Repair 30, Guns 30", "ranks": 3, "desc": "You're obsessed with using and maintaining a wide variety of conventional firearms. With each rank of the Gun Nut perk, when using a gun, spread and item condition damage are reduced by 5%."}, {"name": "Gunshots N' Drop Shots", "req": "Level 6, AGL 5, PER 5", "ranks": 1, "desc": "Your acuity while under the effects of alcohol is nothing short of legendary. You no longer suffer a spread penalty while drunk."}, {"name": "Gunslinger", "req": "Level 6, Guns 40 or Ener. Weap. 40", "ranks": 2, "desc": "While using a one-handed waepon, your accuracy is increased by 15% per rank."}, {"name": "Hand Loader", "req": "Level 12, Repair 60, Guns 50 or Big Guns 50", "ranks": 1, "desc": "You know your way around a reloading bench and don't let good brass and hulls go to waste. When you use Guns, you are more likely to recover cases and hulls. Your reloading recipes also require less powder, and you also have access to advanced ammo types at the Reloading Bench."}, {"name": "Handgun Hotshot", "req": "Level 10, Guns 40 or Big Guns 40 or Ener. Weap. 40", "ranks": 2, "desc": "The Handgun Hotshot perks grants 5 DT penetration to ballistic handguns and 15% attack speed with non-automatic, ballistic handguns. The second rank grants an additional +20% damage, at cost of increasing Strength requirements by 1."}, {"name": "Hardy", "req": "Level 6, END 5, Survival 25", "ranks": 1, "desc": "The natural healing power of the human body is your greatest resource. While your Hunger and.or Dehydration are over 150, you gain +15 Survival and +15% to recovered health."}, {"name": "Headhunter", "req": "Level 28, PER 8, Guns 75 or Ener. Weap. 75 or Big Guns 75", "ranks": 2, "desc": "You take your time to ensure that your bullets will land right between your target's eyes. You gain +25% chance to hit your target's head in Bullet Time, at cost of 50% increased AP cost. The second rank increases your reload speed while prone by 25%, and your crit. damage while attacking your target's head in Bullet Time by 15%."}, {"name": "Headless Courier", "req": "Level 10, Survival 50", "ranks": 1, "desc": "Ride on through the night, chasing the perfect helmet that doesn't exist. When not wearing any headgear, your head takes half damage and you gain +2 Perception."}, {"name": "Healing Factor", "req": "Level 8, END 8, LCK 8", "ranks": 1, "desc": "The radiation in your body, combined with your unique genetics, has allowed you to develop a strange treatment which has made your body slowly heal your limbs up to full any time they're damaged, at the cost of increasing all of your needs while you heal."}, {"name": "Heave, Ho!", "req": "Level 2, STR 5 or AGL 6, Explos. 25 or Melee Weap. 25", "ranks": 1, "desc": "Quite an arm you've got there. All of your thrown weapons gain 25% velocity and damage while holding the aim key."}, {"name": "Heavy Gunner", "req": "Level 12, STR 8 or AGL 6, Big Guns 55, Guns 30", "ranks": 1, "desc": "While using Big Guns, Heavy Gunner grants +15% improved equip speed and Bullet Time chance to hit, -20% movement spread penalty, and your automatic weapon spread is reduced by 5% per second while continuously firing, to a max of 025%."}, {"name": "Heavyweight", "req": "Level 8, STR 7 or END 7", "ranks": 1, "desc": "Have you been working out? Weapons heavier than 10lbs now weight half as much for you. (Modified weapons that drop below 10lbs. will not gain this benefit.)"}, {"name": "Hidden Weapons", "req": "Level 8, Survival 35 or Sneak 40", "ranks": 1, "desc": "Whether your weapon jams, or it gets shot out of your hand, you'll be ready. Basic holdout weapons are granted additional 5/10/15/20/25/30/35% crit. chance and damage for 0-15/16-25/26-35/36-50/51-65/66-80/81-100 points in the Survival skill. Your equip speed with basic holdout weapons is also increased by 35%."}, {"name": "High Roller", "req": "Level 30, LCK 7", "ranks": 1, "desc": "All those chips have got you feeling lucky! You gain +2% critical chance per when holding 2500+ Tops, Ultra-Luxe, Sierra Madre, Atomic Wrangler, or Gomorrah chips, up to a maximum of 10%."}, {"name": "Hit the Deck", "req": "Level 12, Explos. 50", "ranks": 1, "desc": "Your familiarity with Explosives allows you to avoid a portion of their damage. Your DT is increased by 15 against all explosives."}, {"name": "Hobbler", "req": "Level 12, PER 7", "ranks": 1, "desc": "With the Hobbler perk, your attacks to legs deal double limb damage, your run speed is increased by 10% with each crippled leg, and you gain +5 DT penetration and 25% better chance to hit an opponent's legs in Bullet Time."}, {"name": "Home on the Range", "req": "Level 6, Survival 35", "ranks": 1, "desc": "Whenever you interact with a campfire, you have the option of sleeping, with all the benefits that sleep brings."}, {"name": "Hunter", "req": "Level 2, PER 4, Survival 30", "ranks": 1, "desc": "In combat, you do +50% critical damage against animals and mutated animals, and +50% damage against them while using guns and sneaking. You're also able to collect their meat more often."}, {"name": "Immaculate Coiffure", "req": "Level 6, CHR 7", "ranks": 1, "desc": "All of your time spent styling your bespoke bob has left you clinging to your precious few remaining bobby pins. You gain +3 Lockpick for each missing bobby pin as your total diminishes below 9. (+24 Lockpick max)"}, {"name": "Impact Play", "req": "Level 10, Masochist, STR 3, END 7", "ranks": 1, "desc": "At first it was just bleeding that got your heart racing, but you've developed a taste for more percussive punishment. Each time you are hit with an Unarmed or Melee Weapon, you gain +10% DR for 15 seconds, up to a maximum of +50%."}, {"name": "Implant GRX", "req": "Level 30, END 8", "ranks": 2, "desc": "You gain a non-addictive subdermal Turbo (chem) injector. This perk may be taken twice, with the second rank increased the effect from 2 to 3 seconds and the uses per day from 5 to 10. [Activated in the Pip-Boy inventory.]"}, {"name": "In Shining Armor", "req": "Level 2, Repair 40, Science 30", "ranks": 1, "desc": "Beams reflect off the mirror-like finish of your gleaming armor! You gain an additional +5 DT against energy weapons while wearing any metal armor, and +2 while wearing reflective eyewear."}, {"name": "Indirect Bartering", "req": "Level 2, STR 6", "ranks": 1, "desc": "You're not actually threatening any violence, but anybody with a pair of eyes can tell that you could if you chose to. You gain +1 to Barter and Speech for each point of STR while your Karma is Evil or Very Evil."}, {"name": "Inertial Dampening", "req": "Level 20, AGL 8, END 8", "ranks": 1, "desc": "You've learned to avoid damage by diving away from it at just the right time. Whenever you're in the air, you gain +7 DT and +20% DR."}, {"name": "Infighter", "req": "Level 12, PER < 8", "ranks": 1, "desc": "If you can't see the whites of their eyes, you can't put a bullet between them. While close to your target, your DT is increased by 5 and damage is improved by 10%, your enemey's crit. chance is reduced by 30%, and their DT is reduced by 5."}, {"name": "Intense Training", "req": "Level 2, AGL < 10 or CHR < 10 or END < 10 or LCK < 10 or PER < 10 or INT < 10 or STR < 10", "ranks": 10, "desc": "With the Intense Training perk, you can put a single point into any of your SPECIAL attributes."}, {"name": "Iron Fist", "req": "Level 4, STR 4, END 5, Unarmed 25", "ranks": 2, "desc": "With each rank of the Iron Fist perk, you deal +1 Unarmed Damage per rank of Endurance."}, {"name": "Iron Focus", "req": "Level 24, END 8, Big Guns 75", "ranks": 1, "desc": "Iron Focus grants 10% DR while aiming with any ranged weapon, as well as -20% spread and +25% crit. chance while aiming with Big Guns."}, {"name": "Irradiated Beauty", "req": "Level 6, END 6, CHR 4", "ranks": 1, "desc": "When doused in radiation, your natural aura is enhanced. You gain +1 Charisma at 250/450/650 rads."}, {"name": "Junk Rounds", "req": "Level 2, INT 6, Repair 25", "ranks": 1, "desc": "Survival is the mother of invention! Craft ammo at the Reloading Bench using alternate materials (Scrap Metal and Tin Cans)."}, {"name": "Jury Rigging", "req": "Level 24, Repair 90, INT 7", "ranks": 1, "desc": "You possess the amazing ability to repair any item using a roughly similar item. Fix a Trail Carbine with a Hunting Rifle, a Plasma Defender with a Laser Pistol, or even Power Armor with Metal Armor. How does it work? Nobody knows... except you."}, {"name": "Just Lucky I'm Alive", "req": "Level 50, NOT Thought You Died, NOT Ain't Like That Now, Neutral Karma", "ranks": 1, "desc": "You've had lots of close calls. Whenever you finish a fight with less than 25% Health, your Luck increases by +4 for 3 minutes. You're also -25% as likely to be critically hit, and your own critical hits inflict +25% damage."}, {"name": "Laser Commander", "req": "Level 18, Ener. Weap. 75", "ranks": 1, "desc": "From the humble Laser Pistol to the mighty Gatling Laser, you do +15% damage and have +10 chance to critically hit with any laser weapon."}, {"name": "Lawbringer", "req": "Level 14, Good Karma", "ranks": 1, "desc": "Once you have the Lawbringer perk, any evil character you kill will have a finger on their corpse. This finger can then be sold to a certain person (whose identity is disclosed when you take the perk) for caps and positive Karma."}, {"name": "Lead Belly", "req": "Level 2, Survival 40 or END 7", "ranks": 2, "desc": "With each rank of the Lead Belly perk, you take 25% less radiation when consuming irradiated food and drink. You will also no longer suffer SPECIAL penalties when consuming raw meat. "}, {"name": "Life Giver", "req": "Level 12", "ranks": 1, "desc": "With the Life Giver perk, you and your companions gain an additional 30 health. The value of your Medicine and Survival skills will also be doubled when using a Doctor's Bag or Medkit on a companion."}, {"name": "Light Step", "req": "Level 6, Sneak 40", "ranks": 1, "desc": "With the Light Step perk, your chance to set off mines and floor-based traps while sneaking is reduced by 10% per point of Agility. This effect is multiplicative, with a minimum chance to set off traps of 35%."}, {"name": "Light Touch", "req": "Level 6, STR < 6, AGL 6", "ranks": 1, "desc": "Heavy armor just isn't your thing, so you've learned to customize light armor for maximum benefit. While wearing light armor or clothing, you gain +3 DT and DR, +15% AP regeneration speed and your enemies suffer a -25% Critical Hit chance."}, {"name": "Little Leaguer", "req": "Level 2, STR 4, Melee Weap. 25", "ranks": 3, "desc": "Years as the Vault little league MVP have honed your hitting and throwing. With each rank, you gain +10% damage when using bats and nail boards, and you throw grenades 10% harder and farther."}, {"name": "Living Anatomy", "req": "Level 12, Med. 70", "ranks": 1, "desc": "Living Anatomy allows you to see the Health and DT of any target. It also gives you a +5% bonus to damage against Humans and non-feral Ghouls, and allows you to collect resources from abominations."}, {"name": "Long Haul", "req": "Level 12, END 8, Survival 75", "ranks": 1, "desc": "You have learned how to pack mountains of gear for the Long Haul. Being over-encumbered no longer prevents you from using Fast Travel."}, {"name": "Lucky Number", "req": "Level 4", "ranks": 1, "desc": "\"Luck is an accident that happens to the confident.\" Your resolute confidence in your Lucky Number manifests in the ability to fire a weapon with a single projectile with ideal accuracy when your ammo count matches your current luck."}, {"name": "Mad Bomber", "req": "Level 6, Repair 40, Explos. 35", "ranks": 1, "desc": "Your intimate knowledge of gadgets and explosives have combined to make you... the Mad Bomber! Your crafting requirements for throwables explosives are reduced by 35."}, {"name": "Mad Science", "req": "Level 40, INT 8, Science 80, Ener. Weap. 75", "ranks": 1, "desc": "Harness the power of your intellect with the Mad Science perk! You've gained 15% damage, reload speed, and attack speed with mad science weapons, and your Luck is increased by 1 for the duration of combat for each critical kill you deal in battle, up to a max of +10."}, {"name": "Magnetic Personality", "req": "Level 16, CHR < 10", "ranks": 1, "desc": "Your presence seems to compel others to follow you! With this perk, you can have one more active companion in your party. However, you still cannot have more than five companions at once."}, {"name": "Marathon Runner", "req": "Level 10, Survival 45", "ranks": 1, "desc": "With the Marathon Runner perk, you no longer suffer movement speed penalties when wearing medium or heavy armor, and you move 10% faster when wearing light or no armor."}, {"name": "Martyr", "req": "Level 20, CHR 8", "ranks": 1, "desc": "When struck, you're inclined to simply turn the other cheek, rather than strike back. Your divine Luck grants you a small chance for each wound's health loss to be partially restored."}, {"name": "Master Trader", "req": "Level 26, CHR 7, Barter 50, Speech 50", "ranks": 1, "desc": "When you take the Master Trader perk, you gain a 3% discount per 10 points in Speech."}, {"name": "Math Wrath", "req": "Level 14, Science 70 or INT 8", "ranks": 1, "desc": "You are able to optimize your Pip-Boy's Bullet Time logic, reducing all AP costs by 5% per each 10 points in Science above 40. Charging your Pip-Vision will also be twice as efficient."}, {"name": "Maze Runner", "req": "Level 10, AGL 6, INT 6", "ranks": 1, "desc": "You're most agile when cornered; you gain +10% movement speed while indoors and not sneaking. You also gain an additional +2 Agility while in combat in an interior."}, {"name": "Meltdown", "req": "Level 16, Ener. Weap. 90", "ranks": 1, "desc": "Meltdown grants you +25% crit. damage with plasma weapons, and critical hits on targets wearing metallic armor will heavily damage their armor and reduce their resistances."}, {"name": "Metacarpal Mayhem", "req": "Level 50, STR 8, END 8, Unarmed 100", "ranks": 1, "desc": "Your fists are practically weapons of mass destruction! Your unarmed power attack speed is increased 15%, your unarmed crit chance increases with your Strength, and your unarmed crit damage increases with Endurance, both applying a multiplicative x1.01 per point, up to a maximum of +21%."}, {"name": "Mister Sandman", "req": "Level 6, Sneak 50, AGL 8", "ranks": 1, "desc": "With the Mister Sandman perk, when you're in Sneak mode, you gain the option to silently kill any human or Ghoul while they're sleeping, and you gain bonus XP when doing so."}, {"name": "Monkey Wrench", "req": "Level 6, Repair 60", "ranks": 1, "desc": "You're familiar enough with robots that taking them apart is a snap --- doubly so if you don't care about putting them back together again. You deal 50% more damage against robots when using melee weapons."}, {"name": "My Own Master Now", "req": "Level 10, Shunned by NCR, Legion, and Strip", "ranks": 1, "desc": "You've worked under the shackles of the wasteland factions long enough! You're your own master! You gain +1 Endurance, and for each faction that dislikes you, you gain +1 damage, and -1% limb damage."}, {"name": "Nerd Rage!", "req": "Level 10, Science 75", "ranks": 1, "desc": "You've been pushed around long enough! Whenever your health drops below 20%, enemy crit. chance is reduced by 10% for each point of Intelligence you have."}, {"name": "Nerves of Steel", "req": "Level 26, AGL 6, END 4", "ranks": 2, "desc": "With the Nerves of Steel perk, you regenerate Action Points 20% faster per rank."}, {"name": "Ninja", "req": "Level 20, Sneak 80, Melee Weap. 80 or Unarmed 80", "ranks": 1, "desc": "The Ninja perk grants you the power of the fabled shadow warriors. When attacking with either Melee or Unarmed, you gain a +15% critical chance on every strike. Sneak attack criticals do 25% more damage than normal."}, {"name": "Non-Combatant", "req": "Level 2", "ranks": 1, "desc": "It's not your fight, you're just trying to stay alive. You gain +8 DT and +15% DR while your weapon is holstered in combat."}, {"name": "Notorious E.V.I.L.", "req": "Level 16, Miss Fortunte or Mysterious Stranger, Evil Karma", "ranks": 1, "desc": "While you are Evil or Very Evil, Miss Fortune and the Mysterious Stranger will appear to help you twice as often."}, {"name": "Nowhere To Hide", "req": "Level 2, PER 6", "ranks": 1, "desc": "Where do you think you're going? Nobody gets away. You deal double damage to fleeing targets, and +50% damage to cloaked targets."}, {"name": "Nuclear Anomaly", "req": "Level 50, END 10", "ranks": 1, "desc": "With the Nuclear Anamoly perk, whenever your Health is reduced to 20 or less, you will erupt into a devastating nuclear explosion. Note that any allies in the vicinity will also suffer the effects of the blast!"}, {"name": "Nuka Chemist", "req": "Level 14, Science 65", "ranks": 1, "desc": "You have unraveled some of the greatest mysteries of Pre-War masters: formulas for developing special Nuka-Colas! This perk unlocks special Nuka-Cola recipes at the Workbench."}, {"name": "Old World Gourmet", "req": "Level 2, END 6, Survival 45", "ranks": 1, "desc": "Thanks to wasteland living, you've learned the secrets of the pre-war scroungers! You've gained +25% Addiction Resistance, and a healing bonus from junk food and pre-war liquor."}, {"name": "Overkiller", "req": "Level 18, STR 8, Big Guns 80, Melee Weap. 80", "ranks": 1, "desc": "Big guns, big muscles, big melee. When using a heavy melee weapon, you gain +15% damage, +20% power attack damage, and any hits that cripple a limb will knock your target down."}, {"name": "Overt Coercion", "req": "Level 24, STR 6, CHR < 5, Indirect Bartering, Evil Karma", "ranks": 1, "desc": "Implication and insinuation has given way to explicit threats. Each point of STR above 5 grants -5% to purchase prices while your karma is Evil or Very Evil, up to a maximum of -25%."}, {"name": "Overwhelming Odds", "req": "Level 16, INT 8", "ranks": 1, "desc": "You've learned how to tilt the odds in your favor when outnumbered. Your weapon damage and Bullet Time accuracy are increased by 15%, and you gain +5 DT penetration while fighting a group of five or more enemies."}, {"name": "Pack Rat", "req": "Level 30, INT 6, Survival 80", "ranks": 1, "desc": "You have learned the value of careful packing. Items with a weight of 2 or less weigh half as much for you."}, {"name": "Party Hard", "req": "Level 8, Survival 30 or END 6", "ranks": 1, "desc": "Your ruthless party momentum allows you to ignore the negative effects of alcohol."}, {"name": "Piercing Strike", "req": "Level 12, STR 7, Unarmed 50 or Melee Weap. 50", "ranks": 1, "desc": "Piercing Strike makes all of your Unarmed and Melee Weapons (including thrown) negate 2 points of DT on the target per point in Strength. Bleeding effects that you afflict to enemies will also be the maximum severity."}, {"name": "Plasma Spaz", "req": "Level 10, Ener. Weap. 70, AGL 5", "ranks": 1, "desc": "You're just so excited about plasma that you can't (magnetically) contain yourself! Your attack speed and AP cost with plasma weapons are improved by 20%."}, {"name": "Play With Fire", "req": "Level 2, END 5, Explos. 25", "ranks": 1, "desc": "You've got a habit of playing with fire; your burns have increased your fire resistance. You've gained +15% fire resistance and +10% attack speed while using a fire-based weapon."}, {"name": "Prohibition", "req": "Level 2, PER < 6, INT < 6", "ranks": 1, "desc": "They're still out there. Looking for booze... your booze. You're not sure who \"they\" are, the only way they'll take it is from your cold, dead hands! -1 Intelligence while under the effects of alcohol. +10 Barter while under the effects of alcohol. +10 Barter while holding 10 or more bottles of alcohol."}, {"name": "Puppies!", "req": "Level 2, LCK 8", "ranks": 1, "desc": "With the Puppies! perk, if Dogmeat dies, you'll be able to get a new canine companion from his litter of puppies. Just wait a bit, and you'll find your new furry friend waiting outside Vault 101."}, {"name": "Purifier", "req": "Level 14", "ranks": 1, "desc": "As a purifier of the wasteland, you do +50% damage with Melee and Unarmed weapons against Centaurs, Nightstalkers, Spore Plants, Spore Carriers, Deathclaws, Super Mutants, and Feral Ghouls."}, {"name": "Pyromaniac", "req": "Level 12, Ener. Weap. 60", "ranks": 1, "desc": "With the Pyromaniac perk, you do +50% damage and afterburn damage with fire-based weapons, like the Flamer and Shishkebab."}, {"name": "Quick Draw", "req": "Level 8, AGL 5", "ranks": 1, "desc": "Quick Draw makes all of your weapon equipping and holstering 10% faster per each points in the appropriate weapon skill above 30."}, {"name": "Quick Pockets", "req": "Level 4, AGL 4, Ener. Weapon. 25 or Guns 25 or Big Guns 25 or Unarmed 25 or Melee Weap. 25 or Explos. 25", "ranks": 1, "desc": "You have learned to more quickly utilize your throwables. This perk grants +20% equip speed and +40% attack speed for a few seconds after equipping a throwable via Quick Select."}, {"name": "Rad Absorption", "req": "Level 14, END 7 or Survival 50", "ranks": 1, "desc": "With the Rad Absorption perk, your radiation level dissipates by 1 point every 10 seconds."}, {"name": "Rad Child", "req": "Level 20, Survival 75", "ranks": 1, "desc": "You truly are a rad child. As you go through the increasingly devastating stages of radiation sickness, you will regenerate more and more health while actively being irradiated by higher intensities of radiation."}, {"name": "Rad Resistance", "req": "Level 8, Survival 40, END 5", "ranks": 1, "desc": "Rad Resistance allows you to -- what else? -- resist radiation. This perks grants an additional 25% to Radiation Resistance."}, {"name": "Radiation Renegade", "req": "Level 8, Science 50", "ranks": 1, "desc": "Why forgo radiation protection in favor of damage protection when you could have both? While wearing a radiation suit, you gain the following benefits: +10% Carry Weight, +10 DT/+20% DR, +25 AP, -20% Limb Damage, -25% enemy crit. chance. You also don't suffer a sneaking detection penalty while running!"}, {"name": "Rapid Reload", "req": "Level 8, AGL 5, Guns 40 or Ener. Weap. 40 or Big Guns 40", "ranks": 2, "desc": "Rapid Reload makes all of your weapon reloads 15% faster."}, {"name": "Red Sun", "req": "Level 10, Ener. Weap. 40", "ranks": 1, "desc": "Can you feel the rays of the glorious sunshine? When you're charged by the rays of the sun (outside, 7AM-7PM) your laser weapons will penetrate 5 DT and gain a moderate damage bonus which increases the further away your target is. (+3-7 damage)"}, {"name": "Repair Rascal", "req": "Level 6, Survival 40, Repair 40", "ranks": 2, "desc": "Repair Rascal grants +15% damage, equip, and attack speed with repair-related weapons, and reduces their strength requirement by 1. The second rank grants an additional +10% damage and crit. damage, and +15% crit. chance."}, {"name": "Retention", "req": "Level 2, INT 6", "ranks": 1, "desc": "With the Retention perk, the bonuses granted by skills magazines last three times as long."}, {"name": "Return To Ashes", "req": "Level 6, END 7, Ener. Weap. 50 or Explos. 50", "ranks": 1, "desc": "Your flames burn hotter than anyone else's! You gain +50% damage when you and your enemy are both using fire-based weapons."}, {"name": "Rigorous Self Critique", "req": "Level 8, Evil Karma", "ranks": 1, "desc": "Your hands may not be clean, but with lots of soap and a chance in behavior, you can wash away your past to start anew. +1/2 Strength while Good/Very Good. -2 Endurance while Evil/Very Evil. Your XP will be penalized whenever you lose karma, in an amount equal to the magnitude of the change multiplied by your Intelligence."}, {"name": "Road Rage", "req": "Level 12, END 6, Guns 35, Unarmed 25, Survival 50", "ranks": 1, "desc": "Redden the road, release the rage! With the Road Rage perk, you gain +25 attack speed, +10% damage, and -10% spread when using knuckle weapons, Chinese/.32 pistols, tire irons, throwing spears, single and double-barrel shotguns, lead pipes, and other wasteland weapons."}, {"name": "Robotics Expert", "req": "Level 12, Science 50, INT 5", "ranks": 1, "desc": "With the Robotics Expert perk, you do an additional 7% damage per 10 points in Science above 50 to robots. In addition, activating a hostile robot while undetected will allow you to put that robot into a permanent shutdown state."}, {"name": "Rolling With The Punches", "req": "Level 2, END 5, Unarmed 25", "ranks": 1, "desc": "When your fists are out, you float like a bloatfly. You gain +12% speed for 5 seconds whenever you're hit by a melee attack with an unarmed weapon equipped. (This effect does NOT stack)"}, {"name": "Run n' Gun", "req": "Level 8, Guns 45 or Ener. Weap. 45 or Big Guns 45", "ranks": 1, "desc": "The Run n' Gun perk reduces spread penalties while moving by 50%."}, {"name": "Saguaro Stalker", "req": "Level 12, Sneak 50, Survival 50", "ranks": 1, "desc": "Like the silent spectres of the Sonoran desert, you blend in most effectively when staying still. You gain +10 Sneak, +15% silenced weapon crit. chance, and +15% damage against targets which do not have you anywhere in their line of sight while not moving."}, {"name": "Scoundrel", "req": "Level 4, CHR 7", "ranks": 3, "desc": "Take the Scoundrel perk, and you can use your wily charms to influence people. With each rank, vendors give an 8% discount, and you gain extra XP for passing speech checks."}, {"name": "Scrounger", "req": "Level 8, Survival 50, LCK 3", "ranks": 1, "desc": "With the Scrounger perk, you'll find considerably more ammunition in containers than you normally would."}, {"name": "Servant of Chaos", "req": "Level 8", "ranks": 1, "desc": "You swear loyalty to no creed, no culture, and no crown. As a Servant of Chaos, you will gain XP anytime your karma changes in the opposite direction of your current alignment, equal to the degree of the change."}, {"name": "Sharpshooter", "req": "Level 30, PER 10", "ranks": 1, "desc": "Your visual acuity borders on clairvoyance. With this perk, the spread of all ranged weapons is decreased by 25%."}, {"name": "Shell Shock", "req": "Level 8, AGL 6, Guns 50", "ranks": 1, "desc": "You've always got a shotgun handy for close encounters, and you'll never get caught with it unloaded. You've gained +35% equip speed and +25% reload speed with shotguns."}, {"name": "Shotgun Surgeon", "req": "Level 10, Guns 45, PER 6", "ranks": 2, "desc": "Your precision with a scattergun is something to behold. When using shotguns, each rank of Shotgun Surgeon grants you 6 points of DT penetration and -8% spread."}, {"name": "Silent Running", "req": "Level 6, AGL 6, Sneak 50", "ranks": 2, "desc": "With the Silent Running perk, running no longer factors into a successful sneak attempt. The second rank grants an additional +2% sneaking speed per each 10 points in Sneak."}, {"name": "Sixgun Samurai", "req": "Level 30, AGL 9, Guns 80, Melee Weap. 80", "ranks": 1, "desc": "Your first hit on a weapon after drawing a revolver will cause the target to drop a one-handed weapon or jam a two-handed weapon. If you hit their right arm, it will cripple it instead. Your first sword hit after switching off a revolver will have 2x crit. chance and crit. damage. If it's a power attack, it will instead deal +50% damage. Your first revolver hit after switching off a sword will penetrade 10 DT and guarantee a crit."}, {"name": "Size Matters", "req": "Level 4, STR 5, Big Guns 30", "ranks": 3, "desc": "You're obsessed with really big weapons. With each rank of this perk, you gain 10% better accuracy, reload and equip speed when using Big Guns."}, {"name": "Slayer", "req": "Level 20, AGL 7, STR 7, Unarmed 70 or Melee Weap. 70", "ranks": 2, "desc": "The slayer walks the earth! Each rank of the Slayer perk increases the speed of all your Melee Weapons and Unarmed Attacks by 20%."}, {"name": "Sleepwalker", "req": "Level 2, END 4, AGL 4", "ranks": 1, "desc": "Left foot, right foot. Left leg, right leg. Once you get going, you can practically sleep on your feet. While walking or running at night, you recover sleep deprivation, at a rate of 1 per 2 seconds of walking."}, {"name": "Slick Shooter", "req": "Level 10, INT 7", "ranks": 1, "desc": "You know to target an enemy when they're most vulnerable. You gain a 50% boost to your crit. chance while your target is reloading."}, {"name": "Sneaking Tiger", "req": "Level 16, END 4, AGL 8, Sneak 50", "ranks": 1, "desc": "Lithe and nimble, you move so quickly that you only take glancing hits. While crouched and moving, you gain +1 DT per point of Agility up to 5, and +2 DT for each point of Agility above 5."}, {"name": "Sneering Imperalist", "req": "Level 8, Evil Karma", "ranks": 1, "desc": "You don't take kindly to raiders, junkies, or tribals trying to \"settle\" or \"stay alive\" in civilized lands. Against drity raider, slaver, and junkie types, as well as tribals, you do +15% damage and have a bonus to hit in Bullet Time."}, {"name": "Sniper", "req": "Level 28, PER 8, Guns 75 or Ener. Weap. 75 or Big Guns 75", "ranks": 1, "desc": "With the Sniper perk, your chance to hit an opponent's head in Bullet Time is increased by 25%, and your crit. chance is increased by 25% while using a scope and crouched."}, {"name": "Social Drinker", "req": "Level 2, CHR 8", "ranks": 1, "desc": "You're not drinking to get drunk, you're drinking to have a good time with your friends. You have -20% addiction chance when traveling with at least one companion."}, {"name": "Soda Sommelier", "req": "Level 6, Survival 40, Repair 40", "ranks": 1, "desc": "200 years of desolation hasn't drained the taste of good ol' soda pop. In fact, some say it tastes better when it's flat! You gain a bonus to max health and heal extra health when drinking any bubbly drink."}, {"name": "Splash Damage", "req": "Level 12, Explos. 60", "ranks": 1, "desc": "When you're deep in enemy territory, you just start chucking grenades and hope for the best. All Explosives have a 25% larger area of effect."}, {"name": "Spotlight", "req": "Level 10, PER 8, CHR < 6, INT 7", "ranks": 1, "desc": "Your eyes pierce through people's lies. Each time you fail or succeed a particular dialog skill check for the first time, your Perception is increased by 1 and your Charisma is reduced by 1 for three minutes. Additionally, for every 2 successful checks per 1 failed check, you will gain a permanent +1 to Speech."}, {"name": "Stay Frosty", "req": "Level 12, Ener. Weap. 60", "ranks": 1, "desc": "With the Stay Frosty perk, cryogenic weapons do 50% more damage and the effects last 50% longer."}, {"name": "Steel Jacketed", "req": "Level 10, STR 7", "ranks": 1, "desc": "Yours is a heavy burden, and you need the heaviest of armors to survive it. While in non-powered heavy armor, you gain +25% carry weight, +1 Endurance, +10% combat movement speed, and +15% Unarmed and Melee Weapon damage."}, {"name": "Stonewall", "req": "Level 8, END 7, STR 7", "ranks": 1, "desc": "You gain +1 DT against all Melee Weapons and Unarmed attacks per point in Endurance, and immunity to knockdowns."}, {"name": "Strong Back", "req": "Level 6, STR 6, END 6", "ranks": 1, "desc": "With the Strong Back perk, you can carry 4 more pounds of equipment for each point of both Strength and Endurance, up to a maximum of +80lbs."}, {"name": "Strong Swimmer", "req": "Level 2, STR 4, END 4, AGL 6", "ranks": 1, "desc": "You're practically an irradiated mako shark! While not wearing power armor, you gain bonus swim speed based on your armor class up to a maximum of +25%. This bonus is reduced by 5% for medium and heavy armors while diving."}, {"name": "Sucker Punch", "req": "Level 2, AGL 6, Sneak 40, Unarmed 40", "ranks": 1, "desc": "Get'em while they're not looking! You gain +15 unarmed damage if your target is not in combat, or you are out of their line of sight. This bonus increases by +10 if your karma is Evil or Very Evil."}, {"name": "Suffer Well", "req": "Level 10, Last Laugh", "ranks": 1, "desc": "You're so delighted by laughing in the face of death that pain has become your greatest teacher. Whenever you lose health, you gain XP equal to the magnitude of health loss, multiplied by your Intelligence/100."}, {"name": "Super Slam", "req": "Level 12, STR 6, Melee Weap. 55 or Unarmed 55", "ranks": 1, "desc": "All Melee Weapons and Unarmed attacks have a chance to knock your target down when they penetrate the target's DT. This chance increases based on weapon weight and power attacking, and is proportionally reduced when a weapon's strength requirement is not met."}, {"name": "Survivalist", "req": "Level 10, END 6, Survival 75", "ranks": 1, "desc": "Material comforts and the buzz of conversation just aren't for you. With the Survivalist perk, actions which sate your hunger, thirst, and sleep deprivation will be twice as effective."}, {"name": "Sweet Six Shooter", "req": "Level 22, CHR 6, Guns 66, Good Karma", "ranks": 1, "desc": "The glint of your gun and the shine of your grin are nearly equal. You've gained access to powerful \"Blood\" revolver ammo recipes, along with 15% faster reload speed, 10% faster attack speed, +30% crit. chance and -60% weapon condition damage with revolvers while your Karma is Good or Very Good."}, {"name": "Swift Learner", "req": "Level 2, INT 4, PER 4", "ranks": 1, "desc": "The Swift Learner perk grants an additional 2% gained XP per point in Intelligence."}, {"name": "Swing For the Fences", "req": "Level 2, STR 6", "ranks": 1, "desc": "Knock'em right outta the park! Your attack speed with two handed melee weapons is increased by 8%, and you do an additional 7 points of damage while using any baseball bat."}, {"name": "Tag!", "req": "Level 16", "ranks": 1, "desc": "The Tag! perk allows you to select a fourth skill to be a tag skill, which will double the rate at which that skill advances."}, {"name": "Targeted Demolition", "req": "Level 16, PER 9, Big Guns 60, Explos. 60", "ranks": 1, "desc": "Targeted Demolition reduces explosive Big Guns' explosion radius by 20%, increases their attack speed by 20%, and increases their explosive projectile damage by 10%."}, {"name": "Tenacious", "req": "Level 8, END 7, LCK 3, Survival 50", "ranks": 1, "desc": "You've been bruised and scraped enough times to know how to give it your all when wounded. You gain improved movement speed with a crippled leg, improved gun spread with a crippled arm, +2 Endurance with a crippled torso, and improved chance to hit in Bullet Time with a crippled head."}, {"name": "That's Not a Knife", "req": "Level 4, END 5, Melee Weap. 30, Survival 30", "ranks": 1, "desc": "Your skin has been toughened by adversity and the wasteland sun. You gain +3 DT, an additional +1 DT per point in Endurance, when facing a target with a bladed weapon."}, {"name": "The Professional ", "req": "Level 6, Sneak 50", "ranks": 1, "desc": "Up close and personal, that's how you like it. Your Sneak Attack Criticals with pistols, revolvers, and submachine guns, whether Guns or Energy Weapons, all inflict an additional 20% damage."}, {"name": "Them's Good Eatin'", "req": "Level 8, Survival 75", "ranks": 1, "desc": "You've gained a chance to find a Thin Red Paste or Blood Sausage when looting any animal."}, {"name": "Thief", "req": "Level 2, AGL 6, Sneak 25", "ranks": 3, "desc": "With each rank of the Thief perk, you gain +5 Sneak and +5% pickpocket chance."}, {"name": "Thirsty", "req": "Level 2", "ranks": 1, "desc": "Something about the dehydration headaches makes you much more Charismatic. When you suffer any degree of dehydration, you gain +2 Charisma and a -10% reduction in buying prices."}, {"name": "This Is A Knife", "req": "Level 12, That's Not a Knife, STR 6, AGL 7, Melee Weap. 60", "ranks": 2, "desc": "Your enemy's crit chance is reduced by 20% and you gain +5 DT when you guard with a combat knife, bowie knife, or machete. The DT bonus doubles if your target is also wielding any handheld, bladed weapon. The second rank grants +10% attack speed and +15% damage with combat knives, bowies knives, and machetes."}, {"name": "Thought You Died", "req": "Level 50, NOT Just Lucky I'm Alive, NOT Ain't Like That Now, Good Karma", "ranks": 1, "desc": "Your storied past has fallen from memory 'cause everyone thought you died. Your Karma is reset, you inflict +15% damage against Evil or Very Evil characters, as well as being 25% less susceptible to their critical hits, and you gain +50 Health."}, {"name": "Threat Range", "req": "Level 8, STR 7, Melee Weap. 40", "ranks": 1, "desc": "When using a heavy melee weapon, you gain 10% attack speed and damage, and your DR is increased by 15% while you are attacking."}, {"name": "Toughness", "req": "Level 8, END 5", "ranks": 1, "desc": "With the Toughness perk, you gain +1 DT per point in Endurance."}, {"name": "Tribal Ways", "req": "Level 4, END 6, Survival 50", "ranks": 1, "desc": "Your limbs take 50% less damage from Animals, Mutated Animals, and Mutated Insects, and you gain +20 damage and attack speed with tribal weapons, as well as +8 DT, +25% DR, and +10% run speed while wearing a tribal outfit."}, {"name": "True Party Member", "req": "Level 10, AGL 4, Guns 35", "ranks": 1, "desc": "The proletariat majority may have passed, but your belief in the ideal stays true. You gain +30% attack speed, +25% crit. damage, and -30% spread with communist weapons, but your crit. chance is reduced by 20% when you are alone."}, {"name": "Truly Happy Medium", "req": "Level 10, END 7", "ranks": 1, "desc": "Not too heavy, not too light, you find that medium armors fit you just right! While wearing medium armor, your Health and AP are increased by 40, your enemies have -25% crit. chance, and your AP cost with ranged weapons is reduced by 20%."}, {"name": "Tunnel Runner", "req": "Level 8, AGL 8", "ranks": 1, "desc": "It's invaluable to keep your head down. Your movement speed is increased by 25% while sneaking in light armor with your weapon holstered."}, {"name": "Unstoppable Force", "req": "Level 12, STR 7, Melee Weap. 60 or Unarmed 60", "ranks": 1, "desc": "Your martial might is truly legendary. You do 4x damage through enemy blocks with all Melee Weapons and Unarmed attacks while moving forward."}, {"name": "Valkyrie", "req": "Level 8, AGL 7, Melee Weap. 50 or Unarmed 50", "ranks": 1, "desc": "You move so fast it's like you're sweating gasoline! In combat you gain +10% run speed, and gain +25% melee/unarmed attack speed whille on fire."}, {"name": "View To A Kill", "req": "Level 2, PER 6", "ranks": 1, "desc": "You're an avid learner of the battlefield. When you witness something get killed by a source other than yourself, you will gain XP equal to its level multiplied by your Perception. This amount doubles if your weapon is holstered."}, {"name": "Vigilant Recycler", "req": "Level 12, Science 70, Ener. Weap. 50", "ranks": 1, "desc": "Waste not, want not. When you use Energy Weapons, you are more likely to recover drained ammunition. You also have more efficient recycling recipes available at the Workbench."}, {"name": "Violent Vendetta", "req": "Level 8, PER 6", "ranks": 1, "desc": "You are the true apex of evolution. Those disgusting blue and green Super Mutants are nothing but an abomination. You've gained a 25% accuracy bonus when attacking Super Mutants in Bullet Time, as well as +25% damage against them."}, {"name": "Voyeur", "req": "Level 10, PER 7, Sneak 50", "ranks": 1, "desc": "If your targets could see your face in the moments before their grisly fate, they would die of fright before you even made a move. While within 30 yards of a target, for each second you look directly at a person who is unaware of you, your crit. damage will increase by 1%, up to a maximum of 25%. (Ranged weapons only gain half of this bonus.)"}, {"name": "Walker Instinct", "req": "Level 2, Survial 35, PER 3", "ranks": 1, "desc": "Your senses have become so keen that you can feel the slightest vibration in the ground. You gain +1 Perception and Agility attributes while outside and crouched."}, {"name": "Wasteland Masquerade", "req": "Level 2, PER 4, CHR 6, Speech 35", "ranks": 1, "desc": "\"The irony of life is that those who wear masks often show more truth than those without them.\" You gain +1 Charisma and Intelligence and gain +15% XP outside of combat while wearing headwear. (Exclusive from Headless Courier)"}, {"name": "Weapon Handling", "req": "Level 12, END 5, Survival 25", "ranks": 1, "desc": "You've become more accustomed to handling heavy weaponry. The Weapon Handling perk reduces weapon Strength requirements by 1, or by 2 if your weapon skill at least twice your weapon's requirement or greater than 95."}, {"name": "Western Standoff", "req": "Level 6, AGL 5, Guns 35 or Ener. Weap. 35 or Big Guns 35", "ranks": 1, "desc": "There's one way to guarantee that you have the upper hand in a fight; make sure you're the only one holding a weapon. You gain a +25% chance to hit an enemy's weapon in Bullet Time, which doubles if your target isn't in combat."}, {"name": "Winning Streak", "req": "Level 30, LCK 10", "ranks": 1, "desc": "Once your ticket comes up, you'll be on your way to the high-roller life. After you've scored a critical hit, your crit. chance is doubled."}, {"name": "Wolf In Sheep's Clothing", "req": "Level 10, Speech 40", "ranks": 1, "desc": "You're a master of disguise; while you wear the faction armor of a faction that you have negative repuation with, you will gain +2 Charisma, +10 Sneak, and +5 Critical Chance."}, {"name": "World In My Eyes", "req": "Level 8, PER 4, Guns 45 or Ener. Weap. 45 or Big Guns 45", "ranks": 1, "desc": "When you're sighting with a weapon, the only thing that matters is the world in front of you. You gain +3 Perception while aiming."}];

const TRAITS_DATA = [{"name": "Ambitious", "req": "", "desc": "You just can't wait to be at the top of the wasteland food chain. You suffer a reduction to skill points, which decreases as your level increases. On the upside, you know exactly how you'll get to that"}, {"name": "Animal Friend", "req": "CHR 6, CHR 8 OR INT 9", "desc": "With the Animal Friend trait, animals come to your aid in combat, but never against another animal, and your weapon damage is reduced by 50% against animals, mutated animals, and mutated insects."}, {"name": "Architect", "req": "", "desc": "Look at all those glorious buildings, left to ruin and decay, buried in the dessicated husk of humanity. -Your XP gain is halved while outdoors. +You gain +1 skill point upon level up while indoors equal to half of your Intelligence, rounded down."}, {"name": "Ascetic", "req": "PER 6", "desc": "Through meditation, you've touched the fibers which connect all life, and you've sworn not to sever them; preservatin of the beauty of life is the higheset moral imperative. You gain +2 Endurance, and +2 Strength while in combat, but your carry weight is reduced by 50 at all times, and you may only fight using non-lethal unarmed techniques. (Requires tag skill: Unarmed)"}, {"name": "Assassin's Step", "req": "CHR < 5, AGL 7", "desc": "Stealth and discretion come secod nature to you, but due to your... suspicious demeanor, people really lock onto you as soon as you've been spotted. You gain +10 Sneak, +8% run speed, and 12.5% improved AP cost and regen while sneaking and undetected, but you suffer an inverse penalty to those stats while detected. (Requires tag skill: Sneak)"}, {"name": "Bad Influence", "req": "CHR < 5, INT < 7", "desc": "You really bring out people's vulnerabilities when you're intoxicated. When you're drunk and rolling with at least one companion, your chems and meds last 20% longer, but you deal double damage to any teammates that wander into your line of fire (Requires Evil Karma)."}, {"name": "Bankrupt", "req": "LCK < 4", "desc": "People go easy on you when you're broke. Maybe it's manipulation, or maybe they just feel bad for you. Your buying prices are reduced substantially while you have low amounts of money, but once your bag of caps begins to reill, they start to expect you to pay more and more, in return for their previous generosity."}, {"name": "Blind Luck", "req": "PER < 4, LCK 7", "desc": "You can't see further than a few inches beyond your face, but that won't stop you from slinging lead! Your Perception is increased by 4 whenever you're in combat."}, {"name": "Bloody Mess", "req": "", "desc": "With the Bloody Mess trait, characters and creatures you kill will often explode into a red, gut-ridden eyeball-strewn paste. Fun! Oh, and you gain +2% weapon damage per type of mutilated body part that you carry (Head, Arm, Leg, Torso). However, your chance to set off mines, and enemy crit chance have been increased by 8%"}, {"name": "Breakin' A Sweat", "req": "END 4", "desc": "Gotta keep that heart rate up! You gain +1 AGI and +15% AP regen. while moving, but suffer -1 and -15% while not moving."}, {"name": "Built to Destroy", "req": "AGL 4", "desc": "The Flamer that burns twice as bright burns half as long. Your throwing velocity, crit. chance, and attack speed are improved by 10%, but your spread is increased by 10%, and your weapon condition decays 20% faster."}, {"name": "Callous", "req": "CHR < 5", "desc": "You don't care what the person you're bartering with thinks of you, you just gotta get them to agree to the lowest price possible. Your Charisma is reduced by 1, but your purchase prices are multiplied by 0.98x for every 10 points of health."}, {"name": "Cannibal", "req": "END 7", "desc": "With the Cannibal trait, when you're in Sneak mode, you gain the option to eat a corpse to regain Health equal to your Survival skill when your Hunger meets or exceeds your Survival skill. But every time you feed, you lose Karma, and if the act is witnessed, it is considered a crime against nature."}, {"name": "Careful Handling", "req": "INT 4, PER 4", "desc": "Your weapons deserve respect, and you know it. Your weapon AP cost, equip, reload, and attack speed are penalized by 5%, but your spread and crit. chance are improved by 5%, and your weapon condition decays 15% slower."}, {"name": "Carpet Bomber", "req": "AGL 6", "desc": "Carpet Bomber incerases Big Guns' explosion radius, attack speed, and spread by 25%. (Requires tag skill: Big Guns or Explosives)"}, {"name": "Chem Resistant", "req": "END 7", "desc": "With the Chem Resistant trait, your addication chance is reduced by 25%, but so is your chem duration."}, {"name": "Child At Heart", "req": "CHR 5", "desc": "The Child at Heart trait greatly improves your interactions with children, usually in the form of unique dialogue choices, at the cost of -5 Speech when not speaking with a child."}, {"name": "Claustrophobia", "req": "", "desc": "You have a fear of enclosed spaces. You gain +1 to S.P.E.C.I.A.L. attributes when outside, but suffer -1 when indoors."}, {"name": "Confirmed Bachelor", "req": "CHR 6", "desc": "You gain +5 Speech and Barter and +1 Charisma when talking to men, but suffer -5 Speech and Barter when talking to women."}, {"name": "Contact Courier", "req": "STR 8, END 7, INT < 8", "desc": "You only know one way to solve your problems - with your fists. +50% damage with Unarmed weapons. -50% damage with Melee weapons. +50% spread when using ranged weapons."}, {"name": "Crouching Turtle", "req": "END 6, AGL < 5", "desc": "You may not sneak anywhere quickly, but you'll definitely get there safe. When crouched, you gain +3 DR per point of Endurance above 5, up to a maximum of +15. However, your sneaking move speed is reduced by 20%"}, {"name": "Decentralized Circulation", "req": "END 3", "desc": "Radiation has begun to provide you with some vaguely... arthropoid mutations. +Your circulation has become decetralized. You take 80% less limb damage. -When your peripheral limbs are crippled, your bleeding is catastrophic. You suffer -1 HP per second for each non-chest limb that is crippled."}, {"name": "Delicate", "req": "END < 3", "desc": "You've never been much good in a fight, you always seem to hit the mat before your opponent does. You've lost 50% of your base health, but you've learned about the more subtle ways of life. (You will be able to select another perk immediately.)"}, {"name": "Desert Rose", "req": "END < 5, CHR 6", "desc": "You're a beautiful soul, in a desolate place. -Your Endurance is reduced by 1. -Enemy crit. chance is doubled while your health is below 50%. +Your Charisma is increased by 2 while your health is above 50%."}, {"name": "Doom Spiral", "req": "PER < 7", "desc": "Oh no! This is the start of it all! As your health decreases, any hit, no matter how severe, has an inceasing chance to instantly kill you. (-1% health = +1% chance) However, your all-or-nothing attitude grants you a particular clarity about overcoming adversity. (You will gain another perk immediately.)"}, {"name": "Dustbowl", "req": "END 4", "desc": "It's a desolate wasteland out there, but you know how to subsist on just the bare necessities. Your Dehydration advances twice as quickly, but your Hunger advances only one-thrid as quickly."}, {"name": "Early Bird", "req": "", "desc": "You gain +1 to each of your S.P.E.C.I.A.L. attributes from 5 a.m. to 12 p.m., but suffer -1 from 6 p.m. to 5 a.m. when you're not at your best."}, {"name": "Educated", "req": "", "desc": "With the Educated trait, your book-smarts grant you a random free skill point every level, but your Survival skill is reduced by 30, since you're not street-smart."}, {"name": "Empath", "req": "PER 3, CHR 4", "desc": "Your tender heart and care for others makes it difficult for you to hurt other living things. When attacking a living being, you deal 10% less damage to with ranged weapons, 20% less with Melee or Unarmed weapons, and an additional 20% less when your target is lower than 50% health. However, your compassion guides you to other ways to solve your problems. (You will gain another perk immediately.)"}, {"name": "Fast Shot", "req": "AGL 6", "desc": "While using Guns, Energy Weapons, or Big Guns, you fire 20% more quickly, but your spread is increased by 20%."}, {"name": "Fickle", "req": "LCK 1", "desc": "Fortune favors the bold; you favor timidity. You suffer -1 Luck and -50% crit. chance after any non-critical hit until your next critical hit, but your lack of candor has allowed you to cultivate a characteristic that suits you better. (You will be able to select another perk immediately)"}, {"name": "Four Eyes", "req": "PER < 10", "desc": "While wearing any type of glasses, you gain +1 PER. Without glasses, you suffer -1 PER."}, {"name": "Good Natured", "req": "", "desc": "You're Good Natured at heart, more prone to solving problems with your mind than violence. Your karma is immediately increased to Good if it is below that threshold, and you gain +1 to Charisma and +5 to Barter and Speech, but have -5 to Energy Weapons, Explosives, Guns, Melee Weapons, and Unarmed."}, {"name": "Graceful", "req": "AGL 7", "desc": "Your poise is perfect; your delicacy is divine; unless you start tripping over your own feet. You gain +1 Charisma while you are not under the effect of alcohol or any addiction, but you suffer -2 when you are drunk or addicted."}, {"name": "Growth Serum", "req": "INT 8", "desc": "You've conconted a bizarre serum, which will increase your carry weight as you gain experience! However, it does severely tax your body. -Your carry weight is reduced by 66% immediately. +Your carry weight is multiplied by 1.045x each time your level increaes, until you hit level 30."}, {"name": "Gunpowder Season", "req": "", "desc": "Salvation comes from the end of a smoking barrel. -50% reduced spread when using ballistic weapons. +4x chance to gain cases/hulls when firing ballistic weapons. +50% spread when using non-ballistic weapons. -50% attack speed when using Melee or Unarmed weapons."}, {"name": "Heavy Handed", "req": "AGL < 5", "desc": "Your melee and unarmed attacks do 20% more damage, but you attack 35% slower with them."}, {"name": "Hemophiliac", "req": "END < 4", "desc": "You have a condition taht prohibits proper blood clotting; you have a chance to suffer damage anytime your health is below 90%. However, this difficulty has shown you one of your other latent talents. (You will be able to select another perk immediately.)"}, {"name": "Hip Shooter", "req": "AGL 6, PER < 5 OR Fast Shot", "desc": "Like a true gunslinger, you can fre your weapon from any angle; only you can't seem to aim down the sights worth a damn. -25% accuracy while aiming down the sights. +25% accuracy while firing from the hip."}, {"name": "Hoarder", "req": "", "desc": "You gain +20% carry weight, but suffer -1 to all SPECIAL stats when carrying less than 160 lbs."}, {"name": "Hot Blooded", "req": "AGL 4", "desc": "When your health drops below 50%, your attack speedis increased by 25%, but your weapon condition damage is doubled."}, {"name": "I Don't Believe In Luck", "req": "LCK 1, NOT Miss Impossible, NOT Mister Impossible", "desc": "You've always been beset by \"misfortune\"; good thing you don't believe in Luck. Your crit. damage has been reduced to 0, and your enemies' crit. chance has been reduced to 0."}, {"name": "Icarus", "req": "", "desc": "Your ostentatious nature may help you learn quicker, but it also inspires a greater degree of violence from your foes. +50% XP gain until level 30. -Enemy crit chance is doubled. +25% stacking limb damage received at levels 10, 20, and 30."}, {"name": "Ideologue", "req": "NOT Twisted", "desc": "It's not about the methods, it's about the ideals. Your addiction chance is doubled, and you always lose health equalto any karma loss, but you gain 4% more experience, +1 skill point from skill books and per level, 6% lower buying prices, and +1Luck while your Karma is Good or Very Good. However, while your Karma is Evil or Very Evil, you suffer a harsher penalty to the same factors."}, {"name": "Impartial Mediation", "req": "CHR 5", "desc": "With the Impartial Medication trait, you gain +10 points to Speech while you maintain a neutral karma level, but you suffer -1 Charisma and -5 Speech while Good, Very Good, Evil, or Very Evil."}, {"name": "Insolent", "req": "CHR < 3", "desc": "You're just absolutely intolerable. At every opportunity, you insult and demean people. Your permanent Speech and Barter skills will never increase past 15, but your selfish attitude has shown you a new way to approach life in the wasteland. (You will be able to select another perk immediately.)"}, {"name": "Kamikaze", "req": "INT < 5", "desc": "You gain +25% run speed while in combat and below 50% health, but you also have -5 DT while those conditions are met."}, {"name": "Lady Killer", "req": "CHR 6", "desc": "You gain +5 Speech and Barter and +1 Charisma when talking to women, but suffer -5 Speech and Barter when talking to men."}, {"name": "Law-Jaw", "req": "INT < 5, Guns 45", "desc": "Every time you say \"I am the Law\" - and you say it *a lot*, it's basically *hello* for you - your jaw does this *weird thing* It sort of shifts sideways, hanging off your face at a jaunty angle, while the word *law* sounds oddly guttural and low. It's... strange. Maybe it's a side effect of getting shot in the head by ol' Benny, but it sure helps with intimidation. -15 Speech.+5% Improved prices while at Good Karma. +10% improved prices while at Very Good Karma."}, {"name": "Lazy", "req": "STR < 3", "desc": "You just don't wanna move your muscles. Just make everyone else pick up the slack, they do it anyway! You have -10% carry weight and your run speed is reduced in proportion to your encumbrance (max -35%), but your free time and unspent calories have allowed you to excel somewhere more suited to you. (You will be able to select another perk immediately.)"}, {"name": "Legally Blind", "req": "PER < 3", "desc": "If a driving test were part of the GOAT, they'd have kicked you out of the vault! Selecting Legally Blind will ensure that your Perception never increases past 2, but your other finely honed senses have allowed you to excel in another area (You will be able to select another perk immediately.)"}, {"name": "Logan's Loophole", "req": "", "desc": "No one's going to put you out to pasture 'cause you're going to stay young (and level 30) forever! You'll never again become addicated to chems, and they'll last twice as long... but after 30 you can kiss experience, perks, and skill points goodbye!"}, {"name": "Loose Cannon", "req": "AGL 6 or STR 5", "desc": "From Frag Grenades to Throwing Spears, you can throw weapons 30% faster at the cost of 25% less velocity."}, {"name": "Lubberly", "req": "AGL < 3", "desc": "It's shocking that you don't break all the bottles you pick up; you seem to break everything else. Sneaking is very ineffective for you, but you've learned other ways to handle your problems than subtlety. (You will be able to select another perk immediately.)"}, {"name": "Lucky Accident", "req": "LCK 6", "desc": "You've always been lucky, so you never learned to aim properly; your crit. chance is increased by 25%, but your crit. damage is reduced by 50%."}, {"name": "Magnate", "req": "LCK 6", "desc": "You know how to make your money worth it's weight. For each 1000 caps you hold above 3000, you have increasingly reduced purchase prices, up to a maximum of -17%. However, while you have less than 3000 caps, your buying prices are increased."}, {"name": "Masochist", "req": "STR 6, END 7", "desc": "When you're feeling healthy, all you can think about is when you'll get to bleed again. -You lose 2/4/6 DT and 1/2/3 INT at 25/50/75% health, and -25% AP regen speed while lower than 50% health. +You gain 3/6/9% DR and 1/2/3 END at 75/50/25% health."}, {"name": "Miss Fortune", "req": "LCK 6", "desc": "Just when your enemies think they have the upper hand, Miss Fortune appears to turn their world upside down. Appearing only in Bullet Time, she has the ability to grant defeat in the face of victory - at the cost of 15% crit chance."}, {"name": "Mister Impossible", "req": "", "desc": "You're the luckiest guy in the world, though that doesn't seem to matter much. All of your hits are criticals, but you do no critical damage at all."}, {"name": "Mysterious Stranger", "req": "LCK 6", "desc": "You've gained your own personal guardian angel... armed with a fully loaded .44 Magnum. For a cost of -1 Luck, the Mysterious Stranger will appear oocassionally during Bullet Time to lend a hand, with deadly efficiency."}, {"name": "Narcoleptic", "req": "", "desc": "You have trouble staying awake for even moderate periods of time. You will randomly pass out for a moment or two. Hope it's not at a bad time! Fortunately, your unique trait has helped you understand more about yourself. (You will be able to select another perk immediately.)"}, {"name": "Night Person", "req": "PER 4, NOT Solar Powered", "desc": "When the sun is down, you gain +1 to Intelligence and Perception, but you suffer an equal reduction to those stats during the day."}, {"name": "Patriot", "req": "INT < 5", "desc": "Echoing through the desolate wastelands, the voice of true authority still speaks. - 25% reduced damage against the Enclave. +1/2 Charisma bonus while Intelligence is below 5/3."}, {"name": "Phillistine", "req": "PER < 6, INT < 5", "desc": "You figured out your best tool for interacting with the world early, (you will be able to pick another perk immediately), but not learning new things makes you uncomfortable, and you find yourself always relying on familiar ideas. - 10 Energy Weapons and Science. -x2 Energy Weapon AP cost. -10 Medicine. -20% reduced XP."}, {"name": "Physical Instrument", "req": "END 9", "desc": "You solve your problems with the most reliable tool; you own flesh. Things will be easier to straighten out once everyone else is unconcious or dead. You gain an unarmed damage bonus equal to your current AP %, but every unarmed attack strike you land will drain your AP by an amount equal to the hit's damage. (Requires tag skill: Unarmed)"}, {"name": "Polar Personality", "req": "", "desc": "You seem to bounce between acting aggressive and kind. +At odd numbered levels, you gain +4 to Melee Weapons, Unarmed, Guns, Explosives, and Energy Weapons, but your social stats are reduced by -3. +At even numbered levels, you gain +4 to Speech, Barter, and Medicine, but your combat stats are reduced by 2."}, {"name": "Right Handed", "req": "", "desc": "Your right hand could shoot the wings off a fly, but your left hand ruins your stabliity. When using one-handed weapons, you gain +20% accuracy, but you suffer -40% accuracy when using  two-handed weapons"}, {"name": "Rip N' Tear", "req": "NOT Good Natured", "desc": "Until it is done, Violence is the only way.You've gained +2 Strength and +5 Unarmed, but -2 to Charisma and -5 to Speech, Barter, Science, and Sneak."}, {"name": "Root Of All Evil", "req": "", "desc": "\"Money has never made man happy, nor will it, for there is nothing in its nature has shown you more judicious practices for survival in the wasteland that don't involve money. (You will gain another perk immediately.) (Requires Good Karma)"}, {"name": "Rules of Nature", "req": "Level 14", "desc": "You're fiercer when you're on the brink of death; but so is everyone else. When your health is below 25%, you gain +8% crit chance, which increases to +13% when using a melee or unarmed weapon, but your enemies also gain the same bonus while they're below 25% health."}, {"name": "Sarcopenic", "req": "STR < 5", "desc": "Your muscular inadequacy results in weapons with a base or modified weight of 10 lbs. or more weighing you down 2.5x as much, but don't despair - you excel in other ways! (You will be able to take another perk immediately.)"}, {"name": "Scientific Method", "req": "PER 3, INT 7", "desc": "Your dedication to science and technology is admirable, if bordering on obsessive. Standing in front of monitors and taking samples from irradiated puddles has started to take its toll, but it's all in the name of progress. You've gained +2 INT and +20 Science, but you've lost -2 PER and -10 Radiation Resistance, and you've become obsessed with using nothing but the most advanced of weapons. (Requires tag skill: Science and Energy Weapons)"}, {"name": "Sex Appeal", "req": "CHR 3", "desc": "You've always been able to rely on your looks to get your way, not your words. You have +2 Charisma, but -10 Barter and Speech."}, {"name": "Shhh!", "req": "CHR < 5, AGL 4", "desc": "You're more the sneakin' type, than the speakin' type. You suffer -7 to Speech and Barter, but gain +10 Sneak."}, {"name": "Silver Tongue, Lead Pocket", "req": "CHR 6", "desc": "You're excellent at convincing others to do you favors, but your words weigh little when compared to material assets. You've gained +20 Barter, but your purchase prices are also increased by 15%."}, {"name": "Sluggish", "req": "AGL < 5", "desc": "You're moving as fast as you can, but everyone else just seems to be able to do more than you. You suffer -20% AP regen and equip speed, but your sloth-like persistence has shown you a new strength within yourself. (You will be able to select a new perk immediately.)"}, {"name": "Small Frame", "req": "", "desc": "Due to your small size, you have +15 Sneak and enemy crit chance is reduced by 15%, but you also suffer -1 Endurance and Strength."}, {"name": "Solar Powered", "req": "NOT Night Person", "desc": "With the Solar Powered trait, you gain an additional point in Strength, Agility, and Endurance while in Sunlight, but you suffer -1 to these stats while indoors or during the night."}, {"name": "Soviet Roulette", "req": "LCK 1", "desc": "Every shot you fire is a roll of the dice - or rather, a spin of the chamber. Once per reload, your weapon will immediately jam when you land a critical hit, but the pure adrenaline rush of taking that chance overloads your dopamine receptors and triggers your unique survival instinct. (You will gain another perk immediately.)"}, {"name": "Steel Skeleton", "req": "STR 4", "desc": "With the Steel Skeleton trait, your limbs only receive 75% of the damage they normally would, but your carry weight is reduced by 20%."}, {"name": "Talented", "req": "", "desc": "You're talented, but a slow learner, You gain +5 points to every skill, but you suffer -1 grained skill points per level."}, {"name": "Terrifying Presence", "req": "CHR < 5", "desc": "In some conversations, you gain the ability to initiate combat while terrifying your opponents, sending them fleeing away for safety and enemy crit. chance is also reduced by 5% for each point that your Charisma is below 5, but you suffer -1 Charisma and -5 Speech."}, {"name": "Theories and Hypothesis", "req": "INT 7", "desc": "You're more comfortable in front of a chalkboard than a set of keys.  You gain +15 Science when hacking. (Exclusive from Typing Tutor)"}, {"name": "Titanium Tortoise", "req": "NOT Power Armor Training, END < 6", "desc": "Just look at those glorious, gleaming metal shells covering those dashing Power Armored soldiers! Just thinking about being enclosed in that tight titanium, close around your whole body makes you feel vulnerable while wearing anything else. You've become obsessed with finding and wearing Power Armor, and wearing it grants you +20% movement speed while in deep water and +15 Energy, EMP and Electric Resistance while crouched. However, while wearing Power Armor, you suffer -20% sneak speed when you have a weapon out, and while you aren't encased in tough titanium, your DT is halved and your carry weight is reduced by 20%"}, {"name": "Torque Dork", "req": "STR 8", "desc": "You just can't get enough of that leverage. +25% damage with Melee Weapons. -Your weapon condition damage is increased by 5x with all other weapon types."}, {"name": "Trader's Touch", "req": "CHR 7, INT 5, LCK 3", "desc": "Your understanding of the markets are second-to-none, and you intend to prove it to the entire Mojave, though your pack brahmin is long dead. You suffer -30 carry weight, but you gain +15 Barter after each transaction, which lasts until you barter with a merchant two times in a row. (Requires tag skill: Barter and Speech)"}, {"name": "Trigger Discipline", "req": "INT 4", "desc": "While using Guns, Energy Weapons, or Big Guns, you fire 20% more slowly, but your spread is reduced by 20%."}, {"name": "Tryptophobe", "req": "", "desc": "\"Birdshot\" is practically a profanity to you. When using shotguns, your spread is reduced by 20% and your crit. damage is increased by 10%, but your attack speed is reduced by 20% and your crit. chance is reduced by 10%."}, {"name": "Twisted", "req": "NOT Ideologue", "desc": "You're sick and twisted, seeing suffering delights you. Your addiction duration is doubled, and while Evil or Very Evil, you gain +5/10% XP and AP regeneration, +6/15% positive chem duration, +5/10% healing, and +1 Luck, though you suffer an extra harsh pentalty to those stats while Good or Very Good."}, {"name": "Typing Tutor", "req": "INT < 8, AGL 5", "desc": "You're not concerned with formulas and numbers and the scientific method. You just gotta get your fingers tapping on a keyboard, and you feel right at home. You gain +15 Science while hacking, but suffer -10 at all other times. (Exclusive from Theroies and Hypoteses)"}, {"name": "Vain", "req": "", "desc": "You're obsessed with perfection of your appearance. You gain +1 Charisma and Luck while your health is above 90%, but suffer -2 while your health is below 90%."}, {"name": "War Child", "req": "", "desc": "If your adrenaline isn't pumping, you're not performing your best. You gain +1 to all SPECIAL stats while in combat, but suffer -1 while outside combat."}, {"name": "Weak Knees", "req": "END < 2, AGL < 5", "desc": "All that crouch-walking is murder on your joints. You suffer -10% sneak speed, and take leg damage anytime you move while sneaking. Fortunately, you've learned from your disadvantage. (You will be able to select another perk immediately.)"}, {"name": "Who Killed The World?", "req": "", "desc": "It wasn't the animals; it wasn't the robots; You know who killed the world. +10% damage against humans -15% damage to non-humans"}, {"name": "Wild Wasteland", "req": "", "desc": "Wild Wasteland unleashes the most bizarre and silly elements of post-apocalyptic America. Not for the faint of heart or the serious of temperament."}];

/* ===== TRAIT STAT / SKILL BONUS DEFINITIONS =====
   Permanent, unconditional changes only.
   Conditional bonuses stored in TRAIT_CONDITIONAL for tooltip display. */
const TRAIT_BONUSES = {
    "Small Frame":               { special:{STR:-1,END:-1}, skills:{"SNEAK":+15} },
    "Rip N' Tear":               { special:{STR:+2,CHA:-2}, skills:{"UNARMED":+5,"SPEECH":-5,"BARTER":-5,"SCIENCE":-5,"SNEAK":-5} },
    "Sex Appeal":                { special:{CHA:+2}, skills:{"BARTER":-10,"SPEECH":-10} },
    "Scientific Method":         { special:{INT:+2,PER:-2}, skills:{"SCIENCE":+20} },
    "Desert Rose":               { special:{END:-1} },
    "Terrifying Presence":       { special:{CHA:-1}, skills:{"SPEECH":-5} },
    "Good Natured":              { special:{CHA:+1}, skills:{"BARTER":+5,"SPEECH":+5,"ENERGY WEAPONS":-5,"EXPLOSIVES":-5,"GUNS":-5,"MELEE WEAPONS":-5,"UNARMED":-5} },
    "Callous":                   { special:{CHA:-1} },
    "Fickle":                    { special:{LCK:-1} },
    "Miss Fortune":              { special:{LCK:-1} },
    "Mysterious Stranger":       { special:{LCK:-1} },
    "Talented":                  { skills:{__ALL__:+5} },
    "Educated":                  { skills:{"SURVIVAL":-30} },
    "Law-Jaw":                   { skills:{"SPEECH":-15} },
    "Shhh!":                     { skills:{"SPEECH":-7,"BARTER":-7,"SNEAK":+10} },
    "Sex Appeal":                { special:{CHA:+2}, skills:{"BARTER":-10,"SPEECH":-10} },
    "Silver Tongue, Lead Pocket":{ skills:{"BARTER":+20} },
    "Phillistine":               { skills:{"ENERGY WEAPONS":-10,"SCIENCE":-10,"MEDICINE":-10} },
};

// Traits with conditional SPECIAL or skill effects — shown with ⚡ indicator
const TRAIT_CONDITIONAL_NAMES = new Set([
    "Claustrophobia","Early Bird","Night Person","Solar Powered","War Child",
    "Four Eyes","Hoarder","Blind Luck","Impartial Mediation","Confirmed Bachelor",
    "Lady Killer","Graceful","Ideologue","Twisted","Assassin's Step",
    "Breakin' A Sweat","Masochist","Desert Rose","Polar Personality",
    "Bankrupt","Magnate","Callous"
]);

function getActiveTraitBonuses() {
    const specialDelta = {STR:0,PER:0,END:0,CHA:0,INT:0,AGI:0,LCK:0};
    const skillDelta = {};
    const activeNames = getChosenTraitNames();
    for (const name of activeNames) {
        const bonus = TRAIT_BONUSES[name];
        if (!bonus) continue;
        if (bonus.special) {
            for (const [k,v] of Object.entries(bonus.special)) {
                if (specialDelta[k] !== undefined) specialDelta[k] += v;
            }
        }
        if (bonus.skills) {
            if (bonus.skills.__ALL__ !== undefined) {
                for (const s of skills) skillDelta[s] = (skillDelta[s]||0) + bonus.skills.__ALL__;
            } else {
                for (const [k,v] of Object.entries(bonus.skills)) {
                    skillDelta[k] = (skillDelta[k]||0) + v;
                }
            }
        }
    }
    // Flag which active traits are conditional
    const hasConditional = activeNames.some(n => TRAIT_CONDITIONAL_NAMES.has(n));
    return { specialDelta, skillDelta, hasConditional };
}

const REWARD_PERKS_DATA = [{"name": "(Autumn Leaves) Benevolent", "how": "", "desc": "Therapy Result! You seldomly cling to negative thoughts, these just hold you down. Somehow, your optimism made you more resistant to limb damage (-15%)."}, {"name": "(Autumn Leaves) Boiling Shot", "how": "", "desc": "You discovered a way to boil your enemies into their armor. You inflict 30 % more damage with energy weapons if your opponent's DT exceeds 10."}, {"name": "(Autumn Leaves) Bomb Jack", "how": "", "desc": "Every time you use an explosive weapon, it has 10% chance of knocking your opponent down."}, {"name": "(Autumn Leaves) Cats Paw", "how": "", "desc": "Cats Eyes were intended to be much deadlier. There's a trick when ingesting them that gives you better hand-eye coordination, as well as 4 % more critical chance."}, {"name": "(Autumn Leaves) Club Diplomacy", "how": "", "desc": "You got a way with silencing vocal people. You inflict 25% more damage with blunt weapon to people with 5 Intelligence or more."}, {"name": "(Autumn Leaves) Crusader", "how": "", "desc": "Therapy Result! You'll have none of that moral grey area B.S. You inflict 10 % more damage to evil people and creatures."}, {"name": "(Autumn Leaves) Every Little Counts", "how": "", "desc": "One Handed Guns now inflicts 2 more damage. Every little counts, right?"}, {"name": "(Autumn Leaves) Featherweight", "how": "", "desc": "You don't feel the need to gorge yourself with food anymore. You're faster (+10% Running Speed/ Attacks cost 15% less AP) when you're struck with minor starvation."}, {"name": "(Autumn Leaves) Focused", "how": "", "desc": "Even under duress, you don't let your fear take the best of you. Your concentration is faultless : you switch weapons 10 % faster, reload 10 % faster and have 10 % less weapon spread."}, {"name": "(Autumn Leaves) Integrity", "how": "", "desc": "Therapy Result! There is something as self-respect, and you know that pretty well. Your sense of self-preservation grants you a natural +3 DT."}, {"name": "(Autumn Leaves) Kinetic Shot", "how": "", "desc": "You've tinkered enough with Plasma Weapons to be able to make them explode on impact 5% of the time, sending your opponent prone in the process."}, {"name": "(Autumn Leaves) Medical History", "how": "", "desc": "Your expertly-trained eyes detect all of your victims medical history. Including those painful decades-old badly-healed fractures. (+10 % Damage to limbs while in Bullet Time)"}, {"name": "(Autumn Leaves) Mercy Killing", "how": "", "desc": "\"One handed-guns in Bullet Time only : by some kind of karmic backfire, you now inflict three times more damage to the head of badly wounded foes. (With less than 25% health left.)"}, {"name": "(Autumn Leaves) No Deserters", "how": "", "desc": "No one gets away! You inflict three times more damage with throwing weapons to fleeing enemies."}, {"name": "(Autumn Leaves) No Rhyme Or Reason", "how": "", "desc": "Therapy Result! You don't give much credit to that Causality B.S. : things happen or they don't. You mainly rely on Luck, and it shows. You gain 2% more chance to do critical hits."}, {"name": "(Autumn Leaves) Patient", "how": "", "desc": "You are capable of great patience and insight. You pick up details and life lessons that other normally would not, which translates into a gain of 3 % more experience points."}, {"name": "(Autumn Leaves) Pawn To Queen", "how": "", "desc": "Therapy Result! You value knowledge and you are always actively seeking new ways to improve yourself, you gain one additional skill point per level."}, {"name": "(Autumn Leaves) Pegleg Industry", "how": "", "desc": "You like to teach people not to run onto your lawn. You inflict 15 % more leg damage to your targets in Bullet Time."}, {"name": "(Autumn Leaves) Psycho Warfare", "how": "", "desc": "You get so creative with your battle cries, insults and imprecations that they deeply disturbs your opponents and impact their general fighting efficiency : they inflict 5 % less damage."}, {"name": "(Autumn Leaves) Resentful", "how": "", "desc": "Therapy Result! Blood loss makes you quite grumpy. When your health goes below 50% you inflict 10% more damage."}, {"name": "(Autumn Leaves) Second Skin", "how": "", "desc": "A little guilty pleasure of yours is collecting small armor pieces of your fallen enemies and patch it to yours. After a while, it amounts to + 5 DT if you're wearing medium or heavy armor."}, {"name": "(Autumn Leaves) Slaughter", "how": "", "desc": "When they're half-bled out, people tends to get sloppy with their defense. Your bladed weapons inflict lethal damage (+300%) when your opponent's health is below 15%."}, {"name": "(Autumn Leaves) They Shoot Horses", "how": "", "desc": "With rifles only : you inflict 15% more damage to your enemies for each crippled leg they're wobbling on."}, {"name": "(Autumn Leaves) Uncompromising", "how": "", "desc": "Therapy Result! You're impervious to other people's shenanigans, Ennemies have 50 % less chance at inflicting you critical hits."}, {"name": "(Autumn Leaves) Vicious Hunger", "how": "", "desc": "You learned to capitalize on your hunger, it now makes you vicious, ruthless and - let's admit it - rather cranky. You inflict 25% more damage when you're struck with Advanced Starvation."}, {"name": "(Autumn Leaves) Weak Spot", "how": "", "desc": "When armed with any kind of good old fashioned non-automatic bladed weapon, you know where to hack to ignore 25 % of your enemy's Damage Treshold."}, {"name": "(Autumn Leaves) Weaponlexia", "how": "", "desc": "You love your weapons and your weapons love you! With this perk, they decay 20 % slower."}, {"name": "(Autumn Leaves) Whack-A-Mole", "how": "", "desc": "There's something deeply irritating about those people hiding behind walls, popping their head to fire some bullets at you. When you strike people armed with ranged weapons, you get a 20 % damage bonus to your blunt weapon attacks."}, {"name": "(Autumn Leaves) Wide Open", "how": "", "desc": "Their jaw is exposed! For each of your enemy's wounded arms, you inflict them 20% more damage with unarmed weapon."}, {"name": "Big Brained", "how": "This perk can be acquired by successfully convincing the Courier's brain to return to its body or return to the Sink and then going to the Think Tank to confront the Think Tank during Old World Blues. Afterward, if it was installed, the Sink Auto-Doc can optionally be used to restore the brain and swap out Brainless for the perk and vice versa.", "desc": "Your brain is back in your body, but some of the advanced technologies remain: Your head can be crippled again, but you are still 35% more resistant to addiction, and you gain +1 Intelligence and +10% XP."}, {"name": "Brainless", "how": "This perk is rewarded automatically along with Heartless and Spineless while talking to Klein and the Think Tank during Welcome to the Big Empty, when the conversation comes to the topic of the Courier's brain, heart, and spine being removed and replaced with Big MT technology.", "desc": "Your brain has been replaced with advanced technologies: Your head can no longer be crippled, and your addiction chance is removed, but your radiation intake while drinking is doubled, and you have -1 Perception."}, {"name": "Cardiac Arrest", "how": "This perk can be acquired by successfully convincing the Courier's brain to return to its body or return to the Sink and then going to the Think Tank to confront the Think Tank during Old World Blues. The Sink Auto-Doc can optionally be used to restore the heart and swap out Heartless for the perk, and vice versa.", "desc": "Your heart is back in your body, but some advanced technologies remain: You still suffer -15 radiation resistance, but your health and AP have increased by 25, and your damage resistance has increased by 5%."}, {"name": "Covert Ops", "how": "Collect the 10 intel suitcases during the Anchorage Reclamation simulation. Once the simulation is complete, the perk will appear on the Pip-Boy. Also a message will appear on screen when Constantine Chase acknowledges you going above and beyond the line of duty.", "desc": "You've learned the art of espionage from recovered intel, your pickpocket chance is increased by 15%"}, {"name": "Cranial Contusion", "how": "Granted for siding with Calvert.", "desc": "You've cauterized crazy Calvert! Your critical chance is increased by 5% when targeting the head in Bullet Time."}, {"name": "Day Tripper", "how": "Obtain and use 25 addictive chems.", "desc": "You've done enough chems to know how to hang on to the effects just a while longer. Each point in Endurance grants you +3% chem duration."}, {"name": "Dine and Dash", "how": "Consume the corpses of 25 human and non-feral ghoul enemies using the Cannibal perk.", "desc": "With the Dine and Dash perk, when you're in Sneak mode, you gain the option to take corpse parts for eating at a later time."}, {"name": "DNAgent", "how": "This perk is rewarded by completing the Dog Run challenge (consisting of three sub-challenges: Dog Gone, Who let the..., and Snake Skins) which is concurrent to completing X-8 Data Retrieval Test in the X-8 research center. The Snake Skins challenge will require a visit to the X-13 research facility to acquire the key to the X-8 kennels in order to unlock the option to release night stalkers into the X-8 testing area.", "desc": "Studying schematics on the abominations created at the Big MT has granted you a damage bonus (+10%) against Abominations."}, {"name": "DNAvenger", "how": "This perk is rewarded by completing ranks of the Caza-Death Dealer kill challenge. No xEdit changes made to this perk.", "desc": "Studying the abominations created at the Big MT has granted you a damage bonus (+10% per rank up to three ranks) against Cazadores."}, {"name": "Dream Crusher", "how": "Ruin Moira's dream of a Survival Guide.", "desc": "Something about your presence dampens others' desires to exceed. Your enemy's chance of getting critical hits on you is multiplied by x0.9 for each point your Charisma is below 10."}, {"name": "Fast Times", "how": "Obtain and use 20 instances of the chem Turbo.", "desc": "You've slowed things down enough to gain additional time when using Turbo."}, {"name": "Free Radical", "how": "Use RadAway to remove inflicted rads 20 times.", "desc": "You gain enhanced effects from RadAway."}, {"name": "Friendly Help", "how": "This perk is rewarded upon completing either the Miss Fortunate Son (or Daughter) challenge or the He Moves in Mysterious Ways challenge (receive 15 appearances when using Bullet Time from either Miss Fortune or the Mysterious Stranger via their respective perks).", "desc": "Your V.A.T.S. protectors will help you more often as your Luck increases."}, {"name": "Full Frontal", "how": "Per Low Level Point Lookout: \"A new autopsy opportunity has been provided, which allows Medicine 30 players to use a set of most of the surgical supplies to gain a perk granting bonus damage dealt to the head of swampfolk, and reduced limb damage when fighting them, along with some XP.\"", "desc": "You've gained +5% damage when targeting swampfolk heads in Bullet Time, and recieve -10% limb damage in combat with them!"}, {"name": "Ghoul Ecology", "how": "Gained by reading Plik's journal inside the Coastal Grotto.", "desc": "You have learned to exploit the specific weaknesses of Ghouls, and gain a +5 damage bonus when attacking one."}, {"name": "Gray Matters", "how": "Obtained by picking your brain back up after confronting Tobar.", "desc": "Protect what's important.  With the Gray Matters perk you'll receive 25% less damage when hit in the head."}, {"name": "Hack N' Slash", "how": "Obtained by completing these challenges: Up Close, Up Closer, I Can Do It One Handed, and Two Hands are Better than One", "desc": "You hack just a little faster."}, {"name": "Hematophage", "how": "Perk obtained from Vance during the Blood Ties quest.", "desc": "You've gained a taste... for human blood! When you're in Sneak mode, you gain the option to drink blood from a corpse to regain Health and restore dehydration and sleep deprivation equal to the sum of your Endurance and Agility. But every time you drink blood, you will you lose a small amount of Karma and suffer radiation damage. (Also significantly buffs the amount of HP that a blood pack heals.)"}, {"name": "Hunter's Toughness", "how": "New Vegas Bounties", "desc": "You've distinguished yourself as the premiere bounty hunter in the region, and as a result you've acquired a boost to your damage threshold."}, {"name": "Igne Natura Renovatur Integra", "how": "During The Apocalypse, after defeating the swarm of marked men in Ulysses' Temple, one must use the launch control panel to set the Divide nuclear missiles to target both NCR and Legion territory. The perk is not gained until after leaving the Temple, going through the ending, and then returning to the Mojave Wasteland near the canyon wreckage and witnessing the far-off explosions.", "desc": "200 years after the Great War, two lone nuclear missiles were launched. Not aimed at another country, but at their own land, targeting the last vestiges of civilization, a wicked punishment for their audacity to grow and thrive in this desolate wasteland. You deal +20% damage and +10% critical damage when attacking any members of the NCR or Legion while your karma is Evil or Very Evil."}, {"name": "Khan Trick", "how": "This perk is rewarded by rescuing Anders, completing Diane's drug runs to Don Hostetler and Motor-Runner, and teaching Jack at least three new drug recipes during Aba Daba Honeymoon in Red Rock Canyon.", "desc": "By relying on the dirty unarmed fighting tricks of the Great Khans, you can throw dust into the eyes of your enemies, temporarily stunning them. Perform a Power Attack while moving left or right to execute the Khan Trick."}, {"name": "Legion Assault", "how": "This perk is rewarded by talking to Lucius in Caesar's tent at The Fort with an Unarmed skill of 50, though the option for him to train the player character and obtain the perk is only available with an Accepted or higher reputation with Caesar's Legion.", "desc": "Caesar's elite cadre of bodyguards, the legendary praetorians, use an aggressive Legion Assault to brutalize enemies. Perform a Power Attack while running forward to execute the Legion Assault."}, {"name": "Meat of Champions", "how": "This perk is rewarded by taking the Cannibal perk and using it to consume the corpses of Caesar, Mr. House, The King, and President Kimball.", "desc": "The essence of champions flows through your veins. When you cannibalize corpses, you temporarily gain Caesar's intelligence, Mr. House's luck, The King's charisma, and President Kimball's strength."}, {"name": "Mile in Their Shoes", "how": "Marked as unplayable and Hidden in xEdit by S6S Base Game Perks Redux. Unsure if obtainable?", "desc": "You have come to understand Nightstalkers. Consuming Nightstalker Squeezin's will now grant +1 Agiity, +25 Poison Resistance, +5 Sneak in addition to the normal benefits."}, {"name": "Mirelurk Ecology", "how": "Interact with a book in a basement in Point Lookout with Ghouls in a cell with a Mirelurk King", "desc": "After hours of studying, you've finally learned to exploit a Mirelurk's weaknesses and gain a +5 damage bonus while attacking one."}, {"name": "Mutant Massacrer", "how": "Challenge perk obtained by killing Super Mutants.", "desc": "You've gained a damage bonus against Super Mutants."}, {"name": "Non Ducor, Duco", "how": "During The Apocalypse, after defeating the swarm of marked men in Ulysses' Temple, one must use the launch control panel to abort the launch of the Divide nuclear missiles, failing that quest and starting The End. The perk is not gained until after leaving the Temple, going through the ending, and then returning to the Mojave Wasteland near the canyon wreckage and witnessing the far-off explosion.", "desc": "Though neither the NCR or the Legion is a perfect solution for the Mojave, neither is worth damaging at the cost of repeating humanity's greatest sin. You've gain +1 Intelligence, Charisma, and Luck while your karma is Good or Very Good."}, {"name": "Oderint Dum Metuant", "how": "During The Apocalypse, after defeating the swarm of marked men in Ulysses' Temple, one must use the launch control panel to set the Divide nuclear missiles to target NCR territory. The perk is not gained until after leaving the Temple, going through the ending, and then returning to the Mojave Wasteland near the canyon wreckage and witnessing the far-off explosion.", "desc": "You've set the toothless NCR ablaze with that most unholy of powers, nuclear fusion. While facing members of the NCR, you penetrate 8 DT, and deal 15% more damage with guns and flame-based weapons while your karma is Evil or Very Evil."}, {"name": "Pepsinae Purge", "how": "", "desc": "Thanks to the research compiled in the Greenblood Cave, you've gained +25% crit. damage and crit. chance against cazadores!"}, {"name": "Pitt Fighter", "how": "Win all of the fights in The Hole, which is part of the quest Unsafe Working Conditions.", "desc": "The vicious fights in the Hole have left you stronger. Both your damage and radiation resistance have been increased by +3%."}, {"name": "Power Armor Training", "how": "Acquired from either Paladin Gunny after completing The Waters of LIfe in Fallout 3, or by progressing the Mojave Brotherhood's quest line.", "desc": "You have received the specialized training needed to move in any form of Power Armor."}, {"name": "Punga Power!", "how": "Obtained after finishing Walking with Spirits.", "desc": "Behold the power of the Punga! The restorative effects of Punga fruit now have a greater effect on you."}, {"name": "Ranger Takedown", "how": "This perk is rewarded when talking to Ranger Andy in Novac and inquiring about his leg injuries, requiring either passing a Speech skill check or completing his unmarked quest by visiting Ranger Station Charlie and discovering what happened to its residents.", "desc": "When caught without their weapons, NCR's rangers rely on the Ranger Takedown to quickly incapacitate opponents. Perform a Power Attack while moving backwards to execute a Ranger Takedown."}, {"name": "Reinforced Spine", "how": "This perk can be acquired by successfully convincing the Courier's brain to return to its body or return to the Sink and then going to the Think Tank to confront the Think Tank during Old World Blues. If one enters the Sink from the balcony instead and if it was installed, the Sink Auto-Doc can optionally be used to restore the spine and swap out Spineless for the perk and vice versa.", "desc": "Your spine is back in your body, but some advanced technologies remain: Your torso can be crippled again, but you've gained +1 Endurance and +2 DT."}, {"name": "Scribe Counter", "how": "This perk is gained by recruiting Veronica as a companion and then completing her unmarked quest by placing either White Glove Society attire or formal wear into her inventory. She will then offer to teach the player the technique.", "desc": "Scribes in the Brotherhood of Steel are often not well-trained in the combat use of the high-tech gear employed by Paladins. They rely on unarmed defensive moves like the Scribe Counter to keep enemies at bay. Perform a standard attack out of a block hit reaction to execute a Scribe Counter."}, {"name": "Sic Semper Tyrannis", "how": "During The Apocalypse, after defeating the swarm of marked men in Ulysses' Temple, one must use the launch control panel to set the Divide nuclear missiles to target Legion territory. The perk is not gained until after leaving the Temple, going through the ending, and then returning to the Mojave Wasteland near the canyon wreckage and witnessing the far-off explosion.", "desc": "You've set the tyrannical Legion ablaze with that most unholy of powers, nuclear fusion. While facing members of the Legion, you penetrate 8 DT, and deal 15% more damage with melee and flame-based weapons while your karma is Evil or Very Evil."}, {"name": "Sierra Madre Martini", "how": "This perk is rewarded by talking to Dean Domino after recruiting him during Find Collar 14: Dean Domino and choosing the dialogue option to discuss the topic of his secret stashes; at least one of them must have been found and opened already to unlock this option.", "desc": "You've learned to mix a viscous, foggy, red cocktail at any campfire, using Cloud Residue, Scotch, and an empty Whiskey, which reduces your max health and damages your chest, but grants cloud health and rad damage protection for 75 seconds."}, {"name": "Staunch Defender", "how": "Earned upon completion of The Local Flavor quest.", "desc": "With the Staunch Defender Perk, you gain +5 DT while standing still in combat."}, {"name": "Stoicism", "how": "Zion Trails Bad Company quest reward.", "desc": "The constant turmoil of the wasteland has taught you well. You've gained +3 to Survival."}, {"name": "Xenotech Expert", "how": "(Mothership Zeta) To get this perk, the player character must find a \"shooting range\" in the weapons lab (a room with an alien atomizer and an alien disintegrator next to a switch). The ranges are approximately in the center of the map north-to-south, and on the eastern side. Activating the switch closest to the door summons brahmin, while activating the far switch teleports enemies abducted by the aliens to a second range", "desc": "Your familiarity with alien technology gives you better control over their weapons, increasing their damage output by 10%."}];
const INTERNALIZED_TRAITS_DATA = [{"name": "Addictive Personality", "req": "Complete the Day Tripper challenge.", "desc": "\"You just can't get enough of the hard stuff, that grimy stuff, that junk that hits your veins and makes your heart scream! You have 3x the normal addiction chance."}, {"name": "Bottomless Stomach", "req": "Complete the Wasteland (Desert) Survivalist challenge.", "desc": "Where does the food go? Nobody knows, not even you! Your hunger rate is doubled, but your increased metabolism has allowed you to develop other strengths. (Select a new Perk)"}, {"name": "Congenital Heart Defect", "req": "Complete the Tough Guy challenge.", "desc": "You suffer from a heart condition that causes you to take constant health and chest damage during the entire duration of Buffout, Slasher, Psycho, Turbo, Rebound, Steady, Super Stimpaks, Hydra, or Party Time Mentats. However, suffering from this adversity has taught you a thing or two. (Select a new Perk)"}, {"name": "Danger Close", "req": "Hit yourself with an explosion more times than the sum of your Endurance and Luck stats. (Mines placed in the world also count towards this.)", "desc": "\"Quit hitting yourself! All those lesions and lacerations lacing your body leave you lamenting your lack of valetudinarianism."}, {"name": "Homesick", "req": "Enter the Mojave from the Capital Wasteland. Upon returning to DC the first time, this flaw is removed and you will be able to select a new perk.", "desc": "You've come a long way, and experienced some serious head trauma. Your heart longs for the familar comforts and dangers of the Capital Wasteland. Your addiction chance and limb damage are increased by 25% anytime you're not in the Capital Wasteland or its surrounding territories."}, {"name": "Human Sieve", "req": "Complete the ...And Not a Drop To Drink challenge.", "desc": "Water runs through you like a river into the sea. Your thirst rate has been doubled, but your thirst has led you to a new conclusion. (Select a new Perk)"}, {"name": "Nightkinship", "req": "Use 10 Stealth Boys to be prompted with this thought.", "desc": "\"As the stealth field runs along each nook and cranny of your body, a strange tumbling sensation starts in the back of your psyche. You're not going to lose your mind, but it feels as though something might be... different. Something may be in a place it doesn't belong."}, {"name": "Obstinate", "req": "Complete the Know When the Fold 'Em challenge.", "desc": "You're too stubborn to give any ground in a negotiation, or even try to see from the other person's perspective. Each time you fail a speech check for the first time, you lose XP equal to the sum of your permanent Barter and Speech stats, multiplied by your level, but your Barter and Speech will both be permanently increased by 1."}, {"name": "Paranoid", "req": "INT 3+, Complete the At A Loss For Words challenge.", "desc": "\"You're so obsessed with what's going on behind the scenes that it often hinders your critical thought about what's right in front of you. You've lost -2 Intelligence."}, {"name": "Sunglasses At Night", "req": "Spend 30 real-time minutes wearing sunglasses inside or at night.", "desc": "\"As you peer through the darkened lenses of your shades, you're beginning to see a reflection of the visions in your own eyes. While those squares might think your specs are bogus, you know your cheaters are choice. If you continue to wear your sunglasses in the dark, you'll be made in the shade. (-1 PER and INT while wearing sunglasses indoors or at night until developed).                                                                                                                                     After you've worn sunglasses inside or at night for a real-time hour:"}, {"name": "Tragic Survivor", "req": "Have two companions die while in your service. Instances where companions turn on you and you must kill them don't count, this only increments if they're an active companion when they die.", "desc": "One by one, those that walk by your side seem to fall. Try as you might, you have failed to save two souls who shared your stride; if more are drawn to you and take up arms in your name, surely they shall fall as well. (-2 Luck and -1 Charisma while you have any companion.) However, their sacrifice has shown you a new truth of life in the wastes. (Select a new Perk)"}, {"name": "Why Do They Hunger?", "req": "Kill 35 Feral Ghouls.", "desc": "\"Ever since you've heard about ghouls, one question has been wracking your brain: Why do they hunger?"}];
const IMPLANTS_DATA = [{"name": "\"Empathy Synthesizer\" Charisma Implant", "how": "Purchase the Charisma Implant from Doctor Usanagi at the New Vegas Medical Clinic.", "desc": "Your prefrontal cortex has been enhanced with the Empathy Synthesizer, increasing your Charisma by 1.", "cat": "special", "stat": "CHA"}, {"name": "\"Hypertrophy Accelerator\" Strength Implant", "how": "Purchase the Strength Implant from Doctor Usanagi at the New Vegas Medical Clinic.", "desc": "Your muscle mass has been enhanced with the Hypertrophy Accelerator, increasing your Strength by 1.", "cat": "special", "stat": "STR"}, {"name": "\"Logic Co-Processor\" Intelligence Implant", "how": "Purchase the Intelligence Implant from Doctor Usanagi at the New Vegas Medical Clinic.", "desc": "Your cerebral cortex has been enhanced with the Logic Co-Processor, increasing your Intelligence by 1.", "cat": "special", "stat": "INT"}, {"name": "\"NEMEAN\" Sub-Dermal Armor", "how": "Purchase the Sub-Dermal Armor Implant from Doctor Usanagi at the New Vegas Medical Clinic.", "desc": "Your skin has been toughened by the NEMEAN Sub-Dermal Armor, increasing your total Damage Threshold by 4.", "cat": "body", "stat": null}, {"name": "\"Nociception Regulator\" Endurance Implant", "how": "Purchase the Endurance Implant from Doctor Usanagi at the New Vegas Medical Clinic.", "desc": "Your nervous system has been enhanced with the Nociception Regulator, increasing your Endurance by 1.", "cat": "special", "stat": "END"}, {"name": "\"Optics Enhancer\" Perception Implant", "how": "Purchase the Perception Implant from Doctor Usanagi at the New Vegas Medical Clinic.", "desc": "Your optic nerve has been enhanced with the Optics Enhancer, increasing your Perception by 1.", "cat": "special", "stat": "PER"}, {"name": "\"PHOENIX\" Monocyte Breeder", "how": "Purchase the Monocyte Breeder Implant from Doctor Usanagi at the New Vegas Medical Clinic.", "desc": "Your regenerative ability has been enhanced by the PHOENIX Monocyte Breeder implant, causing you to slowly regenerate lost hit points.", "cat": "body", "stat": null}, {"name": "\"Probability Calculator\" Luck Implant", "how": "Purchase the Luck Implant from Doctor Usanagi at the New Vegas Medical Clinic.", "desc": "Your frontal lobe has been enhanced with the Probability Calculator, increasing your Luck by 1.", "cat": "special", "stat": "LCK"}, {"name": "\"Reflex Booster\" Agility Implant", "how": "Purchase the Agility Implant from Doctor Usanagi at the New Vegas Medical Clinic.", "desc": "Your central nervous node has been enhanced with the Reflex Booster, increasing your Agility by 1.", "cat": "special", "stat": "AGI"}, {"name": "Implant C-13", "how": "The implant must be purchased from the Sink Auto-Doc, which requires both installing it via finding its personality module in the Y-17 medical facility and finding the implant module in the same area.", "desc": "Implant C-13 is a defense turret subroutine that has been modified for implantation into humans. It enhances accuracy and damage dealt against targets in the air by 10%.", "cat": "bigtmt", "stat": null}, {"name": "Implant M-5", "how": "The implant must be purchased from the Sink Auto-Doc, which requires both installing it via finding its personality module in the Y-17 medical facility and finding the implant module in the Z-14 Pepsinae DNA splicing lab.", "desc": "You can be made... better... faster... stronger... Actually, just faster. The M-5 implant increases your crouched movement speed by 10% for greater efficiency as a test subject.", "cat": "bigtmt", "stat": null}, {"name": "Implant Y-3", "how": "The implant must be purchased from the Sink Auto-Doc, which requires finding and installing both its Sink Project: Auto-Doc personality module, found in the Y-17 medical facility, and the Auto-Doc Upgrade: Implant Y-3 module from the Z-9 Crotalus DNA preservation lab.", "desc": "\"Implant Y-3 places an internal filtration system in the digestive tract that strips any liquid consumed of all* radioactive particles.", "cat": "bigtmt", "stat": null}, {"name": "Implant Y-7", "how": "The implant must be purchased from the Sink Auto-Doc, which requires finding and installing both its Sink Project: Auto-Doc personality module, found in the Y-17 medical facility, and the Auto-Doc Upgrade: Implant Y-7 module from reading Slough's terminal in the X-13 research facility.", "desc": "Implant Y-7 is an enzyme booster that increases the Health (HP) gained from foods and recovers additional Action Points (AP) per food item consumed.", "cat": "bigtmt", "stat": null}];

/* ===== TRAIT SYSTEM STATE ===== */
let _traitSlotId = null; // which slot is pending selection
let implantsTaken = {};  // { "STR": true, "NEMEAN": true, ... }
let rewardPerksList = []; // [{ name, notes }]
let internalizedTraitsList = []; // [{ name, notes }]
let _fourthTagSkill = null; // 4th tag skill from Tag! perk
let startingTraits = []; // free-form list of starting traits

/* ===== TRAIT REQUIREMENTS ===== */
const TRAIT_STAT_MAP = {
  STR:'STR', PER:'PER', END:'END', CHR:'CHA', CHA:'CHA', INT:'INT', AGL:'AGI', AGI:'AGI', LCK:'LCK'
};

function getChosenTraitNames() {
    const names = [];
    document.querySelectorAll('.trait-slot-row').forEach(row => {
        const n = (row.getAttribute('data-chosen') || '').trim();
        if (n) names.push(n);
    });
    startingTraits.forEach(t => { if (t.name) names.push(t.name); });
    return names;
}

function checkTraitEligible(trait) {
    if (!trait.req || trait.req.trim() === '') return true;
    const chosen = getChosenTraitNames();
    const parts = trait.req.split(',').map(p => p.trim());
    for (const part of parts) {
        const up = part.toUpperCase();
        // NOT check
        if (up.startsWith('NOT ')) {
            const blocked = up.slice(4).trim();
            if (chosen.includes(blocked)) return false;
            continue;
        }
        // Level check
        const lvlM = up.match(/^LEVEL\s+(\d+)$/);
        if (lvlM) {
            if (charLevel < parseInt(lvlM[1])) return false;
            continue;
        }
        // SPECIAL max cap: STAT < N
        const capM = up.match(/^(STR|PER|END|CHR|CHA|INT|AGL|AGI|LCK)\s*<\s*(\d+)$/);
        if (capM) {
            const key = TRAIT_STAT_MAP[capM[1]] || capM[1];
            const cap = parseInt(capM[2]);
            if ((special[key] || 1) >= cap) return false;
            continue;
        }
        // SPECIAL min: STAT N
        const minM = up.match(/^(STR|PER|END|CHR|CHA|INT|AGL|AGI|LCK)\s+(\d+)$/);
        if (minM) {
            const key = TRAIT_STAT_MAP[minM[1]] || minM[1];
            const req = parseInt(minM[2]);
            if ((special[key] || 1) < req) return false;
            continue;
        }
        // Exclusive check
        const exclM = up.match(/^NOT\s+(.+)$/);
        if (exclM) {
            const blocked = exclM[1].trim();
            if (chosen.includes(blocked)) return false;
        }
    }
    return true;
}

/* ===== TRAIT MODAL ===== */
function openTraitModal(slotId) {
    _traitSlotId = slotId;
    document.getElementById('trait-modal').style.display = 'flex';
    document.getElementById('trait-modal-search').value = '';
    renderTraitGrid('');
}

function closeTraitModal() {
    document.getElementById('trait-modal').style.display = 'none';
    _traitSlotId = null;
}

function renderTraitGrid(search) {
    const container = document.getElementById('trait-modal-grid');
    const q = (search || '').toLowerCase();
    const chosen = getChosenTraitNames();
    let filtered = TRAITS_DATA.filter(t => {
        if (q && !t.name.toLowerCase().includes(q) && !t.desc.toLowerCase().includes(q)) return false;
        return true;
    });
    // Sort: eligible A-Z first, then ineligible A-Z; taken always last
    filtered = filtered.slice().sort((a, b) => {
        const takenA = getChosenTraitNames().some(c => c.toLowerCase() === a.name.toLowerCase());
        const takenB = getChosenTraitNames().some(c => c.toLowerCase() === b.name.toLowerCase());
        const eligA = checkTraitEligible(a);
        const eligB = checkTraitEligible(b);
        if (takenA !== takenB) return takenA ? 1 : -1;
        if (eligA !== eligB) return eligA ? -1 : 1;
        return a.name.localeCompare(b.name);
    });
    container.innerHTML = filtered.map(t => {
        const alreadyTaken = chosen.some(c => c.toUpperCase() === t.name.toUpperCase());
        const eligible = checkTraitEligible(t);
        const cls = alreadyTaken ? 'trait-card taken' : eligible ? 'trait-card eligible' : 'trait-card ineligible';
        const badge = alreadyTaken ? '<span class="trait-badge taken-badge">TAKEN</span>'
                    : eligible ? '<span class="trait-badge elig-badge">✓ ELIGIBLE</span>'
                    : '<span class="trait-badge inelig-badge">REQ NOT MET</span>';
        const reqText = t.req ? `<div class="trait-req">${t.req}</div>` : '';
        const desc = t.desc.length > 200 ? t.desc.slice(0,200)+'...' : t.desc;
        return `<div class="${cls}" onclick="selectTraitForSlot('${t.name.replace(/'/g,"\\'")}')">
            <div class="trait-card-header">
                <span class="trait-card-name">${t.name}</span>
                ${badge}
            </div>
            ${reqText}
            <div class="trait-card-desc">${desc}</div>
        </div>`;
    }).join('');
}

function selectTraitForSlot(traitName) {
    // Starting trait mode
    if (_traitSlotId === '__starting__') { addStartingTrait(traitName); return; }
    if (!_traitSlotId) {
        // Called from view-all mode — find first empty trait slot
        const emptySlot = Array.from(document.querySelectorAll('.trait-slot-row')).find(r => !(r.getAttribute('data-chosen') || '').trim());
        if (!emptySlot) { closeTraitModal(); return; }
        _traitSlotId = emptySlot.id;
    }
    const row = document.getElementById(_traitSlotId);
    if (!row) { closeTraitModal(); return; }
    row.setAttribute('data-chosen', traitName);
    const nameEl = row.querySelector('.trait-slot-name');
    const btn = row.querySelector('.trait-slot-btn');
    const clearBtn = row.querySelector('.trait-slot-clear');
    if (nameEl) nameEl.textContent = traitName;
    if (btn) btn.textContent = 'CHANGE';
    if (clearBtn) clearBtn.style.display = 'inline-block';
    closeTraitModal();
    updateAll();
    triggerAutosave();
}

function clearTraitSlot(slotId) {
    const row = document.getElementById(slotId);
    if (!row) return;
    row.setAttribute('data-chosen', '');
    row.querySelector('.trait-slot-name').textContent = 'NONE SELECTED';
    row.querySelector('.trait-slot-btn').textContent = 'SELECT';
    row.querySelector('.trait-slot-clear').style.display = 'none';
    triggerAutosave();
}

/* ===== TRAIT ROW BUILDER ===== */
function makeTraitRow(slotId, levelLabel, chosenName) {
    const name = chosenName || '';
    const displayName = name || 'NONE SELECTED';
    const clearDisplay = name ? 'inline-block' : 'none';
    const btnLabel = name ? 'CHANGE' : 'SELECT';
    return `<div class="prog-row trait-slot-row" id="${slotId}" data-chosen="${name.replace(/"/g,'&quot;')}">
        <div class="prog-card-header">
            <span class="lvl-tag is-trait">${levelLabel}</span>
            <button class="trait-slot-btn prog-clear-btn" onclick="openTraitModal('${slotId}')">${btnLabel}</button>
            <button class="trait-slot-clear prog-clear-btn" onclick="clearTraitSlot('${slotId}')" style="display:${clearDisplay}; color:rgba(255,80,80,0.8);">✕ CLEAR</button>
        </div>
        <div class="trait-slot-name" style="padding:6px 10px; font-size:0.85rem; color:#c8ffd4; letter-spacing:0.05em;">${displayName}</div>
    </div>`;
}

/* ===== IMPLANTS ===== */
function getNVImplantLimit() {
    // Limit = base END — the END implant itself does NOT increase your implant slots
    // (matches vanilla FNV: Doctor Usanagi gives slots = base END, not modified END)
    const endImplant = IMPLANTS_DATA.find(i => i.stat === 'END' && i.cat === 'special');
    const endFromImplant = (endImplant && implantsTaken[endImplant.name]) ? 1 : 0;
    return Math.max(0, (special.END || 1) - endFromImplant);
}

function getNVImplantCount() {
    // Only SPECIAL implants (cat === 'special') count against END limit
    let count = 0;
    IMPLANTS_DATA.forEach(imp => {
        if (imp.cat === 'special' && implantsTaken[imp.name]) count++;
    });
    return count;
}

function toggleImplantByIndex(idx) {
    const imp = IMPLANTS_DATA[idx];
    if (imp) toggleImplant(imp.name);
}

function toggleImplant(name) {
    const imp = IMPLANTS_DATA.find(i => i.name === name);
    if (!imp) return;
    if (implantsTaken[name]) {
        // Remove
        implantsTaken[name] = false;
        // Reverse SPECIAL bonus
        if (imp.cat === 'special' && imp.stat) {
            special[imp.stat] = Math.max(1, (special[imp.stat] || 1) - 1);
        }
    } else {
        // Only check limit for SPECIAL implants
        if (imp.cat === 'special') {
            const limit = getNVImplantLimit();
            const current = getNVImplantCount();
            if (current >= limit) {
                const el = document.getElementById('implant-limit-warning');
                if (el) { el.style.display = 'block'; setTimeout(() => el.style.display = 'none', 2500); }
                return;
            }
        }
        implantsTaken[name] = true;
        // Apply SPECIAL bonus
        if (imp.cat === 'special' && imp.stat) {
            special[imp.stat] = Math.min(10, (special[imp.stat] || 1) + 1);
        }
    }
    renderImplants();
    updateAll();
    reCheckAllPerkRows();
    triggerAutosave();
}

function renderImplants() {
    const container = document.getElementById('implants-list');
    if (!container) return;
    const limit = getNVImplantLimit();
    const count = getNVImplantCount();
    const header = document.getElementById('implants-limit-display');
    if (header) header.textContent = `SPECIAL IMPLANTS: ${count} / ${limit} (END ${special.END} LIMIT) — BODY & BIG MT: UNLIMITED`;

    const groups = { special: [], body: [], bigtmt: [] };
    IMPLANTS_DATA.forEach(imp => { if (groups[imp.cat]) groups[imp.cat].push(imp); });

    const groupLabels = { special: 'S.P.E.C.I.A.L. IMPLANTS', body: 'BODY IMPLANTS', bigtmt: 'BIG MT IMPLANTS' };

    const renderGroup = (cat, items) => {
        if (!items.length) return '';
        const atLimit = cat === 'special' && count >= limit;
        return `<div class="implant-group">
            <div class="implant-group-title">${groupLabels[cat]}${cat === 'special' ? ` <span class="implant-slot-counter">${count}/${limit}</span>` : ''}</div>
            <div class="implant-grid">
            ${items.map(imp => {
                const idx = IMPLANTS_DATA.indexOf(imp);
                const taken = !!implantsTaken[imp.name];
                const blocked = cat === 'special' && !taken && atLimit;
                const statLabel = cat === 'special' && imp.stat ? `+1 ${imp.stat}` : '';
                return `<div class="implant-item ${taken ? 'implant-taken' : ''} ${blocked ? 'implant-locked' : ''}" onclick="toggleImplantByIndex(${idx})" title="${imp.how || ''}">
                    <div class="implant-item-top">
                        <span class="implant-check">${taken ? '◉' : '○'}</span>
                        <span class="implant-name">${imp.name}</span>
                        ${statLabel ? `<span class="implant-stat-badge">${statLabel}</span>` : ''}
                    </div>
                    <div class="implant-desc">${imp.desc}</div>
                </div>`;
            }).join('')}
            </div>
        </div>`;
    };

    container.innerHTML = renderGroup('special', groups.special)
        + renderGroup('body', groups.body)
        + renderGroup('bigtmt', groups.bigtmt);
}

/* ===== PERK ZOOM MODAL ===== */
function openPerkZoom(name, req, desc) {
    document.getElementById('perk-zoom-name').textContent = name;
    document.getElementById('perk-zoom-req').textContent = req ? 'REQ: ' + req : '';
    document.getElementById('perk-zoom-desc').textContent = desc;
    document.getElementById('perk-zoom-modal').style.display = 'flex';
}

// Clicked from PERK & TRAIT LOG overview panel
function ovPerkClick(name, req, desc) {
    openPerkZoom(name, req, desc);
}

/* ===== IMPLANT PICKER MODAL ===== */
function openImplantModal() {
    document.getElementById('implant-modal').style.display = 'flex';
    document.getElementById('implant-modal-search').value = '';
    renderImplantModalGrid('');
}

function closeImplantModal() {
    document.getElementById('implant-modal').style.display = 'none';
}

function renderImplantModalGrid(search) {
    const container = document.getElementById('implant-modal-grid');
    const q = (search || '').toLowerCase();
    const limit = getNVImplantLimit();
    const count = getNVImplantCount();

    const catLabels = { special: 'S.P.E.C.I.A.L. IMPLANTS', body: 'BODY IMPLANTS', bigtmt: 'BIG MT IMPLANTS' };
    const catColors = { special: '#80d8ff', body: '#80ffb0', bigtmt: '#c0a0ff' };
    const groups = { special: [], body: [], bigtmt: [] };
    IMPLANTS_DATA.forEach(imp => { if (groups[imp.cat]) groups[imp.cat].push(imp); });

    let html = '';
    ['special', 'body', 'bigtmt'].forEach(cat => {
        const items = groups[cat].filter(imp =>
            !q || imp.name.toLowerCase().includes(q) || imp.desc.toLowerCase().includes(q)
        );
        if (!items.length) return;
        html += `<div style="margin-bottom:14px;">
            <div style="font-size:0.62rem; color:${catColors[cat]}; letter-spacing:0.12em; padding:4px 0 6px; border-bottom:1px solid rgba(128,216,255,0.15); margin-bottom:8px;">${catLabels[cat]}</div>`;
        items.forEach(imp => {
            const taken = !!implantsTaken[imp.name];
            const statLabel = imp.cat === 'special' && imp.stat ? ` (+1 ${imp.stat})` : '';
            const atLimit = imp.cat === 'special' && !taken && count >= limit;
            const opacity = atLimit ? 'opacity:0.4;' : '';
            const cursor = atLimit ? 'cursor:not-allowed;' : 'cursor:pointer;';
            const takenStyle = taken ? `background:rgba(128,216,255,0.15); border-color:rgba(128,216,255,0.5);` : '';
            html += `<div class="trait-card" style="${takenStyle}${opacity}${cursor}" onclick="${atLimit ? "document.getElementById('implant-limit-warning').style.display='block';setTimeout(()=>document.getElementById('implant-limit-warning').style.display='none',2500)" : `pickImplantFromModal('${imp.name.replace(/'/g,"\\'")}')` }">
                <div class="trait-card-header">
                    <span class="trait-card-name" style="color:${catColors[cat]};">${taken ? '☑ ' : '☐ '}${imp.name}${statLabel}</span>
                    ${taken ? '<span style="font-size:0.6rem;color:#80ff80;margin-left:auto;">INSTALLED</span>' : ''}
                    ${atLimit ? '<span style="font-size:0.6rem;color:#ff8080;margin-left:auto;">LIMIT REACHED</span>' : ''}
                </div>
                <div class="trait-card-desc">${imp.desc.slice(0,180)}${imp.desc.length>180?'...':''}</div>
                <div class="trait-req" style="color:#888;margin-top:4px;font-size:0.58rem;">${imp.how.slice(0,120)}${imp.how.length>120?'...':''}</div>
            </div>`;
        });
        html += '</div>';
    });
    container.innerHTML = html || '<div style="text-align:center;opacity:0.4;padding:24px;font-size:0.7rem;">NO IMPLANTS FOUND</div>';
}

function pickImplantFromModal(name) {
    toggleImplant(name);
    closeImplantModal();
}

/* ===== SKILL LOG ===== */
function renderSkillLog() {
    const wrap = document.getElementById('skilllog-table-wrap');
    const empty = document.getElementById('skilllog-empty');
    if (!wrap) return;

    if (!skillHistory.length) {
        if (empty) empty.style.display = 'block';
        wrap.innerHTML = '';
        return;
    }
    if (empty) empty.style.display = 'none';

    // Calculate cumulative totals at each level
    const cumulativeGains = {};
    skills.forEach(s => { cumulativeGains[s] = 0; });

    let html = `<div class="skilllog-summary">
        <span>TOTAL LEVELS RECORDED: <b>${skillHistory.length}</b></span>
        <span>CURRENT LEVEL: <b>${charLevel}</b></span>
    </div>`;

    // Build table
    html += `<div class="skilllog-scroll">
    <table class="skilllog-table">
        <thead>
            <tr>
                <th class="skilllog-th-skill">SKILL</th>
                ${skillHistory.map(e => `<th class="skilllog-th-lvl" title="Points budget: ${e.pointsTotal}">LV${e.level}</th>`).join('')}
                <th class="skilllog-th-total">TOTAL<br>GAINED</th>
            </tr>
        </thead>
        <tbody>`;

    skills.forEach(s => {
        let rowTotal = 0;
        const cells = skillHistory.map(entry => {
            const gain = entry.gains[s] || 0;
            const isTagged = entry.tagged && entry.tagged.includes(s);
            rowTotal += gain;
            if (gain === 0) return `<td class="skilllog-cell skilllog-zero">—</td>`;
            return `<td class="skilllog-cell skilllog-gain${isTagged ? ' skilllog-tagged' : ''}" title="${isTagged ? '★ TAGGED — 2pts gained per 1 spent' : ''}">${gain > 0 ? '+'+gain : gain}${isTagged ? '<span class="skilllog-star">★</span>' : ''}</td>`;
        }).join('');

        html += `<tr class="skilllog-row">
            <td class="skilllog-skill-name">${s}</td>
            ${cells}
            <td class="skilllog-total-cell">${rowTotal > 0 ? '+'+rowTotal : '—'}</td>
        </tr>`;
    });

    // Points budget row
    html += `<tr class="skilllog-pts-row">
        <td class="skilllog-skill-name" style="color:rgba(200,255,210,0.5); font-size:0.55rem;">PTS BUDGET</td>
        ${skillHistory.map(e => `<td class="skilllog-cell" style="color:rgba(200,255,210,0.45); font-size:0.6rem;">${e.pointsTotal}</td>`).join('')}
        <td class="skilllog-total-cell">—</td>
    </tr>`;

    html += `</tbody></table></div>`;

    // Add a reset note
    html += `<div style="font-size:0.58rem; opacity:0.35; text-align:center; margin-top:12px; letter-spacing:0.05em;">★ = TAGGED SKILL (1 PT SPENT = 2 PT GAINED) &nbsp;|&nbsp; LOG RESETS ON FULL BUILD RESET</div>`;

    wrap.innerHTML = html;
}

/* ===== STARTING TRAITS ===== */
function renderStartingTraitsList() {
    const container = document.getElementById('starting-traits-list');
    if (!container) return;
    // Update HC counter
    const counter = document.getElementById('hc-trait-counter');
    if (counter) counter.textContent = `${startingTraits.length}/5`;
    // Dim ADD button at limit in HC mode
    const addBtn = document.querySelector('.cs-start-trait-btn');
    if (addBtn && mode === 'hc') {
        addBtn.style.opacity = startingTraits.length >= 5 ? '0.35' : '1';
        addBtn.title = startingTraits.length >= 5 ? 'HARDERCORE LIMIT: 5 STARTING TRAITS MAX' : 'ADD STARTING TRAIT';
    }
    if (startingTraits.length === 0) {
        container.innerHTML = '<div style="font-size:0.58rem; opacity:0.3; padding:6px 0; letter-spacing:1px;">NO STARTING TRAITS SELECTED</div>';
        return;
    }
    container.innerHTML = startingTraits.map((t, idx) => `
        <div class="st-tag-chip">
            <span class="st-tag-name">${t.name}</span>
            <button class="st-tag-remove" onclick="removeStartingTrait(${idx})">✕</button>
        </div>`).join('');
}

function addStartingTrait(name) {
    // Avoid duplicates
    if (startingTraits.some(t => t.name === name)) { closeTraitModal(); return; }
    // HC mode: max 5 starting traits
    if (mode === 'hc' && startingTraits.length >= 5) {
        closeTraitModal();
        return;
    }
    startingTraits.push({ name });
    renderStartingTraitsList();
    updateAll();
    closeTraitModal();
    triggerAutosave();
}

function removeStartingTrait(idx) {
    startingTraits.splice(idx, 1);
    renderStartingTraitsList();
    updateAll();
    triggerAutosave();
}

function openStartingTraitModal() {
    // HC mode: enforce 5 starting trait limit
    if (mode === 'hc' && startingTraits.length >= 5) {
        const el = document.getElementById('hc-trait-limit-warning');
        if (el) { el.style.display = 'block'; setTimeout(() => el.style.display = 'none', 2500); }
        return;
    }
    _traitSlotId = '__starting__';
    document.getElementById('trait-modal').style.display = 'flex';
    document.getElementById('trait-modal-search').value = '';
    renderTraitGrid('');
}

/* ===== REWARD PERKS ===== */
function renderRewardPerksList() {
    const container = document.getElementById('reward-perks-list');
    if (!container) return;
    container.innerHTML = rewardPerksList.map((rp, idx) => `
        <div class="prog-row">
            <div class="prog-card-header">
                <span class="lvl-tag" style="background: rgba(255,180,50,0.15); color:#ffd080; border-color:rgba(255,180,50,0.3);">REWARD</span>
                <span style="flex:1; padding: 0 8px; font-size:0.8rem; color:#ffd080;">${rp.name}</span>
                <button onclick="removeRewardPerk(${idx})" style="color:rgba(255,80,80,0.8);background:none;border:1px solid rgba(255,0,0,0.3);font-size:0.6rem;padding:2px 7px;cursor:pointer;">✕</button>
            </div>
            <input type="text" class="prog-notes-input" placeholder="NOTES..." value="${rp.notes||''}" oninput="rewardPerksList[${idx}].notes=this.value; triggerAutosave();">
        </div>`).join('');
}

function openRewardPerkSearch() {
    document.getElementById('reward-perk-modal').style.display = 'flex';
    document.getElementById('reward-perk-search').value = '';
    renderRewardPerkGrid('');
}

function closeRewardPerkModal() {
    document.getElementById('reward-perk-modal').style.display = 'none';
}

function renderRewardPerkGrid(search) {
    const container = document.getElementById('reward-perk-modal-grid');
    const q = (search || '').toLowerCase();
    const filtered = REWARD_PERKS_DATA.filter(p =>
        !q || p.name.toLowerCase().includes(q) || p.desc.toLowerCase().includes(q)
    );
    container.innerHTML = filtered.map(p => {
        const desc = p.desc.length > 200 ? p.desc.slice(0,200)+'...' : p.desc;
        return `<div class="trait-card" onclick="addRewardPerk('${p.name.replace(/'/g,"\\'")}')">
            <div class="trait-card-header"><span class="trait-card-name">${p.name}</span></div>
            <div class="trait-req" style="color:#aaa;">${p.how.slice(0,100)}${p.how.length>100?'...':''}</div>
            <div class="trait-card-desc">${desc}</div>
        </div>`;
    }).join('');
}

function addRewardPerk(name) {
    rewardPerksList.push({ name, notes: '' });
    closeRewardPerkModal();
    renderRewardPerksList();
    triggerAutosave();
}

function removeRewardPerk(idx) {
    rewardPerksList.splice(idx, 1);
    renderRewardPerksList();
    triggerAutosave();
}

/* ===== INTERNALIZED TRAITS ===== */
function renderInternalizedTraitsList() {
    const container = document.getElementById('internalized-traits-list');
    if (!container) return;
    container.innerHTML = internalizedTraitsList.map((it, idx) => `
        <div class="prog-row">
            <div class="prog-card-header">
                <span class="lvl-tag is-trait" style="background: rgba(150,80,255,0.15); color:#c8a0ff; border-color:rgba(150,80,255,0.3);">INTERNALIZED</span>
                <span style="flex:1; padding: 0 8px; font-size:0.8rem; color:#c8a0ff;">${it.name}</span>
                <button onclick="removeInternalizedTrait(${idx})" style="color:rgba(255,80,80,0.8);background:none;border:1px solid rgba(255,0,0,0.3);font-size:0.6rem;padding:2px 7px;cursor:pointer;">✕</button>
            </div>
            <input type="text" class="prog-notes-input" placeholder="NOTES..." value="${it.notes||''}" oninput="internalizedTraitsList[${idx}].notes=this.value; triggerAutosave();">
        </div>`).join('');
}

function openInternalizedModal() {
    document.getElementById('internalized-modal').style.display = 'flex';
    document.getElementById('internalized-search').value = '';
    renderInternalizedGrid('');
}

function closeInternalizedModal() {
    document.getElementById('internalized-modal').style.display = 'none';
}

function renderInternalizedGrid(search) {
    const container = document.getElementById('internalized-modal-grid');
    const q = (search || '').toLowerCase();
    const filtered = INTERNALIZED_TRAITS_DATA.filter(t =>
        !q || t.name.toLowerCase().includes(q) || t.desc.toLowerCase().includes(q)
    );
    container.innerHTML = filtered.map(t => {
        const desc = t.desc.length > 200 ? t.desc.slice(0,200)+'...' : t.desc;
        return `<div class="trait-card" onclick="addInternalizedTrait('${t.name.replace(/'/g,"\\'")}')">
            <div class="trait-card-header"><span class="trait-card-name">${t.name}</span></div>
            <div class="trait-req">${t.req}</div>
            <div class="trait-card-desc">${desc}</div>
        </div>`;
    }).join('');
}

function addInternalizedTrait(name) {
    internalizedTraitsList.push({ name, notes: '' });
    closeInternalizedModal();
    renderInternalizedTraitsList();
    triggerAutosave();
}

function removeInternalizedTrait(idx) {
    internalizedTraitsList.splice(idx, 1);
    renderInternalizedTraitsList();
    triggerAutosave();
}


/* --- DATA: QUESTS --- */
const questsData = {
    'CW': { 
        'MAIN QUEST': ['<a href="https://fallout.fandom.com/wiki/Escape!" target="_blank">ESCAPE!</a>', '<a href="https://fallout.fandom.com/wiki/Following_in_His_Footsteps" target="_blank">FOLLOWING IN HIS FOOTSTEPS</a>', '<a href="https://fallout.fandom.com/wiki/Galaxy_News_Radio" target="_blank">GALAXY NEWS RADIO</a>', '<a href="https://fallout.fandom.com/wiki/Scientific_Pursuits" target="_blank">SCIENTIFIC PURSUITS</a>', '<a href="https://fallout.fandom.com/wiki/Tranquility_Lane" target="_blank">TRANQUILITY LANE</a>', '<a href="https://fallout.fandom.com/wiki/The_Waters_of_Life" target="_blank">THE WATERS OF LIFE</a>', '<a href="https://fallout.fandom.com/wiki/Picking_Up_the_Trail" target="_blank">PICKING UP THE TRAIL</a>', '<a href="https://fallout.fandom.com/wiki/Rescue_from_Paradise" target="_blank">RESCUE FROM PARADISE</a>', '<a href="https://fallout.fandom.com/wiki/Finding_the_Garden_of_Eden" target="_blank">FINDING THE GARDEN OF EDEN</a>', '<a href="https://fallout.fandom.com/wiki/The_American_Dream" target="_blank">THE AMERICAN DREAM</a>', '<a href="https://fallout.fandom.com/wiki/Take_it_Back!" target="_blank">TAKE IT BACK!</a>'],
        'SIDE QUEST': ['<a href="https://fallout.fandom.com/wiki/Agatha%27s_Song" target="_blank">AGATHA\'S SONG</a>', '<a href="https://fallout.fandom.com/wiki/Big_Trouble_in_Big_Town" target="_blank">BIG TROUBLE IN BIG TOWN</a>', '<a href="https://fallout.fandom.com/wiki/Blood_Ties" target="_blank">BLOOD TIES</a>', '<a href="https://fallout.fandom.com/wiki/Head_of_State" target="_blank">HEAD OF STATE</a>', '<a href="https://fallout.fandom.com/wiki/Oasis_(quest)" target="_blank">OASIS</a>', '<a href="https://fallout.fandom.com/wiki/Reilly%27s_Rangers_(quest)" target="_blank">REILLY\'S RANGERS</a>', '<a href="https://fallout.fandom.com/wiki/Stealing_Independence" target="_blank">STEALING INDEPENDENCE</a>', '<a href="https://fallout.fandom.com/wiki/Strictly_Business" target="_blank">STRICTLY BUSINESS</a>', '<a href="https://fallout.fandom.com/wiki/Tenpenny_Tower_(quest)" target="_blank">TENPENNY TOWER</a>', '<a href="https://fallout.fandom.com/wiki/The_Nuka-Cola_Challenge" target="_blank">THE NUKA COLA CHALLENGE</a>', '<a href="https://fallout.fandom.com/wiki/The_Power_of_the_Atom_(Fallout_3)" target="_blank">THE POWER OF THE ATOM</a>', '<a href="https://fallout.fandom.com/wiki/The_Replicated_Man" target="_blank">THE REPLICATED MAN</a>', '<a href="https://fallout.fandom.com/wiki/The_Superhuman_Gambit" target="_blank">THE SUPERHUMAN GAMBIT</a>', '<a href="https://fallout.fandom.com/wiki/The_Wasteland_Survival_Guide" target="_blank">WASTELAND SURVIVAL GUIDE</a>', '<a href="https://fallout.fandom.com/wiki/Those!" target="_blank">THOSE!</a>', '<a href="https://fallout.fandom.com/wiki/Trouble_on_the_Homefront" target="_blank">TROUBLE ON THE HOMEFRONT</a>', '<a href="https://fallout.fandom.com/wiki/You_Gotta_Shoot_%27Em_in_the_Head" target="_blank">YOU GOTTA SHOOT \'EM IN THE HEAD</a>'],
        'DLC: OPERATION ANCHORAGE': ['<a href="https://fallout.fandom.com/wiki/Aiding_the_Outcasts" target="_blank">AIDING THE OUTCASTS</a>', '<a href="https://fallout.fandom.com/wiki/The_Guns_of_Anchorage" target="_blank">THE GUNS OF ANCHORAGE</a>', '<a href="https://fallout.fandom.com/wiki/Paving_the_Way" target="_blank">PAVING THE WAY</a>', '<a href="https://fallout.fandom.com/wiki/Operation:_Anchorage!_(quest)" target="_blank">OPERATION: ANCHORAGE!</a>'],
        'DLC: BROKEN STEEL': ['<a href="https://fallout.fandom.com/wiki/Death_From_Above" target="_blank">DEATH FROM ABOVE</a>', '<a href="https://fallout.fandom.com/wiki/Shock_Value" target="_blank">SHOCK VALUE</a>', '<a href="https://fallout.fandom.com/wiki/Who_Dares_Wins" target="_blank">WHO DARES WINS</a>', '<a href="https://fallout.fandom.com/wiki/Holy_Water" target="_blank">HOLY WATER</a>', '<a href="https://fallout.fandom.com/wiki/Protecting_the_Water_Way" target="_blank">PROTECTING THE WATER WAY</a>', '<a href="https://fallout.fandom.com/wiki/The_Amazing_Aqua_Cura!" target="_blank">THE AMAZING AQUA CURA!</a>'],
        'DLC: THE PITT': ['<a href="https://fallout.fandom.com/wiki/Into_The_Pitt" target="_blank">INTO THE PITT</a>', '<a href="https://fallout.fandom.com/wiki/Unsafe_Working_Conditions" target="_blank">UNSAFE WORKING CONDITIONS</a>', '<a href="https://fallout.fandom.com/wiki/Free_Labor" target="_blank">FREE LABOR</a>'],
        'DLC: POINT LOOKOUT': ['<a href="https://fallout.fandom.com/wiki/The_Local_Flavor" target="_blank">THE LOCAL FLAVOR</a>', '<a href="https://fallout.fandom.com/wiki/Walking_with_Spirits" target="_blank">WALKING WITH SPIRITS</a>', '<a href="https://fallout.fandom.com/wiki/Hearing_Voices" target="_blank">HEARING VOICES</a>', '<a href="https://fallout.fandom.com/wiki/Thought_Control" target="_blank">THOUGHT CONTROL</a>', '<a href="https://fallout.fandom.com/wiki/A_Meeting_of_the_Minds" target="_blank">A MEETING OF THE MINDS</a>', '<a href="https://fallout.fandom.com/wiki/The_Velvet_Curtain" target="_blank">THE VELVET CURTAIN</a>', '<a href="https://fallout.fandom.com/wiki/An_Ancient_Heritage" target="_blank">AN ANCIENT HERITAGE</a>', '<a href="https://fallout.fandom.com/wiki/Plik%27s_Safari" target="_blank">PLIK\'S SAFARI</a>'],
        'DLC: MOTHERSHIP ZETA': ['<a href="https://fallout.fandom.com/wiki/Not_of_This_World_(quest)" target="_blank">NOT OF THIS WORLD</a>', '<a href="https://fallout.fandom.com/wiki/Among_the_Stars" target="_blank">AMONG THE STARS</a>', '<a href="https://fallout.fandom.com/wiki/This_Galaxy_Ain%27t_Big_Enough..." target="_blank">THIS GALAXY AIN\'T BIG ENOUGH...</a>']
    },
    'MW': { 
        'MAIN QUEST (GENERAL)': ['<a href="https://fallout.fandom.com/wiki/Ain%27t_That_a_Kick_in_the_Head_(quest)" target="_blank">AIN\'T THAT A KICK IN THE HEAD</a>', '<a href="https://fallout.fandom.com/wiki/Back_in_the_Saddle" target="_blank">BACK IN THE SADDLE</a>', '<a href="https://fallout.fandom.com/wiki/By_a_Campfire_on_the_Trail" target="_blank">BY A CAMPFIRE ON THE TRAIL</a>', '<a href="https://fallout.fandom.com/wiki/They_Went_That-a-Way" target="_blank">THEY WENT THAT-A-WAY</a>', '<a href="https://fallout.fandom.com/wiki/Ring-a-Ding-Ding!" target="_blank">RING-A-DING-DING!</a>'],
        'MAIN QUEST (INDEPENDENT)': ['<a href="https://fallout.fandom.com/wiki/Wild_Card:_Ace_in_the_Hole" target="_blank">WILD CARD: ACE IN THE HOLE</a>', '<a href="https://fallout.fandom.com/wiki/Wild_Card:_Change_in_Management" target="_blank">WILD CARD: CHANGE IN MANAGEMENT</a>', '<a href="https://fallout.fandom.com/wiki/Wild_Card:_You_and_What_Army%3F" target="_blank">WILD CARD: YOU AND WHAT ARMY?</a>', '<a href="https://fallout.fandom.com/wiki/Wild_Card:_Side_Bets" target="_blank">WILD CARD: SIDE BETS</a>', '<a href="https://fallout.fandom.com/wiki/Wild_Card:_Finishing_Touches" target="_blank">WILD CARD: FINISHING TOUCHES</a>', '<a href="https://fallout.fandom.com/wiki/No_Gods,_No_Masters" target="_blank">NO GODS, NO MASTERS</a>'],
        'MAIN QUEST (MR. HOUSE)': ['<a href="https://fallout.fandom.com/wiki/The_House_Always_Wins_I" target="_blank">THE HOUSE ALWAYS WINS I</a>', '<a href="https://fallout.fandom.com/wiki/The_House_Always_Wins_II" target="_blank">THE HOUSE ALWAYS WINS II</a>', '<a href="https://fallout.fandom.com/wiki/The_House_Always_Wins_III" target="_blank">THE HOUSE ALWAYS WINS III</a>', '<a href="https://fallout.fandom.com/wiki/The_House_Always_Wins_IV" target="_blank">THE HOUSE ALWAYS WINS IV</a>', '<a href="https://fallout.fandom.com/wiki/The_House_Always_Wins_V" target="_blank">THE HOUSE ALWAYS WINS V</a>', '<a href="https://fallout.fandom.com/wiki/The_House_Always_Wins_VI" target="_blank">THE HOUSE ALWAYS WINS VI</a>', '<a href="https://fallout.fandom.com/wiki/The_House_Always_Wins_VII" target="_blank">THE HOUSE ALWAYS WINS VII</a>', '<a href="https://fallout.fandom.com/wiki/The_House_Always_Wins_VIII" target="_blank">THE HOUSE ALWAYS WINS VIII</a>', '<a href="https://fallout.fandom.com/wiki/All_or_Nothing" target="_blank">ALL OR NOTHING</a>'],
        'MAIN QUEST (NCR)': ['<a href="https://fallout.fandom.com/wiki/Things_That_Go_Boom" target="_blank">THINGS THAT GO BOOM</a>', '<a href="https://fallout.fandom.com/wiki/Kings%27_Gambit" target="_blank">KINGS\' GAMBIT</a>', '<a href="https://fallout.fandom.com/wiki/For_the_Republic,_Part_2" target="_blank">FOR THE REPUBLIC, PART 2</a>', '<a href="https://fallout.fandom.com/wiki/You%27ll_Know_It_When_It_Happens" target="_blank">YOU\'LL KNOW IT WHEN IT HAPPENS</a>', '<a href="https://fallout.fandom.com/wiki/Eureka!" target="_blank">EUREKA!</a>'],
        'MAIN QUEST (LEGION)': ['<a href="https://fallout.fandom.com/wiki/Render_Unto_Caesar" target="_blank">RENDER UNTO CAESAR</a>', '<a href="https://fallout.fandom.com/wiki/Et_Tumor,_Brute%3F" target="_blank">ET TUMOR, BRUTE?</a>', '<a href="https://fallout.fandom.com/wiki/Arizona_Killer" target="_blank">ARIZONA KILLER</a>', '<a href="https://fallout.fandom.com/wiki/Veni,_Vidi,_Vici" target="_blank">VENI, VIDI, VICI</a>'],
        'SIDE QUESTS (MOJAVE)': ['<a href="https://fallout.fandom.com/wiki/A_Valuable_Lesson" target="_blank">A VALUABLE LESSON</a>', '<a href="https://fallout.fandom.com/wiki/Aba_Daba_Honeymoon" target="_blank">ABA DABA HONEYMOON</a>', '<a href="https://fallout.fandom.com/wiki/Ant_Misbehavin%27" target="_blank">ANT MISBEHAVIN\'</a>', '<a href="https://fallout.fandom.com/wiki/Anywhere_I_Wander" target="_blank">ANYWHERE I WANDER</a>', '<a href="https://fallout.fandom.com/wiki/Back_in_Your_Own_Backyard" target="_blank">BACK IN YOUR OWN BACKYARD</a>', '<a href="https://fallout.fandom.com/wiki/Beyond_the_Beef" target="_blank">BEYOND THE BEEF</a>', '<a href="https://fallout.fandom.com/wiki/Birds_of_a_Feather" target="_blank">BIRDS OF A FEATHER</a>', '<a href="https://fallout.fandom.com/wiki/Bitter_Springs_Infirmary_Blues" target="_blank">BITTER SPRINGS INFIRMARY BLUES</a>', '<a href="https://fallout.fandom.com/wiki/Booted" target="_blank">BOOTED</a>', '<a href="https://fallout.fandom.com/wiki/Boulder_City_Showdown" target="_blank">BOULDER CITY SHOWDOWN</a>', '<a href="https://fallout.fandom.com/wiki/Bye_Bye_Love" target="_blank">BYE BYE LOVE</a>', '<a href="https://fallout.fandom.com/wiki/Can_You_Find_it_in_Your_Heart%3F" target="_blank">CAN YOU FIND IT IN YOUR HEART?</a>', '<a href="https://fallout.fandom.com/wiki/Classic_Inspiration" target="_blank">CLASSIC INSPIRATION</a>', '<a href="https://fallout.fandom.com/wiki/Climb_Ev%27ry_Mountain" target="_blank">CLIMB EV\'RY MOUNTAIN</a>', '<a href="https://fallout.fandom.com/wiki/Come_Fly_With_Me" target="_blank">COME FLY WITH ME</a>', '<a href="https://fallout.fandom.com/wiki/Crazy,_Crazy,_Crazy" target="_blank">CRAZY, CRAZY, CRAZY</a>', '<a href="https://fallout.fandom.com/wiki/Cry_Me_a_River" target="_blank">CRY ME A RIVER</a>', '<a href="https://fallout.fandom.com/wiki/Debt_Collector" target="_blank">DEBT COLLECTOR</a>', '<a href="https://fallout.fandom.com/wiki/Don%27t_Make_a_Beggar_of_Me" target="_blank">DON\'T MAKE A BEGGAR OF ME</a>', '<a href="https://fallout.fandom.com/wiki/Eye_for_an_Eye" target="_blank">EYE FOR AN EYE</a>', '<a href="https://fallout.fandom.com/wiki/Eyesight_to_the_Blind" target="_blank">EYESIGHT TO THE BLIND</a>', '<a href="https://fallout.fandom.com/wiki/Flag_of_Our_Foul-Ups" target="_blank">FLAG OF OUR FOUL-UPS</a>', '<a href="https://fallout.fandom.com/wiki/G.I._Blues" target="_blank">G.I. BLUES</a>', '<a href="https://fallout.fandom.com/wiki/Ghost_Town_Gunfight" target="_blank">GHOST TOWN GUNFIGHT</a>', '<a href="https://fallout.fandom.com/wiki/Guess_Who_I_Saw_Today" target="_blank">GUESS WHO I SAW TODAY</a>', '<a href="https://fallout.fandom.com/wiki/Hard_Luck_Blues" target="_blank">HARD LUCK BLUES</a>', '<a href="https://fallout.fandom.com/wiki/High_Times" target="_blank">HIGH TIMES</a>', '<a href="https://fallout.fandom.com/wiki/How_Little_We_Know" target="_blank">HOW LITTLE WE KNOW</a>', '<a href="https://fallout.fandom.com/wiki/I_Don%27t_Hurt_Anymore" target="_blank">I DON\'T HURT ANYMORE</a>', '<a href="https://fallout.fandom.com/wiki/I_Put_a_Spell_on_You" target="_blank">I PUT A SPELL ON YOU</a>', '<a href="https://fallout.fandom.com/wiki/Keep_Your_Eyes_on_the_Prize" target="_blank">KEEP YOUR EYES ON THE PRIZE</a>', '<a href="https://fallout.fandom.com/wiki/Left_My_Heart" target="_blank">LEFT MY HEART</a>', '<a href="https://fallout.fandom.com/wiki/Medical_Mystery" target="_blank">MEDICAL MYSTERY</a>', '<a href="https://fallout.fandom.com/wiki/My_Kind_of_Town" target="_blank">MY KIND OF TOWN</a>', '<a href="https://fallout.fandom.com/wiki/No,_Not_Much" target="_blank">NO, NOT MUCH</a>', '<a href="https://fallout.fandom.com/wiki/Oh_My_Papa" target="_blank">OH MY PAPA</a>', '<a href="https://fallout.fandom.com/wiki/One_for_My_Baby" target="_blank">ONE FOR MY BABY</a>', '<a href="https://fallout.fandom.com/wiki/Pheeble_Will" target="_blank">PHEEBLE WILL</a>', '<a href="https://fallout.fandom.com/wiki/Pressing_Matters" target="_blank">PRESSING MATTERS</a>', '<a href="https://fallout.fandom.com/wiki/Restoring_Hope" target="_blank">RESTORING HOPE</a>', '<a href="https://fallout.fandom.com/wiki/Return_to_Sender" target="_blank">RETURN TO SENDER</a>', '<a href="https://fallout.fandom.com/wiki/Someone_to_Watch_Over_Me" target="_blank">SOMEONE TO WATCH OVER ME</a>', '<a href="https://fallout.fandom.com/wiki/Still_in_the_Dark" target="_blank">STILL IN THE DARK</a>', '<a href="https://fallout.fandom.com/wiki/Sunshine_Boogie" target="_blank">SUNSHINE BOOGIE</a>', '<a href="https://fallout.fandom.com/wiki/Talent_Pool" target="_blank">TALENT POOL</a>', '<a href="https://fallout.fandom.com/wiki/That_Lucky_Old_Sun" target="_blank">THAT LUCKY OLD SUN</a>', '<a href="https://fallout.fandom.com/wiki/The_Coyotes" target="_blank">THE COYOTES</a>', '<a href="https://fallout.fandom.com/wiki/The_Legend_of_the_Star" target="_blank">THE LEGEND OF THE STAR</a>', '<a href="https://fallout.fandom.com/wiki/The_Moon_Comes_Over_the_Tower" target="_blank">THE MOON COMES OVER THE TOWER</a>', '<a href="https://fallout.fandom.com/wiki/The_White_Wash" target="_blank">THE WHITE WASH</a>', '<a href="https://fallout.fandom.com/wiki/There_Stands_the_Grass" target="_blank">THERE STANDS THE GRASS</a>', '<a href="https://fallout.fandom.com/wiki/Three-Card_Bounty" target="_blank">THREE-CARD BOUNTY</a>', '<a href="https://fallout.fandom.com/wiki/Unfriendly_Persuasion" target="_blank">UNFRIENDLY PERSUASION</a>', '<a href="https://fallout.fandom.com/wiki/Volare!" target="_blank">VOLARE!</a>', '<a href="https://fallout.fandom.com/wiki/Wang_Dang_Atomic_Tango" target="_blank">WANG DANG ATOMIC TANGO</a>', '<a href="https://fallout.fandom.com/wiki/We_Will_All_Go_Together" target="_blank">WE WILL ALL GO TOGETHER</a>', '<a href="https://fallout.fandom.com/wiki/Wheel_of_Fortune" target="_blank">WHEEL OF FORTUNE</a>', '<a href="https://fallout.fandom.com/wiki/Why_Can%27t_We_Be_Friends%3F" target="_blank">WHY CAN\'T WE BE FRIENDS?</a>', '<a href="https://fallout.fandom.com/wiki/You_Can_Depend_on_Me" target="_blank">YOU CAN DEPEND ON ME</a>', '<a href="https://fallout.fandom.com/wiki/Young_Hearts" target="_blank">YOUNG HEARTS</a>'],
        'DLC: DEAD MONEY': ['<a href="https://fallout.fandom.com/wiki/Sierra_Madre_Grand_Opening!" target="_blank">SIERRA MADRE GRAND OPENING!</a>', '<a href="https://fallout.fandom.com/wiki/Find_Collar_8:_Dog" target="_blank">FIND COLLAR 8: DOG</a>', '<a href="https://fallout.fandom.com/wiki/Find_Collar_12:_Christine" target="_blank">FIND COLLAR 12: CHRISTINE</a>', '<a href="https://fallout.fandom.com/wiki/Find_Collar_14:_Dean_Domino" target="_blank">FIND COLLAR 14: DEAN DOMINO</a>', '<a href="https://fallout.fandom.com/wiki/Fires_in_the_Sky" target="_blank">FIRES IN THE SKY</a>', '<a href="https://fallout.fandom.com/wiki/Strike_Up_the_Band" target="_blank">STRIKE UP THE BAND</a>', '<a href="https://fallout.fandom.com/wiki/Trigger_the_Gala_Event" target="_blank">TRIGGER THE GALA EVENT</a>', '<a href="https://fallout.fandom.com/wiki/Curtain_Call_at_the_Tampico" target="_blank">CURTAIN CALL AT THE TAMPICO</a>', '<a href="https://fallout.fandom.com/wiki/Last_Luxuries" target="_blank">LAST LUXURIES</a>', '<a href="https://fallout.fandom.com/wiki/Heist_of_the_Centuries" target="_blank">HEIST OF THE CENTURIES</a>', '<a href="https://fallout.fandom.com/wiki/Departing_Paradise" target="_blank">DEPARTING PARADISE</a>'],
        'DLC: HONEST HEARTS': ['<a href="https://fallout.fandom.com/wiki/Happy_Trails_Expedition" target="_blank">HAPPY TRAILS EXPEDITION</a>', '<a href="https://fallout.fandom.com/wiki/Arrival_at_Zion" target="_blank">ARRIVAL AT ZION</a>', '<a href="https://fallout.fandom.com/wiki/Roadside_Attraction" target="_blank">ROADSIDE ATTRACTION</a>', '<a href="https://fallout.fandom.com/wiki/Gone_Fishin%27" target="_blank">GONE FISHIN\'</a>', '<a href="https://fallout.fandom.com/wiki/Tourist_Trap" target="_blank">TOURIST TRAP</a>', '<a href="https://fallout.fandom.com/wiki/Deliverer_of_Sorrows" target="_blank">DELIVERER OF SORROWS</a>', '<a href="https://fallout.fandom.com/wiki/The_Grand_Staircase" target="_blank">THE GRAND STAIRCASE</a>', '<a href="https://fallout.fandom.com/wiki/The_Advance_Scouts" target="_blank">THE ADVANCE SCOUTS</a>', '<a href="https://fallout.fandom.com/wiki/The_Treacherous_Road" target="_blank">THE TREACHEROUS ROAD</a>', '<a href="https://fallout.fandom.com/wiki/River_Monsters" target="_blank">RIVER MONSTERS</a>', '<a href="https://fallout.fandom.com/wiki/Gathering_Storms" target="_blank">GATHERING STORMS</a>', '<a href="https://fallout.fandom.com/wiki/Crush_the_White_Legs" target="_blank">CRUSH THE WHITE LEGS</a>'],
        'DLC: OLD WORLD BLUES': ['<a href="https://fallout.fandom.com/wiki/Midnight_Science_Fiction_Feature!" target="_blank">MIDNIGHT SCIENCE FICTION FEATURE!</a>', '<a href="https://fallout.fandom.com/wiki/Welcome_to_the_Big_Empty" target="_blank">WELCOME TO THE BIG EMPTY</a>', '<a href="https://fallout.fandom.com/wiki/All_My_Friends_Have_Off_Switches" target="_blank">ALL MY FRIENDS HAVE OFF SWITCHES</a>', '<a href="https://fallout.fandom.com/wiki/X-2:_Strange_Transmissions!" target="_blank">X-2: STRANGE TRANSMISSIONS!</a>', '<a href="https://fallout.fandom.com/wiki/X-8:_High_School_Horror!" target="_blank">X-8: HIGH SCHOOL HORROR!</a>', '<a href="https://fallout.fandom.com/wiki/X-13:_Attack_of_the_Infiltrator!" target="_blank">X-13: ATTACK OF THE INFILTRATOR!</a>', '<a href="https://fallout.fandom.com/wiki/Old_World_Blues_(quest)" target="_blank">OLD WORLD BLUES</a>', '<a href="https://fallout.fandom.com/wiki/Project_X-13" target="_blank">PROJECT X-13</a>'],
        'DLC: LONESOME ROAD': ['<a href="https://fallout.fandom.com/wiki/The_Reunion" target="_blank">THE REUNION</a>', '<a href="https://fallout.fandom.com/wiki/The_Silo" target="_blank">THE SILO</a>', '<a href="https://fallout.fandom.com/wiki/The_Job" target="_blank">THE JOB</a>', '<a href="https://fallout.fandom.com/wiki/The_Launch" target="_blank">THE LAUNCH</a>', '<a href="https://fallout.fandom.com/wiki/The_Divide" target="_blank">THE DIVIDE</a>', '<a href="https://fallout.fandom.com/wiki/The_Tunnelers" target="_blank">THE TUNNELERS</a>', '<a href="https://fallout.fandom.com/wiki/The_Courier" target="_blank">THE COURIER</a>', '<a href="https://fallout.fandom.com/wiki/The_End_(quest)" target="_blank">THE END</a>', '<a href="https://fallout.fandom.com/wiki/The_Apocalypse" target="_blank">THE APOCALYPSE</a>']
    }
};

/* --- DATA: UNIQUES --- */
const uniqueWeaponData = {
    "PISTOLS & REVOLVERS": ["<a href='https://fallout.fandom.com/wiki/A_Light_Shining_in_Darkness' target='_blank'>A LIGHT SHINING IN DARKNESS</a>", "<a href='https://fallout.fandom.com/wiki/Blackhawk' target='_blank'>BLACKHAWK</a>", "<a href='https://fallout.fandom.com/wiki/Callahan%27s_magnum' target='_blank'>CALLAHAN'S MAGNUM</a>", "<a href='https://fallout.fandom.com/wiki/Colonel_Autumn%27s_10mm_pistol' target='_blank'>COLONEL AUTUMN'S 10MM PISTOL</a>", "<a href='https://fallout.fandom.com/wiki/Li%27l_Devil' target='_blank'>LI'L DEVIL</a>", "<a href='https://fallout.fandom.com/wiki/Lucky' target='_blank'>LUCKY</a>", "<a href='https://fallout.fandom.com/wiki/Maria' target='_blank'>MARIA</a>", "<a href='https://fallout.fandom.com/wiki/Mysterious_Magnum' target='_blank'>MYSTERIOUS MAGNUM</a>", "<a href='https://fallout.fandom.com/wiki/Paulson%27s_revolver' target='_blank'>PAULSON'S REVOLVER</a>", "<a href='https://fallout.fandom.com/wiki/Ranger_Sequoia' target='_blank'>RANGER SEQUOIA</a>", "<a href='https://fallout.fandom.com/wiki/That_Gun' target='_blank'>THAT GUN</a>", "<a href='https://fallout.fandom.com/wiki/Weathered_10mm_pistol' target='_blank'>WEATHERED 10MM PISTOL</a>", "<a href='https://fallout.fandom.com/wiki/Wild_Bill%27s_Sidearm' target='_blank'>WILD BILL'S SIDEARM</a>", "<a href='https://fallout.fandom.com/wiki/Zhu-Rong_v418_Chinese_pistol' target='_blank'>ZHU-RONG V418 CHINESE PISTOL</a>"],
    "SMGS & RIFLES": ["<a href='https://fallout.fandom.com/wiki/Abilene_Kid_LE_BB_gun' target='_blank'>ABILENE KID LE BB GUN</a>", "<a href='https://fallout.fandom.com/wiki/All-American' target='_blank'>ALL-AMERICAN</a>", "<a href='https://fallout.fandom.com/wiki/Backwater_rifle' target='_blank'>BACKWATER RIFLE</a>", "<a href='https://fallout.fandom.com/wiki/Christine%27s_CoS_silencer_rifle' target='_blank'>CHRISTINE'S COS SILENCER RIFLE</a>", "<a href='https://fallout.fandom.com/wiki/Gobi_Campaign_scout_rifle' target='_blank'>GOBI CAMPAIGN SCOUT RIFLE</a>", "<a href='https://fallout.fandom.com/wiki/Infiltrator' target='_blank'>INFILTRATOR</a>", "<a href='https://fallout.fandom.com/wiki/La_Longue_Carabine' target='_blank'>LA LONGUE CARABINE</a>", "<a href='https://fallout.fandom.com/wiki/Lincoln%27s_repeater' target='_blank'>LINCOLN'S REPEATER</a>", "<a href='https://fallout.fandom.com/wiki/Medicine_Stick' target='_blank'>MEDICINE STICK</a>", "<a href='https://fallout.fandom.com/wiki/Ol%27_Painless' target='_blank'>OL' PAINLESS</a>", "<a href='https://fallout.fandom.com/wiki/Paciencia' target='_blank'>PACIENCIA</a>", "<a href='https://fallout.fandom.com/wiki/Perforator' target='_blank'>PERFORATOR</a>", "<a href='https://fallout.fandom.com/wiki/Ratslayer' target='_blank'>RATSLAYER</a>", "<a href='https://fallout.fandom.com/wiki/Reservist%27s_rifle' target='_blank'>RESERVIST'S RIFLE</a>", "<a href='https://fallout.fandom.com/wiki/Sleepytyme' target='_blank'>SLEEPYTYME</a>", "<a href='https://fallout.fandom.com/wiki/Survivalist%27s_rifle' target='_blank'>SURVIVALIST'S RIFLE</a>", "<a href='https://fallout.fandom.com/wiki/Sydney%27s_10mm_%22Ultra%22_SMG' target='_blank'>SYDNEY'S 10MM \"ULTRA\" SMG</a>", "<a href='https://fallout.fandom.com/wiki/This_Machine' target='_blank'>THIS MACHINE</a>", "<a href='https://fallout.fandom.com/wiki/Vance%27s_9mm_SMG' target='_blank'>VANCE'S 9MM SMG</a>", "<a href='https://fallout.fandom.com/wiki/Victory_rifle' target='_blank'>VICTORY RIFLE</a>", "<a href='https://fallout.fandom.com/wiki/Wanda_(weapon)' target='_blank'>WANDA</a>", "<a href='https://fallout.fandom.com/wiki/Xuanlong_assault_rifle' target='_blank'>XUANLONG ASSAULT RIFLE</a>"],
    "SHOTGUNS": ["<a href='https://fallout.fandom.com/wiki/Big_Boomer' target='_blank'>BIG BOOMER</a>", "<a href='https://fallout.fandom.com/wiki/Dinner_Bell' target='_blank'>DINNER BELL</a>", "<a href='https://fallout.fandom.com/wiki/Sturdy_caravan_shotgun' target='_blank'>STURDY CARAVAN SHOTGUN</a>", "<a href='https://fallout.fandom.com/wiki/The_Kneecapper' target='_blank'>THE KNEECAPPER</a>", "<a href='https://fallout.fandom.com/wiki/The_Terrible_Shotgun' target='_blank'>THE TERRIBLE SHOTGUN</a>"],
    "BIG GUNS": ["<a href='https://fallout.fandom.com/wiki/Bozar_(Fallout:_New_Vegas)' target='_blank'>BOZAR</a>", "<a href='https://fallout.fandom.com/wiki/Burnmaster' target='_blank'>BURNMASTER</a>", "<a href='https://fallout.fandom.com/wiki/CZ57_Avenger' target='_blank'>CZ57 AVENGER</a>", "<a href='https://fallout.fandom.com/wiki/Drone_cannon_Ex-B' target='_blank'>DRONE CANNON EX-B</a>", "<a href='https://fallout.fandom.com/wiki/Eugene' target='_blank'>EUGENE</a>", "<a href='https://fallout.fandom.com/wiki/Experimental_MIRV' target='_blank'>EXPERIMENTAL MIRV</a>", "<a href='https://fallout.fandom.com/wiki/Precision_Gatling_laser' target='_blank'>PRECISION GATLING LASER</a>", "<a href='https://fallout.fandom.com/wiki/Rapid-torch_flamer' target='_blank'>RAPID-TORCH FLAMER</a>", "<a href='https://fallout.fandom.com/wiki/Slo-burn_flamer' target='_blank'>SLO-BURN FLAMER</a>", "<a href='https://fallout.fandom.com/wiki/Vengeance' target='_blank'>VENGEANCE</a>"],
    "ENERGY WEAPONS": ["<a href='https://fallout.fandom.com/wiki/A3-21%27s_plasma_rifle' target='_blank'>A3-21'S PLASMA RIFLE</a>", "<a href='https://fallout.fandom.com/wiki/AER14_prototype' target='_blank'>AER14 PROTOTYPE</a>", "<a href='https://fallout.fandom.com/wiki/Alien_blaster_(Fallout_3)' target='_blank'>ALIEN BLASTER</a>", "<a href='https://fallout.fandom.com/wiki/Atomic_pulverizer' target='_blank'>ATOMIC PULVERIZER</a>", "<a href='https://fallout.fandom.com/wiki/Captain%27s_sidearm' target='_blank'>CAPTAIN'S SIDEARM</a>", "<a href='https://fallout.fandom.com/wiki/Cleansing_Flame' target='_blank'>CLEANSING FLAME</a>", "<a href='https://fallout.fandom.com/wiki/Colonel_Autumn%27s_laser_pistol' target='_blank'>COLONEL AUTUMN'S LASER PISTOL</a>", "<a href='https://fallout.fandom.com/wiki/Compliance_Regulator' target='_blank'>COMPLIANCE REGULATOR</a>", "<a href='https://fallout.fandom.com/wiki/Destabilizer' target='_blank'>DESTABILIZER</a>", "<a href='https://fallout.fandom.com/wiki/Elijah%27s_advanced_LAER' target='_blank'>ELIJAH'S ADVANCED LAER</a>", "<a href='https://fallout.fandom.com/wiki/Elijah%27s_jury-rigged_Tesla_cannon' target='_blank'>ELIJAH'S JURY-RIGGED TESLA CANNON</a>", "<a href='https://fallout.fandom.com/wiki/Euclid%27s_C-Finder' target='_blank'>EUCLID'S C-FINDER</a>", "<a href='https://fallout.fandom.com/wiki/Firelance' target='_blank'>FIRELANCE</a>", "<a href='https://fallout.fandom.com/wiki/Gauss_rifle_(Fallout_3)' target='_blank'>GAUSS RIFLE</a>", "<a href='https://fallout.fandom.com/wiki/Holorifle' target='_blank'>HOLORIFLE</a>", "<a href='https://fallout.fandom.com/wiki/Mesmetron' target='_blank'>MESMETRON</a>", "<a href='https://fallout.fandom.com/wiki/Metal_Blaster' target='_blank'>METAL BLASTER</a>", "<a href='https://fallout.fandom.com/wiki/MF_Hyperbreeder_Alpha' target='_blank'>MF HYPERBREEDER ALPHA</a>", "<a href='https://fallout.fandom.com/wiki/Microwave_emitter' target='_blank'>MICROWAVE EMITTER</a>", "<a href='https://fallout.fandom.com/wiki/Missing_laser_pistol' target='_blank'>MISSING LASER PISTOL</a>", "<a href='https://fallout.fandom.com/wiki/MPLX_Novasurge' target='_blank'>MPLX NOVASURGE</a>", "<a href='https://fallout.fandom.com/wiki/Pew_Pew' target='_blank'>PEW PEW</a>", "<a href='https://fallout.fandom.com/wiki/Protectron%27s_Gaze' target='_blank'>PROTECTRON'S GAZE</a>", "<a href='https://fallout.fandom.com/wiki/Pulse_gun' target='_blank'>PULSE GUN</a>", "<a href='https://fallout.fandom.com/wiki/Q-35_matter_modulator' target='_blank'>Q-35 MATTER MODULATOR</a>", "<a href='https://fallout.fandom.com/wiki/Smuggler%27s_End' target='_blank'>SMUGGLER'S END</a>", "<a href='https://fallout.fandom.com/wiki/Sprtel-Wood_9700' target='_blank'>SPRTEL-WOOD 9700</a>", "<a href='https://fallout.fandom.com/wiki/Tesla-Beaton_prototype' target='_blank'>TESLA-BEATON PROTOTYPE</a>", "<a href='https://fallout.fandom.com/wiki/The_Smitty_Special' target='_blank'>THE SMITTY SPECIAL</a>", "<a href='https://fallout.fandom.com/wiki/Wazer_Wifle' target='_blank'>WAZER WIFLE</a>", "<a href='https://fallout.fandom.com/wiki/YCS/186' target='_blank'>YCS/186</a>"],
    "EXPLOSIVES": ["<a href='https://fallout.fandom.com/wiki/Annabelle' target='_blank'>ANNABELLE</a>", "<a href='https://fallout.fandom.com/wiki/Esther' target='_blank'>ESTHER</a>", "<a href='https://fallout.fandom.com/wiki/Great_Bear_grenade_rifle' target='_blank'>GREAT BEAR GRENADE RIFLE</a>", "<a href='https://fallout.fandom.com/wiki/Holy_Frag_Grenade' target='_blank'>HOLY FRAG GRENADE</a>", "<a href='https://fallout.fandom.com/wiki/Mercenary%27s_grenade_rifle' target='_blank'>MERCENARY'S GRENADE RIFLE</a>", "<a href='https://fallout.fandom.com/wiki/Mercy' target='_blank'>MERCY</a>", "<a href='https://fallout.fandom.com/wiki/Miss_Launcher' target='_blank'>MISS LAUNCHER</a>", "<a href='https://fallout.fandom.com/wiki/Red_Victory_grenade_rifle' target='_blank'>RED VICTORY GRENADE RIFLE</a>", "<a href='https://fallout.fandom.com/wiki/Thump-Thump' target='_blank'>THUMP-THUMP</a>"],
    "MELEE WEAPONS": ["<a href='https://fallout.fandom.com/wiki/Ant%27s_Sting' target='_blank'>ANT'S STING</a>", "<a href='https://fallout.fandom.com/wiki/Blade_of_the_East' target='_blank'>BLADE OF THE EAST</a>", "<a href='https://fallout.fandom.com/wiki/Blood-Nap' target='_blank'>BLOOD-NAP</a>", "<a href='https://fallout.fandom.com/wiki/Board_of_Education' target='_blank'>BOARD OF EDUCATION</a>", "<a href='https://fallout.fandom.com/wiki/Broad_machete' target='_blank'>BROAD MACHETE</a>", "<a href='https://fallout.fandom.com/wiki/Butch%27s_Toothpick' target='_blank'>BUTCH'S TOOTHPICK</a>", "<a href='https://fallout.fandom.com/wiki/Chance%27s_knife' target='_blank'>CHANCE'S KNIFE</a>", "<a href='https://fallout.fandom.com/wiki/Chopper' target='_blank'>CHOPPER</a>", "<a href='https://fallout.fandom.com/wiki/Electro-Suppressor' target='_blank'>ELECTRO-SUPPRESSOR</a>", "<a href='https://fallout.fandom.com/wiki/Fawkes%27_super_sledge' target='_blank'>FAWKES' SUPER SLEDGE</a>", "<a href='https://fallout.fandom.com/wiki/Fertilizer_shovel' target='_blank'>FERTILIZER SHOVEL</a>", "<a href='https://fallout.fandom.com/wiki/Figaro' target='_blank'>FIGARO</a>", "<a href='https://fallout.fandom.com/wiki/Gehenna' target='_blank'>GEHENNA</a>", "<a href='https://fallout.fandom.com/wiki/Highwayman%27s_Friend' target='_blank'>HIGHWAYMAN'S FRIEND</a>", "<a href='https://fallout.fandom.com/wiki/Jack_(Fallout_3)' target='_blank'>JACK</a>", "<a href='https://fallout.fandom.com/wiki/Jingwei%27s_shock_sword' target='_blank'>JINGWEI'S SHOCKSWORD</a>", "<a href='https://fallout.fandom.com/wiki/Knock-Knock' target='_blank'>KNOCK-KNOCK</a>", "<a href='https://fallout.fandom.com/wiki/Liberator' target='_blank'>LIBERATOR</a>", "<a href='https://fallout.fandom.com/wiki/Man_Opener' target='_blank'>MAN OPENER</a>", "<a href='https://fallout.fandom.com/wiki/Nephi%27s_golf_driver' target='_blank'>NEPHI'S GOLF DRIVER</a>", "<a href='https://fallout.fandom.com/wiki/Nuka-Breaker' target='_blank'>NUKA-BREAKER</a>", "<a href='https://fallout.fandom.com/wiki/Occam%27s_Razor' target='_blank'>OCCAM'S RAZOR</a>", "<a href='https://fallout.fandom.com/wiki/Oh,_Baby!' target='_blank'>OH, BABY!</a>", "<a href='https://fallout.fandom.com/wiki/Old_Glory' target='_blank'>OLD GLORY</a>", "<a href='https://fallout.fandom.com/wiki/Repellent_stick' target='_blank'>REPELLENT STICK</a>", "<a href='https://fallout.fandom.com/wiki/Ritual_knife' target='_blank'>RITUAL KNIFE</a>", "<a href='https://fallout.fandom.com/wiki/Samurai%27s_sword' target='_blank'>SAMURAI'S SWORD</a>", "<a href='https://fallout.fandom.com/wiki/Stabhappy' target='_blank'>STABHAPPY</a>", "<a href='https://fallout.fandom.com/wiki/The_Break' target='_blank'>THE BREAK</a>", "<a href='https://fallout.fandom.com/wiki/The_Dismemberer' target='_blank'>THE DISMEMBERER</a>", "<a href='https://fallout.fandom.com/wiki/The_Humble_Cudgel' target='_blank'>THE HUMBLE CUDGEL</a>", "<a href='https://fallout.fandom.com/wiki/The_Mauler' target='_blank'>THE MAULER</a>", "<a href='https://fallout.fandom.com/wiki/The_Tenderizer' target='_blank'>THE TENDERIZER</a>", "<a href='https://fallout.fandom.com/wiki/Toy_knife' target='_blank'>TOY KNIFE</a>", "<a href='https://fallout.fandom.com/wiki/Trench_knife' target='_blank'>TRENCH KNIFE</a>", "<a href='https://fallout.fandom.com/wiki/Vampire%27s_Edge' target='_blank'>VAMPIRE'S EDGE</a>", "<a href='https://fallout.fandom.com/wiki/X-2_antenna' target='_blank'>X-2 ANTENNA</a>"],
    "UNARMED": ["<a href='https://fallout.fandom.com/wiki/Cram_Opener' target='_blank'>CRAM OPENER</a>", "<a href='https://fallout.fandom.com/wiki/Dr._Klein%27s_glove' target='_blank'>DR. KLEIN'S GLOVE</a>", "<a href='https://fallout.fandom.com/wiki/Dr._Mobius%27_glove' target='_blank'>DR. MOBIUS' GLOVE</a>", "<a href='https://fallout.fandom.com/wiki/Embrace_of_the_Mantis_King!' target='_blank'>EMBRACE OF THE MANTIS KING!</a>", "<a href='https://fallout.fandom.com/wiki/Fist_of_Rawr' target='_blank'>FIST OF RAWR</a>", "<a href='https://fallout.fandom.com/wiki/Fisto!' target='_blank'>FISTO!</a>", "<a href='https://fallout.fandom.com/wiki/Golden_Gloves' target='_blank'>GOLDEN GLOVES</a>", "<a href='https://fallout.fandom.com/wiki/Greased_Lightning_(Gun_Runners%27_Arsenal)' target='_blank'>GREASED LIGHTNING</a>", "<a href='https://fallout.fandom.com/wiki/Love_and_Hate' target='_blank'>LOVE AND HATE</a>", "<a href='https://fallout.fandom.com/wiki/Paladin_Toaster' target='_blank'>PALADIN TOASTER</a>", "<a href='https://fallout.fandom.com/wiki/Plunkett%27s_Valid_Points' target='_blank'>PLUNKETT'S VALID POINTS</a>", "<a href='https://fallout.fandom.com/wiki/Pushy' target='_blank'>PUSHY</a>", "<a href='https://fallout.fandom.com/wiki/Recompense_of_the_Fallen' target='_blank'>RECOMPENSE OF THE FALLEN</a>", "<a href='https://fallout.fandom.com/wiki/Salt-Upon-Wounds%27_power_fist' target='_blank'>SALT-UPON-WOUNDS' POWER FIST</a>", "<a href='https://fallout.fandom.com/wiki/She%27s_Embrace' target='_blank'>SHE'S EMBRACE</a>", "<a href='https://fallout.fandom.com/wiki/The_Shocker' target='_blank'>THE SHOCKER</a>", "<a href='https://fallout.fandom.com/wiki/Two-Step_Goodbye' target='_blank'>TWO-STEP GOODBYE</a>"]
};

/* ===== XSS SANITIZATION ===== */
function sanitizeStr(s) {
    if (typeof s !== 'string') return '';
    return s
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/javascript\s*:/gi, '')
        .replace(/on\w+\s*=/gi, '')
        .replace(/<[^>]+>/g, '')
        .substring(0, 3000);
}

function sanitizeImport(d) {
    if (!d || typeof d !== 'object') return null;
    const clean = {};
    clean.name = sanitizeStr(d.name || '');
    clean.notes = sanitizeStr(d.notes || '');
    clean.mode = ['std', 'hc'].includes(d.mode) ? d.mode : 'std';
    clean.origin = ['CW', 'MW'].includes(d.origin) ? d.origin : 'CW';
    clean.special = {};
    sKeys.forEach(k => {
        const v = parseInt(d.special?.[k]);
        clean.special[k] = (!isNaN(v) && v >= 1 && v <= 10) ? v : 5;
    });
    ['tags', 'quests', 'colls', 'uniWpns', 'uniArmor'].forEach(key => {
        clean[key] = Array.isArray(d[key]) ? d[key].map(v => !!v) : [];
    });
    clean.traits = Array.isArray(d.traits) ? d.traits.map(v => sanitizeStr(v || '')).slice(0, 20) : [];
    clean.implantsTaken = (d.implantsTaken && typeof d.implantsTaken === 'object') ? Object.fromEntries(Object.entries(d.implantsTaken).filter(([k,v]) => typeof k === 'string' && typeof v === 'boolean')) : {};
    clean.rewardPerksList = Array.isArray(d.rewardPerksList) ? d.rewardPerksList.slice(0,100).map(rp => ({ name: sanitizeStr(rp.name||''), notes: sanitizeStr(rp.notes||'') })) : [];
    clean.internalizedTraitsList = Array.isArray(d.internalizedTraitsList) ? d.internalizedTraitsList.slice(0,50).map(it => ({ name: sanitizeStr(it.name||''), notes: sanitizeStr(it.notes||'') })) : [];
    clean.perks = Array.isArray(d.perks) ? d.perks.map(arr =>
        Array.isArray(arr) ? arr.map(v => sanitizeStr(v || '')) : ['', '']
    ) : [];
    clean.extraPerks = Array.isArray(d.extraPerks) ? d.extraPerks.map(arr =>
        Array.isArray(arr) ? arr.map(v => sanitizeStr(v || '')) : ['', '']
    ).slice(0, 50) : [];
    clean.weapons = Array.isArray(d.weapons) ? d.weapons.map(arr =>
        Array.isArray(arr) ? arr.map(v => sanitizeStr(v || '')) : ['', '', '']
    ).slice(0, 20) : [];
    clean.armor = Array.isArray(d.armor) ? d.armor.map(arr => {
        const slot = ['LIGHT', 'MEDIUM', 'HEAVY', 'POWER ARMOR'].includes(arr?.[2]) ? arr[2] : 'LIGHT';
        return [sanitizeStr(arr?.[0] || ''), sanitizeStr(arr?.[1] || ''), slot];
    }).slice(0, 20) : [];
    if (d.regionalStorage && typeof d.regionalStorage === 'object') {
        clean.regionalStorage = {
            'CW': {
                quests: Array.isArray(d.regionalStorage['CW']?.quests) ? d.regionalStorage['CW'].quests.map(v => !!v) : [],
                colls: Array.isArray(d.regionalStorage['CW']?.colls) ? d.regionalStorage['CW'].colls.map(v => !!v) : []
            },
            'MW': {
                quests: Array.isArray(d.regionalStorage['MW']?.quests) ? d.regionalStorage['MW'].quests.map(v => !!v) : [],
                colls: Array.isArray(d.regionalStorage['MW']?.colls) ? d.regionalStorage['MW'].colls.map(v => !!v) : []
            }
        };
    } else {
        clean.regionalStorage = { 'CW': { quests: [], colls: [] }, 'MW': { quests: [], colls: [] } };
    }
    // Skill points and character level
    clean.skillPoints = {};
    skills.forEach(s => {
        const v = parseInt(d.skillPoints?.[s]);
        clean.skillPoints[s] = (!isNaN(v) && v >= 0 && v <= 100) ? v : 0;
    });
    clean.charLevel = (typeof d.charLevel === 'number' && d.charLevel >= 1 && d.charLevel <= 50) ? Math.floor(d.charLevel) : 1;
    clean.skillHistory = Array.isArray(d.skillHistory) ? d.skillHistory.slice(0, 50).map(e => ({
        level: typeof e.level === 'number' ? e.level : 1,
        allocation: (e.allocation && typeof e.allocation === 'object') ? Object.fromEntries(skills.map(s => [s, typeof e.allocation[s] === 'number' ? e.allocation[s] : 0])) : {},
        gains: (e.gains && typeof e.gains === 'object') ? Object.fromEntries(skills.map(s => [s, typeof e.gains[s] === 'number' ? e.gains[s] : 0])) : {},
        tagged: Array.isArray(e.tagged) ? e.tagged.filter(s => skills.includes(s)) : [],
        pointsTotal: typeof e.pointsTotal === 'number' ? e.pointsTotal : 0
    })) : [];
    return clean;
}

/* ===== TAB CONTROLLER ===== */
function showTab(t) {
    document.querySelectorAll('.tab-content').forEach(c => c.style.display='none');
    document.querySelectorAll('.tab-nav button').forEach(b => b.classList.remove('active'));
    document.getElementById('tab-'+t).style.display='block';
    document.getElementById('tab-btn-'+t).classList.add('active');
    if (t === 'perks') renderAllPerks();
    if (t === 'skilllog') renderSkillLog();
    if (t === 'prog') renderImplants();
}

/* ===== MODE & ORIGIN TOGGLES ===== */
function setMode(m, skipSave=false) {
    // Save current perk entries before wiping the list
    const prevPerks = Array.from(document.querySelectorAll('#prog-list .prog-row:not(.trait-slot-row)')).map(r => [
        r.querySelector('.prog-name-input')?.value || '',
        r.querySelector('.prog-notes-input')?.value || ''
    ]);
    mode = m; document.body.classList.toggle('mode-hc', m==='hc');
    document.getElementById('hc-banner').style.display = m==='hc' ? 'flex' : 'none';
    document.getElementById('sysop-note').style.display = m==='hc' ? 'block' : 'none';
    document.getElementById('m-std').classList.toggle('active', m==='std');
    document.getElementById('m-hc').classList.toggle('active', m==='hc');
    // Reset add-trait button opacity when switching modes
    const addBtn = document.querySelector('.cs-start-trait-btn');
    if (addBtn) addBtn.style.opacity = '';
    renderStartingTraitsList();
    renderProgression();
    // Restore as many perks as will fit in the new layout
    if (!skipSave && prevPerks.some(p => p[0])) {
        const newRows = document.querySelectorAll('#prog-list .prog-row:not(.trait-slot-row)');
        prevPerks.forEach((v, i) => {
            if (newRows[i] && v[0]) {
                tryHydratePerkRow(newRows[i], v[0]);
                const ni = newRows[i].querySelector('.prog-notes-input'); if(ni) ni.value = v[1] || '';
            }
        });
    }
    updateAll();
    if(!skipSave) triggerAutosave();
}

function setOrigin(o, skipSave=false) {
    if (!skipSave) {
        regionalStorage[origin].quests = Array.from(document.querySelectorAll('#quest-list-container input')).map(i => i.checked);
        regionalStorage[origin].colls = Array.from(document.querySelectorAll('#coll-list input')).map(i => i.checked);
    }
    origin = o;
    document.body.className = (o === 'MW') ? 'theme-mw' : 'theme-cw';
    if(mode==='hc') document.body.classList.add('mode-hc');
    document.getElementById('btn-cw').classList.toggle('active', o==='CW');
    document.getElementById('btn-mw').classList.toggle('active', o==='MW');
    renderQuests();
    renderCollectibles();
    const qC = document.querySelectorAll('#quest-list-container input');
    regionalStorage[origin].quests.forEach((c, i) => { if(qC[i]) { qC[i].checked = c; updateUniqueMarker(qC[i]); } });
    const cC = document.querySelectorAll('#coll-list input');
    regionalStorage[origin].colls.forEach((c, i) => { if(cC[i]) { cC[i].checked = c; updateUniqueMarker(cC[i]); } });
    document.querySelectorAll('.header-row').forEach(h => {
        const id = h.id.replace('h-', '');
        calcCat(id);
    });
    updateAll();
    if(!skipSave) triggerAutosave();
}

/* ===== COLLAPSE LOGIC ===== */
function toggleCollapse(id) {
    const grid = document.querySelector(`.grid-tidy[data-category="${id}"]`);
    if (grid) grid.style.display = (grid.style.display === 'none') ? 'grid' : 'none';
}

/* ===== SEARCH LOGIC ===== */
function searchItems(inputId, containerId) {
    const query = document.getElementById(inputId).value.toUpperCase();
    const items = document.querySelectorAll(`#${containerId} .grid-item`);
    items.forEach(item => {
        item.style.display = item.innerText.toUpperCase().includes(query) ? 'flex' : 'none';
    });
    document.querySelectorAll(`#${containerId} .grid-tidy`).forEach(grid => {
        const visibleCount = Array.from(grid.querySelectorAll('.grid-item')).filter(i => i.style.display !== 'none').length;
        const categoryId = grid.getAttribute('data-category');
        const header = document.getElementById(`h-${categoryId}`);
        if (query !== "" && visibleCount > 0) { grid.style.display = 'grid'; header.style.display = 'flex'; }
        else if (query !== "" && visibleCount === 0) { grid.style.display = 'none'; header.style.display = 'none'; }
        else { header.style.display = 'flex'; }
    });
}

function searchQuests() { searchItems('quest-search-bar', 'quest-list-container'); }
function searchUniques() { searchItems('uni-search-bar', 'unique-weapon-checklist'); }

/* ===== ALL PERKS TAB: SORT & RENDER ===== */
function getPerkLevel(perk) {
    const m = perk.req.match(/Level\s+(\d+)/i);
    return m ? parseInt(m[1]) : 0;
}

function getPerkSPECIAL(perk) {
    const order = ['STR','PER','END','CHA','INT','AGI','LCK'];
    const m = perk.req.match(/\b(STR|PER|END|CHA|INT|AGI|LCK)\b/);
    if (!m) return 99;
    return order.indexOf(m[1]);
}

function setSort(s) {
    currentSort = s;
    document.querySelectorAll('.sort-btn').forEach(b => b.classList.remove('active'));
    document.getElementById('sort-'+s).classList.add('active');
    renderAllPerks();
}

function toggleEligibleFilter() {
    showEligibleOnly = !showEligibleOnly;
    document.getElementById('toggle-eligible').classList.toggle('active', showEligibleOnly);
    renderAllPerks();
}

function renderAllPerks() {
    const query = (document.getElementById('perk-search-bar')?.value || '').toUpperCase().trim();
    let perks = PERKS_DATA.filter(p =>
        !query || p.name.toUpperCase().includes(query) || p.req.toUpperCase().includes(query) || p.desc.toUpperCase().includes(query)
    );

    if (showEligibleOnly) perks = perks.filter(p => meetsRequirements(p));

    if (currentSort === 'az') {
        perks = [...perks].sort((a, b) => a.name.localeCompare(b.name));
    } else if (currentSort === 'lvl') {
        perks = [...perks].sort((a, b) => getPerkLevel(a) - getPerkLevel(b) || a.name.localeCompare(b.name));
    } else if (currentSort === 'spec') {
        perks = [...perks].sort((a, b) => getPerkSPECIAL(a) - getPerkSPECIAL(b) || a.name.localeCompare(b.name));
    }

    const container = document.getElementById('all-perks-list');
    container.innerHTML = '';
    if (perks.length === 0) {
        container.innerHTML = '<div style="opacity:0.5; padding:20px; text-align:center;">NO PERKS MATCH QUERY</div>';
        return;
    }

    if (currentSort === 'spec') {
        const groups = {};
        const specNames = ['STR — STRENGTH','PER — PERCEPTION','END — ENDURANCE','CHA — CHARISMA','INT — INTELLIGENCE','AGI — AGILITY','LCK — LUCK','NO SPECIAL REQ.'];
        perks.forEach(p => {
            const idx = getPerkSPECIAL(p);
            const key = idx >= 7 ? 7 : idx;
            if (!groups[key]) groups[key] = [];
            groups[key].push(p);
        });
        Object.keys(groups).sort((a,b)=>a-b).forEach(k => {
            const label = specNames[parseInt(k)] || 'OTHER';
            container.insertAdjacentHTML('beforeend', `<div style="background:var(--pip-color);color:black;font-weight:bold;padding:4px 8px;font-size:0.75rem;margin-bottom:5px;margin-top:10px;">${label}</div>`);
            groups[k].forEach(p => container.insertAdjacentHTML('beforeend', buildPerkCard(p)));
        });
    } else {
        perks.forEach(p => container.insertAdjacentHTML('beforeend', buildPerkCard(p)));
    }
}

function buildPerkCard(p) {
    const eligible = meetsRequirements(p);
    const isIT = p.name.trim().toUpperCase() === 'INTENSE TRAINING';
    const multiRank = p.ranks > 1;
    const rankBadgeClass = multiRank ? 'perk-rank-badge multi' : 'perk-rank-badge';
    const rankLabel = multiRank ? `★ ${p.ranks} RANKS` : `1 RANK`;
    const addBtnLabel = isIT ? '+ ADD TO BUILD (PICK SPECIAL)' : '+ ADD TO BUILD';
    const escapedName = p.name.replace(/'/g, "\\'");
    const escapedReq = p.req.replace(/'/g, "\\'");
    const cardClass = eligible ? 'perk-card' : 'perk-card perk-ineligible';

    // Show what's missing
    const missingLines = [];
    if (!eligible) {
        const lvlM = p.req.match(/Level\s+(\d+)/i);
        if (lvlM && charLevel < parseInt(lvlM[1])) missingLines.push(`LVL ${lvlM[1]} REQUIRED (HAVE ${charLevel})`);
        for (const chunk of p.req.split(',').map(s=>s.trim())) {
            if (/^Level\s/i.test(chunk)) continue;
            const anyMet = chunk.split(/\s+or\s+/i).some(part => parsePartMet(part));
            if (!anyMet) missingLines.push(chunk);
        }
    }

    return `<div class="${cardClass}">
        <div class="perk-card-header">
            <h3>${p.name}</h3>
            <span class="${rankBadgeClass}">${rankLabel}</span>
            ${eligible ? '<span class="perk-eligible-badge">✓ ELIGIBLE</span>' : ''}
        </div>
        <div class="perk-req">REQ: ${p.req}</div>
        ${!eligible && missingLines.length ? `<div class="perk-missing">${missingLines.map(l=>`<span>${l}</span>`).join('')}</div>` : ''}
        <div class="perk-desc">${p.desc}</div>
        <div class="perk-card-actions">
            <button class="action-btn" onclick="addPerkToBuild('${escapedName}','${escapedReq}',${isIT})">${addBtnLabel}</button>
            <button class="action-btn perk-zoom-action" title="EXPAND DESCRIPTION" onclick="openPerkZoom('${escapedName}','${p.req.replace(/'/g,"\\'")}','${p.desc.replace(/'/g,"\\'")}')">⊕ ZOOM</button>
        </div>
    </div>`;
}

function addPerkToBuild(name, req, isIT) {
    if (isIT) { openITModal(name, req); return; }
    // Skip trait-slot-rows - only use real perk rows
    const rows = document.querySelectorAll('#prog-list .prog-row:not(.trait-slot-row)');
    for (const row of rows) {
        const nameInput = row.querySelector('.prog-name-input');
        if (nameInput && !nameInput.value.trim()) {
            selectPerkInRow(row, name);
            showPerkToast(name);
            return;
        }
    }
    addExtraPerk();
    const extras = document.querySelectorAll('#extra-perk-list .prog-row');
    const last = extras[extras.length - 1];
    if (last) selectPerkInRow(last, name);
    showPerkToast(name);
}

function showPerkToast(name) {
    let toast = document.getElementById('perk-added-toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'perk-added-toast';
        toast.style.cssText = 'position:fixed;bottom:24px;right:24px;z-index:99999;background:var(--pip-bg-2);border:1px solid var(--pip-color);color:var(--pip-color);padding:10px 18px;font-size:0.7rem;font-family:var(--font-main);letter-spacing:1px;box-shadow:0 0 20px rgba(40,255,40,0.2);transition:opacity 0.4s;opacity:0;pointer-events:none;text-transform:uppercase;';
        document.body.appendChild(toast);
    }
    toast.textContent = '✓ PERK ADDED: ' + name;
    toast.style.opacity = '1';
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => { toast.style.opacity = '0'; }, 2200);
}

/* ===== LEVEL UP MODAL ===== */
function openLevelUpModal() {
    const tagged = getTaggedSkills();
    if (tagged.size < 3) {
        // Flash the tag section to guide user
        const tagArea = document.getElementById('tag-area');
        tagArea.style.outline = '2px solid var(--danger-red)';
        setTimeout(() => tagArea.style.outline = '', 1500);
        document.getElementById('lvlup-not-ready').style.display = 'block';
        return;
    }
    document.getElementById('lvlup-not-ready').style.display = 'none';
    _lvlupSession = {};
    skills.forEach(s => { _lvlupSession[s] = 0; });
    _lvlupPointsLeft = pointsPerLevel();
    renderLevelUpGrid();
    document.getElementById('lvlup-modal').classList.add('active');
}

function closeLevelUpModal() {
    document.getElementById('lvlup-modal').classList.remove('active');
}

function renderLevelUpGrid() {
    const tagged = getTaggedSkills();
    const spent = Object.values(_lvlupSession).reduce((a,b)=>a+b,0);
    _lvlupPointsLeft = pointsPerLevel() - spent;

    document.getElementById('lvlup-level-from').textContent = charLevel;
    document.getElementById('lvlup-level-to').textContent = charLevel + 1;
    document.getElementById('lvlup-pts-left').textContent = _lvlupPointsLeft;
    document.getElementById('lvlup-pts-total').textContent = pointsPerLevel();

    const grid = document.getElementById('lvlup-skill-grid');
    grid.innerHTML = skills.map(s => {
        const isTagged = tagged.has(s);
        const cur = skillTotal(s);
        const pts = _lvlupSession[s] || 0;
        const gain = isTagged ? pts * 2 : pts; // tagged: x2 skill gain per point spent
        const nxt = Math.min(100, cur + gain);
        const canAdd = _lvlupPointsLeft > 0 && nxt < 100;
        const canSub = pts > 0;
        return `<div class="lvlup-row${isTagged ? ' lvlup-tagged' : ''}">
            <span class="lvlup-tag-star">${isTagged ? '★' : ' '}</span>
            <span class="lvlup-skill-name">${s}</span>
            <span class="lvlup-cur">${cur}</span>
            <div class="lvlup-ctrl">
                <button class="lvlup-adj" onclick="lvlupAdjust('${s}',-1)" ${canSub?'':'disabled'}>−</button>
                <span class="lvlup-delta${gain>0?' lvlup-active':''}">${gain>0?'+'+gain+(isTagged?'(×2)':''):'—'}</span>
                <button class="lvlup-adj" onclick="lvlupAdjust('${s}',1)" ${canAdd?'':'disabled'}>+</button>
            </div>
            <span class="lvlup-new${nxt!==cur?' lvlup-changed':''}">${nxt}</span>

        </div>`;
    }).join('');
}

function lvlupAdjust(skill, delta) {
    const isTagged = getTaggedSkills().has(skill);
    const pts = _lvlupSession[skill] || 0; // points SPENT (not gained)
    if (delta > 0) {
        if (_lvlupPointsLeft <= 0) return;
        // Tagged: 1 pt spent = 2 gained; untagged: 1 pt = 1 gained
        const gainSoFar = isTagged ? pts * 2 : pts;
        const curTotal = skillTotal(skill) + gainSoFar;
        if (curTotal >= 100) return;
        _lvlupSession[skill] = pts + 1;
    } else {
        if (pts <= 0) return;
        _lvlupSession[skill] = pts - 1;
    }
    const spent = Object.values(_lvlupSession).reduce((a,b)=>a+b,0);
    _lvlupPointsLeft = pointsPerLevel() - spent;
    renderLevelUpGrid();
}

function confirmLevelUp() {
    const tagged = getTaggedSkills();
    const gains = {};
    skills.forEach(s => {
        const pts = _lvlupSession[s] || 0;
        const gain = tagged.has(s) ? pts * 2 : pts; // tagged: 1 spent = 2 gained
        gains[s] = gain;
        skillPoints[s] = (skillPoints[s] || 0) + gain;
        // Hard cap: total skill must not exceed 100
        const maxPts = 100 - skillBase(s) - (tagged.has(s) ? 15 : 0);
        if (skillPoints[s] > maxPts) skillPoints[s] = Math.max(0, maxPts);
    });
    // Record this level's allocation for the Skill Log
    const totalPtsSpent = Object.values(_lvlupSession).reduce((a,b)=>a+b,0);
    if (totalPtsSpent > 0 || true) {
        skillHistory.push({
            level: charLevel + 1,
            allocation: Object.assign({}, _lvlupSession),
            gains: gains,
            tagged: Array.from(tagged),
            pointsTotal: pointsPerLevel()
        });
    }
    charLevel++;
    closeLevelUpModal();
    updateAll();
    reCheckAllPerkRows();
    triggerAutosave();
    // Check if new level grants a perk and prompt
    const newLvl = charLevel;
    const isPerkLevel = (mode === 'hc') ? (newLvl % 3 === 0) : (newLvl % 2 === 0);
    if (isPerkLevel) {
        showPerkLevelUpPrompt(newLvl);
    }
}

function showPerkLevelUpPrompt(lvl) {
    // Open the full perk picker modal
    setTimeout(() => openPerkPickerModal(lvl), 80);
}

/* ===== INTENSE TRAINING MODAL ===== */
function openITModal(name, req, sourceRow) {
    _itTargetRow = sourceRow || null;
    const grid = document.getElementById('it-picker-grid');
    grid.innerHTML = '';
    sKeys.forEach(k => {
        const val = special[k];
        const isMaxed = val >= 10;
        const cls = isMaxed ? 'special-pick-btn maxed' : 'special-pick-btn';
        const title = isMaxed ? `${k} IS ALREADY AT MAX (10)` : `ADD +1 TO ${k}`;
        grid.insertAdjacentHTML('beforeend',
            `<button class="${cls}" title="${title}" onclick="confirmIT('${name}','${req}','${k}')">
                <span>${k}</span>
                <span class="spk-val">${val}</span>
                <span style="font-size:0.6rem;">${isMaxed ? 'MAX' : '+1'}</span>
            </button>`
        );
    });
    document.getElementById('it-modal').classList.add('active');
}

function closeITModal() {
    document.getElementById('it-modal').classList.remove('active');
}

function confirmIT(name, req, statKey) {
    if (special[statKey] < 10) special[statKey] += 1;
    closeITModal();
    const label = `${name} (+1 ${statKey})`;

    // If we know which row triggered IT, just update its label in-place — no new row
    if (_itTargetRow) {
        const ni = _itTargetRow.querySelector('.prog-name-input');
        if (ni) ni.value = label;
        const notes = _itTargetRow.querySelector('.prog-notes-input');
        if (notes && !notes.value) notes.value = req;
        _itTargetRow = null;
        updateAll();
        reCheckAllPerkRows();
        triggerAutosave();
        showPerkToast(label);
        return;
    }

    // Fallback: find first empty prog row
    const rows = document.querySelectorAll('#prog-list .prog-row');
    for (const row of rows) {
        const nameInput = row.querySelector('.prog-name-input');
        if (!nameInput.value.trim()) {
            selectPerkInRow(row, name);
            nameInput.value = label;
            const ni = row.querySelector('.prog-notes-input'); if(ni) ni.value = req;
            triggerAutosave();
            showPerkToast(label);
            return;
        }
    }
    addExtraPerk();
    const extras = document.querySelectorAll('#extra-perk-list .prog-row');
    const last = extras[extras.length - 1];
    if (last) {
        selectPerkInRow(last, name);
        last.querySelector('.prog-name-input').value = label;
        const ni = last.querySelector('.prog-notes-input'); if(ni) ni.value = req;
    }
    triggerAutosave();
    showPerkToast(label);
}

/* Close modal on overlay click */
document.addEventListener('click', function(e) {
    if (e.target === document.getElementById('it-modal')) closeITModal();
    if (e.target === document.getElementById('lvlup-modal')) closeLevelUpModal();
});

/* ===== RENDER: QUESTS ===== */
function renderQuests() {
    const div = document.getElementById('quest-list-container'); div.innerHTML = '';
    for (const cat in questsData[origin]) {
        const safe = cat.replace(/[&\s]+/g, '-').toLowerCase().replace(/:/g, '');
        let h = `<div class="header-row" id="h-${safe}" onclick="toggleCollapse('${safe}')"><h2>${cat}</h2><span class="cat-pct" id="pct-${safe}">0%</span></div><div class="grid-tidy" data-category="${safe}">`;
        questsData[origin][cat].forEach(q => {
            h += `<div class="grid-item" onclick="this.querySelector('input').click()"><input type="checkbox" style="display:none;" onchange="calcCat('${safe}'); updateUniqueMarker(this); triggerAutosave();"><span class="tag-marker">[ ]</span><span>${q}</span></div>`;
        });
        div.insertAdjacentHTML('beforeend', h + `</div>`);
    }
}

/* ===== RENDER: UNIQUES ===== */
const uniqueArmorData = {
    "POWER ARMOR (FO3)": [
        `<a href="https://fallout.fandom.com/wiki/Ashur%27s_power_armor" target="_blank">Ashur's Power Armor</a>`,
        `<a href="https://fallout.fandom.com/wiki/Linden%27s_Outcast_power_armor" target="_blank">Linden's Outcast Power Armor</a>`,
        `<a href="https://fallout.fandom.com/wiki/Prototype_medic_power_armor" target="_blank">Prototype Medic Power Armor</a>`,
        `<a href="https://fallout.fandom.com/wiki/T-51b_power_armor_(Fallout_3)" target="_blank">T-51b Power Armor</a>`,
        `<a href="https://fallout.fandom.com/wiki/Tribal_power_armor" target="_blank">Tribal Power Armor</a>`,
        `<a href="https://fallout.fandom.com/wiki/Winterized_T-51b_power_armor" target="_blank">Winterized T-51b Power Armor</a>`,
    ],
    "COMBAT ARMOR (FO3)": [
        `<a href="https://fallout.fandom.com/wiki/Armored_Vault_101_jumpsuit" target="_blank">Armored Vault 101 Jumpsuit</a>`,
        `<a href="https://fallout.fandom.com/wiki/Bombshell_armor" target="_blank">Bombshell Armor</a>`,
        `<a href="https://fallout.fandom.com/wiki/Chinese_stealth_armor_(Fallout_3)" target="_blank">Chinese Stealth Armor</a>`,
        `<a href="https://fallout.fandom.com/wiki/Composite_recon_armor" target="_blank">Composite Recon Armor</a>`,
        `<a href="https://fallout.fandom.com/wiki/Grifter%27s_fit" target="_blank">Grifter's Fit</a>`,
        `<a href="https://fallout.fandom.com/wiki/Lag-Bolt%27s_combat_armor" target="_blank">Lag-Bolt's Combat Armor</a>`,
        `<a href="https://fallout.fandom.com/wiki/Leather_Rebel" target="_blank">Leather Rebel</a>`,
        `<a href="https://fallout.fandom.com/wiki/Metal_Master_armor" target="_blank">Metal Master Armor</a>`,
        `<a href="https://fallout.fandom.com/wiki/Ranger_battle_armor" target="_blank">Ranger Battle Armor</a>`,
        `<a href="https://fallout.fandom.com/wiki/The_AntAgonizer%27s_costume" target="_blank">The AntAgonizer's Costume</a>`,
        `<a href="https://fallout.fandom.com/wiki/Wanderer%27s_leather_armor" target="_blank">Wanderer's Leather Armor</a>`,
    ],
    "OUTFITS & CLOTHING (FO3)": [
        `<a href="https://fallout.fandom.com/wiki/All-Nighter_nightwear" target="_blank">All-Nighter Nightwear</a>`,
        `<a href="https://fallout.fandom.com/wiki/All-purpose_science_suit_(Fallout_3)" target="_blank">All-Purpose Science Suit</a>`,
        `<a href="https://fallout.fandom.com/wiki/Colonel_Autumn%27s_uniform" target="_blank">Colonel Autumn's Uniform</a>`,
        `<a href="https://fallout.fandom.com/wiki/Dad%27s_wasteland_outfit" target="_blank">Dad's Wasteland Outfit</a>`,
        `<a href="https://fallout.fandom.com/wiki/Doctor_Li%27s_outfit" target="_blank">Doctor Li's Outfit</a>`,
        `<a href="https://fallout.fandom.com/wiki/Elder_Lyons%27_robe" target="_blank">Elder Lyons' Robe</a>`,
        `<a href="https://fallout.fandom.com/wiki/Environment_suit" target="_blank">Environment Suit</a>`,
        `<a href="https://fallout.fandom.com/wiki/Eulogy_Jones%27_suit_(Fallout_3)" target="_blank">Eulogy Jones' Suit</a>`,
        `<a href="https://fallout.fandom.com/wiki/General_Chase%27s_overcoat" target="_blank">General Chase's Overcoat</a>`,
        `<a href="https://fallout.fandom.com/wiki/General_Jingwei%27s_uniform" target="_blank">General Jingwei's Uniform</a>`,
        `<a href="https://fallout.fandom.com/wiki/Laborer_outfit" target="_blank">Laborer Outfit</a>`,
        `<a href="https://fallout.fandom.com/wiki/Lesko%27s_lab_coat" target="_blank">Lesko's Lab Coat</a>`,
        `<a href="https://fallout.fandom.com/wiki/Maple%27s_garb" target="_blank">Maple's Garb</a>`,
        `<a href="https://fallout.fandom.com/wiki/Mayor_MacCready%27s_outfit" target="_blank">Mayor MacCready's Outfit</a>`,
        `<a href="https://fallout.fandom.com/wiki/Modified_utility_jumpsuit" target="_blank">Modified Utility Jumpsuit</a>`,
        `<a href="https://fallout.fandom.com/wiki/Mysterious_Stranger_outfit" target="_blank">Mysterious Stranger Outfit</a>`,
        `<a href="https://fallout.fandom.com/wiki/Naughty_nightwear_(Fallout_3)" target="_blank">Naughty Nightwear</a>`,
        `<a href="https://fallout.fandom.com/wiki/Neural_interface_suit" target="_blank">Neural Interface Suit</a>`,
        `<a href="https://fallout.fandom.com/wiki/Paulson%27s_outfit" target="_blank">Paulson's Outfit</a>`,
        `<a href="https://fallout.fandom.com/wiki/Red%27s_jumpsuit" target="_blank">Red's Jumpsuit</a>`,
        `<a href="https://fallout.fandom.com/wiki/Regulator_duster_(Fallout_3)" target="_blank">Regulator Duster</a>`,
        `<a href="https://fallout.fandom.com/wiki/Tenpenny%27s_suit" target="_blank">Tenpenny's Suit</a>`,
        `<a href="https://fallout.fandom.com/wiki/The_Surgeon%27s_lab_coat" target="_blank">The Surgeon's Lab Coat</a>`,
        `<a href="https://fallout.fandom.com/wiki/Vance%27s_longcoat_outfit" target="_blank">Vance's Longcoat Outfit</a>`,
        `<a href="https://fallout.fandom.com/wiki/Vault_77_jumpsuit" target="_blank">Vault 77 Jumpsuit</a>`,
        `<a href="https://fallout.fandom.com/wiki/Vault_lab_uniform_(Fallout_3)" target="_blank">Vault Lab Uniform</a>`,
    ],
    "HEADGEAR (FO3)": [
        `<a href="https://fallout.fandom.com/wiki/Boogeyman%27s_hood" target="_blank">Boogeyman's Hood</a>`,
        `<a href="https://fallout.fandom.com/wiki/Button%27s_wig" target="_blank">Button's Wig</a>`,
        `<a href="https://fallout.fandom.com/wiki/Chinese_general_hat" target="_blank">Chinese General Hat</a>`,
        `<a href="https://fallout.fandom.com/wiki/Crow%27s_eyebot_helmet" target="_blank">Crow's Eyebot Helmet</a>`,
        `<a href="https://fallout.fandom.com/wiki/Cryptochromatic_spectacles" target="_blank">Cryptochromatic Spectacles</a>`,
        `<a href="https://fallout.fandom.com/wiki/Desmond%27s_eyeglasses" target="_blank">Desmond's Eyeglasses</a>`,
        `<a href="https://fallout.fandom.com/wiki/Eulogy_Jones%27_hat_(Fallout_3)" target="_blank">Eulogy Jones' Hat</a>`,
        `<a href="https://fallout.fandom.com/wiki/Filtration_helmet" target="_blank">Filtration Helmet</a>`,
        `<a href="https://fallout.fandom.com/wiki/Ghoul_mask" target="_blank">Ghoul Mask</a>`,
        `<a href="https://fallout.fandom.com/wiki/Hat_of_the_People" target="_blank">Hat of the People</a>`,
        `<a href="https://fallout.fandom.com/wiki/Lag-Bolt%27s_shades" target="_blank">Lag-Bolt's Shades</a>`,
        `<a href="https://fallout.fandom.com/wiki/Ledoux%27s_hockey_mask" target="_blank">Ledoux's Hockey Mask</a>`,
        `<a href="https://fallout.fandom.com/wiki/Lincoln%27s_hat" target="_blank">Lincoln's Hat</a>`,
        `<a href="https://fallout.fandom.com/wiki/Lucky_shades_(Fallout_3)" target="_blank">Lucky Shades</a>`,
        `<a href="https://fallout.fandom.com/wiki/MacCready%27s_helmet" target="_blank">MacCready's Helmet</a>`,
        `<a href="https://fallout.fandom.com/wiki/Pint-Sized_Slasher_mask" target="_blank">Pint-Sized Slasher Mask</a>`,
        `<a href="https://fallout.fandom.com/wiki/Poplar%27s_hood" target="_blank">Poplar's Hood</a>`,
    ],
    "POWER ARMOR (FNV)": [
        `<a href="https://fallout.fandom.com/wiki/Gannon_family_Tesla_armor" target="_blank">Gannon Family Tesla Armor</a>`,
        `<a href="https://fallout.fandom.com/wiki/Remnants_power_armor" target="_blank">Remnants Power Armor</a>`,
    ],
    "COMBAT ARMOR (FNV)": [
        `<a href="https://fallout.fandom.com/wiki/1st_Recon_assault_armor" target="_blank">1st Recon Assault Armor</a>`,
        `<a href="https://fallout.fandom.com/wiki/1st_Recon_survival_armor" target="_blank">1st Recon Survival Armor</a>`,
        `<a href="https://fallout.fandom.com/wiki/Armored_Vault_13_jumpsuit" target="_blank">Armored Vault 13 Jumpsuit</a>`,
        `<a href="https://fallout.fandom.com/wiki/Armored_Vault_21_jumpsuit" target="_blank">Armored Vault 21 Jumpsuit</a>`,
        `<a href="https://fallout.fandom.com/wiki/Assassin_suit" target="_blank">Assassin Suit</a>`,
        `<a href="https://fallout.fandom.com/wiki/Chinese_stealth_armor_(Fallout:_New_Vegas)" target="_blank">Chinese Stealth Armor</a>`,
        `<a href="https://fallout.fandom.com/wiki/Explorer%27s_gear" target="_blank">Explorer's Gear</a>`,
        `<a href="https://fallout.fandom.com/wiki/Great_Khan_armored_leather" target="_blank">Great Khan Armored Leather</a>`,
        `<a href="https://fallout.fandom.com/wiki/NCR_Ranger_combat_armor" target="_blank">NCR Ranger Combat Armor</a>`,
        `<a href="https://fallout.fandom.com/wiki/Space_suit_(Fallout:_New_Vegas)" target="_blank">Space Suit</a>`,
        `<a href="https://fallout.fandom.com/wiki/Veronica%27s_armored_robes" target="_blank">Veronica's Armored Robes</a>`,
    ],
    "OUTFITS & CLOTHING (FNV)": [
        `<a href="https://fallout.fandom.com/wiki/All-purpose_science_suit_(Fallout:_New_Vegas)" target="_blank">All-Purpose Science Suit</a>`,
        `<a href="https://fallout.fandom.com/wiki/Ambassador_Crocker%27s_suit" target="_blank">Ambassador Crocker's Suit</a>`,
        `<a href="https://fallout.fandom.com/wiki/Arcade%27s_lab_coat" target="_blank">Arcade's Lab Coat</a>`,
        `<a href="https://fallout.fandom.com/wiki/Benny%27s_suit" target="_blank">Benny's Suit</a>`,
        `<a href="https://fallout.fandom.com/wiki/Bounty_hunter_duster" target="_blank">Bounty Hunter Duster</a>`,
        `<a href="https://fallout.fandom.com/wiki/Caesar%27s_armor" target="_blank">Caesar's Armor</a>`,
        `<a href="https://fallout.fandom.com/wiki/Follower%27s_lab_coat" target="_blank">Follower's Lab Coat</a>`,
        `<a href="https://fallout.fandom.com/wiki/General_Oliver%27s_uniform" target="_blank">General Oliver's Uniform</a>`,
        `<a href="https://fallout.fandom.com/wiki/Naughty_nightwear_(Fallout:_New_Vegas)" target="_blank">Naughty Nightwear</a>`,
        `<a href="https://fallout.fandom.com/wiki/Pimp-Boy_3_Billion" target="_blank">Pimp-Boy 3 Billion</a>`,
        `<a href="https://fallout.fandom.com/wiki/President_Kimball%27s_suit" target="_blank">President Kimball's Suit</a>`,
        `<a href="https://fallout.fandom.com/wiki/Rebreather" target="_blank">Rebreather</a>`,
        `<a href="https://fallout.fandom.com/wiki/Regulator_duster_(Fallout:_New_Vegas)" target="_blank">Regulator Duster</a>`,
        `<a href="https://fallout.fandom.com/wiki/RobCo_jumpsuit" target="_blank">RobCo Jumpsuit</a>`,
        `<a href="https://fallout.fandom.com/wiki/Sheriff%27s_duster" target="_blank">Sheriff's Duster</a>`,
        `<a href="https://fallout.fandom.com/wiki/Sleepwear_(Fallout:_New_Vegas)" target="_blank">Sleepwear</a>`,
        `<a href="https://fallout.fandom.com/wiki/Vault_lab_uniform_(Fallout:_New_Vegas)" target="_blank">Vault Lab Uniform</a>`,
        `<a href="https://fallout.fandom.com/wiki/Viva_Las_Vegas" target="_blank">Viva Las Vegas</a>`,
    ],
    "HEADGEAR (FNV)": [
        `<a href="https://fallout.fandom.com/wiki/1st_Recon_beret" target="_blank">1st Recon Beret</a>`,
        `<a href="https://fallout.fandom.com/wiki/Boone%27s_beret" target="_blank">Boone's Beret</a>`,
        `<a href="https://fallout.fandom.com/wiki/Caleb_McCaffery%27s_hat" target="_blank">Caleb McCaffery's Hat</a>`,
        `<a href="https://fallout.fandom.com/wiki/Jessup%27s_bandana" target="_blank">Jessup's Bandana</a>`,
        `<a href="https://fallout.fandom.com/wiki/Lucky_shades_(Fallout:_New_Vegas)" target="_blank">Lucky Shades</a>`,
        `<a href="https://fallout.fandom.com/wiki/Motor-Runner%27s_helmet" target="_blank">Motor-Runner's Helmet</a>`,
        `<a href="https://fallout.fandom.com/wiki/Suave_gambler_hat" target="_blank">Suave Gambler Hat</a>`,
        `<a href="https://fallout.fandom.com/wiki/Tuxedo_hat" target="_blank">Tuxedo Hat</a>`,
    ],
    "DLC ARMOR (FNV)": [
        `<a href="https://fallout.fandom.com/wiki/Advanced_riot_gear" target="_blank">Advanced Riot Gear</a> <span style="opacity:0.5;font-size:0.65rem;">[LR]</span>`,
        `<a href="https://fallout.fandom.com/wiki/Armor_of_the_87th_Tribe" target="_blank">Armor of the 87th Tribe</a> <span style="opacity:0.5;font-size:0.65rem;">[OWB]</span>`,
        `<a href="https://fallout.fandom.com/wiki/Desert_Ranger_combat_armor" target="_blank">Desert Ranger Combat Armor</a> <span style="opacity:0.5;font-size:0.65rem;">[HH]</span>`,
        `<a href="https://fallout.fandom.com/wiki/Dr._Klein%27s_glasses" target="_blank">Dr. Klein's Glasses</a> <span style="opacity:0.5;font-size:0.65rem;">[OWB]</span>`,
        `<a href="https://fallout.fandom.com/wiki/Dr._Klein%27s_scrubs" target="_blank">Dr. Klein's Scrubs</a> <span style="opacity:0.5;font-size:0.65rem;">[OWB]</span>`,
        `<a href="https://fallout.fandom.com/wiki/Dr._Mobius%27_glasses" target="_blank">Dr. Mobius' Glasses</a> <span style="opacity:0.5;font-size:0.65rem;">[OWB]</span>`,
        `<a href="https://fallout.fandom.com/wiki/Dr._Mobius%27_scrubs" target="_blank">Dr. Mobius' Scrubs</a> <span style="opacity:0.5;font-size:0.65rem;">[OWB]</span>`,
        `<a href="https://fallout.fandom.com/wiki/Elite_riot_gear" target="_blank">Elite Riot Gear</a> <span style="opacity:0.5;font-size:0.65rem;">[LR]</span>`,
        `<a href="https://fallout.fandom.com/wiki/Joshua_Graham%27s_armor" target="_blank">Joshua Graham's Armor</a> <span style="opacity:0.5;font-size:0.65rem;">[HH]</span>`,
        `<a href="https://fallout.fandom.com/wiki/Riot_gear_(Lonesome_Road)" target="_blank">Riot Gear</a> <span style="opacity:0.5;font-size:0.65rem;">[LR]</span>`,
        `<a href="https://fallout.fandom.com/wiki/Salt-Upon-Wounds%27_power_armor" target="_blank">Salt-Upon-Wounds' Power Armor</a> <span style="opacity:0.5;font-size:0.65rem;">[HH]</span>`,
        `<a href="https://fallout.fandom.com/wiki/Sierra_Madre_armor" target="_blank">Sierra Madre Armor</a> <span style="opacity:0.5;font-size:0.65rem;">[DM]</span>`,
        `<a href="https://fallout.fandom.com/wiki/Ulysses%27_duster" target="_blank">Ulysses' Duster</a> <span style="opacity:0.5;font-size:0.65rem;">[LR]</span>`,
        `<a href="https://fallout.fandom.com/wiki/Vera%27s_outfit" target="_blank">Vera's Outfit</a> <span style="opacity:0.5;font-size:0.65rem;">[DM]</span>`,
    ],
};

function renderUniqueArmor() {
    const div = document.getElementById('unique-armor-checklist'); div.innerHTML = '';
    Object.keys(uniqueArmorData).forEach(cat => {
        const safe = "a-" + cat.replace(/[&\s\(\)]+/g, '-').toLowerCase().replace(/-+/g,'-').replace(/-$/,'');
        let h = `<div class="header-row" id="h-${safe}" onclick="toggleCollapse('${safe}')"><h2>${cat}</h2><span class="cat-pct" id="pct-${safe}">0%</span></div><div class="grid-tidy" data-category="${safe}">`;
        uniqueArmorData[cat].forEach(w => {
            const tmp = document.createElement('div'); tmp.innerHTML = w;
            const plainName = (tmp.querySelector('a') || tmp).textContent.trim();
            const safeN = plainName.replace(/'/g, "\\'");
            h += `<div class="grid-item" onclick="this.querySelector('input').click()">
                <input type="checkbox" class="u-armor-check" onchange="calcCat('${safe}'); updateUniqueMarker(this); triggerAutosave();" style="display:none;">
                <span class="tag-marker">[ ]</span>
                <span style="flex:1;">${w}</span>
                <button class="uni-add-btn" title="ADD TO LOADOUT" onclick="event.stopPropagation(); addUniqueArmorToLoadout('${safeN}')">+</button>
            </div>`;
        });
        div.insertAdjacentHTML('beforeend', h + `</div>`);
    });
}

function addUniqueArmorToLoadout(name) {
    addArmor();
    const cards = document.querySelectorAll('#armor-list .gear-card');
    const card = cards[cards.length - 1];
    if (card) {
        const ins = card.querySelectorAll('.gear-field-input');
        if(ins[0]) ins[0].value = name;
        const n = name.toUpperCase();
        const sel = card.querySelector('.gear-field-select');
        if (sel) {
            if (n.includes('POWER ARMOR') || n.includes('T-51') || n.includes('REMNANTS') || n.includes('TESLA ARMOR') || n.includes('ASHUR') || n.includes('PROTOTYPE MEDIC') || n.includes('LINDEN') || n.includes('SALT-UPON') || n.includes('TRIBAL POWER')) sel.value = 'POWER ARMOR';
            else if (n.includes('COMBAT') || n.includes('RANGER') || n.includes('RECON') || n.includes('LEATHER') || n.includes('METAL') || n.includes('ASSASSIN') || n.includes('STEALTH ARMOR') || n.includes('RIOT GEAR') || n.includes('SIERRA MADRE') || n.includes('GREAT KHAN')) sel.value = 'MEDIUM';
            else sel.value = 'LIGHT';
            updateArmorBadge(sel);
        }
        triggerAutosave();
    }
    const btn = document.getElementById('tab-btn-gear');
    btn.style.boxShadow = '0 0 12px var(--pip-color)';
    btn.style.background = 'var(--pip-color)';
    btn.style.color = 'black';
    setTimeout(() => { if (!btn.classList.contains('active')) { btn.style.boxShadow = ''; btn.style.background = ''; btn.style.color = ''; } }, 800);
}

function updateUniqueMarker(cb) {
    const marker = cb.parentElement.querySelector('.tag-marker');
    if (marker) marker.textContent = cb.checked ? '[X]' : '[ ]';
}

function searchUniqueArmor() { searchItems('uni-armor-search-bar', 'unique-armor-checklist'); }

function renderUniques() {
    const div = document.getElementById('unique-weapon-checklist'); div.innerHTML = '';
    const categoryOrder = ["PISTOLS & REVOLVERS", "SMGS & RIFLES", "SHOTGUNS", "BIG GUNS", "ENERGY WEAPONS", "EXPLOSIVES", "MELEE WEAPONS", "UNARMED"];
    categoryOrder.forEach(cat => {
        if (uniqueWeaponData[cat]) {
            const safe = "u-" + cat.replace(/[&\s]+/g, '-').toLowerCase();
            let h = `<div class="header-row" id="h-${safe}" onclick="toggleCollapse('${safe}')"><h2>${cat}</h2><span class="cat-pct" id="pct-${safe}">0%</span></div><div class="grid-tidy" data-category="${safe}">`;
            uniqueWeaponData[cat].forEach(w => {
                // Extract plain text name from the anchor tag
                const tmp = document.createElement('div'); tmp.innerHTML = w;
                const plainName = (tmp.querySelector('a') || tmp).textContent.trim();
                const safeN = plainName.replace(/'/g, "\\'");
                h += `<div class="grid-item" onclick="this.querySelector('input').click()">
                    <input type="checkbox" class="u-wpn-check" onchange="calcCat('${safe}'); updateUniqueMarker(this); triggerAutosave();" style="display:none;">
                    <span class="tag-marker">[ ]</span>
                    <span style="flex:1;">${w}</span>
                    <button class="uni-add-btn" title="ADD TO LOADOUT" onclick="event.stopPropagation(); addUniqueToLoadout('${safeN}')">+</button>
                </div>`;
            });
            div.insertAdjacentHTML('beforeend', h + `</div>`);
        }
    });
}

function addUniqueToLoadout(name) {
    addWeapon();
    const cards = document.querySelectorAll('#weapon-list .gear-card');
    const card = cards[cards.length - 1];
    if (card) {
        const ins = card.querySelectorAll('.gear-field-input');
        if(ins[0]) ins[0].value = name;
        triggerAutosave();
    }
    // Flash the loadout tab button briefly to guide the user
    const btn = document.getElementById('tab-btn-gear');
    btn.style.boxShadow = '0 0 12px var(--pip-color)';
    btn.style.background = 'var(--pip-color)';
    btn.style.color = 'black';
    setTimeout(() => {
        if (!btn.classList.contains('active')) {
            btn.style.boxShadow = '';
            btn.style.background = '';
            btn.style.color = '';
        }
    }, 800);
}

/* ===== RENDER: COLLECTIBLES ===== */
function renderCollectibles() {
    const div = document.getElementById('coll-list'); div.innerHTML = '';
    if(origin === 'CW') {
        div.innerHTML = `
            <div class="header-row" id="h-special-bobble" onclick="toggleCollapse('special-bobble')"><h2>BOBBLEHEADS: S.P.E.C.I.A.L.</h2></div>
            <div class="grid-tidy" data-category="special-bobble">${sKeys.map(s=>`<div class="grid-item" onclick="this.querySelector('input').click()"><input type="checkbox" style="display:none;" onchange="updateUniqueMarker(this); triggerAutosave()"><span class="tag-marker">[ ]</span><span>${s}</span></div>`).join('')}</div>
            <div class="header-row" id="h-skill-bobble" onclick="toggleCollapse('skill-bobble')"><h2>BOBBLEHEADS: SKILLS</h2></div>
            <div class="grid-tidy" data-category="skill-bobble">${skills.map(s=>`<div class="grid-item" onclick="this.querySelector('input').click()"><input type="checkbox" style="display:none;" onchange="updateUniqueMarker(this); triggerAutosave()"><span class="tag-marker">[ ]</span><span>${s}</span></div>`).join('')}</div>`;
    } else {
        div.innerHTML = `
            <div class="header-row" id="h-snow-base" onclick="toggleCollapse('snow-base')"><h2>SNOWGLOBES: BASE GAME</h2></div>
            <div class="grid-tidy" data-category="snow-base">${["GOODSPRINGS","STRIP","HOOVER DAM","MT. CHARLESTON","NELLIS","MORMON FORT","TEST SITE"].map(s=>`<div class="grid-item" onclick="this.querySelector('input').click()"><input type="checkbox" style="display:none;" onchange="updateUniqueMarker(this); triggerAutosave()"><span class="tag-marker">[ ]</span><span>${s}</span></div>`).join('')}</div>
            <div class="header-row" id="h-snow-dlc" onclick="toggleCollapse('snow-dlc')"><h2>SNOWGLOBES: DLC</h2></div>
            <div class="grid-tidy" data-category="snow-dlc">${["SIERRA MADRE","ZION","BIG MT","THE DIVIDE"].map(s=>`<div class="grid-item" onclick="this.querySelector('input').click()"><input type="checkbox" style="display:none;" onchange="updateUniqueMarker(this); triggerAutosave()"><span class="tag-marker">[ ]</span><span>${s}</span></div>`).join('')}</div>`;
    }
}

/* ===== CATEGORY COMPLETION ===== */
function calcCat(id) {
    const g = document.querySelector(`.grid-tidy[data-category="${id}"]`);
    if(!g) return;
    const checks = Array.from(g.querySelectorAll('input[type="checkbox"]'));
    const pct = Math.round((checks.filter(c => c.checked).length / checks.length) * 100);
    const pctEl = document.getElementById(`pct-${id}`);
    if(pctEl) pctEl.innerText = pct === 100 ? "DONE" : pct + "%";
    document.getElementById(`h-${id}`).classList.toggle('completed', pct === 100);
}

/* ===== UPDATE ALL ===== */
function updateAll() {
    const pool = (mode === 'hc' ? 30 : 33);
    const rem = pool - (Object.values(special).reduce((a,b)=>a+b,0) - 7);
    document.getElementById('pts-left').innerText = rem;
    const { specialDelta, skillDelta, hasConditional } = getActiveTraitBonuses();
    document.getElementById('special-list').innerHTML = sKeys.map(k => {
        const d = specialDelta[k] || 0;
        const deltaBadge = d !== 0 ? `<span class="spec-delta-badge ${d>0?'sdelta-pos':'sdelta-neg'}">${d>0?'+':''}${d}</span>` : '';
        return `<div class="special-row">
            <span class="spec-abbr-lg">${k}</span>
            <div class="spec-track-wide"><div class="spec-fill-wide" style="width:${special[k]*10}%"></div></div>
            <div class="special-controls">
                <button class="special-btn" onclick="mod('${k}',-1)" ${special[k]<=1?'disabled':''}>−</button>
                <span class="special-val">${special[k]}</span>
                <button class="special-btn" onclick="mod('${k}',1)" ${rem<=0 || special[k]>=10?'disabled':''}>+</button>
                ${deltaBadge}
            </div>
        </div>`;
    }).join('');

    document.getElementById('ov-name').innerText = (document.getElementById('char-name').value || "NO_ID").toUpperCase();
    document.getElementById('ov-spec').innerHTML = sKeys.map(k => `<div class="char-banner-stat"><span class="char-banner-stat-key">${k}</span><span class="char-banner-stat-val">${special[k]}</span></div>`).join('');
    document.getElementById('ov-tags').innerHTML = Array.from(document.querySelectorAll('#tag-area input:checked')).map(c => { const label = c.parentElement.querySelectorAll('span')[1]; return `<div class="ov-entry"><span>${label ? label.innerText : ''}</span></div>`; }).join('') || "NONE";
    const startingTraitHTML = startingTraits.map(t => `<div class="ov-entry"><span>◈ ${t.name}</span></div>`).join('');
    const levelTraitHTML = Array.from(document.querySelectorAll('#prog-list .trait-slot-row')).map(r => { const n = r.getAttribute('data-chosen')||''; return n ? `<div class="ov-entry"><span>▸ ${n}</span></div>` : ''; }).join('');
    const traitHTML = startingTraitHTML + levelTraitHTML || 'NONE';
    const ovT = document.getElementById('ov-traits'); if(ovT) ovT.innerHTML = traitHTML;

    document.getElementById('ov-perks').innerHTML = (() => {
        const levelPerks = Array.from(document.querySelectorAll('#prog-list .prog-row')).map(r => {
            const lvl = r.querySelector('.lvl-tag')?.innerText || '';
            const val = r.querySelector('.prog-name-input')?.value || '';
            if (!val) return '';
            const perk = PERKS_DATA.find(p => p.name.trim().toLowerCase() === val.trim().toLowerCase());
            const trait = !perk && TRAITS_DATA.find(t => t.name.trim().toLowerCase() === val.trim().toLowerCase());
            const clickable = perk || trait;
            const onclick = clickable ? `onclick="ovPerkClick('${val.replace(/'/g,"\\'")}','${(perk||trait).req.replace(/'/g,"\\'")}','${(perk||trait).desc.replace(/'/g,"\\'")}')"` : '';
            return `<div class="ov-entry ov-entry-clickable" ${onclick}><span>${val}</span><span style="opacity:0.5;">${lvl}</span></div>`;
        }).join('');
        const bonusPerks = Array.from(document.querySelectorAll('#extra-perk-list .prog-row')).map(r => {
            const val = r.querySelector('.prog-name-input')?.value || '';
            if (!val) return '';
            const perk = PERKS_DATA.find(p => p.name.trim().toLowerCase() === val.trim().toLowerCase());
            const trait = !perk && TRAITS_DATA.find(t => t.name.trim().toLowerCase() === val.trim().toLowerCase());
            const onclick = (perk||trait) ? `onclick="ovPerkClick('${val.replace(/'/g,"\\'")}','${(perk||trait).req.replace(/'/g,"\\'")}','${(perk||trait).desc.replace(/'/g,"\\'")}' )"` : '';
            return `<div class="ov-entry ov-entry-clickable" ${onclick}><span>${val}</span><span style="opacity:0.5; color:#a0cfff;">BONUS</span></div>`;
        }).join('');
        const rewardPerks = rewardPerksList.map(rp => {
            const perk = PERKS_DATA.find(p => p.name.trim().toLowerCase() === rp.name.trim().toLowerCase());
            const onclick = perk ? `onclick="ovPerkClick('${rp.name.replace(/'/g,"\\'")}','${perk.req.replace(/'/g,"\\'")}','${perk.desc.replace(/'/g,"\\'")}' )"` : '';
            return `<div class="ov-entry ov-entry-clickable" ${onclick}><span>${rp.name}</span><span style="opacity:0.5; color:#ffd080;">REWARD</span></div>`;
        }).join('');
        const internalized = internalizedTraitsList.map(it => {
            const trait = TRAITS_DATA.find(t => t.name.trim().toLowerCase() === it.name.trim().toLowerCase());
            const onclick = trait ? `onclick="ovPerkClick('${it.name.replace(/'/g,"\\'")}','${trait.req.replace(/'/g,"\\'")}','${trait.desc.replace(/'/g,"\\'")}' )"` : '';
            return `<div class="ov-entry ov-entry-clickable" ${onclick}><span>${it.name}</span><span style="opacity:0.5; color:#c8a0ff;">INT.</span></div>`;
        }).join('');
        return (levelPerks + bonusPerks + rewardPerks + internalized) || '<span style="opacity:0.3; font-size:0.65rem;">NONE YET</span>';
    })();

    let gearHTML = Array.from(document.querySelectorAll('#weapon-list .gear-card')).map(c => {
        const ins = c.querySelectorAll('.gear-field-input');
        const n = ins[0]?.value||''; const a = ins[2]?.value||'';
        return n ? `<div class="ov-entry"><span>⚔ ${n}</span><span style="opacity:0.6;">${a}</span></div>` : '';
    }).join('');
    gearHTML += Array.from(document.querySelectorAll('#armor-list .gear-card')).map(c => {
        const ins = c.querySelectorAll('.gear-field-input');
        const n = ins[0]?.value||''; const sel = c.querySelector('.gear-field-select'); const w = sel?.value||'';
        return n ? `<div class="ov-entry"><span>🛡 ${n}</span><span style="opacity:0.6;">${w}</span></div>` : '';
    }).join('');
    document.getElementById('ov-gear').innerHTML = gearHTML || "EMPTY";
    updateGearCounts();

    // Implants overview
    const ovImplants = document.getElementById('ov-implants');
    if (ovImplants) {
        const takenList = Object.entries(implantsTaken).filter(([k,v]) => v).map(([k]) => {
            const imp = IMPLANTS_DATA.find(i => i.name === k);
            return imp ? `<div class="ov-entry"><span>${imp.name}${imp.cat==='special'&&imp.stat?' (+1 '+imp.stat+')':''}</span></div>` : '';
        }).join('');
        ovImplants.innerHTML = takenList || '<span style="opacity:0.35;">NONE</span>';
    }

    // Update ov-traits-inline visibility
    const ovTI = document.getElementById('ov-traits-inline');
    const ovTEmpty = document.getElementById('ov-traits-empty');
    const startingTraitHTML2 = startingTraits.map(t => `<div class="ov-trait-entry"><span class="ov-trait-dot" style="color:#c8ffd4;">◈</span><span>${t.name}</span></div>`).join('');
    const levelTraitHTML2 = Array.from(document.querySelectorAll('#prog-list .trait-slot-row')).map(r => { const n = r.getAttribute('data-chosen')||''; return n ? `<div class="ov-trait-entry"><span class="ov-trait-dot">▸</span><span>${n}</span></div>` : ''; }).join('');
    const traitHTML2 = startingTraitHTML2 + levelTraitHTML2;
    if (ovTI) ovTI.innerHTML = traitHTML2;
    if (ovTEmpty) ovTEmpty.style.display = traitHTML2 ? 'none' : 'block';

    syncTagLimit();

    // Skills panel
    const tagged = getTaggedSkills();
    const ptsLvl = pointsPerLevel();
    const lvlBtn = document.getElementById('lvlup-open-btn');
    if (lvlBtn) {
        document.getElementById('char-level-display').textContent = charLevel;
        document.getElementById('lvlup-pts-preview').textContent = ptsLvl + ' PTS';
        const ready = tagged.size >= 3;
        lvlBtn.classList.toggle('lvlup-btn-ready', ready);
        lvlBtn.classList.toggle('lvlup-btn-locked', !ready);
    }
    const skillListEl = document.getElementById('skill-list');
    if (skillListEl) {
        skillListEl.innerHTML = skills.map(s => {
            const isTagged = tagged.has(s);
            const base = skillBase(s);
            const tagBonus = isTagged ? 15 : 0;
            const spent = skillPoints[s] || 0;
            const val = Math.min(100, base + tagBonus + spent);
            const sd = skillDelta[s] || 0;
            const sdBadge = sd !== 0 ? `<span class="skill-delta-badge ${sd>0?'sdelta-pos':'sdelta-neg'}">${sd>0?'+':''}${sd}</span>` : '';
            const breakdown = `BASE:${base}${tagBonus?` TAG:+${tagBonus}`:''}${spent?` LVL:+${spent}`:''}${sd?` TRAIT:${sd>0?'+':''}${sd}`:''}`;
            return `<div class="skill-row${isTagged?' skill-row-tagged':''}" title="${breakdown}">
                <span class="skill-row-name">${isTagged?'★ ':''}${s}</span>
                <div class="skill-row-bar"><div class="skill-row-fill" style="width:${val}%"></div></div>
                <span class="skill-row-val">${val}</span>${sdBadge}
            </div>`;
        }).join('');
    }
    // Keep implant list in sync (limit changes when END changes)
    renderImplants();
}

function mod(k, v) { special[k] += v; updateAll(); reCheckAllPerkRows(); triggerAutosave(); }

function addTrait() {
    if(mode==='hc' && document.getElementById('trait-list').children.length>=5) return;
    document.getElementById('trait-list').insertAdjacentHTML('beforeend',
        `<div style="display:flex; margin-bottom:2px;"><input type="text" oninput="triggerAutosave()" style="flex:1; background:transparent; border:none; border-bottom:1px solid #444; color:#fff;" placeholder="TRAIT NAME..."><button onclick="this.parentElement.remove();updateAll();triggerAutosave();" style="color:red; background:none; border:none; cursor:pointer;">X</button></div>`);
    updateAll();
}

function addWeapon() {
    document.getElementById('weapon-list').insertAdjacentHTML('beforeend',
        `<div class="gear-card gear-weapon-card">
            <div class="gear-card-topbar">
                <span class="gear-card-type-badge">⚔ WEAPON</span>
                <button class="gear-card-remove" onclick="this.closest('.gear-card').remove();updateGearCounts();updateAll();triggerAutosave();">✕ REMOVE</button>
            </div>
            <div class="gear-card-fields">
                <div class="gear-field-group gear-field-primary">
                    <label class="gear-field-label">WEAPON NAME</label>
                    <input type="text" class="gear-field-input" oninput="triggerAutosave()" placeholder="E.G. LUCKY, THIS MACHINE...">
                </div>
                <div class="gear-field-row">
                    <div class="gear-field-group">
                        <label class="gear-field-label">FOUND / LOCATION</label>
                        <input type="text" class="gear-field-input" oninput="triggerAutosave()" placeholder="LOCATION...">
                    </div>
                    <div class="gear-field-group">
                        <label class="gear-field-label">AMMO TYPE</label>
                        <input type="text" class="gear-field-input" oninput="triggerAutosave()" placeholder=".357 MAG, 5MM...">
                    </div>
                </div>
            </div>
        </div>`);
    updateGearCounts();
}

function addArmor() {
    document.getElementById('armor-list').insertAdjacentHTML('beforeend',
        `<div class="gear-card gear-armor-card">
            <div class="gear-card-topbar">
                <span class="gear-card-type-badge armor-badge">🛡 APPAREL</span>
                <button class="gear-card-remove" onclick="this.closest('.gear-card').remove();updateGearCounts();updateAll();triggerAutosave();">✕ REMOVE</button>
            </div>
            <div class="gear-card-fields">
                <div class="gear-field-group gear-field-primary">
                    <label class="gear-field-label">APPAREL NAME</label>
                    <input type="text" class="gear-field-input" oninput="triggerAutosave()" placeholder="E.G. COMBAT ARMOR, ROVING TRADER...">
                </div>
                <div class="gear-field-row">
                    <div class="gear-field-group">
                        <label class="gear-field-label">FOUND / LOCATION</label>
                        <input type="text" class="gear-field-input" oninput="triggerAutosave()" placeholder="LOCATION...">
                    </div>
                    <div class="gear-field-group">
                        <label class="gear-field-label">CLASS</label>
                        <select class="gear-field-select" onchange="updateArmorBadge(this);triggerAutosave()">
                            <option>LIGHT</option><option>MEDIUM</option><option>HEAVY</option><option>POWER ARMOR</option>
                        </select>
                    </div>
                </div>
            </div>
        </div>`);
    updateGearCounts();
}

function updateArmorBadge(sel) {
    const card = sel.closest('.gear-card');
    const badge = card.querySelector('.gear-card-type-badge');
    const icons = { LIGHT: '🧥', MEDIUM: '🪖', HEAVY: '⛓', 'POWER ARMOR': '🤖' };
    badge.textContent = (icons[sel.value] || '🛡') + ' ' + sel.value;
}

function updateGearCounts() {
    const wc = document.querySelectorAll('#weapon-list .gear-card').length;
    const ac = document.querySelectorAll('#armor-list .gear-card').length;
    const wcEl = document.getElementById('gear-weapon-count');
    const acEl = document.getElementById('gear-armor-count');
    if (wcEl) wcEl.textContent = wc;
    if (acEl) acEl.textContent = ac;
    const we = document.getElementById('weapon-empty');
    const ae = document.getElementById('armor-empty');
    if (we) we.style.display = wc ? 'none' : 'block';
    if (ae) ae.style.display = ac ? 'none' : 'block';
}

function addExtraPerk() {
    document.getElementById('extra-perk-list').insertAdjacentHTML('beforeend', makeProgRow('BONUS PERK', false, true));
}

/* ===== PROGRESSION AUTOCOMPLETE ENGINE ===== */
let _acCloseTimer = null;

function onProgNameInput(input) {
    const row = input.closest('.prog-row');
    const dropdown = row.querySelector('.prog-ac-dropdown');
    const query = input.value.trim().toUpperCase();

    // If empty, just hide
    if (!query) { dropdown.style.display = 'none'; dropdown.innerHTML = ''; return; }

    // Filter perks
    const matches = PERKS_DATA.filter(p =>
        p.name.toUpperCase().includes(query) || p.req.toUpperCase().includes(query)
    ).slice(0, 12);

    if (!matches.length) {
        dropdown.innerHTML = `<div class="ac-no-results">NO MATCHING PERKS</div>`;
        dropdown.style.display = 'block';
        return;
    }

    dropdown.innerHTML = matches.map((p, i) => {
        const multiLabel = p.ranks > 1 ? ` <span style="color:var(--pip-color);font-size:0.58rem;">[★${p.ranks}]</span>` : '';
        const safeName = p.name.replace(/'/g, '&#39;').replace(/"/g, '&quot;');
        return `<div class="prog-ac-item" data-idx="${i}"
            onmousedown="selectPerkInRow(this.closest('.prog-row'), ${JSON.stringify(p.name)})">
            <span class="ac-item-name">${p.name}${multiLabel}</span>
            <span class="ac-item-req">${p.req}</span>
        </div>`;
    }).join('');
    dropdown.style.display = 'block';
}

function onProgNameKey(e, input) {
    const row = input.closest('.prog-row');
    const dropdown = row.querySelector('.prog-ac-dropdown');
    const items = Array.from(dropdown.querySelectorAll('.prog-ac-item'));
    if (!items.length) { if (e.key === 'Enter') triggerAutosave(); return; }

    const focused = dropdown.querySelector('.ac-focused');
    let idx = focused ? parseInt(focused.dataset.idx) : -1;

    if (e.key === 'ArrowDown') {
        e.preventDefault();
        idx = Math.min(idx + 1, items.length - 1);
        items.forEach(i => i.classList.remove('ac-focused'));
        items[idx].classList.add('ac-focused');
        items[idx].scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        idx = Math.max(idx - 1, 0);
        items.forEach(i => i.classList.remove('ac-focused'));
        items[idx].classList.add('ac-focused');
        items[idx].scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter') {
        e.preventDefault();
        if (focused) { selectPerkInRow(row, focused.querySelector('.ac-item-name').textContent.replace(/\[★\d+\]/g,'').trim()); }
        else { dropdown.style.display = 'none'; triggerAutosave(); }
    } else if (e.key === 'Escape') {
        dropdown.style.display = 'none';
    }
}

function scheduleCloseAC(input) {
    _acCloseTimer = setTimeout(() => {
        const row = input.closest('.prog-row');
        if (row) { const d = row.querySelector('.prog-ac-dropdown'); if(d) d.style.display='none'; }
        triggerAutosave();
    }, 180);
}

// Map perk req abbreviations → special object keys
const REQ_STAT_MAP = { STR:'STR', PER:'PER', END:'END', CHR:'CHA', INT:'INT', AGL:'AGI', LCK:'LCK' };
const STAT_FULL = { STR:'Strength', PER:'Perception', END:'Endurance', CHR:'Charisma', INT:'Intelligence', AGL:'Agility', LCK:'Luck' };

// Returns whether a single OR-part of a requirement string is met
function parsePartMet(part) {
    const p = part.trim();
    // SPECIAL cap: "STR < 6"
    const capM = p.match(/\b(STR|PER|END|CHR|INT|AGL|LCK)\s*<\s*(\d+)/i);
    if (capM) {
        const key = REQ_STAT_MAP[capM[1].toUpperCase()];
        return key ? (special[key] ?? 10) < parseInt(capM[2]) : true;
    }
    // SPECIAL min: "STR 7"
    const specM = p.match(/\b(STR|PER|END|CHR|INT|AGL|LCK)\s+(\d+)/i);
    if (specM) {
        const key = REQ_STAT_MAP[specM[1].toUpperCase()];
        return key ? (special[key] ?? 0) >= parseInt(specM[2]) : true;
    }
    // Skill requirement
    for (const { pattern, skill } of SKILL_REQ_MAP) {
        const m = p.match(pattern);
        if (m) return skillTotal(skill) >= parseInt(m[1]);
    }
    // Level handled elsewhere; karma/named-perk prereqs assumed met
    return true;
}

// Check if a perk's full requirement string is met (for eligibility)
function meetsRequirements(perk) {
    const req = perk.req;
    const lvlM = req.match(/Level\s+(\d+)/i);
    if (lvlM && charLevel < parseInt(lvlM[1])) return false;
    for (const chunk of req.split(',').map(s => s.trim())) {
        if (/^Level\s/i.test(chunk)) continue;
        const anyMet = chunk.split(/\s+or\s+/i).some(part => parsePartMet(part));
        if (!anyMet) return false;
    }
    return true;
}

function checkPerkRequirements(row, perk) {
    const warningEl = row.querySelector('.prog-req-warning');
    if (!warningEl) return;
    const failures = [];
    const req = perk.req;

    // Level check
    const lvlM = req.match(/Level\s+(\d+)/i);
    if (lvlM) {
        const need = parseInt(lvlM[1]);
        const rowLvl = parseInt((row.querySelector('.lvl-tag')?.textContent || '').match(/\d+/)?.[0] || '0');
        if (rowLvl > 0 && rowLvl < need)
            failures.push(`Level: slot is Lvl ${rowLvl}, perk needs Lvl ${need}`);
    }

    // AND-grouped requirement chunks
    for (const chunk of req.split(',').map(s => s.trim())) {
        if (/^Level\s/i.test(chunk)) continue;
        const parts = chunk.split(/\s+or\s+/i);

        // Describe what this chunk expects (for warning message)
        const anyMet = parts.some(part => parsePartMet(part));
        if (!anyMet) {
            // Build a readable description of what failed
            const desc = parts.map(part => {
                const capM = part.match(/\b(STR|PER|END|CHR|INT|AGL|LCK)\s*<\s*(\d+)/i);
                if (capM) return `${STAT_FULL[capM[1].toUpperCase()]||capM[1]} < ${capM[2]} (have ${special[REQ_STAT_MAP[capM[1].toUpperCase()]]??0})`;
                const specM = part.match(/\b(STR|PER|END|CHR|INT|AGL|LCK)\s+(\d+)/i);
                if (specM) { const k=REQ_STAT_MAP[specM[1].toUpperCase()]; return `${STAT_FULL[specM[1].toUpperCase()]||specM[1]} ${specM[2]} (have ${special[k]??0})`; }
                for (const { pattern, skill } of SKILL_REQ_MAP) {
                    const m = part.match(pattern);
                    if (m) return `${skill} ${m[1]} (have ${skillTotal(skill)})`;
                }
                return part.trim();
            }).join(' or ');
            failures.push(desc);
        }
    }

    if (failures.length) {
        warningEl.innerHTML = `<div class="req-warn-label">⚠ REQUIREMENTS NOT MET:</div>` +
            failures.map(f => `<div class="req-warn-item">${f}</div>`).join('');
        warningEl.style.display = 'block';
        row.classList.add('req-fail');
    } else {
        warningEl.innerHTML = ''; warningEl.style.display = 'none';
        row.classList.remove('req-fail');
    }
}

function reCheckAllPerkRows() {
    document.querySelectorAll('#prog-list .prog-row, #extra-perk-list .prog-row').forEach(row => {
        const name = (row.querySelector('.prog-name-input')?.value || '').trim();
        if (!name) return;
        const perk = PERKS_DATA.find(p => p.name.toUpperCase() === name.toUpperCase())
            || PERKS_DATA.find(p => name.toUpperCase().startsWith(p.name.toUpperCase()));
        if (perk) checkPerkRequirements(row, perk);
    });
}

function selectPerkInRow(row, perkName) {
    if (_acCloseTimer) { clearTimeout(_acCloseTimer); _acCloseTimer = null; }
    const perk = PERKS_DATA.find(p => p.name === perkName);
    if (!perk) return;

    const nameInput = row.querySelector('.prog-name-input');
    const dropdown = row.querySelector('.prog-ac-dropdown');
    const info = row.querySelector('.prog-perk-info');
    const reqEl = row.querySelector('.prog-perk-req');
    const descEl = row.querySelector('.prog-perk-desc');
    const badge = row.querySelector('.prog-rank-badge');
    const clearBtn = row.querySelector('.prog-clear-btn');

    nameInput.value = perk.name;
    dropdown.style.display = 'none';
    dropdown.innerHTML = '';

    reqEl.textContent = 'REQ: ' + perk.req;
    descEl.textContent = perk.desc;
    info.style.display = 'block';

    // Add zoom button if not already there
    let zoomBtn = info.querySelector('.perk-zoom-btn');
    if (!zoomBtn) {
        zoomBtn = document.createElement('button');
        zoomBtn.className = 'perk-zoom-btn';
        zoomBtn.title = 'EXPAND TEXT';
        zoomBtn.textContent = '⊕ ZOOM';
        info.appendChild(zoomBtn);
    }
    zoomBtn.onclick = () => openPerkZoom(perk.name, perk.req, perk.desc);

    const multiRank = perk.ranks > 1;
    badge.textContent = multiRank ? `★ ${perk.ranks} RANKS` : `1 RANK`;
    badge.style.display = 'inline';
    badge.classList.toggle('multi', multiRank);
    clearBtn.style.display = 'inline';
    row.classList.add('has-perk');

    // Check requirements against current level + SPECIAL
    checkPerkRequirements(row, perk);

    // If Intense Training, trigger SPECIAL picker — pass the row so confirmIT can update it in-place
    if (perk.name.trim().toUpperCase() === 'INTENSE TRAINING') {
        openITModal(perk.name, perk.req, row);
    }
    // If Tag!, prompt 4th skill selection
    if (perk.name.trim().toUpperCase() === 'TAG!') {
        setTimeout(() => openTagModal(), 80);
    }

    triggerAutosave();
}

function tryHydratePerkRow(row, name) {
    if (!name) return;
    const perk = PERKS_DATA.find(p => p.name.toUpperCase() === name.toUpperCase())
        || PERKS_DATA.find(p => name.toUpperCase().startsWith(p.name.toUpperCase()));
    if (perk) {
        selectPerkInRow(row, perk.name);
        // Restore actual typed name (may include IT annotation)
        row.querySelector('.prog-name-input').value = name;
    } else {
        // Plain text — just show it, no extra info
        row.querySelector('.prog-name-input').value = name;
    }
}

function clearProgRow(btn) {
    const row = btn.closest('.prog-row');
    row.querySelector('.prog-name-input').value = '';
    row.querySelector('.prog-notes-input').value = '';
    row.querySelector('.prog-perk-info').style.display = 'none';
    row.querySelector('.prog-rank-badge').style.display = 'none';
    row.querySelector('.prog-clear-btn').style.display = 'none';
    row.classList.remove('has-perk', 'req-fail');
    const warn = row.querySelector('.prog-req-warning');
    if (warn) { warn.style.display = 'none'; warn.innerHTML = ''; }
    triggerAutosave();
}

function makeProgRow(levelLabel, isTrait, removable) {
    const tagClass = isTrait ? 'lvl-tag is-trait' : 'lvl-tag';
    const removeBtn = removable
        ? `<button onclick="this.closest('.prog-row').remove();updateAll();triggerAutosave();" style="margin-left:auto;font-size:0.6rem;border:1px solid rgba(255,0,0,0.4);color:rgba(255,80,80,0.8);padding:2px 8px;cursor:pointer;background:rgba(255,0,0,0.05);border-bottom:1px solid rgba(255,0,0,0.4)!important;">✕ REMOVE</button>`
        : '';
    return `<div class="prog-row">
        <div class="prog-card-header">
            <span class="${tagClass}">${levelLabel}</span>
            <span class="prog-rank-badge"></span>
            <button class="prog-clear-btn" onclick="clearProgRow(this)">✕ CLEAR</button>
            ${removeBtn}
        </div>
        <div class="prog-input-wrap">
            <input type="text" class="prog-name-input" autocomplete="off"
                placeholder="TYPE TO SEARCH PERKS..."
                oninput="onProgNameInput(this)"
                onkeydown="onProgNameKey(event,this)"
                onblur="scheduleCloseAC(this)"
                onfocus="onProgNameInput(this)">
            <div class="prog-ac-dropdown"></div>
        </div>
        <div class="prog-perk-info">
            <div class="prog-req-warning" style="display:none;"></div>
            <div class="prog-perk-req"></div>
            <div class="prog-perk-desc"></div>
        </div>
        <input type="text" class="prog-notes-input" placeholder="NOTES / REQUIREMENTS..." oninput="triggerAutosave()">
    </div>`;
}

function renderProgression() {
    const div = document.getElementById('prog-list');
    // Save current trait slot choices before wiping
    const savedTraits = {};
    div.querySelectorAll('.trait-slot-row').forEach(r => {
        const id = r.id, chosen = r.getAttribute('data-chosen') || '';
        if (id && chosen) savedTraits[id] = chosen;
    });
    div.innerHTML = '';
    // Level progression rows (starting traits are managed separately)
    let traitIdx = 0;
    for(let i=2; i<=50; i++) {
        const isP = mode === 'std' ? (i%2===0) : (i%3===0);
        const isT = (i>=5 && (i-5)%4===0);
        if(isP) div.insertAdjacentHTML('beforeend', makeProgRow(`LVL ${i} PERK`, false, false));
        if(isT) {
            const slotId = `trait-slot-lvl-${i}`;
            div.insertAdjacentHTML('beforeend', makeTraitRow(slotId, `LVL ${i} TRAIT`, savedTraits[slotId] || ''));
            traitIdx++;
        }
    }
}

function syncTagLimit() {
    const cbs = Array.from(document.querySelectorAll('#tag-area input'));
    const count = cbs.filter(c => c.checked).length;
    cbs.forEach(c => {
        const item = c.parentElement;
        const marker = item.querySelector('.tag-marker');
        if(!c.checked && count >= 3) {
            c.disabled = true;
            item.classList.add('locked');
            if (marker) marker.textContent = '[ ]';
        } else {
            c.disabled = false;
            item.classList.remove('locked');
            if (marker) marker.textContent = c.checked ? '[X]' : '[ ]';
        }
    });
    // Guard: add-trait-btn may not exist if traits managed via modal
    const addTraitBtn = document.getElementById('add-trait-btn');
    if (addTraitBtn) addTraitBtn.disabled = (mode==='hc' && document.getElementById('trait-list').children.length>=5);
}

function toggleTag(itemEl) {
    const cb = itemEl.querySelector('input[type="checkbox"]');
    if (!cb || cb.disabled) return;
    cb.checked = !cb.checked;
    const marker = itemEl.querySelector('.tag-marker');
    if (marker) marker.textContent = cb.checked ? '[X]' : '[ ]';
    triggerAutosave();
}

/* ===== AUTOSAVE & PERSISTENCE ===== */
function triggerAutosave() {
    const data = collectData();
    localStorage.setItem('Nuclear_Sunset_Permanent_Vault', JSON.stringify(data));
    document.getElementById('sync-status').innerText = "V_MEMORY_SYNCED_" + new Date().toLocaleTimeString();
    updateAll();
}

function collectData() {
    regionalStorage[origin].quests = Array.from(document.querySelectorAll('#quest-list-container input')).map(i => i.checked);
    regionalStorage[origin].colls = Array.from(document.querySelectorAll('#coll-list input')).map(i => i.checked);
    return {
        name: document.getElementById('char-name').value, special, mode, origin,
        regionalStorage,
        notes: document.getElementById('user-notes').value,
        tags: Array.from(document.querySelectorAll('#tag-area input')).map(i => i.checked),
        traits: Array.from(document.querySelectorAll('.trait-slot-row')).map(r => r.getAttribute('data-chosen')||''),
        // Note: startingTraits is serialized separately
        perks: Array.from(document.querySelectorAll('#prog-list .prog-row:not(.trait-slot-row)')).map(r => [
            r.querySelector('.prog-name-input')?.value || '',
            r.querySelector('.prog-notes-input')?.value || ''
        ]),
        extraPerks: Array.from(document.querySelectorAll('#extra-perk-list .prog-row')).map(r => [
            r.querySelector('.prog-name-input')?.value || '',
            r.querySelector('.prog-notes-input')?.value || ''
        ]),
        weapons: Array.from(document.querySelectorAll('#weapon-list .gear-card')).map(c => { const ins = c.querySelectorAll('.gear-field-input'); return [ins[0]?.value||'', ins[1]?.value||'', ins[2]?.value||'']; }),
        armor: Array.from(document.querySelectorAll('#armor-list .gear-card')).map(c => { const ins = c.querySelectorAll('.gear-field-input'); const sel = c.querySelector('.gear-field-select'); return [ins[0]?.value||'', ins[1]?.value||'', sel?.value||'LIGHT']; }),
        quests: Array.from(document.querySelectorAll('#quest-list-container input')).map(i => i.checked),
        colls: Array.from(document.querySelectorAll('#coll-list input')).map(i => i.checked),
        uniWpns: Array.from(document.querySelectorAll('.u-wpn-check')).map(i => i.checked),
        uniArmor: Array.from(document.querySelectorAll('.u-armor-check')).map(i => i.checked),
        skillPoints, charLevel,
        implantsTaken, rewardPerksList, internalizedTraitsList,
        fourthTagSkill: _fourthTagSkill || null,
        startingTraits: startingTraits,
        skillHistory: skillHistory
    };
}

function exportJSON() {
    const data = collectData();
    const blob = new Blob([JSON.stringify(data, null, 2)], {type: 'application/json'});
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${data.name || 'dweller'}.json`; a.click();
}

function importJSON(e) {
    const reader = new FileReader();
    reader.onload = (ev) => {
        try {
            const raw = JSON.parse(ev.target.result);
            const safe = sanitizeImport(raw);
            if (!safe) { alert('IMPORT ERROR: INVALID FILE FORMAT'); return; }
            hydrate(safe);
        } catch(err) {
            alert('IMPORT ERROR: COULD NOT PARSE JSON FILE');
        }
    };
    reader.readAsText(e.target.files[0]);
    e.target.value = '';
}

function hydrate(d) {
    if(!d) return;
    special = d.special;
    if (d.skillPoints && typeof d.skillPoints === 'object') {
        skills.forEach(s => { skillPoints[s] = typeof d.skillPoints[s] === 'number' ? d.skillPoints[s] : 0; });
    } else {
        skills.forEach(s => { skillPoints[s] = 0; });
    }
    charLevel = (typeof d.charLevel === 'number' && d.charLevel >= 1) ? d.charLevel : 1;
    document.getElementById('char-name').value = d.name || "";
    document.getElementById('user-notes').value = d.notes || "";
    if(d.regionalStorage) regionalStorage = d.regionalStorage;
    implantsTaken = d.implantsTaken || {};
    rewardPerksList = Array.isArray(d.rewardPerksList) ? d.rewardPerksList : [];
    internalizedTraitsList = Array.isArray(d.internalizedTraitsList) ? d.internalizedTraitsList : [];
    _fourthTagSkill = d.fourthTagSkill || null;
    startingTraits = Array.isArray(d.startingTraits) ? d.startingTraits : [];
    skillHistory = Array.isArray(d.skillHistory) ? d.skillHistory : [];
    setMode(d.mode, true);
    setOrigin(d.origin, true);
    const tI = document.querySelectorAll('#tag-area input');
    d.tags.forEach((c, i) => {
        if(tI[i]) {
            tI[i].checked = c;
            const marker = tI[i].parentElement.querySelector('.tag-marker');
            if (marker) marker.textContent = c ? '[X]' : '[ ]';
        }
    });
    // Trait slots are restored inside renderProgression via savedTraits
    // For backward compat, also handle old trait-list if present
    const tl = document.getElementById('trait-list');
    if (tl) tl.innerHTML = '';
    document.getElementById('weapon-list').innerHTML = '';
    d.weapons.forEach(v => { addWeapon(); const c = document.querySelector('#weapon-list .gear-card:last-child'); const ins = c.querySelectorAll('.gear-field-input'); if(ins[0]) ins[0].value = v[0]||''; if(ins[1]) ins[1].value = v[1]||''; if(ins[2]) ins[2].value = v[2]||''; });
    document.getElementById('armor-list').innerHTML = '';
    d.armor.forEach(v => { addArmor(); const c = document.querySelector('#armor-list .gear-card:last-child'); const ins = c.querySelectorAll('.gear-field-input'); const sel = c.querySelector('.gear-field-select'); if(ins[0]) ins[0].value = v[0]||''; if(ins[1]) ins[1].value = v[1]||''; if(sel && v[2]) { sel.value = v[2]; updateArmorBadge(sel); } });
    // Restore trait slots from saved traits array
    if (d.traits && Array.isArray(d.traits)) {
        const traitSlots = Array.from(document.querySelectorAll('#prog-list .trait-slot-row'));
        d.traits.forEach((traitName, i) => {
            if (traitName && traitSlots[i]) {
                const slotId = traitSlots[i].id;
                traitSlots[i].setAttribute('data-chosen', traitName);
                traitSlots[i].querySelector('.trait-slot-name').textContent = traitName;
                traitSlots[i].querySelector('.trait-slot-btn').textContent = 'CHANGE';
                const clearBtn = traitSlots[i].querySelector('.trait-slot-clear');
                if (clearBtn) clearBtn.style.display = 'inline-block';
            }
        });
    }
    const pI = document.querySelectorAll('#prog-list .prog-row:not(.trait-slot-row)');
    d.perks && d.perks.forEach((v, i) => {
        if(pI[i]) {
            tryHydratePerkRow(pI[i], v[0] || '');
            const ni = pI[i].querySelector('.prog-notes-input'); if(ni) ni.value = v[1] || '';
        }
    });
    document.getElementById('extra-perk-list').innerHTML = '';
    if (d.extraPerks) d.extraPerks.forEach(v => {
        addExtraPerk();
        const ep = document.querySelector('#extra-perk-list .prog-row:last-child');
        if(ep) {
            tryHydratePerkRow(ep, v[0] || '');
            const ni = ep.querySelector('.prog-notes-input'); if(ni) ni.value = v[1] || '';
        }
    });
    const uC = document.querySelectorAll('.u-wpn-check');
    if(d.uniWpns) d.uniWpns.forEach((c, i) => { if(uC[i]) { uC[i].checked = c; updateUniqueMarker(uC[i]); } });
    const uA = document.querySelectorAll('.u-armor-check');
    if(d.uniArmor) d.uniArmor.forEach((c, i) => { if(uA[i]) { uA[i].checked = c; updateUniqueMarker(uA[i]); } });
    updateAll();
    reCheckAllPerkRows();
    renderImplants();
    renderRewardPerksList();
    renderInternalizedTraitsList();
    renderStartingTraitsList();
}

function purgeMemory() { if(confirm("INITIATE TOTAL ATOMIC ANNIHILATION?")) { localStorage.clear(); location.reload(); } }



/* ===== TAG! PERK — 4TH SKILL PICKER ===== */

function openTagModal() {
    const tagged = getTaggedSkills();
    const modal = document.getElementById('tag-pick-modal');
    if (!modal) return;
    const grid = document.getElementById('tag-pick-grid');
    grid.innerHTML = skills.map(s => {
        const isAlready = tagged.has(s);
        const cls = isAlready ? 'tag-pick-item tag-pick-taken' : 'tag-pick-item';
        const icon = isAlready ? '[★ TAGGED]' : '[ ]';
        return `<div class="${cls}" onclick="selectFourthTag('${s}')">
            <span class="tag-pick-icon">${icon}</span>
            <span class="tag-pick-name">${s}</span>
        </div>`;
    }).join('');
    modal.style.display = 'flex';
}

function selectFourthTag(skill) {
    _fourthTagSkill = skill;
    const modal = document.getElementById('tag-pick-modal');
    if (modal) modal.style.display = 'none';
    // Find the tag-area checkbox for this skill and check it
    const cbs = Array.from(document.querySelectorAll('#tag-area input'));
    const skillIndex = skills.indexOf(skill);
    if (skillIndex >= 0 && cbs[skillIndex]) {
        cbs[skillIndex].checked = true;
        cbs[skillIndex].disabled = false;
        const marker = cbs[skillIndex].parentElement.querySelector('.tag-marker');
        if (marker) marker.textContent = '[X]';
    }
    updateAll();
    triggerAutosave();
}

function closeTagModal() {
    const modal = document.getElementById('tag-pick-modal');
    if (modal) modal.style.display = 'none';
}

/* ===== RANDOMIZE BUILD ===== */
function randomizeBuild() {
    if (!confirm('RANDOMIZE S.P.E.C.I.A.L., TAGS, AND STARTING TRAITS? (THIS WILL OVERWRITE CURRENT SELECTIONS)')) return;

    // ── Step 1: Randomize SPECIAL — distribute the FULL pool so all points are used
    const pool = mode === 'hc' ? 30 : 33;
    const newSpecial = { STR:1,PER:1,END:1,CHA:1,INT:1,AGI:1,LCK:1 };
    let remaining = pool; // pool = total SPECIAL to distribute (not extra above baseline)
    while (remaining > 0) {
        const available = sKeys.filter(k => newSpecial[k] < 10);
        if (!available.length) break; // all maxed (safety)
        const k = available[Math.floor(Math.random() * available.length)];
        newSpecial[k]++; remaining--;
    }
    Object.assign(special, newSpecial);

    // ── Step 2: Randomize 3 Tags
    const shuffledSkills = [...skills].sort(() => Math.random() - 0.5);
    const chosenTags = shuffledSkills.slice(0, 3);
    const cbs = Array.from(document.querySelectorAll('#tag-area input'));
    cbs.forEach((cb, i) => {
        cb.checked = chosenTags.includes(skills[i]);
        cb.disabled = false;
        const marker = cb.parentElement.querySelector('.tag-marker');
        if (marker) marker.textContent = cb.checked ? '[X]' : '[ ]';
    });

    // ── Step 3: Randomize starting traits — SPECIAL is set first so eligibility checks work
    startingTraits = []; // clear so checkTraitEligible sees a clean slate
    const eligibleTraits = TRAITS_DATA.filter(t => checkTraitEligible(t));
    const shuffledTraits = [...eligibleTraits].sort(() => Math.random() - 0.5);
    // Pick up to 5 eligible traits, excluding conflicting NOT pairs
    const chosenTraits = [];
    for (const t of shuffledTraits) {
        if (chosenTraits.length >= 5) break;
        // Temporarily register chosen so NOT checks work
        const tempNames = chosenTraits.map(x => x.name);
        const notBlocked = !t.req.split(',').some(p => {
            const up = p.trim().toUpperCase();
            return up.startsWith('NOT ') && tempNames.map(n => n.toUpperCase()).includes(up.slice(4).trim());
        });
        if (notBlocked && checkTraitEligible(t)) chosenTraits.push(t);
    }
    startingTraits = chosenTraits.map(t => ({ name: t.name }));
    renderStartingTraitsList();

    updateAll();
    reCheckAllPerkRows();
    triggerAutosave();

    // Flash confirmation
    const banner = document.getElementById('perk-lvlup-banner');
    if (banner) {
        banner.innerHTML = `<span style="font-size:0.75rem; letter-spacing:1px;">🎲 BUILD RANDOMIZED — REVIEW YOUR S.P.E.C.I.A.L., TAGS &amp; TRAITS</span><button onclick="this.parentElement.style.display='none'" style="margin-left:12px; padding:3px 8px; font-size:0.6rem; background:none; border:1px solid var(--pip-color); color:var(--pip-color); cursor:pointer;">DISMISS</button>`;
        banner.style.display = 'flex';
        setTimeout(() => { banner.style.display = 'none'; }, 5000);
    }
}


/* ===== PERK PICKER MODAL (LEVEL UP) ===== */
let _perkPickerLevel = null;
let _perkPickerList = [];

function openPerkPickerModal(lvl) {
    _perkPickerLevel = lvl;
    const titleEl = document.getElementById('perk-picker-title');
    if (titleEl) titleEl.textContent = `LEVEL ${lvl} — SELECT YOUR PERK`;
    const srchEl = document.getElementById('perk-picker-search');
    if (srchEl) srchEl.value = '';
    renderPerkPickerGrid();
    const modal = document.getElementById('perk-picker-modal');
    if (modal) modal.style.display = 'flex';
}

function closePerkPickerModal() {
    const modal = document.getElementById('perk-picker-modal');
    if (modal) modal.style.display = 'none';
    // Show the classic banner as a reminder
    const banner = document.getElementById('perk-lvlup-banner');
    if (banner && _perkPickerLevel) {
        const lvl = _perkPickerLevel;
        banner.innerHTML = `<span style="font-size:0.75rem; letter-spacing:1px;">⬆ LVL ${lvl}: PERK AVAILABLE!</span><button onclick="openPerkPickerModal(${lvl})" style="margin-left:12px; padding:3px 12px; font-size:0.65rem; background:var(--pip-color); color:black; border:none; cursor:pointer; letter-spacing:1px; font-weight:bold;">→ PICK PERK</button><button onclick="this.parentElement.style.display='none'" style="margin-left:6px; padding:3px 8px; font-size:0.65rem; background:none; border:1px solid var(--pip-color); color:var(--pip-color); cursor:pointer;">LATER</button>`;
        banner.style.display = 'flex';
    }
    _perkPickerLevel = null;
}

function renderPerkPickerGrid() {
    const search = ((document.getElementById('perk-picker-search')||{}).value || '').toLowerCase().trim();
    const eligible = PERKS_DATA.filter(p => meetsRequirements(p));
    _perkPickerList = search ? eligible.filter(p =>
        p.name.toLowerCase().includes(search) || p.desc.toLowerCase().includes(search)
    ) : eligible;

    const countEl = document.getElementById('perk-picker-count');
    if (countEl) countEl.textContent = `${_perkPickerList.length} ELIGIBLE`;

    const grid = document.getElementById('perk-picker-grid');
    if (!grid) return;
    grid.innerHTML = _perkPickerList.map((p, i) => {
        const rankBadge = p.ranks > 1
            ? `<span class="pperk-rank-badge pperk-rank-multi">★ ${p.ranks} RANKS</span>`
            : `<span class="pperk-rank-badge">1 RANK</span>`;
        return `<div class="pperk-card" onclick="takePerkFromModal(${i})">
            <div class="pperk-card-top">
                <span class="pperk-name">${p.name}</span>
                ${rankBadge}
            </div>
            <div class="pperk-req">${p.req}</div>
            <div class="pperk-desc">${p.desc}</div>
            <button class="pperk-take-btn">✓ TAKE THIS PERK</button>
        </div>`;
    }).join('') || '<div style="grid-column:1/-1;text-align:center;opacity:0.4;padding:24px;">NO ELIGIBLE PERKS FOUND</div>';
}

function takePerkFromModal(idx) {
    const perk = _perkPickerList[idx];
    if (!perk) return;
    const lvl = _perkPickerLevel;
    let targetRow = null;

    // Try to find the exact prog-row for this level
    if (lvl) {
        document.querySelectorAll('#prog-list .prog-row:not(.trait-slot-row)').forEach(row => {
            if (targetRow) return;
            const tag = row.querySelector('.lvl-tag');
            if (tag) {
                const tagLvl = parseInt((tag.textContent.match(/\d+/) || ['0'])[0]);
                if (tagLvl === lvl) targetRow = row;
            }
        });
    }

    // Fall back to first empty perk row
    if (!targetRow) {
        document.querySelectorAll('#prog-list .prog-row:not(.trait-slot-row)').forEach(row => {
            if (targetRow) return;
            if (!((row.querySelector('.prog-name-input')?.value || '').trim())) targetRow = row;
        });
    }

    if (targetRow) selectPerkInRow(targetRow, perk.name);

    // Close modal and hide banner
    const modal = document.getElementById('perk-picker-modal');
    if (modal) modal.style.display = 'none';
    const banner = document.getElementById('perk-lvlup-banner');
    if (banner) banner.style.display = 'none';
    _perkPickerLevel = null;

    showPerkToast(perk.name);
}

/* ===== STICKY NOTE EASTER EGG ===== */
let _stickyClicks = 0;
let _stickyActive = false;

function stickyNoteClick() {
    if (_stickyActive) return; // prevent retriggering mid-animation
    _stickyClicks++;
    const note = document.getElementById('sysop-note');
    const hint = document.getElementById('sticky-click-hint');

    // Update hint text with countdown
    const remaining = 5 - _stickyClicks;
    if (hint && remaining > 0) {
        hint.textContent = remaining <= 2 ? `(${remaining}...)` : `(click)`;
        // Micro-jolt on each click
        note.style.animation = 'none';
        void note.offsetHeight; // reflow
        note.style.animation = 'stickyJolt 0.25s ease forwards';
    }

    if (_stickyClicks >= 5) {
        _stickyActive = true;
        if (hint) hint.style.display = 'none';
        // Stop HC flicker, then shake + fall
        note.classList.add('sticky-falling');
        note.style.animation = 'stickyShake 0.5s ease, stickyFall 0.6s 0.5s ease forwards';
        setTimeout(() => {
            note.style.display = 'none';
            // Reveal doomsday note
            const doom = document.getElementById('doomsday-note');
            if (doom) {
                doom.style.display = 'block';
                doom.style.animation = 'doomReveal 0.5s ease forwards';
            }
            _stickyClicks = 0;
            _stickyActive = false;
        }, 1100);
    }
}

/* ===== INITIALIZATION ===== */
window.onload = () => {
    document.getElementById('tag-area').innerHTML = skills.map(s => `<div class="grid-item" onclick="toggleTag(this)"><input type="checkbox"><span class="tag-marker">[ ]</span><span>${s}</span></div>`).join('');
    renderUniques();
    renderUniqueArmor();
    const saved = localStorage.getItem('Nuclear_Sunset_Permanent_Vault');
    if (saved) {
        try {
            const raw = JSON.parse(saved);
            const safe = sanitizeImport(raw);
            if (safe) hydrate(safe);
            else { setMode('std', true); setOrigin('CW', true); renderImplants(); }
        } catch(e) {
            setMode('std', true); setOrigin('CW', true); renderImplants();
        }
    } else {
        setMode('std', true);
        setOrigin('CW', true);
        renderImplants();
    }
};
