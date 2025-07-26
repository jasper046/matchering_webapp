// audio_playback.js

let previewAudioElement = null; // Audio element for playback
let currentPreviewPath = null; // Path to current preview audio
let isPlaying = false;
let animationFrameId; // For play position indicator
let audioStartOffset = 0; // Offset for tracking absolute position after seeking
let totalAudioDuration = 0; // Total duration of the original audio

// WebSocket audio streaming
let webSocketAudioStream = null;
let useWebSocketAudio = true; // Prefer WebSocket when available

async function playAudio() {
    // Initialize WebSocket audio on demand if not already initialized
    const isStemMode = window.targetVocalPath && window.processedVocalPath;
    
    if (isStemMode && !window.stemWebSocketAudioStream) {
        console.log('Initializing stem WebSocket audio on first play...');
        // Create stem streaming session and initialize audio
        if (window.createStemStreamingSession && window.initializeStemAudioPlayback) {
            const sessionCreated = await window.createStemStreamingSession();
            if (sessionCreated) {
                await window.initializeStemAudioPlayback();
            } else {
                console.error('Failed to create stem session');
                return;
            }
        }
    } else if (window.streamingSessionId && !window.webSocketAudioStream) {
        console.log('Initializing regular WebSocket audio on first play...');
        if (window.initializeWebSocketAudio) {
            window.initializeWebSocketAudio(window.streamingSessionId);
            
            // Wait a moment for connection to establish
            await new Promise(resolve => setTimeout(resolve, 500));
            
            // Send initial parameters
            if (window.unifiedAudioController) {
                window.unifiedAudioController.sendParameters();
            }
        }
    }
    
    if (window.unifiedAudioController) {
        await window.unifiedAudioController.play();
    } else {
        console.warn('Unified audio controller not available');
    }
}

function pauseAudio() {
    if (window.unifiedAudioController) {
        window.unifiedAudioController.pause();
    } else {
        console.warn('Unified audio controller not available');
    }
}

function stopAudio() {
    if (window.unifiedAudioController) {
        window.unifiedAudioController.stop();
    } else {
        console.warn('Unified audio controller not available');
    }
}

function updatePlaybackButtons(activeButtonId) {
    document.querySelectorAll('.playback-button').forEach(button => {
        button.classList.remove('playback-active');
    });
    
    const activeButton = document.getElementById(`${activeButtonId}-button`);
    if (activeButton) {
        activeButton.classList.add('playback-active');
    } else {
        console.warn(`Playback button not found: ${activeButtonId}-button`);
    }
}

// Function to draw the play position indicator
function drawPlayPosition(position) {
    const playheadCanvas = document.getElementById('combined-waveform-playhead');
    if (!playheadCanvas) return;

    const ctx = playheadCanvas.getContext('2d');
    const waveformImage = document.getElementById('combined-waveform-image');

    // Ensure canvas matches image dimensions
    if (waveformImage) {
        playheadCanvas.width = waveformImage.offsetWidth;
        playheadCanvas.height = waveformImage.offsetHeight;
    }

    const width = playheadCanvas.width;
    const height = playheadCanvas.height;

    // Clear the canvas before drawing new playhead
    ctx.clearRect(0, 0, width, height);

    // Draw play position line
    const x = position * width;
    ctx.strokeStyle = 'red';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
}

// Function to seek audio using pause/seek/play pattern
async function seekAudio(event) {
    if (!window.unifiedAudioController) {
        console.warn('Unified audio controller not available');
        return;
    }
    
    const playheadCanvas = document.getElementById('combined-waveform-playhead');
    if (!playheadCanvas) {
        console.warn('Seek failed: missing canvas');
        return;
    }

    const rect = playheadCanvas.getBoundingClientRect();
    const width = rect.width; // Use displayed width, not canvas element width
    const x = event.clientX - rect.left;

    // Calculate seek position (0.0 to 1.0)
    const seekPosition = x / width;
    
    // Validate seek position
    if (!isFinite(seekPosition) || seekPosition < 0 || seekPosition > 1) {
        console.warn('Invalid seek position:', seekPosition);
        return;
    }
    
    console.log('Seeking to position:', seekPosition);
    
    try {
        window.unifiedAudioController.seek(seekPosition);
        console.log('Seek completed');
    } catch (error) {
        console.error('Seek error:', error);
    }
}

// Position updates are now handled by WebSocket callbacks


// Update playback controls based on current state
function updatePlaybackControls() {
    if (previewAudioElement) {
        const playButton = document.getElementById('play-button');
        const pauseButton = document.getElementById('pause-button');
        const stopButton = document.getElementById('stop-button');
        
        // Enable controls
        playButton.disabled = false;
        pauseButton.disabled = false;
        stopButton.disabled = false;
    }
}

// Export variables and functions that need to be accessed globally
window.playAudio = playAudio;
window.pauseAudio = pauseAudio;
window.stopAudio = stopAudio;
window.updatePlaybackButtons = updatePlaybackButtons;
window.drawPlayPosition = drawPlayPosition;
window.seekAudio = seekAudio;
window.updatePlaybackControls = updatePlaybackControls;
window.isPlaying = isPlaying;
window.animationFrameId = animationFrameId;
window.audioStartOffset = audioStartOffset;
window.totalAudioDuration = totalAudioDuration;
window.useWebSocketAudio = useWebSocketAudio;
// Initialize WebSocket audio when session is available
function initializeWebSocketAudio(sessionId) {
    if (!sessionId) {
        console.warn('Cannot initialize WebSocket audio: no session ID');
        return false;
    }
    
    try {
        webSocketAudioStream = new window.WebSocketAudioStream(sessionId);
        
        // Update window reference
        window.webSocketAudioStream = webSocketAudioStream;
        
        // Set up callbacks
        webSocketAudioStream.onPositionUpdate = (position) => {
            drawPlayPosition(position);
        };
        
        webSocketAudioStream.onPlaybackStateChange = (playing, position) => {
            isPlaying = playing;
            if (position !== undefined) {
                drawPlayPosition(position);
            }
            updatePlaybackButtons(playing ? 'play' : 'pause');
        };
        
        webSocketAudioStream.onError = (error) => {
            console.error('WebSocket audio error:', error);
            useWebSocketAudio = false;
            window.useWebSocketAudio = false;
        };
        
        // Connect to WebSocket
        webSocketAudioStream.connect().then(() => {
            console.log('WebSocket audio initialized successfully');
            useWebSocketAudio = true;
            window.useWebSocketAudio = true;
        }).catch((error) => {
            console.warn('Failed to connect WebSocket audio:', error);
            useWebSocketAudio = false;
            window.useWebSocketAudio = false;
        });
        
        return true;
    } catch (error) {
        console.error('Failed to initialize WebSocket audio:', error);
        useWebSocketAudio = false;
        window.useWebSocketAudio = false;
        return false;
    }
}

// Send parameters to backend via WebSocket
function sendParametersToBackendWS() {
    if (!webSocketAudioStream || !webSocketAudioStream.isConnected()) {
        console.warn('Cannot send parameters: WebSocket audio not connected');
        return;
    }
    
    const params = {
        blend_ratio: (window.currentBlendValue || 50) / 100.0,
        master_gain_db: window.currentMasterGain || 0.0,
        vocal_gain_db: window.currentVocalGain || 0.0,
        instrumental_gain_db: window.currentInstrumentalGain || 0.0,
        limiter_enabled: window.limiterEnabled !== undefined ? window.limiterEnabled : true,
        is_stem_mode: window.isCurrentlyStemMode()
    };
    
    webSocketAudioStream.updateParameters(params);
    console.log('Parameters sent via WebSocket');
}

// Export additional WebSocket functions
window.initializeWebSocketAudio = initializeWebSocketAudio;
window.sendParametersToBackendWS = sendParametersToBackendWS;

// Export webSocketAudioStream directly
window.webSocketAudioStream = webSocketAudioStream;

// Update the window reference dynamically
Object.defineProperty(window, 'previewAudioElement', {
    get: () => previewAudioElement,
    set: (value) => {
        previewAudioElement = value;
        console.log('Audio element updated via window property');
    },
    configurable: true
});
window.currentPreviewPath = currentPreviewPath;

// Clean up WebSocket connection when page unloads
window.addEventListener('beforeunload', () => {
    if (webSocketAudioStream) {
        webSocketAudioStream.disconnect();
    }
});
