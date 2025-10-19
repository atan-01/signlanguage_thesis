const gameSessionsData = JSON.parse(
  document.getElementById("gameSessionsData").textContent
);

document.addEventListener("DOMContentLoaded", function() {
    const profileBtn = document.getElementById("profileBtn");
    const profileMenu = document.getElementById("profileMenu");
    const btn = document.querySelector(".dropdown-btn");
    const list = document.querySelector(".dropdown-list");

    profileBtn.addEventListener("click", function(e) {
        e.stopPropagation();
        profileMenu.style.display = 
            profileMenu.style.display === "flex" ? "none" : "flex";
    });

    document.addEventListener("click", function() {
        profileMenu.style.display = "none";
    });

    // dropdowm items
    list.addEventListener("click", (e) => {
        if (e.target.tagName === "A") {
            e.preventDefault();
            const selected = e.target.textContent;

            if (selected === "All") {
                btn.textContent = "Game Mode ▼";
                const allOption = list.querySelector("a.all-option");
                if (allOption) allOption.remove();
                document.querySelectorAll("#gamesList li").forEach(li => {
                    li.style.display = "flex";
                });
            } else {
                btn.textContent = selected + " ▼";

                if (!list.querySelector("a.all-option")) {
                    const allLink = document.createElement("a");
                    allLink.href = "#";
                    allLink.textContent = "All";
                    allLink.classList.add("all-option");
                    list.insertBefore(allLink, list.firstChild);
                }

                document.querySelectorAll("#gamesList li").forEach(li => {
                    if (li.dataset.gameType === selected) {
                        li.style.display = "flex";
                    } else {
                        li.style.display = "none";
                    }
                });
            }
            list.style.display = "none";
        }
    });

    // dropdown button
    btn.addEventListener("click", (e) => {
        e.stopPropagation();
        list.style.display = list.style.display === "flex" ? "none" : "flex";
    });

    document.addEventListener("click", () => {
        list.style.display = "none";
    });

    createChartElements();


    // search functions
    const searchBtn = document.getElementById("searchBtn");
    const searchInput = document.getElementById("searchInput");

    const handleSearch = async () => {
        const username = searchInput.value.trim();
        if (!username) {
        alert("⚠️ Please enter a username.");
        return;
        }

        try {
        const response = await fetch(`${window.location.origin}/profile/${username}`)
        const text = await response.text();

        if (text.trim() === "User not found") {
            alert("⚠️ That user does not exist!");
            searchInput.value = "";
            return;
        }

        window.location.href = `${window.location.origin}/profile/${username}`;
        } catch (error) {
        alert("⚠️ Something went wrong while searching.");
        }
    };

    searchBtn.addEventListener("click", handleSearch);
    searchInput.addEventListener("keypress", (e) => {
        if (e.key === "Enter") handleSearch();
    });
});

function createChartElements() {
    const historyContainer = document.querySelector('.history_container');
    
    // chart container with just the canvas
    const chartContainer = document.createElement('div');
    chartContainer.className = 'chart-container';
    chartContainer.id = 'chartContainer';
    chartContainer.innerHTML = `<canvas id="scoreChart"></canvas>`;
    
    historyContainer.parentNode.insertBefore(chartContainer, historyContainer.nextSibling);
    
    // chart dropdown
    const existingDropdown = document.querySelector('.dropdown-container');
    const chartDropdown = document.createElement('div');
    chartDropdown.className = 'dropdown-container';
    chartDropdown.id = 'chartDropdownContainer';
    chartDropdown.style.display = 'none';
    chartDropdown.innerHTML = `
        <button class="dropdown-btn" id="chartDropdownBtn">Game Mode ▼</button>
        <div class="dropdown-list" id="chartDropdownList">
            <a href="#" data-filter="all">All</a>
            <a href="#" data-filter="Timer Starts">Timer Starts</a>
            <a href="#" data-filter="Falling Letters">Falling Letters</a>
            <a href="#" data-filter="Fill in the Blanks">Fill in the Blanks</a>
        </div>
    `;
    
    existingDropdown.parentNode.insertBefore(chartDropdown, existingDropdown.nextSibling);
    
    setupChartDropdown();
}

function setupChartDropdown() {
    const chartBtn = document.getElementById('chartDropdownBtn');
    const chartList = document.getElementById('chartDropdownList');
    
    if (chartBtn && chartList) {
        chartBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            chartList.style.display = chartList.style.display === "flex" ? "none" : "flex";
        });

        chartList.addEventListener("click", (e) => {
            if (e.target.tagName === "A") {
                e.preventDefault();
                const selected = e.target.textContent;
                const filter = e.target.dataset.filter;
                
                chartBtn.textContent = selected + " ▼";
                updateChart(filter);
                chartList.style.display = "none";
            }
        });

        document.addEventListener("click", (e) => {
            if (!chartBtn.contains(e.target) && !chartList.contains(e.target)) {
                chartList.style.display = "none";
            }
        });
    }
}

function profile(username) {
    window.location.href = `${window.location.origin}/profile/${username}`;
}

document.getElementById("logoutBtn").addEventListener("click", function () {
    window.location.href = `${window.location.origin}${this.dataset.href}`;
});

let scoreChart;
let isShowingGraph = false;

function changehistory() {
    const historyContainer = document.querySelector('.history_container');
    const chartContainer = document.getElementById('chartContainer');
    const historyBtn = document.querySelector('.vso');
    const recentGamesHeader = document.querySelector('.recent-games h3');
    const originalDropdown = document.querySelector('.dropdown-container');
    const chartDropdown = document.getElementById('chartDropdownContainer');
    
    if (!isShowingGraph) {
        // Show chart, hide list
        historyContainer.style.display = "none";
        chartContainer.style.display = "block";
        historyBtn.textContent = "Show Match History";
        recentGamesHeader.textContent = "Score Over Time";
        originalDropdown.style.display = "none";
        chartDropdown.style.display = "inline-block";
        isShowingGraph = true;
        
        initializeChart();
    } else {
        // Show list, hide chart
        historyContainer.style.display = "block";
        chartContainer.style.display = "none";
        historyBtn.textContent = "View Score Overtime";
        recentGamesHeader.textContent = "Recent Games";
        originalDropdown.style.display = "inline-block";
        chartDropdown.style.display = "none";
        isShowingGraph = false;
        
        // Destroy chart
        if (scoreChart) {
            scoreChart.destroy();
            scoreChart = null;
        }
    }
}

function initializeChart() {
    const ctx = document.getElementById('scoreChart').getContext('2d');
    
    if (scoreChart) {
        scoreChart.destroy();
    }
    
    createChart(ctx, 'all');
}

function createChart(ctx, filter) {
    let filteredData = gameSessionsData;
    
    if (filter !== 'all') {
        filteredData = gameSessionsData.filter(game =>
            game.room && game.room.game_type === filter && !game.is_creator
        );
    } else {
        // filter creator entries for chart (no scores)
        filteredData = gameSessionsData.filter(game => !game.is_creator);
    }
    
    filteredData.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    
    const labels = filteredData.map((game, index) => `Game ${index + 1}`);
    const scores = filteredData.map(game => game.score);
    
    scoreChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Score',
                data: scores,
                borderColor: '#667eea',
                backgroundColor: 'rgba(102, 126, 234, 0.1)',
                borderWidth: 3,
                fill: true,
                tension: 0.4,
                pointBackgroundColor: '#667eea',
                pointBorderColor: '#ffffff',
                pointBorderWidth: 2,
                pointRadius: 6,
                pointHoverRadius: 8
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    backgroundColor: 'rgba(0, 0, 0, 0.8)',
                    titleColor: '#ffffff',
                    bodyColor: '#ffffff',
                    borderColor: '#667eea',
                    borderWidth: 1,
                    displayColors: false,
                    callbacks: {
                        title: function(context) {
                            const index = context[0].dataIndex;
                            return `Room: ${filteredData[index].room.room_code}`;
                        },
                        label: function(context) {
                            return `Score: ${context.parsed.y}`;
                        },
                        afterLabel: function(context) {
                            const index = context.dataIndex;
                            return `Game Type: ${filteredData[index].room.game_type}`;
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    max: 100,
                    grid: {
                        color: 'rgba(0, 0, 0, 0.1)'
                    },
                    ticks: {
                        color: '#666'
                    }
                },
                x: {
                    grid: {
                        color: 'rgba(0, 0, 0, 0.1)'
                    },
                    ticks: {
                        color: '#666'
                    }
                }
            },
            interaction: {
                intersect: false,
                mode: 'index'
            }
        }
    });
}

function updateChart(filter) {
    if (!scoreChart) return;
    
    let filteredData = gameSessionsData;
    
    if (filter !== 'all') {
        filteredData = gameSessionsData.filter(game => 
            game.room && game.room.game_type === filter
        );
    }
    
    filteredData.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    
    const labels = filteredData.map((game, index) => `Game ${index + 1}`);
    const scores = filteredData.map(game => game.score);
    
    scoreChart.data.labels = labels;
    scoreChart.data.datasets[0].data = scores;
    
    // Update tooltip callbacks to use current filtered data
    scoreChart.options.plugins.tooltip.callbacks.title = function(context) {
        const index = context[0].dataIndex;
        return `Room: ${filteredData[index].room.room_code}`;
    };
    
    scoreChart.options.plugins.tooltip.callbacks.afterLabel = function(context) {
        const index = context.dataIndex;
        return `Game Type: ${filteredData[index].room.game_type}`;
    };
    
    scoreChart.update('active');
}