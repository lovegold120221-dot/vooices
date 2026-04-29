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

interface HeaderProps {
  currentView?: string;
  onBack?: () => void;
  onNavigate?: (view: string) => void;
  onClearHistory?: () => void;
}

export default function Header({ currentView = 'view-home', onBack, onNavigate, onClearHistory }: HeaderProps) {
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
  const isHome = currentView === 'view-home' || currentView === 'view-voice' || currentView === 'view-splash' || currentView === 'view-auth';

  const pageTitles: Record<string, string> = {
    'view-text': 'Beatrice',
    'view-history': 'History',
    'view-settings': 'Settings',
    'view-profile': 'Profile',
    'view-image': 'Image',
    'view-video': 'Video',
  };
  const pageTitle = pageTitles[currentView] ?? '';

  const iconBtn = (onClick: () => void, icon: string, title: string) => (
    <button onClick={onClick} title={title} style={{
      width: '36px', height: '36px', borderRadius: '50%',
      background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      cursor: 'pointer', color: '#9ca3af', transition: 'all 0.2s',
    }}>
      <i className={icon} style={{ fontSize: '18px' }}></i>
    </button>
  );

  return (
    <header>
      {/* Left */}
      <div className="header-left">
        {isHome ? (
          <button onClick={toggleSidebar} title="Menu" style={{
            width: '36px', height: '36px', borderRadius: '50%',
            background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', color: '#9ca3af',
          }}>
            <i className="ph ph-list" style={{ fontSize: '20px' }}></i>
          </button>
        ) : (
          iconBtn(() => onBack?.(), 'ph ph-caret-left', 'Back')
        )}
      </div>

      {/* Center */}
      <div style={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)', display: 'flex', alignItems: 'center', gap: '8px' }}>
        {isHome ? (
          <>
            <div style={{
              width: '24px', height: '24px', borderRadius: '50%', flexShrink: 0,
              background: 'radial-gradient(circle at 35% 35%, #fdf4ff, #d946ef 40%, #7e22ce)',
              boxShadow: '0 0 12px rgba(217,70,239,0.5)',
            }} />
            <span style={{ fontSize: '16px', fontWeight: 600, color: 'white', letterSpacing: '-0.02em', fontFamily: "'Outfit', sans-serif" }}>Beatrice</span>
            {showHeaderOrb && (
              <div className="header-orb-wrapper" style={{ marginLeft: '2px' }}>
                <div className={c('header-orb', { 'animate-pulse-glow': connected })} style={{
                  width: '18px', height: '18px',
                  transform: `scale(${orbScale.toFixed(3)})`,
                  boxShadow: `inset 0 0 6px rgba(255,255,255,0.4), 0 0 ${10 + orbEnergy * 18}px rgba(217,70,239,0.6)`,
                }} />
                <div className="header-orb-visualizer" style={{ top: '-3px', left: '-3px', width: '24px', height: '24px' }}>
                  <AudioVisualizer />
                </div>
              </div>
            )}
          </>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <span style={{ fontSize: '15px', fontWeight: 500, color: 'white' }}>{pageTitle}</span>
            {currentView === 'view-text' && (
              <span style={{ fontSize: '10px', color: '#4ade80', display: 'flex', alignItems: 'center', gap: '3px' }}>
                <span style={{ width: '5px', height: '5px', background: '#4ade80', borderRadius: '50%' }} />
                Online
              </span>
            )}
          </div>
        )}
      </div>

      {/* Right */}
      <div className="header-right" style={{ gap: '8px' }}>
        {currentView === 'view-text' && onNavigate &&
          iconBtn(() => onNavigate('view-history'), 'ph ph-clock-counter-clockwise', 'History')}
        {currentView === 'view-history' && onClearHistory && (
          <button onClick={onClearHistory} style={{
            fontSize: '11px', color: 'rgba(248,113,113,0.7)', padding: '6px 12px',
            borderRadius: '9999px', cursor: 'pointer',
            background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)',
          }}>Clear</button>
        )}
        {currentView === 'view-settings' && onNavigate &&
          iconBtn(() => onNavigate('view-home'), 'ph ph-house', 'Home')}
        {currentView === 'view-profile' && onNavigate &&
          iconBtn(() => onNavigate('view-home'), 'ph ph-house', 'Home')}
        {isHome && (
          <>
            {onNavigate && iconBtn(() => onNavigate('view-settings'), 'ph ph-gear', 'Settings')}
            {currentUser?.photoURL ? (
              <img src={currentUser.photoURL} alt={displayName} title={displayName}
                onClick={() => onNavigate?.('view-profile')}
                style={{ width: '30px', height: '30px', borderRadius: '50%', border: '1px solid rgba(255,255,255,0.15)', objectFit: 'cover', cursor: 'pointer' }} />
            ) : currentUser ? (
              <div title={displayName} onClick={() => onNavigate?.('view-profile')}
                style={{ width: '30px', height: '30px', borderRadius: '50%', background: 'linear-gradient(135deg, #d946ef, #7e22ce)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: '10px', fontWeight: 700, cursor: 'pointer', border: '1px solid rgba(255,255,255,0.1)' }}>
                {avatarInitials}
              </div>
            ) : null}
          </>
        )}
      </div>
    </header>
  );
}
}
