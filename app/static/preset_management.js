
// preset_management.js

// --- Create Preset Section ---
const createPresetForm = document.getElementById('create-preset-form');
const createPresetStatus = document.getElementById('create-preset-status');
const createPresetDownloadDiv = document.getElementById('create-preset-download');
const presetDownloadLinkContainer = document.getElementById('preset-download-link-container');

let generatedPresetPath = '';
let suggestedPresetFilename = ''; // New variable to store suggested filename

createPresetForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    // Prevent submission during active processing
    if (window.isProcessing) { // Use global isProcessing from processing_logic.js
        window.showStatus(createPresetStatus, 'Please wait for current processing to complete.', true);
        return;
    }
    
    window.showStatus(createPresetStatus, 'Creating preset...');
    createPresetDownloadDiv.style.display = 'none';
    presetDownloadLinkContainer.innerHTML = ''; // Clear previous link

    const referenceFile = document.getElementById('reference-file-preset').files[0];

    const formData = new FormData();
    formData.append('reference_file', referenceFile);

    try {
        const response = await fetch('/api/create_preset', {
            method: 'POST',
            body: formData,
        });
        const data = await response.json();
        if (response.ok) {
            window.showStatus(createPresetStatus, `Preset created.`);
            generatedPresetPath = data.preset_path;
            suggestedPresetFilename = data.suggested_filename; // Store suggested filename

            // Generate and display the download link
            const link = document.createElement('a');
            link.href = `/download/preset/${generatedPresetPath.split('/').pop()}?download_name=${encodeURIComponent(suggestedPresetFilename)}`;
            link.download = suggestedPresetFilename; // Suggest filename for download
            link.textContent = suggestedPresetFilename; // Only filename as link text
            link.className = 'alert-link'; // Apply Bootstrap link styling
            
            const instructionText = document.createTextNode(' (Right Click to Save As)');

            presetDownloadLinkContainer.appendChild(link);
            presetDownloadLinkContainer.appendChild(instructionText);
            createPresetDownloadDiv.style.display = 'block';

        } else {
            window.showStatus(createPresetStatus, `Error: ${data.detail}`, true);
        }
    } catch (error) {
        window.showStatus(createPresetStatus, `Network error: ${error.message}`, true);
    }
});

// Export functions that need to be accessed globally
window.showPresetDownloadLinks = showPresetDownloadLinks;

// Show preset download links for both stem and non-stem processing
function showPresetDownloadLinks() {
    const processSingleStatus = document.getElementById('process-single-status');
    const vocalPresetPath = processSingleStatus.dataset.vocalPresetPath;
    const instrumentalPresetPath = processSingleStatus.dataset.instrumentalPresetPath;
    const vocalPresetFilename = processSingleStatus.dataset.vocalPresetFilename;
    const instrumentalPresetFilename = processSingleStatus.dataset.instrumentalPresetFilename;
    
    const createdPresetPath = processSingleStatus.dataset.createdPresetPath;
    const createdPresetFilename = processSingleStatus.dataset.createdPresetFilename;
    
    // Check if we have presets to show
    const hasStemPresets = (vocalPresetPath && instrumentalPresetPath);
    const hasStandardPreset = (createdPresetPath);
    
    if (hasStemPresets || hasStandardPreset) {
        // Find or create preset download section
        let presetDownloadSection = document.getElementById('preset-download-section');
        if (!presetDownloadSection) {
            presetDownloadSection = document.createElement('div');
            presetDownloadSection.id = 'preset-download-section';
            presetDownloadSection.className = 'mt-4 p-3 bg-secondary rounded';
            presetDownloadSection.innerHTML = `
                <h5 class="text-light mb-3">📥 Download Reference Presets</h5>
                <div class="alert alert-info">
                    <small>These presets were created from your reference audio's separated stems. You can use them for future processing!</small>
                </div>
                <div id="preset-download-links" class="d-flex flex-wrap gap-3"></div>
            `;
            
            // Insert before the waveform section
            const waveformSection = document.querySelector('.channel-box');
            if (waveformSection) {
                waveformSection.parentNode.insertBefore(presetDownloadSection, waveformSection);
            }
        }
        
        // Create download links
        const linksContainer = document.getElementById('preset-download-links');
        linksContainer.innerHTML = '';
        
        if (hasStemPresets) {
            // Vocal preset link
            const vocalLink = document.createElement('a');
            vocalLink.href = `/download/preset/${vocalPresetPath.split('/').pop()}?download_name=${encodeURIComponent(vocalPresetFilename)}`;
            vocalLink.className = 'btn btn-outline-primary btn-sm';
            vocalLink.innerHTML = '🎤 ' + vocalPresetFilename;
            vocalLink.title = 'Download vocal preset';
            
            // Instrumental preset link
            const instrumentalLink = document.createElement('a');
            instrumentalLink.href = `/download/preset/${instrumentalPresetPath.split('/').pop()}?download_name=${encodeURIComponent(instrumentalPresetFilename)}`;
            instrumentalLink.className = 'btn btn-outline-primary btn-sm';
            instrumentalLink.innerHTML = '🎹 ' + instrumentalPresetFilename;
            instrumentalLink.title = 'Download instrumental preset';
            
            linksContainer.appendChild(vocalLink);
            linksContainer.appendChild(instrumentalLink);
        } else if (hasStandardPreset) {
            // Standard preset link
            const standardLink = document.createElement('a');
            standardLink.href = `/download/preset/${createdPresetPath.split('/').pop()}?download_name=${encodeURIComponent(createdPresetFilename)}`;
            standardLink.className = 'btn btn-outline-primary btn-sm';
            standardLink.innerHTML = '🎵 ' + createdPresetFilename;
            standardLink.title = 'Download preset';
            
            linksContainer.appendChild(standardLink);
        }
    }
}
    const processBatchForm = document.getElementById('process-batch-form');
    if (processBatchForm) {
        processBatchForm.addEventListener('submit', window.handleProcessBatchFormSubmit);
    }
