/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { useUI, useProcessingStore } from '@/lib/state';
import AudioVisualizer from './demo/streaming-console/AudioVisualizer';
import { useLiveAPIContext } from '@/contexts/LiveAPIContext';
import { useUserProfileStore } from '@/lib/user-profile-store';
import { onAuthStateChanged, User } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { useState, useEffect } from 'react';
import c from 'classnames';

export default function Header() {
  const { isGeneratingTask, toggleSidebar } = useUI();
  const micLevel = useUI(state => state.micLevel);
  const { connected, volume } = useLiveAPIContext();
  const { isProcessingTask } = useProcessingStore();
  const profile = useUserProfileStore(state => state.profile);
  const [currentUser, setCurrentUser] = useState<User | null>(null);

  useEffect(() => {
    return onAuthStateChanged(auth, u => setCurrentUser(u));
  }, []);

  const displayName = profile?.preferred_name || currentUser?.displayName || 'You';
  const avatarInitials = displayName
    .split(' ')
    .map((w: string) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  const showHeaderOrb = isGeneratingTask || isProcessingTask;
  const orbEnergy = connected ? Math.max(0.08, micLevel, volume * 0.9) : 0.06;
  const orbScale = 1 + orbEnergy * 0.18;

  return (
    <header>
      {/* Left: hamburger */}
      <div className="header-left">
        <button
          onClick={toggleSidebar}
          title="Open sidebar"
          style={{
            width: '40px',
            height: '40px',
            borderRadius: '50%',
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.08)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            color: '#9ca3af',
            transition: 'all 0.2s ease',
          }}
        >
          <i className="ph ph-list" style={{ fontSize: '20px' }}></i>
        </button>
      </div>

      {/* Center: brand */}
      <div style={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <div style={{
          width: '28px',
          height: '28px',
          borderRadius: '50%',
          background: 'radial-gradient(circle at 35% 35%, #fdf4ff, #d946ef 40%, #7e22ce)',
          boxShadow: '0 0 14px rgba(217,70,239,0.5)',
          flexShrink: 0,
        }} />
        <span style={{ fontSize: '17px', fontWeight: 600, color: 'white', letterSpacing: '-0.02em', fontFamily: "'Outfit', sans-serif" }}>Beatrice</span>

        {/* Live orb indicator */}
        {showHeaderOrb && (
          <div className="header-orb-wrapper" style={{ marginLeft: '4px' }}>
            <div
              className={c('header-orb', { 'animate-pulse-glow': connected })}
              style={{
                width: '20px',
                height: '20px',
                transform: `scale(${orbScale.toFixed(3)})`,
                boxShadow: `inset 0 0 6px rgba(255,255,255,0.4), 0 0 ${12 + orbEnergy * 20}px rgba(217,70,239,0.6)`,
              }}
            />
            <div className="header-orb-visualizer" style={{ top: '-4px', left: '-4px', width: '28px', height: '28px' }}>
              <AudioVisualizer />
            </div>
          </div>
        )}
      </div>

      {/* Right: actions + avatar */}
      <div className="header-right" style={{ gap: '8px' }}>
        {currentUser?.photoURL ? (
          <img
            src={currentUser.photoURL}
            alt={displayName}
            title={displayName}
            style={{ width: '32px', height: '32px', borderRadius: '50%', border: '1px solid rgba(255,255,255,0.15)', objectFit: 'cover', cursor: 'pointer' }}
          />
        ) : currentUser ? (
          <div
            title={displayName}
            style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'linear-gradient(135deg, #d946ef, #7e22ce)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: '11px', fontWeight: 700, cursor: 'pointer', border: '1px solid rgba(255,255,255,0.1)' }}
          >
            {avatarInitials}
          </div>
        ) : null}
      </div>
    </header>
  );
}
