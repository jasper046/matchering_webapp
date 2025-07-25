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

// Helper function to check if we're in stem mode
function isCurrentlyStemMode() {
    return document.getElementById('vocal-channel').style.display !== 'none';
}

// Export functions that need to be accessed globally
window.showStatus = showStatus;
window.toggleLimiter = toggleLimiter;
window.isCurrentlyStemMode = isCurrentlyStemMode;
window.limiterEnabled = true; // Default to enabled
window.batchLimiterEnabled = true; // Default to enabled