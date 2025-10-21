document.addEventListener("DOMContentLoaded", () => {
const roleSelect = document.getElementById("role");
const gradeGroup = document.getElementById("gradeGroup");
const gradeInput = document.getElementById("registerGrade");

function toggleGradeField() {
    if (roleSelect.value === "Teacher") {
    gradeGroup.style.display = "none";
    gradeInput.removeAttribute("required");
    gradeInput.value = "";
    } else {
    gradeGroup.style.display = "block";
    gradeInput.setAttribute("required", "true");
    }
}

// Run on page load
toggleGradeField();

// Run when role changes
roleSelect.addEventListener("change", toggleGradeField);
});

function switchTab(tab) {
    const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');
    const tabs = document.querySelectorAll('.tab-btn');

    tabs.forEach(t => t.classList.remove('active'));

    if (tab === 'login') {
        loginForm.classList.add('active');
        registerForm.classList.remove('active');
        tabs[0].classList.add('active');
    } else {
        loginForm.classList.remove('active');
        registerForm.classList.add('active');
        tabs[1].classList.add('active');
    }

    clearMessages();
}

function showError(message) {
    const errorDiv = document.getElementById('errorMessage');
    errorDiv.textContent = message;
    errorDiv.style.display = 'block';
    document.getElementById('successMessage').style.display = 'none';
}

function showSuccess(message) {
    const successDiv = document.getElementById('successMessage');
    successDiv.textContent = message;
    successDiv.style.display = 'block';
    document.getElementById('errorMessage').style.display = 'none';
}

function clearMessages() {
    document.getElementById('errorMessage').style.display = 'none';
    document.getElementById('successMessage').style.display = 'none';
}

function setLoading(loading) {
    const container = document.querySelector('.auth-container');
    if (loading) {
        container.classList.add('loading');
    } else {
        container.classList.remove('loading');
    }
}

// Login form handler
document.getElementById('loginForm').addEventListener('submit', async function(e) {
    e.preventDefault();          // stops reloading on submit
    setLoading(true);
    clearMessages();

    const formData = new FormData(this);
    const data = {
        username: formData.get('username'),
        password: formData.get('password')
    };

    try {
        const response = await fetch(`${window.location.origin}/login`, {      // uses ajax - submits form without refreshing, /login route in app.py
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(data)  // turns data object into json
        });

        const result = await response.json();

        if (response.ok) {                                      //  Checks if the HTTP response was successful (status 200–299).
            showSuccess('Login successful! Redirecting...');
            setTimeout(() => {
                window.location.href = `${window.location.origin}${result.redirect}`;
            }, 1000);
        } else {
            showError(result.error || 'Login failed');
        }
    } catch (error) {
        showError('Network error. Please try again.');
    } finally {
        setLoading(false);
    }
});

// Register form handler
document.getElementById('registerForm').addEventListener('submit', async function(e) {
    e.preventDefault();
    setLoading(true);
    clearMessages();

    const formData = new FormData(this);
    const password = formData.get('password');
    const confirmPassword = formData.get('confirmPassword');

    if (password !== confirmPassword) {
        showError('Passwords do not match');
        setLoading(false);
        return;
    }

    const data = {
        username: formData.get('username'),
        password: password,
        role: formData.get('role'),
        grade: formData.get('grade') || null,
        profile_picture: document.getElementById('selectedAvatar').value
    };

    try {
        const response = await fetch(`${window.location.origin}/register`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(data)
        });

        const result = await response.json();

        if (response.ok) {
            showSuccess('Registration successful! Redirecting...');
            setTimeout(() => {
                window.location.href = `${window.location.origin}${result.redirect}`;
            }, 1000);
        } else {
            showError(result.error || 'Registration failed');
        }
    } catch (error) {
        showError('Network error. Please try again.');
    } finally {
        setLoading(false);
    }
});

// avatar selection state
let selectedAvatarTemp = null;

function openAvatarModal() {
    const modal = document.getElementById("avatarModal");
    modal.style.display = "flex";

    const avatarGrid = document.getElementById("avatarGrid");
    avatarGrid.innerHTML = "";

    const avatars = ["alex.jpg", "baymax.jpg", "bmo.jpg", "cookie.jpg", "darwin.png", "kirby.png", "roblox_guy.png", "roblox_girl.png", "default.jpg", "dragonball.jpg", "elmo.jpg", "gudetama.jpg", "pig.jpg", "pikachu.jpg", "red.jpg", "steve.jpg", "toot.jpg", "totoro.jpg"];

    avatars.forEach(img => {
        const imgElement = document.createElement("img");
        imgElement.src = `/static/images/profile_pictures/${img}`;
        imgElement.onclick = () => {
            document.querySelectorAll(".avatar-grid img").forEach(i => i.classList.remove("selected"));
            imgElement.classList.add("selected");
            selectedAvatarTemp = img;
        };
        avatarGrid.appendChild(imgElement);
    });
}

function closeAvatarModal() {
    document.getElementById("avatarModal").style.display = "none";
}

function confirmAvatar() {
    if (selectedAvatarTemp) {
        document.getElementById("selectedAvatar").value = selectedAvatarTemp;
        document.getElementById("selectedAvatarPreview").src = `/static/images/profile_pictures/${selectedAvatarTemp}`;
    }
    closeAvatarModal();
}

// Close when clicking outside content
document.addEventListener("click", (e) => {
    const modal = document.getElementById("avatarModal");
    if (e.target === modal) {
        closeAvatarModal();
    }
});
