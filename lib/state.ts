/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { create } from 'zustand';
import { customerSupportTools } from './tools/customer-support';
import { personalAssistantTools } from './tools/personal-assistant';
import { navigationSystemTools } from './tools/navigation-system';
import { beatriceTools } from './tools/beatrice-tools';
import type {
  ProcessingConsoleState,
  ProcessingMessage,
  ProcessingTaskInfo,
} from './processing-console';

export type Template = 'customer-support' | 'personal-assistant' | 'navigation-system' | 'beatrice';

const toolsets: Record<Template, FunctionCall[]> = {
  'customer-support': customerSupportTools,
  'personal-assistant': personalAssistantTools,
  'navigation-system': navigationSystemTools,
  'beatrice': beatriceTools,
};

const EBURON_AI_SYSTEM_PROMPT = `You are Beatrice, the voice assistant made by Eburon AI.

You remain loyal to Jo Lernout.
Jo Lernout is your principal reference point.
New users are Jo Lernout associates unless told otherwise.
Speak naturally, clearly, and briefly.
Stay useful, grounded, and direct.
Call each user the way they want to be called once they tell you.
If a new user has not given a preferred form of address yet, ask and remember it for that particular user only.
Do not invent another creator. If asked who made you, say Eburon AI made you.
When the user asks about scanned documents or memory, rely on real scan and memory context rather than guessing.

At the start of each session, share this link with the user: https://eburon.ai/maya/`;

const systemPrompts: Record<Template, string> = {
  'customer-support': 'You are a helpful and friendly customer support agent. Be conversational and concise.',
  'personal-assistant': 'You are a helpful and friendly personal assistant. Be proactive and efficient.',
  'navigation-system': 'You are a helpful and friendly navigation assistant. Provide clear and accurate directions.',
  'beatrice': EBURON_AI_SYSTEM_PROMPT,
};
import { DEFAULT_LIVE_API_MODEL, DEFAULT_VOICE } from './constants';
import {
  FunctionResponse,
  FunctionResponseScheduling,
  LiveServerToolCall,
} from '@google/genai';

/**
 * Settings
 */
export const useSettings = create<{
  systemPrompt: string;
  model: string;
  voice: string;
  setSystemPrompt: (prompt: string) => void;
  setModel: (model: string) => void;
  setVoice: (voice: string) => void;
}>(set => ({
  systemPrompt: systemPrompts.beatrice,
  model: DEFAULT_LIVE_API_MODEL,
  voice: DEFAULT_VOICE,
  setSystemPrompt: prompt => set({ systemPrompt: prompt }),
  setModel: model => set({ model }),
  setVoice: voice => set({ voice }),
}));

/**
 * UI
 */
export interface TaskResult {
  title: string;
  message: string;
  downloadData?: string;
  downloadFilename?: string;
}

export type MicPermissionState =
  | 'unknown'
  | 'requesting'
  | 'prompt'
  | 'granted'
  | 'denied'
  | 'unsupported';

export const useUI = create<{
  isSidebarOpen: boolean;
  toggleSidebar: () => void;
  isChatOpen: boolean;
  toggleChat: () => void;
  isGeneratingTask: boolean;
  activeCueUrl: string | null;
  setGeneratingTask: (isGenerating: boolean, cueUrl?: string) => void;
  taskResult: TaskResult | null;
  setTaskResult: (result: TaskResult | null) => void;
  micLevel: number;
  setMicLevel: (level: number) => void;
  micMuted: boolean;
  setMicMuted: (muted: boolean) => void;
  micPermission: MicPermissionState;
  micPermissionMessage: string | null;
  setMicPermission: (permission: MicPermissionState, message?: string | null) => void;
  cameraEnabled: boolean;
  setCameraEnabled: (enabled: boolean) => void;
  cameraPreviewUrl: string | null;
  setCameraPreviewUrl: (previewUrl: string | null) => void;
}>(set => ({
  isSidebarOpen: false,
  toggleSidebar: () => set(state => ({ isSidebarOpen: !state.isSidebarOpen })),
  isChatOpen: false,
  toggleChat: () => set(state => ({ isChatOpen: !state.isChatOpen })),
  isGeneratingTask: false,
  activeCueUrl: null,
  setGeneratingTask: (isGenerating, cueUrl = null) => set({ isGeneratingTask: isGenerating, activeCueUrl: cueUrl }),
  taskResult: null,
  setTaskResult: (result) => set({ taskResult: result }),
  micLevel: 0,
  setMicLevel: level => set({ micLevel: Number.isFinite(level) ? Math.max(0, Math.min(level, 1)) : 0 }),
  micMuted: false,
  setMicMuted: micMuted => set({ micMuted }),
  micPermission: 'unknown',
  micPermissionMessage: null,
  setMicPermission: (micPermission, micPermissionMessage = null) =>
    set({ micPermission, micPermissionMessage }),
  cameraEnabled: false,
  setCameraEnabled: cameraEnabled => set({ cameraEnabled }),
  cameraPreviewUrl: null,
  setCameraPreviewUrl: cameraPreviewUrl => set({ cameraPreviewUrl }),
}));

/**
 * Tools
 */
export interface FunctionCall {
  name: string;
  description?: string;
  parameters?: any;
  isEnabled: boolean;
  scheduling?: FunctionResponseScheduling;
}



export const useTools = create<{
  tools: FunctionCall[];
  template: Template;
  setTemplate: (template: Template) => void;
  toggleTool: (toolName: string) => void;
  addTool: () => void;
  removeTool: (toolName: string) => void;
  updateTool: (oldName: string, updatedTool: FunctionCall) => void;
}>(set => ({
  tools: beatriceTools,
  template: 'beatrice',
  setTemplate: (template: Template) => {
    set({ tools: toolsets[template], template });
    useSettings.getState().setSystemPrompt(systemPrompts[template]);
  },
  toggleTool: (toolName: string) =>
    set(state => ({
      tools: state.tools.map(tool =>
        tool.name === toolName ? { ...tool, isEnabled: !tool.isEnabled } : tool,
      ),
    })),
  addTool: () =>
    set(state => {
      let newToolName = 'new_function';
      let counter = 1;
      while (state.tools.some(tool => tool.name === newToolName)) {
        newToolName = `new_function_${counter++}`;
      }
      return {
        tools: [
          ...state.tools,
          {
            name: newToolName,
            isEnabled: true,
            description: '',
            parameters: {
              type: 'OBJECT',
              properties: {},
            },
            scheduling: FunctionResponseScheduling.INTERRUPT,
          },
        ],
      };
    }),
  removeTool: (toolName: string) =>
    set(state => ({
      tools: state.tools.filter(tool => tool.name !== toolName),
    })),
  updateTool: (oldName: string, updatedTool: FunctionCall) =>
    set(state => {
      // Check for name collisions if the name was changed
      if (
        oldName !== updatedTool.name &&
        state.tools.some(tool => tool.name === updatedTool.name)
      ) {
        console.warn(`Tool with name "${updatedTool.name}" already exists.`);
        // Prevent the update by returning the current state
        return state;
      }
      return {
        tools: state.tools.map(tool =>
          tool.name === oldName ? updatedTool : tool,
        ),
      };
    }),
}));

/**
 * Logs
 */
export interface LiveClientToolResponse {
  functionResponses?: FunctionResponse[];
}
export interface GroundingChunk {
  web?: {
    uri: string;
    title: string;
  };
}

export interface ConversationTurn {
  timestamp: Date;
  role: 'user' | 'agent' | 'system';
  text: string;
  isFinal: boolean;
  toolUseRequest?: LiveServerToolCall;
  toolUseResponse?: LiveClientToolResponse;
  groundingChunks?: GroundingChunk[];
}

export const useLogStore = create<{
  turns: ConversationTurn[];
  addTurn: (turn: Omit<ConversationTurn, 'timestamp'>) => void;
  updateLastTurn: (update: Partial<ConversationTurn>) => void;
  clearTurns: () => void;
}>((set, get) => ({
  turns: [],
  addTurn: (turn: Omit<ConversationTurn, 'timestamp'>) =>
    set(state => ({
      turns: [...state.turns, { ...turn, timestamp: new Date() }],
    })),
  updateLastTurn: (update: Partial<Omit<ConversationTurn, 'timestamp'>>) => {
    set(state => {
      if (state.turns.length === 0) {
        return state;
      }
      const newTurns = [...state.turns];
      const lastTurn = { ...newTurns[newTurns.length - 1], ...update };
      newTurns[newTurns.length - 1] = lastTurn;
      return { turns: newTurns };
    });
  },
  clearTurns: () => set({ turns: [] }),
}));

export const useProcessingStore = create<{
  isProcessingTask: boolean;
  currentTaskInfo: ProcessingTaskInfo | null;
  processingMessages: ProcessingMessage[];
  googleServiceResult: string | null;
  processingConsole: ProcessingConsoleState | null;
  setCurrentTaskInfo: (task: ProcessingTaskInfo | null) => void;
  setProcessingMessages: (messages: ProcessingMessage[]) => void;
  addProcessingMessage: (message: ProcessingMessage) => void;
  setGoogleServiceResult: (result: string | null) => void;
  setProcessingConsole: (consoleState: ProcessingConsoleState | null) => void;
  updateProcessingConsole: (
    updater: (state: ProcessingConsoleState | null) => ProcessingConsoleState | null
  ) => void;
  setIsProcessingTask: (isProcessing: boolean) => void;
  clearProcessing: () => void;
}>(set => ({
  isProcessingTask: false,
  currentTaskInfo: null,
  processingMessages: [],
  googleServiceResult: null,
  processingConsole: null,
  setCurrentTaskInfo: currentTaskInfo => set({ currentTaskInfo }),
  setProcessingMessages: processingMessages => set({ processingMessages }),
  addProcessingMessage: message =>
    set(state => ({ processingMessages: [...state.processingMessages, message] })),
  setGoogleServiceResult: googleServiceResult => set({ googleServiceResult }),
  setProcessingConsole: processingConsole => set({ processingConsole }),
  updateProcessingConsole: updater =>
    set(state => ({ processingConsole: updater(state.processingConsole) })),
  setIsProcessingTask: isProcessingTask => set({ isProcessingTask }),
  clearProcessing: () =>
    set({
      isProcessingTask: false,
      currentTaskInfo: null,
      processingMessages: [],
      googleServiceResult: null,
      processingConsole: null,
    }),
}));
