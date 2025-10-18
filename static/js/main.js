// main.js - Practice page with client-side processing for alphabet/numbers
let detector;
let currentModel = null;

document.addEventListener('DOMContentLoaded', function() {
    const selectModelDropdown = document.getElementById('select-model');
    
    // Disable detection button until model is selected
    const toggleProcessingBtn = document.getElementById('toggleProcessing');
    if (toggleProcessingBtn) {
        toggleProcessingBtn.disabled = true;
    }
    
    // Initialize detector with client-side processing (for alphabet/numbers)
    detector = new SignLanguageDetector({
        isRoomMode: false,
        enableGameLogic: false,
        enableLearningMode: false,
        enableFpsCounter: true,
        processingInterval: 300,
        useClientSideProcessing: true,  // 🔥 Client-side for alphabet/numbers
        requireSocket: false,  // 🔥 No socket needed for alphabet/numbers
        onCameraStart: function() {
            console.log('Camera started in practice mode');
        },
        onCameraStop: function() {
            console.log('Camera stopped in practice mode');
        },
        onProcessingStart: function() {
            console.log('Processing started in practice mode');
        },
        onProcessingStop: function() {
            console.log('Processing stopped in practice mode');
        },
        onPrediction: function(data) {
            console.log('Prediction:', data.prediction, 'Confidence:', data.confidence);
        }
    });
    
    // Handle model selection
    if (selectModelDropdown) {
        selectModelDropdown.addEventListener('change', async function(event) {
            const selectedModel = event.target.value;
            
            if (!selectedModel) return;
            
            console.log(`Selected model: ${selectedModel}`);
            
            if (selectedModel === 'word') {
                // Words not supported in practice mode (needs motion capture)
                alert('⚠️ Words are not supported in Practice mode.\n\nWords require motion capture over multiple frames.\nPlease use the Learn section for word practice.');
                selectModelDropdown.value = '';
                return;
            }
            
            // Load the selected model (alphabet or number) on client-side
            if (detector && detector.clientSideClassifier) {
                console.log(`Loading ${selectedModel} model...`);
                
                const success = await detector.setModelType(selectedModel);
                
                if (success) {
                    currentModel = selectedModel;
                    
                    // Update class names based on model
                    if (selectedModel === 'number') {
                        detector.asl_classes = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];
                        console.log('🔢 Using numbers');
                    } else if (selectedModel === 'alphabet') {
                        detector.customClassNames = {
                            '0': 'A', '1': 'B', '2': 'C', '3': 'D', '4': 'E', '5': 'F',
                            '6': 'G', '7': 'H', '8': 'I', '9': 'K', '10': 'L', '11': 'M',
                            '12': 'N', '13': 'O', '14': 'P', '15': 'Q', '16': 'R', '17': 'S',
                            '18': 'T', '19': 'U', '20': 'V', '21': 'W', '22': 'X', '23': 'Y'
                        };
                        detector.asl_classes = Object.values(detector.customClassNames);
                        console.log('🔤 Using alphabet');
                    }
                    
                    // Enable detection button
                    if (toggleProcessingBtn) {
                        toggleProcessingBtn.disabled = false;
                    }
                    
                    // Show notification
                    showModelSwitchNotification(selectedModel);
                    
                    console.log(`✅ Loaded ${selectedModel} model successfully`);
                } else {
                    console.error(`❌ Failed to load ${selectedModel} model`);
                    alert(`Failed to load ${selectedModel} model. Please refresh the page.`);
                    selectModelDropdown.value = '';
                }
            } else {
                console.error('Detector or classifier not available');
                alert('Detector not ready. Please refresh the page.');
            }
        });
    }
    
    console.log('Practice mode initialized with client-side processing');
});

function showModelSwitchNotification(modelType) {
    /**
     * Show notification when model is switched
     */
    const notification = document.createElement('div');
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: linear-gradient(135deg, #007bff, #0056b3);
        color: white;
        padding: 12px 16px;
        border-radius: 8px;
        box-shadow: 0 4px 6px rgba(0,0,0,0.1);
        z-index: 5000;
        font-size: 14px;
        font-weight: bold;
        animation: slideIn 0.3s ease-out;
    `;
    
    const modelDisplay = modelType.charAt(0).toUpperCase() + modelType.slice(1);
    notification.textContent = `📚 Now using: ${modelDisplay}`;
    
    // Add animation styles if not present
    if (!document.getElementById('notificationStyles')) {
        const style = document.createElement('style');
        style.id = 'notificationStyles';
        style.textContent = `
            @keyframes slideIn {
                from { transform: translateX(100%); opacity: 0; }
                to { transform: translateX(0); opacity: 1; }
            }
            @keyframes slideOut {
                from { transform: translateX(0); opacity: 1; }
                to { transform: translateX(100%); opacity: 0; }
            }
        `;
        document.head.appendChild(style);
    }
    
    document.body.appendChild(notification);
    
    // Remove after 2 seconds
    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease-in';
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 300);
    }, 2000);
}

function profile(username) {
    window.location.href = `/profile/${username}`;
}