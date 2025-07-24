/**
 * JIT Audio Processor - AudioWorklet for Real-Time Frame Processing
 * 
 * This AudioWorklet runs in the audio thread and processes audio frames
 * just-in-time during playback. Parameter changes take effect immediately
 * on the next audio frame (~3ms latency at 44.1kHz).
 */

class JITAudioProcessor extends AudioWorkletProcessor {
    constructor() {
        super();
        
        // Audio buffers
        this.originalBuffer = null;
        this.processedBuffer = null;
        this.sampleRate = 44100;
        
        // Stem mode buffers
        this.vocalOriginalBuffer = null;
        this.vocalProcessedBuffer = null;
        this.instrumentalOriginalBuffer = null;
        this.instrumentalProcessedBuffer = null;
        this.isStemMode = false;
        
        // Playback state
        this.currentSample = 0;
        this.isPlaying = false;
        this.totalSamples = 0;
        
        // Processing parameters (updated from UI)
        this.blendRatio = 0.5;           // 0.0 = original, 1.0 = processed
        this.masterGain = 0.0;           // dB
        this.limiterEnabled = true;
        this.isPlaying = false;
        
        // Stem mode parameters
        this.vocalBlendRatio = 0.5;
        this.vocalGain = 0.0;
        this.vocalMuted = false;
        this.instrumentalBlendRatio = 0.5;
        this.instrumentalGain = 0.0;
        this.instrumentalMuted = false;
        
        // Frame-aware limiter state
        this.limiterState = this.initializeLimiterState();
        
        // Message handling
        this.port.onmessage = this.handleMessage.bind(this);
        
    }
    
    initializeLimiterState() {
        // Initialize frame-aware limiter state
        return {
            // Limiter configuration
            attack_ms: 1.0,
            hold_ms: 1.0,
            release_ms: 3000.0,
            threshold_db: -0.1,
            
            // State variables
            previousGain: [1.0, 1.0],        // Per channel
            peakBuffer: [[], []],            // Sliding window for peak detection
            peakBufferSize: 44,              // ~1ms at 44.1kHz
            filterState: {
                attack: [0.0, 0.0],
                hold: [[0.0], [0.0]],         // Filter memory
                release: [[0.0], [0.0]]
            }
        };
    }
    
    handleMessage(event) {
        const { type, data } = event.data;
        
        switch (type) {
            case 'loadBuffers':
                console.log('AudioWorklet: Received loadBuffers message. Data:', data);
                this.originalBuffer = this.createAudioBuffer(data.originalChannelData, data.originalNumberOfChannels, data.originalLength, data.sampleRate);
                this.processedBuffer = this.createAudioBuffer(data.processedChannelData, data.processedNumberOfChannels, data.processedLength, data.sampleRate);
                console.log('AudioWorklet: originalBuffer.length:', this.originalBuffer.length, 'processedBuffer.length:', this.processedBuffer.length);
                this.totalSamples = Math.min(
                    this.originalBuffer.length, 
                    this.processedBuffer.length
                );
                this.sampleRate = data.sampleRate || 44100;
                this.isStemMode = false;
                break;
                
            case 'loadStemBuffers':
                this.vocalOriginalBuffer = this.createAudioBuffer(data.vocalOriginalChannelData, data.vocalOriginalNumberOfChannels, data.vocalOriginalLength, data.sampleRate);
                this.vocalProcessedBuffer = this.createAudioBuffer(data.vocalProcessedChannelData, data.vocalProcessedNumberOfChannels, data.vocalProcessedLength, data.sampleRate);
                this.instrumentalOriginalBuffer = this.createAudioBuffer(data.instrumentalOriginalChannelData, data.instrumentalOriginalNumberOfChannels, data.instrumentalOriginalLength, data.sampleRate);
                this.instrumentalProcessedBuffer = this.createAudioBuffer(data.instrumentalProcessedChannelData, data.instrumentalProcessedNumberOfChannels, data.instrumentalProcessedLength, data.sampleRate);
                this.totalSamples = Math.min(
                    this.vocalOriginalBuffer.length, 
                    this.vocalProcessedBuffer.length,
                    this.instrumentalOriginalBuffer.length,
                    this.instrumentalProcessedBuffer.length
                );
                this.sampleRate = data.sampleRate || 44100;
                this.isStemMode = true;
                break;
                
            case 'updateParams':
                this.blendRatio = data.blendRatio;
                this.masterGain = data.masterGain;
                this.limiterEnabled = data.limiterEnabled;
                // Parameters take effect on next process() call
                break;
                
            case 'updateStemParams':
                if (data.vocalBlendRatio !== undefined) this.vocalBlendRatio = data.vocalBlendRatio;
                if (data.vocalGain !== undefined) this.vocalGain = data.vocalGain;
                if (data.vocalMuted !== undefined) this.vocalMuted = data.vocalMuted;
                if (data.instrumentalBlendRatio !== undefined) this.instrumentalBlendRatio = data.instrumentalBlendRatio;
                if (data.instrumentalGain !== undefined) this.instrumentalGain = data.instrumentalGain;
                if (data.instrumentalMuted !== undefined) this.instrumentalMuted = data.instrumentalMuted;
                if (data.masterGain !== undefined) this.masterGain = data.masterGain;
                if (data.limiterEnabled !== undefined) this.limiterEnabled = data.limiterEnabled;
                // Parameters take effect on next process() call
                break;
                
            case 'play':
                this.isPlaying = true;
                break;
                
            case 'pause':
                this.isPlaying = false;
                break;
                
            case 'seek':
                this.currentSample = Math.max(0, Math.min(data.sample, this.totalSamples));
                break;
                
            case 'stop':
                this.isPlaying = false;
                this.currentSample = 0;
                break;
        }
    }

    createAudioBuffer(channelData, numberOfChannels, length, sampleRate) {
        // This is a simplified representation of an AudioBuffer for the Worklet
        // It provides the necessary properties and a getChannelData method.
        return {
            numberOfChannels: numberOfChannels,
            length: length,
            sampleRate: sampleRate,
            getChannelData: (channel) => channelData[channel]
        };
    }
    
    process(inputs, outputs, parameters) {
        const output = outputs[0];
        const frameSize = output[0].length; // Usually 128 samples
        
        // Check if we have audio to process
        const hasStandardAudio = this.originalBuffer && this.processedBuffer;
        const hasStemAudio = this.vocalOriginalBuffer && this.vocalProcessedBuffer && 
                           this.instrumentalOriginalBuffer && this.instrumentalProcessedBuffer;
        
        if ((!hasStandardAudio && !hasStemAudio) || !this.isPlaying) {
            // Output silence
            for (let channel = 0; channel < output.length; channel++) {
                output[channel].fill(0);
            }
            return true;
        }
        
        // Check if we've reached the end
        if (this.currentSample >= this.totalSamples) {
            // End of audio - output silence and notify main thread
            for (let channel = 0; channel < output.length; channel++) {
                output[channel].fill(0);
            }
            this.port.postMessage({ type: 'ended' });
            return true;
        }
        
        // Process frame
        try {
            this.processAudioFrame(output, frameSize);
            this.currentSample += frameSize;
            
            // Send position update to main thread
            if (this.currentSample % 4410 === 0) { // Every 100ms
                this.port.postMessage({ 
                    type: 'positionUpdate',
                    sample: this.currentSample,
                    time: this.currentSample / this.sampleRate
                });
            }
            
        } catch (error) {
            console.error('JIT processing error:', error);
            // Output silence on error
            for (let channel = 0; channel < output.length; channel++) {
                output[channel].fill(0);
            }
        }
        
        return true;
    }
    
    processAudioFrame(output, frameSize) {
        const channelsOut = output.length;
        const samplesNeeded = Math.min(frameSize, this.totalSamples - this.currentSample);
        
        let finalFrame;
        
        if (this.isStemMode) {
            // Stem mode processing
            finalFrame = this.processStemFrame(samplesNeeded);
        } else {
            // Standard mode processing
            const originalFrame = this.extractFrame(this.originalBuffer, samplesNeeded);
            const processedFrame = this.extractFrame(this.processedBuffer, samplesNeeded);
            const blendedFrame = this.blendFrames(originalFrame, processedFrame);
            finalFrame = blendedFrame;
        }
        
        // Apply master gain
        const gainedFrame = this.applyMasterGain(finalFrame);
        
        // Apply limiter if enabled
        const limitedFrame = this.limiterEnabled ? 
            this.applyFrameLimiter(gainedFrame) : gainedFrame;
        
        // Output to speakers
        for (let channel = 0; channel < channelsOut && channel < limitedFrame.length; channel++) {
            for (let i = 0; i < samplesNeeded; i++) {
                output[channel][i] = limitedFrame[channel][i];
            }
            // Fill remaining samples with silence if needed
            for (let i = samplesNeeded; i < frameSize; i++) {
                output[channel][i] = 0;
            }
        }
    }
    
    processStemFrame(frameSize) {
        // Extract vocal frames
        const vocalOriginalFrame = this.extractFrame(this.vocalOriginalBuffer, frameSize);
        const vocalProcessedFrame = this.extractFrame(this.vocalProcessedBuffer, frameSize);
        
        // Extract instrumental frames  
        const instrumentalOriginalFrame = this.extractFrame(this.instrumentalOriginalBuffer, frameSize);
        const instrumentalProcessedFrame = this.extractFrame(this.instrumentalProcessedBuffer, frameSize);
        
        // Blend vocal stems
        const vocalBlendedFrame = this.blendFrames(vocalOriginalFrame, vocalProcessedFrame, this.vocalBlendRatio);
        
        // Blend instrumental stems
        const instrumentalBlendedFrame = this.blendFrames(instrumentalOriginalFrame, instrumentalProcessedFrame, this.instrumentalBlendRatio);
        
        // Apply individual stem gains and muting
        const vocalGainedFrame = this.vocalMuted ? 
            this.createSilentFrame(frameSize, vocalBlendedFrame.length) :
            this.applyStemGain(vocalBlendedFrame, this.vocalGain);
            
        const instrumentalGainedFrame = this.instrumentalMuted ? 
            this.createSilentFrame(frameSize, instrumentalBlendedFrame.length) :
            this.applyStemGain(instrumentalBlendedFrame, this.instrumentalGain);
        
        // Sum vocal and instrumental stems
        return this.sumFrames(vocalGainedFrame, instrumentalGainedFrame);
    }
    
    createSilentFrame(frameSize, channelCount) {
        const frame = [];
        for (let ch = 0; ch < channelCount; ch++) {
            frame.push(new Float32Array(frameSize));
        }
        return frame;
    }
    
    sumFrames(frame1, frame2) {
        const channels = Math.max(frame1.length, frame2.length);
        const frameSize = Math.max(frame1[0] ? frame1[0].length : 0, frame2[0] ? frame2[0].length : 0);
        const summedFrame = [];
        
        for (let ch = 0; ch < channels; ch++) {
            const summedChannel = new Float32Array(frameSize);
            const ch1 = frame1[ch] || new Float32Array(frameSize);
            const ch2 = frame2[ch] || new Float32Array(frameSize);
            
            for (let i = 0; i < frameSize; i++) {
                summedChannel[i] = ch1[i] + ch2[i];
            }
            
            summedFrame.push(summedChannel);
        }
        
        return summedFrame;
    }
    
    applyStemGain(frame, gainDb) {
        if (gainDb === 0.0) return frame;
        
        const gainLinear = Math.pow(10, gainDb / 20.0);
        const gainedFrame = [];
        
        for (let ch = 0; ch < frame.length; ch++) {
            const gainedChannel = new Float32Array(frame[ch].length);
            
            for (let i = 0; i < frame[ch].length; i++) {
                gainedChannel[i] = frame[ch][i] * gainLinear;
            }
            
            gainedFrame.push(gainedChannel);
        }
        
        return gainedFrame;
    }
    
    extractFrame(buffer, frameSize) {
        const channels = buffer.numberOfChannels;
        const frame = [];
        
        for (let ch = 0; ch < channels; ch++) {
            const channelData = buffer.getChannelData(ch);
            const channelFrame = new Float32Array(frameSize);
            
            for (let i = 0; i < frameSize; i++) {
                const sampleIndex = this.currentSample + i;
                channelFrame[i] = sampleIndex < channelData.length ? 
                    channelData[sampleIndex] : 0;
            }
            
            frame.push(channelFrame);
        }
        
        return frame;
    }
    
    blendFrames(originalFrame, processedFrame, blendRatio = this.blendRatio) {
        const channels = Math.min(originalFrame.length, processedFrame.length);
        const frameSize = originalFrame[0].length;
        const blendedFrame = [];
        
        for (let ch = 0; ch < channels; ch++) {
            const blendedChannel = new Float32Array(frameSize);
            
            for (let i = 0; i < frameSize; i++) {
                blendedChannel[i] = 
                    originalFrame[ch][i] * (1.0 - blendRatio) +
                    processedFrame[ch][i] * blendRatio;
            }
            
            blendedFrame.push(blendedChannel);
        }
        
        return blendedFrame;
    }
    
    applyMasterGain(frame) {
        if (this.masterGain === 0.0) return frame;
        
        const gainLinear = Math.pow(10, this.masterGain / 20.0);
        const gainedFrame = [];
        
        for (let ch = 0; ch < frame.length; ch++) {
            const gainedChannel = new Float32Array(frame[ch].length);
            
            for (let i = 0; i < frame[ch].length; i++) {
                gainedChannel[i] = frame[ch][i] * gainLinear;
            }
            
            gainedFrame.push(gainedChannel);
        }
        
        return gainedFrame;
    }
    
    applyFrameLimiter(frame) {
        // Simplified frame-aware limiter implementation
        // This maintains state across frames for seamless limiting
        
        const channels = frame.length;
        const frameSize = frame[0].length;
        const limitedFrame = [];
        
        const threshold = Math.pow(10, this.limiterState.threshold_db / 20.0);
        const attackCoeff = Math.exp(-1.0 / (this.limiterState.attack_ms * this.sampleRate / 1000.0));
        const releaseCoeff = Math.exp(-1.0 / (this.limiterState.release_ms * this.sampleRate / 1000.0));
        
        for (let ch = 0; ch < channels; ch++) {
            const limitedChannel = new Float32Array(frameSize);
            let prevGain = this.limiterState.previousGain[ch];
            
            for (let i = 0; i < frameSize; i++) {
                const input = frame[ch][i];
                const inputAbs = Math.abs(input);
                
                // Calculate required gain reduction
                let targetGain = 1.0;
                if (inputAbs > threshold) {
                    targetGain = threshold / inputAbs;
                }
                
                // Smooth gain changes
                if (targetGain < prevGain) {
                    // Attack phase - fast reduction
                    prevGain = targetGain + (prevGain - targetGain) * attackCoeff;
                } else {
                    // Release phase - slow recovery
                    prevGain = targetGain + (prevGain - targetGain) * releaseCoeff;
                }
                
                // Apply gain
                limitedChannel[i] = input * prevGain;
            }
            
            // Store state for next frame
            this.limiterState.previousGain[ch] = prevGain;
            limitedFrame.push(limitedChannel);
        }
        
        return limitedFrame;
    }
}

// Register the processor
registerProcessor('jit-audio-processor', JITAudioProcessor);