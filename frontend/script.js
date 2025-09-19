// --- CONFIGURATION ---
const API_BASE_URL = 'http://127.https://eco-quest-:8000'; // Corrected IP
let qrScanner;
let myChart = null; // Global variable for the chart instance

// --- SESSION MANAGEMENT ---
const session = {
    saveUser: (user) => localStorage.setItem('ecoquest_user', JSON.stringify(user)),
    getUser: () => JSON.parse(localStorage.getItem('ecoquest_user')),
    logout: () => {
        localStorage.removeItem('ecoquest_user');
        window.location.href = 'index.html';
    }
};

// --- API HELPERS (with all new endpoints) ---
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
            const contentType = response.headers.get("content-type");
            if (contentType && contentType.indexOf("application/json") !== -1) {
                return response.json();
            }
            return;
        } catch (error) {
            console.error('API Request Error:', error);
            throw error;
        }
    },
    // Auth
    loginTeacher: (email, password) => api.request('/api/teacher/login', { method: 'POST', body: { email, password } }),
    loginStudent: (student_id_card) => api.request('/api/student/login', { method: 'POST', body: { student_id_card } }),
    // Profiles & Tasks
    getStudentProfile: (studentId) => api.request(`/api/student/${studentId}/profile`),
    getTasks: () => api.request('/api/tasks'),
    createTask: (taskData) => api.request('/api/tasks', { method: 'POST', body: taskData }), // NEW
    // Submissions
    submitQuiz: (studentId, taskId, answers) => api.request(`/api/student/${studentId}/submit/quiz/${taskId}`, { method: 'POST', body: { answers } }),
    submitPhoto: (studentId, taskId) => api.request(`/api/student/${studentId}/submit/photo/${taskId}`, { method: 'POST' }),
    getStudentSubmissionHistory: (studentId) => api.request(`/api/student/${studentId}/submissions`), // NEW
    // Teacher Actions
    getTeacherSubmissions: (teacherId) => api.request(`/api/teacher/${teacherId}/submissions`),
    getTeacherRoster: (teacherId) => api.request(`/api/teacher/${teacherId}/roster`),
    addStudent: (teacherId, fullName, className, studentIdCard) => api.request(`/api/teacher/${teacherId}/add-student`, { method: 'POST', body: { full_name: fullName, class_name: className, student_id_card: studentIdCard } }),
    approveSubmission: (submissionId) => api.request(`/api/teacher/submissions/${submissionId}/approve`, { method: 'POST' }),
    rejectSubmission: (submissionId) => api.request(`/api/teacher/submissions/${submissionId}/reject`, { method: 'POST' }),
    // Gamification
    getLeaderboard: () => api.request('/api/leaderboard'),
};

// --- PAGE INITIALIZER ROUTER ---
document.addEventListener('DOMContentLoaded', () => {
    const pagePath = window.location.pathname;

    if (pagePath.includes('teacher_login.html')) initTeacherLoginPage();
    else if (pagePath.includes('student_login.html')) initStudentLoginPage();
    else if (pagePath.includes('teacher_dashboard.html')) initTeacherDashboardPage();
    else if (pagePath.includes('add_student.html')) initAddStudentPage();
    else if (pagePath.includes('student_dashboard.html')) initStudentDashboardPage();
    else if (pagePath.includes('task_detail.html')) initTaskDetailPage();
    else if (pagePath.includes('quiz.html')) initQuizPage();
    else if (pagePath.includes('leaderboard.html')) initLeaderboardPage();
    else if (pagePath.includes('create_task.html')) initCreateTaskPage(); // NEW PAGE

    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) logoutBtn.onclick = () => session.logout();
});


// --- INITIALIZATION FUNCTIONS ---

// Login and other simple pages remain the same as the stable version
function initTeacherLoginPage() { /* ... unchanged ... */ }
function initStudentLoginPage() { /* ... unchanged ... */ }
function initAddStudentPage() { /* ... unchanged ... */ }
function initTaskDetailPage() { /* ... unchanged ... */ }
function initQuizPage() { /* ... unchanged ... */ }
function initLeaderboardPage() { /* ... unchanged ... */ }

// NEW: Page initializer for the create task form
function initCreateTaskPage() {
    const user = session.getUser();
    if (!user || user.type !== 'teacher') return window.location.href = 'teacher_login.html';
    
    const form = document.getElementById('create-task-form');
    if (!form) return;

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const taskData = {
            title: document.getElementById('task-title').value,
            description: document.getElementById('task-description').value,
            points_reward: parseInt(document.getElementById('task-points').value),
            task_type: document.getElementById('task-type').value
        };

        try {
            await api.createTask(taskData);
            alert('New task created successfully!');
            setTimeout(() => window.location.href = 'teacher_dashboard.html', 1500);
        } catch (error) {
            alert(`Failed to create task: ${error.message}`);
        }
    });
}

// UPDATED: Teacher dashboard now uses a refresh pattern
async function initTeacherDashboardPage() {
    const user = session.getUser();
    if (!user || user.type !== 'teacher') return window.location.href = 'teacher_login.html';
    
    const teacherName = document.getElementById('teacher-name');
    if (teacherName) teacherName.textContent = user.full_name;
    
    // Initial data load
    refreshTeacherDashboard(user.teacher_id);
}

// UPDATED: Student dashboard now fetches and renders submission history
async function initStudentDashboardPage() {
    const user = session.getUser();
    if (!user || user.type !== 'student') return window.location.href = 'student_login.html';
    
    const container = document.getElementById('dashboard-content');
    try {
        const [profile, tasks, history] = await Promise.all([
            api.getStudentProfile(user.student_id),
            api.getTasks(),
            api.getStudentSubmissionHistory(user.student_id) // Fetch history
        ]);
        renderStudentDashboard(container, profile, tasks);
        renderSubmissionHistory(history); // Render history
    } catch (error) {
        alert(`Could not load dashboard data: ${error.message}`);
        if(container) container.innerHTML = `<p class="error-message">Could not load dashboard.</p>`;
    }
}


// --- DYNAMIC DATA HANDLING & RE-RENDERING ---

// NEW: Refreshes all data on the teacher dashboard
async function refreshTeacherDashboard(teacherId) {
    try {
        const [submissions, roster] = await Promise.all([
            api.getTeacherSubmissions(teacherId),
            api.getTeacherRoster(teacherId)
        ]);
        renderSubmissions(submissions);
        renderRoster(roster);
        renderAnalyticsChart(roster);
    } catch (error) {
        alert(`Could not refresh dashboard data: ${error.message}`);
    }
}

// --- RENDER FUNCTIONS ---

function renderStudentDashboard(container, profile, tasks) { /* ... unchanged ... */ }
function renderSubmissions(submissions) { /* ... unchanged ... */ }
function renderRoster(roster) { /* ... unchanged ... */ }

// NEW: Renders the student's submission history table
function renderSubmissionHistory(history) {
    const container = document.getElementById('history-content');
    if (!container) return;
    
    if (history.length === 0) {
        container.innerHTML = '<p>You haven\'t submitted any tasks yet. Get started!</p>';
        return;
    }
    
    const statusBadges = {
        approved: '<span class="status-badge status-approved">Approved</span>',
        pending: '<span class="status-badge status-pending">Pending</span>',
        rejected: '<span class="status-badge status-rejected">Rejected</span>',
    };

    const tableHTML = `<table class="list-table"><thead><tr><th>Task</th><th>Submitted</th><th>Status</th></tr></thead><tbody>
        ${history.map(s => `<tr><td>${s.task_title}</td><td>${new Date(s.submitted_at).toLocaleDateString()}</td><td>${statusBadges[s.status] || s.status}</td></tr>`).join('')}
    </tbody></table>`;
    container.innerHTML = tableHTML;
}

// UPDATED: Chart rendering now destroys the old instance first
function renderAnalyticsChart(roster) {
    const chartEl = document.getElementById('tasksChart');
    if (!chartEl) return;
    const ctx = chartEl.getContext('2d');

    // Destroy the old chart before drawing a new one to prevent conflicts
    if (myChart) {
        myChart.destroy();
    }

    const taskDistribution = { 'Low Points (0-100)': 0, 'Medium (101-300)': 0, 'High (>300)': 0 };
    roster.forEach(s => {
        if (s.points <= 100) taskDistribution['Low Points (0-100)']++;
        else if (s.points <= 300) taskDistribution['Medium (101-300)']++;
        else taskDistribution['High (>300)']++;
    });
    
    // Store the new chart instance globally
    myChart = new Chart(ctx, { 
        type: 'doughnut', 
        data: { 
            labels: Object.keys(taskDistribution), 
            datasets: [{ 
                label: 'Student Point Distribution', 
                data: Object.values(taskDistribution), 
                backgroundColor: ['#34d399', '#fbbf24', '#60a5fa'], 
                hoverOffset: 4 
            }] 
        } 
    });
}

// --- GLOBAL ACTION HANDLERS (UPDATED FOR DYNAMIC REFRESH) ---

async function approveSubmission(submissionId) {
    if (!confirm('Are you sure you want to approve this submission?')) return;
    try {
        await api.approveSubmission(submissionId);
        alert('Submission approved!');
        const user = session.getUser();
        if (user && user.type === 'teacher') {
            refreshTeacherDashboard(user.teacher_id); // Re-fetch and re-render
        }
    } catch (error) {
        alert(error.message);
    }
}

async function rejectSubmission(submissionId) {
    if (!confirm('Are you sure you want to reject this submission?')) return;
    try {
        await api.rejectSubmission(submissionId);
        alert('Submission rejected.');
        const user = session.getUser();
        if (user && user.type === 'teacher') {
            refreshTeacherDashboard(user.teacher_id); // Re-fetch and re-render
        }
    } catch (error) {
        alert(error.message);
    }
}

// --- QR SCANNER UTILS ---
function startQrScanner(elementId, callback) { /* ... unchanged ... */ }
function stopQrScanner() { /* ... unchanged ... */ }


// --- UNCHANGED FUNCTIONS (for completeness) ---
function initTeacherLoginPage() {
    const form = document.getElementById('teacher-login-form');
    if (!form) return;
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('teacher-email').value;
        const password = document.getElementById('teacher-password').value;
        try {
            const data = await api.loginTeacher(email, password);
            session.saveUser({ type: 'teacher', ...data });
            window.location.href = 'teacher_dashboard.html';
        } catch (error) {
            alert(error.message);
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
            alert(error.message);
            setTimeout(() => { startQrScanner('qr-reader',_=>{}); }, 3000);
        }
    });
}

function initAddStudentPage() {
    const user = session.getUser();
    if (!user || user.type !== 'teacher') return window.location.href = 'teacher_login.html';
    startQrScanner('qr-reader', (decodedText) => {
        stopQrScanner();
        document.getElementById('scanned-student-id').value = decodedText;
        const feedbackDiv = document.getElementById('scanned-id-feedback');
        feedbackDiv.textContent = `Scanned ID: ${decodedText}`;
        feedbackDiv.style.display = 'block';
        document.getElementById('qr-reader').style.display = 'none';
    });
    const form = document.getElementById('add-student-form');
    if (!form) return;
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const studentIdCard = document.getElementById('scanned-student-id').value;
        const fullName = document.getElementById('new-student-name').value;
        const className = document.getElementById('new-student-class').value;
        if (!studentIdCard) return alert('Please scan the student ID card first.');
        try {
            await api.addStudent(user.teacher_id, fullName, className, studentIdCard);
            alert(`Student "${fullName}" was added!`);
            setTimeout(() => window.location.href = 'teacher_dashboard.html', 1500);
        } catch (error) {
            alert(error.message);
        }
    });
}

async function initTaskDetailPage() {
    const user = session.getUser();
    if (!user || user.type !== 'student') return window.location.href = 'student_login.html';
    const taskId = new URLSearchParams(window.location.search).get('id');
    const container = document.getElementById('task-content');
    if (!taskId) return container.innerHTML = '<p class="error-message">Task ID not found.</p>';
    try {
        const tasks = await api.getTasks();
        const task = tasks.find(t => t.id === taskId);
        if (!task) return container.innerHTML = '<p class="error-message">Task not found.</p>';
        if (task.task_type === "photo_upload") {
            container.innerHTML = `<h2>${task.title}</h2><p>${task.description}</p><strong class="task-card-points">Reward: ${task.points_reward} Points</strong><div style="margin-top: 1.5rem;"><button id="submit-btn" class="btn btn-green">Submit for Review</button></div>`;
            document.getElementById('submit-btn').onclick = async () => {
                await api.submitPhoto(user.student_id, taskId);
                alert('Task submitted for review!');
                setTimeout(() => window.location.href = 'student_dashboard.html', 1500);
            };
        } else if (task.task_type === "secret_code") {
            container.innerHTML = `<h2>${task.title}</h2><p>${task.description}</p><div class="form-group"><label for="secret-code">Enter Secret Code</label><input type="text" id="secret-code"></div><button id="submit-btn" class="btn btn-blue">Verify Code</button>`;
            document.getElementById('submit-btn').onclick = () => {
                const code = document.getElementById('secret-code').value;
                if (code.toUpperCase() === 'OAK-123') {
                    api.submitPhoto(user.student_id, taskId).then(() => {
                        alert('Correct Code! Task submitted!');
                        setTimeout(() => window.location.href = 'student_dashboard.html', 1500);
                    });
                } else {
                    alert('Incorrect code. Please try again.');
                }
            };
        }
    } catch (error) {
        alert(error.message);
    }
}

async function initQuizPage() {
    const user = session.getUser();
    if (!user || user.type !== 'student') return window.location.href = 'student_login.html';
    const taskId = new URLSearchParams(window.location.search).get('id');
    const quizTitle = document.getElementById('quiz-title');
    const form = document.getElementById('quiz-form');
    if (!quizTitle || !form) return;
    if (!taskId) return quizTitle.textContent = 'Error: Quiz ID not found.';
    try {
        const tasks = await api.getTasks();
        const task = tasks.find(t => t.id === taskId);
        if (!task || task.task_type !== 'quiz') return quizTitle.textContent = 'Error: Quiz not found.';
        quizTitle.textContent = task.title;
        const questionsHTML = task.questions.map((q, index) => `
            <div class="quiz-question card"><p><strong>Question ${index + 1}: ${q.question_text}</strong></p>
            <div class="quiz-options" data-question-id="${q.id}">
                <input type="radio" id="q${q.id}_a" name="q_${q.id}" value="A" required><label for="q${q.id}_a">A) ${q.option_a}</label>
                <input type="radio" id="q${q.id}_b" name="q_${q.id}" value="B"><label for="q${q.id}_b">B) ${q.option_b}</label>
                <input type="radio" id="q${q.id}_c" name="q_${q.id}" value="C"><label for="q${q.id}_c">C) ${q.option_c}</label>
            </div></div>`).join('');
        form.innerHTML = questionsHTML + '<button type="submit" class="btn btn-blue">Submit Answers</button>';
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const answers = {};
            task.questions.forEach(q => {
                const selected = form.querySelector(`input[name="q_${q.id}"]:checked`);
                if (selected) answers[q.id] = selected.value;
            });
            if (Object.keys(answers).length !== task.questions.length) {
                return alert('Please answer all questions before submitting.');
            }
            try {
                const result = await api.submitQuiz(user.student_id, taskId, answers);
                alert(result.message);
                window.location.href = 'student_dashboard.html';
            } catch (error) {
                alert(`Error: ${error.message}`);
            }
        });
    } catch (error) {
        quizTitle.textContent = `Error: ${error.message}`;
    }
}

async function initLeaderboardPage() {
    const container = document.getElementById('leaderboard-content');
    if (!container) return;
    try {
        const leaderboard = await api.getLeaderboard();
        const tableHTML = `<table class="list-table"><thead><tr><th>Rank</th><th>Name</th><th>Points</th></tr></thead><tbody>
            ${leaderboard.map((s, i) => `<tr class="rank-${i+1}"><td>${i+1}</td><td>${s.full_name}</td><td>${s.points}</td></tr>`).join('')}
        </tbody></table>`;
        container.innerHTML = tableHTML;
    } catch (error) {
        alert(error.message);
        container.innerHTML = `<p class="error-message">Could not load leaderboard.</p>`;
    }
}

function renderStudentDashboard(container, profile, tasks) {
    if (!container) return;
    const getPet = (points) => {
        const levels = { 1: { name: 'Sprout', emoji: '🌱', next: 100 }, 2: { name: 'Sapling', emoji: '🌳', next: 300 }, 3: { name: 'Mighty Tree', emoji: '🌲', next: Infinity } };
        let level = 1;
        if (points >= levels[1].next) level = 2; if (points >= levels[2].next) level = 3;
        const progress = level < 3 ? (points / levels[level].next) * 100 : 100;
        return { ...levels[level], progress };
    };
    const pet = getPet(profile.points);
    const badgesHTML = profile.badges.map(b => `<span class="badge" title="${b.name}: ${b.description}">${b.icon_url}</span>`).join('');
    container.innerHTML = `<div class="dashboard-grid"><aside class="sidebar"><div class="card eco-pet-card"><h2>${profile.full_name}</h2><span class="eco-pet-emoji">${pet.emoji}</span><span><strong>${pet.name}</strong></span><div class="progress-bar-container"><div class="progress-bar" style="width: ${pet.progress}%;"></div></div><div class="points-display">${profile.points} Points</div><div class="badges-grid">${badgesHTML || '<p style="font-size: 0.9rem; color: var(--text-light);">No badges yet!</p>'}</div></div></aside><main class="content"><h2>Available Eco-Missions</h2><div class="tasks-grid">${tasks.map(task => `<a href="${task.task_type === 'quiz' ? 'quiz.html?id=' + task.id : 'task_detail.html?id=' + task.id}" class="card task-card"><div><span class="task-type-badge task-type-${task.task_type.replace('_','')}">${task.task_type.replace('_', ' ')}</span><h3>${task.title}</h3><p>${task.description}</p></div><strong class="task-card-points">${task.points_reward} Points</strong></a>`).join('')}</div></main></div>`;
}

function renderSubmissions(submissions) {
    const container = document.getElementById('submissions-container');
    if(!container) return;
    if (submissions.length === 0) {
        container.innerHTML = '<h2>Pending Submissions</h2><p>No pending submissions. Great job!</p>';
        return;
    }
    const tableHTML = `<h2>Pending Submissions</h2><table class="list-table"><thead><tr><th>Student</th><th>Task</th><th>Actions</th></tr></thead><tbody>${submissions.map(s => `<tr><td>${s.student_name}</td><td>${s.task_title}</td><td class="submission-actions"><button class="btn btn-green" onclick="approveSubmission('${s.id}')">Approve</button><button class="btn btn-red" onclick="rejectSubmission('${s.id}')">Reject</button></td></tr>`).join('')}</tbody></table>`;
    container.innerHTML = tableHTML;
}

function renderRoster(roster) {
    const container = document.getElementById('roster-container');
    if (!container) return;
    const tableHTML = `<table class="list-table"><thead><tr><th>Name</th><th>Class</th><th>Points</th></tr></thead><tbody>${roster.map(s => `<tr><td>${s.full_name}</td><td>${s.class_name}</td><td>${s.points}</td></tr>`).join('')}</tbody></table>`;
    container.innerHTML = '<h2>Student Roster</h2>' + tableHTML;
}

function startQrScanner(elementId, callback) {
    if (document.getElementById(elementId)) {
        qrScanner = new Html5Qrcode(elementId);
        qrScanner.start({ facingMode: "environment" }, { fps: 10, qrbox: 250 }, callback, () => {}).catch(err => console.error("QR Scanner failed to start.", err));
    }
}

function stopQrScanner() {
    if (qrScanner && qrScanner.getState() === 2) { 
        qrScanner.stop().catch(err => console.error("QR Scanner failed to stop.", err));
    }
}