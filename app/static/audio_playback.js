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
    if (!webSocketAudioStream || !webSocketAudioStream.isConnected()) {
        console.warn('Cannot play: WebSocket audio not connected');
        return;
    }
    
    try {
        await webSocketAudioStream.play();
        console.log('WebSocket audio playback started');
    } catch (error) {
        console.error('WebSocket audio play failed:', error);
    }
}

function pauseAudio() {
    if (!webSocketAudioStream || !webSocketAudioStream.isConnected()) {
        console.warn('Cannot pause: WebSocket audio not connected');
        return;
    }
    
    webSocketAudioStream.pause();
    console.log('WebSocket audio paused');
}

function stopAudio() {
    if (!webSocketAudioStream || !webSocketAudioStream.isConnected()) {
        console.warn('Cannot stop: WebSocket audio not connected');
        return;
    }
    
    webSocketAudioStream.stop();
    console.log('WebSocket audio stopped');
}

function updatePlaybackButtons(activeButtonId) {
    document.querySelectorAll('.playback-button').forEach(button => {
        button.classList.remove('playback-active');
    });
    document.getElementById(`${activeButtonId}-button`).classList.add('playback-active');
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
    if (!webSocketAudioStream || !webSocketAudioStream.isConnected()) {
        console.warn('Cannot seek: WebSocket audio not connected');
        return;
    }
    
    const playheadCanvas = document.getElementById('combined-waveform-playhead');
    if (!playheadCanvas) {
        console.warn('Seek failed: missing canvas');
        return;
    }

    const rect = playheadCanvas.getBoundingClientRect();
    const width = playheadCanvas.width;
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
        webSocketAudioStream.seek(seekPosition);
        console.log('WebSocket seek completed');
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
