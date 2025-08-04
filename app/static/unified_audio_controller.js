// unified_audio_controller.js
// Single source of truth for audio playback and control logic

class UnifiedAudioController {
    constructor() {
        this.currentMode = 'regular'; // 'regular' or 'stem'
        this.audioStream = null;
        this.sessionId = null;
    }

    // Get the active audio stream (prioritize stem mode)
    getActiveAudioStream() {
        return window.stemWebSocketAudioStream || window.webSocketAudioStream;
    }

    // Get the active session ID
    getActiveSessionId() {
        return window.stemStreamingSessionId || window.streamingSessionId;
    }

    // Detect current mode
    getCurrentMode() {
        if (window.stemStreamingSessionId) {
            return 'stem';
        } else if (window.streamingSessionId) {
            return 'regular';
        }
        return null;
    }

    // Unified parameter sending
    async sendParameters() {
        const mode = this.getCurrentMode();
        const audioStream = this.getActiveAudioStream();
        const sessionId = this.getActiveSessionId();

        if (!mode || !sessionId) {
            console.warn('No active audio session for parameter update');
            return;
        }

        if (mode === 'stem') {
            // Stem mode parameters
            if (!audioStream || !audioStream.isConnected()) {
                console.warn('Stem WebSocket not connected');
                return;
            }

            const params = {
                vocal_blend_ratio: (window.currentVocalBlend || 50) / 100.0,
                instrumental_blend_ratio: (window.currentInstrumentalBlend || 50) / 100.0,
                vocal_gain_db: window.currentVocalGain || 0.0,
                instrumental_gain_db: window.currentInstrumentalGain || 0.0,
                master_gain_db: window.currentMasterGain || 0.0,
                vocal_muted: window.vocalMuted || false,
                instrumental_muted: window.instrumentalMuted || false,
                limiter_enabled: window.limiterEnabled !== undefined ? window.limiterEnabled : true
            };

            audioStream.updateParameters(params);
            console.log('Sent stem parameters via WebSocket:', {
                vocal_blend: window.currentVocalBlend,
                vocal_blend_ratio: params.vocal_blend_ratio,
                vocal_muted: params.vocal_muted,
                instrumental_blend: window.currentInstrumentalBlend,
                instrumental_blend_ratio: params.instrumental_blend_ratio,
                instrumental_muted: params.instrumental_muted
            });

        } else if (mode === 'regular') {
            // Regular mode parameters
            const params = {
                blend_ratio: (window.currentBlendValue || 50) / 100.0,
                master_gain_db: window.currentMasterGain || 0.0,
                vocal_gain_db: window.currentVocalGain || 0.0,
                instrumental_gain_db: window.currentInstrumentalGain || 0.0,
                limiter_enabled: window.limiterEnabled !== undefined ? window.limiterEnabled : true,
                is_stem_mode: false
            };

            if (!audioStream || !audioStream.isConnected()) {
                console.warn('Regular WebSocket not connected - cannot update parameters');
                return;
            }

            // WebSocket only - no HTTP fallback!
            audioStream.updateParameters(params);
            console.log('Sent regular parameters via WebSocket');
        }
    }

    // Unified playback controls
    async play() {
        const audioStream = this.getActiveAudioStream();
        if (!audioStream || !audioStream.isConnected()) {
            console.warn('Cannot play: No active audio stream');
            return;
        }
        
        try {
            await audioStream.play();
            console.log('Audio playback started');
        } catch (error) {
            console.error('Audio play failed:', error);
        }
    }

    pause() {
        const audioStream = this.getActiveAudioStream();
        if (!audioStream || !audioStream.isConnected()) {
            console.warn('Cannot pause: No active audio stream');
            return;
        }
        
        audioStream.pause();
        console.log('Audio paused');
    }

    stop() {
        const audioStream = this.getActiveAudioStream();
        if (!audioStream || !audioStream.isConnected()) {
            console.warn('Cannot stop: No active audio stream');
            return;
        }
        
        audioStream.stop();
        console.log('Audio stopped');
    }

    seek(position) {
        const audioStream = this.getActiveAudioStream();
        if (!audioStream || !audioStream.isConnected()) {
            console.warn('Cannot seek: No active audio stream');
            return;
        }
        
        audioStream.seek(position);
        console.log('Audio seek to position:', position);
    }

    // Master gain control (unified for both modes)
    setMasterGain(gainDb) {
        window.currentMasterGain = gainDb;
        this.sendParameters();
    }

    // Limiter control (unified for both modes)
    setLimiterEnabled(enabled) {
        window.limiterEnabled = enabled;
        this.sendParameters();
    }

    // Get current status
    getStatus() {
        const mode = this.getCurrentMode();
        const audioStream = this.getActiveAudioStream();
        const sessionId = this.getActiveSessionId();
        
        return {
            mode: mode,
            sessionId: sessionId,
            connected: audioStream ? audioStream.isConnected() : false,
            playing: audioStream ? audioStream.isPlaying : false,
            position: audioStream ? audioStream.currentPosition : 0
        };
    }
}

// Create global instance
window.unifiedAudioController = new UnifiedAudioController();

// Export for use in other modules
window.UnifiedAudioController = UnifiedAudioController;