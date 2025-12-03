// event_listeners.js

// event_listeners.js

// Page load cleanup - ensure fresh start (but don't disrupt normal usage)
window.addEventListener('load', function() {
    // Only do comprehensive reset if this appears to be a page refresh/reload
    // Check if there are any URL parameters that indicate intentional navigation
    const urlParams = new URLSearchParams(window.location.search);
    const isPageRefresh = !urlParams.has('tab') && !document.referrer;
    
    if (isPageRefresh) {
        // Call comprehensive server-side reset only on actual page refreshes
        fetch('/api/reset_application_state', { method: 'POST' })
            .then(response => response.json())
            .then(data => {
                console.log('Application state reset on page refresh:', data);
            })
            .catch(err => {
                console.log('Server reset failed:', err);
            });
    }
});

// Comprehensive cleanup function
window.clearAllProcessing = function() {
    console.log('clearAllProcessing called - checking if this is from download');
    console.trace(); // Log stack trace to see who called this

    // Clear batch processing
    if (window.clearBatchProcessing) {
        window.clearBatchProcessing();
    }
    
    // Clear single file processing sessions
    if (window.currentStreamingSessionId) {
        if (window.unifiedAudioController && window.unifiedAudioController.websocket) {
            window.unifiedAudioController.disconnect();
        }
        window.currentStreamingSessionId = null;
    }
    
    // Call all backend cleanup endpoints
    const cleanupEndpoints = [
        '/api/cancel_batch_processing',
        '/api/cancel_stem_separation', 
        '/api/cancel_preset_creation',
    ];
    
    cleanupEndpoints.forEach(endpoint => {
        fetch(endpoint, { method: 'POST' })
            .catch(err => console.log(`Cleanup failed for ${endpoint}:`, err));
    });
    
    // Don't clear status messages on page unload - they'll be destroyed anyway
    /*
    const statusElements = [
        'process-single-status',
        'process-batch-status',
        'stem-separation-status',
        'create-preset-status'
    ];
    statusElements.forEach(id => {
        const element = document.getElementById(id);
        if (element) {
            element.innerHTML = '';
        }
    });
    */
    
    // Don't hide result sections on page unload - they'll be destroyed anyway
    // This prevents UI reset when downloading files
    /*
    const resultElements = [
        'single-conversion-results',
        'stem-separation-results',
        'create-preset-download',
        'batch-file-list'
    ];
    resultElements.forEach(id => {
        const element = document.getElementById(id);
        if (element) {
            element.style.display = 'none';
        }
    });
    */
    
    // Reset mute button states to default (unmuted)
    window.vocalMuted = false;
    window.instrumentalMuted = false;
    
    // Update mute button UI to reflect reset state
    const vocalBtn = document.getElementById('vocal-enable-btn');
    const instrumentalBtn = document.getElementById('instrumental-enable-btn');
    
    if (vocalBtn) {
        vocalBtn.setAttribute('data-enabled', 'true');
        const btnText = vocalBtn.querySelector('.btn-text');
        if (btnText) btnText.textContent = 'On';
    }
    
    if (instrumentalBtn) {
        instrumentalBtn.setAttribute('data-enabled', 'true');
        const btnText = instrumentalBtn.querySelector('.btn-text');
        if (btnText) btnText.textContent = 'On';
    }
    
    // Also reset knob controls if available
    if (window.resetKnobControls) {
        window.resetKnobControls();
    }
};

document.addEventListener('DOMContentLoaded', function() {
    // Event listeners for single file conversion form
    const processSingleForm = document.getElementById('process-single-form');
    if (processSingleForm) {
        processSingleForm.addEventListener('submit', window.handleProcessSingleFormSubmit);
    }

    // Event listeners for batch processing form
    const processBatchForm = document.getElementById('process-batch-form');
    if (processBatchForm) {
        console.log('Attaching batch processing form listener');
        processBatchForm.addEventListener('submit', window.handleProcessBatchFormSubmit);
    } else {
        console.warn('process-batch-form not found');
    }

    // Event listeners for preset creation form
    const createPresetForm = document.getElementById('create-preset-form');
    if (createPresetForm) {
        createPresetForm.addEventListener('submit', window.handleCreatePresetFormSubmit);
    }

    // Stem separation form listener is handled in stem_separation.js

    // Event listeners for file input changes to update process button visibility
    document.getElementById('target-file-single').addEventListener('change', window.handleTargetFileSingleChange);
    document.getElementById('reference-file-single').addEventListener('change', window.checkProcessButtonVisibility);
    document.getElementById('preset-file-single').addEventListener('change', window.checkProcessButtonVisibility);
    document.getElementById('vocal-preset-file-single').addEventListener('change', window.checkProcessButtonVisibility);
    document.getElementById('instrumental-preset-file-single').addEventListener('change', window.checkProcessButtonVisibility);
    document.getElementById('use-stem-separation').addEventListener('change', window.handleStemSeparationChange);
    document.getElementById('radioReference').addEventListener('change', window.toggleReferenceInput);
    document.getElementById('radioPreset').addEventListener('change', window.toggleReferenceInput);

    // Initial call to set state if a file is already selected on page load (unlikely but good practice)
    if (document.getElementById('target-file-single').files.length > 0) {
        window.toggleReferenceInput();
    }

    // Batch processing file input change listener
    const batchTargetFiles = document.getElementById('batch-target-files');
    if (batchTargetFiles) {
        batchTargetFiles.addEventListener('change', window.handleBatchTargetFilesChange);
    }
    
    const batchRadioReference = document.getElementById('batchRadioReference');
    if (batchRadioReference) {
        batchRadioReference.addEventListener('change', window.toggleBatchReferenceInput);
    }
    
    const batchRadioPreset = document.getElementById('batchRadioPreset');
    if (batchRadioPreset) {
        batchRadioPreset.addEventListener('change', window.toggleBatchReferenceInput);
    }
    
    const batchUseStemSeparation = document.getElementById('batch-use-stem-separation');
    if (batchUseStemSeparation) {
        batchUseStemSeparation.addEventListener('change', window.toggleBatchReferenceInput);
    }
    
    const batchReferenceFile = document.getElementById('batch-reference-file');
    if (batchReferenceFile) {
        batchReferenceFile.addEventListener('change', () => {
            if (window.clearBatchProcessing) window.clearBatchProcessing();
            window.checkBatchProcessButtonVisibility();
        });
    }
    
    const batchPresetFile = document.getElementById('batch-preset-file');
    if (batchPresetFile) {
        batchPresetFile.addEventListener('change', () => {
            if (window.clearBatchProcessing) window.clearBatchProcessing();
            window.checkBatchProcessButtonVisibility();
        });
    }
    
    const batchVocalPresetFile = document.getElementById('batch-vocal-preset-file');
    if (batchVocalPresetFile) {
        batchVocalPresetFile.addEventListener('change', () => {
            if (window.clearBatchProcessing) window.clearBatchProcessing();
            window.checkBatchProcessButtonVisibility();
        });
    }
    
    const batchInstrumentalPresetFile = document.getElementById('batch-instrumental-preset-file');
    if (batchInstrumentalPresetFile) {
        batchInstrumentalPresetFile.addEventListener('change', () => {
            if (window.clearBatchProcessing) window.clearBatchProcessing();
            window.checkBatchProcessButtonVisibility();
        });
    }

    // Add listeners for batch processing parameter changes
    const batchControls = [
        'batch-blend-ratio',
        'batch-master-gain', 
        'batch-vocal-blend-ratio',
        'batch-instrumental-blend-ratio',
        'batch-vocal-gain',
        'batch-instrumental-gain'
    ];
    
    batchControls.forEach(controlId => {
        const control = document.getElementById(controlId);
        if (control) {
            control.addEventListener('input', () => {
                if (window.clearBatchProcessing) window.clearBatchProcessing();
            });
        }
    });

    // Initial check on page load for batch process button visibility
    window.checkBatchProcessButtonVisibility();
    
    // Initial call to set the correct UI state for batch mode
    if (window.toggleBatchReferenceInput) {
        window.toggleBatchReferenceInput();
    }

    // Limiter toggle for batch processing
    const batchLimiterButton = document.getElementById('batchLimiterButton');
    if (batchLimiterButton) {
        batchLimiterButton.addEventListener('click', () => {
            window.batchLimiterEnabled = window.toggleLimiter(batchLimiterButton, window.batchLimiterEnabled);
        });
        // Initial state for batch limiter button
        const initialBatchLimiterText = batchLimiterButton.querySelector('.limiter-text');
        if (window.batchLimiterEnabled) {
            batchLimiterButton.classList.add('limiter-on');
            if (initialBatchLimiterText) {
                initialBatchLimiterText.textContent = 'ON';
            }
        } else {
            batchLimiterButton.classList.add('limiter-bypassed');
            if (initialBatchLimiterText) {
                initialBatchLimiterText.textContent = 'BYPASSED';
            }
        }
    }

    // Playback button event listeners
    const playButton = document.getElementById('play-button');
    const pauseButton = document.getElementById('pause-button');
    const stopButton = document.getElementById('stop-button');

    if (playButton) playButton.addEventListener('click', window.playAudio);
    if (pauseButton) pauseButton.addEventListener('click', window.pauseAudio);
    if (stopButton) stopButton.addEventListener('click', window.stopAudio);

    // Set initial state for playback buttons
    window.updatePlaybackButtons('stop');

    // Save blend button event listener
    const saveBlendButton = document.getElementById('save-blend-button');
    if (saveBlendButton) {
        saveBlendButton.addEventListener('click', () => {
            // Use stem save function if in stem mode, otherwise use regular save
            if (window.stemStreamingSessionId) {
                window.handleSaveStemBlend();
            } else {
                window.handleSaveBlend();
            }
        });
    }

    // Vocal and instrumental enable button event listeners
    const vocalEnableBtn = document.getElementById('vocal-enable-btn');
    if (vocalEnableBtn) {
        vocalEnableBtn.addEventListener('click', () => {
            console.log('Vocal mute button clicked, before:', window.vocalMuted);
            window.vocalMuted = !window.vocalMuted;
            vocalEnableBtn.setAttribute('data-enabled', !window.vocalMuted);
            vocalEnableBtn.querySelector('.btn-text').textContent = window.vocalMuted ? 'Off' : 'On';
            console.log('Vocal mute button clicked, after:', window.vocalMuted, 'UI text:', vocalEnableBtn.querySelector('.btn-text').textContent);
            
            // Send parameters via unified controller
            if (window.unifiedAudioController) {
                window.unifiedAudioController.sendParameters();
            }
        });
    }

    const instrumentalEnableBtn = document.getElementById('instrumental-enable-btn');
    if (instrumentalEnableBtn) {
        instrumentalEnableBtn.addEventListener('click', () => {
            console.log('Instrumental mute button clicked, before:', window.instrumentalMuted);
            window.instrumentalMuted = !window.instrumentalMuted;
            instrumentalEnableBtn.setAttribute('data-enabled', !window.instrumentalMuted);
            instrumentalEnableBtn.querySelector('.btn-text').textContent = window.instrumentalMuted ? 'Off' : 'On';
            console.log('Instrumental mute button clicked, after:', window.instrumentalMuted, 'UI text:', instrumentalEnableBtn.querySelector('.btn-text').textContent);
            
            // Send parameters via unified controller
            if (window.unifiedAudioController) {
                window.unifiedAudioController.sendParameters();
            }
        });
    }

    // Tab switching cleanup - stop all active processing when switching tabs
    const tabButtons = document.querySelectorAll('[data-bs-toggle="tab"]');
    tabButtons.forEach(tabButton => {
        tabButton.addEventListener('click', function(event) {
            const targetTab = event.target.getAttribute('data-bs-target');
            
            // Only clear processing that's not related to the target tab
            if (targetTab !== '#single') {
                // Stop single file processing only when NOT switching to single file tab
                if (window.currentStreamingSessionId) {
                    // Stop any active WebSocket connections
                    if (window.unifiedAudioController && window.unifiedAudioController.websocket) {
                        window.unifiedAudioController.disconnect();
                    }
                    window.currentStreamingSessionId = null;
                }
            }
            
            if (targetTab !== '#batch') {
                // Stop batch processing only when NOT switching to batch tab
                if (window.clearBatchProcessing) {
                    window.clearBatchProcessing();
                }
            }
            
            // Cancel stem separation processing (always call to ensure cleanup)
            fetch('/api/cancel_stem_separation', { method: 'POST' })
                .catch(err => console.log('Stem separation cleanup failed:', err));
            
            // Cancel preset creation processing (always call to ensure cleanup)
            fetch('/api/cancel_preset_creation', { method: 'POST' })
                .catch(err => console.log('Preset creation cleanup failed:', err));
            
            // Clear any status messages
            const statusElements = [
                'process-single-status',
                'process-batch-status', 
                'stem-separation-status',
                'create-preset-status'
            ];
            statusElements.forEach(id => {
                const element = document.getElementById(id);
                if (element) {
                    element.innerHTML = '';
                }
            });
            
            // Hide result sections
            const resultElements = [
                'single-conversion-results',
                'stem-separation-results', 
                'create-preset-download'
            ];
            resultElements.forEach(id => {
                const element = document.getElementById(id);
                if (element) {
                    element.style.display = 'none';
                }
            });
            
            // Initialize target tab if needed
            if (targetTab === '#single') {
                // Ensure single file processing state is properly initialized
                setTimeout(() => {
                    // Restore mute button states if there's an active session
                    if (window.currentStreamingSessionId) {
                        const vocalBtn = document.getElementById('vocal-enable-btn');
                        const instrumentalBtn = document.getElementById('instrumental-enable-btn');
                        
                        if (vocalBtn) {
                            vocalBtn.setAttribute('data-enabled', window.vocalMuted ? 'false' : 'true');
                            const btnText = vocalBtn.querySelector('.btn-text');
                            if (btnText) btnText.textContent = window.vocalMuted ? 'Off' : 'On';
                        }
                        
                        if (instrumentalBtn) {
                            instrumentalBtn.setAttribute('data-enabled', window.instrumentalMuted ? 'false' : 'true');
                            const btnText = instrumentalBtn.querySelector('.btn-text');
                            if (btnText) btnText.textContent = window.instrumentalMuted ? 'Off' : 'On';
                        }
                        
                        // Ensure audio controller is connected and ready
                        if (window.unifiedAudioController) {
                            window.unifiedAudioController.sendParameters();
                        }
                    }
                }, 100); // Small delay to ensure tab switch is complete
            }
        });
    });
});
