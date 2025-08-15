let detector;

document.addEventListener('DOMContentLoaded', function() {
    // Initialize detector with main page configuration
    detector = new SignLanguageDetector({
        isRoomMode: false,
        enableGameLogic: false,
        enableFpsCounter: true,
        processingInterval: 300,
        frameQuality: 0.8,
        onCameraStart: function() {
            console.log('Camera started in main translator mode');
        },
        onCameraStop: function() {
            console.log('Camera stopped in main translator mode');
        },
        onProcessingStart: function() {
            console.log('Processing started in main translator mode');
        },
        onProcessingStop: function() {
            console.log('Processing stopped in main translator mode');
        },
        onPrediction: function(data) {
            // Custom prediction handling for main page if needed
            console.log('Prediction received:', data.prediction, 'Confidence:', data.confidence);
        }
    });
    
    console.log('Main translator initialized with unified detector');
});