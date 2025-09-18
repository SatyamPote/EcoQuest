// --- CONFIGURATION ---
const API_BASE_URL = 'https://eco-quest-theta.vercel.app';
let qrScanner;

// --- SESSION MANAGEMENT ---
// We use localStorage to keep the user logged in across pages
const session = {
    saveUser: (user) => localStorage.setItem('ecoquest_user', JSON.stringify(user)),
    getUser: () => JSON.parse(localStorage.getItem('ecoquest_user')),
    logout: () => {
        localStorage.removeItem('ecoquest_user');
        window.location.href = 'index.html';
    }
};

// --- API HELPERS ---
const api = {
    async request(endpoint, options = {}) {
        const url = `${API_BASE_URL}${endpoint}`;
        const headers = { 'Content-Type': 'application/json', ...options.headers };
        const config = { ...options, headers };
        if (options.body) config.body = JSON.stringify(options.body);

        try {
            const response = await fetch(url, config);
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.detail || 'An API error occurred');
            }
            // Handle cases where the response might be empty (e.g., 204 No Content)
            const contentType = response.headers.get("content-type");
            if (contentType && contentType.indexOf("application/json") !== -1) {
                return response.json();
            }
            return; // Return nothing for non-json responses
        } catch (error) {
            console.error('API Request Error:', error);
            throw error;
        }
    },
    loginTeacher: (email, password) => api.request('/api/teacher/login', { method: 'POST', body: { email, password } }),
    loginStudent: (student_id_card) => api.request('/api/student/login', { method: 'POST', body: { student_id_card } }),
    getStudentProfile: (studentId) => api.request(`/api/student/${studentId}/profile`),
    getTasks: () => api.request('/api/tasks'),
    submitQuiz: (studentId, taskId, answers) => api.request(`/api/student/${studentId}/submit/quiz/${taskId}`, { method: 'POST', body: { answers } }),
    submitPhoto: (studentId, taskId) => api.request(`/api/student/${studentId}/submit/photo/${taskId}`, { method: 'POST' }),
    getTeacherSubmissions: (teacherId) => api.request(`/api/teacher/${teacherId}/submissions`),
    addStudent: (teacherId, fullName, className, studentIdCard) => api.request(`/api/teacher/${teacherId}/add-student`, { method: 'POST', body: { full_name: fullName, class_name: className, student_id_card: studentIdCard } }),
    approveSubmission: (submissionId) => api.request(`/api/teacher/submissions/${submissionId}/approve`, { method: 'POST' }),
    rejectSubmission: (submissionId) => api.request(`/api/teacher/submissions/${submissionId}/reject`, { method: 'POST' }),
    getLeaderboard: () => api.request('/api/leaderboard'),
};


// --- PAGE-SPECIFIC INITIALIZATION ---
document.addEventListener('DOMContentLoaded', () => {
    const pagePath = window.location.pathname;

    if (pagePath.includes('teacher_login.html')) {
        initTeacherLoginPage();
    } else if (pagePath.includes('student_login.html')) {
        initStudentLoginPage();
    } else if (pagePath.includes('teacher_dashboard.html')) {
        initTeacherDashboardPage();
    } else if (pagePath.includes('add_student.html')) {
        initAddStudentPage();
    } else if (pagePath.includes('student_dashboard.html')) {
        initStudentDashboardPage();
    }

    // Universal logout button handler
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
        logoutBtn.onclick = () => session.logout();
    }
});

function initTeacherLoginPage() {
    const form = document.getElementById('teacher-login-form');
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('teacher-email').value;
        const password = document.getElementById('teacher-password').value;
        try {
            const data = await api.loginTeacher(email, password);
            session.saveUser({ type: 'teacher', ...data });
            window.location.href = 'teacher_dashboard.html';
        } catch (error) {
            document.getElementById('login-error').textContent = error.message;
        }
    });
}

function initStudentLoginPage() {
    startQrScanner('qr-reader', async (decodedText) => {
        try {
            stopQrScanner();
            const data = await api.loginStudent(decodedText);
            session.saveUser({ type: 'student', ...data });
            window.location.href = 'student_dashboard.html';
        } catch (error) {
            document.getElementById('login-error').textContent = error.message;
        }
    });
}

async function initTeacherDashboardPage() {
    const user = session.getUser();
    if (!user || user.type !== 'teacher') {
        window.location.href = 'teacher_login.html';
        return;
    }

    document.getElementById('teacher-name').textContent = user.full_name;
    const container = document.getElementById('submissions-container');

    try {
        const submissions = await api.getTeacherSubmissions(user.teacher_id);
        if (submissions.length === 0) {
            container.innerHTML = '<p>No pending submissions. Great job!</p>';
            return;
        }
        const tableHTML = `
            <table class="list-table">
                <thead><tr><th>Student</th><th>Task</th><th>Actions</th></tr></thead>
                <tbody>
                    ${submissions.map(s => `
                        <tr>
                            <td>${s.student_name}</td>
                            <td>${s.task_title}</td>
                            <td class="submission-actions">
                                <button class="btn btn-green" onclick="approveSubmission('${s.id}')">Approve</button>
                                <button class="btn btn-red" onclick="rejectSubmission('${s.id}')">Reject</button>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
        container.innerHTML = tableHTML;
    } catch (error) {
        container.innerHTML = `<p class="error-message">Could not load submissions: ${error.message}</p>`;
    }
}

function initAddStudentPage() {
    const user = session.getUser();
    if (!user || user.type !== 'teacher') {
        window.location.href = 'teacher_login.html';
        return;
    }

    startQrScanner('qr-reader', (decodedText) => {
        stopQrScanner();
        document.getElementById('scanned-student-id').value = decodedText;
        const feedbackDiv = document.getElementById('scanned-id-feedback');
        feedbackDiv.textContent = `Scanned ID: ${decodedText}`;
        feedbackDiv.style.display = 'block';
        document.getElementById('qr-reader').style.display = 'none';
    });

    const form = document.getElementById('add-student-form');
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const studentIdCard = document.getElementById('scanned-student-id').value;
        const fullName = document.getElementById('new-student-name').value;
        const className = document.getElementById('new-student-class').value;

        if (!studentIdCard) {
            alert('Please scan the student ID card first.');
            return;
        }

        try {
            await api.addStudent(user.teacher_id, fullName, className, studentIdCard);
            alert(`Student "${fullName}" has been successfully added!`);
            window.location.href = 'teacher_dashboard.html';
        } catch (error) {
            alert(`Error: ${error.message}`);
        }
    });
}

async function initStudentDashboardPage() {
    const user = session.getUser();
    if (!user || user.type !== 'student') {
        window.location.href = 'student_login.html';
        return;
    }

    const container = document.getElementById('dashboard-content');
    try {
        const [profile, tasks] = await Promise.all([
            api.getStudentProfile(user.student_id),
            api.getTasks()
        ]);

        const getPet = (points) => {
            if (points < 100) return { emoji: '🌱', status: 'Sprout' };
            if (points < 500) return { emoji: '🌳', status: 'Sapling' };
            return { emoji: '🌲', status: 'Mighty Tree' };
        };
        const pet = getPet(profile.points);
        const badgesHTML = profile.badges.map(b => `<span class="badge" title="${b.name}: ${b.description}">${b.icon_url}</span>`).join('');

        container.innerHTML = `
            <div class="dashboard-grid">
                <aside class="sidebar">
                    <div class="card profile-header">
                        <h2>${profile.full_name}</h2>
                        <span class="eco-pet-emoji">${pet.emoji}</span>
                        <span>Your Eco-Pet: <strong>${pet.status}</strong></span>
                        <div class="points-display">${profile.points}</div>
                        <div class="badges-grid">${badgesHTML || '<p>No badges yet!</p>'}</div>
                    </div>
                </aside>
                <main class="content">
                    <h2>Available Eco-Missions</h2>
                    <div class="tasks-grid">
                       ${tasks.map(task => `
                            <div class="card task-card" onclick="alert('Task selected! Feature coming soon.')">
                                <div>
                                    <span class="task-type-badge task-type-${task.task_type === 'quiz' ? 'quiz' : 'photo'}">${task.task_type.replace('_', ' ')}</span>
                                    <h3>${task.title}</h3>
                                    <p>${task.description}</p>
                                </div>
                                <strong class="task-card-points">${task.points_reward} Points</strong>
                            </div>`).join('')}
                    </div>
                </main>
            </div>
        `;
    } catch (error) {
        container.innerHTML = `<p class="error-message">Could not load dashboard: ${error.message}</p>`;
    }
}

// --- GLOBAL ACTION HANDLERS ---
// These are called from the `onclick` attributes in the HTML
async function approveSubmission(submissionId) {
    if (!confirm('Are you sure you want to approve this submission?')) return;
    try {
        await api.approveSubmission(submissionId);
        alert('Submission approved!');
        location.reload(); // Simple way to refresh the list
    } catch (error) {
        alert(`Error: ${error.message}`);
    }
}

async function rejectSubmission(submissionId) {
    if (!confirm('Are you sure you want to reject this submission?')) return;
    try {
        await api.rejectSubmission(submissionId);
        alert('Submission rejected.');
        location.reload();
    } catch (error) {
        alert(`Error: ${error.message}`);
    }
}

// --- QR SCANNER UTILS ---
function startQrScanner(elementId, callback) {
    if (document.getElementById(elementId)) {
        qrScanner = new Html5Qrcode(elementId);
        qrScanner.start({ facingMode: "environment" }, { fps: 10, qrbox: 250 }, callback, () => {})
        .catch(err => console.error("QR Scanner failed to start.", err));
    }
}

function stopQrScanner() {
    if (qrScanner && qrScanner.getState() === 2) { // 2 is SCANNING state
        qrScanner.stop().catch(err => console.error("QR Scanner failed to stop.", err));
    }
}