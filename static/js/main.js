// Standalone main.js - purely client-side, no socket connection needed
let detector;

document.addEventListener('DOMContentLoaded', function() {
    // Initialize detector with standalone configuration
    detector = new SignLanguageDetector({
        isRoomMode: false,                // No room sync needed
        enableGameLogic: false,          // No game functionality
        enableLearningMode: false,       // Just general translation
        enableFpsCounter: true,
        processingInterval: 300,
        frameQuality: 0.8,
        requireSocket: true,
        onCameraStart: function() {
            console.log('Camera started in standalone translator mode');
        },
        onCameraStop: function() {
            console.log('Camera stopped in standalone translator mode');
        },
        onProcessingStart: function() {
            console.log('Processing started in standalone translator mode');
        },
        onProcessingStop: function() {
            console.log('Processing stopped in standalone translator mode');
        },
        onPrediction: function(data) {
            // Custom prediction handling for main translator
            console.log('Prediction received:', data.prediction, 'Confidence:', data.confidence);
            
            // You can add custom UI updates here if needed
            updateTranslatorDisplay(data);
        }
    });
    
    console.log('Standalone translator initialized - no server communication needed');
});

// Custom UI update function for translator
function updateTranslatorDisplay(data) {
    // Add any custom display logic here
    // The basic prediction display is already handled by the detector
    
    // Example: Custom confidence color coding
    const confidenceBar = document.getElementById('confidenceBar');
    if (confidenceBar) {
        const confidence = Math.round(data.confidence * 100);
        if (confidence > 70) {
            confidenceBar.style.backgroundColor = '#4CAF50'; // Green
        } else if (confidence > 40) {
            confidenceBar.style.backgroundColor = '#FF9800'; // Orange
        } else {
            confidenceBar.style.backgroundColor = '#F44336'; // Red
        }
    }
}