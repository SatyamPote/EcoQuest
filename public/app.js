// ---- CONFIG ----
const HF_BACKEND = "https://ahmedatk-ecoquest.hf.space"; // replace with your backend URL

// ---- TEACHER LOGIN ----
function teacherLogin() {
  const email = document.getElementById("email").value;
  const password = document.getElementById("password").value;
  firebase.auth().signInWithEmailAndPassword(email, password)
    .then(() => {
      document.getElementById("login-box").style.display = "none";
      document.getElementById("teacher-panel").style.display = "block";
      startTeacherScanner();
      fetchAttendance();
    })
    .catch(err => {
      document.getElementById("login-status").innerText = err.message;
    });
}

function logout() {
  firebase.auth().signOut();
  location.reload();
}

// ---- TEACHER SCANNER ----
function startTeacherScanner() {
  const html5QrCode = new Html5Qrcode("reader");
  html5QrCode.start(
    { facingMode: "environment" },
    { fps: 10, qrbox: 250 },
    async (decodedText) => {
      document.getElementById("scan-status").innerText = "Scanned: " + decodedText;
      // Register student
      const res = await fetch(`${HF_BACKEND}/register-student`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ barcode_id: decodedText })
      });
      const j = await res.json();
      if (res.ok) {
        document.getElementById("scan-status").innerText = "Registered student: " + j.student.id;
        fetchAttendance();
      } else {
        document.getElementById("scan-status").innerText = "Error: " + (j.detail || "failed");
      }
    }
  );
}

// ---- STUDENT SCANNER ----
if (window.location.pathname.includes("student.html")) {
  const html5QrCode = new Html5Qrcode("reader");
  html5QrCode.start(
    { facingMode: "environment" },
    { fps: 10, qrbox: 250 },
    async (decodedText) => {
      document.getElementById("scan-status").innerText = "Scanned: " + decodedText;
      const res = await fetch(`${HF_BACKEND}/verify-student`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ barcode_id: decodedText })
      });
      const j = await res.json();
      if (res.ok) {
        document.getElementById("student-info").style.display = "block";
        document.getElementById("student-name").innerText = j.student.name || "Student";
        document.getElementById("student-class").innerText = j.student.class || "N/A";
        document.getElementById("student-barcode").innerText = j.student.barcode_id;
      } else {
        document.getElementById("scan-status").innerText = "Error: " + (j.detail || "not found");
      }
    }
  );
}

// ---- ATTENDANCE LIST ----
async function fetchAttendance() {
  const res = await fetch(`${HF_BACKEND}/teacher/attendance`);
  const j = await res.json();
  if (res.ok) {
    const container = document.getElementById("attendance");
    let html = "<table><tr><th>Time</th><th>Student</th><th>Action</th></tr>";
    j.attendance.forEach(row => {
      html += `<tr><td>${new Date(row.timestamp).toLocaleString()}</td><td>${row.students?.name || row.student_id}</td><td>${row.action}</td></tr>`;
    });
    html += "</table>";
    container.innerHTML = html;
  }
}
