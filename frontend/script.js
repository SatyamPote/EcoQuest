// --- CONFIGURATION ---
const API_BASE_URL = 'https://eco-quest-theta.vercel.app';
let qrScanner;
let myChart = null;
let cameraStream = null;

console.log("--- EcoQuest Script Initialized ---");

// --- SESSION MANAGEMENT ---
const session = {
    saveUser: (user) => localStorage.setItem('ecoquest_user', JSON.stringify(user)),
    getUser: () => JSON.parse(localStorage.getItem('ecoquest_user')),
    logout: () => {
        stopCamera();
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
            if (response.headers.get("content-type")?.includes("application/json")) {
                return response.json();
            }
        } catch (error) {
            console.error('API Request Error:', error);
            throw error;
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
    const isIndex = pagePath.endsWith('/') || pagePath.endsWith('/index.html');

    const pageInitializers = {
        'teacher_login.html': initTeacherLoginPage,
        'student_login.html': initStudentLoginPage,
        'teacher_dashboard.html': initTeacherDashboardPage,
        'add_student.html': initAddStudentPage,
        'student_dashboard.html': initStudentDashboardPage,
        'task_detail.html': initTaskDetailPage,
        'quiz.html': initQuizPage,
        'leaderboard.html': initLeaderboardPage,
        'create_task.html': initCreateTaskPage,
        'create_quiz.html': initCreateQuizPage,
    };

    if (isIndex) return;

    for (const path in pageInitializers) {
        if (pagePath.endsWith(path)) {
            pageInitializers[path]();
            break;
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
            setTimeout(() => {
                if (qrScanner && qrScanner.getState() !== 2) startQrScanner('qr-reader', () => {});
            }, 3000);
        }
    });
}

async function initTeacherDashboardPage() {
    const user = session.getUser();
    if (!user || user.type !== 'teacher') return window.location.href = 'teacher_login.html';
    const teacherName = document.getElementById('teacher-name');
    if (teacherName) teacherName.textContent = user.full_name;
    // await refreshTeacherDashboard(user.teacher_id);
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
        alert(`Could not load dashboard data: ${error.message}`);
        if (container) container.innerHTML = `<p class="error-message">Could not load dashboard.</p>`;
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
            alert('New mission created successfully!');
            setTimeout(() => window.location.href = 'teacher_dashboard.html', 1500);
        } catch (error) {
            alert(`Failed to create mission: ${error.message}`);
        }
    });
}

function initCreateQuizPage() {
    const user = session.getUser();
    if (!user || user.type !== 'teacher') return window.location.href = 'teacher_login.html';
    const questionsContainer = document.getElementById('questions-container');
    const addQuestionBtn = document.getElementById('add-question-btn');
    const form = document.getElementById('create-quiz-form');
    if (!questionsContainer || !addQuestionBtn || !form) return;

    let questionCounter = 0;
    const addQuestionBlock = () => {
        questionCounter++;
        const block = document.createElement('div');
        block.className = 'question-block';
        block.innerHTML = `<h3>Question ${questionCounter}</h3><button type="button" class="remove-question-btn">&times;</button><div class="form-group"><label>Question Text</label><input type="text" class="q-text" required></div><div class="form-group"><label>Option A</label><input type="text" class="q-opt-a" required></div><div class="form-group"><label>Option B</label><input type="text" class="q-opt-b" required></div><div class="form-group"><label>Option C</label><input type="text" class="q-opt-c" required></div><div class="form-group correct-answer-group"><label>Correct Answer</label><select class="q-correct"><option value="A">A</option><option value="B">B</option><option value="C">C</option></select></div>`;
        questionsContainer.appendChild(block);
        block.querySelector('.remove-question-btn').addEventListener('click', () => block.remove());
    };

    addQuestionBtn.addEventListener('click', addQuestionBlock);
    addQuestionBlock(); // Start with one question

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const questions = Array.from(document.querySelectorAll('.question-block')).map(block => ({
            question_text: block.querySelector('.q-text').value,
            option_a: block.querySelector('.q-opt-a').value,
            option_b: block.querySelector('.q-opt-b').value,
            option_c: block.querySelector('.q-opt-c').value,
            correct_answer: block.querySelector('.q-correct').value
        }));

        if (questions.length === 0) return alert('A quiz must have at least one question.');

        const quizData = {
            title: document.getElementById('quiz-title').value,
            description: document.getElementById('quiz-description').value,
            points_reward: parseInt(document.getElementById('quiz-points').value),
            questions: questions
        };

        try {
            await api.createFullQuiz(quizData);
            alert('New quiz created successfully!');
            setTimeout(() => window.location.href = 'teacher_dashboard.html', 1500);
        } catch (error) {
            alert(`Failed to create quiz: ${error.message}`);
        }
    });
}

async function initTaskDetailPage() {
    const user = session.getUser();
    if (!user || user.type !== 'student') return window.location.href = 'student_login.html';
    const taskId = new URLSearchParams(window.location.search).get('id');
    const container = document.getElementById('task-content');
    if (!container) return;
    if (!taskId) return container.innerHTML = '<p class="error-message">Task ID not found.</p>';

    try {
        const tasks = await api.getTasks();
        const task = tasks.find(t => t.id === taskId);
        if (!task) return container.innerHTML = '<p class="error-message">Task not found.</p>';

        if (task.task_type === "photo_upload") setupCameraUI(container, task);
        else if (task.task_type === "secret_code") setupSecretCodeUI(container, task);
    } catch (error) {
        alert(error.message);
    }
}

async function initQuizPage() {
    const user = session.getUser();
    if (!user || user.type !== 'student') return window.location.href = 'student_login.html';
    const taskId = new URLSearchParams(window.location.search).get('id');
    const quizTitleEl = document.getElementById('quiz-title');
    const form = document.getElementById('quiz-form');
    if (!quizTitleEl || !form) return;
    if (!taskId) return quizTitleEl.textContent = 'Error: Quiz ID not found.';

    try {
        const tasks = await api.getTasks();
        const task = tasks.find(t => t.id === taskId);
        if (!task || task.task_type !== 'quiz') return quizTitleEl.textContent = 'Error: Quiz not found.';

        quizTitleEl.textContent = task.title;
        form.innerHTML = task.questions.map((q, index) => `
            <div class="quiz-question card">
                <p><strong>Question ${index + 1}: ${q.question_text}</strong></p>
                <div class="quiz-options">
                    <input type="radio" id="q${q.id}_a" name="q_${q.id}" value="A" required><label for="q${q.id}_a">A) ${q.option_a}</label>
                    <input type="radio" id="q${q.id}_b" name="q_${q.id}" value="B"><label for="q${q.id}_b">B) ${q.option_b}</label>
                    <input type="radio" id="q${q.id}_c" name="q_${q.id}" value="C"><label for="q${q.id}_c">C) ${q.option_c}</label>
                </div>
            </div>`).join('') + '<button type="submit" class="btn btn-blue">Submit Answers</button>';

        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const answers = {};
            task.questions.forEach(q => {
                const selected = form.querySelector(`input[name="q_${q.id}"]:checked`);
                if (selected) answers[q.id] = selected.value;
            });
            if (Object.keys(answers).length !== task.questions.length) return alert('Please answer all questions.');
            try {
                const result = await api.submitQuiz(user.student_id, taskId, answers);
                alert(result.message);
                setTimeout(() => window.location.href = 'student_dashboard.html', 2000);
            } catch (error) {
                alert(`Error: ${error.message}`);
            }
        });
    } catch (error) {
        quizTitleEl.textContent = `Error: ${error.message}`;
    }
}

async function initLeaderboardPage() {
    const container = document.getElementById('leaderboard-content');
    if (!container) return;
    try {
        const leaderboard = await api.getLeaderboard();
        container.innerHTML = `<table class="list-table"><thead><tr><th>Rank</th><th>Name</th><th>Points</th></tr></thead><tbody>${leaderboard.map((s, i) => `
            <tr class="rank-${i + 1}"><td>${i + 1}</td><td>${s.full_name}</td><td>${s.points}</td></tr>`).join('')}</tbody></table>`;
    } catch (error) {
        alert(error.message);
        container.innerHTML = `<p class="error-message">Could not load leaderboard.</p>`;
    }
}

// --- DYNAMIC DATA & RENDER FUNCTIONS ---
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

function renderStudentDashboard(container, profile, tasks) {
    if (!container) return;
    const getPet = (points) => {
        const levels = { 1: { name: 'Sprout', emoji: '🌱', next: 100 }, 2: { name: 'Sapling', emoji: '🌳', next: 300 }, 3: { name: 'Mighty Tree', emoji: '🌲', next: Infinity } };
        let level = 1; if (points >= levels[1].next) level = 2; if (points >= levels[2].next) level = 3;
        const progress = level < 3 ? (points / levels[level].next) * 100 : 100;
        return { ...levels[level], progress };
    };
    const pet = getPet(profile.points);
    const badgesHTML = profile.badges.map(b => `<span class="badge" title="${b.name}: ${b.description}">${b.icon_url}</span>`).join('');
    container.innerHTML = `<div class="dashboard-grid"><aside class="sidebar"><div class="card eco-pet-card"><h2>${profile.full_name}</h2><span class="eco-pet-emoji">${pet.emoji}</span><span><strong>${pet.name}</strong></span><div class="progress-bar-container"><div class="progress-bar" style="width: ${pet.progress}%;"></div></div><div class="points-display">${profile.points} Points</div><div class="badges-grid">${badgesHTML || '<p style="font-size: 0.9rem; color: var(--text-light);">No badges yet!</p>'}</div></div></aside><main class="content"><h2>Available Eco-Missions</h2><div class="tasks-grid">${tasks.map(task => `<a href="${task.task_type === 'quiz' ? 'quiz.html?id=' + task.id : 'task_detail.html?id=' + task.id}" class="card task-card"><div><span class="task-type-badge task-type-${task.task_type.replace('_','')}">${task.task_type.replace('_', ' ')}</span><h3>${task.title}</h3><p>${task.description}</p></div><strong class="task-card-points">${task.points_reward} Points</strong></a>`).join('')}</div></main></div>`;
}

// **FIXED**: This function now targets the inner content div to prevent duplication.
function renderSubmissions(submissions) {
    const container = document.getElementById('submissions-content');
    if (!container) return;
    if (submissions.length === 0) {
        container.innerHTML = '<p>No pending submissions. Great job!</p>';
    } else {
        const tableRows = submissions.map(s => `<tr><td>${s.student_name}</td><td>${s.task_title}</td><td class="submission-actions"><button class="btn btn-green" onclick="approveSubmission('${s.id}')">Approve</button><button class="btn btn-red" onclick="rejectSubmission('${s.id}')">Reject</button></td></tr>`).join('');
        container.innerHTML = `<table class="list-table"><thead><tr><th>Student</th><th>Task</th><th>Actions</th></tr></thead><tbody>${tableRows}</tbody></table>`;
    }
}

// **FIXED**: This function now targets the inner content div and fixes a typo.
function renderRoster(roster) {
    const container = document.getElementById('roster-content');
    if (!container) return;
    if (roster.length === 0) {
        container.innerHTML = '<p>No students have been added yet.</p>';
    } else {
        const tableRows = roster.map(s => `<tr><td>${s.full_name}</td><td>${s.class_name}</td><td>${s.points}</td></tr>`).join('');
        container.innerHTML = `<table class="list-table"><thead><tr><th>Name</th><th>Class</th><th>Points</th></tr></thead><tbody>${tableRows}</tbody></table>`;
    }
}

function renderAnalyticsChart(roster) {
    const chartEl = document.getElementById('tasksChart');
    if (!chartEl) return;
    const ctx = chartEl.getContext('2d');
    if (myChart) myChart.destroy();
    const dist = { 'Beginner (0-100)': 0, 'Intermediate (101-300)': 0, 'Advanced (>300)': 0 };
    roster.forEach(s => {
        if (s.points <= 100) dist['Beginner (0-100)']++;
        else if (s.points <= 300) dist['Intermediate (101-300)']++;
        else dist['Advanced (>300)']++;
    });
    myChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: Object.keys(dist),
            datasets: [{ data: Object.values(dist), backgroundColor: ['#34d399', '#fbbf24', '#60a5fa'], hoverOffset: 4 }]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'top' } } }
    });
}

function renderSubmissionHistory(history) {
    const container = document.getElementById('history-content');
    if (!container) return;
    if (history.length === 0) {
        container.innerHTML = '<p>You haven\'t submitted any tasks yet. Get started!</p>';
    } else {
        const statusBadges = { approved: '<span class="status-badge status-approved">Approved</span>', pending: '<span class="status-badge status-pending">Pending</span>', rejected: '<span class="status-badge status-rejected">Rejected</span>' };
        container.innerHTML = `<table class="list-table"><thead><tr><th>Task</th><th>Submitted</th><th>Status</th></tr></thead><tbody>${history.map(s => `<tr><td>${s.task_title}</td><td>${new Date(s.submitted_at).toLocaleDateString()}</td><td>${statusBadges[s.status] || s.status}</td></tr>`).join('')}</tbody></table>`;
    }
}

// --- UI SETUP FUNCTIONS ---
function setupSecretCodeUI(container, task) {
    const user = session.getUser();
    container.innerHTML = `<h2>${task.title}</h2><p>${task.description}</p><div class="form-group"><label for="secret-code">Enter Secret Code</label><input type="text" id="secret-code" placeholder="e.g., OAK-123"></div><button id="submit-btn" class="btn btn-blue">Verify Code</button>`;
    document.getElementById('submit-btn').onclick = () => {
        if (document.getElementById('secret-code').value.toUpperCase() === 'OAK-123') {
            api.submitPhoto(user.student_id, task.id).then(() => {
                alert('Correct Code! Task submitted!');
                setTimeout(() => window.location.href = 'student_dashboard.html', 1500);
            });
        } else {
            alert('Incorrect code. Please try again.');
        }
    };
}

function setupCameraUI(container, task) {
    const user = session.getUser();
    container.innerHTML = `<div class="camera-container"><video id="camera-view" autoplay playsinline></video><canvas id="photo-preview" class="hidden"></canvas></div><div id="camera-controls"><button id="capture-btn" class="btn btn-blue">Capture Photo</button></div><div id="preview-controls" class="hidden"><button id="retake-btn" class="btn btn-gray">Retake</button><button id="submit-photo-btn" class="btn btn-green">Submit</button></div>`;
    const video = document.getElementById('camera-view');
    const canvas = document.getElementById('photo-preview');
    const captureBtn = document.getElementById('capture-btn');
    const retakeBtn = document.getElementById('retake-btn');
    const submitBtn = document.getElementById('submit-photo-btn');
    const cameraControls = document.getElementById('camera-controls');
    const previewControls = document.getElementById('preview-controls');
    
    startCamera(video);
    
    captureBtn.addEventListener('click', () => {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
        video.classList.add('hidden');
        cameraControls.classList.add('hidden');
        canvas.classList.remove('hidden');
        previewControls.classList.remove('hidden');
        stopCamera();
    });

    retakeBtn.addEventListener('click', () => {
        video.classList.remove('hidden');
        cameraControls.classList.remove('hidden');
        canvas.classList.add('hidden');
        previewControls.classList.add('hidden');
        startCamera(video);
    });

    submitBtn.addEventListener('click', async () => {
        try {
            await api.submitPhoto(user.student_id, task.id);
            alert('Photo submitted for review!');
            setTimeout(() => window.location.href = 'student_dashboard.html', 1500);
        } catch (error) {
            alert(`Submission failed: ${error.message}`);
        }
    });
}

// --- GLOBAL ACTION HANDLERS ---
async function approveSubmission(submissionId) {
    if (!confirm('Are you sure you want to approve this submission?')) return;
    try {
        await api.approveSubmission(submissionId);
        alert('Submission approved!');
        await refreshTeacherDashboard(session.getUser().teacher_id);
    } catch (error) {
        alert(error.message);
    }
}

async function rejectSubmission(submissionId) {
    if (!confirm('Are you sure you want to reject this submission?')) return;
    try {
        await api.rejectSubmission(submissionId);
        alert('Submission rejected.');
        await refreshTeacherDashboard(session.getUser().teacher_id);
    } catch (error) {
        alert(error.message);
    }
}

// --- UTILITY FUNCTIONS ---
function startQrScanner(elementId, callback) {
    const scannerEl = document.getElementById(elementId);
    if (scannerEl) {
        qrScanner = new Html5Qrcode(elementId);
        qrScanner.start({ facingMode: "environment" }, { fps: 10, qrbox: 250 }, callback, () => {})
            .catch(err => console.error("QR Scanner failed to start.", err));
    }
}

function stopQrScanner() {
    if (qrScanner && qrScanner.getState() === 2) {
        qrScanner.stop().catch(err => console.error("QR Scanner failed to stop.", err));
    }
}

function startCamera(videoEl) {
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
        .then(stream => {
            cameraStream = stream;
            videoEl.srcObject = stream;
        })
        .catch(err => {
            console.error(err);
            alert("Could not access camera. Please check browser permissions.");
        });
}

function stopCamera() {
    if (cameraStream) {
        cameraStream.getTracks().forEach(track => track.stop());
        cameraStream = null;
    }
}

window.addEventListener('beforeunload', stopCamera);