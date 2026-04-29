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

import cn from 'classnames';

import { memo, ReactNode, useEffect, useRef, useState } from 'react';
import { AudioRecorder } from '../../../lib/audio-recorder';
import { useLogStore, useUI } from '@/lib/state';

import { useLiveAPIContext } from '../../../contexts/LiveAPIContext';

export type ControlTrayProps = {
  children?: ReactNode;
  hidden?: boolean;
};

function ControlTray({ children, hidden = false }: ControlTrayProps) {
  const [audioRecorder] = useState(() => new AudioRecorder());
  const connectButtonRef = useRef<HTMLButtonElement>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const cameraVideoRef = useRef<HTMLVideoElement | null>(null);
  const cameraCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const cameraIntervalRef = useRef<number | null>(null);
  const connectedRef = useRef(false);

  const {
    client,
    connected,
    connect,
    disconnect,
    speakerMuted,
    setSpeakerMuted,
  } = useLiveAPIContext();
  const {
    cameraEnabled,
    setCameraEnabled,
    setCameraPreviewUrl,
    micMuted,
    setMicMuted,
    setMicPermission,
  } = useUI();
  const setMicLevel = useUI.getState().setMicLevel;
  const clientRef = useRef(client);

  connectedRef.current = connected;
  clientRef.current = client;

  useEffect(() => {
    // FIX: Cannot find name 'connectButton'. Did you mean 'connectButtonRef'?
    if (!connected && connectButtonRef.current) {
      // FIX: Cannot find name 'connectButton'. Did you mean 'connectButtonRef'?
      connectButtonRef.current.focus();
    }
  }, [connected]);

  useEffect(() => {
    if (!connected) {
      setMicMuted(false);
      setMicLevel(0);
    }
  }, [connected, setMicLevel, setMicMuted]);

  useEffect(() => {
    if (!cameraEnabled) {
      setCameraPreviewUrl(null);
    }
  }, [cameraEnabled, setCameraPreviewUrl]);

  useEffect(() => {
    const onData = (base64: string) => {
      client.sendRealtimeInput([
        {
          mimeType: 'audio/pcm;rate=16000',
          data: base64,
        },
      ]);
    };

    const onVolume = (volume: number) => {
      setMicLevel(volume);
    };

    let cancelled = false;

    const startAudio = async () => {
      try {
        audioRecorder.on('data', onData);
        audioRecorder.on('volume', onVolume);
        await audioRecorder.start();
        if (!cancelled) {
          setMicPermission('granted');
        }
      } catch (error: any) {
        if (cancelled) return;
        const denied = error?.name === 'NotAllowedError' || error?.name === 'PermissionDeniedError';
        const unsupported = !navigator.mediaDevices?.getUserMedia;
        setMicPermission(
          unsupported ? 'unsupported' : denied ? 'denied' : 'prompt',
          unsupported
            ? 'This browser does not expose microphone capture.'
            : denied
              ? 'Microphone permission was blocked. Allow access in the browser and try again.'
              : 'Microphone could not be started. Please retry.',
        );
        setMicLevel(0);
        disconnect();
      }
    };

    if (connected && !micMuted && audioRecorder) {
      startAudio();
    } else {
      audioRecorder.stop();
      setMicLevel(0);
    }
    return () => {
      cancelled = true;
      audioRecorder.off('data', onData);
      audioRecorder.off('volume', onVolume);
      setMicLevel(0);
    };
  }, [connected, client, micMuted, audioRecorder, setMicLevel, disconnect, setMicPermission]);

  useEffect(() => {
    let disposed = false;

    const stopCamera = () => {
      if (cameraIntervalRef.current) {
        window.clearInterval(cameraIntervalRef.current);
        cameraIntervalRef.current = null;
      }
      if (cameraVideoRef.current) {
        cameraVideoRef.current.pause();
        cameraVideoRef.current.srcObject = null;
        cameraVideoRef.current = null;
      }
      if (cameraStreamRef.current) {
        cameraStreamRef.current.getTracks().forEach(track => track.stop());
        cameraStreamRef.current = null;
      }
      setCameraPreviewUrl(null);
    };

    if (!cameraEnabled) {
      stopCamera();
      return;
    }

    const startCamera = async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error('Camera access is not available in this browser.');
        }

        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: 'user',
            width: { ideal: 640 },
            height: { ideal: 360 },
          },
        });

        if (disposed) {
          stream.getTracks().forEach(track => track.stop());
          return;
        }

        const video = document.createElement('video');
        video.autoplay = true;
        video.muted = true;
        video.playsInline = true;
        video.srcObject = stream;
        await video.play();

        cameraStreamRef.current = stream;
        cameraVideoRef.current = video;
        cameraCanvasRef.current = cameraCanvasRef.current ?? document.createElement('canvas');

        cameraIntervalRef.current = window.setInterval(() => {
          const liveVideo = cameraVideoRef.current;
          const canvas = cameraCanvasRef.current;
          if (!liveVideo || !canvas || liveVideo.readyState < 2) return;

          const width = Math.min(liveVideo.videoWidth || 640, 640);
          const aspectRatio = (liveVideo.videoHeight || 360) / (liveVideo.videoWidth || 640);
          const height = Math.max(180, Math.round(width * aspectRatio));
          const context = canvas.getContext('2d');
          if (!context) return;

          canvas.width = width;
          canvas.height = height;
          context.drawImage(liveVideo, 0, 0, width, height);

          const previewUrl = canvas.toDataURL('image/jpeg', 0.72);
          setCameraPreviewUrl(previewUrl);

          if (connectedRef.current) {
            clientRef.current.sendRealtimeInput([
              {
                mimeType: 'image/jpeg',
                data: previewUrl.split(',')[1],
              },
            ]);
          }
        }, 900);
      } catch (error) {
        console.error('Error starting camera preview:', error);
        setCameraEnabled(false);
      }
    };

    startCamera();

    return () => {
      disposed = true;
      stopCamera();
    };
  }, [cameraEnabled, setCameraEnabled, setCameraPreviewUrl]);

  const handleMicClick = () => {
    if (connected) {
      setMicMuted(!micMuted);
    } else {
      connect();
    }
  };

  const micButtonTitle = connected
    ? micMuted
      ? 'Unmute microphone'
      : 'Mute microphone'
    : 'Connect and start microphone';

  const connectButtonTitle = connected ? 'Stop streaming' : 'Start streaming';
  const speakerButtonTitle = speakerMuted ? 'Unmute speaker output' : 'Mute speaker output';
  const cameraButtonTitle = cameraEnabled ? 'Stop camera' : 'Start camera';

  if (hidden) {
    return null;
  }

  return (
    <section className="control-tray">
      <nav className={cn('actions-nav')}>
        <button
          className={cn('action-button mic-button')}
          onClick={handleMicClick}
          title={micButtonTitle}
        >
          {!micMuted ? (
            <span className="material-symbols-outlined filled">mic</span>
          ) : (
            <span className="material-symbols-outlined filled">mic_off</span>
          )}
        </button>
        <button
          className={cn('action-button')}
          onClick={() => setSpeakerMuted(!speakerMuted)}
          aria-label="Speaker Output"
          title={speakerButtonTitle}
        >
          <span className="material-symbols-outlined">
            {speakerMuted ? 'volume_off' : 'volume_up'}
          </span>
        </button>
        <button
          className={cn('action-button', { active: cameraEnabled })}
          onClick={() => setCameraEnabled(!cameraEnabled)}
          aria-label="Camera"
          title={cameraButtonTitle}
        >
          <span className="material-symbols-outlined">
            {cameraEnabled ? 'videocam' : 'videocam_off'}
          </span>
        </button>
        <button
          className={cn('action-button')}
          onClick={useLogStore.getState().clearTurns}
          aria-label="Reset Chat"
          title="Reset session logs"
        >
          <span className="material-symbols-outlined">refresh</span>
        </button>
        {children}
      </nav>

      <div className={cn('connection-container', { connected })}>
        <button
          ref={connectButtonRef}
          className={cn('action-button connect-toggle', { connected })}
          onClick={connected ? disconnect : connect}
          title={connectButtonTitle}
        >
          <span className="material-symbols-outlined filled">
            {connected ? 'pause' : 'play_arrow'}
          </span>
          <span>{connected ? 'Stop Beatrice' : 'Awaken Beatrice'}</span>
        </button>
      </div>
    </section>
  );
}

export default memo(ControlTray);
