document.addEventListener("DOMContentLoaded", function() {
    const profileBtn = document.getElementById("profileBtn");
    const profileMenu = document.getElementById("profileMenu");

    profileBtn.addEventListener("click", function(e) {
        e.stopPropagation();
        profileMenu.style.display = 
            profileMenu.style.display === "flex" ? "none" : "flex";
    });

    document.addEventListener("click", function() {
        profileMenu.style.display = "none";
    });
});

function profile(username) {
    window.location.href = `${window.location.origin}/profile/${username}`;
}

function dashboard() {
    window.location.href = `${window.location.origin}/admin/dashboard`;
}

document.getElementById("logoutBtn").addEventListener("click", function () {
    window.location.href = `${window.location.origin}${this.dataset.href}`;
});