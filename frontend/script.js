// --- CONFIGURATION ---
// IMPORTANT: Use your LIVE Vercel backend URL here for deployment.
const API_BASE_URL = 'https://eco-quest-theta.vercel.app';
let qrScanner;
let myChart = null; // Global variable for the chart instance
let cameraStream = null; // Global variable to hold the camera stream

// --- SESSION MANAGEMENT ---
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
            const contentType = response.headers.get("content-type");
            if (contentType && contentType.includes("application/json")) {
                return response.json();
            }
            return;
        } catch (error) {
            console.error('API Request Error:', error);
            throw error; // This will trigger "Failed to fetch" if the server is down/unreachable
        }
    },
    loginTeacher: (email, password) => api.request('/api/teacher/login', { method: 'POST', body: { email, password } }),
    loginStudent: (student_id_card) => api.request('/api/student/login', { method: 'POST', body: { student_id_card } }),
    getStudentProfile: (studentId) => api.request(`/api/student/${studentId}/profile`),
    getTasks: () => api.request('/api/tasks'),
    createTask: (taskData) => api.request('/api/tasks', { method: 'POST', body: taskData }),
    createFullQuiz: (quizData) => api.request('/api/quiz', { method: 'POST', body: quizData }),
    getStudentSubmissionHistory: (studentId) => api.request(`/api/student/${studentId}/submissions`),
    submitQuiz: (studentId, taskId, answers) => api.request(`/api/student/${studentId}/submit/quiz/${taskId}`, { method: 'POST', body: { answers } }),
    submitPhoto: (studentId, taskId) => api.request(`/api/student/${studentId}/submit/photo/${taskId}`, { method: 'POST' }),
    getTeacherSubmissions: (teacherId) => api.request(`/api/teacher/${teacherId}/submissions`),
    getTeacherRoster: (teacherId) => api.request(`/api/teacher/${teacherId}/roster`),
    addStudent: (teacherId, fullName, className, studentIdCard) => api.request(`/api/teacher/${teacherId}/add-student`, { method: 'POST', body: { full_name: fullName, class_name: className, student_id_card: studentIdCard } }),
    approveSubmission: (submissionId) => api.request(`/api/teacher/submissions/${submissionId}/approve`, { method: 'POST' }),
    rejectSubmission: (submissionId) => api.request(`/api/teacher/submissions/${submissionId}/reject`, { method: 'POST' }),
    getLeaderboard: () => api.request('/api/leaderboard'),
};

// --- PAGE INITIALIZER ROUTER ---
document.addEventListener('DOMContentLoaded', () => {
    const pagePath = window.location.pathname;
    const pageInitializers = {
        '/teacher_login.html': initTeacherLoginPage,
        '/student_login.html': initStudentLoginPage,
        '/teacher_dashboard.html': initTeacherDashboardPage,
        '/add_student.html': initAddStudentPage,
        '/student_dashboard.html': initStudentDashboardPage,
        '/task_detail.html': initTaskDetailPage,
        '/quiz.html': initQuizPage,
        '/leaderboard.html': initLeaderboardPage,
        '/create_task.html': initCreateTaskPage,
        '/create_quiz.html': initCreateQuizPage,
    };
    for (const path in pageInitializers) {
        // Use endsWith to handle both local file paths and deployed paths
        if (pagePath.endsWith(path) || (pagePath.endsWith('/') && path === '/index.html')) {
            pageInitializers[path]();
            return;
        }
    }
});


// --- INITIALIZATION FUNCTIONS ---
function initTeacherLoginPage() {
    const form = document.getElementById('teacher-login-form');
    if (!form) return;
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        try {
            const data = await api.loginTeacher(document.getElementById('teacher-email').value, document.getElementById('teacher-password').value);
            session.saveUser({ type: 'teacher', ...data });
            window.location.href = 'teacher_dashboard.html';
        } catch (error) { notifications.error(error.message); }
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
            notifications.error(error.message);
            setTimeout(() => { if (qrScanner && qrScanner.getState() !== 2) startQrScanner('qr-reader', () => { }); }, 3000);
        }
    });
}

async function initTeacherDashboardPage() {
    const user = session.getUser();
    if (!user || user.type !== 'teacher') return window.location.href = 'teacher_login.html';
    const teacherName = document.getElementById('teacher-name');
    if (teacherName) teacherName.textContent = user.full_name;
    await refreshTeacherDashboard(user.teacher_id);
}

async function initStudentDashboardPage() {
    const user = session.getUser();
    if (!user || user.type !== 'student') return window.location.href = 'student_login.html';
    const container = document.getElementById('dashboard-content');
    try {
        const [profile, tasks, history] = await Promise.all([
            api.getStudentProfile(user.student_id),
            api.getTasks(),
            api.getStudentSubmissionHistory(user.student_id)
        ]);
        renderStudentDashboard(container, profile, tasks);
        renderSubmissionHistory(history);
    } catch (error) {
        notifications.error(`Could not load dashboard data: ${error.message}`);
        if (container) container.innerHTML = `<p class="error-message">Could not load dashboard. Please try logging in again.</p>`;
    }
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
        if (!studentIdCard) return notifications.error('Please scan the student ID card first.');
        try {
            await api.addStudent(user.teacher_id, fullName, className, studentIdCard);
            notifications.success(`Student "${fullName}" was added!`);
            setTimeout(() => window.location.href = 'teacher_dashboard.html', 1500);
        } catch (error) { notifications.error(error.message); }
    });
}

function initCreateTaskPage() {
    const user = session.getUser();
    if (!user || user.type !== 'teacher') return window.location.href = 'teacher_login.html';
    const form = document.getElementById('create-task-form');
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
            notifications.success('New mission created successfully!');
            setTimeout(() => window.location.href = 'teacher_dashboard.html', 1500);
        } catch (error) { notifications.error(`Failed to create mission: ${error.message}`); }
    });
}

function initCreateQuizPage() {
    const user = session.getUser();
    if (!user || user.type !== 'teacher') return window.location.href = 'teacher_login.html';
    const questionsContainer = document.getElementById('questions-container');
    const addQuestionBtn = document.getElementById('add-question-btn');
    const form = document.getElementById('create-quiz-form');
    let questionCount = 0;
    const addQuestionBlock = () => {
        questionCount++;
        const block = document.createElement('div');
        block.className = 'question-block'; block.id = `question-block-${questionCount}`;
        block.innerHTML = `<h3>Question ${questionCount}</h3><button type="button" class="remove-question-btn" data-remove-id="${questionCount}">&times;</button><div class="form-group"><label>Question Text</label><input type="text" class="q-text" required></div><div class="form-group"><label>Option A</label><input type="text" class="q-opt-a" required></div><div class="form-group"><label>Option B</label><input type="text" class="q-opt-b" required></div><div class="form-group"><label>Option C</label><input type="text" class="q-opt-c" required></div><div class="form-group correct-answer-group"><label>Correct Answer</label><select class="q-correct"><option value="A">Option A</option><option value="B">Option B</option><option value="C">Option C</option></select></div>`;
        questionsContainer.appendChild(block);
        block.querySelector('.remove-question-btn').addEventListener('click', () => block.remove());
    };
    addQuestionBtn.addEventListener('click', addQuestionBlock);
    addQuestionBlock();
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const questions = [];
        const questionBlocks = document.querySelectorAll('.question-block');
        if (questionBlocks.length === 0) return notifications.error('A quiz must have at least one question.');
        questionBlocks.forEach(block => {
            questions.push({
                question_text: block.querySelector('.q-text').value,
                option_a: block.querySelector('.q-opt-a').value,
                option_b: block.querySelector('.q-opt-b').value,
                option_c: block.querySelector('.q-opt-c').value,
                correct_answer: block.querySelector('.q-correct').value
            });
        });
        const quizData = { title: document.getElementById('quiz-title').value, description: document.getElementById('quiz-description').value, points_reward: parseInt(document.getElementById('quiz-points').value), questions: questions };
        try {
            await api.createFullQuiz(quizData);
            notifications.success('New quiz created successfully!');
            setTimeout(() => window.location.href = 'teacher_dashboard.html', 1500);
        } catch (error) { notifications.error(`Failed to create quiz: ${error.message}`); }
    });
}

async function initTaskDetailPage() {
    const user = session.getUser();
    if (!user || user.type !== 'student') return window.location.href = 'student_login.html';
    const taskId = new URLSearchParams(window.location.search).get('id');
    const container = document.getElementById('task-content');
    if (!taskId) { container.innerHTML = '<p class="error-message">Task ID not found.</p>'; return; }
    try {
        const tasks = await api.getTasks(); const task = tasks.find(t => t.id === taskId);
        if (!task) { container.innerHTML = '<p class="error-message">Task not found.</p>'; return; }
        if (task.task_type === "photo_upload") setupCameraUI(container, task);
        else if (task.task_type === "secret_code") setupSecretCodeUI(container, task);
    } catch (error) { notifications.error(error.message); }
}

async function initQuizPage() {
    const user = session.getUser();
    if (!user || user.type !== 'student') return window.location.href = 'student_login.html';
    const taskId = new URLSearchParams(window.location.search).get('id');
    const quizTitleEl = document.getElementById('quiz-title'); const form = document.getElementById('quiz-form');
    if (!taskId) { quizTitleEl.innerHTML = 'Error: Quiz ID not found.'; return; }
    try {
        const tasks = await api.getTasks(); const task = tasks.find(t => t.id === taskId);
        if (!task || task.task_type !== 'quiz') { quizTitleEl.innerHTML = 'Error: Quiz not found.'; return; }
        quizTitleEl.innerHTML = task.title;
        form.innerHTML = task.questions.map((q, index) => `<div class="quiz-question card"><p><strong>Question ${index + 1}: ${q.question_text}</strong></p><div class="quiz-options" data-question-id="${q.id}"><input type="radio" id="q${q.id}_a" name="q_${q.id}" value="A" required><label for="q${q.id}_a">A) ${q.option_a}</label><input type="radio" id="q${q.id}_b" name="q_${q.id}" value="B"><label for="q${q.id}_b">B) ${q.option_b}</label><input type="radio" id="q${q.id}_c" name="q_${q.id}" value="C"><label for="q${q.id}_c">C) ${q.option_c}</label></div></div>`).join('') + '<button type="submit" class="btn btn-blue">Submit Answers</button>';
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const answers = {}; task.questions.forEach(q => { const sel = form.querySelector(`input[name="q_${q.id}"]:checked`); if (sel) answers[q.id] = sel.value; });
            if (Object.keys(answers).length !== task.questions.length) return notifications.error('Please answer all questions.');
            try {
                const result = await api.submitQuiz(user.student_id, taskId, answers);
                notifications.success(result.message); setTimeout(() => window.location.href = 'student_dashboard.html', 2000);
            } catch (error) { notifications.error(`Error: ${error.message}`); }
        });
    } catch (error) { quizTitleEl.innerHTML = `Error: ${error.message}`; }
}

async function initLeaderboardPage() {
    const container = document.getElementById('leaderboard-content');
    try {
        const leaderboard = await api.getLeaderboard();
        container.innerHTML = `<table class="list-table"><thead><tr><th>Rank</th><th>Name</th><th>Points</th></tr></thead><tbody>${leaderboard.map((s, i) => `<tr class="rank-${i + 1}"><td>${i + 1}</td><td>${s.full_name}</td><td>${s.points}</td></tr>`).join('')}</tbody></table>`;
    } catch (error) { notifications.error(error.message); if (container) container.innerHTML = `<p class="error-message">Could not load leaderboard.</p>`; }
}

// --- DYNAMIC DATA & RENDER FUNCTIONS ---
async function refreshTeacherDashboard(teacherId) {
    try {
        const [submissions, roster] = await Promise.all([api.getTeacherSubmissions(teacherId), api.getTeacherRoster(teacherId)]);
        renderSubmissions(submissions); renderRoster(roster); renderAnalyticsChart(roster);
    } catch (error) { notifications.error(`Could not refresh dashboard data: ${error.message}`); }
}

function renderStudentDashboard(container, profile, tasks) { /* ... same as previous final version ... */ }
function renderSubmissions(submissions) { /* ... same as previous final version ... */ }
function renderRoster(roster) { /* ... same as previous final version ... */ }

function renderAnalyticsChart(roster) {
    const chartEl = document.getElementById('tasksChart'); if (!chartEl) return;
    const ctx = chartEl.getContext('2d'); if (myChart) myChart.destroy();
    const dist = { 'Beginner (0-100)': 0, 'Intermediate (101-300)': 0, 'Advanced (>300)': 0 };
    roster.forEach(s => { if (s.points <= 100) dist['Beginner (0-100)']++; else if (s.points <= 300) dist['Intermediate (101-300)']++; else dist['Advanced (>300)']++; });
    myChart = new Chart(ctx, { type: 'doughnut', data: { labels: Object.keys(dist), datasets: [{ data: Object.values(dist), backgroundColor: ['#34d399', '#fbbf24', '#60a5fa'], hoverOffset: 4 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'top' } } } });
}

function renderSubmissionHistory(history) { /* ... same as previous final version ... */ }

// --- UI SETUP FUNCTIONS ---
function setupSecretCodeUI(container, task) { /* ... same as previous final version ... */ }
function setupCameraUI(container, task) { /* ... same as previous final version ... */ }

// --- GLOBAL ACTION HANDLERS ---
async function approveSubmission(submissionId) {
    if (!confirm('Approve this submission?')) return;
    try { await api.approveSubmission(submissionId); notifications.success('Submission approved!'); refreshTeacherDashboard(session.getUser().teacher_id); } catch (error) { notifications.error(error.message); }
}
async function rejectSubmission(submissionId) {
    if (!confirm('Reject this submission?')) return;
    try { await api.rejectSubmission(submissionId); notifications.success('Submission rejected.'); refreshTeacherDashboard(session.getUser().teacher_id); } catch (error) { notifications.error(error.message); }
}

// --- UTILITY FUNCTIONS ---
function startQrScanner(elementId, callback) {
    if (document.getElementById(elementId)) { qrScanner = new Html5Qrcode(elementId); qrScanner.start({ facingMode: "environment" }, { fps: 10, qrbox: 250 }, callback, () => { }).catch(err => console.error("QR Scanner failed to start.", err)); }
}
function stopQrScanner() { if (qrScanner && qrScanner.getState() === 2) { qrScanner.stop().catch(err => console.error("QR Scanner failed to stop.", err)); } }
function startCamera(videoEl) { navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } }).then(stream => { cameraStream = stream; videoEl.srcObject = stream; }).catch(err => notifications.error("Could not access camera.")); }
function stopCamera() { if (cameraStream) { cameraStream.getTracks().forEach(track => track.stop()); } }
window.addEventListener('beforeunload', stopCamera);