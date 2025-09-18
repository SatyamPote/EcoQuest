// --- CONFIGURATION ---
// IMPORTANT: Replace this with your backend's URL once deployed on Vercel
const API_BASE_URL = 'http://127.0.0.1:8000'; 

// --- STATE MANAGEMENT ---
const appState = {
    currentUser: null, // Will hold { type: 'teacher'/'student', data: {...} }
    students: [],      // For teacher dashboard
};

// --- DOM ELEMENTS ---
const appDiv = document.getElementById('app');
let qrScanner; // To hold the scanner instance

// --- ROUTING / VIEW MANAGEMENT ---
const navigateTo = (page) => {
    // Hide all pages
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    // Show the target page
    const targetPage = document.getElementById(page);
    if (targetPage) {
        targetPage.classList.add('active');
    } else {
        console.error(`Page "${page}" not found.`);
        navigateTo('role-selector-page'); // Fallback to home
    }
};

// --- TEMPLATES / RENDER FUNCTIONS ---
// Each function returns an HTML string for a specific "page" or view

const renderRoleSelectorPage = () => {
    return `
        <div id="role-selector-page" class="page active centered-container">
            <h1>Welcome to EcoQuest</h1>
            <p>Your journey to a greener planet starts here!</p>
            <div class="role-selector">
                <div class="role-card" onclick="navigateTo('student-login-page')">
                    <h2 class="student-text">I am a Student</h2>
                    <p>Start my eco-missions!</p>
                </div>
                <div class="role-card" onclick="navigateTo('teacher-login-page')">
                    <h2 class="teacher-text">I am a Teacher</h2>
                    <p>Manage my class.</p>
                </div>
            </div>
        </div>
    `;
};

const renderTeacherLoginPage = () => {
    return `
        <div id="teacher-login-page" class="page">
            <div class="back-button" onclick="navigateTo('role-selector-page')">&larr; Back</div>
            <div class="form-container">
                <h2 class="teacher-text">Teacher Login</h2>
                <form id="teacher-login-form">
                    <div class="form-group">
                        <label for="teacher-email">Email</label>
                        <input type="email" id="teacher-email" required>
                    </div>
                    <div class="form-group">
                        <label for="teacher-password">Password</label>
                        <input type="password" id="teacher-password" required>
                    </div>
                    <button type="submit" class="btn btn-primary">Login</button>
                    <p id="teacher-login-error" class="error-message"></p>
                </form>
            </div>
        </div>
    `;
};

const renderStudentLoginPage = () => {
    return `
        <div id="student-login-page" class="page centered-container">
            <div class="back-button" onclick="navigateTo('role-selector-page')">&larr; Back</div>
            <h1>Student Login</h1>
            <p>Scan the QR code on your ID card to begin.</p>
            <div id="qr-reader" style="width:100%; max-width: 400px; margin: auto;"></div>
            <p id="student-login-error" class="error-message"></p>
        </div>
    `;
};

const renderTeacherDashboardPage = () => {
    const teacher = appState.currentUser.data;
    const studentListHTML = appState.students.map(s => `
        <li class="student-list-item">
            <span class="student-name">${s.full_name}</span>
            <span class="student-points">${s.points} Points</span>
        </li>
    `).join('');

    return `
        <div id="teacher-dashboard-page" class="page">
            <div class="dashboard-header">
                <h1>Welcome, ${teacher.full_name}!</h1>
                <p>Here's an overview of your class.</p>
            </div>
            
            <button id="add-student-btn" class="btn btn-secondary" style="margin-bottom: 1rem;">+ Add New Student</button>
            
            <div id="add-student-form-container" style="display: none;">
                <div class="form-container">
                    <h3>Register New Student</h3>
                    <form id="add-student-form">
                        <div class="form-group">
                            <label for="new-student-name">Student's Full Name</label>
                            <input type="text" id="new-student-name" required>
                        </div>
                        <p>Scan Student ID Card QR Code:</p>
                        <div id="add-student-qr-reader"></div>
                        <div id="scanned-id-feedback" class="scanned-id-feedback" style="display:none;"></div>
                        <input type="hidden" id="scanned-student-id">
                        <button type="submit" class="btn btn-primary" style="margin-top: 1rem;">Add Student</button>
                    </form>
                </div>
            </div>

            <h2>Your Students</h2>
            <ul class="student-list">${studentListHTML || '<p>No students added yet.</p>'}</ul>
        </div>
    `;
};


const renderStudentDashboardPage = () => {
    const student = appState.currentUser.data;
    return `
         <div id="student-dashboard-page" class="page centered-container">
            <h1>Welcome, ${student.full_name}!</h1>
            <p style="font-size: 1.5rem;">Your Current Score</p>
            <p style="font-size: 3rem; font-weight: 700; color: var(--secondary-green); margin-top: -1.5rem;">${student.points} Points</p>
            
            <div style="margin-top: 2rem;">
                <h2>Your Eco-Missions await!</h2>
                <!-- Future tasks will be rendered here -->
            </div>
        </div>
    `;
};

// --- API HELPER FUNCTIONS ---
const api = {
    loginTeacher: async (email, password) => {
        const response = await fetch(`${API_BASE_URL}/api/teacher/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });
        if (!response.ok) throw new Error((await response.json()).detail);
        return response.json();
    },
    loginStudent: async (student_id_card) => {
        const response = await fetch(`${API_BASE_URL}/api/student/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ student_id_card })
        });
        if (!response.ok) throw new Error((await response.json()).detail);
        return response.json();
    },
    getTeacherStudents: async (teacherId) => {
        const response = await fetch(`${API_BASE_URL}/api/teacher/${teacherId}/students`);
        if (!response.ok) throw new Error('Failed to fetch students');
        return response.json();
    },
    addStudent: async (teacherId, fullName, studentIdCard) => {
        const response = await fetch(`${API_BASE_URL}/api/teacher/${teacherId}/add-student`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ full_name: fullName, student_id_card: studentIdCard })
        });
        if (!response.ok) throw new Error((await response.json()).detail);
        return response.json();
    }
};


// --- EVENT LISTENERS & LOGIC ---

function setupEventListeners() {
    // Use event delegation on the app container
    appDiv.addEventListener('click', (e) => {
        if (e.target && e.target.id === 'add-student-btn') {
            const formContainer = document.getElementById('add-student-form-container');
            const isVisible = formContainer.style.display === 'block';
            formContainer.style.display = isVisible ? 'none' : 'block';
            e.target.textContent = isVisible ? '+ Add New Student' : 'Cancel';
            if (!isVisible) {
                startQrScanner('add-student-qr-reader', onAddStudentScanSuccess);
            } else {
                stopQrScanner();
            }
        }
    });

    appDiv.addEventListener('submit', async (e) => {
        e.preventDefault();

        if (e.target.id === 'teacher-login-form') {
            const email = document.getElementById('teacher-email').value;
            const password = document.getElementById('teacher-password').value;
            const errorP = document.getElementById('teacher-login-error');
            try {
                const data = await api.loginTeacher(email, password);
                appState.currentUser = { type: 'teacher', data: { id: data.teacher_id, full_name: data.full_name } };
                appState.students = await api.getTeacherStudents(data.teacher_id);
                initApp(); // Re-render the app with the dashboard
            } catch (error) {
                errorP.textContent = error.message;
            }
        }

        if (e.target.id === 'add-student-form') {
            const teacherId = appState.currentUser.data.id;
            const studentName = document.getElementById('new-student-name').value;
            const studentId = document.getElementById('scanned-student-id').value;

            if (!studentName || !studentId) {
                alert('Please fill name and scan ID.');
                return;
            }

            try {
                await api.addStudent(teacherId, studentName, studentId);
                // Refresh student list and hide form
                appState.students = await api.getTeacherStudents(teacherId);
                initApp();
            } catch (error) {
                alert(`Error: ${error.message}`);
            }
        }
    });
}

function startQrScanner(elementId, callback) {
    // Ensure we don't start multiple scanners
    if (qrScanner && qrScanner.getState()) {
        qrScanner.clear();
    }
    qrScanner = new Html5Qrcode(elementId);
    const config = { fps: 10, qrbox: { width: 250, height: 250 } };
    qrScanner.start({ facingMode: "environment" }, config, callback, (error) => { /* handle error */ });
}

function stopQrScanner() {
    if (qrScanner && qrScanner.getState()) {
        qrScanner.stop().catch(err => console.error("Failed to stop scanner", err));
    }
}

// QR Scan Callbacks
async function onStudentLoginScanSuccess(decodedText, decodedResult) {
    stopQrScanner();
    try {
        const data = await api.loginStudent(decodedText);
        appState.currentUser = { type: 'student', data };
        initApp();
    } catch (error) {
        const errorP = document.getElementById('student-login-error');
        if(errorP) errorP.textContent = error.message;
        // Optionally restart the scanner after an error
        setTimeout(() => startQrScanner('qr-reader', onStudentLoginScanSuccess), 2000);
    }
}

function onAddStudentScanSuccess(decodedText, decodedResult) {
    stopQrScanner();
    document.getElementById('scanned-student-id').value = decodedText;
    const feedbackDiv = document.getElementById('scanned-id-feedback');
    feedbackDiv.textContent = `Scanned ID: ${decodedText}`;
    feedbackDiv.style.display = 'block';
    document.getElementById('add-student-qr-reader').style.display = 'none';
}


// --- INITIALIZATION ---
function initApp() {
    // Stop any running scanner when re-rendering
    stopQrScanner();

    if (!appState.currentUser) {
        appDiv.innerHTML = renderRoleSelectorPage() + renderTeacherLoginPage() + renderStudentLoginPage();
        navigateTo('role-selector-page');
    } else if (appState.currentUser.type === 'teacher') {
        appDiv.innerHTML = renderTeacherDashboardPage();
        navigateTo('teacher-dashboard-page');
    } else if (appState.currentUser.type === 'student') {
        appDiv.innerHTML = renderStudentDashboardPage();
        navigateTo('student-dashboard-page');
    }

    // Since pages are re-rendered, specific logic needs to run *after* render
    // For example, starting the QR scanner for the student login page
    if (!appState.currentUser && document.getElementById('student-login-page').classList.contains('active')) {
         startQrScanner('qr-reader', onStudentLoginScanSuccess);
    }
}

// --- START THE APP ---
document.addEventListener('DOMContentLoaded', () => {
    initApp();
    setupEventListeners();
});