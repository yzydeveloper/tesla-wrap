import { useEffect, useRef, useCallback, useState, useMemo } from 'react';
import { X, Move3D, Info, RotateCcw } from 'lucide-react';
import type { Stage as StageType } from 'konva/lib/Stage';
import { useEditorStore } from '../editor/state/useEditorStore';
import { carModels } from '../data/carModels';

// Debounce helper
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debouncedValue;
}

interface GodotViewerProps {
  isOpen: boolean;
  onClose: () => void;
  stageRef: React.RefObject<StageType | null>;
}

// Public URL for the .pck file in Supabase Storage
const PCK_URL = 'https://mehvzkfcitccchzpqyfd.supabase.co/storage/v1/object/public/godot-assets/index.pck';

export const GodotViewer = ({ isOpen, onClose, stageRef }: GodotViewerProps) => {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const godotReadyRef = useRef(false);
  const receivedRealProgressRef = useRef(false);
  const [loading, setLoading] = useState(true);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [loadingStage, setLoadingStage] = useState<'loading' | 'initializing' | 'ready'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [godotReady, setGodotReady] = useState(false);
  const [, setCarLoaded] = useState(false);
  const [showControls, setShowControls] = useState(false);
  const [iframeEverLoaded, setIframeEverLoaded] = useState(false);
  const [plateRegion, setPlateRegion] = useState<'us' | 'eu'>('us');
  const plateRegionRef = useRef<'us' | 'eu'>('us');
  
  const { currentModelId, layers, baseColor } = useEditorStore();
  const currentModel = carModels.find(m => m.id === currentModelId) || carModels.find(m => m.id === 'modely') || carModels[0];
  
  // Create a change signature to detect canvas updates
  const layersSignature = useMemo(() => {
    return JSON.stringify({
      baseColor,
      layerCount: layers.length,
      layerData: layers.map(l => ({
        id: l.id,
        type: l.type,
        visible: l.visible,
        opacity: l.opacity,
        x: l.x,
        y: l.y,
        rotation: l.rotation,
        scaleX: l.scaleX,
        scaleY: l.scaleY,
        // Type-specific properties for change detection
        ...(l.type === 'text' && { 
          text: (l as any).text, 
          fontSize: (l as any).fontSize, 
          fill: (l as any).fill,
          fontFamily: (l as any).fontFamily,
          fontStyle: (l as any).fontStyle,
        }),
        ...(l.type === 'brush' && { 
          strokeCount: (l as any).strokes?.length,
          // Include last stroke info for detection
          lastStroke: (l as any).strokes?.length > 0 ? (l as any).strokes[(l as any).strokes.length - 1]?.points?.length : 0,
        }),
        ...(l.type === 'image' && { 
          // Use image dimensions as proxy for content change
          width: (l as any).width,
          height: (l as any).height,
          // If src is a data URL, use its length as proxy
          srcLength: typeof (l as any).src === 'string' ? (l as any).src.length : 0,
        }),
        ...(['rect', 'circle', 'line', 'star'].includes(l.type) && {
          fill: (l as any).fill,
          stroke: (l as any).stroke,
          strokeWidth: (l as any).strokeWidth,
          width: (l as any).width,
          height: (l as any).height,
        }),
        ...(l.type === 'fill' && {
          fill: (l as any).color,
        }),
      }))
    });
  }, [layers, baseColor]);
  
  // Debounce the signature to avoid too many updates (200ms for responsive live preview)
  const debouncedSignature = useDebounce(layersSignature, 200);

  // Track last loaded model to prevent duplicate loads
  const lastLoadedModelRef = useRef<string | null>(null);

  // Send message to Godot via postMessage
  const sendToGodot = useCallback((message: object) => {
    if (iframeRef.current?.contentWindow) {
      iframeRef.current.contentWindow.postMessage(message, '*');
    }
  }, []);

  // Send texture to Godot from canvas
  const sendTextureToGodot = useCallback(() => {
    if (!stageRef.current || !godotReady) return;

    try {
      const stage = stageRef.current;
      // Export at exactly 1024x1024 with pixelRatio 1 to match Godot UV2 mapping
      const dataUrl = stage.toDataURL({
        pixelRatio: 1,
        width: 1024,
        height: 1024,
        mimeType: 'image/png',
      });

      sendToGodot({
        type: 'set_texture',
        texture: dataUrl,
      });
      console.log('[GodotViewer] Sent texture to Godot (1024x1024)');
    } catch (err) {
      console.error('[GodotViewer] Failed to send texture:', err);
    }
  }, [stageRef, godotReady, sendToGodot]);

  // Listen for messages from Godot iframe
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      // Only handle messages from our iframe
      if (iframeRef.current && event.source !== iframeRef.current.contentWindow) {
        return;
      }

      const data = event.data;
      if (!data || typeof data !== 'object' || !data.type) return;

      console.log('[GodotViewer] Received message:', data.type, data);

      switch (data.type) {
        case 'godot_ready':
          // Ignore if already ready (prevent duplicate handling)
          if (godotReadyRef.current) return;
          godotReadyRef.current = true;
          
          setLoadingProgress(100);
          setLoadingStage('ready');
          
          // Trigger resize when Godot is ready to fix any distortion
          if (iframeRef.current?.contentWindow) {
            iframeRef.current.contentWindow.postMessage({ type: 'force_resize' }, '*');
            setTimeout(() => {
              iframeRef.current?.contentWindow?.postMessage({ type: 'force_resize' }, '*');
            }, 100);
          }
          
          setTimeout(() => {
            setGodotReady(true);
            setLoading(false);
          }, 200);
          break;

        case 'godot_progress':
          if (data.progress !== undefined && !godotReadyRef.current) {
            // Mark that we're receiving real progress (stops simulated progress)
            receivedRealProgressRef.current = true;
            // Map Godot's 0-1 progress to 10-95%
            const mappedProgress = 10 + Math.round(data.progress * 85);
            setLoadingProgress(mappedProgress);
            if (data.progress >= 0.9) {
              setLoadingStage('initializing');
            }
          }
          break;

        case 'car_loaded':
          setCarLoaded(true);
          setTimeout(() => {
            sendTextureToGodot();
            // Also sync plate region on car load (use ref to avoid stale closure)
            sendToGodot({ type: 'set_plate_region', region: plateRegionRef.current });
          }, 200);
          break;

        case 'godot_error':
          setError(data.message || 'Unknown Godot error');
          setLoading(false);
          break;
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [sendTextureToGodot]);

  // Trigger iframe resize
  const triggerIframeResize = useCallback(() => {
    if (iframeRef.current?.contentWindow) {
      iframeRef.current.contentWindow.postMessage({ type: 'force_resize' }, '*');
    }
  }, []);

  // Handle iframe load
  const handleIframeLoad = useCallback(() => {
    console.log('[GodotViewer] Iframe loaded');
    setIframeEverLoaded(true);
    setLoadingStage('loading');
    setLoadingProgress(10);
    receivedRealProgressRef.current = false;
    
    // Trigger multiple resize events to ensure canvas is correctly sized
    triggerIframeResize();
    setTimeout(triggerIframeResize, 100);
    setTimeout(triggerIframeResize, 300);
    setTimeout(triggerIframeResize, 600);
    setTimeout(triggerIframeResize, 1000);
    
    // Start a fallback progress simulation (only used if Godot doesn't send real progress)
    // This provides a smoother experience as a fallback
    let progress = 10;
    const interval = setInterval(() => {
      // Stop if Godot is ready or we're receiving real progress
      if (godotReadyRef.current || receivedRealProgressRef.current) {
        clearInterval(interval);
        return;
      }
      // Smooth, consistent increments (slowing down as we approach 90%)
      const remaining = 90 - progress;
      const increment = Math.max(0.5, remaining * 0.08);
      progress = Math.min(90, progress + increment);
      
      if (progress >= 89.5) {
        clearInterval(interval);
        setLoadingProgress(90);
        setLoadingStage('initializing');
      } else {
        setLoadingProgress(Math.round(progress));
        if (progress > 50) {
          setLoadingStage('initializing');
        }
      }
    }, 150);

    return () => clearInterval(interval);
  }, [triggerIframeResize]);

  // Track previous signature to detect changes
  const prevSignatureRef = useRef<string | null>(null);
  
  // Auto-sync texture when canvas changes (debounced)
  useEffect(() => {
    if (!godotReady || !isOpen) return;
    
    // Skip initial render
    if (prevSignatureRef.current === null) {
      prevSignatureRef.current = debouncedSignature;
      return;
    }
    
    // Only sync if signature actually changed
    if (prevSignatureRef.current !== debouncedSignature) {
      prevSignatureRef.current = debouncedSignature;
      console.log('[GodotViewer] Canvas changed, syncing texture...');
      // Small delay to ensure canvas is fully rendered
      setTimeout(() => {
        sendTextureToGodot();
      }, 50);
    }
  }, [debouncedSignature, godotReady, isOpen, sendTextureToGodot]);

  // Send model change to Godot when model changes
  useEffect(() => {
    if (!godotReady || !isOpen) return;
    
    // Only send if model actually changed
    if (lastLoadedModelRef.current === currentModel.id) return;
    
    lastLoadedModelRef.current = currentModel.id;
    setCarLoaded(false);
    sendToGodot({
      type: 'load_scene',
      modelId: currentModel.id,
    });
    console.log('[GodotViewer] Loading model:', currentModel.id);
  }, [currentModel.id, godotReady, isOpen, sendToGodot]);

  // When reopening, resend texture and trigger resize
  useEffect(() => {
    if (isOpen && godotReady && iframeEverLoaded) {
      // Trigger resize first, then send texture
      triggerIframeResize();
      
      // Small delay to ensure viewer is visible
      const timer = setTimeout(() => {
        sendTextureToGodot();
        triggerIframeResize();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [isOpen, godotReady, iframeEverLoaded, sendTextureToGodot, triggerIframeResize]);

  // Handle window resize while viewer is open
  useEffect(() => {
    if (!isOpen || !iframeEverLoaded) return;

    let resizeTimeout: ReturnType<typeof setTimeout>;
    const handleResize = () => {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(() => {
        triggerIframeResize();
      }, 150);
    };

    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      clearTimeout(resizeTimeout);
    };
  }, [isOpen, iframeEverLoaded, triggerIframeResize]);

  // Camera controls
  const handleCameraPreset = (preset: string) => {
    sendToGodot({ type: 'set_camera_preset', preset });
  };

  const handleResetCamera = () => {
    sendToGodot({ type: 'reset_camera' });
  };

  // Plate region control
  const handlePlateRegionChange = useCallback((region: 'us' | 'eu') => {
    setPlateRegion(region);
    plateRegionRef.current = region;
    sendToGodot({ type: 'set_plate_region', region });
  }, [sendToGodot]);

  // Keyboard shortcuts
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Build iframe URL with .pck URL as query parameter (public URL)
  const iframeSrc = `/godot/index.html?pck=${encodeURIComponent(PCK_URL)}`;

  // Determine if we should show loading (only on first load)
  const showLoading = loading && !godotReady;
  
  // If engine is ready, reopening is instant
  const isInstantReopen = godotReady && iframeEverLoaded;

  return (
    <>
      {/* Hidden iframe container - always mounted to keep engine alive */}
      <div 
        className={`fixed inset-0 z-[200] ${isOpen ? '' : 'pointer-events-none opacity-0 invisible'}`}
        style={{ 
          visibility: isOpen ? 'visible' : 'hidden',
          transition: 'opacity 0.15s ease-out'
        }}
      >
        <div className={`absolute inset-0 bg-black/90 backdrop-blur-sm ${isOpen ? 'animate-in fade-in duration-200' : ''}`}>
          <div className="w-full h-full flex items-center justify-center">
            <div className="bg-[#1a1a1c] rounded-2xl shadow-2xl w-[95vw] h-[95vh] max-w-[1800px] max-h-[1000px] flex flex-col overflow-hidden border border-white/10">
              {/* Header */}
              <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between bg-black/30">
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-tesla-red to-red-700 flex items-center justify-center">
                      <Move3D className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <h2 className="text-lg font-semibold text-white">3D Preview</h2>
                      <p className="text-xs text-white/50">{currentModel.name}</p>
                    </div>
                  </div>
                </div>
                
                <div className="flex items-center gap-2">
                  {/* Plate region toggle */}
                  {(godotReady || isInstantReopen) && (
                    <div className="flex items-center gap-1 mr-4 bg-white/5 rounded-lg p-0.5">
                      <button
                        onClick={() => handlePlateRegionChange('us')}
                        className={`px-2.5 py-1 text-xs rounded-md transition-all ${
                          plateRegion === 'us'
                            ? 'bg-tesla-red text-white'
                            : 'text-white/60 hover:text-white hover:bg-white/5'
                        }`}
                        title="US License Plate"
                      >
                        🇺🇸 US
                      </button>
                      <button
                        onClick={() => handlePlateRegionChange('eu')}
                        className={`px-2.5 py-1 text-xs rounded-md transition-all ${
                          plateRegion === 'eu'
                            ? 'bg-tesla-red text-white'
                            : 'text-white/60 hover:text-white hover:bg-white/5'
                        }`}
                        title="EU License Plate"
                      >
                        🇪🇺 EU
                      </button>
                    </div>
                  )}

                  {/* Camera presets */}
                  {(godotReady || isInstantReopen) && (
                    <div className="flex items-center gap-1 mr-2">
                      <button
                        onClick={() => handleCameraPreset('rear')}
                        className="px-3 py-1.5 text-xs bg-white/5 hover:bg-white/10 text-white/70 hover:text-white rounded-lg transition-all"
                      >
                        Front
                      </button>
                      <button
                        onClick={() => handleCameraPreset('front')}
                        className="px-3 py-1.5 text-xs bg-white/5 hover:bg-white/10 text-white/70 hover:text-white rounded-lg transition-all"
                      >
                        Rear
                      </button>
                      <button
                        onClick={() => handleCameraPreset('left')}
                        className="px-3 py-1.5 text-xs bg-white/5 hover:bg-white/10 text-white/70 hover:text-white rounded-lg transition-all"
                      >
                        Side
                      </button>
                      <button
                        onClick={handleResetCamera}
                        className="p-1.5 bg-white/5 hover:bg-white/10 text-white/70 hover:text-white rounded-lg transition-all"
                        title="Reset camera"
                      >
                        <RotateCcw className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                  
                  {/* Controls hint toggle */}
                  <button
                    onClick={() => setShowControls(!showControls)}
                    className={`p-2.5 rounded-xl transition-all ${showControls ? 'bg-white/10 text-white' : 'bg-transparent text-white/50 hover:text-white hover:bg-white/5'}`}
                    title="Toggle controls help"
                  >
                    <Info className="w-5 h-5" />
                  </button>
                  
                  {/* Close button */}
                  <button
                    onClick={onClose}
                    className="p-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-white/70 hover:text-white transition-all"
                    title="Close (Esc)"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Main viewport */}
              <div className="flex-1 relative bg-black">
                {/* Godot iframe - always mounted */}
                <iframe
                  ref={iframeRef}
                  src={iframeSrc}
                  className="absolute inset-0 w-full h-full border-0"
                  title="Godot 3D Viewer"
                  allow="autoplay; fullscreen"
                  onLoad={handleIframeLoad}
                />
                
                {/* Loading overlay - only on first load */}
                {showLoading && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#1a1a1c] z-10">
                    {/* Progress circle */}
                    <div className="relative w-28 h-28 mb-6">
                      <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                        {/* Background circle */}
                        <circle
                          cx="50"
                          cy="50"
                          r="42"
                          fill="none"
                          stroke="rgba(255,255,255,0.1)"
                          strokeWidth="6"
                        />
                        {/* Progress circle */}
                        <circle
                          cx="50"
                          cy="50"
                          r="42"
                          fill="none"
                          stroke="url(#progressGradient)"
                          strokeWidth="6"
                          strokeLinecap="round"
                          strokeDasharray={`${loadingProgress * 2.64} 264`}
                          style={{ transition: 'stroke-dasharray 0.4s cubic-bezier(0.4, 0, 0.2, 1)' }}
                        />
                        <defs>
                          <linearGradient id="progressGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                            <stop offset="0%" stopColor="#e82127" />
                            <stop offset="100%" stopColor="#ff4444" />
                          </linearGradient>
                        </defs>
                      </svg>
                      <div className="absolute inset-0 flex items-center justify-center">
                        <span className="text-white text-xl font-semibold">{loadingProgress}%</span>
                      </div>
                    </div>
                    
                    <p className="text-white/80 text-sm font-medium">
                      {loadingStage === 'loading' && 'Loading 3D engine...'}
                      {loadingStage === 'initializing' && 'Starting engine...'}
                      {loadingStage === 'ready' && 'Ready!'}
                    </p>
                    <p className="text-white/40 text-xs mt-2">
                      {loadingStage === 'loading' ? 'This may take a moment' :
                       loadingStage === 'initializing' ? 'Almost ready...' : ''}
                    </p>
                  </div>
                )}
                
                {/* Error overlay */}
                {error && (
                  <div className="absolute inset-0 flex items-center justify-center bg-[#1a1a1c] z-10">
                    <div className="text-center max-w-md">
                      <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-500/20 flex items-center justify-center">
                        <X className="w-8 h-8 text-red-500" />
                      </div>
                      <p className="text-red-400 text-lg font-medium">{error}</p>
                      <p className="text-white/40 text-sm mt-2">
                        Please try again later
                      </p>
                      <button
                        onClick={onClose}
                        className="mt-4 px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-all"
                      >
                        Close
                      </button>
                    </div>
                  </div>
                )}

                {/* Controls help panel */}
                {showControls && !showLoading && !error && (godotReady || isInstantReopen) && (
                  <div className="absolute top-4 left-4 bg-black/70 backdrop-blur-md rounded-xl p-4 border border-white/10 text-sm space-y-2 animate-in slide-in-from-left duration-300">
                    <p className="text-white/80 font-medium mb-2">Controls</p>
                    <div className="flex items-center gap-3 text-white/60">
                      <span className="bg-white/10 px-2 py-0.5 rounded text-xs">Drag</span>
                      <span>Rotate view</span>
                    </div>
                    <div className="flex items-center gap-3 text-white/60">
                      <span className="bg-white/10 px-2 py-0.5 rounded text-xs">Scroll</span>
                      <span>Zoom in/out</span>
                    </div>
                    <div className="pt-2 border-t border-white/10 text-white/50 text-xs">
                      <span className="bg-white/10 px-1.5 py-0.5 rounded">Esc</span> close
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};
