// event_listeners.js

// event_listeners.js

    // Event listeners for single file conversion form
    const processSingleForm = document.getElementById('process-single-form');
    if (processSingleForm) {
        processSingleForm.addEventListener('submit', window.handleProcessSingleFormSubmit);
    }

    // Event listeners for batch processing form
    const processBatchForm = document.getElementById('process-batch-form');
    if (processBatchForm) {
        processBatchForm.addEventListener('submit', window.handleProcessBatchFormSubmit);
    }

    // Event listeners for preset creation form
    const createPresetForm = document.getElementById('create-preset-form');
    if (createPresetForm) {
        createPresetForm.addEventListener('submit', window.handleCreatePresetFormSubmit);
    }

    // Event listeners for stem separation form
    const stemSeparationForm = document.getElementById('stem-separation-form');
    if (stemSeparationForm) {
        stemSeparationForm.addEventListener('submit', window.handleStemSeparationFormSubmit);
    }

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
        batchReferenceFile.addEventListener('change', window.checkBatchProcessButtonVisibility);
    }
    
    const batchPresetFile = document.getElementById('batch-preset-file');
    if (batchPresetFile) {
        batchPresetFile.addEventListener('change', window.checkBatchProcessButtonVisibility);
    }
    
    const batchVocalPresetFile = document.getElementById('batch-vocal-preset-file');
    if (batchVocalPresetFile) {
        batchVocalPresetFile.addEventListener('change', window.checkBatchProcessButtonVisibility);
    }
    
    const batchInstrumentalPresetFile = document.getElementById('batch-instrumental-preset-file');
    if (batchInstrumentalPresetFile) {
        batchInstrumentalPresetFile.addEventListener('change', window.checkBatchProcessButtonVisibility);
    }

    // Initial check on page load for batch process button visibility
    window.checkBatchProcessButtonVisibility();

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
            window.vocalMuted = !window.vocalMuted;
            vocalEnableBtn.setAttribute('data-enabled', !window.vocalMuted);
            vocalEnableBtn.querySelector('.btn-text').textContent = window.vocalMuted ? 'Off' : 'On';
            
            // Send parameters via unified controller
            if (window.unifiedAudioController) {
                window.unifiedAudioController.sendParameters();
            }
        });
    }

    const instrumentalEnableBtn = document.getElementById('instrumental-enable-btn');
    if (instrumentalEnableBtn) {
        instrumentalEnableBtn.addEventListener('click', () => {
            window.instrumentalMuted = !window.instrumentalMuted;
            instrumentalEnableBtn.setAttribute('data-enabled', !window.instrumentalMuted);
            instrumentalEnableBtn.querySelector('.btn-text').textContent = window.instrumentalMuted ? 'Off' : 'On';
            
            // Send parameters via unified controller
            if (window.unifiedAudioController) {
                window.unifiedAudioController.sendParameters();
            }
        });
    }
