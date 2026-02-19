import { create } from 'zustand';
import type { GeneratedProfile } from '@/types';
import { storage } from '@/lib/storage';
import { generateId } from '@/lib/utils';

const PROFILES_DIR = 'profiles';

function normalizeProfile(profile: GeneratedProfile): GeneratedProfile {
  if (profile.revisions && profile.revisions.length > 0) {
    return {
      ...profile,
      activeRevisionId: profile.activeRevisionId ?? profile.revisions[profile.revisions.length - 1].id,
    };
  }

  const initialRevisionId = generateId();
  return {
    ...profile,
    revisions: [
      {
        id: initialRevisionId,
        createdAt: profile.generatedAt,
        kind: 'generate',
        prompt: profile.prompt ?? 'Initial generation',
        snapshot: profile.profile,
      },
    ],
    activeRevisionId: initialRevisionId,
  };
}

interface ProfileState {
  profiles: GeneratedProfile[];
  activeProfile: GeneratedProfile | null;
  loaded: boolean;
  isGenerating: boolean;
  streamContent: string;
  currentPass: number;
  totalPasses: number;
  currentPassKeys: string[];
  loadProfiles: () => Promise<void>;
  addProfile: (profile: GeneratedProfile) => Promise<void>;
  duplicateProfile: (id: string) => Promise<GeneratedProfile | null>;
  deleteProfile: (id: string) => Promise<void>;
  setActiveProfile: (id: string | null) => void;
  updateProfile: (profile: GeneratedProfile) => Promise<void>;
  setGenerating: (generating: boolean) => void;
  setStreamContent: (content: string) => void;
  appendStreamContent: (token: string) => void;
  setPassInfo: (current: number, total: number, keys: string[]) => void;
  resetGenerationState: () => void;
}

export const useProfileStore = create<ProfileState>((set, get) => ({
  profiles: [],
  activeProfile: null,
  loaded: false,
  isGenerating: false,
  streamContent: '',
  currentPass: 0,
  totalPasses: 1,
  currentPassKeys: [],

  loadProfiles: async () => {
    await storage.ensureDir(PROFILES_DIR);
    const files = await storage.listDir(PROFILES_DIR);
    const profiles: GeneratedProfile[] = [];

    for (const file of files) {
      if (file.endsWith('.json')) {
        try {
          const profile = await storage.readJson<GeneratedProfile>(`${PROFILES_DIR}/${file}`);
          profiles.push(normalizeProfile(profile));
        } catch {
          // skip corrupt files
        }
      }
    }

    profiles.sort((a, b) => new Date(b.generatedAt).getTime() - new Date(a.generatedAt).getTime());
    set({ profiles, loaded: true });
  },

  addProfile: async (profile) => {
    const normalized = normalizeProfile(profile);
    await storage.writeJson(`${PROFILES_DIR}/${normalized.id}.json`, normalized);
    set((state) => ({
      profiles: [normalized, ...state.profiles],
      activeProfile: normalized,
    }));
  },

  duplicateProfile: async (id) => {
    const source = get().profiles.find((profile) => profile.id === id);
    if (!source) return null;

    const now = new Date().toISOString();
    const duplicateId = generateId();
    const duplicateRevisionId = generateId();
    const duplicateProfile = normalizeProfile({
      ...JSON.parse(JSON.stringify(source)) as GeneratedProfile,
      id: duplicateId,
      generatedAt: now,
      revisions: [
        ...((source.revisions ?? []).map((revision) => JSON.parse(JSON.stringify(revision)))),
        {
          id: duplicateRevisionId,
          createdAt: now,
          kind: 'fork',
          prompt: `Duplicated from ${source.id.slice(0, 8)}`,
          snapshot: JSON.parse(JSON.stringify(source.profile)) as Record<string, unknown>,
          parentRevisionId: source.activeRevisionId,
        },
      ],
      activeRevisionId: duplicateRevisionId,
    });

    await storage.writeJson(`${PROFILES_DIR}/${duplicateProfile.id}.json`, duplicateProfile);
    set((state) => ({
      profiles: [duplicateProfile, ...state.profiles],
      activeProfile: duplicateProfile,
    }));
    return duplicateProfile;
  },

  deleteProfile: async (id) => {
    await storage.deleteFile(`${PROFILES_DIR}/${id}.json`);
    set((state) => ({
      profiles: state.profiles.filter((p) => p.id !== id),
      activeProfile: state.activeProfile?.id === id ? null : state.activeProfile,
    }));
  },

  setActiveProfile: (id) => {
    if (id === null) {
      set({ activeProfile: null });
    } else {
      const profile = get().profiles.find((p) => p.id === id) ?? null;
      set({ activeProfile: profile });
    }
  },

  updateProfile: async (profile) => {
    const normalized = normalizeProfile(profile);
    await storage.writeJson(`${PROFILES_DIR}/${normalized.id}.json`, normalized);
    set((state) => ({
      profiles: state.profiles.map((p) => (p.id === normalized.id ? normalized : p)),
      activeProfile: state.activeProfile?.id === normalized.id ? normalized : state.activeProfile,
    }));
  },

  setGenerating: (generating) => set({ isGenerating: generating }),

  setStreamContent: (content) => set({ streamContent: content }),

  appendStreamContent: (token) =>
    set((state) => ({ streamContent: state.streamContent + token })),

  setPassInfo: (current, total, keys) =>
    set({ currentPass: current, totalPasses: total, currentPassKeys: keys }),

  resetGenerationState: () =>
    set({ isGenerating: false, streamContent: '', currentPass: 0, totalPasses: 1, currentPassKeys: [] }),
}));
