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
        
        console.log('JIT Playback Manager initialized');
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
                console.error('AudioWorklet not supported in this browser');
                return false;
            }
            
            console.log('AudioContext created, state:', this.audioContext.state);
            
            // Resume context if suspended (requires user interaction)
            if (this.audioContext.state === 'suspended') {
                console.log('AudioContext suspended, will resume on user interaction');
                // Don't fail here - we'll resume when user starts playback
            }
            
            // Load AudioWorklet
            console.log('Loading AudioWorklet module...');
            try {
                await this.audioContext.audioWorklet.addModule('/static/jit-audio-processor.js');
                console.log('✓ AudioWorklet module loaded');
            } catch (workletError) {
                console.error('Failed to load AudioWorklet module:', workletError);
                return false;
            }
            
            // Create worklet node
            try {
                this.workletNode = new AudioWorkletNode(this.audioContext, 'jit-audio-processor');
                console.log('✓ AudioWorklet node created');
            } catch (nodeError) {
                console.error('Failed to create AudioWorklet node:', nodeError);
                return false;
            }
            
            // Set up message handling
            this.workletNode.port.onmessage = this.handleWorkletMessage.bind(this);
            
            // Connect to output
            this.workletNode.connect(this.audioContext.destination);
            
            console.log('JIT audio processing initialized');
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
            console.log('Loading audio for JIT processing...', originalPath, processedPath);
            
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
            
            // Send buffers to worklet
            this.workletNode.port.postMessage({
                type: 'loadBuffers',
                data: {
                    original: originalBuffer,
                    processed: processedBuffer,
                    sampleRate: this.audioContext.sampleRate
                }
            });
            
            console.log(`JIT audio loaded: ${this.duration.toFixed(2)}s`);
            return true;
            
        } catch (error) {
            console.error('Failed to load audio for JIT processing:', error);
            return false;
        }
    }
    
    async play() {
        if (!this.workletNode) {
            console.error('JIT audio not initialized');
            return false;
        }
        
        // Resume audio context if suspended (common after page load)
        if (this.audioContext.state === 'suspended') {
            console.log('Resuming AudioContext...');
            try {
                await this.audioContext.resume();
                console.log('AudioContext resumed, state:', this.audioContext.state);
            } catch (error) {
                console.error('Failed to resume AudioContext:', error);
                return false;
            }
        }
        
        this.isPlaying = true;
        this.workletNode.port.postMessage({ type: 'play' });
        
        console.log('JIT playback started');
        return true;
    }
    
    pause() {
        if (!this.workletNode) return false;
        
        this.isPlaying = false;
        this.workletNode.port.postMessage({ type: 'pause' });
        
        console.log('JIT playback paused');
        return true;
    }
    
    stop() {
        if (!this.workletNode) return false;
        
        this.isPlaying = false;
        this.currentTime = 0;
        this.workletNode.port.postMessage({ type: 'stop' });
        
        console.log('JIT playback stopped');
        return true;
    }
    
    seek(time) {
        if (!this.workletNode) return false;
        
        const sample = Math.floor(time * this.audioContext.sampleRate);
        this.currentTime = time;
        this.workletNode.port.postMessage({ 
            type: 'seek', 
            data: { sample } 
        });
        
        console.log(`JIT seek to ${time.toFixed(2)}s`);
        return true;
    }
    
    updateParameters(params) {
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
        
        // console.log('JIT parameters updated:', this.currentParams);
    }
    
    getCurrentParameters() {
        return { ...this.currentParams };
    }
    
    getPlaybackState() {
        return {
            isPlaying: this.isPlaying,
            currentTime: this.currentTime,
            duration: this.duration
        };
    }
    
    isInitialized() {
        return this.audioContext !== null && this.workletNode !== null;
    }
    
    hasAudioLoaded() {
        return this.originalBuffer !== null && this.processedBuffer !== null;
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
        this.isPlaying = false;
        this.currentTime = 0;
        
        console.log('JIT Playback Manager cleaned up');
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
    
    // Playback controls
    play: () => window.jitPlaybackManager.play(),
    pause: () => window.jitPlaybackManager.pause(),
    stop: () => window.jitPlaybackManager.stop(),
    seek: (time) => window.jitPlaybackManager.seek(time),
    
    // Parameter updates (called when knobs move)
    updateParameters: (params) => window.jitPlaybackManager.updateParameters(params),
    
    // State queries
    isReady: () => window.jitPlaybackManager.isInitialized() && window.jitPlaybackManager.hasAudioLoaded(),
    getState: () => window.jitPlaybackManager.getPlaybackState(),
    
    // Cleanup
    cleanup: () => window.jitPlaybackManager.cleanup()
};