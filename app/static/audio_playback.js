// audio_playback.js

let previewAudioElement = null; // Audio element for playback
let currentPreviewPath = null; // Path to current preview audio
let isPlaying = false;
let animationFrameId; // For play position indicator

async function playAudio() {
    // Try JIT processing first
    if (window.jitPlayback && window.jitPlayback.isReady()) {
        const success = await window.jitPlayback.play();
        if (success) {
            isPlaying = true;
            updatePlaybackButtons('play');
            // Don't call updatePlayPosition() - JIT handles position updates via callbacks
            return;
        }
    }
    
    // Fallback to traditional audio element
    // Check both local and window variables
    const audioElement = previewAudioElement || window.previewAudioElement;
    const audioPath = currentPreviewPath || window.currentPreviewPath;
    
    console.log('Playback attempt - local audioElement:', !!previewAudioElement, 'window audioElement:', !!window.previewAudioElement);
    console.log('Playback attempt - local path:', currentPreviewPath, 'window path:', window.currentPreviewPath);
    
    if (!audioElement || !audioPath) {
        console.warn('Cannot play: missing audio element or path');
        return;
    }
    
    // Update local variables to match window
    if (!previewAudioElement && window.previewAudioElement) {
        previewAudioElement = window.previewAudioElement;
        console.log('Synced local audio element from window');
    }
    if (!currentPreviewPath && window.currentPreviewPath) {
        currentPreviewPath = window.currentPreviewPath;
        console.log('Synced local audio path from window');
    }
    
    previewAudioElement.play();
    isPlaying = true;
    updatePlaybackButtons('play');
    updatePlayPosition(); // Only for traditional audio
}

function pauseAudio() {
    // Try JIT processing first
    if (window.jitPlayback && window.jitPlayback.isReady()) {
        window.jitPlayback.pause();
        isPlaying = false;
        updatePlaybackButtons('pause');
        // JIT doesn't use animation frames, position updates stop automatically
        return;
    }
    
    // Fallback to traditional audio element
    if (!previewAudioElement) return;
    
    previewAudioElement.pause();
    isPlaying = false;
    updatePlaybackButtons('pause');
    
    if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
    }
}

function stopAudio() {
    // Try JIT processing first
    if (window.jitPlayback && window.jitPlayback.isReady()) {
        window.jitPlayback.stop();
        isPlaying = false;
        updatePlaybackButtons('stop');
        // JIT doesn't use animation frames, but we still need to reset position visually
        drawPlayPosition(0);
        return;
    }
    
    // Fallback to traditional audio element
    if (!previewAudioElement) return;
    
    previewAudioElement.pause();
    previewAudioElement.currentTime = 0;
    isPlaying = false;
    updatePlaybackButtons('stop');
    
    if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
    }
    
    drawPlayPosition(0);
    
    // Update preview after stopping
    if (typeof window.generateBlendPreview === 'function') {
        setTimeout(() => {
            window.generateBlendPreview(true); // Force update
        }, 100);
    }
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

// Function to seek audio (for HTML5 audio element)
function seekAudio(event) {
    if (!previewAudioElement || !previewAudioElement.duration) return;

    const playheadCanvas = document.getElementById('combined-waveform-playhead');
    if (!playheadCanvas) return;

    const rect = playheadCanvas.getBoundingClientRect();
    const width = playheadCanvas.width;

    const x = event.clientX - rect.left; // x position within the element.

    const seekTime = (x / width) * previewAudioElement.duration;
    previewAudioElement.currentTime = seekTime;

    // Update play position indicator immediately
    drawPlayPosition(seekTime / previewAudioElement.duration);
}

// Update play position during playback 
function updatePlayPosition() {
    if (!isPlaying) return;
    
    let position = 0;
    let ended = false;
    
    // Get position from JIT processor if available
    if (window.jitPlayback && window.jitPlayback.isReady()) {
        const state = window.jitPlayback.getState();
        if (state.duration > 0) {
            position = state.currentTime / state.duration;
            ended = state.currentTime >= state.duration;
        }
    } else if (previewAudioElement) {
        // Fallback to traditional audio element
        if (previewAudioElement.duration > 0) {
            position = previewAudioElement.currentTime / previewAudioElement.duration;
            ended = previewAudioElement.ended;
        }
    }
    
    if (ended) {
        // Reached end, stop playback
        stopAudio();
        return;
    }
    
    drawPlayPosition(position);
    animationFrameId = requestAnimationFrame(updatePlayPosition);
}

// Update the preview audio element with new processed audio
function updatePreviewAudio(audioPath) {
    if (!previewAudioElement) {
        // Create audio element if it doesn't exist
        previewAudioElement = new Audio();
    }
    
    // Remember if we were playing and the current time
    const wasPlaying = isPlaying && !previewAudioElement.paused;
    const currentTime = previewAudioElement.currentTime || 0;
    
    // Update the audio source
    currentPreviewPath = audioPath;
    // Use the new streaming endpoint
    if (window.frameProcessingManager && window.frameProcessingManager.sessionId) {
        previewAudioElement.src = `/api/frame/stream/${window.frameProcessingManager.sessionId}`;
    } else {
        console.error('Session ID not available for audio streaming.');
        previewAudioElement.src = ''; // Clear source if session ID is missing
    }
    
    // If we were playing, resume playback once the new audio loads
    if (wasPlaying) {
        // Use multiple events to ensure reliable loading detection
        let resumed = false;
        
        const attemptResume = () => {
            if (resumed) return; // Prevent multiple resume attempts
            
            setTimeout(() => {
                try {
                    // Verify audio is ready and duration is available
                    if (previewAudioElement.readyState >= 3 && previewAudioElement.duration) {
                        resumed = true;
                        
                        // Set the current time to where we were
                        if (currentTime > 0 && currentTime <= previewAudioElement.duration) {
                            previewAudioElement.currentTime = currentTime;
                        } else {
                            previewAudioElement.currentTime = 0;
                        }
                        
                        previewAudioElement.play().then(() => {
                            isPlaying = true;
                            updatePlaybackButtons('play');
                            updatePlayPosition();
                        }).catch(error => {
                            console.warn('Could not resume playback:', error);
                            isPlaying = false;
                            updatePlaybackButtons('stop');
                        });
                    } else {
                    }
                } catch (error) {
                    console.warn('Error in resume playback:', error);
                }
            }, 100); // Slightly longer delay for better reliability
        };
        
        // Try multiple events to catch when audio is ready
        previewAudioElement.addEventListener('canplaythrough', attemptResume, { once: true });
        previewAudioElement.addEventListener('loadeddata', attemptResume, { once: true });
        
        // Fallback timeout in case events don't fire
        setTimeout(() => {
            if (!resumed) {
                attemptResume();
            }
        }, 500);
    }
    
    // Update playback controls state if needed
    updatePlaybackControls();
}

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
window.updatePreviewAudio = updatePreviewAudio;
window.updatePlaybackControls = updatePlaybackControls;
window.isPlaying = isPlaying;
window.animationFrameId = animationFrameId;
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
