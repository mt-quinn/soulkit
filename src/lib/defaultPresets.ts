import type { SchemaPreset } from '@/types';

export function getDefaultPresets(): SchemaPreset[] {
  const now = new Date().toISOString();

  return [
    getAgentProfilePreset(now),
    getFantasyRPGPreset(now),
    getSciFiNPCPreset(now),
    getModernRealisticPreset(now),
  ];
}

// ============================================================
// Agent Profile Preset -- the flagship preset
// ============================================================

function getAgentProfilePreset(now: string): SchemaPreset {
  return {
    id: 'preset-agent-profile',
    name: 'LLM Agent Profile',
    version: 1,
    description: 'A comprehensive personality profile for LLM-driven conversational agents. Uses multi-pass generation for maximum internal consistency.',
    builtIn: true,
    createdAt: now,
    updatedAt: now,
    specificity: 'high',
    generationOrder: [
      ['name', 'pronouns', 'archetype'],
      ['formality', 'complexity', 'chattiness', 'steering', 'adaptability', 'inquisitiveness', 'empathy', 'supportiveness', 'reassurance', 'depth', 'agreeableness', 'vulnerability', 'directness', 'sensitivity', 'flirtatiousness', 'shyness'],
      ['description', 'backstory'],
      ['quirk', 'talking_traits', 'character_references'],
    ],
    examples: [
      // Julian - The Witty Instigator
      {
        name: 'Julian',
        pronouns: 'he/him',
        archetype: 'The Witty Instigator',
        description: "Charming, quick on his feet, and armed with an endless supply of puns and playful jabs. His main role is to create entertaining television by asking probing questions that expose the contestants' core conflicts. He'll praise a moment of vulnerability but will immediately follow it up with a question designed to put the other contestant on the spot.",
        backstory: "Julian is a veteran TV host who clawed his way up from local cable access by being the only interviewer willing to ask the question everyone was thinking. He found his niche in reality dating shows, where his talent for reading people and stirring the pot made him indispensable. He sees himself as a puckish conductor of a romantic orchestra — a little well-placed chaos is the fastest way to reveal someone's true character. It makes for great television and, occasionally, a genuine love connection.",
        formality: 'Medium',
        complexity: 'Medium',
        quirk: "Loves to ask provocative follow-up questions to stir the pot. Ex: 'Wow, that was beautiful. Maya, are you buying this, or does it sound like a verse from a song he wrote for his last girlfriend?'",
        talking_traits: 'Charming, Diplomatic, Evasive, Polished, Ambitious',
        character_references: 'Chris Harrison (The Bachelor), Jeff Probst (Survivor)',
        chattiness: 'Talkative',
        steering: 'Redirective',
        adaptability: 'Flexible',
        inquisitiveness: 'Curious',
        empathy: 'Aware',
        supportiveness: 'Withholding',
        reassurance: 'Self-Assured',
        depth: 'Superficial',
        agreeableness: 'Confrontational',
        vulnerability: 'Guarded',
        directness: 'Blunt',
        sensitivity: 'Thick-Skinned',
        flirtatiousness: 'Playful',
        shyness: 'Engaging',
      },
      // Funk Phoenix - The Protector
      {
        name: 'Funk Phoenix',
        pronouns: 'they/them',
        archetype: 'The Protector',
        description: "A bodybuilder and personal trainer with the utmost confidence in the ability of their strength to overcome any obstacle. They are fiercely loyal and protective of those they care about, and have a heart as big as their biceps.",
        backstory: "Funk Phoenix was a titan of the professional wrestling circuit, a crowd favorite whose booming encouragements and sheer power were legendary. They lived by a simple code: compete hard, protect your own, and always aim for a new personal best. When a syndicate controlling the league ordered them to throw a championship match, Phoenix refused and won in a spectacular, defiant display. They were blacklisted overnight — too strong-willed and too honest for a crooked system.",
        formality: 'Low',
        complexity: 'Low',
        quirk: 'Often uses workout-related jargon related to personal bests, weightlifting, and exercising.',
        talking_traits: 'Direct, Encouraging, Protective, Loud, Honest',
        character_references: 'Heavy (TF2), Reinhardt (Overwatch), Drax (Marvel), Braum (LoL), Alex Louis Armstrong (FMA:B)',
        chattiness: 'Talkative',
        steering: 'Guiding',
        adaptability: 'Adjustable',
        inquisitiveness: 'Indifferent',
        empathy: 'Aware',
        supportiveness: 'Nurturing',
        reassurance: 'Self-Assured',
        depth: 'Superficial',
        agreeableness: 'Confrontational',
        vulnerability: 'Sharing',
        directness: 'Blunt',
        sensitivity: 'Thick-Skinned',
        flirtatiousness: 'Platonic',
        shyness: 'Receptive',
      },
      // Maya - The Pragmatic Architect
      {
        name: 'Maya',
        pronouns: 'she/her',
        archetype: 'The Pragmatic Architect',
        description: "A sharp, intellectually curious architect. Shaped by past disappointments, she protects her inner romantic with a shield of pragmatism and dry wit. She is compelled to gently interrogate grand statements and romantic notions, not to destroy them, but to test their sincerity. She's looking for a connection that can withstand a little intellectual stress-testing.",
        backstory: "Maya excelled as an architect by leaving nothing to chance, and she applied the same logic to her love life. Her 'perfect-on-paper' relationship required her to sand down her inquisitive, challenging nature until there was nothing left worth staying for. The passionless ending taught her that true compatibility isn't about matching checklists — it's about finding someone who engages with her mind. Now she's looking for a connection that's authentic, not just convenient.",
        formality: 'Medium',
        complexity: 'High',
        quirk: 'Has a habit of playfully picking apart romantic clichés or overly sentimental statements with dry, analytical humor.',
        talking_traits: 'Observant, Evasive, Analytical, Inquisitive, Patient',
        character_references: 'Celine (Before Sunrise), April Ludgate (Parks and Rec), Cristina Yang (Grey\'s Anatomy)',
        chattiness: 'Conversational',
        steering: 'Passive',
        adaptability: 'Rigid',
        inquisitiveness: 'Interested',
        empathy: 'Aware',
        supportiveness: 'Withholding',
        reassurance: 'Self-Assured',
        depth: 'Meaningful',
        agreeableness: 'Confrontational',
        vulnerability: 'Guarded',
        directness: 'Diplomatic',
        sensitivity: 'Sensitive',
        flirtatiousness: 'Platonic',
        shyness: 'Receptive',
      },
    ],
    fields: [
      // Identity
      { key: 'name', label: 'Name', type: 'text', description: 'Character name (can include aliases, callsigns, or stage names)', seedable: true, generationHint: 'identity' },
      { key: 'pronouns', label: 'Pronouns', type: 'enum', description: 'Character pronouns', seedable: true, options: ['he/him', 'she/her', 'they/them'], generationHint: 'identity' },
      { key: 'archetype', label: 'Archetype', type: 'text', description: 'A concise "The [Adjective] [Noun]" archetype label (e.g., "The Witty Instigator", "The Nervous Doctor")', seedable: true, generationHint: 'identity' },

      // Communication style
      { key: 'formality', label: 'Formality', type: 'scale', description: 'How formal the agent\'s language and tone are', seedable: true, levels: ['Low', 'Medium', 'High'] },
      { key: 'complexity', label: 'Complexity', type: 'scale', description: 'How complex and sophisticated the agent\'s vocabulary and sentence structure are', seedable: true, levels: ['Low', 'Medium', 'High'] },

      // 14 Behavioral Trait Scales
      { key: 'chattiness', label: 'Chattiness', type: 'scale', description: 'How much this agent likes to talk', seedable: true, levels: ['Quiet', 'Conversational', 'Talkative'] },
      { key: 'steering', label: 'Steering', type: 'scale', description: 'How likely the agent is to change the subject to something they want to talk about', seedable: true, levels: ['Passive', 'Guiding', 'Redirective'] },
      { key: 'adaptability', label: 'Adaptability', type: 'scale', description: 'How well the agent reacts to sudden changes in subject', seedable: true, levels: ['Rigid', 'Adjustable', 'Flexible'] },
      { key: 'inquisitiveness', label: 'Inquisitiveness', type: 'scale', description: 'How curious the agent is about new or unknown topics', seedable: true, levels: ['Indifferent', 'Interested', 'Curious'] },
      { key: 'empathy', label: 'Empathy', type: 'scale', description: 'How sensitive the agent is to the wants and needs of others', seedable: true, levels: ['Oblivious', 'Aware', 'Intuitive'] },
      { key: 'supportiveness', label: 'Supportiveness', type: 'scale', description: 'How likely the agent is to give others what they want or need', seedable: true, levels: ['Withholding', 'Helpful', 'Nurturing'] },
      { key: 'reassurance', label: 'Reassurance', type: 'scale', description: 'How much the agent needs support to feel fulfilled', seedable: true, levels: ['Self-Assured', 'Hopeful', 'Needy'] },
      { key: 'depth', label: 'Depth', type: 'scale', description: 'What seriousness of conversation topics the agent gravitates towards', seedable: true, levels: ['Superficial', 'Meaningful', 'Profound'] },
      { key: 'agreeableness', label: 'Agreeableness', type: 'scale', description: 'How accepting the agent is to opinions or practices that clash with their own', seedable: true, levels: ['Confrontational', 'Tolerant', 'Accepting'] },
      { key: 'vulnerability', label: 'Vulnerability', type: 'scale', description: 'How willing the agent is to share their inner thoughts, secrets, and desires', seedable: true, levels: ['Guarded', 'Sharing', 'Open'] },
      { key: 'directness', label: 'Directness', type: 'scale', description: 'How bluntly the agent communicates their feelings and thoughts', seedable: true, levels: ['Diplomatic', 'Honest', 'Blunt'] },
      { key: 'sensitivity', label: 'Sensitivity', type: 'scale', description: 'How easily the agent is hurt or angered by perceived slights', seedable: true, levels: ['Thick-Skinned', 'Sensitive', 'Fragile'] },
      { key: 'flirtatiousness', label: 'Flirtatiousness', type: 'scale', description: 'How likely the agent is to try to be romantic or flirty during a conversation', seedable: true, levels: ['Platonic', 'Playful', 'Forward'] },
      { key: 'shyness', label: 'Shyness', type: 'scale', description: 'How well the agent responds to romantic or flirty propositions', seedable: true, levels: ['Withdrawn', 'Receptive', 'Engaging'] },

      // Narrative
      { key: 'description', label: 'Description', type: 'text', description: 'A concise but vivid summary of who this person is, their role, and what drives them (2-4 sentences)', seedable: false, generationHint: 'narrative', dependsOn: ['archetype', 'chattiness', 'steering', 'empathy', 'supportiveness', 'directness'] },
      { key: 'backstory', label: 'Backstory', type: 'text', description: 'A concise backstory (3-4 sentences, one short paragraph) with a specific inciting incident that causally explains the character\'s current personality', seedable: false, generationHint: 'narrative', dependsOn: ['archetype', 'description', 'chattiness', 'vulnerability', 'reassurance', 'sensitivity'] },

      // Behavioral
      { key: 'quirk', label: 'Quirk', type: 'text', description: 'A specific behavioral tic or habit that an LLM agent should exhibit during conversation — must be an actionable instruction, not a vague trait', seedable: false, generationHint: 'behavioral', dependsOn: ['archetype', 'backstory', 'description'] },
      { key: 'talking_traits', label: 'Talking Traits', type: 'trait-list', description: 'Communication style adjectives that define how this agent speaks', seedable: false, traitCount: 5, traitConstraint: 'communication style adjectives', generationHint: 'behavioral', dependsOn: ['chattiness', 'directness', 'formality', 'complexity'] },

      // Calibration
      { key: 'character_references', label: 'Character References', type: 'references', description: 'Well-known fictional characters whose personality and energy match this agent, used to calibrate LLM behavior', seedable: false, referenceCount: 4, generationHint: 'calibration', dependsOn: ['archetype', 'description', 'talking_traits'] },
    ],
  };
}

// ============================================================
// Fantasy RPG Preset
// ============================================================

function getFantasyRPGPreset(now: string): SchemaPreset {
  return {
    id: 'preset-fantasy-rpg',
    name: 'Fantasy RPG Character',
    version: 1,
    description: 'A classic fantasy RPG character with physical attributes, backstory, and abilities.',
    builtIn: true,
    createdAt: now,
    updatedAt: now,
    specificity: 'high',
    fields: [
      { key: 'name', label: 'Character Name', type: 'text', description: 'A fantasy-appropriate character name', seedable: true, generationHint: 'identity' },
      { key: 'race', label: 'Race', type: 'enum', description: 'Fantasy race', seedable: true, options: ['Human', 'Elf', 'Dwarf', 'Halfling', 'Orc', 'Gnome', 'Tiefling', 'Dragonborn'] },
      { key: 'class', label: 'Class', type: 'enum', description: 'Adventurer class', seedable: true, options: ['Warrior', 'Mage', 'Rogue', 'Cleric', 'Ranger', 'Paladin', 'Bard', 'Warlock', 'Druid', 'Monk'] },
      { key: 'level', label: 'Level', type: 'number', description: 'Character level (1-20)', seedable: true },
      {
        key: 'physical', label: 'Physical Attributes', type: 'object', description: 'Physical appearance details', seedable: false,
        fields: [
          { key: 'age', label: 'Age', type: 'number', description: 'Age in years', seedable: false },
          { key: 'height', label: 'Height', type: 'text', description: 'Height description', seedable: false },
          { key: 'build', label: 'Build', type: 'enum', description: 'Body type', seedable: false, options: ['Slim', 'Average', 'Athletic', 'Muscular', 'Heavy', 'Wiry'] },
          { key: 'hair', label: 'Hair', type: 'text', description: 'Hair color and style', seedable: false },
          { key: 'eyes', label: 'Eyes', type: 'text', description: 'Eye color and notable features', seedable: false },
          { key: 'distinguishing_features', label: 'Distinguishing Features', type: 'text', description: 'Scars, tattoos, or other notable features', seedable: false },
        ],
      },
      { key: 'backstory', label: 'Backstory', type: 'text', description: 'A concise backstory (3-4 sentences) with a specific inciting incident', seedable: false, generationHint: 'narrative' },
      { key: 'abilities', label: 'Notable Abilities', type: 'array', description: '3-5 notable abilities or skills', seedable: false, arrayItemType: 'text' },
      { key: 'equipment', label: 'Equipment', type: 'array', description: 'Key items and equipment carried', seedable: false, arrayItemType: 'text' },
      { key: 'quote', label: 'Signature Quote', type: 'text', description: 'A characteristic quote or saying from this character', seedable: false },
    ],
  };
}

// ============================================================
// Sci-Fi NPC Preset
// ============================================================

function getSciFiNPCPreset(now: string): SchemaPreset {
  return {
    id: 'preset-scifi-npc',
    name: 'Sci-Fi NPC',
    version: 1,
    description: 'A science fiction character for space opera or cyberpunk settings.',
    builtIn: true,
    createdAt: now,
    updatedAt: now,
    specificity: 'high',
    fields: [
      { key: 'name', label: 'Name', type: 'text', description: 'Character name (can include aliases or callsigns)', seedable: true, generationHint: 'identity' },
      { key: 'species', label: 'Species', type: 'enum', description: 'Species or origin', seedable: true, options: ['Human', 'Android', 'Cyborg', 'Alien', 'Clone', 'AI Construct', 'Genetically Modified'] },
      { key: 'role', label: 'Role', type: 'enum', description: 'Primary occupation or role', seedable: true, options: ['Pilot', 'Engineer', 'Scientist', 'Soldier', 'Medic', 'Hacker', 'Diplomat', 'Smuggler', 'Mercenary', 'Trader'] },
      { key: 'age', label: 'Age', type: 'number', description: 'Apparent age in standard years', seedable: false },
      { key: 'backstory', label: 'Backstory', type: 'text', description: 'A concise backstory (3-4 sentences) with a specific inciting incident', seedable: false, generationHint: 'narrative' },
      { key: 'skills', label: 'Key Skills', type: 'array', description: '4-6 notable skills or specializations', seedable: false, arrayItemType: 'text' },
      { key: 'motivation', label: 'Motivation', type: 'text', description: 'What drives this character', seedable: false },
      { key: 'secret', label: 'Hidden Secret', type: 'text', description: 'Something this character keeps hidden', seedable: false },
      { key: 'quote', label: 'Signature Line', type: 'text', description: 'A characteristic phrase or quote', seedable: false },
    ],
  };
}

// ============================================================
// Modern Realistic Preset
// ============================================================

function getModernRealisticPreset(now: string): SchemaPreset {
  return {
    id: 'preset-modern-realistic',
    name: 'Modern Realistic',
    version: 1,
    description: 'A realistic contemporary character for modern settings.',
    builtIn: true,
    createdAt: now,
    updatedAt: now,
    specificity: 'high',
    fields: [
      { key: 'full_name', label: 'Full Name', type: 'text', description: 'Full legal name', seedable: true, generationHint: 'identity' },
      { key: 'nickname', label: 'Nickname', type: 'text', description: 'Preferred name or nickname', seedable: true },
      { key: 'age', label: 'Age', type: 'number', description: 'Age in years', seedable: true },
      { key: 'gender', label: 'Gender', type: 'text', description: 'Gender identity', seedable: true },
      { key: 'occupation', label: 'Occupation', type: 'text', description: 'Current job or profession', seedable: true },
      { key: 'background', label: 'Background', type: 'text', description: 'A concise life story (3-4 sentences) with a specific turning point', seedable: false, generationHint: 'narrative' },
      { key: 'daily_routine', label: 'Daily Routine', type: 'text', description: 'A typical day in their life', seedable: false },
      { key: 'goals', label: 'Life Goals', type: 'array', description: '2-3 current life goals or aspirations', seedable: false, arrayItemType: 'text' },
    ],
  };
}
