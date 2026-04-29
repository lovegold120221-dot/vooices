/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
/**
 * Copyright 2024 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { auth, signInWithGoogle, logout } from './lib/firebase';
import { rtdb } from './lib/firebase';
import { ref, set, onValue } from 'firebase/database';

import ErrorScreen from './components/demo/ErrorScreen';
import AuthScreen from './components/demo/AuthScreen';
import StreamingConsole from './components/demo/streaming-console/StreamingConsole';
import DocumentScannerModal from './components/document/DocumentScannerModal';
import UserProfileOnboardingModal from './components/user/UserProfileOnboardingModal';
import EburonFlixOverlay from './components/eburonflix/EburonFlixOverlay';
import { useEburonFlixStore } from './lib/eburonflix/store';
import {
  extractChatAttachment,
  describeImage,
  buildChatPromptForAttachment,
  attachmentIcon,
  attachmentLabel,
  type ChatAttachment,
  type AttachmentKind,
} from './lib/chat-attachments';

import Header from './components/Header';
import Sidebar from './components/Sidebar';
import { LiveAPIProvider } from './contexts/LiveAPIContext';
import { useUserProfileStore } from './lib/user-profile-store';
import { useLogStore, useProcessingStore, useSettings, useUI } from './lib/state';
import { AVAILABLE_VOICES } from './lib/constants';
import { detectTaskType, getBeatriceOpening, getNextEntertainment, getEngagementTimeout } from './lib/task-engagement';
import { getEffectiveUserId, createId, nowIso, detectLanguageHeuristically, normalizeWhitespace } from './lib/document/utils';
import type { ScannedDocumentRecord, DocumentSourceType } from './lib/document/types';
import { executeGoogleService } from './lib/google-services';
import {
  PROCESSING_SERVICE_VISUALS,
  createProcessingConsole,
  getProcessingServiceKeys,
  toProcessingTaskInfo,
  updateProcessingStep,
  type ProcessingServiceKey,
} from './lib/processing-console';

const API_KEY = import.meta.env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY;

// ─── DeepSeek Config ──────────────────────────────────
const DEEPSEEK_KEY = 'sk-15eab83ce74d4dfab037753a5ffef27c';
const DEEPSEEK_URL = 'https://api.deepseek.com/chat/completions';
const DEFAULT_SYSTEM_PROMPT = 'You are Beatrice, a helpful, thoughtful, and intelligent AI assistant. You reason deeply before answering. Be warm, articulate, and thorough.';

// ─── Conversation Types ──────────────────────────────
interface ChatAttachmentMeta {
  kind: AttachmentKind;
  filename: string;
  size: number;
  mimeType: string;
  /** Data URL (only kept for image attachments — small enough to render). */
  imageDataUrl?: string;
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
  reasoning_content?: string;
  timestamp: number;
  source?: string;
  attachment?: ChatAttachmentMeta;
}

interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  createdAt: number;
  updatedAt: number;
}

function renderProcessingServiceVisual(serviceKey: ProcessingServiceKey) {
  const service = PROCESSING_SERVICE_VISUALS[serviceKey];

  if (service.mode === 'scan') {
    return (
      <div className="workspace-service-visual workspace-mail-scan" style={{ '--service-accent': service.accent } as React.CSSProperties}>
        <i className={service.icon} style={{ color: service.accent, fontSize: 28 }}></i>
      </div>
    );
  }

  if (service.mode === 'flip') {
    return (
      <div className="workspace-service-visual workspace-cal-flip">
        <i className={service.icon} style={{ color: service.accent, fontSize: 34 }}></i>
      </div>
    );
  }

  if (service.mode === 'lines') {
    return (
      <div className="workspace-lines-visual">
        <span></span>
        <span></span>
        <span></span>
      </div>
    );
  }

  if (service.mode === 'grid') {
    return <div className="workspace-grid-visual" style={{ '--service-accent': service.accent } as React.CSSProperties}></div>;
  }

  if (service.mode === 'buffer') {
    return (
      <div className="workspace-buffer-visual">
        <div className="workspace-buffer-line" style={{ '--service-accent': service.accent } as React.CSSProperties}></div>
      </div>
    );
  }

  if (service.mode === 'bubbles') {
    return (
      <div className="workspace-bubbles-visual">
        <span style={{ '--service-accent': service.accent } as React.CSSProperties}></span>
        <span style={{ '--service-accent': service.accent } as React.CSSProperties}></span>
        <span style={{ '--service-accent': service.accent } as React.CSSProperties}></span>
      </div>
    );
  }

  if (service.mode === 'wave') {
    return (
      <div className="workspace-wave-visual">
        <span style={{ '--service-accent': service.accent } as React.CSSProperties}></span>
        <span style={{ '--service-accent': service.accent } as React.CSSProperties}></span>
        <span style={{ '--service-accent': service.accent } as React.CSSProperties}></span>
      </div>
    );
  }

  return (
    <div className="workspace-service-visual workspace-pulse-visual" style={{ '--service-accent': service.accent } as React.CSSProperties}>
      <i className={service.icon} style={{ color: service.accent, fontSize: 28 }}></i>
    </div>
  );
}

function MissingApiKeyScreen() {
  return (
    <div className="auth-page">
      <div className="ambient-glow glow-1" />
      <div className="ambient-glow glow-2" />
      <main className="auth-main-stage">
        <div className="auth-brand-indicator">
          <div className="auth-brand-title">
            <div className="auth-status-dot" />
            Beatrice Playground
          </div>
          <div className="auth-brand-subtitle">Local environment setup required</div>
        </div>
        <div className="auth-modal">
          <div className="auth-modal-header">
            <h1>Missing Gemini API key</h1>
            <p>
              Add your Gemini key, then restart the dev server.
            </p>
          </div>
          <div className="auth-methods">
            <div className="auth-btn-secondary" style={{ justifyContent: 'flex-start', cursor: 'default' }}>
              <code>GEMINI_API_KEY=your_key_here</code>
            </div>
            <div className="auth-modal-footer" style={{ width: '100%', textAlign: 'left' }}>
              Create <code>.env.local</code> in the project root, add the key above, then run <code>npm run dev</code>.
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// APP SHELL — The main page-router UI from frontend.html
// ═══════════════════════════════════════════════════════
function AppShell({ children }: { children: React.ReactNode }) {
  const [currentView, setCurrentView] = useState('view-splash');
  const [navHistory, setNavHistory] = useState<string[]>(['view-splash']);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [userLoaded, setUserLoaded] = useState(false);

  // Chat state
  const [chatInput, setChatInput] = useState('');
  const [chatMessages, setChatMessages] = useState<Message[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const [systemPrompt, setSystemPrompt] = useState(DEFAULT_SYSTEM_PROMPT);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);

  // Image/Video
  const [imageInput, setImageInput] = useState('');
  const [videoInput, setVideoInput] = useState('');
  const [imageMessages, setImageMessages] = useState<{ role: string; content: string }[]>([]);
  const [videoMessages, setVideoMessages] = useState<{ role: string; content: string }[]>([]);

  // Profile edit
  const [showEditProfile, setShowEditProfile] = useState(false);
  const [editName, setEditName] = useState('');
  const [editAddress, setEditAddress] = useState('');
  const liveVoice = useSettings(state => state.voice);
  const setLiveVoice = useSettings(state => state.setVoice);

  // Settings
  const [tempValue, setTempValue] = useState(1.0);
  const [settingsTab, setSettingsTab] = useState<'general' | 'integration'>('general');

  // Ollama Integration
  const [localCfg, setLocalCfg] = useState<{baseUrl: string; enabled: boolean; model: string}>(() => {
    try {
      return JSON.parse(localStorage.getItem('localLLMConfig') || '{}');
    } catch { return { baseUrl: 'http://168.231.78.113:11434', enabled: false, model: '' }; }
  });
  const [ollamaModels, setOllamaModels] = useState<{name: string}[]>([]);
  const [ollamaStatus, setOllamaStatus] = useState('Not connected');
  const [ollamaStatusClass, setOllamaStatusClass] = useState('text-gray-500');
  const [ollamaPullModelValue, setOllamaPullModelValue] = useState('');
  const [ollamaPulling, setOllamaPulling] = useState(false);
  const ollamaUrlRef = useRef('http://168.231.78.113:11434');

  const profile = useUserProfileStore(state => state.profile);

  const loadProfile = useUserProfileStore(state => state.loadProfile);
  const submitProfile = useUserProfileStore(state => state.submitOnboarding);
  const clearProfile = useUserProfileStore(state => state.clearProfile);
  const isProcessingTask = useProcessingStore(state => state.isProcessingTask);
  const currentTaskInfo = useProcessingStore(state => state.currentTaskInfo);
  const processingMessages = useProcessingStore(state => state.processingMessages);
  const googleServiceResult = useProcessingStore(state => state.googleServiceResult);
  const processingConsole = useProcessingStore(state => state.processingConsole);
  const setCurrentTaskInfo = useProcessingStore(state => state.setCurrentTaskInfo);
  const setProcessingMessages = useProcessingStore(state => state.setProcessingMessages);
  const addProcessingMessage = useProcessingStore(state => state.addProcessingMessage);
  const setGoogleServiceResult = useProcessingStore(state => state.setGoogleServiceResult);
  const setProcessingConsoleState = useProcessingStore(state => state.setProcessingConsole);
  const updateProcessingConsoleState = useProcessingStore(state => state.updateProcessingConsole);
  const setIsProcessingTask = useProcessingStore(state => state.setIsProcessingTask);
  const clearProcessing = useProcessingStore(state => state.clearProcessing);

  // ─── Firebase Auth ───────────────
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      setUserLoaded(true);
      if (user) {
        void loadProfile();
        loadUserConversations(user);
      } else {
        clearProfile();
      }
    });
    return () => unsub();
  }, [clearProfile, loadProfile]);

  // ─── Splash timeout ──────────────
  useEffect(() => {
    if (!userLoaded) return;
    const t = setTimeout(() => {
      if (currentUser) navigateTo('view-home', true);
      else navigateTo('view-auth', true);
    }, 2000);
    return () => clearTimeout(t);
  }, [userLoaded, currentUser]);

  // ─── Router ──────────────────────
  const navigateTo = useCallback((target: string, clearHistory = false) => {
    setCurrentView(prev => {
      if (prev === target) return prev;
      // Clean up voice when leaving
      return target;
    });
    if (clearHistory) setNavHistory([target]);
    else setNavHistory(h => [...h, target]);
  }, []);

  useEffect(() => {
    if (!userLoaded || currentUser || currentView === 'view-auth' || currentView === 'view-splash') return;
    navigateTo('view-auth', true);
  }, [currentUser, currentView, navigateTo, userLoaded]);

  // Auto-close the live-voice chat drawer when leaving the voice view so it
  // never lingers as a hidden overlay over other pages.
  useEffect(() => {
    if (currentView !== 'view-voice' && useUI.getState().isChatOpen) {
      useUI.setState({ isChatOpen: false });
    }
  }, [currentView]);

  const goBack = useCallback(() => {
    setNavHistory(h => {
      if (h.length > 1) {
        const newHistory = [...h];
        newHistory.pop();
        const prev = newHistory[newHistory.length - 1];
        setCurrentView(prev);
        return newHistory;
      }
      return h;
    });
  }, []);

  // ─── Conversations ───────────────
  function createNewConversation(): Conversation {
    const id = 'conv_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
    const conv: Conversation = { id, title: 'New Conversation', messages: [], createdAt: Date.now(), updatedAt: Date.now() };
    setConversations(prev => {
      const updated = [conv, ...prev];
      setActiveConvId(id);
      setChatMessages([]);
      return updated;
    });
    return conv;
  }

  function loadUserConversations(user: User) {
    const convRef = ref(rtdb, 'users/' + user.uid + '/conversations');
    onValue(convRef, (snap) => {
      const data = snap.val();
      if (data) {
        const convs = Object.values(data) as Conversation[];
        convs.sort((a, b) => b.updatedAt - a.updatedAt);
        setConversations(convs);
        if (convs.length > 0) {
          setActiveConvId(convs[0].id);
          setChatMessages(convs[0].messages || []);
        } else {
          createNewConversation();
        }
      } else {
        createNewConversation();
      }
    });
    // Load system prompt
    const promptRef = ref(rtdb, 'users/' + user.uid + '/systemPrompt');
    onValue(promptRef, (snap) => {
      const val = snap.val();
      if (val) setSystemPrompt(val);
    });
    // Load profile
    const profileRef = ref(rtdb, 'users/' + user.uid + '/profile');
    onValue(profileRef, (snap) => {
      const p = snap.val();
      if (p) {
        setEditName(p.preferred_name || '');
        setEditAddress(p.preferred_address || '');
      }
    });
  }

  function saveConversations(convs: Conversation[]) {
    if (!currentUser) return;
    const obj: Record<string, Conversation> = {};
    convs.forEach(c => obj[c.id] = c);
    set(ref(rtdb, 'users/' + currentUser.uid + '/conversations'), obj);
  }

  function getActiveConversation(): Conversation | undefined {
    return conversations.find(c => c.id === activeConvId);
  }

  // ─── Processing Timer Cleanup ─────
  useEffect(() => {
    return () => {
      if (processingTimerRef.current) clearTimeout(processingTimerRef.current);
      if (engagementTimerRef.current) clearInterval(engagementTimerRef.current);
    };
  }, []);

  // ─── Chat Send with Engagement ────
  async function sendChatMessage(text?: string, attachment?: ChatAttachmentMeta) {
    const msg = text || chatInput;
    if (!msg.trim() || isStreaming) return;
    let conv = getActiveConversation();
    if (!conv) {
      const newConv = createNewConversation();
      conv = newConv;
    }
    const userMsg: Message = {
      role: 'user',
      content: msg,
      timestamp: Date.now(),
      ...(attachment ? { attachment } : {}),
    };
    const updatedMessages = [...chatMessages, userMsg];
    setChatMessages(updatedMessages);
    setChatInput('');
    setIsStreaming(true);
    abortRef.current = new AbortController();

    // Update conversation
    const updatedConv = { ...conv };
    updatedConv.messages = updatedMessages;
    updatedConv.title = msg.slice(0, 40) + (msg.length > 40 ? '...' : '');
    updatedConv.updatedAt = Date.now();
    const updatedConvs = conversations.map(c => c.id === updatedConv.id ? updatedConv : c);
    setConversations(updatedConvs);
    saveConversations(updatedConvs);

    // ─── START TASK ENGAGEMENT ─────
    const taskInfo = detectTaskType(msg);
    const processingTaskInfo = toProcessingTaskInfo(taskInfo);
    const initialProcessingConsole = createProcessingConsole(processingTaskInfo);
    setCurrentTaskInfo(processingTaskInfo);
    setProcessingConsoleState(initialProcessingConsole);
    setIsProcessingTask(true);
    setGoogleServiceResult(null);
    setProcessingMessages([]);

    // 1) Show Beatrice opening message
    const userName = profile?.preferred_name || currentUser?.displayName;
    const opening = getBeatriceOpening(taskInfo, userName);
    setProcessingMessages([{ id: 'opening_0', text: opening, type: 'opening' }]);
    updateProcessingConsoleState(prev => {
      const next = updateProcessingStep(prev, 'route', 'done', `Matched task type: ${taskInfo.type}`);
      if (!next) return next;
      return {
        ...next,
        currentProcess: `Task routed to ${taskInfo.label.toLowerCase()}`,
        statusNote: `Preparing ${next.activeServiceKeys.map(key => PROCESSING_SERVICE_VISUALS[key].title).join(' + ')}`,
      };
    });

    // 2) Set up entertainment interval (show brainy content while processing)
    let entCount = 0;
    engagementTimerRef.current = setInterval(() => {
      entCount++;
      const item = getNextEntertainment();
      addProcessingMessage({ id: `ent_${entCount}_${Date.now()}`, text: item.text, type: 'entertainment', subType: item.type });
    }, getEngagementTimeout(taskInfo));

    // 3) Try to run Google service if applicable
    let googleResultText = '';
    try {
      if (msg.length > 15) {
        const primaryServiceTitle = PROCESSING_SERVICE_VISUALS[initialProcessingConsole.activeServiceKeys[0]].title;
        updateProcessingConsoleState(prev => {
          const next = updateProcessingStep(prev, 'workspace', 'running', `Executing ${primaryServiceTitle} middleware flow`);
          if (!next) return next;
          return {
            ...next,
            currentProcess: `Running ${primaryServiceTitle} service pipeline`,
            statusNote: `Authenticating and executing live service action`,
          };
        });
        const gResult = await executeGoogleService(msg);
        if (gResult.handled && gResult.success !== false) {
          googleResultText = gResult.result;
          setGoogleServiceResult(gResult.result);
          updateProcessingConsoleState(prev => {
            const next = updateProcessingStep(prev, 'workspace', 'done', `${gResult.serviceName} completed successfully`);
            if (!next) return next;
            return {
              ...next,
              currentProcess: `${gResult.serviceName} action completed`,
              statusNote: gResult.result,
            };
          });
        } else if (gResult.handled) {
          setGoogleServiceResult(gResult.result);
          updateProcessingConsoleState(prev => {
            const next = updateProcessingStep(prev, 'workspace', 'error', `${gResult.serviceName} action failed`);
            if (!next) return next;
            return {
              ...next,
              currentProcess: `${gResult.serviceName} action failed`,
              statusNote: gResult.result,
            };
          });
        } else {
          updateProcessingConsoleState(prev => {
            const next = updateProcessingStep(prev, 'workspace', 'skipped', 'No direct Google Workspace action matched; using model reasoning only');
            if (!next) return next;
            return {
              ...next,
              currentProcess: 'No direct workspace API call required',
              statusNote: 'Falling back to model-only response generation',
            };
          });
        }
      }
    } catch (e) {
      updateProcessingConsoleState(prev => {
        const next = updateProcessingStep(prev, 'workspace', 'error', 'Workspace call failed; continuing with model fallback');
        if (!next) return next;
        return {
          ...next,
          currentProcess: 'Workspace call failed, switching to model fallback',
          statusNote: 'The request will still continue without blocking the response',
        };
      });
    }

    // ─── DEEPSEEK API CALL ──────────
    try {
      updateProcessingConsoleState(prev => {
        const next = updateProcessingStep(prev, 'model', 'running', 'Opening response stream from DeepSeek');
        if (!next) return next;
        return {
          ...next,
          currentProcess: 'Synthesizing response with DeepSeek',
          statusNote: 'Streaming tokens and building the final answer',
        };
      });
      const apiMessages = [
        { role: 'system', content: systemPrompt },
        ...updatedMessages.map(m => ({ role: m.role, content: m.content }))
      ];
      const resp = await fetch(DEEPSEEK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + DEEPSEEK_KEY },
        body: JSON.stringify({
          messages: apiMessages,
          model: 'deepseek-chat',
          max_tokens: 2048,
          stream: true,
          temperature: tempValue,
          top_p: 1
        }),
        signal: abortRef.current.signal
      });
      const reader = resp.body!.getReader();
      const decoder = new TextDecoder();
      let fullContent = '', fullReasoning = '';
      let chunkCounter = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const str = line.slice(6);
          if (str === '[DONE]') continue;
          try {
            const json = JSON.parse(str);
            const delta = json.choices?.[0]?.delta;
            if (delta?.reasoning_content) fullReasoning += delta.reasoning_content;
            if (delta?.content) fullContent += delta.content;
          } catch {}
        }
        chunkCounter++;
        if (chunkCounter === 1 || chunkCounter % 3 === 0) {
          const visibleLength = Math.max(fullContent.length, fullReasoning.length);
          updateProcessingConsoleState(prev => {
            const next = updateProcessingStep(
              prev,
              'model',
              'running',
              visibleLength > 0
                ? `Streaming response, ${visibleLength} characters assembled`
                : 'Streaming response chunks',
            );
            if (!next) return next;
            return {
              ...next,
              currentProcess: visibleLength > 0
                ? `Generating final response, ${visibleLength} characters rendered`
                : 'Generating final response',
              statusNote: fullReasoning
                ? 'Reasoning trace received, composing assistant answer'
                : 'Receiving model output stream',
            };
          });
        }
      }

      // Prepend Google service result to the response if applicable
      if (googleResultText) {
        fullContent = googleResultText + '\n\n' + fullContent;
      }

      const assistantMsg: Message = { role: 'assistant', content: fullContent, reasoning_content: fullReasoning, timestamp: Date.now() };
      const finalMessages = [...updatedMessages, assistantMsg];
      setChatMessages(finalMessages);
      const finalConv = { ...updatedConv };
      finalConv.messages = finalMessages;
      finalConv.updatedAt = Date.now();
      const finalConvs = conversations.map(c => c.id === finalConv.id ? finalConv : c);
      setConversations(finalConvs);
      saveConversations(finalConvs);

      updateProcessingConsoleState(prev => {
        let next = updateProcessingStep(prev, 'model', 'done', 'Response generation complete');
        next = updateProcessingStep(next, 'finalize', 'running', 'Publishing response into the chat surface');
        if (!next) return next;
        return {
          ...next,
          currentProcess: 'Finalizing response and updating the frontend',
          statusNote: 'Writing the completed answer into the conversation',
        };
      });

      // Show completion message
      addProcessingMessage({ id: `result_${Date.now()}`, text: googleResultText ? `✅ ${googleResultText}` : '', type: 'result' });
      updateProcessingConsoleState(prev => {
        let next = updateProcessingStep(prev, 'finalize', 'done', 'Conversation updated successfully');
        if (!next) return next;
        return {
          ...next,
          stage: 'completed',
          currentProcess: 'Completed',
          statusNote: googleResultText || 'The response is now ready in the conversation',
        };
      });
    } catch (e: any) {
      if (e.name !== 'AbortError') {
        const errMsg: Message = { role: 'assistant', content: 'Error: ' + (e.message || 'Unknown error'), timestamp: Date.now() };
        setChatMessages(prev => [...prev, errMsg]);
        updateProcessingConsoleState(prev => {
          let next = updateProcessingStep(prev, 'model', 'error', e.message || 'Model request failed');
          next = updateProcessingStep(next, 'finalize', 'error', 'Response pipeline stopped before completion');
          if (!next) return next;
          return {
            ...next,
            stage: 'failed',
            currentProcess: 'Task failed during model generation',
            statusNote: e.message || 'Unknown processing error',
          };
        });
      }
    }
    setIsStreaming(false);
    abortRef.current = null;

    // ─── CLEANUP ENGAGEMENT ─────────
    if (engagementTimerRef.current) {
      clearInterval(engagementTimerRef.current);
      engagementTimerRef.current = null;
    }
    processingTimerRef.current = setTimeout(() => {
      clearProcessing();
    }, 2000);
  }


  // ─── Media Generation ────────────
  async function sendMediaPrompt(input: string, prefix: string, setter: React.Dispatch<React.SetStateAction<{ role: string; content: string }[]>>) {
    if (!input.trim()) return;
    const userMsg = { role: 'user', content: input };
    setter(prev => [...prev, userMsg]);
    try {
      const resp = await fetch(DEEPSEEK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + DEEPSEEK_KEY },
        body: JSON.stringify({
          messages: [
            { role: 'system', content: prefix + '. You are Beatrice, a creative AI assistant.' },
            { role: 'user', content: input }
          ],
          model: 'deepseek-chat',
          max_tokens: 1024,
          temperature: 0.8
        })
      });
      const data = await resp.json();
      const reply = data.choices?.[0]?.message?.content || 'Could not generate.';
      setter(prev => [...prev, { role: 'assistant', content: reply }]);
    } catch (e: any) {
      setter(prev => [...prev, { role: 'assistant', content: 'Error: ' + e.message }]);
    }
  }

  // ─── Profile Save ────────────────
  const displayName = profile?.preferred_name || currentUser?.displayName || 'Associate';
  const preferredAddress = profile?.preferred_address || displayName;
  const avatarInitials = displayName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0]?.toUpperCase())
    .join('') || 'BE';

  useEffect(() => {
    if (showEditProfile) return;
    setEditName(profile?.preferred_name || currentUser?.displayName || '');
    setEditAddress(profile?.preferred_address || profile?.preferred_name || currentUser?.displayName || '');
  }, [
    currentUser?.displayName,
    profile?.preferred_address,
    profile?.preferred_name,
    showEditProfile,
  ]);

  async function saveProfile() {
    const nextName = editName.trim() || displayName;
    const nextAddress = editAddress.trim() || nextName;
    const savedProfile = await submitProfile({
      preferred_name: nextName,
      preferred_address: nextAddress,
    });
    if (currentUser) {
      await set(ref(rtdb, 'users/' + currentUser.uid + '/profile'), {
        preferred_name: savedProfile.preferred_name,
        preferred_address: savedProfile.preferred_address,
        updated_at: Date.now()
      });
    }
    setShowEditProfile(false);
  }

  const handleLogout = useCallback(async () => {
    await logout();
    setCurrentUser(null);
    setChatMessages([]);
    setConversations([]);
    setActiveConvId(null);
    setShowEditProfile(false);
    clearProfile();
    clearProcessing();
    useLogStore.getState().clearTurns();
    navigateTo('view-auth', true);
  }, [clearProcessing, clearProfile, navigateTo]);

  // ─── Greeting ────────────────────
  const getGreeting = () => {
    const h = new Date().getHours();
    return h < 12 ? 'Good Morning' : h < 18 ? 'Good Afternoon' : 'Good Evening';
  };

  // ─── Ollama Integration ──────────
  const ollamaFetchModels = useCallback(async () => {
    const url = ollamaUrlRef.current;
    try {
      const r = await fetch(`${url}/api/tags`);
      const d = await r.json();
      const models = d.models || [];
      setOllamaModels(models);
      setOllamaStatus(`Connected • ${models.length} model${models.length !== 1 ? 's' : ''}`);
      setOllamaStatusClass('text-green-400');
      return models;
    } catch {
      setOllamaStatus('Connection failed — is Ollama running?');
      setOllamaStatusClass('text-red-400');
      setOllamaModels([]);
      return [];
    }
  }, []);

  const ollamaConnect = useCallback(() => {
    const url = ollamaUrlRef.current.trim() || 'http://168.231.78.113:11434';
    const cfg = { baseUrl: url, enabled: localCfg.enabled, model: localCfg.model };
    setLocalCfg(cfg);
    localStorage.setItem('localLLMConfig', JSON.stringify(cfg));
    ollamaFetchModels();
  }, [localCfg, ollamaFetchModels]);

  const ollamaHandleToggle = useCallback((checked: boolean) => {
    const cfg = { ...localCfg, enabled: checked };
    setLocalCfg(cfg);
    localStorage.setItem('localLLMConfig', JSON.stringify(cfg));
  }, [localCfg]);

  const ollamaHandleModelChange = useCallback((model: string) => {
    const cfg = { ...localCfg, model };
    setLocalCfg(cfg);
    localStorage.setItem('localLLMConfig', JSON.stringify(cfg));
  }, [localCfg]);

  const ollamaPullModel = useCallback(async (name: string) => {
    if (!name) return;
    setOllamaPulling(true);
    setOllamaStatus(`Pulling ${name}...`);
    setOllamaStatusClass('text-yellow-400');
    try {
      const resp = await fetch(`${ollamaUrlRef.current}/api/pull`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      if (!resp.ok) throw new Error('Pull request failed');
      setOllamaStatus(`Pulled ${name}!`);
      setOllamaStatusClass('text-green-400');
      await ollamaFetchModels();
    } catch (e: any) {
      setOllamaStatus(`Pull failed: ${e.message}`);
      setOllamaStatusClass('text-red-400');
    }
    setOllamaPulling(false);
    setOllamaPullModelValue('');
  }, [ollamaFetchModels]);

  // ─── Chat inline ─────────────────

  const processingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const engagementTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const chatRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [chatMessages, processingMessages]);

  // ─── Chat Attachments (camera + universal file upload) ───
  // The camera button opens a system file picker with `capture=environment`
  // so on mobile the user gets "Take Photo / Choose from Library", while on
  // desktop it falls back to a normal image picker. The paperclip button
  // accepts ANY file type — extraction logic in lib/chat-attachments.ts pulls
  // text from PDF/DOCX/XLSX/CSV/PPTX/plain text, and images go through Gemini
  // Vision so DeepSeek can still react to them.
  const chatFileInputRef = useRef<HTMLInputElement>(null);
  const chatCameraInputRef = useRef<HTMLInputElement>(null);
  const [attachmentLoading, setAttachmentLoading] = useState(false);

  const handleChatCamera = useCallback(() => {
    chatCameraInputRef.current?.click();
  }, []);

  const handleChatAttachClick = useCallback(() => {
    chatFileInputRef.current?.click();
  }, []);

  const ingestChatFile = useCallback(
    async (file: File) => {
      setAttachmentLoading(true);
      try {
        const att: ChatAttachment = await extractChatAttachment(file);
        let visionText = '';
        if (att.kind === 'image' && att.imageDataUrl) {
          visionText = await describeImage(att.imageDataUrl);
        }

        const meta: ChatAttachmentMeta = {
          kind: att.kind,
          filename: att.filename,
          size: att.size,
          mimeType: att.mimeType,
          imageDataUrl: att.imageDataUrl,
        };

        const promptBody = buildChatPromptForAttachment(att);
        const finalText = visionText
          ? `${promptBody}\n\nVision read-out:\n${visionText}`
          : promptBody;

        if (currentView !== 'view-text') navigateTo('view-text');
        await sendChatMessage(finalText, meta);
      } catch (err) {
        console.error('Chat attachment failed', err);
        alert(
          err instanceof Error ? err.message : 'Could not read this attachment.',
        );
      } finally {
        setAttachmentLoading(false);
      }
    },
    [currentView, navigateTo],
  );

  const handleChatFileChange = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = '';
      if (!file) return;
      await ingestChatFile(file);
    },
    [ingestChatFile],
  );

  const handleChatCameraChange = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = '';
      if (!file) return;
      await ingestChatFile(file);
    },
    [ingestChatFile],
  );

  const renderProcessingOverlay = () => {
    if (!isProcessingTask || !currentTaskInfo) return null;

    return (
      <div className="global-processing-overlay">
        <div className="workspace-processing-shell">
          <div className="workspace-processing-header">
            <div>
              <h3 className="workspace-processing-title">Beatrice Workspace</h3>
              <p className="workspace-processing-subtitle">Active task middleware console</p>
            </div>
            <div className="workspace-processing-status">
              <span className="workspace-status-dot"></span>
              <span className="workspace-status-text">
                {processingConsole?.activeServiceKeys.length || 0} service{(processingConsole?.activeServiceKeys.length || 0) === 1 ? '' : 's'} active
              </span>
            </div>
          </div>

          <div className="workspace-current-process">
            <div className="workspace-current-process-label">Current actual process</div>
            <div className="workspace-current-process-value">
              {processingConsole?.currentProcess || `${currentTaskInfo.icon} ${currentTaskInfo.label}`}
            </div>
            <div className="workspace-current-process-note">
              {processingConsole?.statusNote || 'Preparing task pipeline'}
            </div>
          </div>

          <div className="workspace-processing-grid">
            {(processingConsole?.activeServiceKeys || getProcessingServiceKeys(currentTaskInfo)).map(serviceKey => {
              const service = PROCESSING_SERVICE_VISUALS[serviceKey];
              return (
                <div key={serviceKey} className="workspace-service-card">
                  {renderProcessingServiceVisual(serviceKey)}
                  <h4 className="workspace-service-title">{service.title}</h4>
                  <p className="workspace-service-scope">{service.scope}</p>
                  <p className="workspace-service-loading" style={{ color: service.accent }}>
                    {service.loadingLabel}...
                  </p>
                </div>
              );
            })}
          </div>

          <div className="workspace-steps-panel">
            {processingConsole?.steps.map(step => (
              <div key={step.key} className={`workspace-step-row workspace-step-${step.status}`}>
                <div className="workspace-step-indicator"></div>
                <div className="workspace-step-copy">
                  <div className="workspace-step-label">{step.label}</div>
                  <div className="workspace-step-detail">{step.detail}</div>
                </div>
              </div>
            ))}
          </div>

          {googleServiceResult ? (
            <div className="workspace-live-result">
              <span className="workspace-live-result-badge">Live service output</span>
              <p>{googleServiceResult}</p>
            </div>
          ) : null}

          {processingMessages.map(pm => {
            if (pm.type === 'opening') {
              return (
                <div key={pm.id} className="processing-msg">
                  <span style={{ color: '#c4b5fd', fontWeight: 500 }}>Beatrice</span>
                  <p style={{ color: '#e2e8f0', marginTop: 4, fontSize: 14, lineHeight: 1.6 }}>{pm.text}</p>
                </div>
              );
            }
            if (pm.type === 'entertainment') {
              return (
                <div key={pm.id} className="processing-entertainment">
                  <span className={`tag tag-${pm.subType || 'joke'}`}>{pm.subType || 'joke'}</span>
                  <span>{pm.text}</span>
                </div>
              );
            }
            if (pm.type === 'result' && pm.text) {
              return (
                <div key={pm.id} className="processing-result" style={{ padding: '8px 16px', marginTop: 4 }}>
                  <span className="result-badge">✅ Completed</span>
                  <p style={{ fontSize: 13, color: '#94a3b8', marginTop: 4 }}>{pm.text}</p>
                </div>
              );
            }
            return null;
          })}
        </div>
      </div>
    );
  };

  // ─── Render ──────────────────────
  return (
    <main className="device-container" id="app">
      {/* SPLASH */}
      <section id="view-splash"
        className={'page-view' + (currentView === 'view-splash' ? ' active' : '')}
        aria-hidden={currentView !== 'view-splash'}
        style={{ background: 'radial-gradient(circle at 50% 0%, #1a0a2e 0%, #050505 60%)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        {/* Ambient glows */}
        <div style={{ position: 'absolute', top: '20%', left: '20%', width: '300px', height: '300px', background: 'rgba(168, 85, 247, 0.15)', borderRadius: '50%', filter: 'blur(100px)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', bottom: '20%', right: '20%', width: '250px', height: '250px', background: 'rgba(217, 70, 239, 0.12)', borderRadius: '50%', filter: 'blur(80px)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: '500px', height: '500px', background: 'radial-gradient(circle, rgba(126, 34, 206, 0.08) 0%, transparent 70%)', pointerEvents: 'none' }} />

        {/* Main orb with layered effects */}
        <div style={{ position: 'relative', width: '100px', height: '100px', marginBottom: '40px' }}>
          {/* Outer glow ring */}
          <div style={{
            position: 'absolute',
            inset: '-20px',
            borderRadius: '50%',
            background: 'conic-gradient(from 0deg, transparent, rgba(217, 70, 239, 0.3), rgba(168, 85, 247, 0.3), transparent)',
            animation: 'spin 4s linear infinite',
          }} />
          {/* Main orb */}
          <div style={{
            width: '100%',
            height: '100%',
            borderRadius: '50%',
            background: 'radial-gradient(circle at 35% 35%, #fdf4ff, #d946ef 40%, #7e22ce 100%)',
            boxShadow: '0 0 60px rgba(217, 70, 239, 0.5), 0 0 100px rgba(126, 34, 206, 0.3), inset 0 0 20px rgba(255, 255, 255, 0.4)',
            animation: 'pulse 2s ease-in-out infinite',
          }} />
          {/* Inner highlight */}
          <div style={{
            position: 'absolute',
            top: '20%',
            left: '20%',
            width: '30%',
            height: '30%',
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(255, 255, 255, 0.6), transparent)',
          }} />
        </div>

        {/* Brand text */}
        <h1 style={{ fontFamily: "'Outfit', sans-serif", fontSize: '42px', fontWeight: 600, color: 'white', letterSpacing: '-0.02em', marginBottom: '8px' }}>Beatrice</h1>
        <p style={{ fontSize: '14px', color: 'rgba(192, 132, 252, 0.9)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Intelligent Generation</p>

        {/* Loading indicator */}
        <div style={{ position: 'absolute', bottom: '60px', display: 'flex', gap: '6px', alignItems: 'center' }}>
          <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'rgba(217, 70, 239, 0.6)', animation: 'bounce 1.4s ease-in-out infinite' }} />
          <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'rgba(217, 70, 239, 0.6)', animation: 'bounce 1.4s ease-in-out infinite 0.2s' }} />
          <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'rgba(217, 70, 239, 0.6)', animation: 'bounce 1.4s ease-in-out infinite 0.4s' }} />
        </div>
      </section>

      {/* AUTH */}
      <section id="view-auth"
        className={'page-view' + (currentView === 'view-auth' ? ' active' : '') + ' px-6'}
        style={{ backgroundColor: '#0a0a0a' }}
        aria-hidden={currentView !== 'view-auth'}>
        <div style={{ position: 'absolute', top: '-100px', right: '-100px', width: '300px', height: '300px', background: 'rgba(168,85,247,0.15)', borderRadius: '50%', filter: 'blur(80px)', pointerEvents: 'none' }} />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', position: 'relative', zIndex: 10 }}>
          <div style={{ textAlign: 'center', marginBottom: '48px' }}>
            <div style={{ width: '64px', height: '64px', margin: '0 auto 24px', borderRadius: '50%', background: 'radial-gradient(circle at 30% 30%, #fdf4ff, #d946ef, #7e22ce)', boxShadow: '0 0 50px rgba(217,70,239,0.6)' }} />
            <h1 style={{ fontSize: '28px', fontWeight: 600, marginBottom: '8px', color: 'white', fontFamily: "'Outfit', sans-serif" }}>Welcome Back</h1>
            <p style={{ fontSize: '14px', color: '#9ca3af' }}>Log in to continue with Beatrice</p>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <button onClick={() => signInWithGoogle().catch(e => alert('Sign-in error: ' + e.message))}
              className="glass glass-btn"
              style={{ width: '100%', borderRadius: '9999px', padding: '14px 16px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px', background: 'rgba(255,255,255,0.03)', backdropFilter: 'blur(16px)', border: '1px solid rgba(255,255,255,0.05)', color: 'white', fontSize: '15px', fontWeight: 500, cursor: 'pointer' }}>
              <svg width="20" height="20" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#fff"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#fff"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#fff"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#fff"/></svg>
              <span>Continue with Google</span>
            </button>
            <button className="glass glass-btn"
              style={{ width: '100%', borderRadius: '9999px', padding: '14px 16px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px', opacity: 0.5, color: 'white', fontSize: '15px', fontWeight: 500, cursor: 'pointer' }}>
              <i className="ph-fill ph-apple-logo" style={{ fontSize: '20px' }}></i>
              <span>Continue with Apple</span>
            </button>
            <div style={{ position: 'relative', padding: '16px 0' }}>
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center' }}>
                <div style={{ width: '100%', borderTop: '1px solid rgba(255,255,255,0.1)' }} />
              </div>
              <div style={{ position: 'relative', display: 'flex', justifyContent: 'center' }}>
                <span style={{ padding: '0 12px', backgroundColor: '#0a0a0a', fontSize: '12px', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '1px' }}>Or</span>
              </div>
            </div>
            <button className="glass glass-btn"
              style={{ width: '100%', borderRadius: '9999px', padding: '14px 16px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px', opacity: 0.5, color: '#9ca3af', fontSize: '15px', fontWeight: 500, cursor: 'pointer' }}>
              <i className="ph ph-envelope-simple" style={{ fontSize: '20px' }}></i>
              <span>Continue with Email</span>
            </button>
          </div>
        </div>
      </section>

      {/* HOME */}
      <section id="view-home"
        className={'page-view' + (currentView === 'view-home' ? ' active' : '')}
        style={{ backgroundColor: '#0a0a0a' }}
        aria-hidden={currentView !== 'view-home'}>
        <div style={{ position: 'absolute', top: 0, left: 0, width: '300px', height: '300px', background: 'rgba(168,85,247,0.15)', borderRadius: '50%', filter: 'blur(80px)', pointerEvents: 'none' }} />
        <div style={{ flex: 1, padding: '96px 24px 120px', overflowY: 'auto', position: 'relative', zIndex: 10, display: 'flex', flexDirection: 'column' }} className="no-scrollbar">
          <nav style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', marginBottom: '24px' }}>
            <button onClick={() => navigateTo('view-settings')} className="glass glass-btn"
              title="Settings"
              style={{ width: '40px', height: '40px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <i className="ph ph-gear" style={{ fontSize: '18px', color: '#9ca3af' }}></i>
            </button>
          </nav>
          <div onClick={() => navigateTo('view-profile')} style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px', cursor: 'pointer', width: 'max-content' }}>
            {currentUser?.photoURL ? (
              <img src={currentUser.photoURL} alt={displayName}
                style={{ width: '44px', height: '44px', borderRadius: '50%', border: '1px solid rgba(255,255,255,0.2)', objectFit: 'cover' }} />
            ) : (
              <div aria-label={displayName}
                style={{ width: '44px', height: '44px', borderRadius: '50%', border: '1px solid rgba(255,255,255,0.2)', background: 'linear-gradient(135deg, #d946ef, #7e22ce)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: '13px', fontWeight: 700 }}>
                {avatarInitials}
              </div>
            )}
            <div>
              <p style={{ fontSize: '12px', color: '#9ca3af', lineHeight: 1.2 }}>{getGreeting()}</p>
              <p style={{ fontSize: '15px', fontWeight: 500, lineHeight: 1.4, marginTop: '2px', color: 'white' }}>{preferredAddress}</p>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '32px', marginTop: '24px' }}>
            <button onClick={() => navigateTo('view-voice')}
              style={{ gridColumn: 'span 1', gridRow: 'span 2', borderRadius: '28px', padding: '16px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', position: 'relative', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.1)', textAlign: 'left', height: '220px', cursor: 'pointer', background: 'transparent' }}>
              <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, #f0abfc, #7e22ce)', opacity: 0.4 }} />
              <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'rgba(255,255,255,0.2)', backdropFilter: 'blur(16px)', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', zIndex: 10 }}>
                <i className="ph-fill ph-microphone" style={{ color: 'white', fontSize: '14px' }}></i>
              </div>
              <p style={{ fontSize: '14px', fontWeight: 500, position: 'relative', zIndex: 10, marginTop: 'auto', color: 'white' }}>Voice Assistant</p>
            </button>
            <button onClick={() => navigateTo('view-video')} className="glass glass-btn"
              style={{ borderRadius: '24px', padding: '16px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', height: '102px', textAlign: 'left', cursor: 'pointer' }}>
              <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: 'rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <i className="ph-fill ph-play" style={{ color: '#9ca3af', fontSize: '12px' }}></i>
              </div>
              <p style={{ fontSize: '13px', fontWeight: 500, color: '#d1d5db' }}>Video Generation</p>
            </button>
            <button onClick={() => navigateTo('view-image')} className="glass glass-btn"
              style={{ borderRadius: '24px', padding: '16px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', height: '102px', textAlign: 'left', cursor: 'pointer' }}>
              <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: 'rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <i className="ph-fill ph-camera" style={{ color: '#9ca3af', fontSize: '12px' }}></i>
              </div>
              <p style={{ fontSize: '13px', fontWeight: 500, color: '#d1d5db' }}>Image Generation</p>
            </button>
            <button onClick={() => useEburonFlixStore.getState().open()} className="glass glass-btn"
              style={{ gridColumn: 'span 2', borderRadius: '24px', padding: '16px', display: 'flex', alignItems: 'center', gap: '12px', textAlign: 'left', cursor: 'pointer', height: '72px' }}>
              <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'rgba(163,230,53,0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <i className="ph-fill ph-film-strip" style={{ color: '#a3e635', fontSize: '14px' }}></i>
              </div>
              <div>
                <p style={{ fontSize: '13px', fontWeight: 600, color: '#fff' }}>EburonFlix</p>
                <p style={{ fontSize: '11px', color: '#9ca3af' }}>Movies, TV & translations on demand</p>
              </div>
            </button>
          </div>
          <section style={{ marginTop: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h2 style={{ fontSize: '13px', fontWeight: 500, color: '#d1d5db' }}>Quick Prompts</h2>
            </div>
            <ul style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {[
                { icon: 'ph-fill ph-chat-text', color: '#d946ef', text: 'Explain quantum computing simply...' },
                { icon: 'ph-fill ph-feather', color: '#a855f7', text: 'Write a poem about AI consciousness' },
                { icon: 'ph-fill ph-map-pin', color: '#3b82f6', text: 'Help me plan a weekend itinerary for Tokyo' },
              ].map((item, i) => (
                <li key={i}>
                  <button onClick={() => { navigateTo('view-text'); setTimeout(() => sendChatMessage(item.text), 100); }} className="glass glass-btn"
                    style={{ width: '100%', borderRadius: '9999px', padding: '10px 12px', display: 'flex', alignItems: 'center', gap: '12px', textAlign: 'left', cursor: 'pointer' }}>
                    <div style={{ width: '28px', height: '28px', borderRadius: '50%', backgroundColor: item.color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <i className={item.icon} style={{ color: 'white', fontSize: '12px' }}></i>
                    </div>
                    <p style={{ fontSize: '12px', color: '#d1d5db', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.text}</p>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </section>

      {/* VOICE — placeholder section for the page-view transition */}
      <section id="view-voice"
        className={'page-view' + (currentView === 'view-voice' ? ' active' : '')}
        style={{ backgroundColor: '#0a0a0a', overflow: 'hidden' }}
        aria-hidden={currentView !== 'view-voice'} />
      
      {/* Global Header — sticky across all pages */}
      <div style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 1000 }}>
        <Header />
      </div>

      {/* StreamingConsole renders as fixed overlay so its position:fixed elements don't break */}
      <div style={{
        position: 'fixed',
        inset: 0,
        zIndex: 200,
        opacity: currentView === 'view-voice' ? 1 : 0,
        pointerEvents: currentView === 'view-voice' ? 'auto' : 'none',
        transition: 'opacity 0.3s',
      }}>
        {children}
      </div>

      {/* TEXT CHAT */}
      <section id="view-text"
        className={'page-view' + (currentView === 'view-text' ? ' active' : '')}
        style={{ backgroundColor: '#0a0a0a' }}
        aria-hidden={currentView !== 'view-text'}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', position: 'relative', zIndex: 10, height: '100%' }}>
          <nav style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 24px', position: 'sticky', top: 'var(--header-height)', zIndex: 50, background: 'rgba(10,10,10,0.95)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', borderBottom: '1px solid rgba(255,255,255,0.05)', marginTop: 'var(--header-height)' }}>
            <button onClick={goBack} className="glass glass-btn"
              style={{ width: '40px', height: '40px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
              <i className="ph ph-caret-left" style={{ fontSize: '18px', color: '#9ca3af' }}></i>
            </button>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <h2 style={{ fontSize: '15px', fontWeight: 500, color: 'white' }}>Beatrice</h2>
              <span style={{ fontSize: '10px', color: '#4ade80', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <span style={{ width: '6px', height: '6px', backgroundColor: '#4ade80', borderRadius: '50%' }}></span> Online
              </span>
            </div>
            <button onClick={() => navigateTo('view-history')} className="glass glass-btn"
              style={{ width: '40px', height: '40px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
              <i className="ph ph-clock-counter-clockwise" style={{ fontSize: '18px', color: '#9ca3af' }}></i>
            </button>
          </nav>
          <div ref={chatRef} style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '20px', padding: '16px 24px' }} className="no-scrollbar">
            {chatMessages.length === 0 ? (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6b7280', fontSize: '14px' }}>
                <div style={{ textAlign: 'center' }}>
                  <i className="ph ph-chat-teardrop-text" style={{ fontSize: '24px', marginBottom: '8px', opacity: 0.3 }}></i>
                  <p>Start a conversation with Beatrice</p>
                </div>
              </div>
            ) : (
              chatMessages.map((msg, i) => (
                <div key={i} className="msg-bubble"
                  style={{
                    alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                    background: msg.role === 'user' ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.03)',
                    backdropFilter: 'blur(16px)',
                    border: msg.role === 'user' ? '1px solid rgba(255,255,255,0.05)' : '1px solid rgba(255,255,255,0.05)',
                    borderRadius: msg.role === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                    borderLeft: msg.role === 'assistant' ? '2px solid #d946ef' : undefined,
                    padding: '16px',
                    maxWidth: msg.role === 'user' ? '85%' : '90%',
                  }}>
                  {msg.reasoning_content && (
                    <p style={{ fontSize: '11px', color: 'rgba(250,204,21,0.8)', fontStyle: 'italic', marginBottom: '8px' }}>🧠 {msg.reasoning_content}</p>
                  )}
                  <p style={{ fontSize: '13px', lineHeight: 1.6, color: '#d1d5db' }}>{msg.content}</p>
                </div>
              ))
            )}
            {isStreaming && (
              <div className="msg-bubble shimmer" style={{ alignSelf: 'flex-start', background: 'rgba(255,255,255,0.03)', backdropFilter: 'blur(16px)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '16px 16px 16px 4px', borderLeft: '2px solid #d946ef', padding: '16px', maxWidth: '90%' }}>
                <p style={{ fontSize: '13px', color: '#9ca3af' }}>Thinking<span className="thinking-dots"></span></p>
              </div>
            )}
          </div>
          <form onSubmit={e => { e.preventDefault(); sendChatMessage(); }} style={{ background: 'rgba(10,10,10,0.95)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', padding: '12px 24px calc(16px + env(safe-area-inset-bottom, 0px))', position: 'sticky', bottom: 'calc(72px + env(safe-area-inset-bottom, 0px))', zIndex: 60, borderTop: '1px solid rgba(255,255,255,0.05)' }}>
            {/* Hidden file pickers. Paperclip = any file. Camera =
                image-only with `capture` so mobile shows take-photo +
                gallery. Both go through extractChatAttachment(). */}
            <input
              ref={chatFileInputRef}
              type="file"
              accept="*/*"
              onChange={handleChatFileChange}
              style={{ display: 'none' }}
            />
            <input
              ref={chatCameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handleChatCameraChange}
              style={{ display: 'none' }}
            />
            {attachmentLoading && (
              <div style={{ marginBottom: '8px', fontSize: '11px', color: '#a3a3a3', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <i className="ph ph-spinner ph-spin" style={{ fontSize: '14px', color: '#d946ef' }}></i>
                Reading attachment…
              </div>
            )}
            <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: '9999px', display: 'flex', alignItems: 'center', padding: '6px 6px 6px 12px', gap: '4px' }}>
              <button
                type="button"
                onClick={handleChatAttachClick}
                disabled={attachmentLoading}
                title="Attach any file — PDF, DOCX, XLSX, CSV, PPTX, image, text — Beatrice reads it and adds it to your knowledgebase."
                style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, border: 'none', cursor: attachmentLoading ? 'wait' : 'pointer', color: '#9ca3af', opacity: attachmentLoading ? 0.5 : 1 }}>
                <i className="ph ph-paperclip" style={{ fontSize: '18px' }}></i>
              </button>
              <button
                type="button"
                onClick={handleChatCamera}
                disabled={attachmentLoading}
                title="Take a photo or pick an image — Beatrice describes it via vision and adds it to your knowledgebase."
                style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, border: 'none', cursor: attachmentLoading ? 'wait' : 'pointer', color: '#9ca3af', opacity: attachmentLoading ? 0.5 : 1 }}>
                <i className="ph ph-camera" style={{ fontSize: '18px' }}></i>
              </button>
              <input type="text" placeholder="Message Beatrice..." value={chatInput} onChange={e => setChatInput(e.target.value)}
                style={{ background: 'transparent', border: 'none', outline: 'none', fontSize: '14px', flex: 1, minWidth: 0, color: '#d1d5db', padding: '0 8px' }} />
              <button type="submit"
                style={{ width: '36px', height: '36px', borderRadius: '50%', backgroundColor: '#d946ef', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, border: 'none', cursor: 'pointer' }}>
                <i className="ph-fill ph-arrow-up" style={{ color: 'white', fontSize: '14px' }}></i>
              </button>
            </div>
          </form>
        </div>
      </section>

      {/* HISTORY */}
      <section id="view-history"
        className={'page-view' + (currentView === 'view-history' ? ' active' : '')}
        style={{ backgroundColor: '#0a0a0a' }}
        aria-hidden={currentView !== 'view-history'}>
        <div style={{ position: 'absolute', bottom: 0, right: 0, width: '250px', height: '250px', background: 'rgba(168,85,247,0.1)', borderRadius: '50%', filter: 'blur(60px)', pointerEvents: 'none' }} />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', position: 'relative', zIndex: 10, padding: '0 24px 120px', height: '100%' }}>
          <nav style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexShrink: 0, paddingTop: 'calc(var(--header-height) + 16px)' }}>
            <button onClick={goBack} className="glass glass-btn"
              style={{ width: '40px', height: '40px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
              <i className="ph ph-caret-left" style={{ fontSize: '18px', color: '#9ca3af' }}></i>
            </button>
            <h2 style={{ fontSize: '15px', fontWeight: 500, color: 'white' }}>Conversation History</h2>
            <button onClick={() => {
              if (!currentUser || conversations.length === 0) return;
              if (!confirm('Clear all conversation history?')) return;
              setConversations([]);
              createNewConversation();
              if (currentUser) set(ref(rtdb, 'users/' + currentUser.uid + '/conversations'), {});
            }} style={{ fontSize: '11px', color: 'rgba(248,113,113,0.7)', padding: '6px 12px', borderRadius: '9999px', cursor: 'pointer', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}>
              Clear
            </button>
          </nav>
          <div style={{ flex: 1, overflowY: 'auto' }} className="no-scrollbar">
            {conversations.length === 0 ? (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6b7280', fontSize: '14px' }}>
                <div style={{ textAlign: 'center' }}>
                  <i className="ph ph-clock-counter-clockwise" style={{ fontSize: '24px', marginBottom: '8px', opacity: 0.3 }}></i>
                  <p>No conversations yet</p>
                </div>
              </div>
            ) : (
              conversations.map((conv) => {
                const lastMsg = conv.messages && conv.messages.length > 0
                  ? conv.messages[conv.messages.length - 1].content.slice(0, 80)
                  : 'No messages';
                const date = new Date(conv.updatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
                const msgCount = conv.messages ? Math.ceil(conv.messages.length / 2) : 0;
                return (
                  <div key={conv.id} onClick={() => { setActiveConvId(conv.id); setChatMessages(conv.messages || []); navigateTo('view-text'); }}
                    className="history-item"
                    style={{ background: 'rgba(255,255,255,0.03)', backdropFilter: 'blur(16px)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '16px', padding: '16px', marginBottom: '12px', cursor: 'pointer' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '4px' }}>
                      <span style={{ fontSize: '13px', fontWeight: 500, color: 'white', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingRight: '8px', flex: 1 }}>{conv.title}</span>
                      <span style={{ fontSize: '10px', color: '#6b7280', whiteSpace: 'nowrap' }}>{date}</span>
                    </div>
                    <p style={{ fontSize: '11px', color: '#6b7280', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{lastMsg}</p>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '8px' }}>
                      <span style={{ fontSize: '10px', color: 'rgba(192,132,252,0.7)' }}>{msgCount} exchanges</span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </section>

      {/* SETTINGS */}
      <section id="view-settings"
        className={'page-view' + (currentView === 'view-settings' ? ' active' : '')}
        style={{ backgroundColor: '#0a0a0a' }}
        aria-hidden={currentView !== 'view-settings'}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', position: 'relative', zIndex: 10, padding: '0 24px 120px', height: '100%' }}>
          <nav style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexShrink: 0, paddingTop: 'calc(var(--header-height) + 16px)' }}>
            <button onClick={goBack} className="glass glass-btn"
              style={{ width: '40px', height: '40px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
              <i className="ph ph-caret-left" style={{ fontSize: '18px', color: '#9ca3af' }}></i>
            </button>
            <h2 style={{ fontSize: '15px', fontWeight: 500, color: 'white' }}>AI Settings</h2>
            <button onClick={() => navigateTo('view-home')} className="glass glass-btn"
              title="Back to home"
              style={{ width: '40px', height: '40px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
              <i className="ph ph-house" style={{ fontSize: '18px', color: '#9ca3af' }}></i>
            </button>
          </nav>

          {/* Tab Navigation */}
          <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexShrink: 0 }}>
            <button onClick={() => setSettingsTab('general')}
              style={{
                flex: 1, padding: '10px 16px', borderRadius: '9999px', fontSize: '12px', fontWeight: 500,
                border: settingsTab === 'general' ? '1px solid rgba(168,85,247,0.4)' : '1px solid rgba(255,255,255,0.05)',
                background: settingsTab === 'general' ? 'rgba(168,85,247,0.2)' : 'rgba(255,255,255,0.03)',
                color: settingsTab === 'general' ? '#c4b5fd' : '#aaa', cursor: 'pointer',
              }}>
              ⚙️ General
            </button>
            <button onClick={() => setSettingsTab('integration')}
              style={{
                flex: 1, padding: '10px 16px', borderRadius: '9999px', fontSize: '12px', fontWeight: 500,
                border: settingsTab === 'integration' ? '1px solid rgba(168,85,247,0.4)' : '1px solid rgba(255,255,255,0.05)',
                background: settingsTab === 'integration' ? 'rgba(168,85,247,0.2)' : 'rgba(255,255,255,0.03)',
                color: settingsTab === 'integration' ? '#c4b5fd' : '#aaa', cursor: 'pointer',
              }}>
              ⚡ Integration
            </button>
          </div>

          <div style={{ flex: 1, overflowY: 'auto' }} className="no-scrollbar">
            {/* ─── General Tab ──────────────── */}
            {settingsTab === 'general' && (
              <>
                <div style={{ background: 'rgba(255,255,255,0.03)', backdropFilter: 'blur(16px)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '16px', padding: '16px', marginBottom: '16px' }}>
                  <label style={{ fontSize: '14px', color: '#d1d5db', marginBottom: '8px', display: 'block' }}>Text Chat System Prompt</label>
                  <textarea value={systemPrompt} onChange={e => setSystemPrompt(e.target.value)}
                    style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', padding: '12px', fontSize: '14px', color: 'white', resize: 'none', height: '128px', outline: 'none', fontFamily: "'Outfit', sans-serif" }} />
                  <div style={{ color: '#9ca3af', fontSize: '12px', marginTop: '8px', lineHeight: 1.5 }}>
                    Gemini Live audio now uses a locked Beatrice system persona internally. This editor only affects the text chat experience.
                  </div>
                  <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                    <button onClick={() => {
                      if (currentUser) set(ref(rtdb, 'users/' + currentUser.uid + '/systemPrompt'), systemPrompt);
                    }} style={{ background: '#d946ef', color: 'white', padding: '8px 16px', borderRadius: '9999px', fontSize: '12px', fontWeight: 500, border: 'none', cursor: 'pointer' }}>
                      Save
                    </button>
                    <button onClick={() => {
                      setSystemPrompt(DEFAULT_SYSTEM_PROMPT);
                      if (currentUser) set(ref(rtdb, 'users/' + currentUser.uid + '/systemPrompt'), DEFAULT_SYSTEM_PROMPT);
                    }} style={{ background: 'rgba(255,255,255,0.1)', color: '#d1d5db', padding: '8px 16px', borderRadius: '9999px', fontSize: '12px', border: 'none', cursor: 'pointer' }}>
                      Reset
                    </button>
                  </div>
                </div>
                <div style={{ background: 'rgba(255,255,255,0.03)', backdropFilter: 'blur(16px)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '16px', padding: '16px', marginBottom: '16px' }}>
                  <label style={{ fontSize: '14px', color: '#d1d5db', marginBottom: '8px', display: 'block' }}>Voice Model</label>
                  <select value={liveVoice} onChange={e => setLiveVoice(e.target.value)}
                    style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', padding: '12px', fontSize: '14px', color: 'white', outline: 'none', appearance: 'none' }}>
                    {AVAILABLE_VOICES.map(v => (
                      <option key={v} value={v} style={{ backgroundColor: '#0a0a0a' }}>{v}</option>
                    ))}
                  </select>
                </div>
                <div style={{ background: 'rgba(255,255,255,0.03)', backdropFilter: 'blur(16px)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '16px', padding: '16px' }}>
                  <label style={{ fontSize: '14px', color: '#d1d5db', marginBottom: '8px', display: 'block' }}>
                    Temperature <span style={{ color: '#d946ef' }}>{tempValue.toFixed(1)}</span>
                  </label>
                  <input type="range" min="0" max="2" step="0.1" value={tempValue} onChange={e => setTempValue(parseFloat(e.target.value))}
                    style={{ width: '100%', accentColor: '#d946ef' }} />
                </div>

                {/* ─── Knowledge Base Upload ────────── */}
                <div style={{ background: 'rgba(255,255,255,0.03)', backdropFilter: 'blur(16px)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '16px', padding: '16px', marginTop: '16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                    <i className="ph-fill ph-database" style={{ fontSize: '18px', color: '#f0abfc' }}></i>
                    <span style={{ fontSize: '13px', fontWeight: 500, color: '#d1d5db' }}>Knowledge Base</span>
                    <span style={{ fontSize: '10px', color: '#86efac', background: 'rgba(134,239,172,0.15)', padding: '2px 8px', borderRadius: '9999px', marginLeft: 'auto' }}>Memory</span>
                  </div>
                  <p style={{ fontSize: '11px', color: '#6b7280', marginBottom: '12px', lineHeight: 1.5 }}>
                    Upload documents (PDF, DOCX, TXT) to Beatrice's long-term memory. She'll use this knowledge to give you better, more personalized answers.
                  </p>
                  <label style={{ fontSize: '11px', color: '#9ca3af', display: 'block', marginBottom: '6px' }}>Upload Document to Memory</label>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <input
                      type="file"
                      accept=".pdf,.docx,.txt,.md,.csv"
                      style={{ display: 'none' }}
                      id="knowledge-base-upload"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        try {
                          const rawText = await file.text();
                          const cleanedText = normalizeWhitespace(rawText).slice(0, 10000);
                          const detectedLang = detectLanguageHeuristically(cleanedText);
                          const docId = createId('upload');
                          const now = nowIso();
                          const ownerId = getEffectiveUserId();

                          const uploadRecord: ScannedDocumentRecord = {
                            document_id: docId,
                            owner_user_id: ownerId,
                            source: 'file_upload',
                            created_at: now,
                            updated_at: now,
                            title: file.name,
                            scan_label: `User upload: ${file.name}`,
                            source_name: file.name,
                            image_metadata: {},
                            ocr: {
                              raw_text: cleanedText,
                              cleaned_text: cleanedText,
                              detected_language: detectedLang,
                              confidence: 1.0,
                              page_count: 1,
                            },
                            analysis: {
                              document_type: 'business_document',
                              short_summary: cleanedText.slice(0, 120) + (cleanedText.length > 120 ? '...' : ''),
                              detailed_summary: cleanedText.slice(0, 500),
                              key_points: [],
                              action_items: [],
                              entities: { people: [], companies: [], dates: [], places: [], amounts: [], emails: [], phone_numbers: [] },
                              important_entities: [],
                              memory_payload: cleanedText,
                              suggested_followup_questions: [],
                              suggested_title: file.name,
                              suggested_tags: [],
                              importance: 'medium',
                            },
                            memory: {
                              saved_to_short_memory: false,
                              saved_to_long_memory: false,
                              memory_id: null,
                              suggested_title: file.name,
                              suggested_tags: [],
                            },
                            ui: {
                              suggested_followups: [],
                            },
                            related_document_ids: [],
                            raw_image_data_url: null,
                          };

                          const { MemoryService } = await import('@/lib/document/memory-service');
                          await MemoryService.saveLongMemory(uploadRecord);
                          alert(`✅ "${file.name}" saved to knowledge base.`);
                        } catch (err) {
                          alert(`❌ Failed to upload: ${err}`);
                        }
                        e.target.value = '';
                      }}
                    />
                    <button
                      onClick={() => document.getElementById('knowledge-base-upload')?.click()}
                      style={{
                        flex: 1,
                        background: 'rgba(168,85,247,0.15)',
                        border: '1px solid rgba(168,85,247,0.3)',
                        borderRadius: '12px',
                        padding: '12px 16px',
                        fontSize: '13px',
                        color: '#c4b5fd',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '8px',
                      }}
                    >
                      <i className="ph ph-upload-simple" style={{ fontSize: '16px' }}></i>
                      Choose File & Upload
                    </button>
                  </div>
                  <div style={{ fontSize: '10px', color: '#6b7280', marginTop: '8px', lineHeight: 1.4 }}>
                    Supported formats: PDF, DOCX, TXT, MD, CSV. Maximum 10,000 characters per upload.
                    Beatrice will search this knowledge when answering your questions.
                  </div>
                </div>
              </>
            )}

            {/* ─── Integration Tab (Ollama) ─── */}
            {settingsTab === 'integration' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {/* Server URL */}
                <div style={{ background: 'rgba(255,255,255,0.03)', backdropFilter: 'blur(16px)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '16px', padding: '16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                    <i className="ph-fill ph-cpu" style={{ fontSize: '18px', color: '#a78bfa' }}></i>
                    <span style={{ fontSize: '13px', fontWeight: 500, color: '#d1d5db' }}>Ollama Local LLM</span>
                    <span style={{ fontSize: '10px', color: '#86efac', background: 'rgba(134,239,172,0.15)', padding: '2px 8px', borderRadius: '9999px', marginLeft: 'auto' }}>Local Device</span>
                  </div>
                  <p style={{ fontSize: '11px', color: '#6b7280', marginBottom: '12px', lineHeight: 1.5 }}>
                    Connect to a local Ollama server running on your device. Make sure Ollama is installed and running (<a href="https://ollama.ai" target="_blank" rel="noreferrer" style={{ color: '#a78bfa' }}>ollama.ai</a>).
                  </p>
                  <label style={{ fontSize: '11px', color: '#9ca3af', display: 'block', marginBottom: '6px' }}>Server URL</label>
                  <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                    <input type="text" defaultValue={localCfg.baseUrl || 'http://168.231.78.113:11434'} onChange={e => ollamaUrlRef.current = e.target.value}
                      style={{ flex: 1, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', padding: '10px 12px', fontSize: '13px', color: 'white', outline: 'none' }}
                      placeholder="http://168.231.78.113:11434" />
                    <button onClick={ollamaConnect}
                      style={{ background: '#a78bfa', color: 'white', padding: '10px 16px', borderRadius: '12px', fontSize: '12px', fontWeight: 500, border: 'none', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                      Connect
                    </button>
                  </div>
                  <p className={ollamaStatusClass} style={{ fontSize: '11px', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <span style={{ width: '6px', height: '6px', borderRadius: '50%', display: 'inline-block', background: ollamaStatus.includes('Connected') ? '#4ade80' : ollamaStatus.includes('failed') ? '#f87171' : ollamaStatus.includes('Pulling') ? '#facc15' : '#6b7280' }}></span>
                    {ollamaStatus}
                  </p>
                </div>

                {/* Enable / Model Select */}
                {ollamaStatus.includes('Connected') && (
                  <>
                    <div style={{ background: 'rgba(255,255,255,0.03)', backdropFilter: 'blur(16px)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '16px', padding: '16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                        <span style={{ fontSize: '13px', fontWeight: 500, color: '#d1d5db' }}>Use Local LLM</span>
                        <label style={{ position: 'relative', display: 'inline-block', width: '44px', height: '24px' }}>
                          <input type="checkbox" checked={localCfg.enabled} onChange={e => ollamaHandleToggle(e.target.checked)}
                            style={{ opacity: 0, width: 0, height: 0 }} />
                          <span style={{
                            position: 'absolute', cursor: 'pointer', inset: 0, borderRadius: '24px', transition: '0.3s',
                            background: localCfg.enabled ? '#a78bfa' : '#444',
                          }}>
                            <span style={{
                              position: 'absolute', height: '18px', width: '18px', left: localCfg.enabled ? '23px' : '3px', bottom: '3px',
                              background: 'white', borderRadius: '50%', transition: '0.3s',
                            }} />
                          </span>
                        </label>
                      </div>
                      <label style={{ fontSize: '11px', color: '#9ca3af', display: 'block', marginBottom: '6px' }}>Active Model</label>
                      <select value={localCfg.model} onChange={e => ollamaHandleModelChange(e.target.value)}
                        style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', padding: '10px 12px', fontSize: '13px', color: 'white', outline: 'none', appearance: 'none' }}>
                        <option value="">None selected</option>
                        {ollamaModels.map(m => (
                          <option key={m.name} value={m.name} style={{ backgroundColor: '#0a0a0a' }}>{m.name}</option>
                        ))}
                      </select>
                      {localCfg.enabled && localCfg.model && (
                        <p style={{ fontSize: '10px', color: '#4ade80', marginTop: '8px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <i className="ph-fill ph-check-circle"></i> Chat will use {localCfg.model} locally
                        </p>
                      )}
                    </div>

                    {/* Pull Model */}
                    <div style={{ background: 'rgba(255,255,255,0.03)', backdropFilter: 'blur(16px)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '16px', padding: '16px' }}>
                      <label style={{ fontSize: '11px', color: '#9ca3af', display: 'block', marginBottom: '6px' }}>Pull New Model</label>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <input type="text" value={ollamaPullModelValue} onChange={e => setOllamaPullModelValue(e.target.value)}
                          placeholder="e.g. llama3, mistral, gemma2"
                          style={{ flex: 1, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', padding: '10px 12px', fontSize: '13px', color: 'white', outline: 'none' }} />
                        <button onClick={() => ollamaPullModel(ollamaPullModelValue)} disabled={ollamaPulling || !ollamaPullModelValue.trim()}
                          style={{ background: ollamaPulling ? '#6b7280' : '#3b82f6', color: 'white', padding: '10px 16px', borderRadius: '12px', fontSize: '12px', fontWeight: 500, border: 'none', cursor: ollamaPulling ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap' }}>
                          {ollamaPulling ? 'Pulling...' : 'Pull'}
                        </button>
                      </div>
                    </div>

                    {/* Installed Models */}
                    <div style={{ background: 'rgba(255,255,255,0.03)', backdropFilter: 'blur(16px)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '16px', padding: '16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                        <i className="ph ph-database" style={{ fontSize: '16px', color: '#9ca3af' }}></i>
                        <span style={{ fontSize: '12px', fontWeight: 500, color: '#9ca3af' }}>Installed Models</span>
                        <span style={{ fontSize: '10px', color: '#6b7280', background: 'rgba(255,255,255,0.05)', padding: '2px 8px', borderRadius: '9999px', marginLeft: 'auto' }}>{ollamaModels.length}</span>
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                        {ollamaModels.length === 0 ? (
                          <span style={{ fontSize: '11px', color: '#6b7280', fontStyle: 'italic' }}>No models installed yet. Pull one above.</span>
                        ) : (
                          ollamaModels.map(m => (
                            <span key={m.name} style={{
                              fontSize: '11px', padding: '4px 10px', borderRadius: '9999px',
                              background: m.name === localCfg.model ? 'rgba(168,85,247,0.2)' : 'rgba(255,255,255,0.05)',
                              border: m.name === localCfg.model ? '1px solid rgba(168,85,247,0.3)' : '1px solid rgba(255,255,255,0.05)',
                              color: m.name === localCfg.model ? '#c4b5fd' : '#9ca3af',
                            }}>
                              {m.name}
                            </span>
                          ))
                        )}
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* PROFILE */}
      <section id="view-profile"
        className={'page-view' + (currentView === 'view-profile' ? ' active' : '')}
        style={{ backgroundColor: '#0a0a0a' }}
        aria-hidden={currentView !== 'view-profile'}>
        <div style={{ position: 'absolute', top: 0, right: 0, width: '300px', height: '300px', background: 'rgba(236,72,153,0.15)', borderRadius: '50%', filter: 'blur(80px)', pointerEvents: 'none' }} />
        <div style={{ flex: 1, padding: '56px 24px 48px', overflowY: 'auto', position: 'relative', zIndex: 10, display: 'flex', flexDirection: 'column' }} className="no-scrollbar">
          <nav style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexShrink: 0 }}>
            <button onClick={goBack} className="glass glass-btn"
              style={{ width: '40px', height: '40px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
              <i className="ph ph-caret-left" style={{ fontSize: '18px', color: '#9ca3af' }}></i>
            </button>
            <h2 style={{ fontSize: '15px', fontWeight: 500, color: 'white' }}>Profile</h2>
            <button onClick={() => navigateTo('view-home')} className="glass glass-btn"
              title="Back to home"
              style={{ width: '40px', height: '40px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
              <i className="ph ph-house" style={{ fontSize: '18px', color: '#9ca3af' }}></i>
            </button>
          </nav>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: '24px' }}>
            {currentUser?.photoURL ? (
              <img src={currentUser.photoURL} alt={displayName}
                style={{ width: '96px', height: '96px', borderRadius: '50%', border: '4px solid #171717', marginBottom: '16px', objectFit: 'cover' }} />
            ) : (
              <div aria-label={displayName}
                style={{ width: '96px', height: '96px', borderRadius: '50%', border: '4px solid #171717', marginBottom: '16px', background: 'linear-gradient(135deg, #d946ef, #7e22ce)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: '28px', fontWeight: 700 }}>
                {avatarInitials}
              </div>
            )}
            <h3 style={{ fontSize: '18px', fontWeight: 500, color: 'white' }}>{displayName}</h3>
            <p style={{ fontSize: '14px', color: '#d946ef' }}>{currentUser?.email || profile?.email || 'Not signed in'}</p>
            <p style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>
              {currentUser?.metadata?.createdAt ? 'Member since ' + new Date(parseInt(currentUser.metadata.createdAt)).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) : ''}
            </p>
          </div>

          {/* Profile Preferences */}
          {!showEditProfile && (
            <div style={{ background: 'rgba(255,255,255,0.03)', backdropFilter: 'blur(16px)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '16px', padding: '16px', marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                <span style={{ fontSize: '11px', fontWeight: 500, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '1px' }}>How Beatrice addresses you</span>
                <button onClick={() => { setEditName(displayName); setEditAddress(preferredAddress); setShowEditProfile(true); }}
                  style={{ fontSize: '11px', color: '#d946ef', display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer', background: 'none', border: 'none' }}>
                  <i className="ph ph-pencil-simple" style={{ fontSize: '12px' }}></i> Edit
                </button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '14px' }}>
                  <span style={{ color: '#9ca3af' }}>Preferred name</span>
                  <span style={{ color: 'white', fontWeight: 500 }}>{displayName}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '14px' }}>
                  <span style={{ color: '#9ca3af' }}>Preferred address</span>
                  <span style={{ color: 'white', fontWeight: 500 }}>{preferredAddress}</span>
                </div>
              </div>
            </div>
          )}

          {/* Edit Profile */}
          {showEditProfile && (
            <div style={{ background: 'rgba(255,255,255,0.03)', backdropFilter: 'blur(16px)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '16px', padding: '16px', marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                <span style={{ fontSize: '11px', fontWeight: 500, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '1px' }}>Edit Profile</span>
                <button onClick={() => setShowEditProfile(false)} style={{ fontSize: '11px', color: '#9ca3af', cursor: 'pointer', background: 'none', border: 'none' }}>Cancel</button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <label style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <span style={{ fontSize: '12px', color: '#9ca3af' }}>Your name</span>
                  <input type="text" placeholder="Your name" value={editName} onChange={e => setEditName(e.target.value)}
                    style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', padding: '10px 12px', fontSize: '14px', color: 'white', outline: 'none', fontFamily: "'Outfit', sans-serif" }} />
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <span style={{ fontSize: '12px', color: '#9ca3af' }}>Preferred address</span>
                  <input type="text" placeholder="e.g. Meneer Alex, Alex, Ms. Claire" value={editAddress} onChange={e => setEditAddress(e.target.value)}
                    style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', padding: '10px 12px', fontSize: '14px', color: 'white', outline: 'none', fontFamily: "'Outfit', sans-serif" }} />
                </label>
                <button onClick={saveProfile}
                  style={{ width: '100%', backgroundColor: '#d946ef', color: 'white', borderRadius: '9999px', padding: '10px', fontSize: '14px', fontWeight: 500, border: 'none', cursor: 'pointer' }}>
                  Save Profile
                </button>
              </div>
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: 'auto' }}>
            <button onClick={() => navigateTo('view-settings')} className="glass glass-btn"
              style={{ width: '100%', borderRadius: '16px', padding: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', textAlign: 'left', cursor: 'pointer' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '14px', fontWeight: 500, color: 'white' }}>
                <i className="ph ph-gear" style={{ fontSize: '18px', color: '#9ca3af' }}></i> Settings & Preferences
              </span>
              <i className="ph ph-caret-right" style={{ color: '#6b7280' }}></i>
            </button>
            <button onClick={() => navigateTo('view-history')} className="glass glass-btn"
              style={{ width: '100%', borderRadius: '16px', padding: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', textAlign: 'left', cursor: 'pointer' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '14px', fontWeight: 500, color: 'white' }}>
                <i className="ph ph-clock-counter-clockwise" style={{ fontSize: '18px', color: '#9ca3af' }}></i> Conversation History
              </span>
              <i className="ph ph-caret-right" style={{ color: '#6b7280' }}></i>
            </button>
          </div>
          <button onClick={handleLogout} className="glass glass-btn"
            style={{ marginTop: '24px', width: '100%', borderRadius: '16px', padding: '16px', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px', color: '#f87171', cursor: 'pointer' }}>
            <i className="ph ph-sign-out" style={{ fontSize: '18px' }}></i>
            <span style={{ fontSize: '14px', fontWeight: 500 }}>Log Out</span>
          </button>
        </div>
      </section>

      {/* IMAGE */}
      <section id="view-image"
        className={'page-view' + (currentView === 'view-image' ? ' active' : '')}
        style={{ backgroundColor: '#0a0a0a' }}
        aria-hidden={currentView !== 'view-image'}>
        <div style={{ position: 'absolute', top: 0, right: 0, width: '250px', height: '250px', background: 'rgba(168,85,247,0.15)', borderRadius: '50%', filter: 'blur(60px)', pointerEvents: 'none' }} />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', position: 'relative', zIndex: 10, padding: '56px 24px 48px', height: '100%' }}>
          <nav style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexShrink: 0 }}>
            <button onClick={goBack} className="glass glass-btn"
              style={{ width: '40px', height: '40px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
              <i className="ph ph-caret-left" style={{ fontSize: '18px', color: '#9ca3af' }}></i>
            </button>
            <h2 style={{ fontSize: '15px', fontWeight: 500, color: 'white' }}>Image Generation</h2>
            <button onClick={() => navigateTo('view-home')} className="glass glass-btn"
              title="Back to home"
              style={{ width: '40px', height: '40px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
              <i className="ph ph-house" style={{ fontSize: '18px', color: '#9ca3af' }}></i>
            </button>
          </nav>
          <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '24px' }} className="no-scrollbar">
            {imageMessages.length === 0 ? (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6b7280', fontSize: '14px' }}>
                <div style={{ textAlign: 'center' }}>
                  <i className="ph-fill ph-camera" style={{ fontSize: '24px', marginBottom: '8px', opacity: 0.3 }}></i>
                  <p>Describe the image you want</p>
                </div>
              </div>
            ) : (
              imageMessages.map((msg, i) => (
                <div key={i} className="msg-bubble" style={{
                  alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                  background: 'rgba(255,255,255,0.03)',
                  backdropFilter: 'blur(16px)',
                  border: '1px solid rgba(255,255,255,0.05)',
                  borderRadius: msg.role === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                  borderLeft: msg.role === 'assistant' ? '2px solid #d946ef' : undefined,
                  padding: '16px',
                  maxWidth: msg.role === 'user' ? '85%' : '90%',
                }}>
                  <p style={{ fontSize: '13px', lineHeight: 1.6, color: '#d1d5db' }}>{msg.content}</p>
                </div>
              ))
            )}
          </div>
          <form onSubmit={e => { e.preventDefault(); sendMediaPrompt(imageInput, 'You are an expert image prompt designer. Generate a detailed, vivid image generation prompt based on the user\'s request. Include style, lighting, color palette, and composition details.', setImageMessages); setImageInput(''); }}
            style={{ marginTop: '16px', background: 'rgba(255,255,255,0.03)', backdropFilter: 'blur(16px)', borderRadius: '9999px', display: 'flex', alignItems: 'center', padding: '6px 6px 6px 20px', flexShrink: 0 }}>
            <input type="text" placeholder="Describe an image..." value={imageInput} onChange={e => setImageInput(e.target.value)}
              style={{ background: 'transparent', border: 'none', outline: 'none', fontSize: '14px', flex: 1, color: '#d1d5db' }} />
            <button type="submit"
              style={{ width: '36px', height: '36px', borderRadius: '50%', backgroundColor: '#d946ef', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, border: 'none', cursor: 'pointer' }}>
              <i className="ph-fill ph-arrow-up" style={{ color: 'white', fontSize: '14px' }}></i>
            </button>
          </form>
        </div>
      </section>

      {/* VIDEO */}
      <section id="view-video"
        className={'page-view' + (currentView === 'view-video' ? ' active' : '')}
        style={{ backgroundColor: '#0a0a0a' }}
        aria-hidden={currentView !== 'view-video'}>
        <div style={{ position: 'absolute', bottom: 0, left: 0, width: '300px', height: '300px', background: 'rgba(59,130,246,0.1)', borderRadius: '50%', filter: 'blur(60px)', pointerEvents: 'none' }} />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', position: 'relative', zIndex: 10, padding: '56px 24px 48px', height: '100%' }}>
          <nav style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexShrink: 0 }}>
            <button onClick={goBack} className="glass glass-btn"
              style={{ width: '40px', height: '40px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
              <i className="ph ph-caret-left" style={{ fontSize: '18px', color: '#9ca3af' }}></i>
            </button>
            <h2 style={{ fontSize: '15px', fontWeight: 500, color: 'white' }}>Video Generation</h2>
            <button onClick={() => navigateTo('view-home')} className="glass glass-btn"
              title="Back to home"
              style={{ width: '40px', height: '40px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
              <i className="ph ph-house" style={{ fontSize: '18px', color: '#9ca3af' }}></i>
            </button>
          </nav>
          <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '24px' }} className="no-scrollbar">
            {videoMessages.length === 0 ? (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6b7280', fontSize: '14px' }}>
                <div style={{ textAlign: 'center' }}>
                  <i className="ph-fill ph-video" style={{ fontSize: '24px', marginBottom: '8px', opacity: 0.3 }}></i>
                  <p>Describe the video you want to generate</p>
                </div>
              </div>
            ) : (
              videoMessages.map((msg, i) => (
                <div key={i} className="msg-bubble" style={{
                  alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                  background: 'rgba(255,255,255,0.03)',
                  backdropFilter: 'blur(16px)',
                  border: '1px solid rgba(255,255,255,0.05)',
                  borderRadius: msg.role === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                  borderLeft: msg.role === 'assistant' ? '2px solid #d946ef' : undefined,
                  padding: '16px',
                  maxWidth: msg.role === 'user' ? '85%' : '90%',
                }}>
                  <p style={{ fontSize: '13px', lineHeight: 1.6, color: '#d1d5db' }}>{msg.content}</p>
                </div>
              ))
            )}
          </div>
          <form onSubmit={e => { e.preventDefault(); sendMediaPrompt(videoInput, 'You are an expert video prompt designer. Generate a detailed video generation prompt based on the user\'s request. Include camera movement, scene transitions, mood, lighting, and pacing details.', setVideoMessages); setVideoInput(''); }}
            style={{ marginTop: '16px', background: 'rgba(255,255,255,0.03)', backdropFilter: 'blur(16px)', borderRadius: '9999px', display: 'flex', alignItems: 'center', padding: '6px 6px 6px 20px', flexShrink: 0 }}>
            <input type="text" placeholder="Describe a video..." value={videoInput} onChange={e => setVideoInput(e.target.value)}
              style={{ background: 'transparent', border: 'none', outline: 'none', fontSize: '14px', flex: 1, color: '#d1d5db' }} />
            <button type="submit"
              style={{ width: '36px', height: '36px', borderRadius: '50%', backgroundColor: '#3b82f6', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, border: 'none', cursor: 'pointer' }}>
              <i className="ph-fill ph-arrow-up" style={{ color: 'white', fontSize: '14px' }}></i>
            </button>
          </form>
        </div>
      </section>

      {/* BOTTOM NAV — visible on the form-free destination views. Views
          with sticky input forms (text/image/video) get their own header
          shortcuts so they don't overlap. */}
      {(() => {
        const NAV_HIDDEN_VIEWS = new Set(['view-splash', 'view-auth', 'view-voice']);
        const navVisible = !NAV_HIDDEN_VIEWS.has(currentView);
        const navItem = (target: string, icon: string, label: string) => (
          <button
            key={target}
            onClick={() => navigateTo(target)}
            title={label}
            aria-label={label}
            style={{
              color: currentView === target ? 'white' : '#6b7280',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '4px',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              flex: 1,
              padding: '8px 4px',
              minHeight: '44px',
            }}
          >
            <i className={icon} style={{ fontSize: '22px' }}></i>
            <span style={{ fontSize: '10px', fontWeight: 500, letterSpacing: '0.02em' }}>{label}</span>
          </button>
        );
        return (
          <nav id="bottom-nav"
            style={{
              position: 'fixed',
              bottom: 'calc(16px + env(safe-area-inset-bottom, 0px))',
              left: '50%',
              transform: navVisible ? 'translateX(-50%) translateY(0)' : 'translateX(-50%) translateY(100px)',
              width: 'calc(100% - 48px)',
              maxWidth: '420px',
              background: 'rgba(10, 10, 15, 0.92)',
              backdropFilter: 'blur(24px)',
              WebkitBackdropFilter: 'blur(24px)',
              border: '1px solid rgba(255,255,255,0.07)',
              borderRadius: '28px',
              padding: '8px 16px',
              display: 'flex',
              justifyContent: 'space-around',
              alignItems: 'flex-end',
              zIndex: 500,
              opacity: navVisible ? 1 : 0,
              pointerEvents: navVisible ? 'auto' : 'none',
              transition: 'opacity 0.3s, transform 0.3s',
            }}>
            {navItem('view-home', 'ph-fill ph-house', 'Home')}
            {navItem('view-text', 'ph ph-chat-teardrop-text', 'Chat')}
            <button
              onClick={() => navigateTo('view-voice')}
              title="Voice Assistant"
              aria-label="Open voice assistant"
              style={{
                position: 'relative',
                width: '64px',
                height: '64px',
                borderRadius: '50%',
                background: 'linear-gradient(135deg, #d946ef 0%, #a855f7 50%, #7e22ce 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'white',
                border: 'none',
                boxShadow: '0 0 0 4px rgba(10,10,15,0.9), 0 4px 20px rgba(217,70,239,0.5), 0 8px 40px rgba(126,34,206,0.3)',
                transform: 'translateY(-12px)',
                cursor: 'pointer',
                transition: 'transform 0.2s, box-shadow 0.2s',
                flexShrink: 0,
              }}
              onMouseEnter={e => {
                e.currentTarget.style.transform = 'translateY(-14px)';
                e.currentTarget.style.boxShadow = '0 0 0 4px rgba(10,10,15,0.9), 0 6px 30px rgba(217,70,239,0.6), 0 12px 50px rgba(126,34,206,0.4)';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.transform = 'translateY(-12px)';
                e.currentTarget.style.boxShadow = '0 0 0 4px rgba(10,10,15,0.9), 0 4px 20px rgba(217,70,239,0.5), 0 8px 40px rgba(126,34,206,0.3)';
              }}>
              <i className="ph-fill ph-microphone" style={{ fontSize: '26px' }}></i>
              <span style={{
                position: 'absolute',
                inset: '-8px',
                borderRadius: '50%',
                border: '2px solid rgba(217,70,239,0.3)',
                animation: 'ping 2s ease-out infinite',
                opacity: 0,
              }} />
            </button>
            {navItem('view-image', 'ph ph-camera', 'Image')}
            {navItem('view-profile', 'ph ph-user', 'Profile')}
          </nav>
        );
      })()}
      {/* Processing content is shown in main view via StreamingConsole, not as overlay */}
    </main>
  );
}

// ═══════════════════════════════════════════════════════
// MAIN APP
// ═══════════════════════════════════════════════════════
function App() {
  if (!API_KEY) {
    return <MissingApiKeyScreen />;
  }

  return (
    <div className="App" style={{ width: '100vw', height: '100dvh', position: 'relative', overflow: 'hidden' }}>
      <AuthScreen>
        <LiveAPIProvider apiKey={API_KEY}>
          <AppShell>
            <StreamingConsole />
          </AppShell>
          <Sidebar />
          <DocumentScannerModal />
          <UserProfileOnboardingModal />
          <EburonFlixOverlay />
        </LiveAPIProvider>
      </AuthScreen>
    </div>
  );
}

export default App;
