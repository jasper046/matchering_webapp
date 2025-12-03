
// preset_management.js

// --- Create Preset Section ---
const createPresetForm = document.getElementById('create-preset-form');
const createPresetStatus = document.getElementById('create-preset-status');
const createPresetDownloadDiv = document.getElementById('create-preset-download');
const presetDownloadLinkContainer = document.getElementById('preset-download-link-container');

let generatedPresetPath = '';
let suggestedPresetFilename = ''; // New variable to store suggested filename

// Helper function to create download links that don't cause page navigation
function createDownloadLink(href, text, title = '', className = 'btn btn-outline-primary btn-sm', downloadFilename = '') {
    const link = document.createElement('a');
    link.href = href;
    link.className = className;
    link.innerHTML = text;
    if (title) link.title = title;
    if (downloadFilename) link.download = downloadFilename;

    // Prevent default navigation and trigger download programmatically
    const handleDownload = function(e) {
        console.log('Download link activated, preventing default navigation', e.type, href);
        e.preventDefault();
        e.stopPropagation(); // Stop event bubbling
        e.stopImmediatePropagation(); // Stop other handlers

        // Log current UI state before download
        console.log('UI state before download:');
        const resultSection = document.getElementById('single-conversion-results');
        console.log('single-conversion-results visible:', resultSection ? resultSection.style.display : 'not found');

        // Use window.open to avoid beforeunload events
        // Add a small delay to ensure event handlers complete
        setTimeout(() => {
            console.log('Attempting to open download in new tab...');
            const newWindow = window.open(href, '_blank');
            if (!newWindow || newWindow.closed || typeof newWindow.closed === 'undefined') {
                // Popup blocked or failed, try direct download
                console.log('Popup blocked, trying direct download');
                const tempLink = document.createElement('a');
                tempLink.href = href;
                if (downloadFilename) tempLink.download = downloadFilename;
                tempLink.style.display = 'none';
                document.body.appendChild(tempLink);
                console.log('Triggering tempLink.click()...');
                tempLink.click();
                setTimeout(() => {
                    document.body.removeChild(tempLink);
                    console.log('tempLink removed');
                }, 100);
            } else {
                console.log('Download opened in new tab successfully');
            }

            // Check UI state after a short delay
            setTimeout(() => {
                console.log('UI state after download attempt:');
                console.log('single-conversion-results visible:', resultSection ? resultSection.style.display : 'not found');
            }, 500);
        }, 10);
    };

    link.addEventListener('click', handleDownload);
    link.addEventListener('keydown', function(e) {
        // Handle Enter or Space key
        if (e.key === 'Enter' || e.key === ' ' || e.keyCode === 13 || e.keyCode === 32) {
            handleDownload(e);
        }
    });

    return link;
}

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
            const downloadUrl = `/download/preset/${generatedPresetPath.split('/').pop()}?download_name=${encodeURIComponent(suggestedPresetFilename)}`;
            const link = createDownloadLink(downloadUrl, suggestedPresetFilename, 'Download preset', 'alert-link', suggestedPresetFilename);

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
window.createDownloadLink = createDownloadLink;

// Show preset download links for both stem and non-stem processing
function showPresetDownloadLinks() {
    console.log('showPresetDownloadLinks called');
    const processSingleStatus = document.getElementById('process-single-status');
    if (!processSingleStatus) {
        console.error('process-single-status element not found');
        return;
    }

    const vocalPresetPath = processSingleStatus.dataset.vocalPresetPath;
    const instrumentalPresetPath = processSingleStatus.dataset.instrumentalPresetPath;
    const vocalPresetFilename = processSingleStatus.dataset.vocalPresetFilename;
    const instrumentalPresetFilename = processSingleStatus.dataset.instrumentalPresetFilename;

    const createdPresetPath = processSingleStatus.dataset.createdPresetPath;
    const createdPresetFilename = processSingleStatus.dataset.createdPresetFilename;

    console.log('Preset data:', {
        vocalPresetPath,
        instrumentalPresetPath,
        vocalPresetFilename,
        instrumentalPresetFilename,
        createdPresetPath,
        createdPresetFilename
    });

    // Check if we have presets to show
    const hasStemPresets = (vocalPresetPath && instrumentalPresetPath);
    const hasStandardPreset = (createdPresetPath);

    console.log('hasStemPresets:', hasStemPresets, 'hasStandardPreset:', hasStandardPreset);

    if (hasStemPresets || hasStandardPreset) {
        // Find or create preset download section
        let presetDownloadSection = document.getElementById('preset-download-section');
        if (!presetDownloadSection) {
            presetDownloadSection = document.createElement('div');
            presetDownloadSection.id = 'preset-download-section';
            presetDownloadSection.className = 'mt-4 p-3 bg-secondary rounded';
            
            // Determine description text and header based on preset type
            const headerText = hasStemPresets 
                ? "📥 Download Reference Presets"
                : "📥 Download Reference Preset";
            const descriptionText = hasStemPresets 
                ? "These presets were created from your reference audio's separated stems. You can use them for future processing!"
                : "This preset was created from your reference audio. You can use it for future processing!";
            
            presetDownloadSection.innerHTML = `
                <h5 class="text-light mb-3">${headerText}</h5>
                <div class="alert alert-info">
                    <small>${descriptionText}</small>
                </div>
                <div id="preset-download-links" class="d-flex flex-wrap gap-3"></div>
            `;
            
            // Insert before the waveform section
            const waveformSection = document.querySelector('.channel-box');
            if (waveformSection) {
                waveformSection.parentNode.insertBefore(presetDownloadSection, waveformSection);
            }
        } else {
            // Update existing section with correct header and description
            const headerText = hasStemPresets 
                ? "📥 Download Reference Presets"
                : "📥 Download Reference Preset";
            const descriptionText = hasStemPresets 
                ? "These presets were created from your reference audio's separated stems. You can use them for future processing!"
                : "This preset was created from your reference audio. You can use it for future processing!";
            
            const headerDiv = presetDownloadSection.querySelector('h5');
            if (headerDiv) {
                headerDiv.textContent = headerText;
            }
            
            const alertDiv = presetDownloadSection.querySelector('.alert.alert-info small');
            if (alertDiv) {
                alertDiv.textContent = descriptionText;
            }
        }
        
        // Create download links
        const linksContainer = document.getElementById('preset-download-links');
        linksContainer.innerHTML = '';
        
        if (hasStemPresets) {
            // Vocal preset link
            const vocalDownloadUrl = `/download/preset/${vocalPresetPath.split('/').pop()}?download_name=${encodeURIComponent(vocalPresetFilename)}`;
            const vocalLink = (typeof createDownloadLink === 'function' ? createDownloadLink : window.createDownloadLink)(
                vocalDownloadUrl, '🎤 ' + vocalPresetFilename, 'Download vocal preset', 'btn btn-outline-primary btn-sm', vocalPresetFilename
            );

            // Instrumental preset link
            const instrumentalDownloadUrl = `/download/preset/${instrumentalPresetPath.split('/').pop()}?download_name=${encodeURIComponent(instrumentalPresetFilename)}`;
            const instrumentalLink = (typeof createDownloadLink === 'function' ? createDownloadLink : window.createDownloadLink)(
                instrumentalDownloadUrl, '🎹 ' + instrumentalPresetFilename, 'Download instrumental preset', 'btn btn-outline-primary btn-sm', instrumentalPresetFilename
            );

            linksContainer.appendChild(vocalLink);
            linksContainer.appendChild(instrumentalLink);
        } else if (hasStandardPreset) {
            // Standard preset link
            const standardDownloadUrl = `/download/preset/${createdPresetPath.split('/').pop()}?download_name=${encodeURIComponent(createdPresetFilename)}`;
            const standardLink = (typeof createDownloadLink === 'function' ? createDownloadLink : window.createDownloadLink)(
                standardDownloadUrl, '🎵 ' + createdPresetFilename, 'Download preset', 'btn btn-outline-primary btn-sm', createdPresetFilename
            );

            linksContainer.appendChild(standardLink);
        }
    }
}
    
