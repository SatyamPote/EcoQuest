class Navbar {
    constructor() {
        this.user = JSON.parse(localStorage.getItem('ecoquest_user'));
        this.container = document.getElementById('navbar-container');
        this.render();
    }
    render() {
        if (!this.container || !this.user) return;
        const isStudent = this.user.type === 'student';
        const dashboardLink = isStudent ? 'student_dashboard.html' : 'teacher_dashboard.html';
        const leaderboardLink = isStudent ? '<a href="leaderboard.html">Leaderboard</a>' : '';
        this.container.innerHTML = `<div class="navbar"><a href="${dashboardLink}" class="nav-brand">EcoQuest</a><nav class="nav-links">${leaderboardLink}<a href="#" id="logout-link">Logout</a></nav></div>`;
        document.getElementById('logout-link').addEventListener('click', (e) => {
            e.preventDefault();
            localStorage.removeItem('ecoquest_user');
            window.location.href = 'index.html';
        });
    }
}
document.addEventListener('DOMContentLoaded', () => new Navbar());