/**
 * JIT Fallback Processor - ScriptProcessorNode-based real-time processing
 * 
 * This provides JIT frame processing for browsers that don't support AudioWorklet
 * using the older ScriptProcessorNode API. Performance is slightly lower but
 * still much better than file-based processing.
 */

class JITFallbackProcessor {
    constructor() {
        this.audioContext = null;
        this.scriptNode = null;
        this.originalBuffer = null;
        this.processedBuffer = null;
        
        // Playback state
        this.isPlaying = false;
        this.currentSample = 0;
        this.totalSamples = 0;
        this.sampleRate = 44100;
        
        // Processing parameters
        this.blendRatio = 0.5;
        this.masterGain = 0.0;
        this.limiterEnabled = true;
        
        // Simple limiter state
        this.limiterState = {
            previousGain: [1.0, 1.0],
            threshold: 0.9, // -0.1dB linear
            attack: 0.99,   // Fast attack
            release: 0.9999 // Slow release
        };
        
        // Callbacks
        this.onPositionUpdate = null;
        this.onPlaybackEnd = null;
        
        console.log('JIT Fallback Processor initialized');
    }
    
    async initialize() {
        try {
            // Check if Web Audio API is supported
            if (!window.AudioContext && !window.webkitAudioContext) {
                console.error('Web Audio API not supported');
                return false;
            }
            
            // Create audio context
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            
            if (!this.audioContext) {
                console.error('Failed to create AudioContext for fallback');
                return false;
            }
            
            console.log('Fallback AudioContext created, state:', this.audioContext.state);
            
            // Create ScriptProcessorNode (deprecated but widely supported)
            // Buffer size: 4096 samples for good performance
            this.scriptNode = this.audioContext.createScriptProcessor(4096, 0, 2);
            
            if (!this.scriptNode) {
                console.error('Failed to create ScriptProcessorNode');
                return false;
            }
            
            // Set up audio processing
            this.scriptNode.onaudioprocess = this.processAudio.bind(this);
            
            // Connect to output
            this.scriptNode.connect(this.audioContext.destination);
            
            console.log('✓ JIT Fallback processor initialized successfully');
            return true;
            
        } catch (error) {
            console.error('Failed to initialize fallback processor:', error);
            return false;
        }
    }
    
    async loadAudio(originalUrl, processedUrl) {
        try {
            console.log('Loading audio for fallback processing...', originalUrl, processedUrl);
            
            // Load audio files
            const [originalResponse, processedResponse] = await Promise.all([
                fetch(originalUrl),
                fetch(processedUrl)
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
            this.totalSamples = Math.min(originalBuffer.length, processedBuffer.length);
            this.sampleRate = this.audioContext.sampleRate;
            
            console.log(`✓ Fallback audio loaded: ${(this.totalSamples / this.sampleRate).toFixed(2)}s`);
            return true;
            
        } catch (error) {
            console.error('Failed to load audio for fallback processing:', error);
            return false;
        }
    }
    
    processAudio(event) {
        const outputBuffer = event.outputBuffer;
        const frameSize = outputBuffer.length;
        const channels = outputBuffer.numberOfChannels;
        
        if (!this.originalBuffer || !this.processedBuffer || !this.isPlaying) {
            // Output silence
            for (let ch = 0; ch < channels; ch++) {
                const channelData = outputBuffer.getChannelData(ch);
                channelData.fill(0);
            }
            return;
        }
        
        // Check if we've reached the end
        if (this.currentSample >= this.totalSamples) {
            // End of audio
            for (let ch = 0; ch < channels; ch++) {
                const channelData = outputBuffer.getChannelData(ch);
                channelData.fill(0);
            }
            
            if (this.onPlaybackEnd) {
                setTimeout(() => this.onPlaybackEnd(), 0);
            }
            return;
        }
        
        // Process frame
        const samplesNeeded = Math.min(frameSize, this.totalSamples - this.currentSample);
        
        for (let ch = 0; ch < channels && ch < 2; ch++) {
            const outputData = outputBuffer.getChannelData(ch);
            const originalData = this.originalBuffer.getChannelData(ch);
            const processedData = this.processedBuffer.getChannelData(ch);
            
            for (let i = 0; i < samplesNeeded; i++) {
                const sampleIndex = this.currentSample + i;
                
                // Blend original and processed
                const originalSample = sampleIndex < originalData.length ? originalData[sampleIndex] : 0;
                const processedSample = sampleIndex < processedData.length ? processedData[sampleIndex] : 0;
                
                let blendedSample = originalSample * (1.0 - this.blendRatio) + 
                                   processedSample * this.blendRatio;
                
                // Apply master gain
                if (this.masterGain !== 0) {
                    const gainLinear = Math.pow(10, this.masterGain / 20.0);
                    blendedSample *= gainLinear;
                }
                
                // Apply simple limiter
                if (this.limiterEnabled) {
                    blendedSample = this.applySimpleLimiter(blendedSample, ch);
                }
                
                outputData[i] = blendedSample;
            }
            
            // Fill remaining samples with silence
            for (let i = samplesNeeded; i < frameSize; i++) {
                outputData[i] = 0;
            }
        }
        
        this.currentSample += frameSize;
        
        // Send position update
        if (this.onPositionUpdate && this.currentSample % 4410 === 0) { // Every 100ms
            const currentTime = this.currentSample / this.sampleRate;
            const duration = this.totalSamples / this.sampleRate;
            setTimeout(() => this.onPositionUpdate(currentTime, duration), 0);
        }
    }
    
    applySimpleLimiter(sample, channel) {
        const inputAbs = Math.abs(sample);
        let targetGain = 1.0;
        
        if (inputAbs > this.limiterState.threshold) {
            targetGain = this.limiterState.threshold / inputAbs;
        }
        
        // Smooth gain changes
        let prevGain = this.limiterState.previousGain[channel];
        
        if (targetGain < prevGain) {
            // Attack
            prevGain = targetGain + (prevGain - targetGain) * this.limiterState.attack;
        } else {
            // Release
            prevGain = targetGain + (prevGain - targetGain) * this.limiterState.release;
        }
        
        this.limiterState.previousGain[channel] = prevGain;
        return sample * prevGain;
    }
    
    async play() {
        if (!this.scriptNode) {
            console.error('Fallback processor not initialized');
            return false;
        }
        
        // Resume audio context if suspended
        if (this.audioContext.state === 'suspended') {
            console.log('Resuming AudioContext for fallback...');
            try {
                await this.audioContext.resume();
            } catch (error) {
                console.error('Failed to resume AudioContext:', error);
                return false;
            }
        }
        
        this.isPlaying = true;
        console.log('Fallback playback started');
        return true;
    }
    
    pause() {
        this.isPlaying = false;
        console.log('Fallback playback paused');
        return true;
    }
    
    stop() {
        this.isPlaying = false;
        this.currentSample = 0;
        console.log('Fallback playback stopped');
        return true;
    }
    
    seek(time) {
        const sample = Math.floor(time * this.sampleRate);
        this.currentSample = Math.max(0, Math.min(sample, this.totalSamples));
        console.log(`Fallback seek to ${time.toFixed(2)}s`);
        return true;
    }
    
    updateParameters(params) {
        if (params.blendRatio !== undefined) {
            this.blendRatio = params.blendRatio;
        }
        if (params.masterGain !== undefined) {
            this.masterGain = params.masterGain;
        }
        if (params.limiterEnabled !== undefined) {
            this.limiterEnabled = params.limiterEnabled;
        }
        
        // Parameters take effect on next processAudio call (~93ms at 4096 buffer)
    }
    
    getPlaybackState() {
        return {
            isPlaying: this.isPlaying,
            currentTime: this.currentSample / this.sampleRate,
            duration: this.totalSamples / this.sampleRate
        };
    }
    
    isInitialized() {
        return this.audioContext !== null && this.scriptNode !== null;
    }
    
    hasAudioLoaded() {
        return this.originalBuffer !== null && this.processedBuffer !== null;
    }
    
    cleanup() {
        if (this.scriptNode) {
            this.scriptNode.disconnect();
            this.scriptNode = null;
        }
        
        if (this.audioContext && this.audioContext.state !== 'closed') {
            this.audioContext.close();
            this.audioContext = null;
        }
        
        this.originalBuffer = null;
        this.processedBuffer = null;
        this.isPlaying = false;
        this.currentSample = 0;
        
        console.log('Fallback processor cleaned up');
    }
}

// Export for use
window.JITFallbackProcessor = JITFallbackProcessor;