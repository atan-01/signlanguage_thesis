// Enhanced learning_materials.js with alphabet/number model support
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

document.addEventListener('DOMContentLoaded', async function() {
    // Initialize detector with client-side processing for learning mode
    detector = new SignLanguageDetector({
        isRoomMode: false,
        enableGameLogic: false,
        enableLearningMode: true,
        enableFpsCounter: true,
        useClientSideProcessing: true,  // 🔥 CRITICAL: Use client-side processing
        processingInterval: 300,
        frameQuality: 0.8,
        requireSocket: false,  // 🔥 CRITICAL: No socket needed for learning
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
    
    console.log('Learning materials initialized with client-side processing');
    
    // Initialize items and load appropriate model
    initializeItems();
    
    // Wait for model to load before allowing camera interaction
    await loadModelForCategory();
    
    // Verify client-side processing is active
    if (detector.isClientSideProcessing()) {
        console.log('✅ Client-side processing confirmed active');
    } else {
        console.error('❌ Client-side processing NOT active - check initialization');
    }
});

async function loadModelForCategory() {
    /**
     * Load the appropriate model based on current category
     */
    if (!detector || !detector.clientSideClassifier) {
        console.error('Detector or classifier not initialized');
        return;
    }
    
    // Determine model type from URL path
    const pathParts = window.location.pathname.split('/');
    currentCategory = pathParts[pathParts.length - 1] || pathParts[pathParts.length - 2] || '';
    
    let modelType = 'alphabet'; // default
    
    if (currentCategory.toLowerCase().includes('number')) {
        modelType = 'number';
    } else if (currentCategory.toLowerCase().includes('alphabet') || 
               currentCategory.toLowerCase().includes('letter')) {
        modelType = 'alphabet';
    }
    
    console.log(`Loading ${modelType} model for category: ${currentCategory}`);
    
    const success = await detector.setModelType(modelType);
    
    if (success) {
        console.log(`${modelType} model loaded successfully`);
    } else {
        console.error(`Failed to load ${modelType} model`);
        alert(`Failed to load ${modelType} recognition model. Please refresh the page.`);
    }
}

function updateLearningProgress(data) {
    if (currentclass && data.prediction === currentclass) {
        // Visual feedback when user is performing correct gesture
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
    console.log("Try it yourself button clicked");
    if (content_div) {
        content_div.style.display = 'flex';
        detector_header.textContent = '';
        
        // Ensure correct model is loaded before starting
        await loadModelForCategory();
        
        const categoryDisplay = currentCategory.charAt(0).toUpperCase() + 
                               currentCategory.slice(1).toLowerCase();
        detector_header.textContent = `Try to perform the ${categoryDisplay} ${currentclass}`;
        class_div.style.display = 'none';

        if (currentclass) {
            detector.setLearningTarget(currentclass);
            console.log(`Learning target set to: ${currentclass}`);
        }

        await detector.startCamera();
        detector.startProcessing();
        class_div.style.display = 'none';
    }
}

function closecontent() {
    if (class_div) {
        class_div.style.display = 'none';
        main_content.classList.remove('blurred');
        blur_overlay.style.display = 'none';
        detector.stopCamera();

        currentItems.forEach(item => {
            item.buttonElement.classList.remove('active-button');
        });
    }
}

function closedetector() {
    if (content_div) {
        content_div.style.display = 'none';
        detector.stopCamera();
        detector.resetLearningState();
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
    window.location.href = '/learn/';
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
    
    const pathParts = window.location.pathname.split('/');
    currentCategory = pathParts[pathParts.length - 1] || '';
    
    console.log('Initialized items:', currentItems);
    console.log('Current category:', currentCategory);
}

function matcontent(asl_clas, instruction, image_path, category) {
    console.log("Material content button clicked");
    
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
    
    console.log('Current index set to:', currentIndex);
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