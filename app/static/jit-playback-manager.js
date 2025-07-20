/**
 * JIT Playback Manager - Real-Time Audio Processing During Playback
 * 
 * This class manages just-in-time audio processing using Web Audio API
 * and AudioWorklet. Parameter changes take effect immediately during playback.
 */

class JITPlaybackManager {
    constructor() {
        this.audioContext = null;
        this.workletNode = null;
        this.originalBuffer = null;
        this.processedBuffer = null;
        this.hasStemAudioLoaded = false;
        
        // Playback state
        this.isPlaying = false;
        this.currentTime = 0;
        this.duration = 0;
        
        // Current parameters (read from UI)
        this.currentParams = {
            blendRatio: 0.5,
            masterGain: 0.0,
            limiterEnabled: true
        };
        
        // UI update callback
        this.onPositionUpdate = null;
        this.onPlaybackEnd = null;
        
        // Fallback processor for browsers without AudioWorklet
        this.fallbackProcessor = null;
        this.usingFallback = false;
        
    }
    
    async initializeFallback() {
        try {
            if (!window.JITFallbackProcessor) {
                console.error('Fallback processor not available');
                return false;
            }
            
            this.fallbackProcessor = new window.JITFallbackProcessor();
            const success = await this.fallbackProcessor.initialize();
            
            if (success) {
                this.usingFallback = true;
                
                // Set up callbacks
                this.fallbackProcessor.onPositionUpdate = (currentTime, duration) => {
                    if (this.onPositionUpdate) {
                        this.onPositionUpdate(currentTime, duration);
                    }
                };
                
                this.fallbackProcessor.onPlaybackEnd = () => {
                    if (this.onPlaybackEnd) {
                        this.onPlaybackEnd();
                    }
                };
                
                return true;
            } else {
                console.error('Failed to initialize fallback processor');
                return false;
            }
            
        } catch (error) {
            console.error('Fallback initialization error:', error);
            return false;
        }
    }
    
    async initialize() {
        try {
            // Check if AudioContext is supported
            if (!window.AudioContext && !window.webkitAudioContext) {
                console.error('AudioContext not supported in this browser');
                return false;
            }
            
            // Create audio context
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            
            if (!this.audioContext) {
                console.error('Failed to create AudioContext');
                return false;
            }
            
            // Check if AudioWorklet is supported
            if (!this.audioContext.audioWorklet) {
                return await this.initializeFallback();
            }
            
            
            // Resume context if suspended (requires user interaction)
            if (this.audioContext.state === 'suspended') {
                // Don't fail here - we'll resume when user starts playback
            }
            
            // Load AudioWorklet
            try {
                await this.audioContext.audioWorklet.addModule('/static/jit-audio-processor.js');
            } catch (workletError) {
                console.error('Failed to load AudioWorklet module:', workletError);
                return false;
            }
            
            // Create worklet node
            try {
                this.workletNode = new AudioWorkletNode(this.audioContext, 'jit-audio-processor');
            } catch (nodeError) {
                console.error('Failed to create AudioWorklet node:', nodeError);
                return false;
            }
            
            // Set up message handling
            this.workletNode.port.onmessage = this.handleWorkletMessage.bind(this);
            
            // Connect to output
            this.workletNode.connect(this.audioContext.destination);
            
            return true;
            
        } catch (error) {
            console.error('Failed to initialize JIT audio processing:', error);
            return false;
        }
    }
    
    handleWorkletMessage(event) {
        const { type, sample, time } = event.data;
        
        switch (type) {
            case 'positionUpdate':
                this.currentTime = time;
                if (this.onPositionUpdate) {
                    this.onPositionUpdate(time, this.duration);
                }
                break;
                
            case 'ended':
                this.isPlaying = false;
                if (this.onPlaybackEnd) {
                    this.onPlaybackEnd();
                }
                break;
        }
    }
    
    async loadAudio(originalPath, processedPath) {
        try {
            
            if (this.usingFallback) {
                return await this.fallbackProcessor.loadAudio(originalPath, processedPath);
            }
            
            // Load audio files
            const [originalResponse, processedResponse] = await Promise.all([
                fetch(originalPath),
                fetch(processedPath)
            ]);
            
            const [originalArrayBuffer, processedArrayBuffer] = await Promise.all([
                originalResponse.arrayBuffer(),
                processedResponse.arrayBuffer()
            ]);
            
            // Decode audio data
            const [originalBuffer, processedBuffer] = await Promise.all([
                this.audioContext.decodeAudioData(originalArrayBuffer),
                this.audioContext.decodeAudioData(processedArrayBuffer)
            ]);
            
            this.originalBuffer = originalBuffer;
            this.processedBuffer = processedBuffer;
            this.duration = Math.min(originalBuffer.duration, processedBuffer.duration);
            this.hasStemAudioLoaded = false;
            
            // Send buffers to worklet
            this.workletNode.port.postMessage({
                type: 'loadBuffers',
                data: {
                    original: originalBuffer,
                    processed: processedBuffer,
                    sampleRate: this.audioContext.sampleRate
                }
            });
            
            return true;
            
        } catch (error) {
            console.error('Failed to load audio for JIT processing:', error);
            return false;
        }
    }
    
    async loadStemAudio(vocalOriginalPath, vocalProcessedPath, instrumentalOriginalPath, instrumentalProcessedPath) {
        try {
            
            if (this.usingFallback) {
                return await this.fallbackProcessor.loadStemAudio(vocalOriginalPath, vocalProcessedPath, instrumentalOriginalPath, instrumentalProcessedPath);
            }
            
            // Load all four audio files
            const responses = await Promise.all([
                fetch(vocalOriginalPath),
                fetch(vocalProcessedPath),
                fetch(instrumentalOriginalPath),
                fetch(instrumentalProcessedPath)
            ]);
            
            const arrayBuffers = await Promise.all(responses.map(r => r.arrayBuffer()));
            
            // Decode all audio data
            const [vocalOriginal, vocalProcessed, instrumentalOriginal, instrumentalProcessed] = 
                await Promise.all(arrayBuffers.map(buffer => this.audioContext.decodeAudioData(buffer)));
            
            this.duration = Math.min(
                vocalOriginal.duration, vocalProcessed.duration,
                instrumentalOriginal.duration, instrumentalProcessed.duration
            );
            
            // Send stem buffers to worklet
            this.workletNode.port.postMessage({
                type: 'loadStemBuffers',
                data: {
                    vocalOriginal: vocalOriginal,
                    vocalProcessed: vocalProcessed,
                    instrumentalOriginal: instrumentalOriginal,
                    instrumentalProcessed: instrumentalProcessed,
                    sampleRate: this.audioContext.sampleRate
                }
            });
            
            this.hasStemAudioLoaded = true;
            return true;
            
        } catch (error) {
            console.error('Failed to load stem audio for JIT processing:', error);
            return false;
        }
    }
    
    async play() {
        if (this.usingFallback) {
            return await this.fallbackProcessor.play();
        }
        
        if (!this.workletNode) {
            console.error('JIT audio not initialized');
            return false;
        }
        
        // Resume audio context if suspended (common after page load)
        if (this.audioContext.state === 'suspended') {
            try {
                await this.audioContext.resume();
            } catch (error) {
                console.error('Failed to resume AudioContext:', error);
                return false;
            }
        }
        
        this.isPlaying = true;
        this.workletNode.port.postMessage({ type: 'play' });
        
        return true;
    }
    
    pause() {
        if (this.usingFallback) {
            return this.fallbackProcessor.pause();
        }
        
        if (!this.workletNode) return false;
        
        this.isPlaying = false;
        this.workletNode.port.postMessage({ type: 'pause' });
        
        return true;
    }
    
    stop() {
        if (this.usingFallback) {
            return this.fallbackProcessor.stop();
        }
        
        if (!this.workletNode) return false;
        
        this.isPlaying = false;
        this.currentTime = 0;
        this.workletNode.port.postMessage({ type: 'stop' });
        
        return true;
    }
    
    seek(time) {
        if (this.usingFallback) {
            return this.fallbackProcessor.seek(time);
        }
        
        if (!this.workletNode) return false;
        
        const sample = Math.floor(time * this.audioContext.sampleRate);
        this.currentTime = time;
        this.workletNode.port.postMessage({ 
            type: 'seek', 
            data: { sample } 
        });
        
        return true;
    }
    
    updateParameters(params) {
        if (this.usingFallback) {
            this.fallbackProcessor.updateParameters(params);
            return;
        }
        
        if (!this.workletNode) return;
        
        // Update current parameters
        Object.assign(this.currentParams, params);
        
        // Send to worklet for immediate effect
        this.workletNode.port.postMessage({
            type: 'updateParams',
            data: {
                blendRatio: this.currentParams.blendRatio,
                masterGain: this.currentParams.masterGain,
                limiterEnabled: this.currentParams.limiterEnabled
            }
        });
        
    }
    
    updateStemParameters(params) {
        if (this.usingFallback) {
            this.fallbackProcessor.updateParameters(params);
            return;
        }
        
        if (!this.workletNode) return;
        
        // Send stem parameters to worklet for immediate effect
        this.workletNode.port.postMessage({
            type: 'updateStemParams',
            data: params
        });
        
    }
    
    getCurrentParameters() {
        return { ...this.currentParams };
    }
    
    getPlaybackState() {
        if (this.usingFallback) {
            return this.fallbackProcessor.getPlaybackState();
        }
        
        return {
            isPlaying: this.isPlaying,
            currentTime: this.currentTime,
            duration: this.duration
        };
    }
    
    isInitialized() {
        if (this.usingFallback) {
            return this.fallbackProcessor.isInitialized();
        }
        
        return this.audioContext !== null && this.workletNode !== null;
    }
    
    hasAudioLoaded() {
        if (this.usingFallback) {
            return this.fallbackProcessor.hasAudioLoaded();
        }
        
        // Check for standard mode audio
        const hasStandardAudio = this.originalBuffer !== null && this.processedBuffer !== null;
        
        // Check for stem mode audio
        const hasStemAudio = this.hasStemAudioLoaded;
        
        return hasStandardAudio || hasStemAudio;
    }
    
    cleanup() {
        if (this.workletNode) {
            this.workletNode.disconnect();
            this.workletNode = null;
        }
        
        if (this.audioContext && this.audioContext.state !== 'closed') {
            this.audioContext.close();
            this.audioContext = null;
        }
        
        this.originalBuffer = null;
        this.processedBuffer = null;
        this.hasStemAudioLoaded = false;
        this.isPlaying = false;
        this.currentTime = 0;
        
    }
}

// Global JIT manager instance
window.jitPlaybackManager = new JITPlaybackManager();

// Utility functions for integration
window.jitPlayback = {
    // Initialize JIT processing
    initialize: async () => {
        return await window.jitPlaybackManager.initialize();
    },
    
    // Load audio for JIT processing
    loadAudio: async (originalPath, processedPath) => {
        return await window.jitPlaybackManager.loadAudio(originalPath, processedPath);
    },
    
    // Load stem audio for JIT processing
    loadStemAudio: async (vocalOriginalPath, vocalProcessedPath, instrumentalOriginalPath, instrumentalProcessedPath) => {
        return await window.jitPlaybackManager.loadStemAudio(vocalOriginalPath, vocalProcessedPath, instrumentalOriginalPath, instrumentalProcessedPath);
    },
    
    // Playback controls
    play: () => window.jitPlaybackManager.play(),
    pause: () => window.jitPlaybackManager.pause(),
    stop: () => window.jitPlaybackManager.stop(),
    seek: (time) => window.jitPlaybackManager.seek(time),
    
    // Parameter updates (called when knobs move)
    updateParameters: (params) => window.jitPlaybackManager.updateParameters(params),
    
    // Stem parameter updates
    updateStemParameters: (params) => window.jitPlaybackManager.updateStemParameters(params),
    
    // State queries
    isReady: () => window.jitPlaybackManager.isInitialized() && window.jitPlaybackManager.hasAudioLoaded(),
    getState: () => window.jitPlaybackManager.getPlaybackState(),
    
    // Cleanup
    cleanup: () => window.jitPlaybackManager.cleanup()
};