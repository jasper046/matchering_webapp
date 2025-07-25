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
        
        // Stem mode buffers
        this.vocalOriginalBuffer = null;
        this.vocalProcessedBuffer = null;
        this.instrumentalOriginalBuffer = null;
        this.instrumentalProcessedBuffer = null;
        this.isStemMode = false;
        
        // Playback state
        this.isPlaying = false;
        this.currentSample = 0;
        this.totalSamples = 0;
        this.sampleRate = 44100;
        
        // Processing parameters
        this.blendRatio = 0.5;
        this.masterGain = 0.0;
        this.limiterEnabled = true;
        
        // Stem mode parameters
        this.vocalBlendRatio = 0.5;
        this.vocalGain = 0.0;
        this.vocalMuted = false;
        this.instrumentalBlendRatio = 0.5;
        this.instrumentalGain = 0.0;
        this.instrumentalMuted = false;
        
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
            
            return true;
            
        } catch (error) {
            console.error('Failed to initialize fallback processor:', error);
            return false;
        }
    }
    
    async loadAudio(originalUrl, processedUrl) {
        try {
            
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
            
            return true;
            
        } catch (error) {
            console.error('Failed to load audio for fallback processing:', error);
            return false;
        }
    }
    
    async loadStemAudio(vocalOriginalUrl, vocalProcessedUrl, instrumentalOriginalUrl, instrumentalProcessedUrl) {
        try {
            
            // Load all four audio files
            const responses = await Promise.all([
                fetch(vocalOriginalUrl),
                fetch(vocalProcessedUrl),
                fetch(instrumentalOriginalUrl),
                fetch(instrumentalProcessedUrl)
            ]);
            
            const arrayBuffers = await Promise.all(responses.map(r => r.arrayBuffer()));
            
            // Decode all audio data
            const [vocalOriginal, vocalProcessed, instrumentalOriginal, instrumentalProcessed] = 
                await Promise.all(arrayBuffers.map(buffer => this.audioContext.decodeAudioData(buffer)));
            
            this.vocalOriginalBuffer = vocalOriginal;
            this.vocalProcessedBuffer = vocalProcessed;
            this.instrumentalOriginalBuffer = instrumentalOriginal;
            this.instrumentalProcessedBuffer = instrumentalProcessed;
            
            this.totalSamples = Math.min(
                vocalOriginal.length, vocalProcessed.length,
                instrumentalOriginal.length, instrumentalProcessed.length
            );
            this.sampleRate = this.audioContext.sampleRate;
            this.isStemMode = true;
            
            return true;
            
        } catch (error) {
            console.error('Failed to load stem audio for fallback processing:', error);
            return false;
        }
    }
    
    processAudio(event) {
        const outputBuffer = event.outputBuffer;
        const frameSize = outputBuffer.length;
        const channels = outputBuffer.numberOfChannels;
        
        // Check if we have audio to process
        const hasStandardAudio = this.originalBuffer && this.processedBuffer;
        const hasStemAudio = this.vocalOriginalBuffer && this.vocalProcessedBuffer && 
                           this.instrumentalOriginalBuffer && this.instrumentalProcessedBuffer;
        
        
        if ((!hasStandardAudio && !hasStemAudio) || !this.isPlaying) {
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
        
        if (this.isStemMode) {
            // Stem mode processing
            this.processStemFrame(outputBuffer, samplesNeeded, channels);
        } else {
            // Standard mode processing
            this.processStandardFrame(outputBuffer, samplesNeeded, channels);
        }
        
        this.currentSample += frameSize;
        
        // Send position update every ~100ms (more flexible check)
        if (this.onPositionUpdate && Math.floor(this.currentSample / 4410) > Math.floor((this.currentSample - frameSize) / 4410)) {
            const currentTime = this.currentSample / this.sampleRate;
            const duration = this.totalSamples / this.sampleRate;
            setTimeout(() => this.onPositionUpdate(currentTime, duration), 0);
        }
    }
    
    processStandardFrame(outputBuffer, samplesNeeded, channels) {
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
            for (let i = samplesNeeded; i < outputBuffer.length; i++) {
                outputData[i] = 0;
            }
        }
    }
    
    processStemFrame(outputBuffer, samplesNeeded, channels) {
        for (let ch = 0; ch < channels && ch < 2; ch++) {
            const outputData = outputBuffer.getChannelData(ch);
            
            // Get stem data
            const vocalOrigData = this.vocalOriginalBuffer.getChannelData(ch);
            const vocalProcData = this.vocalProcessedBuffer.getChannelData(ch);
            const instOrigData = this.instrumentalOriginalBuffer.getChannelData(ch);
            const instProcData = this.instrumentalProcessedBuffer.getChannelData(ch);
            
            for (let i = 0; i < samplesNeeded; i++) {
                const sampleIndex = this.currentSample + i;
                
                // Get stem samples
                const vocalOrig = sampleIndex < vocalOrigData.length ? vocalOrigData[sampleIndex] : 0;
                const vocalProc = sampleIndex < vocalProcData.length ? vocalProcData[sampleIndex] : 0;
                const instOrig = sampleIndex < instOrigData.length ? instOrigData[sampleIndex] : 0;
                const instProc = sampleIndex < instProcData.length ? instProcData[sampleIndex] : 0;
                
                // Blend each stem
                let vocalBlended = vocalOrig * (1.0 - this.vocalBlendRatio) + vocalProc * this.vocalBlendRatio;
                let instBlended = instOrig * (1.0 - this.instrumentalBlendRatio) + instProc * this.instrumentalBlendRatio;
                
                // Apply individual stem gains and muting
                if (this.vocalMuted) {
                    vocalBlended = 0;
                } else if (this.vocalGain !== 0.0) {
                    const vocalGainLinear = Math.pow(10, this.vocalGain / 20.0);
                    vocalBlended *= vocalGainLinear;
                }
                
                if (this.instrumentalMuted) {
                    instBlended = 0;
                } else if (this.instrumentalGain !== 0.0) {
                    const instGainLinear = Math.pow(10, this.instrumentalGain / 20.0);
                    instBlended *= instGainLinear;
                }
                
                // Sum stems
                let finalSample = vocalBlended + instBlended;
                
                // Apply master gain
                if (this.masterGain !== 0) {
                    const masterGainLinear = Math.pow(10, this.masterGain / 20.0);
                    finalSample *= masterGainLinear;
                }
                
                // Apply simple limiter
                if (this.limiterEnabled) {
                    finalSample = this.applySimpleLimiter(finalSample, ch);
                }
                
                outputData[i] = finalSample;
            }
            
            // Fill remaining samples with silence
            for (let i = samplesNeeded; i < outputBuffer.length; i++) {
                outputData[i] = 0;
            }
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
            try {
                await this.audioContext.resume();
            } catch (error) {
                console.error('Failed to resume AudioContext:', error);
                return false;
            }
        }
        
        this.isPlaying = true;
        return true;
    }
    
    pause() {
        this.isPlaying = false;
        return true;
    }
    
    stop() {
        this.isPlaying = false;
        this.currentSample = 0;
        return true;
    }
    
    seek(time) {
        const sample = Math.floor(time * this.sampleRate);
        this.currentSample = Math.max(0, Math.min(sample, this.totalSamples));
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
        
        // Stem mode parameters
        if (params.vocalBlendRatio !== undefined) {
            this.vocalBlendRatio = params.vocalBlendRatio;
        }
        if (params.vocalGain !== undefined) {
            this.vocalGain = params.vocalGain;
        }
        if (params.vocalMuted !== undefined) {
            this.vocalMuted = params.vocalMuted;
        }
        if (params.instrumentalBlendRatio !== undefined) {
            this.instrumentalBlendRatio = params.instrumentalBlendRatio;
        }
        if (params.instrumentalGain !== undefined) {
            this.instrumentalGain = params.instrumentalGain;
        }
        if (params.instrumentalMuted !== undefined) {
            this.instrumentalMuted = params.instrumentalMuted;
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
        const hasStandardAudio = this.originalBuffer !== null && this.processedBuffer !== null;
        const hasStemAudio = this.vocalOriginalBuffer !== null && this.vocalProcessedBuffer !== null && 
                           this.instrumentalOriginalBuffer !== null && this.instrumentalProcessedBuffer !== null;
        return hasStandardAudio || hasStemAudio;
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
        
    }
}

// Export for use
window.JITFallbackProcessor = JITFallbackProcessor;