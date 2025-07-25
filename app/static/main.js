import './utils.js';
import './knob_controls.js';
import './audio_playback.js';
import './processing_logic.js';
import './preset_management.js';
import './batch_processing.js';

document.addEventListener('DOMContentLoaded', () => {
    // Initialize all modules
    window.initializeKnob();
    window.initializeDualKnobs();

    // Set initial state for playback buttons
    window.updatePlaybackButtons('stop');
