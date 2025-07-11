const socketio = io();

const messages = document.getElementById("messages");

// Get DOM elements for detector
const videoElement = document.getElementById('videoElement');
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const statusDiv = document.getElementById('status');
const predictionDiv = document.getElementById('prediction');
const confidenceDiv = document.getElementById('confidence');
const confidenceBar = document.getElementById('confidenceBar');
const startGameButton = document.getElementById('startgameBtn');

// Debug: Check if elements exist
console.log('DOM elements check:');
console.log('startBtn:', startBtn);
console.log('stopBtn:', stopBtn);
console.log('startGameButton:', startGameButton);
console.log('isRoomCreator:', window.isRoomCreator);

// State variables for detector
let stream = null;
let isProcessing = false;
let processingInterval = null;
let isCameraReady = false;
let holdCounter = 0; // timer to hold the sign for some time

const customClassNames = {
  '0': 'A', '1': 'B', '2': 'C', '3': 'D', '4': 'E', '5': 'F',
  '6': 'G', '7': 'H', '8': 'I', '9': 'K', '10': 'L', '11': 'M',
  '12': 'N', '13': 'O', '14': 'P', '15': 'Q', '16': 'R', '17': 'T',
  '18': 'U', '19': 'V', '20': 'W', '21': 'X', '22': 'Y', '23': 'ILY'
};

const asl_classes = Object.values(customClassNames);
let targetletter = asl_classes[Math.floor(Math.random() * asl_classes.length)];
let score = 0;

// Initialize UI elements
const scoreElement = document.getElementById('score');
const targetElement = document.getElementById('target-letter');
if (scoreElement) scoreElement.textContent = `Score: ${score}`;
if (targetElement) targetElement.textContent = `Target: ${targetletter}`;

// Socket event handlers for chat
socketio.on('message', (data) => {
    createmessage(data.name, data.message, data.type || 'normal');
});

// Socket event handlers for detector
socketio.on('connect', function() {
    console.log('Connected to server');
});

socketio.on('status', function(data) {
    statusDiv.textContent = data.message + (data.model_loaded ? ' (Model Ready)' : ' (Demo Mode)');
    statusDiv.className = 'status connected';
    if (!data.model_loaded) {
        statusDiv.textContent += ' - Model not available';
    }
});

socketio.on('prediction_result', function(data) {
    predictionDiv.textContent = data.prediction;
    const confidencePercent = Math.round(data.confidence * 100);
    confidenceDiv.textContent = confidencePercent + '%';
    confidenceBar.style.width = confidencePercent + '%';

    // Draw hand landmarks if available
    if (data.landmarks && data.landmarks.length > 0) {
        drawLandmarks(data.landmarks);
    }

    if (data.prediction === targetletter && confidencePercent >= 50) {
        holdCounter += 1; // timer to hold the sign for some time
    } else {
        holdCounter = 0; // 4 x 300ms = 1200ms or 1.2 sec (see processingInterval)
    }

    if (holdCounter >= 4) {
        score += 1;
        holdCounter = 0;
        targetletter = asl_classes[Math.floor(Math.random() * asl_classes.length)];
        if (scoreElement) scoreElement.textContent = `Score: ${score}`;
        if (targetElement) targetElement.textContent = `Target: ${targetletter}`;
    }
});

socketio.on('error', function(data) {
    console.error('Server error:', data.message);
    statusDiv.textContent = 'Error: ' + data.message;
    statusDiv.className = 'status disconnected';
});

socketio.on('disconnect', function() {
    statusDiv.textContent = 'Disconnected from server';
    statusDiv.className = 'status disconnected';
});

// New socket events for camera readiness
socketio.on('camera_status_update', function(data) {
    updateCameraStatusDisplay(data);
});

socketio.on('all_cameras_ready', function() {
    // Only enable start game button for room creator
    if (window.isRoomCreator && startGameButton) {
        startGameButton.disabled = false;
        startGameButton.textContent = 'Start Game (All Ready!)';
        startGameButton.style.backgroundColor = '#4CAF50';
    }
});

socketio.on('waiting_for_cameras', function(data) {
    // Only update start game button for room creator
    if (window.isRoomCreator && startGameButton) {
        startGameButton.disabled = true;
        startGameButton.textContent = `Waiting for cameras (${data.ready}/${data.total})`;
        startGameButton.style.backgroundColor = '#FFA500';
    }
});

socketio.on('start_game_signal', function () {
    console.log('Game started signal received');
    stopBtn.disabled=true
    score = 0; // change this so that score turns zero AFTER saving to db
    targetletter = asl_classes[Math.floor(Math.random() * asl_classes.length)];
    if (targetElement) targetElement.textContent = `Target: ${targetletter}`;
    if (scoreElement) scoreElement.textContent = `Score: ${score}`;
    startProcessing();

    let timeLeft = 10;
    const timerDisplay = document.getElementById('timer');
    timerDisplay.textContent = `Time: ${timeLeft}s`;

    const countdown = setInterval(() => {
    timeLeft--;
    timerDisplay.textContent = `Time: ${timeLeft}s`;
    
    if (timeLeft <= 0) {
        clearInterval(countdown);
        stopProcessing();
        stopBtn.disabled=false;
        alert("Time's up!");
        }
    }, 1000);       // timer, 1000ms = 10 sec

});

// Chat functions
const sendMessage = () => {
    const message = document.getElementById("message");
    if (message.value == "") return;
    socketio.emit("message", {data: message.value});
    message.value = "";
};

document.getElementById("message").addEventListener("keypress", function(event) {
    if (event.key === "Enter") {
        sendMessage();
    }
});

// Camera functions - These should work for ALL users
async function startCamera() {
    console.log('Starting camera...');
    try {
        stream = await navigator.mediaDevices.getUserMedia({
            video: {
                width: { ideal: 640 },
                height: { ideal: 480 },
                facingMode: 'user'
            }
        });
        videoElement.srcObject = stream;

        videoElement.onloadedmetadata = function() {
            canvas.width = videoElement.videoWidth;
            canvas.height = videoElement.videoHeight;
            isCameraReady = true;
            
            // Notify server that camera is ready
            socketio.emit('camera_ready');
            console.log('Camera ready event sent to server');
        };

        startBtn.disabled = true;
        stopBtn.disabled = false;

        console.log('Camera started successfully');
    } catch (error) {
        console.error('Error accessing camera:', error);
        alert('Could not access camera. Please ensure camera permissions are granted.');
    }
}

function stopCamera() {
    console.log('Stopping camera...');
    if (stream) {
        stream.getTracks().forEach(track => track.stop());
        stream = null;
    }

    videoElement.srcObject = null;
    stopProcessing();
    isCameraReady = false;

    startBtn.disabled = false;
    stopBtn.disabled = true;

    // Notify server that camera is stopped
    socketio.emit('camera_stopped');
    console.log('Camera stopped event sent to server');

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    console.log('Camera stopped');
}

// Start game function - only for room creators
function startGame() {
    console.log('Start game button clicked');
    if (!window.isRoomCreator) {
        console.log('Not room creator, ignoring start game request');
        return;
    }
    socketio.emit('start_game');
}

function startProcessing() {
    console.log('Starting processing...');
    if (!stream) {
        alert('Please start the camera first');
        return;
    }

    isProcessing = true;

    processingInterval = setInterval(() => {
        captureAndSendFrame();
    }, 300); // callbacks every 300 ms

    console.log('Processing started');
}

function stopProcessing() {
    console.log('Stopping processing...');
    isProcessing = false;
    if (processingInterval) {
        clearInterval(processingInterval);
        processingInterval = null;
    }

    predictionDiv.textContent = 'No gesture';
    confidenceDiv.textContent = '0%';
    confidenceBar.style.width = '0%';
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    console.log('Processing stopped');
}

function captureAndSendFrame() {
    if (!videoElement.videoWidth || !videoElement.videoHeight) return;

    const tempCanvas = document.createElement('canvas');
    const tempCtx = tempCanvas.getContext('2d');
    tempCanvas.width = videoElement.videoWidth;
    tempCanvas.height = videoElement.videoHeight;

    tempCtx.scale(-1, 1);
    tempCtx.drawImage(videoElement, -tempCanvas.width, 0);

    const imageData = tempCanvas.toDataURL('image/jpeg', 0.8);
    socketio.emit('process_frame_room', { image: imageData });
}

function drawLandmarks(landmarks) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    landmarks.forEach(hand => {
        const points = hand.points;
        const connections = hand.connections;

        ctx.strokeStyle = '#00FF00';
        ctx.lineWidth = 2;
        ctx.beginPath();

        connections.forEach(([start, end]) => {
            const startPoint = points[start];
            const endPoint = points[end];

            const startX = startPoint[0] * canvas.width;
            const startY = startPoint[1] * canvas.height;
            const endX = endPoint[0] * canvas.width;
            const endY = endPoint[1] * canvas.height;

            ctx.moveTo(startX, startY);
            ctx.lineTo(endX, endY);
        });

        ctx.stroke();

        ctx.fillStyle = '#FF0000';
        points.forEach(point => {
            const x = point[0] * canvas.width;
            const y = point[1] * canvas.height;

            ctx.beginPath();
            ctx.arc(x, y, 3, 0, 2 * Math.PI);
            ctx.fill();
        });
    });
}

function updateCameraStatusDisplay(data) {
    // Use the global function defined in HTML
    if (window.updateCameraStatusDisplay) {
        window.updateCameraStatusDisplay(data);
    }
    console.log('Camera status update:', data);
}

// Event listeners - These should work for ALL users
if (startBtn) {
    startBtn.addEventListener('click', function() {
        console.log('Start camera button clicked');
        startCamera();
    });
}

if (stopBtn) {
    stopBtn.addEventListener('click', function() {
        console.log('Stop camera button clicked');
        stopCamera();
    });
}

// Start game button - only for room creators
if (startGameButton) {
    startGameButton.addEventListener('click', function() {
        console.log('Start game button clicked, isRoomCreator:', window.isRoomCreator);
        startGame();
    });
}

// Cleanup on page unload
window.addEventListener('beforeunload', function() {
    stopCamera();
});

console.log('Room with Sign Language Detection initialized');
console.log('Final check - isRoomCreator:', window.isRoomCreator);