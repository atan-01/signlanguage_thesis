// Streamlined room.js - client-side processing only
let detector;
let allCamerasReady = false;
let gameTypeSelected = false;
let participate = true;
let socketio;
let gamemodeindex = 0;
let gametime = 1000;
let selectedGameTime = 30;
let gameduration;
let gameTimerInterval = null;
let isGameEnding = false;

const gamemodeimages = [
    '/static/images/gm_timestarts.png',
    '/static/images/gm_fillintheblanks.png', 
    '/static/images/gm_ghostsign.png'
];

const gamemodenames = ['Timer Starts', 'Fill in the Blanks', 'Ghost Sign'];

window.addEventListener('DOMContentLoaded', () => {    
    if (window.isRoomCreator) {
        const overlay = document.getElementById('creator-participate');
        if (overlay) {
            updategamemodeimage();
            overlay.style.display = 'flex';
        }
    }

    const messageInput = document.getElementById('message');
    if (messageInput) {
        messageInput.addEventListener('keydown', e => {
            if (e.key === 'Enter') sendMessage();
        });
    }

    // Initialize detector with client-side processing
    detector = new SignLanguageDetector({
        isRoomMode: true,
        enableGameLogic: true,
        enableClientSideProcessing: true, // All processing on client
        enableFpsCounter: false,
        processingInterval: 300,
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

    // Socket is now only for game synchronization
    socketio = detector.socketio;
    socketio.emit('join_room', { room: ROOM_CODE, name: USERNAME });

    // Setup minimal room sync handlers
    setupRoomSocketHandlers();
});

function setupRoomSocketHandlers() {
    // Chat messages
    socketio.on('message', (data) => {
        createmessage(data.name, data.message, data.type || 'normal');
    });

    // Room management
    socketio.on('participants_updated', function(data) {
        updateParticipantsList(data.participants);
    });

    // Camera readiness (for game start only)
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

    // Game synchronization events
    socketio.on('game_type_set', (data) => {
        display_gamemode.textContent = '';
        selectedGameTime = data.duration;
        display_gamemode.style.backgroundImage = `url(${gamemodeimages[data.gamemode_index]})`;
        gameTypeSelected = true;
        document.getElementById('game-type-display').innerText = `${data.type}`;
        timer_div.textContent = data.duration + 's';
        gameduration = data.duration;
        document.getElementById('game-type-display').style.fontSize = "2rem";
        tryEnableStartGameButton();
    });

    socketio.on('start_game_countdown', function(){
        game_countdown.style.position = 'fixed';
        game_countdown.style.display = 'flex';
        let gcountdowntime = 3;
        game_countdown.textContent = gcountdowntime;
        const gcountdowninterval = setInterval(() =>{
            gcountdowntime--
            if(gcountdowntime <= 0){
                clearInterval(gcountdowninterval);
                game_countdown.style.display = 'none';
                game_countdown.style.position = 'none';
                socketio.emit('start_actual_game');
            }
            else {
            game_countdown.textContent = gcountdowntime;
            }
        }, 1000);
    });

    // Game start signal - all processing is now client-side
    socketio.on('start_game_signal', function () {
        console.log('Game started signal received');
        const stopBtn = document.getElementById('stopBtn');
        
        isGameEnding = false;
        
        if (!participate) {
            document.getElementById('leaderboard').style.display = 'flex';
            btn_closeleaderboard.disabled = true;
            btn_closeleaderboard.style.opacity = '0.6';
        }

        if (stopBtn) stopBtn.disabled = true;
        
        // Reset game state - all processing happens locally now
        detector.resetScore();
        detector.startProcessing(); // Client-side processing only

        let timeLeft = selectedGameTime;
        timer_div.textContent = `${timeLeft}s`;
        if(waiting_to_start){
            document.querySelector('.waiting_text').textContent = "Game On Progress";
            waiting_to_start.style.backgroundColor = '#4CAF50';
        }

        // Clear any existing timer
        if (gameTimerInterval) {
            clearInterval(gameTimerInterval);
        }

        // Single timer implementation
        gameTimerInterval = setInterval(() => {
            timeLeft--;
            timer_div.textContent = `${timeLeft}s`;
            
            if (timeLeft <= 0) {
                clearInterval(gameTimerInterval);
                gameTimerInterval = null;
                
                // Prevent multiple end-game triggers
                if (isGameEnding) return;
                isGameEnding = true;
                
                endGameCleanup();
            }
        }, 1000);
    }); 

    // Leaderboard updates (only sync scores, not frames)
    socketio.on('leaderboard_update', function(data) {
        const list = document.getElementById('leaderboard-list');
        const existingRows = list.getElementsByClassName('leaderboard-row');

        let found = false;

        for (let row of existingRows) {
            const usernameSpan = row.querySelector('.username');
            if (usernameSpan && usernameSpan.textContent === data.username) {
                const scoreSpan = row.querySelector('.score');
                scoreSpan.textContent = data.score;
                found = true;
                break;
            }
        }

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

    // Room deletion
    socketio.on('room_deleted_by_creator', function(data) {
        console.log('Room deleted by creator:', data.message);
        
        const notification = document.createElement('div');
        notification.innerHTML = `
            <div class="notif-leave">
                <h3>🚪 Room Closed</h3>
                <p>${data.message}</p>
                <button onclick="this.parentElement.parentElement.remove(); window.location.href='/home/';" 
                        style="padding: 10px 20px; background: #007bff; color: white; border: none; border-radius: 5px; cursor: pointer;">
                    OK
                </button>
            </div>
            <div style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); z-index: 9999;"></div>
            `;        
        if (detector) {
            detector.stopCamera();
        }
        
        document.body.appendChild(notification);
        
        setTimeout(() => {
            window.location.href = '/home/';
        }, 5000);
    });
}

// New function to handle game ending cleanup
function endGameCleanup() {
    detector.stopProcessing();
    
    const stopBtn = document.getElementById('stopBtn');
    if (stopBtn) stopBtn.disabled = false;
    
    // Show alert only once
    alert("Time's up!");
    
    if (participate) {
        document.getElementById('leaderboard').style.display = 'flex';
    }
    
    if (display_gamemode) {
        display_gamemode.style.pointerEvents = "auto";
        display_gamemode.style.opacity = "1";
        display_gamemode.style.cursor = "pointer";
    }
    
    if (startGameButton && window.isRoomCreator) {
        startGameButton.disabled = false;
    }

    if(waiting_to_start){
        waiting_to_start.style.display = 'inline-flex';
        document.querySelector('.waiting_text').textContent = "Waiting to start";
        waiting_to_start.style.backgroundColor = '#7153A4';
    }
    
    timer_div.textContent = gameduration + 's';
    btn_closeleaderboard.disabled = false;
    btn_closeleaderboard.style.opacity = "1";
    
    const finalScore = detector.getScore();
    socketio.emit('end_game', { final_score: finalScore });
}

// Get DOM elements
const messages = document.getElementById("messages");
const startGameButton = document.getElementById('startgameBtn');
const gamemodediv = document.querySelector('.gamemode');
const btn_prev = document.getElementById('btn_prev');
const btn_next = document.getElementById('btn_next');
const modenamediv = document.querySelector('.modename');
const btn_close = document.querySelector('.btn_close');
const btn_confirm = document.querySelector('.btn_confirm');
const timer_div = document.querySelector('.timer_display');
const sendButton = document.getElementById("send_btn");
const display_gamemode = document.querySelector('.display_gamemode');
const waiting_to_start = document.querySelector('.waiting_to_start');
const game_countdown = document.getElementById('game-countdown');
const participants_container = document.querySelector('.participants-container'); 
const btn_closeleaderboard = document.querySelector('.btn_closeleaderboard');

// Room-specific functions
function updategamemodeimage() {
    gamemodediv.style.backgroundImage = `url(${gamemodeimages[gamemodeindex]})`;
    modenamediv.textContent = gamemodenames[gamemodeindex];
}

btn_prev.addEventListener('click', () => {
    gamemodeindex = (gamemodeindex - 1 + gamemodeimages.length) % gamemodeimages.length;
    updategamemodeimage();
});

btn_next.addEventListener('click', () => {
    gamemodeindex = (gamemodeindex + 1) % gamemodeimages.length;
    updategamemodeimage();
})

function handleConfirmButton() {
    const participateRadio = document.getElementById('flexRadioDefault1');
    const notParticipateRadio = document.getElementById('flexRadioDefault2');
    const startBtn = document.getElementById('startBtn');
    const stopBtn = document.getElementById('stopBtn');
    
    if (participateRadio.checked) {
        participate = true;
        socketio.emit('creator_participation', { participates: true });
        detector.setParticipation(true);
        if (startBtn) startBtn.disabled = false;
        if (stopBtn) stopBtn.disabled = false;
        socketio.emit('camera_stopped');
        console.log('User chose to participate');
    } else if (notParticipateRadio.checked) {
        participate = false;
        socketio.emit('creator_participation', { participates: false });
        detector.setParticipation(false);
        if (startBtn) startBtn.disabled = true;
        if (stopBtn) stopBtn.disabled = true;
        if (detector.stream) {
            detector.stream.getTracks().forEach(track => track.stop());
            detector.stream = null;
        }
        if (detector.elements.videoElement) {
            detector.elements.videoElement.srcObject = null;
        }

        if(stopBtn){
            stopBtn.className = "btn";
            stopBtn.textContent = "Start Camera";
            stopBtn.disabled = true;
            stopBtn.id = "startBtn";
        }
 
        socketio.emit('camera_ready');
        console.log('User chose not to participate - Camera ready event sent to server');
    }
    
    const gameTimeSelect = document.getElementById('game-time');
    selectedGameTime = parseInt(gameTimeSelect.value);
    
    let selectedType = modenamediv.textContent;
    socketio.emit('set_game_type_and_time', { 
        type: selectedType,
        duration: selectedGameTime,
        gamemode_index: gamemodeindex
    });
    
    document.getElementById('creator-participate').style.display = 'none';
    console.log('Settings confirmed:', {
        participate: participate,
        gameTime: selectedGameTime,
        gameType: selectedType
    });
}

// Other room functions
function openparticipants() {
    participants_container.style.display = 'flex';
}

function closeparticipants() {
    participants_container.style.display = 'none';
}

btn_close.addEventListener('click', () => {
    document.getElementById('creator-participate').style.display = 'none';
});

btn_confirm.addEventListener('click', handleConfirmButton);

function openGameModeOverlay() {
    if (window.isRoomCreator) {
        const overlay = document.getElementById('creator-participate');
        if (overlay) {
            updategamemodeimage();
            overlay.style.display = 'flex';
        }
    }
}

function closeLeaderboard() {
    document.getElementById('leaderboard').style.display = 'none';
    const list = document.getElementById('leaderboard-list');
    list.innerHTML = '';
}

function updateParticipantsList(participants) {
    const participantList = document.getElementById('participantList');
    participantList.innerHTML = '';
    
    participants.forEach(function(participant) {
        const listItem = document.createElement('li');
        listItem.className = 'participant-item';
        
        const img = document.createElement('img');
        img.src = `/static/${participant.profile_picture}`;
        img.alt = 'pfp';
        img.className = 'participant-pfp';
        
        const span = document.createElement('span');
        span.className = 'participant-name';
        span.textContent = participant.username;
        
        listItem.appendChild(img);
        listItem.appendChild(span);
        participantList.appendChild(listItem);
    });
    
    console.log('Updated participants list:', participants);
}

// Chat functions
function sendMessage() {
    const message = document.getElementById("message");
    if (message.value == "") return;
    socketio.emit("message", {
        room: ROOM_CODE,
        name: USERNAME,
        data: message.value
    });
    message.value = "";
};

function tryEnableStartGameButton() {
    if (window.isRoomCreator && allCamerasReady && gameTypeSelected && startGameButton) {
        startGameButton.disabled = false;
        startGameButton.textContent = 'Start Game (All Ready!)';
        startGameButton.style.backgroundColor = '#4CAF50';
    }
}

function startGame() {
    console.log('Start game button clicked');
    socketio.emit('start_game');
    if (display_gamemode) {
        display_gamemode.style.pointerEvents = "none";
        display_gamemode.style.opacity = "0.6";
        display_gamemode.style.cursor = "default";
    }
}

function updateCameraStatusDisplay(data) {
    console.log('Camera status update:', data);
    allCamerasReady = data.ready === data.total && data.total > 0;

    const statusdiv = document.getElementById('camera-status');
    if (statusdiv) {
        statusdiv.textContent = `${data.ready}/${data.total} cameras ready`;
    }
    tryEnableStartGameButton();
}

function exitroom() {
    console.log('Immediate exit initiated...');
    
    if (window.isRoomCreator) {
        console.log('Room creator leaving - room will be deleted');
        socketio.emit('room_creator_leaving');
        
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

if (startGameButton) {
    startGameButton.addEventListener('click', function() {
        console.log('Start game button clicked, isRoomCreator:', window.isRoomCreator);
        startGameButton.disabled = true;
        startGame();
    });
}

// Cleanup
window.addEventListener('beforeunload', function() {
    if (gameTimerInterval) {
        clearInterval(gameTimerInterval);
    }
    
    if (window.isRoomCreator && socketio && socketio.connected) {
        socketio.emit('room_creator_leaving');
    }
    
    if (detector) {
        detector.stopCamera();
    }
});

console.log('Room with client-side Sign Language Detection initialized');
console.log('Final check - isRoomCreator:', window.isRoomCreator);