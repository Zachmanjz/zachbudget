
/**
 * Global type definitions for the application.
 * Redundant module declarations for libraries that already provide types (React, Lucide, Recharts, @google/genai)
 * have been removed to resolve definition conflicts and duplicate identifier errors.
 */

declare global {
  namespace NodeJS {
    interface ProcessEnv {
      API_KEY: string;
    }
  }

  interface AIStudio {
    hasSelectedApiKey: () => Promise<boolean>;
    openSelectKey: () => Promise<void>;
  }

  interface Window {
    aistudio: AIStudio;
    webkitAudioContext: typeof AudioContext;
  }
}

export {};
