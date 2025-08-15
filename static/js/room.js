// room.js - Updated to use shared socket connection
let detector;
let allCamerasReady = false;
let gameTypeSelected = false;
let participate = true;
let socketio; // Will use shared socket from detector

window.addEventListener('DOMContentLoaded', () => {
    if (window.isRoomCreator) {
        const overlay = document.getElementById('creator-participate');
        if (overlay) {
            overlay.style.display = 'flex';
        }
    }

    // Initialize the sign language detector for room mode with shared socket
    detector = new SignLanguageDetector({
        isRoomMode: true,
        enableGameLogic: true,
        enableFpsCounter: false,
        processingInterval: 300,
        frameQuality: 0.8,
        participate: participate,
        onCameraStart: function() {
            console.log('Camera started in room mode');
        },
        onCameraStop: function() {
            console.log('Camera stopped in room mode');
        },
        onProcessingStart: function() {
            console.log('Processing started in room mode');
        },
        onProcessingStop: function() {
            console.log('Processing stopped in room mode');
        }
    });

    // Use the shared socket from the detector
    socketio = detector.socketio;
    
    // Setup room-specific socket event handlers on the shared socket
    setupRoomSocketHandlers();
});

// Get DOM elements for room-specific functionality
const messages = document.getElementById("messages");
const startGameButton = document.getElementById('startgameBtn');

// Debug: Check if elements exist
console.log('DOM elements check:');
console.log('startGameButton:', startGameButton);
console.log('isRoomCreator:', window.isRoomCreator);

function setupRoomSocketHandlers() {
    // Socket event handlers for chat
    socketio.on('message', (data) => {
        createmessage(data.name, data.message, data.type || 'normal');
    });

    // Room-specific socket event handlers
    socketio.on('participants_updated', function(data) {
        updateParticipantsList(data.participants);
    });

    // Camera readiness handlers
    socketio.on('camera_status_update', function(data) {
        updateCameraStatusDisplay(data);
    });

    socketio.on('all_cameras_ready', function() {
        allCamerasReady = true;
        tryEnableStartGameButton();
    });

    socketio.on('waiting_for_cameras', function(data) {
        if (window.isRoomCreator && startGameButton) {
            startGameButton.disabled = true;
            startGameButton.textContent = `Waiting for cameras (${data.ready}/${data.total})`;
            startGameButton.style.backgroundColor = '#FFA500';
        }
    });

    socketio.on('game_type_set', (data) => {
        gameTypeSelected = true;
        console.log("Game type is:", data.type);
        document.getElementById('game-type-display').innerText = `Mode: ${data.type}`;
        tryEnableStartGameButton();
    });

    socketio.on('start_game_signal', function () {
        console.log('Game started signal received');
        const stopBtn = document.getElementById('stopBtn');
        if (stopBtn) stopBtn.disabled = true;
        
        // Reset game state using detector
        detector.resetScore();
        detector.startProcessing();

        let timeLeft = 10;
        const timerDisplay = document.getElementById('timer');
        timerDisplay.textContent = `Time: ${timeLeft}s`;

        const countdown = setInterval(() => {
            timeLeft--;
            timerDisplay.textContent = `Time: ${timeLeft}s`;
            
            if (timeLeft <= 0) {
                clearInterval(countdown);
                detector.stopProcessing();
                if (stopBtn) stopBtn.disabled = false;
                alert("Time's up!");
                
                if (participate) {
                    document.getElementById('leaderboard').style.display = 'flex';
                }
                
                const gameTypeSelect = document.getElementById('game-type-select');
                gameTypeSelect.style.display = 'flex';
                gameTypeSelected = false;
                
                if (startGameButton) {
                    startGameButton.disabled = false;
                }
            }
        }, 1000); // timer, 1000ms = 1 sec intervals for 10 second game
    }); 

    socketio.on('leaderboard_update', function(data) {
        const list = document.getElementById('leaderboard-list');
        const existingRows = list.getElementsByClassName('leaderboard-row');

        let found = false;

        // Check if the user already exists in the leaderboard
        for (let row of existingRows) {
            const usernameSpan = row.querySelector('.username');
            if (usernameSpan && usernameSpan.textContent === data.username) {
                // Update the score
                const scoreSpan = row.querySelector('.score');
                scoreSpan.textContent = data.score;
                found = true;
                break;
            }
        }

        // If not found, add new row
        if (!found) {
            const newRow = document.createElement('div');
            newRow.className = 'leaderboard-row';
            newRow.innerHTML = `
                <span class="username">${data.username}</span>
                <span class="score">${data.score}</span>
            `;
            list.appendChild(newRow);
        }
    });

    socketio.on('room_deleted_by_creator', function(data) {
        console.log('Room deleted by creator:', data.message);
        
        // Create a custom notification div
        const notification = document.createElement('div');
        notification.innerHTML = `
            <div style="
                position: fixed; 
                top: 50%; 
                left: 50%; 
                transform: translate(-50%, -50%); 
                background: white; 
                border: 2px solid #ccc; 
                padding: 20px; 
                border-radius: 10px; 
                box-shadow: 0 4px 6px rgba(0,0,0,0.1); 
                z-index: 10000;
                text-align: center;
                max-width: 400px;
            ">
                <h3>🚪 Room Closed</h3>
                <p>${data.message}</p>
                <button onclick="this.parentElement.parentElement.remove(); window.location.href='/home/';" 
                        style="padding: 10px 20px; background: #007bff; color: white; border: none; border-radius: 5px; cursor: pointer;">
                    OK
                </button>
            </div>
            <div style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); z-index: 9999;"></div>
        `;
        
        // Cleanup detector immediately
        if (detector) {
            detector.stopCamera();
        }
        
        document.body.appendChild(notification);
        
        // Auto-redirect after 5 seconds if user doesn't click OK
        setTimeout(() => {
            window.location.href = '/home/';
        }, 5000);
    });
}

// Room-specific functions
function participate_btn() {
    document.getElementById('creator-participate').style.display = 'none';
}

function notparticipate_btn() {
    participate = false;
    detector.setParticipation(false);
    
    const startBtn = document.getElementById('startBtn');
    const stopBtn = document.getElementById('stopBtn');
    if (startBtn) startBtn.disabled = true;
    if (stopBtn) stopBtn.disabled = true;
    
    document.getElementById('creator-participate').style.display = 'none';
    socketio.emit('camera_ready');
    console.log('Camera ready event sent to server');
}

function closeLeaderboard() {
    document.getElementById('leaderboard').style.display = 'none';
    const list = document.getElementById('leaderboard-list');
    list.innerHTML = '';
}

function updateParticipantsList(participants) {
    const participantList = document.getElementById('participantList');
    
    if (!participantList) {
        console.log('Participant list element not found');
        return;
    }
    
    // Clear existing list
    participantList.innerHTML = '';
    
    // Add each participant as a list item
    participants.forEach(function(participant) {
        const listItem = document.createElement('li');
        listItem.textContent = participant;
        participantList.appendChild(listItem);
    });
    
    console.log('Updated participants list:', participants);
}

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

function submitGameType() {
    const selectedType = document.getElementById('gameType').value;
    socketio.emit('set_game_type', { type: selectedType });
    document.getElementById('game-type-select').style.display = 'none';
}

function tryEnableStartGameButton() {
    if (window.isRoomCreator && allCamerasReady && gameTypeSelected && startGameButton) {
        startGameButton.disabled = false;
        startGameButton.textContent = 'Start Game (All Ready!)';
        startGameButton.style.backgroundColor = '#4CAF50';
    }
}

// Start game function - only for room creators
function startGame() {
    console.log('Start game button clicked');
    socketio.emit('start_game');
}

function updateCameraStatusDisplay(data) {
    console.log('Camera status update:', data);

    // Update global allCamerasReady
    allCamerasReady = data.ready === data.total && data.total > 0;

    const statusdiv = document.getElementById('camera-status');
    if (statusdiv) {
        statusdiv.textContent = `${data.ready}/${data.total} cameras ready`;
    }

    tryEnableStartGameButton();
}

// Aggressive exit function
function exitroom() {
    console.log('Immediate exit initiated...');
    
    // If this is the room creator, notify server to delete room and kick everyone
    if (window.isRoomCreator) {
        console.log('Room creator leaving - room will be deleted');
        socketio.emit('room_creator_leaving');
        
        // Give a brief moment for the server to process before disconnecting
        setTimeout(() => {
            if (detector) {
                detector.stopCamera();
            }
            try {
                socketio.disconnect();
                window.location.href = '/home/';
            } catch (error) {
                console.error('Error during disconnect:', error);
                window.location.href = '/home/';
            }
        }, 100);
    } else {
        // Regular participant leaving
        if (detector) {
            detector.stopCamera();
        }
        try {
            socketio.disconnect();
            window.location.href = '/home/';
        } catch (error) {
            console.error('Error during disconnect:', error);
            window.location.href = '/home/';
        }
    }
}

// Start game button - only for room creators
if (startGameButton) {
    startGameButton.addEventListener('click', function() {
        console.log('Start game button clicked, isRoomCreator:', window.isRoomCreator);
        startGameButton.disabled = true;
        if (!participate) {
            document.getElementById('leaderboard').style.display = 'flex';
        }
        startGame();
    });
}

// Cleanup on page unload
window.addEventListener('beforeunload', function() {
    // If room creator is leaving (page refresh/close), notify server
    if (window.isRoomCreator && socketio && socketio.connected) {
        socketio.emit('room_creator_leaving');
    }
    
    if (detector) {
        detector.stopCamera();
    }
});

console.log('Room with Sign Language Detection initialized');
console.log('Final check - isRoomCreator:', window.isRoomCreator);