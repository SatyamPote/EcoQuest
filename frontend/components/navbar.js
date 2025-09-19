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
        
        // ADDED a dropdown for creating tasks
        const createTaskLinks = !isStudent ? `
            <div class="dropdown">
                <a href="#" class="nav-link">Create Task ▼</a>
                <div class="dropdown-content">
                    <a href="create_task.html">Create Mission</a>
                    <a href="create_quiz.html">Create Quiz</a>
                </div>
            </div>
        ` : '';
        
        this.container.innerHTML = `<div class="navbar"><a href="${dashboardLink}" class="nav-brand">EcoQuest</a><nav class="nav-links">${createTaskLinks}${leaderboardLink}<a href="#" id="logout-link">Logout</a></nav></div>`;
        document.getElementById('logout-link').addEventListener('click', (e) => {
            e.preventDefault();
            session.logout();
        });
    }
}
document.addEventListener('DOMContentLoaded', () => new Navbar());