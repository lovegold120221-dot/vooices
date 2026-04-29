/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { FunctionCall, useSettings, useUI, useTools, Template } from '@/lib/state';
import c from 'classnames';
import { DEFAULT_LIVE_API_MODEL, AVAILABLE_VOICES } from '@/lib/constants';
import { useLiveAPIContext } from '@/contexts/LiveAPIContext';
import { useEffect, useState } from 'react';
import ToolEditorModal from './ToolEditorModal';
import { examplePrompts } from '@/lib/prompts';
import { useDocumentSettingsStore } from '@/lib/document/store';
import { MemoryService } from '@/lib/document/memory-service';

import { logout } from '@/lib/firebase';

const AVAILABLE_MODELS = [
  DEFAULT_LIVE_API_MODEL
];

const TEMPLATES: { value: Template; label: string }[] = [
  { value: 'customer-support', label: 'Customer Support' },
  { value: 'personal-assistant', label: 'Personal Assistant' },
  { value: 'navigation-system', label: 'Navigation System' },
  { value: 'beatrice', label: 'Beatrice' },
];

export default function Sidebar() {
  const { isSidebarOpen, toggleSidebar } = useUI();
  const { systemPrompt, model, voice, setSystemPrompt, setModel, setVoice } =
    useSettings();
  const { tools, toggleTool, addTool, removeTool, updateTool, template, setTemplate } = useTools();
  const { connected } = useLiveAPIContext();
  const { settings, updateSettings } = useDocumentSettingsStore();
  const applyDocumentSetting = (next: Parameters<typeof updateSettings>[0]) => {
    updateSettings(next);
    MemoryService.updateSettings(next);
  };

  const [editingTool, setEditingTool] = useState<FunctionCall | null>(null);

  useEffect(() => {
    updateSettings(MemoryService.getSettings());
  }, [updateSettings]);

  const handleSaveTool = (updatedTool: FunctionCall) => {
    if (editingTool) {
      updateTool(editingTool.name, updatedTool);
    }
    setEditingTool(null);
  };

  const isBeatriceTemplate = template === 'beatrice';

  return (
    <aside className={c('sidebar', 'drawer', 'settings-drawer', { open: isSidebarOpen })}>
      {/* Header */}
      <div className="px-6 py-6 border-b border-white/5 flex items-center justify-between sticky top-0 bg-[#0E1015] z-20">
        <div className="flex items-center gap-3">
          <div className="w-2.5 h-2.5 bg-emerald-400 rounded-full shadow-[0_0_8px_rgba(52,211,153,0.8)]"></div>
          <h2 className="font-medium text-lg text-white">Beatrice Hub</h2>
        </div>
        <div className="flex items-center gap-2">
          <button 
            onClick={logout}
            className="p-2 border border-white/10 rounded-full hover:bg-white/5 text-gray-400 transition"
            title="Sign Out"
            aria-label="Sign out"
          >
            <span className="material-symbols-outlined text-sm">logout</span>
          </button>
          <button 
            onClick={toggleSidebar}
            className="p-2 border border-white/10 rounded-full hover:bg-white/5 text-gray-400 transition"
            title="Close Sidebar"
            aria-label="Close tools and services panel"
          >
            <span className="material-symbols-outlined text-sm">close</span>
          </button>
        </div>
      </div>

      {/* Sidebar Content */}
      <div className="p-6 flex flex-col gap-8">
        
        {/* Persona Template */}
        <div className="flex flex-col gap-2">
          <label className="text-[11px] font-medium text-gray-400 uppercase tracking-wider">Persona Template</label>
          <input 
            type="text" 
            value={template} 
            onChange={(e) => setTemplate(e.target.value as Template)}
            className="w-full bg-[#181A24] border border-white/10 rounded-lg px-4 py-3 text-sm text-white focus:outline-none focus:border-blue-500/50 transition"
            title="Persona Template"
          />
        </div>

        {isBeatriceTemplate ? (
          <div className="flex flex-col gap-2">
            <label className="text-[11px] font-medium text-gray-400 uppercase tracking-wider">Voice System Persona</label>
            <div className="w-full bg-[#181A24] border border-white/10 rounded-lg px-4 py-4 text-sm text-gray-300 leading-relaxed">
              <div className="text-white font-medium mb-1">Beatrice is locked for Gemini Live audio</div>
              <div className="text-gray-400">
                The live voice prompt is now system-managed with the default Beatrice persona for Jo Lernout and is hidden from the frontend editor.
              </div>
            </div>
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-2">
              <label className="text-[11px] font-medium text-gray-400 uppercase tracking-wider">Active Instruction Overlay</label>
              <textarea 
                value={systemPrompt}
                onChange={(e) => setSystemPrompt(e.target.value)}
                className="w-full bg-[#181A24] border border-white/10 rounded-lg px-4 py-3 text-sm text-gray-300 h-40 resize-none font-mono focus:outline-none focus:border-blue-500/50 transition leading-relaxed"
                title="System Instructions"
              />
            </div>

            <div className="flex flex-col gap-3">
              <label className="text-[11px] font-medium text-gray-400 uppercase tracking-wider">Presets</label>
              <div className="flex flex-wrap gap-2">
                {examplePrompts[template].map((p, i) => (
                  <button 
                    key={i}
                    onClick={() => setSystemPrompt(p.prompt)}
                    className="px-4 py-2 rounded-full border border-white/10 text-[11px] text-gray-300 hover:bg-white/5 transition"
                    title={p.title}
                  >
                    {p.title}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

        {/* Voice Persona */}
        <div className="flex flex-col gap-2">
          <label className="text-[11px] font-medium text-gray-400 uppercase tracking-wider">Voice Persona</label>
          <select 
            value={voice}
            onChange={(e) => setVoice(e.target.value)}
            className="w-full bg-[#181A24] border border-white/10 rounded-lg px-4 py-3 text-sm text-white appearance-none focus:outline-none focus:border-blue-500/50 transition cursor-pointer"
            title="Select Voice"
          >
            {AVAILABLE_VOICES.map((availableVoice) => (
              <option key={availableVoice} value={availableVoice}>
                {availableVoice}
              </option>
            ))}
          </select>
        </div>

        {/* Integrated Services */}
        <div className="flex flex-col gap-3">
          <label className="text-[11px] font-medium text-gray-400 uppercase tracking-wider">Integrated Services</label>
          
          <div className="flex flex-col gap-2">
            {tools.map((tool) => (
              <div key={tool.name} className="flex items-center justify-between bg-[#181A24] border border-white/10 rounded-lg px-4 py-3">
                <div className="flex items-center gap-3">
                  <input 
                    type="checkbox" 
                    checked={tool.isEnabled} 
                    onChange={() => toggleTool(tool.name)}
                    className="w-4 h-4 rounded bg-[#2C3B5A] border-none text-blue-500 focus:ring-0 cursor-pointer"
                    title={`Enable ${tool.name}`}
                  />
                  <span className="text-sm text-gray-200">{tool.name.replace(/_/g, ' ')}</span>
                </div>
                <div className="flex items-center gap-3 text-gray-500">
                  <button onClick={() => setEditingTool(tool)} className="hover:text-white transition" title="Edit Service">
                    <span className="material-symbols-outlined text-sm">edit</span>
                  </button>
                  <button onClick={() => removeTool(tool.name)} className="hover:text-red-400 transition" title="Delete Service">
                    <span className="material-symbols-outlined text-sm">delete</span>
                  </button>
                </div>
              </div>
            ))}
            
            <button 
              onClick={() => addTool()}
              className="add-tool-button mt-2"
            >
              <span className="material-symbols-outlined">add</span>
              Add Custom Service
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <label className="text-[11px] font-medium text-gray-400 uppercase tracking-wider">Scan & Memory Settings</label>

          <div className="flex flex-col gap-2">
            <label className="flex items-center justify-between bg-[#181A24] border border-white/10 rounded-lg px-4 py-3 text-sm text-gray-200">
              <span>Auto-save scans to short memory</span>
              <input
                type="checkbox"
                checked={settings.autoSaveShortMemory}
                onChange={event => applyDocumentSetting({ autoSaveShortMemory: event.target.checked })}
              />
            </label>

            <label className="flex items-center justify-between bg-[#181A24] border border-white/10 rounded-lg px-4 py-3 text-sm text-gray-200">
              <span>Auto-save important scans to long memory</span>
              <input
                type="checkbox"
                checked={settings.autoSaveImportantLongMemory}
                onChange={event => applyDocumentSetting({ autoSaveImportantLongMemory: event.target.checked })}
              />
            </label>

            <label className="flex items-center justify-between bg-[#181A24] border border-white/10 rounded-lg px-4 py-3 text-sm text-gray-200">
              <span>Save raw OCR text</span>
              <input
                type="checkbox"
                checked={settings.saveRawOcrText}
                onChange={event => applyDocumentSetting({ saveRawOcrText: event.target.checked })}
              />
            </label>

            <label className="flex items-center justify-between bg-[#181A24] border border-white/10 rounded-lg px-4 py-3 text-sm text-gray-200">
              <span>Save original image</span>
              <input
                type="checkbox"
                checked={settings.saveOriginalImage}
                onChange={event => applyDocumentSetting({ saveOriginalImage: event.target.checked })}
              />
            </label>

            <label className="flex items-center justify-between bg-[#181A24] border border-white/10 rounded-lg px-4 py-3 text-sm text-gray-200">
              <span>Private scan mode</span>
              <input
                type="checkbox"
                checked={settings.privateScanMode}
                onChange={event => applyDocumentSetting({ privateScanMode: event.target.checked })}
              />
            </label>

            <label className="flex flex-col gap-2 bg-[#181A24] border border-white/10 rounded-lg px-4 py-3 text-sm text-gray-200">
              <span>Memory retention</span>
              <select
                value={settings.memoryRetention}
                onChange={event =>
                  applyDocumentSetting({
                    memoryRetention: event.target.value as typeof settings.memoryRetention,
                  })
                }
                className="w-full bg-[#10121A] border border-white/10 rounded-lg px-3 py-2 text-sm text-white"
              >
                <option value="session_only">Session only</option>
                <option value="30_days">30 days</option>
                <option value="permanent">Permanent</option>
              </select>
            </label>
          </div>
        </div>

      </div>

      {editingTool && (
        <ToolEditorModal
          tool={editingTool}
          onSave={handleSaveTool}
          onClose={() => setEditingTool(null)}
        />
      )}
    </aside>
  );
}
