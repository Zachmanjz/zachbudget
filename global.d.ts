
/**
 * Conflicting module augmentations for 'react' and 'lucide-react' were removed
 * because these modules are already typed in the project environment.
 */

// Custom module declaration for recharts as it might not have types in this environment.
declare module 'recharts' {
  export const BarChart: any;
  export const Bar: any;
  export const XAxis: any;
  export const YAxis: any;
  export const CartesianGrid: any;
  export const Tooltip: any;
  export const ResponsiveContainer: any;
  export const Cell: any;
  export const PieChart: any;
  export const Pie: any;
  export const Legend: any;
  export const LineChart: any;
  export const Line: any;
}

// Custom module declaration for @google/genai to provide basic typing for the Gemini SDK.
declare module '@google/genai' {
  export class GoogleGenAI {
    constructor(config: { apiKey: string });
    models: any;
    operations: any;
    chats: any;
    live: any;
  }
  export const Type: any;
  export const Modality: any;
  export type GenerateContentResponse = any;
  export type GenerateContentParameters = any;
  export type LiveServerMessage = any;
}

/**
 * AIStudio interface definition to ensure compatibility with existing
 * environment declarations for window.aistudio.
 */
interface AIStudio {
  hasSelectedApiKey: () => Promise<boolean>;
  openSelectKey: () => Promise<void>;
}

declare global {
  namespace NodeJS {
    interface ProcessEnv {
      API_KEY: string;
    }
  }

  interface Window {
    /**
     * Fix: Correcting the 'aistudio' property to use the 'AIStudio' type to resolve
     * the conflicting property declaration error and match environment expectations.
     */
    aistudio: AIStudio;
    webkitAudioContext: typeof AudioContext;
  }
}

export {};
