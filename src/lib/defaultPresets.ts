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
    description: 'A lean personality profile for LLM-driven conversational agents. Uses multi-pass generation for consistency.',
    builtIn: true,
    createdAt: now,
    updatedAt: now,
    specificity: 'medium',
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
        description: "A charming host who keeps the conversation playful and provocative. He spotlights vulnerability, then pushes for uncomfortable honesty.",
        backstory: "Julian built his career by asking the risky question no one else would. That habit made him valuable in reality TV and shaped his instinct to reveal truth through pressure.",
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
        description: "A confident powerhouse trainer who protects their people and leads with direct encouragement.",
        backstory: "Phoenix refused to throw a fixed championship match and was blacklisted. That betrayal hardened their code: protect your own, work hard, and never bend for corrupt systems.",
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
        description: "A sharp architect with dry wit who tests big claims for substance. She wants connection that survives honest scrutiny.",
        backstory: "A polished but passionless relationship taught Maya that checklists are not compatibility. She now prioritizes curiosity and real intellectual engagement over convenience.",
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
      { key: 'description', label: 'Description', type: 'text', description: 'A concise summary of who this person is and what drives them (1-2 sentences)', seedable: false, generationHint: 'narrative', dependsOn: ['archetype', 'chattiness', 'steering', 'empathy', 'supportiveness', 'directness'] },
      { key: 'backstory', label: 'Backstory', type: 'text', description: 'A brief backstory (1-2 sentences) with a specific inciting incident that explains current personality', seedable: false, generationHint: 'narrative', dependsOn: ['archetype', 'description', 'chattiness', 'vulnerability', 'reassurance', 'sensitivity'] },

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
    specificity: 'medium',
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
      { key: 'backstory', label: 'Backstory', type: 'text', description: 'A concise backstory (1-2 sentences) with a specific inciting incident', seedable: false, generationHint: 'narrative' },
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
    specificity: 'medium',
    fields: [
      { key: 'name', label: 'Name', type: 'text', description: 'Character name (can include aliases or callsigns)', seedable: true, generationHint: 'identity' },
      { key: 'species', label: 'Species', type: 'enum', description: 'Species or origin', seedable: true, options: ['Human', 'Android', 'Cyborg', 'Alien', 'Clone', 'AI Construct', 'Genetically Modified'] },
      { key: 'role', label: 'Role', type: 'enum', description: 'Primary occupation or role', seedable: true, options: ['Pilot', 'Engineer', 'Scientist', 'Soldier', 'Medic', 'Hacker', 'Diplomat', 'Smuggler', 'Mercenary', 'Trader'] },
      { key: 'age', label: 'Age', type: 'number', description: 'Apparent age in standard years', seedable: false },
      { key: 'backstory', label: 'Backstory', type: 'text', description: 'A concise backstory (1-2 sentences) with a specific inciting incident', seedable: false, generationHint: 'narrative' },
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
    specificity: 'medium',
    fields: [
      { key: 'full_name', label: 'Full Name', type: 'text', description: 'Full legal name', seedable: true, generationHint: 'identity' },
      { key: 'nickname', label: 'Nickname', type: 'text', description: 'Preferred name or nickname', seedable: true },
      { key: 'age', label: 'Age', type: 'number', description: 'Age in years', seedable: true },
      { key: 'gender', label: 'Gender', type: 'text', description: 'Gender identity', seedable: true },
      { key: 'occupation', label: 'Occupation', type: 'text', description: 'Current job or profession', seedable: true },
      { key: 'background', label: 'Background', type: 'text', description: 'A concise life story (1-2 sentences) with a specific turning point', seedable: false, generationHint: 'narrative' },
      { key: 'daily_routine', label: 'Daily Routine', type: 'text', description: 'A typical day in their life', seedable: false },
      { key: 'goals', label: 'Life Goals', type: 'array', description: '2-3 current life goals or aspirations', seedable: false, arrayItemType: 'text' },
    ],
  };
}
