let detector;
let currentModel = null;

document.addEventListener('DOMContentLoaded', function() {
    const selectModelDropdown = document.getElementById('select-model');
    
    // Initialize detector with client-side processing (for alphabet/numbers)
    detector = new SignLanguageDetector({
        isRoomMode: false,
        enableGameLogic: false,
        enableLearningMode: false,
        enableFpsCounter: true,
        processingInterval: 300,
        useClientSideProcessing: true,
        requireSocket: false,
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
    
    // model selection
    if (selectModelDropdown) {
        selectModelDropdown.addEventListener('change', async function(event) {
            const selectedModel = event.target.value;
            
            if (!selectedModel) return;
            
            // load model
            if (detector && detector.clientSideClassifier) {
                console.log(`Loading ${selectedModel} model...`);
                
                const success = await detector.setModelType(selectedModel);
                
                if (success) {
                    currentModel = selectedModel;
                    
                    // class names based on model
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
                    
                    if (toggleProcessingBtn) {
                        toggleProcessingBtn.disabled = false;
                    }
                    
                    // notif
                    showModelSwitchNotification(selectedModel);
                    
                    console.log(`✅ Loaded ${selectedModel} model successfully`);
                } else {
                    alert(`Failed to load ${selectedModel} model. Please refresh the page.`);
                    selectModelDropdown.value = '';
                }
            } else {
                alert('Detector not ready. Please refresh the page.');
            }
        });
    }
});

function showModelSwitchNotification(modelType) {
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
    window.location.href = `${window.location.origin}/profile/${username}`;
}

function dashboard() {
    window.location.href = `${window.location.origin}/admin/dashboard`;
}