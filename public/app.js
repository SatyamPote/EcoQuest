const HF_BACKEND = "https://ahmedatk-ecoquest.hf.space"; // replace with your backend

// ---- TEACHER LOGIN ----
// ---- GOOGLE LOGIN ----
function googleLogin() {
    const provider = new firebase.auth.GoogleAuthProvider();
    firebase.auth().signInWithPopup(provider)
      .then(result => {
        document.getElementById("login-status").innerText = "Welcome " + result.user.displayName;
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
    document.getElementById("teacher-panel").style.display = "none";
    document.getElementById("login-status").innerText = "Logged out";
  }

// ---- TEACHER SCANNER ----
function startTeacherScanner() {
  Quagga.init({
    inputStream: {
      type: "LiveStream",
      target: document.querySelector('#reader'),
      constraints: { facingMode: "environment" }
    },
    decoder: {
      readers: ["code_128_reader", "ean_reader", "upc_reader"] // common formats
    }
  }, function(err) {
    if (err) { console.error(err); return; }
    Quagga.start();
  });

  Quagga.onDetected(async (result) => {
    const code = result.codeResult.code;
    document.getElementById("scan-status").innerText = "Scanned: " + code;
    Quagga.stop(); // stop after one detection

    // Register student in backend
    const res = await fetch(`${HF_BACKEND}/register-student`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ barcode_id: code })
    });
    const j = await res.json();
    if (res.ok) {
      document.getElementById("scan-status").innerText = "Registered: " + j.student.barcode_id;
      fetchAttendance();
    } else {
      document.getElementById("scan-status").innerText = "Error: " + (j.detail || "failed");
    }
  });
}

// ---- STUDENT SCANNER ----
if (window.location.pathname.includes("student.html")) {
  Quagga.init({
    inputStream: {
      type: "LiveStream",
      target: document.querySelector('#reader'),
      constraints: { facingMode: "environment" }
    },
    decoder: {
      readers: ["code_128_reader", "ean_reader", "upc_reader"]
    }
  }, function(err) {
    if (err) { console.error(err); return; }
    Quagga.start();
  });

  Quagga.onDetected(async (result) => {
    const code = result.codeResult.code;
    document.getElementById("scan-status").innerText = "Scanned: " + code;
    Quagga.stop();

    const res = await fetch(`${HF_BACKEND}/verify-student`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ barcode_id: code })
    });
    const j = await res.json();
    if (res.ok) {
      document.getElementById("student-info").style.display = "block";
      document.getElementById("student-name").innerText = j.student.name || "Student";
      document.getElementById("student-class").innerText = j.student.class || "N/A";
      document.getElementById("student-barcode").innerText = j.student.barcode_id;
    } else {
      document.getElementById("scan-status").innerText = "Not found";
    }
  });
}

// ---- ATTENDANCE ----
async function fetchAttendance() {
  const res = await fetch(`${HF_BACKEND}/teacher/attendance`);
  const j = await res.json();
  if (res.ok) {
    let html = "<table><tr><th>Time</th><th>Student</th><th>Action</th></tr>";
    j.attendance.forEach(row => {
      html += `<tr><td>${new Date(row.timestamp).toLocaleString()}</td><td>${row.students?.name || row.student_id}</td><td>${row.action}</td></tr>`;
    });
    html += "</table>";
    document.getElementById("attendance").innerHTML = html;
  }
}
