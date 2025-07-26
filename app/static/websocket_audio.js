// websocket_audio.js
// WebSocket-based real-time audio streaming with bidirectional parameter updates

class WebSocketAudioStream {
    constructor(sessionId) {
        this.sessionId = sessionId;
        this.websocket = null;
        this.audioContext = null;
        this.audioQueue = [];
        this.isPlaying = false;
        this.currentPosition = 0.0;
        this.totalDuration = 0.0;
        this.sampleRate = 44100;
        this.channels = 2;
        
        // Audio buffering
        this.bufferSize = 8192;
        this.audioBuffers = [];
        this.currentBufferIndex = 0;
        this.nextPlayTime = 0;
        
        // Callbacks
        this.onPositionUpdate = null;
        this.onPlaybackStateChange = null;
        this.onError = null;
        
        this.initializeAudioContext();
    }
    
    async initializeAudioContext() {
        try {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            console.log('WebSocket Audio Context initialized');
        } catch (error) {
            console.error('Failed to initialize AudioContext:', error);
            if (this.onError) this.onError('Failed to initialize audio');
        }
    }
    
    async connect() {
        if (this.websocket) {
            this.disconnect();
        }
        
        try {
            const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            // Use localhost instead of 0.0.0.0 for WebSocket connections
            const host = window.location.host.replace('0.0.0.0', 'localhost');
            const wsUrl = `${protocol}//${host}/api/frame/ws/${this.sessionId}`;
            
            console.log('Connecting to WebSocket:', wsUrl);
            this.websocket = new WebSocket(wsUrl);
            this.websocket.binaryType = 'arraybuffer';
            
            this.websocket.onopen = () => {
                console.log('WebSocket audio stream connected');
            };
            
            this.websocket.onmessage = (event) => {
                this.handleMessage(event);
            };
            
            this.websocket.onclose = (event) => {
                console.log('WebSocket audio stream closed:', event.code, event.reason);
                this.cleanup();
            };
            
            this.websocket.onerror = (error) => {
                console.error('WebSocket error:', error);
                if (this.onError) this.onError('WebSocket connection error');
            };
            
            // Wait for connection
            await new Promise((resolve, reject) => {
                const timeout = setTimeout(() => reject(new Error('Connection timeout')), 5000);
                this.websocket.onopen = () => {
                    clearTimeout(timeout);
                    console.log('WebSocket audio stream connected');
                    resolve();
                };
                this.websocket.onerror = () => {
                    clearTimeout(timeout);
                    reject(new Error('Connection failed'));
                };
            });
            
        } catch (error) {
            console.error('Failed to connect WebSocket:', error);
            if (this.onError) this.onError('Failed to connect audio stream');
            throw error;
        }
    }
    
    handleMessage(event) {
        if (typeof event.data === 'string') {
            // JSON message
            try {
                const message = JSON.parse(event.data);
                this.handleJsonMessage(message);
            } catch (error) {
                console.error('Failed to parse WebSocket JSON:', error);
            }
        } else {
            // Binary audio data
            this.handleAudioData(event.data);
        }
    }
    
    handleJsonMessage(message) {
        switch (message.type) {
            case 'audio_chunk':
                // Metadata for the next audio chunk
                this.currentPosition = message.position;
                this.sampleRate = message.sample_rate;
                this.channels = message.channels;
                
                if (this.onPositionUpdate) {
                    this.onPositionUpdate(this.currentPosition);
                }
                break;
                
            case 'status':
                this.isPlaying = message.playing;
                if (message.position !== undefined) {
                    this.currentPosition = message.position;
                }
                if (this.onPlaybackStateChange) {
                    this.onPlaybackStateChange(this.isPlaying, this.currentPosition);
                }
                break;
                
            case 'seeked':
                this.currentPosition = message.position;
                if (this.onPositionUpdate) {
                    this.onPositionUpdate(this.currentPosition);
                }
                break;
                
            case 'playback_ended':
                this.isPlaying = false;
                this.currentPosition = 1.0;
                if (this.onPlaybackStateChange) {
                    this.onPlaybackStateChange(false, 1.0);
                }
                break;
                
            case 'parameters_updated':
                console.log('Parameters updated successfully');
                break;
                
            case 'error':
                console.error('WebSocket server error:', message.message);
                if (this.onError) this.onError(message.message);
                break;
                
            default:
                console.log('Unknown WebSocket message type:', message.type);
        }
    }
    
    handleAudioData(arrayBuffer) {
        if (!this.audioContext || this.audioContext.state === 'suspended') {
            // Try to resume audio context
            if (this.audioContext) {
                this.audioContext.resume();
            }
            return;
        }
        
        try {
            // Convert PCM data to AudioBuffer
            const pcmData = new Int16Array(arrayBuffer);
            const audioBuffer = this.audioContext.createBuffer(
                this.channels, 
                pcmData.length / this.channels, 
                this.sampleRate
            );
            
            // Fill audio buffer with PCM data
            for (let channel = 0; channel < this.channels; channel++) {
                const channelData = audioBuffer.getChannelData(channel);
                for (let i = 0; i < channelData.length; i++) {
                    const sampleIndex = i * this.channels + channel;
                    channelData[i] = pcmData[sampleIndex] / 32768.0; // Convert to float
                }
            }
            
            // Schedule audio buffer for playback
            this.scheduleAudioBuffer(audioBuffer);
            
        } catch (error) {
            console.error('Failed to process audio data:', error);
        }
    }
    
    scheduleAudioBuffer(audioBuffer) {
        const source = this.audioContext.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(this.audioContext.destination);
        
        // Simple, reliable scheduling
        const currentTime = this.audioContext.currentTime;
        
        // Start immediately or at next scheduled time
        const startTime = Math.max(currentTime + 0.01, this.nextPlayTime);
        source.start(startTime);
        
        // Update next play time
        this.nextPlayTime = startTime + audioBuffer.duration;
        
        // Simple cleanup
        source.onended = () => {
            source.disconnect();
        };
    }
    
    // Control methods
    async play() {
        if (!this.websocket || this.websocket.readyState !== WebSocket.OPEN) {
            throw new Error('WebSocket not connected');
        }
        
        // Resume audio context if suspended
        if (this.audioContext && this.audioContext.state === 'suspended') {
            await this.audioContext.resume();
        }
        
        this.sendMessage({ type: 'play' });
    }
    
    pause() {
        if (!this.websocket || this.websocket.readyState !== WebSocket.OPEN) {
            return;
        }
        
        this.sendMessage({ type: 'pause' });
    }
    
    stop() {
        if (!this.websocket || this.websocket.readyState !== WebSocket.OPEN) {
            return;
        }
        
        this.sendMessage({ type: 'stop' });
        this.nextPlayTime = 0; // Reset audio scheduling
    }
    
    seek(position) {
        if (!this.websocket || this.websocket.readyState !== WebSocket.OPEN) {
            return;
        }
        
        // Clamp position to valid range
        position = Math.max(0, Math.min(1, position));
        
        // Remember if we were playing
        const wasPlaying = this.isPlaying;
        
        // Pause first to stop current audio
        this.sendMessage({ type: 'pause' });
        
        // Reset audio timing for seeking
        this.nextPlayTime = 0;
        
        // Send seek command
        this.sendMessage({ 
            type: 'seek', 
            position: position 
        });
        
        // Resume playing if we were playing before
        if (wasPlaying) {
            // Small delay to let seek complete
            setTimeout(() => {
                this.sendMessage({ type: 'play' });
            }, 50);
        }
    }
    
    updateParameters(params) {
        if (!this.websocket || this.websocket.readyState !== WebSocket.OPEN) {
            return;
        }
        
        this.sendMessage({
            type: 'parameters',
            params: params
        });
    }
    
    sendMessage(message) {
        if (this.websocket && this.websocket.readyState === WebSocket.OPEN) {
            this.websocket.send(JSON.stringify(message));
        }
    }
    
    disconnect() {
        if (this.websocket) {
            this.websocket.close();
            this.websocket = null;
        }
        this.cleanup();
    }
    
    cleanup() {
        this.audioQueue = [];
        this.audioBuffers = [];
        this.currentBufferIndex = 0;
        this.nextPlayTime = 0;
        this.isPlaying = false;
    }
    
    // Getters
    getPosition() {
        return this.currentPosition;
    }
    
    getIsPlaying() {
        return this.isPlaying;
    }
    
    isConnected() {
        return this.websocket && this.websocket.readyState === WebSocket.OPEN;
    }
}

// Export for global use
window.WebSocketAudioStream = WebSocketAudioStream;