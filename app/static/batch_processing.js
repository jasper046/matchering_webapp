
// batch_processing.js

// --- Batch Processing Section ---
const processBatchForm = document.getElementById('process-batch-form');
const processBatchStatus = document.getElementById('process-batch-status');
const batchFileList = document.getElementById('batch-file-list');
const batchFilesContainer = document.getElementById('batch-files-container');
const batchBlendRatio = document.getElementById('batch-blend-ratio');

let batchProcessingJobId = null;
let batchProcessingInterval = null;

// Add validation for batch blend ratio input
batchBlendRatio.addEventListener('input', function() {
    // Remove any non-numeric characters except for temporary input states
    let value = this.value.replace(/[^0-9]/g, '');
    
    // Convert to number and clamp between 0-100
    if (value !== '') {
        let numValue = parseInt(value);
        if (numValue < 0) numValue = 0;
        if (numValue > 100) numValue = 100;
        this.value = numValue;
    }
});

// Also validate on blur to handle edge cases
batchBlendRatio.addEventListener('blur', function() {
    if (this.value === '' || isNaN(this.value)) {
        this.value = 100; // Default to 100 if invalid
    } else {
        let numValue = parseInt(this.value);
        if (numValue < 0) numValue = 0;
        if (numValue > 100) numValue = 100;
        this.value = numValue;
    }
});

// Batch target files change is now handled by window.handleBatchTargetFilesChange via event_listeners.js

// Handle batch processing form submission
window.handleProcessBatchFormSubmit = async (e) => {
    console.log('Batch processing form submitted');
    e.preventDefault();
    window.showStatus(processBatchStatus, 'Starting batch processing...');
    
    // Hide file list during processing
    if (batchFileList) {
        batchFileList.style.display = 'none';
    }

    const formData = new FormData();
    const targetFiles = document.getElementById('batch-target-files').files;
    for (let i = 0; i < targetFiles.length; i++) {
        formData.append('target_files', targetFiles[i]);
    }
    
    // Check if stem separation is enabled
    const useStemSeparation = document.getElementById('batch-use-stem-separation');
    const isUsingStemSeparation = useStemSeparation && useStemSeparation.checked;
    
    let apiEndpoint = '/api/process_batch';
    
    if (isUsingStemSeparation) {
        // Stem mode batch processing
        apiEndpoint = '/api/process_batch_stems';
        
        const vocalPresetFile = document.getElementById('batch-vocal-preset-file').files[0];
        const instrumentalPresetFile = document.getElementById('batch-instrumental-preset-file').files[0];
        
        if (vocalPresetFile && instrumentalPresetFile) {
            formData.append('vocal_preset_file', vocalPresetFile);
            formData.append('instrumental_preset_file', instrumentalPresetFile);
        }
        
        // Add stem-specific blend ratios and gains
        const vocalBlendRatio = document.getElementById('batch-vocal-blend-ratio').value / 100.0;
        const instrumentalBlendRatio = document.getElementById('batch-instrumental-blend-ratio').value / 100.0;
        const vocalGain = document.getElementById('batch-vocal-gain').value;
        const instrumentalGain = document.getElementById('batch-instrumental-gain').value;
        
        formData.append('vocal_blend_ratio', vocalBlendRatio);
        formData.append('instrumental_blend_ratio', instrumentalBlendRatio);
        formData.append('vocal_gain_db', parseFloat(vocalGain));
        formData.append('instrumental_gain_db', parseFloat(instrumentalGain));
    } else {
        // Standard preset processing
        const presetFile = document.getElementById('batch-preset-file').files[0];
        if (presetFile) {
            formData.append('preset_file', presetFile);
        }
        
        // Add standard blend ratio
        const blendRatio = document.getElementById('batch-blend-ratio').value / 100.0;
        formData.append('blend_ratio', blendRatio);
    }
    
    // Add master gain (used in both modes)
    const masterGain = document.getElementById('batch-master-gain').value;
    if (isUsingStemSeparation) {
        formData.append('master_gain_db', parseFloat(masterGain));
    } else {
        formData.append('master_gain', parseFloat(masterGain));
    }
    
    // Add limiter setting  
    formData.append('apply_limiter', window.batchLimiterEnabled);

    try {
        const response = await fetch(apiEndpoint, {
            method: 'POST',
            body: formData,
        });
        const data = await response.json();

        if (response.ok) {
            batchProcessingJobId = data.batch_id;
            window.showStatus(processBatchStatus, 'Batch processing started. Monitoring progress...');
            pollBatchProgress(batchProcessingJobId);
        } else {
            window.showStatus(processBatchStatus, `Error: ${data.detail}`, true);
        }
    } catch (error) {
        window.showStatus(processBatchStatus, `Network error: ${error.message}`, true);
    }
};

// Create file list with initial pending status
function createFileList(files) {
    batchFilesContainer.innerHTML = '';
    for (let i = 0; i < files.length; i++) {
        const fileDiv = document.createElement('div');
        fileDiv.className = 'd-flex align-items-center gap-2 mb-2';
        fileDiv.id = `batch-file-${i}`;
        
        const statusIcon = document.createElement('span');
        statusIcon.className = 'batch-file-status';
        statusIcon.innerHTML = '☐'; // Empty checkbox
        statusIcon.style.fontSize = '16px';
        statusIcon.style.color = '#6c757d';
        
        const fileName = document.createElement('span');
        fileName.className = 'batch-file-name';
        fileName.textContent = files[i].name;
        fileName.style.color = '#f8f9fa';
        
        fileDiv.appendChild(statusIcon);
        fileDiv.appendChild(fileName);
        batchFilesContainer.appendChild(fileDiv);
    }
}

// Poll Batch Status
async function pollBatchProgress(batchId) {
    let lastProcessedCount = 0;
    
    // Show file list for progress tracking
    if (batchFileList) {
        batchFileList.style.display = 'block';
    }

    batchProcessingInterval = setInterval(async () => {
        try {
            const response = await fetch(`/api/batch_status/${batchId}`);
            const data = await response.json();

            // Update file statuses
            if (data.processed_count > lastProcessedCount) {
                // Mark completed files
                for (let i = lastProcessedCount; i < data.processed_count; i++) {
                    updateFileStatus(i, 'completed', data.output_files[i]);
                }
                
                // Mark current file as processing (if not the last one)
                if (data.processed_count < data.total_count) {
                    updateFileStatus(data.processed_count, 'processing');
                }
                
                lastProcessedCount = data.processed_count;
            } else if (data.processed_count === 0 && lastProcessedCount === 0) {
                // Mark first file as processing when batch just started
                updateFileStatus(0, 'processing');
            }

            if (data.status === 'completed') {
                clearInterval(batchProcessingInterval);
                batchProcessingInterval = null;
                window.showStatus(processBatchStatus, 'Batch processing completed successfully! All files are ready for download.');
                
                // Display download links in the file list using output_files
                if (data.output_files && Array.isArray(data.output_files)) {
                    data.output_files.forEach((outputPath, index) => {
                        updateFileStatus(index, 'completed', outputPath);
                    });
                }
            } else if (data.status === 'failed') {
                clearInterval(batchProcessingInterval);
                batchProcessingInterval = null;
                window.showStatus(processBatchStatus, `Batch processing failed: ${data.error}`, true);
            }
        } catch (error) {
            clearInterval(batchProcessingInterval);
            batchProcessingInterval = null;
            window.showStatus(processBatchStatus, `Network error: ${error.message}`, true);
        }
    }, 2000); // Poll every 2 seconds
}

// Update file status in the list
function updateFileStatus(fileIndex, status, outputPath = null) {
    const fileDiv = document.getElementById(`batch-file-${fileIndex}`);
    if (!fileDiv) return;

    const statusIcon = fileDiv.querySelector('.batch-file-status');
    const fileName = fileDiv.querySelector('.batch-file-name');

    switch (status) {
        case 'processing':
            statusIcon.innerHTML = '⏳'; // Hourglass
            statusIcon.style.color = '#ffc107'; // Warning yellow
            break;
        case 'completed':
            statusIcon.innerHTML = '✅'; // Checkmark
            statusIcon.style.color = '#28a745'; // Success green
            
            if (outputPath) {
                // Convert filename to download link
                const outputFilename = outputPath.split('/').pop();
                const link = document.createElement('a');
                link.href = `/download/output/${outputFilename}`;
                link.target = '_blank';
                link.textContent = outputFilename;
                link.className = 'text-light';
                link.style.textDecoration = 'none';
                
                // Replace filename with download link
                fileName.innerHTML = '';
                fileName.appendChild(link);
            }
            break;
    }
}

// Function to check and update batch process button visibility
function checkBatchProcessButtonVisibility() {
    const batchTargetFiles = document.getElementById('batch-target-files');
    const processBatchButton = document.getElementById('start-batch-button');
    
    console.log('Checking batch button visibility:', {
        batchTargetFiles: !!batchTargetFiles,
        processBatchButton: !!processBatchButton
    });
    
    if (!batchTargetFiles || !processBatchButton) {
        console.warn('Missing batch elements');
        return; // Exit if elements don't exist
    }
    
    const hasTargetFiles = batchTargetFiles.files.length > 0;
    
    // Check if stem separation is enabled
    const useStemSeparation = document.getElementById('batch-use-stem-separation');
    const isUsingStemSeparation = useStemSeparation && useStemSeparation.checked;
    
    let hasRequiredFiles = false;
    
    if (isUsingStemSeparation) {
        // Stem mode: need vocal + instrumental presets + target files
        const vocalPreset = document.getElementById('batch-vocal-preset-file');
        const instrumentalPreset = document.getElementById('batch-instrumental-preset-file');
        hasRequiredFiles = hasTargetFiles && vocalPreset && vocalPreset.files.length > 0 && 
                          instrumentalPreset && instrumentalPreset.files.length > 0;
    } else {
        // Standard preset mode - need preset file + target files
        const batchPresetFile = document.getElementById('batch-preset-file');
        hasRequiredFiles = hasTargetFiles && batchPresetFile && batchPresetFile.files.length > 0;
    }
    
    console.log('File status:', { hasTargetFiles, hasRequiredFiles, isUsingStemSeparation });
    
    // Show button only if all required files are selected
    if (hasRequiredFiles) {
        console.log('Showing batch button');
        processBatchButton.style.display = 'block';
    } else {
        console.log('Hiding batch button');
        processBatchButton.style.display = 'none';
    }
}

// Handle batch target files change
// Clear any active batch processing and reset UI state
function clearBatchProcessing() {
    // Stop any active polling
    if (batchProcessingInterval) {
        clearInterval(batchProcessingInterval);
        batchProcessingInterval = null;
    }
    
    // Clear status
    if (processBatchStatus) {
        processBatchStatus.innerHTML = '';
    }
    
    // Call server-side cleanup (don't await, fire and forget)
    if (batchProcessingJobId) {
        fetch('/api/cancel_batch_processing', { method: 'POST' })
            .catch(err => console.log('Cleanup request failed:', err));
    }
    
    // Clear job ID
    batchProcessingJobId = null;
    
    // Clear the file list container completely
    if (batchFilesContainer) {
        batchFilesContainer.innerHTML = '';
    }
    
    // Hide file list
    if (batchFileList) {
        batchFileList.style.display = 'none';
    }
}

window.handleBatchTargetFilesChange = function() {
    const targetFiles = this.files;
    
    // Clear any previous processing state
    clearBatchProcessing();
    
    if (targetFiles.length > 0) {
        // Show file list immediately with correct files
        createFileList(targetFiles);
        if (batchFileList) {
            batchFileList.style.display = 'block';
        }
    }
    
    // Update button visibility
    window.checkBatchProcessButtonVisibility();
};

// Toggle batch reference input visibility based on stem separation mode
function toggleBatchReferenceInput() {
    const useStemSeparation = document.getElementById('batch-use-stem-separation');
    const isUsingStemSeparation = useStemSeparation && useStemSeparation.checked;
    
    // Elements to control
    const standardPresetDiv = document.getElementById('batch-preset-file-div');
    const vocalPresetDiv = document.getElementById('batch-vocal-preset-file-div');
    const instrumentalPresetDiv = document.getElementById('batch-instrumental-preset-file-div');
    const standardBlendDiv = document.getElementById('batch-standard-blend-div');
    const stemControlsDiv = document.getElementById('batch-stem-controls');
    
    if (isUsingStemSeparation) {
        // Stem mode: show stem-specific controls
        if (standardPresetDiv) standardPresetDiv.style.display = 'none';
        if (vocalPresetDiv) vocalPresetDiv.style.display = 'block';
        if (instrumentalPresetDiv) instrumentalPresetDiv.style.display = 'block';
        if (standardBlendDiv) standardBlendDiv.style.display = 'none';
        if (stemControlsDiv) stemControlsDiv.style.display = 'block';
        
        // Remove required attribute from standard preset
        const standardPresetInput = document.getElementById('batch-preset-file');
        if (standardPresetInput) standardPresetInput.removeAttribute('required');
        
        // Add required attribute to stem presets
        const vocalPresetInput = document.getElementById('batch-vocal-preset-file');
        const instrumentalPresetInput = document.getElementById('batch-instrumental-preset-file');
        if (vocalPresetInput) vocalPresetInput.setAttribute('required', 'required');
        if (instrumentalPresetInput) instrumentalPresetInput.setAttribute('required', 'required');
    } else {
        // Standard mode: show standard controls
        if (standardPresetDiv) standardPresetDiv.style.display = 'block';
        if (vocalPresetDiv) vocalPresetDiv.style.display = 'none';
        if (instrumentalPresetDiv) instrumentalPresetDiv.style.display = 'none';
        if (standardBlendDiv) standardBlendDiv.style.display = 'block';
        if (stemControlsDiv) stemControlsDiv.style.display = 'none';
        
        // Add required attribute to standard preset
        const standardPresetInput = document.getElementById('batch-preset-file');
        if (standardPresetInput) standardPresetInput.setAttribute('required', 'required');
        
        // Remove required attribute from stem presets
        const vocalPresetInput = document.getElementById('batch-vocal-preset-file');
        const instrumentalPresetInput = document.getElementById('batch-instrumental-preset-file');
        if (vocalPresetInput) vocalPresetInput.removeAttribute('required');
        if (instrumentalPresetInput) instrumentalPresetInput.removeAttribute('required');
    }
    
    // Clear any active processing when settings change, but preserve file list
    // Stop any active polling
    if (batchProcessingInterval) {
        clearInterval(batchProcessingInterval);
        batchProcessingInterval = null;
    }
    
    // Clear status
    if (processBatchStatus) {
        processBatchStatus.innerHTML = '';
    }
    
    // Call server-side cleanup (don't await, fire and forget)
    if (batchProcessingJobId) {
        fetch('/api/cancel_batch_processing', { method: 'POST' })
            .catch(err => console.log('Cleanup request failed:', err));
    }
    
    // Clear job ID
    batchProcessingJobId = null;
    
    // Note: We don't clear the file list here to preserve selected files when toggling settings
    
    // Update button visibility
    window.checkBatchProcessButtonVisibility();
};

// Export variables and functions that need to be accessed globally
window.batchLimiterEnabled = true; // Default to enabled
window.checkBatchProcessButtonVisibility = checkBatchProcessButtonVisibility;
window.toggleBatchReferenceInput = toggleBatchReferenceInput;
window.clearBatchProcessing = clearBatchProcessing;

