document.addEventListener("DOMContentLoaded", function() {
    const profileBtn = document.getElementById("profileBtn");
    const profileMenu = document.getElementById("profileMenu");

    profileBtn.addEventListener("click", function(e) {
        e.stopPropagation();
        profileMenu.style.display = 
            profileMenu.style.display === "flex" ? "none" : "flex";
    });

    // Close menu if clicking outside
    document.addEventListener("click", function() {
        profileMenu.style.display = "none";
    });
});

function profile(username) {
    window.location.href = `/profile/${username}`;
}

document.getElementById("logoutBtn").addEventListener("click", function() {
    window.location.href = this.dataset.href;
});