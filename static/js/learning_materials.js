let detector;
let socketio;

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


document.addEventListener('DOMContentLoaded', function() {
    // Initialize detector with main page configuration
    detector = new SignLanguageDetector({
        isRoomMode: false,
        enableGameLogic: false,
        enableLearningMode: true,
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
        onLearningSuccess: function(target) {
            console.log(`Learning success callback: ${target} performed correctly!`);
        },
        onPrediction: function(data) {
            // Custom prediction handling for main page if needed
            console.log('Prediction received:', data.prediction, 'Confidence:', data.confidence);
        }
    });
    
    console.log('Learning materials initialized with learning mode detector');
});

// Initialize when the page loads
document.addEventListener('DOMContentLoaded', function() {
    initializeItems();
});

async function tryityourself() {
    console.log("button clicked")
    if (content_div) {
        content_div.style.display = 'flex';
        detector_header.textContent = ''
        detector_header.textContent = 'Try to perform the ' + currentCategory.charAt(0).toUpperCase() + currentCategory.slice(1).toLowerCase() + ' ' + currentclass;
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

function nextLetter() {
    // Move to next letter (wrap around if at the end)
    currentIndex = (currentIndex + 1) % letters.length;

    const letter = letters[currentIndex];

    // Call matcontent with the next letter's data
    matcontent(letter.class, letter.instruction, letter.image_path, letter.category);
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

blur_overlay.addEventListener('click', () =>{
    closecontent();
    closedetector();
    currentItems.forEach(item => {
        item.buttonElement.classList.remove('active-button');
    });
});

function back() {
    window.location.href = '/learn/';
}

// Function to initialize the items array when the page loads
function initializeItems() {
    // Get all class buttons and extract their data
    const classButtons = document.querySelectorAll('.class-btn');
    currentItems = [];
    
    classButtons.forEach((button, index) => {
        const onclick = button.getAttribute('onclick'); // get the name of onclick of each classbuttons
        // Parse the onclick attribute to extract parameters
        const match = onclick.match(/matcontent\('([^']+)',\s*'([^']+)',\s*'([^']+)',\s*'([^']+)'\)/);   

        if (match) { //separates the string and put it into individual array position
            currentItems.push({
                class: match[1],
                instruction: match[2],
                image_path: match[3],
                category: match[4],
                buttonElement: button
            });
        }
    });
    
    // Get category from the current page
    const pathParts = window.location.pathname.split('/');
    currentCategory = pathParts[pathParts.length - 1] || '';
    
    console.log('Initialized items:', currentItems);
}

// Modified matcontent function to track current index
function matcontent(asl_clas, instruction, image_path, category) {
    console.log("button clicked")
    
    // Find the current index
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

// Next button function
function next() {
    if (currentItems.length === 0) {
        console.log('No items available');
        return;
    }
    
    // Move to next item
    currentIndex = (currentIndex + 1) % currentItems.length; // if currentindex+1 / currentitems.length == 0, return index to 0.
    const nextItem = currentItems[currentIndex];
    
    // Call matcontent with next item's data
    matcontent(
        nextItem.class,
        nextItem.instruction,
        nextItem.image_path,
        nextItem.category
    );
    
    // Optional: Highlight the current button
    highlightCurrentButton();
}

// Optional: Function to highlight the current active button
function highlightCurrentButton() {
    // Remove previous highlights
    currentItems.forEach(item => {
        item.buttonElement.classList.remove('active-button');
    });
    
    // Highlight current button
    if (currentIndex >= 0 && currentIndex < currentItems.length) {
        currentItems[currentIndex].buttonElement.classList.add('active-button');
    }
}

// Optional: Add a previous button function as well
function previous() {
    if (currentItems.length === 0) {
        console.log('No items available');
        return;
    }
    
    // Move to previous item
    currentIndex = currentIndex <= 0 ? currentItems.length - 1 : currentIndex - 1;
    const prevItem = currentItems[currentIndex];
    
    // Call matcontent with previous item's data
    matcontent(
        prevItem.class,
        prevItem.instruction,
        prevItem.image_path,
        prevItem.category
    );
    
    // Optional: Highlight the current button
    highlightCurrentButton();
}

// Optional: Add keyboard navigation
document.addEventListener('keydown', function(event) {
    // Only work when modal is open
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