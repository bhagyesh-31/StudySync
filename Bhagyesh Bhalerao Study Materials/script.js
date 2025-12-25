// ================= Firebase Configuration (NEW PROJECT: bhagyesh-bhalerao-studyhub) =================
const firebaseConfig = {
// Your Firebase Configuaration will come here 
};

// ================= Initialize Firebase (compat SDK already loaded in index.html) =================
let firebaseApp, database, firestore;
try {
  firebaseApp = firebase.initializeApp(firebaseConfig);
  database = firebase.database();   // you can still use RTDB if needed
  firestore = firebase.firestore(); // main database for students/notes/feedback/config
  console.log('Firebase initialized successfully');
} catch (error) {
  console.error('Firebase initialization error:', error);
  alert('Firebase connection failed. Please check your internet connection.');
}

// ================= Global state =================
let currentUser = null;
let isAdmin = false;
let sessionId = null;
let activityInterval = null;
let studentsData = [];
let studentSession = null; // Track active student session for auto-login

const ACTIVE_THRESHOLD = 5 * 60 * 1000; // 5 minutes
const IDLE_THRESHOLD = 15 * 60 * 1000; // 15 minutes

// ================= Session check =================
function checkStudentSession() {
  if (studentSession) {
    console.log('✅ Active session detected - auto-login for:', studentSession.name);
    currentUser = { name: studentSession.name, college: studentSession.college };
    isAdmin = false;
    showStudentView();
    return true;
  }
  return false;
}

// ================= Login mode toggle (same as before) =================
let isAdminMode = false;

function toggleLoginMode() {
  isAdminMode = !isAdminMode;
  const studentForm = document.getElementById('studentLoginForm');
  const adminForm = document.getElementById('adminLoginForm');
  const switchBtn = document.getElementById('switchLoginBtn');
  const subtitle = document.getElementById('loginSubtitle');
  
  if (isAdminMode) {
    studentForm.classList.add('hidden');
    adminForm.classList.remove('hidden');
    switchBtn.textContent = 'Switch to Student Login';
    subtitle.textContent = 'Admin access only';
  } else {
    adminForm.classList.add('hidden');
    studentForm.classList.remove('hidden');
    switchBtn.textContent = 'Switch to Admin Login';
    subtitle.textContent = 'Enter your credentials to continue';
  }
}

// ================= Student Login =================
document.getElementById('studentLoginForm').addEventListener('submit', function(e) {
  e.preventDefault();
  const name = document.getElementById('studentName').value.trim();
  const college = document.getElementById('studentCollege').value.trim();
  
  if (!name || !college) {
    showError('studentError');
    return;
  }
  
  loginStudent(name, college);
});

// ================= Admin Login (password from Firestore: config/admin/password) =================
document.getElementById('adminLoginForm').addEventListener('submit', async function(e) {
  e.preventDefault();
  const password = document.getElementById('adminPassword').value;
  console.log('Entered admin password:', password);

  if (!firestore) {
    console.error('Firestore is not initialized');
    alert('Database not connected. Please try again later.');
    return;
  }

  try {
    const docRef = firestore.collection('config').doc('admin');
    const docSnap = await docRef.get();

    console.log('Admin config exists?', docSnap.exists);

    if (!docSnap.exists) {
      alert('Admin configuration not found. Please contact the developer.');
      console.error('Admin config document does not exist in Firestore (config/admin)');
      return;
    }

    const data = docSnap.data();
    console.log('Admin config data from Firestore:', data);

    const storedPassword = data.password;
    console.log('Stored password from Firestore:', storedPassword);

    if (password === storedPassword) {
      console.log('Admin password matched. Logging in.');
      loginAdmin();
    } else {
      console.warn('Admin password incorrect');
      showError('adminError'); // shows "Incorrect password"
    }
  } catch (err) {
    console.error('Error reading admin config:', err);
    alert('Unable to verify admin password. Please try again.');
  }
});

// ================= Common UI helpers =================
function showError(errorId) {
  const errorEl = document.getElementById(errorId);
  errorEl.classList.add('show');
  setTimeout(() => errorEl.classList.remove('show'), 3000);
}

// ================= Student login logic (Firestore students collection) =================
async function loginStudent(name, college) {
  const nameTrimmed = name.trim();
  const collegeTrimmed = college.trim();
  const nameLower = nameTrimmed.toLowerCase();
  const collegeLower = collegeTrimmed.toLowerCase();
  
  console.log('Student logging in:', nameTrimmed, collegeTrimmed);
  console.log('Checking for duplicates with:', nameLower, collegeLower);
  
  if (!firestore) {
    console.error('❌ Firestore not initialized');
    alert('Database connection issue. Please try again later.');
    return;
  }
  
  try {
    const q = firestore.collection('students')
      .where('nameLower', '==', nameLower)
      .where('collegeLower', '==', collegeLower);
    
    const snapshot = await q.get();
    
    if (!snapshot.empty) {
      console.log('⚠️ Duplicate entry detected. Already in database, but allowing access.');
      alert('You are already logged in! Granting access to the website.');
      
      studentSession = {
        name: nameTrimmed,
        college: collegeTrimmed,
        loginTime: new Date().toISOString(),
        sessionId: snapshot.docs[0].data().sessionId || generateSessionId()
      };
      
      currentUser = { name: nameTrimmed, college: collegeTrimmed };
      isAdmin = false;
      
      console.log('✅ Session created - allowing access');
      showStudentView();
      return;
    }
    
    console.log('✅ No duplicate found. Proceeding with first-time login...');
    
    currentUser = { name: nameTrimmed, college: collegeTrimmed };
    isAdmin = false;
    sessionId = generateSessionId();
    
    await firestore.collection('students').add({
      name: nameTrimmed,
      college: collegeTrimmed,
      nameLower: nameLower,
      collegeLower: collegeLower,
      loginDate: new Date().toLocaleDateString('en-IN'),
      loginTime: new Date().toLocaleTimeString('en-IN'),
      sessionId: sessionId,
      timestamp: Date.now()
    });
    
    console.log('✅ Student data saved to Firestore successfully');
    
    studentSession = {
      name: nameTrimmed,
      college: collegeTrimmed,
      loginTime: new Date().toISOString(),
      sessionId: sessionId
    };
    
    console.log('✅ Session created - allowing access');
    alert('Login successful! Welcome ' + nameTrimmed);
    
    showStudentView();
    
  } catch (error) {
    console.error('❌ Error during login process:', error);
    alert('Login failed. Please try again. Error: ' + error.message);
  }
}

// ================= Admin view + student list =================
function loginAdmin() {
  isAdmin = true;
  currentUser = { name: 'Admin' };
  
  console.log('Admin logged in');
  
  showAdminView();
  
  if (firestore) {
    console.log('🔄 Setting up Firestore real-time listener for students');
    firestore.collection('students').orderBy('timestamp', 'desc').onSnapshot((snapshot) => {
      studentsData = [];
      snapshot.forEach((doc) => {
        studentsData.push({
          id: doc.id,
          ...doc.data()
        });
      });
      console.log('📊 Students updated from Firestore:', studentsData.length);
      updateStudentsDisplay();
    }, (error) => {
      console.error('❌ Error listening to students from Firestore:', error);
    });
  } else {
    console.error('❌ Firestore not initialized for admin');
  }
}

// ================= View switching =================
function showStudentView() {
  document.getElementById('loginPage').classList.add('hidden');
  document.getElementById('mainHeader').classList.remove('hidden');
  document.getElementById('heroSection').classList.remove('hidden');
  document.getElementById('searchSection').classList.remove('hidden');
  document.getElementById('notesSection').classList.remove('hidden');
  document.getElementById('mainFooter').classList.remove('hidden');
  document.getElementById('feedbackSection').classList.remove('hidden');
  
  document.getElementById('userInfo').innerHTML =
    `Welcome, <strong>${currentUser.name}</strong> from <strong>${currentUser.college}</strong>`;
}

function showAdminView() {
  document.getElementById('loginPage').classList.add('hidden');
  document.getElementById('mainHeader').classList.remove('hidden');
  document.getElementById('adminDashboard').classList.remove('hidden');
  
  document.getElementById('userInfo').innerHTML = '<strong>Admin Dashboard</strong>';
  
  renderNotesTable();
}

function logout() {
  if (activityInterval) {
    clearInterval(activityInterval);
  }
  
  if (!isAdmin && studentSession) {
    if (!confirm('Are you sure you want to logout? You can login again anytime.')) {
      return;
    }
  }
  
  currentUser = null;
  isAdmin = false;
  sessionId = null;
  studentSession = null;
  
  console.log('✅ Logged out - session cleared');
  
  document.getElementById('loginPage').classList.remove('hidden');
  document.getElementById('mainHeader').classList.add('hidden');
  document.getElementById('heroSection').classList.add('hidden');
  document.getElementById('searchSection').classList.add('hidden');
  document.getElementById('notesSection').classList.add('hidden');
  document.getElementById('adminDashboard').classList.add('hidden');
  document.getElementById('mainFooter').classList.add('hidden');
  
  document.getElementById('studentName').value = '';
  document.getElementById('studentCollege').value = '';
  document.getElementById('adminPassword').value = '';
}

function generateSessionId() {
  return 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

// ================= Tabs (Admin) =================
function switchTab(tab) {
  const tabs = document.querySelectorAll('.tab-btn');
  const contents = document.querySelectorAll('.tab-content');
  
  tabs.forEach(t => t.classList.remove('active'));
  contents.forEach(c => c.classList.remove('active'));
  
  if (tab === 'notes') {
    tabs[0].classList.add('active');
    document.getElementById('notesTab').classList.add('active');
  } else {
    tabs[1].classList.add('active');
    document.getElementById('analyticsTab').classList.add('active');
  }
}

// ================= Notes (Add / Edit / Delete / Render) =================
document.getElementById('addNoteForm').addEventListener('submit', function(e) {
  e.preventDefault();
  
  const noteData = {
    title: document.getElementById('noteTitle').value,
    subject: document.getElementById('noteSubject').value,
    semester: parseInt(document.getElementById('noteSemester').value),
    description: document.getElementById('noteDescription').value,
    googleDriveLink: document.getElementById('noteDriveLink').value,
    date: Date.now(),
    createdBy: 'admin'
  };
  
  if (firestore) {
    firestore.collection('notes').add(noteData)
      .then(() => {
        e.target.reset();
        alert('Note added successfully!');
        renderNotesTable();
      })
      .catch((error) => {
        console.error('Error adding note:', error);
        alert('Failed to add note. Please try again.');
      });
  } else {
    notesData.push({ ...noteData, id: Date.now() });
    renderNotesTable();
    renderNotes(notesData);
    e.target.reset();
    alert('Note added successfully!');
  }
});

document.getElementById('editNoteForm').addEventListener('submit', function(e) {
  e.preventDefault();
  
  const noteId = document.getElementById('editNoteId').value;
  const updatedData = {
    title: document.getElementById('editNoteTitle').value,
    subject: document.getElementById('editNoteSubject').value,
    semester: parseInt(document.getElementById('editNoteSemester').value),
    description: document.getElementById('editNoteDescription').value,
    googleDriveLink: document.getElementById('editNoteDriveLink').value
  };
  
  if (firestore) {
    firestore.collection('notes').doc(noteId).update(updatedData)
      .then(() => {
        closeEditModal();
        alert('Note updated successfully!');
        renderNotesTable();
      })
      .catch((error) => {
        console.error('Error updating note:', error);
        alert('Failed to update note. Please try again.');
      });
  } else {
    const index = notesData.findIndex(n => n.id == noteId);
    if (index !== -1) {
      notesData[index] = { ...notesData[index], ...updatedData };
      renderNotesTable();
      renderNotes(notesData);
      closeEditModal();
      alert('Note updated successfully!');
    }
  }
});

function openEditModal(noteId) {
  let note = notesData.find(n => n.id == noteId || n.id === noteId);
  if (!note) {
    console.error('Note not found:', noteId);
    return;
  }
  
  document.getElementById('editNoteId').value = noteId;
  document.getElementById('editNoteTitle').value = note.title || '';
  document.getElementById('editNoteSubject').value = note.subject || '';
  document.getElementById('editNoteSemester').value = note.semester || '';
  document.getElementById('editNoteDescription').value = note.description || '';
  document.getElementById('editNoteDriveLink').value = note.googleDriveLink || '';
  
  document.getElementById('editNoteModal').classList.add('active');
}

function closeEditModal() {
  document.getElementById('editNoteModal').classList.remove('active');
  document.getElementById('editNoteForm').reset();
}

function deleteNote(noteId) {
  if (!confirm('Are you sure you want to delete this note? This action cannot be undone.')) {
    return;
  }
  
  if (firestore) {
    firestore.collection('notes').doc(noteId).delete()
      .then(() => {
        alert('Note deleted successfully!');
        renderNotesTable();
      })
      .catch((error) => {
        console.error('Error deleting note:', error);
        alert('Failed to delete note. Please try again.');
      });
  } else {
    const index = notesData.findIndex(n => n.id == noteId);
    if (index !== -1) {
      notesData.splice(index, 1);
      renderNotesTable();
      renderNotes(notesData);
      alert('Note deleted successfully!');
    }
  }
}

let notesSortColumn = 'date';
let notesSortAscending = false;

function sortNotesTable(column) {
  if (notesSortColumn === column) {
    notesSortAscending = !notesSortAscending;
  } else {
    notesSortColumn = column;
    notesSortAscending = true;
  }
  renderNotesTable();
}

function renderNotesTable() {
  const tbody = document.getElementById('notesTableBody');
  let notes = [...notesData];
  
  notes.sort((a, b) => {
    let aVal = a[notesSortColumn];
    let bVal = b[notesSortColumn];
    
    if (notesSortColumn === 'date') {
      aVal = a.date || 0;
      bVal = b.date || 0;
    } else if (notesSortColumn === 'semester') {
      aVal = parseInt(a.semester) || 0;
      bVal = parseInt(b.semester) || 0;
    } else {
      aVal = String(aVal || '').toLowerCase();
      bVal = String(bVal || '').toLowerCase();
    }
    
    if (aVal < bVal) return notesSortAscending ? -1 : 1;
    if (aVal > bVal) return notesSortAscending ? 1 : -1;
    return 0;
  });
  
  document.getElementById('totalNotes').textContent = notes.length;
  
  if (notes.length === 0) {
    tbody.innerHTML =
      '<tr><td colspan="7" style="text-align: center; color: rgba(255, 255, 255, 0.5);">No notes available</td></tr>';
    return;
  }
  
  tbody.innerHTML = notes.map(note => {
    const dateStr = note.date ? new Date(note.date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    }) : 'N/A';
    
    return `
      <tr>
        <td><span class="badge">${note.subject}</span></td>
        <td><span class="badge semester">Sem ${note.semester}</span></td>
        <td style="font-weight: var(--font-weight-medium);">${note.title}</td>
        <td style="max-width: 300px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${note.description}</td>
        <td><a href="${note.googleDriveLink}" target="_blank" class="link-preview" title="${note.googleDriveLink}">View Link</a></td>
        <td style="font-size: var(--font-size-sm); color: rgba(255, 255, 255, 0.6);">${dateStr}</td>
        <td>
          <div class="actions-cell">
            <button class="btn-action btn-view" onclick="window.open('${note.googleDriveLink}', '_blank')" title="View PDF in Google Drive">👁️ View</button>
            <button class="btn-action btn-edit" onclick="openEditModal('${note.id}')" title="Edit note">✏️ Edit</button>
            <button class="btn-action btn-delete" onclick="deleteNote('${note.id}')" title="Delete note">🗑️ Delete</button>
            <button class="btn-action" style="background: rgba(16, 185, 129, 0.2); border: 1px solid rgba(16, 185, 129, 0.4); color: var(--active-green);" onclick="copyToClipboard('${note.googleDriveLink}')" title="Copy Google Drive link">📋 Copy Link</button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

function filterNotesTable() {
  const searchTerm = document.getElementById('notesSearch').value.toLowerCase();
  const rows = document.querySelectorAll('#notesTableBody tr');
  
  rows.forEach(row => {
    const text = row.textContent.toLowerCase();
    row.style.display = text.includes(searchTerm) ? '' : 'none';
  });
}

// ================= Students table (Analytics tab) =================
function updateStudentsDisplay() {
  console.log('📊 Updating student display. Total students:', studentsData.length);
  document.getElementById('totalStudents').textContent = studentsData.length;
  renderStudentsTable();
}

function renderStudentsTable() {
  const tbody = document.getElementById('studentsTableBody');
  const students = [...studentsData];
  
  console.log('🎨 Rendering students table. Total students:', students.length);
  
  if (students.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="5" style="text-align: center; padding: var(--space-48); color: rgba(255, 255, 255, 0.5); font-size: var(--font-size-lg);">
          <div style="margin-bottom: var(--space-16);">📊</div>
          <div>No students have logged in yet</div>
          <div style="font-size: var(--font-size-sm); margin-top: var(--space-8); opacity: 0.7;">
            Students will appear here automatically when they log in
          </div>
        </td>
      </tr>`;
    return;
  }
  
  tbody.innerHTML = students.map((student, index) => {
    const rowNumber = index + 1;
    const displayName = student.name || 'N/A';
    const displayCollege = student.college || 'N/A';
    
    return `
      <tr style="animation: fadeIn 0.3s ease-in-out ${index * 0.05}s backwards;">
        <td style="font-size: var(--font-size-lg); font-weight: var(--font-weight-medium); color: white;">
          <span style="color: var(--neon-cyan); margin-right: var(--space-8);">${rowNumber}.</span>
          ${displayName}
        </td>
        <td style="font-size: var(--font-size-lg); color: rgba(255, 255, 255, 0.9);">${displayCollege}</td>
        <td style="font-size: var(--font-size-lg); color: rgba(255, 255, 255, 0.9);">${student.loginDate || 'N/A'}</td>
        <td style="font-size: var(--font-size-lg); color: rgba(255, 255, 255, 0.9);">${student.loginTime || 'N/A'}</td>
        <td>
          <button class="btn-action btn-delete" onclick="deleteStudent('${student.id}')" title="Remove student">
            🗑️ Delete
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

function filterStudents() {
  const searchTerm = document.getElementById('studentSearch').value.toLowerCase();
  const rows = document.querySelectorAll('#studentsTableBody tr');
  
  rows.forEach(row => {
    const text = row.textContent.toLowerCase();
    row.style.display = text.includes(searchTerm) ? '' : 'none';
  });
}

async function deleteStudent(studentId) {
  if (!studentId) {
    console.error('❌ No student ID provided');
    return;
  }
  
  const student = studentsData.find(s => s.id === studentId);
  const studentName = student ? student.name : 'this student';
  
  const confirmed = confirm(`Are you sure you want to remove ${studentName} from the system?\n\nThis action cannot be undone.`);
  
  if (!confirmed) {
    console.log('❌ Student deletion cancelled by admin');
    return;
  }
  
  console.log('🗑️ Deleting student with ID:', studentId);
  
  if (!firestore) {
    console.error('❌ Firestore not initialized');
    alert('Database connection error. Please refresh and try again.');
    return;
  }
  
  try {
    await firestore.collection('students').doc(studentId).delete();
    console.log('✅ Student deleted successfully from Firestore');
    alert(`Student "${studentName}" has been removed successfully!`);
  } catch (error) {
    console.error('❌ Error deleting student:', error);
    alert('Failed to delete student. Error: ' + error.message);
  }
}

// ================= Notes: load from Firestore in real time =================
let notesData = [];
let filteredNotes = [];

if (firestore) {
  console.log('Setting up Firestore listener for notes');
  firestore.collection('notes').onSnapshot((snapshot) => {
    notesData = [];
    snapshot.forEach((doc) => {
      notesData.push({
        id: doc.id,
        ...doc.data()
      });
    });
    console.log('Notes loaded from Firestore:', notesData.length);
    if (isAdmin) {
      renderNotesTable();
    } else {
      filterNotes();
    }
  }, (error) => {
    console.error('Error loading notes from Firestore:', error);
  });
} else {
  console.warn('Firestore not initialized, no notes loaded');
}

// ================= Notes rendering on main page =================
function extractFileId(url) {
  const patterns = [
    /\/file\/d\/([a-zA-Z0-9_-]+)/,
    /id=([a-zA-Z0-9_-]+)/,
    /\/d\/([a-zA-Z0-9_-]+)/
  ];
  
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }
  return null;
}

function getDrivePreviewUrl(driveLink) {
  const fileId = extractFileId(driveLink);
  return fileId ? `https://drive.google.com/file/d/${fileId}/preview` : driveLink;
}

function renderNotes(notes) {
  const grid = document.getElementById('notesGrid');
  
  if (!grid) return;

  if (notes.length === 0) {
    grid.innerHTML = '<div class="empty-state">No notes found. Try adjusting your filters.</div>';
    return;
  }

  grid.innerHTML = notes.map(note => `
    <div class="note-card" onclick="openPdfModal('${note.id}')">
      <h3>${note.title}</h3>
      <div class="note-meta">
        <span class="badge">${note.subject}</span>
        <span class="badge semester">Semester ${note.semester}</span>
      </div>
      <p class="note-description">${note.description}</p>
      <div class="note-actions">
        <button class="btn btn-primary" onclick="event.stopPropagation(); openPdfModal('${note.id}')">
          👁️ View Online
        </button>
        <a href="${note.googleDriveLink}" target="_blank" class="btn btn-secondary" onclick="event.stopPropagation()">
          📥 Download
        </a>
      </div>
    </div>
  `).join('');
}

function filterNotes() {
  const searchInput = document.getElementById('searchInput');
  const subjectFilterEl = document.getElementById('subjectFilter');
  const semesterFilterEl = document.getElementById('semesterFilter');

  if (!searchInput || !subjectFilterEl || !semesterFilterEl) return;

  const searchTerm = searchInput.value.toLowerCase();
  const subjectFilter = subjectFilterEl.value;
  const semesterFilter = semesterFilterEl.value;

  filteredNotes = notesData.filter(note => {
    const matchesSearch =
      (note.title || '').toLowerCase().includes(searchTerm) ||
      (note.description || '').toLowerCase().includes(searchTerm) ||
      (note.subject || '').toLowerCase().includes(searchTerm);
    const matchesSubject = !subjectFilter || note.subject === subjectFilter;
    const matchesSemester = !semesterFilter || note.semester === parseInt(semesterFilter);
    
    return matchesSearch && matchesSubject && matchesSemester;
  });

  renderNotes(filteredNotes);
}

// ================= PDF Modal =================
function openPdfModal(noteId) {
  const note = notesData.find(n => n.id == noteId || n.id === noteId);
  if (!note) {
    console.error('Note not found for modal:', noteId);
    return;
  }

  document.getElementById('modalTitle').textContent = note.title;
  document.getElementById('pdfViewer').src = getDrivePreviewUrl(note.googleDriveLink);
  document.getElementById('downloadLink').href = note.googleDriveLink;
  document.getElementById('pdfModal').classList.add('active');
}

function closeModal() {
  document.getElementById('pdfModal').classList.remove('active');
  document.getElementById('pdfViewer').src = '';
}

document.getElementById('pdfModal').addEventListener('click', function(e) {
  if (e.target === this) {
    closeModal();
  }
});

document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape') {
    closeModal();
    closeEditModal();
  }
});

// ================= Clipboard helper =================
function copyToClipboard(text) {
  navigator.clipboard.writeText(text)
    .then(() => alert('Link copied to clipboard!'))
    .catch(err => {
      console.error('Failed to copy text: ', err);
      alert('Failed to copy link.');
    });
}

// ================= Feedback & Ratings =================
let selectedRating = 0;

function initRatingStars() {
  const starsContainer = document.getElementById('ratingStars');
  if (!starsContainer) return;

  const stars = starsContainer.querySelectorAll('span');
  stars.forEach(star => {
    star.addEventListener('click', () => {
      selectedRating = parseInt(star.dataset.value);
      document.getElementById('feedbackRating').value = selectedRating;
      updateStarUI(stars, selectedRating);
    });
  });
}

function updateStarUI(stars, rating) {
  stars.forEach(star => {
    const value = parseInt(star.dataset.value);
    if (value <= rating) {
      star.classList.add('active');
    } else {
      star.classList.remove('active');
    }
  });
}

// Handle feedback form submit
const feedbackForm = document.getElementById('feedbackForm');
if (feedbackForm) {
  feedbackForm.addEventListener('submit', async function (e) {
    e.preventDefault();

    const rating = parseInt(document.getElementById('feedbackRating').value || '0');
    const text = document.getElementById('feedbackText').value.trim();

    if (!currentUser) {
      alert('Please login before submitting feedback.');
      return;
    }
    if (!rating || rating < 1 || rating > 5) {
      alert('Please select a rating between 1 and 5 stars.');
      return;
    }
    if (!text) {
      alert('Please write some feedback.');
      return;
    }
    if (!firestore) {
      alert('Cannot submit feedback right now. Please try again later.');
      return;
    }

    try {
      await firestore.collection('feedback').add({
        name: currentUser.name,
        college: currentUser.college || '',
        rating: rating,
        feedback: text,
        createdAt: Date.now()
      });
      alert('Thank you for your feedback!');

      selectedRating = 0;
      document.getElementById('feedbackRating').value = '0';
      document.getElementById('feedbackText').value = '';
      const stars = document.querySelectorAll('#ratingStars span');
      updateStarUI(stars, 0);
    } catch (err) {
      console.error('Error submitting feedback:', err);
      alert('Failed to submit feedback. Please try again.');
    }
  });
}

let feedbackData = [];

if (firestore) {
  firestore.collection('feedback')
    .orderBy('createdAt', 'desc')
    .onSnapshot((snapshot) => {
      feedbackData = [];
      snapshot.forEach(doc => {
        feedbackData.push({ id: doc.id, ...doc.data() });
      });
      renderFeedbackList();
    }, (error) => {
      console.error('Error listening to feedback:', error);
    });
}

function renderFeedbackList() {
  const container = document.getElementById('feedbackList');
  if (!container) return;

  if (feedbackData.length === 0) {
    container.innerHTML = `
      <div style="color: rgba(148, 163, 184, 0.9); font-size: var(--font-size-sm); text-align: center;">
        No feedback yet. Be the first to share your experience!
      </div>
    `;
    return;
  }

  container.innerHTML = feedbackData.map(fb => {
    const stars = '★'.repeat(fb.rating || 0) + '☆'.repeat(5 - (fb.rating || 0));
    const date = fb.createdAt
      ? new Date(fb.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
      : '';

    return `
      <div class="feedback-card">
        <div class="feedback-header">
          <div>
            <div class="feedback-name">${fb.name || 'Student'}</div>
            <div class="feedback-meta">${fb.college || ''} ${date ? '• ' + date : ''}</div>
          </div>
          <div class="feedback-stars">${stars}</div>
        </div>
        <div class="feedback-text">${fb.feedback || ''}</div>
      </div>
    `;
  }).join('');
}

// ================= On page load =================
window.addEventListener('DOMContentLoaded', function() {
  console.log('🔍 Checking for existing student session...');
  initRatingStars();
  if (checkStudentSession()) {
    console.log('✅ Session found - auto-login successful');
  } else {
    console.log('ℹ️ No active session - showing login page');
  }
});

