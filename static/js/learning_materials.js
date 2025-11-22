let detector;

const content_div = document.getElementById('learning-content');
const class_div = document.getElementById('class-content');
const contents = document.getElementById('contents');
const blur_overlay = document.getElementById('blur-overlay');
const main_content = document.getElementById('main-content');
const instruction_div = document.getElementById('instruction');
const image_div = document.getElementById('class_image');
const specific_class = document.getElementById('specific-class');
const detector_header = document.getElementById('detector-header');

let currentItems = [];
let currentIndex = -1;
let currentCategory = '';
let currentclass = null;
let isWordsCategory = false;

// FSL Words specific variables
let motionBuffer = [];
let isCapturingMotion = false;
let processingInterval = null;
let socketio = null;
let fslHoldCounter = 0;  // Track consecutive correct predictions
let fslSuccessShown = false;  // Prevent showing success multiple times

document.addEventListener('DOMContentLoaded', async function() {
    // Determine category from URL
    const pathParts = window.location.pathname.split('/');
    currentCategory = pathParts[pathParts.length - 1] || pathParts[pathParts.length - 2] || '';
    isWordsCategory = currentCategory.toLowerCase() === 'words';
    
    console.log(`Category detected: ${currentCategory}, Is Words: ${isWordsCategory}`);
    
    if (isWordsCategory) {
        // for client-side processing
        initializeFSLWordsSocket();
        
        // for server-side processing
        detector = new SignLanguageDetector({
            isRoomMode: false,
            enableGameLogic: false,
            enableLearningMode: true,
            enableFpsCounter: true,
            useClientSideProcessing: false,
            processingInterval: 300,
            requireSocket: true,
            onCameraStart: function() {
                console.log('Camera started for FSL words');
            },
            onCameraStop: function() {
                console.log('Camera stopped for FSL words');
                stopFSLMotionCapture();
            }
        });
        
        console.log('✅ FSL Words mode initialized with server-side processing');
        
    } else {
        // for client-side processing
        detector = new SignLanguageDetector({
            isRoomMode: false,
            enableGameLogic: false,
            enableLearningMode: true,
            enableFpsCounter: true,
            useClientSideProcessing: true,
            processingInterval: 300,
            frameQuality: 0.8,
            requireSocket: false,
            onCameraStart: function() {
                console.log('Camera started in learning mode');
            },
            onCameraStop: function() {
                console.log('Camera stopped in learning mode');
            },
            onProcessingStart: function() {
                console.log('Processing started in learning mode - CLIENT SIDE');
            },
            onProcessingStop: function() {
                console.log('Processing stopped in learning mode');
            },
            onLearningSuccess: function(target) {
                console.log(`Learning success: ${target} performed correctly!`);
            },
            onPrediction: function(data) {
                console.log('Learning prediction:', data.prediction, 'Confidence:', data.confidence);
                updateLearningProgress(data);
            }
        });
        
        console.log('✅ Alphabet/Numbers mode initialized with client-side processing');
        
        await loadModelForCategory();

        // verify client-side processing is active
        if (detector.isClientSideProcessing()) {
            console.log('✅ Client-side processing confirmed active');
        } else {
            console.error('❌ Client-side processing NOT active - check initialization');
        }
    }
    initializeItems();
});

function initializeFSLWordsSocket() {
    /*Initialize Socket.IO for FSL words server-side processing*/

    socketio = io();
    
    socketio.on('connect', () => {
        console.log('✅ Connected to FSL processing server (independent learning)');
        socketio.emit('join_fsl_learning');
    });
    
    socketio.on('prediction_result', (data) => {
        console.log('FSL prediction:', data);
        handleFSLPrediction(data);
    });
    
    socketio.on('supported_signs', (data) => {
        console.log('Supported FSL words:', data.signs);
    });
    
    socketio.on('error', (data) => {
        console.error('FSL server error:', data.message);
    });
    
    socketio.on('disconnect', () => {
        console.log('Disconnected from FSL processing server');
    });
    
    socketio.emit('get_supported_signs');
}

function handleFSLPrediction(data) {
    /*Handle FSL words predictions from server*/

    const predictionDiv = document.getElementById('prediction');
    const confidenceDiv = document.getElementById('confidence');
    const confidenceBar = document.getElementById('confidenceBar');
    
    if (!predictionDiv || !confidenceDiv || !confidenceBar) return;
    
    predictionDiv.textContent = data.prediction || 'No gesture';
    
    const confidencePercent = Math.round((data.confidence || 0) * 100);
    confidenceDiv.textContent = confidencePercent + '%';
    confidenceBar.style.width = confidencePercent + '%';

    if (data.prediction && data.prediction.includes('Collecting')) {
        // Still collecting motion
        predictionDiv.style.color = '#FFA500';
        predictionDiv.style.fontWeight = 'normal';
        confidenceBar.style.background = 'linear-gradient(90deg, #FFA500, #FFD700)';
        
        fslSuccessShown = false;
        
    } else if (data.prediction === 'No hands detected') {
        // No hands
        predictionDiv.style.color = '#999';
        predictionDiv.style.fontWeight = 'normal';
        confidenceBar.style.background = '#e9ecef';
        
    } else {
        const targetLower = currentclass ? currentclass.toLowerCase() : '';
        const predictionLower = data.prediction ? data.prediction.toLowerCase() : '';
        const isMatch = targetLower.includes(predictionLower) || predictionLower.includes(targetLower);
        const hasConfidence = confidencePercent >= 25;
        
        if (isMatch && hasConfidence) {
            // Correct gesture
            predictionDiv.style.color = '#4CAF50';
            predictionDiv.style.fontWeight = 'bold';
            confidenceBar.style.background = 'linear-gradient(90deg, #4CAF50, #45a049)';

            // Show success immediately
            if (!fslSuccessShown) {
                console.log('🎉 Showing success notification...');
                showFSLSuccess();
                fslSuccessShown = true;
                
                // Reset after 5 seconds
                setTimeout(() => {
                    fslSuccessShown = false;
                    console.log('✨ Ready to show success again');
                }, 5000);
            }
            
        } else {
            predictionDiv.style.color = '#007bff';
            predictionDiv.style.fontWeight = 'normal';
            confidenceBar.style.background = 'linear-gradient(90deg, #007bff, #0056b3)';
        }
    }        
}

function showFSLSuccess() {
    const notification = document.createElement('div');
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: linear-gradient(135deg, #4CAF50, #45a049);
        color: white;
        padding: 15px 20px;
        border-radius: 10px;
        box-shadow: 0 4px 6px rgba(0,0,0,0.1);
        z-index: 10000;
        font-size: 16px;
        font-weight: bold;
        font-family: "Gantari", sans-serif;
        animation: slideIn 0.3s ease-out;
    `;
    
    notification.innerHTML = `
        🎉 Well Done! 
        <br>
        <small>You performed "${currentclass}" correctly!</small>
    `;
    
    if (!document.getElementById('learningSuccessStyles')) {
        const style = document.createElement('style');
        style.id = 'learningSuccessStyles';
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
    }, 3000);
    
    console.log(`🎉 Success notification shown for: ${currentclass}`);
}

function startFSLMotionCapture() {
    if (isCapturingMotion) return;
    
    isCapturingMotion = true;
    motionBuffer = [];
    
    processingInterval = setInterval(() => {
        captureFSLFrame();
    }, 333); // ~3 FPS
}

function stopFSLMotionCapture() {
    if (processingInterval) {
        clearInterval(processingInterval);
        processingInterval = null;
    }
    
    isCapturingMotion = false;
    motionBuffer = [];
    
    fslHoldCounter = 0;
    fslSuccessShown = false;
}

async function captureFSLFrame() {
    // capture 1 frame
    if (!detector || !detector.elements.videoElement) return;
    
    const videoElement = detector.elements.videoElement;
    if (!videoElement.videoWidth || !videoElement.videoHeight) return;
    
    try {
        const canvas = document.createElement('canvas');
        canvas.width = videoElement.videoWidth;
        canvas.height = videoElement.videoHeight;
        
        const ctx = canvas.getContext('2d');
        ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
        
        const imageData = canvas.toDataURL('image/jpeg', 0.8);
        
        if (socketio && socketio.connected) {
            socketio.emit('process_fsl_frame', {
                image: imageData,
                timestamp: Date.now()
            });
        }
    } catch (error) {
        console.error('Error capturing FSL frame:', error);
    }
}

async function loadModelForCategory() {
    if (isWordsCategory) {
        console.log('Words category - using server-side processing');
        return;
    }
    
    if (!detector || !detector.clientSideClassifier) {
        console.error('Detector or classifier not initialized');
        return;
    }
    
    let modelType = 'alphabet'; // default
    
    if (currentCategory.toLowerCase().includes('number')) {
        modelType = 'number';
    } else if (currentCategory.toLowerCase().includes('alphabet') || 
               currentCategory.toLowerCase().includes('letter')) {
        modelType = 'alphabet';
    }
    
    const success = await detector.setModelType(modelType);
    
    if (!success) {
        alert(`Failed to load ${modelType} recognition model. Please refresh the page.`);
    }
}

function updateLearningProgress(data) {
    if (currentclass && data.prediction === currentclass) {
        const predictionDiv = document.getElementById('prediction');
        if (predictionDiv) {
            predictionDiv.style.color = '#4CAF50';
            predictionDiv.style.fontWeight = 'bold';
        }
    } else {
        const predictionDiv = document.getElementById('prediction');
        if (predictionDiv) {
            predictionDiv.style.color = '#333';
            predictionDiv.style.fontWeight = 'normal';
        }
    }
}

async function tryityourself() {
    if (content_div) {
        content_div.style.display = 'flex';
        detector_header.textContent = '';
        
        const categoryDisplay = currentCategory.charAt(0).toUpperCase() + currentCategory.slice(1).toLowerCase();
        detector_header.textContent = `Try to perform: ${currentclass}`;
        class_div.style.display = 'none';

        if (isWordsCategory) {
            await detector.startCamera();
            startFSLMotionCapture();
            
        } else {
            // Alphabet/Numbers - client-side processing
            await loadModelForCategory();
            
            if (currentclass) {
                detector.setLearningTarget(currentclass);
            }

            await detector.startCamera();
            detector.startProcessing();
        }
        
        class_div.style.display = 'none';
    }
}

function closecontent() {
    if (class_div) {
        class_div.style.display = 'none';
        main_content.classList.remove('blurred');
        blur_overlay.style.display = 'none';
        
        if (detector) {
            detector.stopCamera();
        }
        
        if (isWordsCategory) {
            stopFSLMotionCapture();
        }

        currentItems.forEach(item => {
            item.buttonElement.classList.remove('active-button');
        });
    }
}

function closedetector() {
    if (content_div) {
        content_div.style.display = 'none';
        
        if (detector) {
            detector.stopCamera();
            
            if (!isWordsCategory) {
                detector.resetLearningState();
            }
        }
        
        if (isWordsCategory) {
            stopFSLMotionCapture();
        }
        
        class_div.style.display = 'flex';
    }
}

blur_overlay.addEventListener('click', () => {
    closecontent();
    closedetector();
    currentItems.forEach(item => {
        item.buttonElement.classList.remove('active-button');
    });
});

function back() {
    if (isWordsCategory) {
        stopFSLMotionCapture();
    }
    window.location.href = `${window.location.origin}/learn/`;
}

function initializeItems() {
    const classButtons = document.querySelectorAll('.class-btn');
    currentItems = [];
    
    classButtons.forEach((button, index) => {
        const onclick = button.getAttribute('onclick');
        const match = onclick.match(/matcontent\('([^']+)',\s*'([^']+)',\s*'([^']+)',\s*'([^']+)'\)/);   

        if (match) {
            currentItems.push({
                class: match[1],
                instruction: match[2],
                image_path: match[3],
                category: match[4],
                buttonElement: button
            });
        }
    });
    
    console.log('Initialized items:', currentItems);
    console.log('Current category:', currentCategory);
    console.log('Is words category:', isWordsCategory);
}

function matcontent(asl_clas, instruction, image_path, category) { 
    currentIndex = currentItems.findIndex(item => 
        item.class === asl_clas && 
        item.instruction === instruction && 
        item.image_path === image_path
    );
    
    currentclass = asl_clas;
    
    if (class_div) {
        class_div.style.display = 'flex';
        blur_overlay.style.display = 'block';
        main_content.classList.add('blurred');
        specific_class.textContent = category + ' ' + asl_clas;

        instruction_div.textContent = instruction;
        image_div.innerHTML = `<img src="/static/${image_path}" alt="${asl_clas}" class="hand_image">`;
    }
}

function next() {
    if (currentItems.length === 0) {
        console.log('No items available');
        return;
    }
    
    currentIndex = (currentIndex + 1) % currentItems.length;
    const nextItem = currentItems[currentIndex];
    
    matcontent(
        nextItem.class,
        nextItem.instruction,
        nextItem.image_path,
        nextItem.category
    );
    
    highlightCurrentButton();
}

function previous() {
    if (currentItems.length === 0) {
        console.log('No items available');
        return;
    }
    
    currentIndex = currentIndex <= 0 ? currentItems.length - 1 : currentIndex - 1;
    const prevItem = currentItems[currentIndex];
    
    matcontent(
        prevItem.class,
        prevItem.instruction,
        prevItem.image_path,
        prevItem.category
    );
    
    highlightCurrentButton();
}

function highlightCurrentButton() {
    currentItems.forEach(item => {
        item.buttonElement.classList.remove('active-button');
    });
    
    if (currentIndex >= 0 && currentIndex < currentItems.length) {
        currentItems[currentIndex].buttonElement.classList.add('active-button');
    }
}

// Keyboard navigation
document.addEventListener('keydown', function(event) {
    if (class_div && class_div.style.display === 'flex') {
        if (event.key === 'ArrowRight' || event.key === 'n' || event.key === 'N') {
            next();
            event.preventDefault();
        } else if (event.key === 'ArrowLeft' || event.key === 'p' || event.key === 'P') {
            previous();
            event.preventDefault();
        } else if (event.key === 'Escape') {
            closecontent();
            event.preventDefault();
        }
    }
});

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
    if (isWordsCategory) {
        stopFSLMotionCapture();
        if (socketio && socketio.connected) {
            socketio.emit('leave_fsl_learning');
            socketio.disconnect();
        }
    }
    
    if (detector) {
        detector.stopCamera();
    }
});