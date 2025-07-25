
// processing_logic.js

let isProcessing = false; // Global processing state to prevent double submissions and tab switching
let isJITInitializing = false; // New state for JIT initialization

let originalFilePath = null; // Path to original audio file
let processedFilePath = null; // Path to processed audio file

// Processing state management functions
function setProcessingState(processing) {
    isProcessing = processing;
    
    // Disable/enable process button
    const processFileButton = document.getElementById('process-file-button');
    if (processFileButton) {
        processFileButton.disabled = processing;
        processFileButton.textContent = processing ? 'Processing...' : 'Process File';
    }
    
    // Disable/enable tab switching
    const navLinks = document.querySelectorAll('.nav-link');
    navLinks.forEach(link => {
        if (processing) {
            link.style.pointerEvents = 'none';
            link.style.opacity = '0.5';
        } else {
            link.style.pointerEvents = 'auto';
            link.style.opacity = '1';
        }
    });
    
    // Disable/enable other form submissions
    const forms = document.querySelectorAll('form');
    forms.forEach(form => {
        const submitButtons = form.querySelectorAll('button[type="submit"]');
        submitButtons.forEach(button => {
            if (button !== processFileButton) {
                button.disabled = processing;
            }
        });
    });
}

// Function to check and update process button visibility
function checkProcessButtonVisibility() {
    const useStemSeparation = document.getElementById('use-stem-separation').checked;
    const isVocalPresetSelected = document.getElementById('vocal-preset-file-single').files.length > 0;
    const isInstrumentalPresetSelected = document.getElementById('instrumental-preset-file-single').files.length > 0;
    const isTargetFileSelected = document.getElementById('target-file-single').files.length > 0;
    let isRequiredFilesSelected = false;

    const radioReference = document.getElementById('radioReference');
    const radioPreset = document.getElementById('radioPreset');
    const processFileButton = document.getElementById('process-file-button');

    if (radioReference.checked) {
        // Reference mode: always just need reference file (stem separation happens on backend)
        isRequiredFilesSelected = document.getElementById('reference-file-single').files.length > 0;
    } else if (radioPreset.checked) {
        if (useStemSeparation) {
            // Preset mode with stem separation: need both vocal and instrumental presets
            isRequiredFilesSelected = isVocalPresetSelected && isInstrumentalPresetSelected;
        } else {
            // Standard preset mode: need single preset file
            isRequiredFilesSelected = document.getElementById('preset-file-single').files.length > 0;
        }
    }

    if (isTargetFileSelected && isRequiredFilesSelected) {
        processFileButton.style.display = 'block';
    } else {
        processFileButton.style.display = 'none';
    }
}

// Export variables and functions that need to be accessed globally
window.setProcessingState = setProcessingState;
window.checkProcessButtonVisibility = checkProcessButtonVisibility;
window.isProcessing = isProcessing;
window.isJITInitializing = isJITInitializing;
window.originalFilePath = originalFilePath;
window.processedFilePath = processedFilePath;

// Step-by-step display logic for Single File Conversion
window.handleTargetFileSingleChange = () => {
    console.log('handleTargetFileSingleChange triggered');
    const processSingleStatus = document.getElementById('process-single-status');
    const singleConversionResults = document.getElementById('single-conversion-results');
    const targetFileSingle = document.getElementById('target-file-single');

    console.log('targetFileSingle.files.length:', targetFileSingle.files.length);
    processSingleStatus.textContent = ''; // Clear status
    if (targetFileSingle.files.length > 0) {
        console.log('File selected, attempting to show elements.');
        // Show stem separation option first
        document.getElementById('stem-separation-selection').style.display = 'block';
        document.getElementById('reference-type-selection').style.display = 'block';
        // Automatically check radioReference by default for non-stem mode
        document.getElementById('radioReference').checked = true;
        // Trigger the change event for radioReference to update the UI
        const event = new Event('change');
        document.getElementById('radioReference').dispatchEvent(event);
    } else {
        console.log('No file selected, hiding elements.');
        document.getElementById('stem-separation-selection').style.display = 'none';
        document.getElementById('reference-type-selection').style.display = 'none';
        document.getElementById('reference-file-single-div').style.display = 'none';
        document.getElementById('preset-file-single-div').style.display = 'none';
        document.getElementById('vocal-preset-file-single-div').style.display = 'none';
        document.getElementById('instrumental-preset-file-single-div').style.display = 'none';
    }
    window.checkProcessButtonVisibility(); // Check visibility after target file changes
    // Hide results section if target file changes
    singleConversionResults.style.display = 'none';
};


    

