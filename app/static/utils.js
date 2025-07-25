// utils.js
function showStatus(element, message, isError = false) {
    element.innerHTML = message;
    element.className = `mt-3 alert ${isError ? 'alert-danger' : 'alert-success'}`;
}

function toggleLimiter(button, isEnabled) {
    const text = button.querySelector('.limiter-text');
    
    if (isEnabled) {
        button.classList.remove('limiter-on');
        button.classList.add('limiter-bypassed');
        text.textContent = 'BYPASS';
        return false;
    } else {
        button.classList.remove('limiter-bypassed');
        button.classList.add('limiter-on');
        text.textContent = 'ON';
        return true;
    }
}

// Export functions that need to be accessed globally
window.showStatus = showStatus;
window.toggleLimiter = toggleLimiter;
window.limiterEnabled = true; // Default to enabled
window.batchLimiterEnabled = true; // Default to enabled
    // Initial check on page load for process button visibility
    window.checkProcessButtonVisibility();

    // Limiter toggle for single file processing
    const limiterButton = document.getElementById('limiterButton');
    if (limiterButton) {
        limiterButton.addEventListener('click', () => {
            window.limiterEnabled = window.toggleLimiter(limiterButton, window.limiterEnabled);
            // Update the audio preview when limiter state changes based on current mode
            if (window.isCurrentlyStemMode()) {
                window.updateDualStemMix();
            } else {
                window.updatePreview();
            }
        });
        // Initial state for limiter button
        const initialLimiterText = limiterButton.querySelector('.limiter-text');
        if (window.limiterEnabled) {
            limiterButton.classList.add('limiter-on');
            if (initialLimiterText) {
                initialLimiterText.textContent = 'ON';
            }
        } else {
            limiterButton.classList.add('limiter-bypassed');
            }
        }
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
    document.getElementById('target-file-single').addEventListener('change', window.checkProcessButtonVisibility);
    document.getElementById('reference-file-single').addEventListener('change', window.checkProcessButtonVisibility);
    document.getElementById('preset-file-single').addEventListener('change', window.checkProcessButtonVisibility);
    document.getElementById('vocal-preset-file-single').addEventListener('change', window.checkProcessButtonVisibility);
    document.getElementById('instrumental-preset-file-single').addEventListener('change', window.checkProcessButtonVisibility);
    document.getElementById('use-stem-separation').addEventListener('change', window.checkProcessButtonVisibility);
    document.getElementById('radioReference').addEventListener('change', window.toggleReferenceInput);
    document.getElementById('radioPreset').addEventListener('change', window.toggleReferenceInput);

    // Initial call to set state if a file is already selected on page load (unlikely but good practice)
    if (document.getElementById('target-file-single').files.length > 0) {
        window.toggleReferenceInput();
    }

    // Batch processing file input change listener
    document.getElementById('batch-target-files').addEventListener('change', window.handleBatchTargetFilesChange);
    document.getElementById('batchRadioReference').addEventListener('change', window.toggleBatchReferenceInput);
    document.getElementById('batchRadioPreset').addEventListener('change', window.toggleBatchReferenceInput);
    document.getElementById('batch-use-stem-separation').addEventListener('change', window.toggleBatchReferenceInput);
    document.getElementById('batch-reference-file').addEventListener('change', window.checkBatchProcessButtonVisibility);
