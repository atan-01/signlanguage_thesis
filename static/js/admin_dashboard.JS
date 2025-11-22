document.addEventListener("DOMContentLoaded", function () {

    const roleSelect = document.getElementById("role");
    const gradeInput = document.getElementById("grade");

    function updateGradeState() {
        const role = roleSelect.value;

        if (role === "Student") {
            gradeInput.disabled = false;
        } else {
            gradeInput.disabled = true;
            gradeInput.value = "";
        }
    }

    roleSelect.addEventListener("change", updateGradeState);

    updateGradeState();

    gradeInput.addEventListener("input", function () {
        this.value = this.value.replace(/[^0-9]/g, "");
    });

});

// Tab switching
function showTab(tabName) {
    // Hide all tabs
    document.querySelectorAll('.tab-content').forEach(tab => {
        tab.classList.remove('active');
    });
    
    // Remove active from all buttons
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    
    // Show selected tab
    document.getElementById(`${tabName}-tab`).classList.add('active');
    
    // Highlight active button
    event.target.classList.add('active');
}

// Modal functions
function showModal(modalId) {
    document.getElementById(modalId).classList.add('show');
}

function closeModal(modalId) {
    document.getElementById(modalId).classList.remove('show');
}

// USER MANAGEMENT
function showAddUserModal() {
    document.getElementById('userModalTitle').textContent = 'Add User';
    document.getElementById('userId').value = '';
    document.getElementById('username').value = '';
    document.getElementById('role').value = 'user';
    document.getElementById('grade').value = '';
    showModal('userModal');
}

function editUser(id, username, role, grade) {
    document.getElementById('userModalTitle').textContent = 'Edit User';
    document.getElementById('userId').value = id;
    document.getElementById('username').value = username;
    document.getElementById('role').value = role;
    document.getElementById('grade').value = grade || '';
    showModal('userModal');
}

async function saveUser(event) {
    event.preventDefault();
    
    const userId = document.getElementById('userId').value;
    const username = document.getElementById('username').value;
    const role = document.getElementById('role').value;
    const grade = document.getElementById('grade').value;
    
    const data = { username, role, grade };
    
    try {
        let response;
        if (userId) {
            // Update existing user
            response = await fetch(`/admin/api/users/${userId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
        } else {
            // Add new user
            response = await fetch('/admin/api/users', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
        }
        
        const result = await response.json();
        
        if (response.ok) {
            closeModal('userModal');
            
            if (userId) {
                // Update existing row
                updateUserRow(userId, username, role, grade);
                showNotification('User updated successfully!', 'success');
            } else {
                // Add new row
                const newUser = result.data[0];
                addUserRow(newUser);
                showNotification('User added successfully!', 'success');
            }
        } else {
            showNotification('Error: ' + result.error, 'error');
        }
    } catch (error) {
        console.error('Error:', error);
        showNotification('Failed to save user', 'error');
    }
}

function updateUserRow(userId, username, role, grade) {
    const row = document.querySelector(`#users-tbody tr[data-id="${userId}"]`);
    if (row) {
        row.cells[1].textContent = username;
        row.cells[2].innerHTML = `<span class="role-badge role-${role.toLowerCase()}">${role}</span>`;
        row.cells[3].textContent = grade || 'N/A';
    }
}

function addUserRow(user) {
    const tbody = document.getElementById('users-tbody');
    const newRow = document.createElement('tr');
    newRow.setAttribute('data-id', user.id);
    
    const createdDate = user.created_at ? user.created_at.substring(0, 10) : 'N/A';
    
    newRow.innerHTML = `
        <td>${user.id}</td>
        <td>${user.username}</td>
        <td><span class="role-badge role-${user.role.toLowerCase()}">${user.role}</span></td>
        <td>${user.grade || 'N/A'}</td>
        <td>${createdDate}</td>
        <td>
            <button class="btn-edit" onclick="editUser('${user.id}', '${user.username}', '${user.role}', '${user.grade || ''}')">Edit</button>
            <button class="btn-delete" onclick="deleteUser('${user.id}')">Delete</button>
        </td>
    `;
    
    tbody.insertBefore(newRow, tbody.firstChild);
}

async function deleteUser(userId) {
    if (!confirm('Are you sure you want to delete this user?')) return;
    
    try {
        const response = await fetch(`/admin/api/users/${userId}`, {
            method: 'DELETE'
        });
        
        if (response.ok) {
            document.querySelector(`#users-tbody tr[data-id="${userId}"]`).remove();
            showNotification('User deleted successfully!', 'success');
        } else {
            const result = await response.json();
            showNotification('Error: ' + result.error, 'error');
        }
    } catch (error) {
        console.error('Error:', error);
        showNotification('Failed to delete user', 'error');
    }
}

// ROOM MANAGEMENT
async function deleteRoom(roomId) {
    if (!confirm('Are you sure you want to delete this room?')) return;
    
    try {
        const response = await fetch(`/admin/api/rooms/${roomId}`, {
            method: 'DELETE'
        });
        
        if (response.ok) {
            document.querySelector(`#rooms-tbody tr[data-id="${roomId}"]`).remove();
            showNotification('Room deleted successfully!', 'success');
        } else {
            const result = await response.json();
            showNotification('Error: ' + result.error, 'error');
        }
    } catch (error) {
        console.error('Error:', error);
        showNotification('Failed to delete room', 'error');
    }
}

// GAME SESSION MANAGEMENT
async function deleteGameSession(sessionId) {
    if (!confirm('Are you sure you want to delete this game session?')) return;
    
    try {
        const response = await fetch(`/admin/api/game_sessions/${sessionId}`, {
            method: 'DELETE'
        });
        
        if (response.ok) {
            document.querySelector(`#sessions-tbody tr[data-id="${sessionId}"]`).remove();
            showNotification('Game session deleted successfully!', 'success');
        } else {
            const result = await response.json();
            showNotification('Error: ' + result.error, 'error');
        }
    } catch (error) {
        console.error('Error:', error);
        showNotification('Failed to delete game session', 'error');
    }
}

// WORDS MANAGEMENT
function showAddWordModal() {
    document.getElementById('wordModalTitle').textContent = 'Add Word';
    document.getElementById('wordIndex').value = '';
    document.getElementById('wordText').value = '';
    document.getElementById('wordEmoji').value = '';
    updateWordPreview();
    showModal('wordModal');
}

function editWord(index, word, emoji) {
    document.getElementById('wordModalTitle').textContent = 'Edit Word';
    document.getElementById('wordIndex').value = index;
    document.getElementById('wordText').value = word;
    document.getElementById('wordEmoji').value = emoji;
    updateWordPreview();
    showModal('wordModal');
}

function updateWordPreview() {
    const word = document.getElementById('wordText').value || 'word';
    const emoji = document.getElementById('wordEmoji').value || '🐶';
    
    document.getElementById('previewWord').textContent = word;
    document.getElementById('previewEmoji').textContent = emoji;
}

// Add event listeners for live preview
document.addEventListener('DOMContentLoaded', function() {
    const wordText = document.getElementById('wordText');
    const wordEmoji = document.getElementById('wordEmoji');
    
    if (wordText) {
        wordText.addEventListener('input', updateWordPreview);
    }
    if (wordEmoji) {
        wordEmoji.addEventListener('input', updateWordPreview);
    }
});

async function saveWord(event) {
    event.preventDefault();
    
    const wordIndex = document.getElementById('wordIndex').value;
    const word = document.getElementById('wordText').value;
    const emoji = document.getElementById('wordEmoji').value;
    
    const data = { word, emoji };
    
    try {
        let response;
        if (wordIndex !== '') {
            // Update existing word
            response = await fetch(`/admin/api/words/${wordIndex}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
        } else {
            // Add new word
            response = await fetch('/admin/api/words', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
        }
        
        const result = await response.json();
        
        if (response.ok) {
            closeModal('wordModal');
            
            if (wordIndex !== '') {
                // Update existing row
                updateWordRow(wordIndex, word, emoji);
                showNotification('Word updated successfully!', 'success');
            } else {
                // Add new row
                addWordRow(word, emoji);
                showNotification('Word added successfully!', 'success');
            }
        } else {
            showNotification('Error: ' + result.error, 'error');
        }
    } catch (error) {
        console.error('Error:', error);
        showNotification('Failed to save word', 'error');
    }
}

function updateWordRow(index, word, emoji) {
    const row = document.querySelector(`#words-tbody tr[data-index="${index}"]`);
    if (row) {
        row.cells[1].textContent = word;
        row.cells[2].textContent = emoji;
        row.cells[3].innerHTML = `<span style="font-size: 2rem;">${emoji}</span> ${word}`;
        
        // Update onclick attributes
        const editBtn = row.querySelector('.btn-edit');
        editBtn.setAttribute('onclick', `editWord(${index}, '${word}', '${emoji}')`);
    }
}

function addWordRow(word, emoji) {
    const tbody = document.getElementById('words-tbody');
    const newIndex = tbody.children.length;
    const newRow = document.createElement('tr');
    newRow.setAttribute('data-index', newIndex);
    
    newRow.innerHTML = `
        <td>${newIndex + 1}</td>
        <td>${word}</td>
        <td>${emoji}</td>
        <td><span style="font-size: 2rem;">${emoji}</span> ${word}</td>
        <td>
            <button class="btn-edit" onclick="editWord(${newIndex}, '${word}', '${emoji}')">Edit</button>
            <button class="btn-delete" onclick="deleteWord(${newIndex})">Delete</button>
        </td>
    `;
    
    tbody.appendChild(newRow);
}

async function deleteWord(index) {
    if (!confirm('Are you sure you want to delete this word?')) return;
    
    try {
        const response = await fetch(`/admin/api/words/${index}`, {
            method: 'DELETE'
        });
        
        if (response.ok) {
            // Need to reload for words because indices change after deletion
            showNotification('Word deleted successfully! Refreshing list...', 'success');
            setTimeout(() => {
                location.reload();
            }, 1000);
        } else {
            const result = await response.json();
            showNotification('Error: ' + result.error, 'error');
        }
    } catch (error) {
        console.error('Error:', error);
        showNotification('Failed to delete word', 'error');
    }
}

// Notification System
function showNotification(message, type = 'success') {
    // Remove existing notification if any
    const existingNotif = document.querySelector('.admin-notification');
    if (existingNotif) {
        existingNotif.remove();
    }
    
    const notification = document.createElement('div');
    notification.className = `admin-notification ${type}`;
    notification.textContent = message;
    
    document.body.appendChild(notification);
    
    // Trigger animation
    setTimeout(() => {
        notification.classList.add('show');
    }, 10);
    
    // Auto remove after 3 seconds
    setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => {
            notification.remove();
        }, 300);
    }, 3000);
}

// Close modal when clicking outside
window.onclick = function(event) {
    if (event.target.classList.contains('modal')) {
        event.target.classList.remove('show');
    }
}