// script.js - handles sidebar, auth gate, and basic navigation + admin/teacher dashboards
(function(){
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebarOverlay');
  const hamburger = document.getElementById('hamburger');
  const authGate = document.getElementById('authGate');
  const signInModal = document.getElementById('signInModal');
  const signUpModal = document.getElementById('signUpModal');
  const genericModal = document.getElementById('genericModal');
  const genericModalCard = document.getElementById('genericModalCard');

  function openSidebar(){
    sidebar.classList.remove('hidden');
    overlay.classList.remove('hidden');
    sidebar.setAttribute('aria-hidden','false');
  }
  function closeSidebar(){
    sidebar.classList.add('hidden');
    overlay.classList.add('hidden');
    sidebar.setAttribute('aria-hidden','true');
  }

  hamburger.addEventListener('click', (e)=>{ e.stopPropagation(); openSidebar(); });
  overlay.addEventListener('click', closeSidebar);
  // close if click outside
  document.addEventListener('click', (e)=>{
    if(!sidebar.classList.contains('hidden') && !sidebar.contains(e.target) && e.target !== hamburger){
      closeSidebar();
    }
  });

  // nav links
  document.querySelectorAll('#sidebar a[data-page]').forEach(a=>{
    a.addEventListener('click', (ev)=>{
      ev.preventDefault();
      const page = a.getAttribute('data-page');
      navigateTo(page);
      closeSidebar();
    })
  });

  // Local storage helpers
  function getAccounts(){ return JSON.parse(localStorage.getItem('accounts') || '[]'); }
  function setAccounts(a){ localStorage.setItem('accounts', JSON.stringify(a)); }
  function getNotifications(){ return JSON.parse(localStorage.getItem('notifications') || '[]'); }
  function setNotifications(n){ localStorage.setItem('notifications', JSON.stringify(n)); }

  // initial auth helpers
  function isLoggedIn(){ return localStorage.getItem('loggedIn') === 'true'; }
  function getAccountEmail(){ return localStorage.getItem('accountEmail') || null; }
  function getCurrentAccount(){ const email = getAccountEmail(); if(!email) return null; return getAccounts().find(a=>a.email === email) || null; }
  function getAccountName(){ const acc = getCurrentAccount(); return acc ? acc.name : (localStorage.getItem('accountName') || 'Guest'); }

  const accountNameSpan = document.getElementById('accountName');

  function refreshAuth(){
    const acc = getCurrentAccount();
    if(!isLoggedIn() || !acc){
      authGate.classList.remove('hidden');
      document.getElementById('homePage').classList.add('hidden');
      // hide admin/teacher links
      document.querySelectorAll('.admin-link, .teacher-link').forEach(el=>el.classList.add('hidden'));
    } else {
      authGate.classList.add('hidden');
      document.getElementById('homePage').classList.remove('hidden');
      accountNameSpan.textContent = acc.name || 'Guest';
      renderSidebarLinksForRole(acc.status);
    }
  }
  refreshAuth();

  // Render admin/teacher links based on role
  function renderSidebarLinksForRole(role){
    const adminLink = document.querySelector('.admin-link');
    const teacherLink = document.querySelector('.teacher-link');
    if(role === 'Admin'){
      adminLink.classList.remove('hidden');
    } else {
      adminLink.classList.add('hidden');
    }
    if(role === 'Teacher' || role === 'Admin'){
      teacherLink.classList.remove('hidden');
    } else {
      teacherLink.classList.add('hidden');
    }
  }

  // Navigation dispatcher
  function navigateTo(page){
    document.getElementById('homePage').classList.add('hidden');
    document.getElementById('placeholderPage').classList.add('hidden');
    if(page === 'home'){
      document.getElementById('homePage').classList.remove('hidden');
    } else if(page === 'admin'){
      renderAdminDashboard();
    } else if(page === 'teacher'){
      renderTeacherDashboard();
    } else {
      document.getElementById('placeholderPage').classList.remove('hidden');
      document.getElementById('placeholderTitle').textContent = page[0].toUpperCase()+page.slice(1);
    }
  }

  // auth actions: improved sign-in that checks stored accounts
  document.getElementById('showSignIn').addEventListener('click', ()=>{ signInModal.classList.remove('hidden'); });
  document.getElementById('showSignUp').addEventListener('click', ()=>{ signUpModal.classList.remove('hidden'); });
  document.getElementById('signinCancel').addEventListener('click', ()=>{ signInModal.classList.add('hidden'); });
  document.getElementById('signupCancel').addEventListener('click', ()=>{ signUpModal.classList.add('hidden'); });

  document.getElementById('signinSubmit').addEventListener('click', ()=>{
    const name = document.getElementById('signin-name').value.trim();
    const email = document.getElementById('signin-email').value.trim();
    const password = document.getElementById('signin-password').value.trim();
    const err = document.getElementById('signinError');
    err.classList.add('hidden');
    const accounts = getAccounts();
    const match = accounts.find(a=>a.email === email && a.password === password);
    if(match){
      if(!match.approved){
        // still allow to create a session but show awaiting approval
        localStorage.setItem('loggedIn','true');
        localStorage.setItem('accountEmail', match.email);
        localStorage.setItem('accountName', match.name);
        signInModal.classList.add('hidden');
        showAwaitingApproval();
        return;
      }
      localStorage.setItem('loggedIn','true');
      localStorage.setItem('accountEmail', match.email);
      localStorage.setItem('accountName', match.name);
      signInModal.classList.add('hidden');
      refreshAuth();
    } else {
      err.classList.remove('hidden');
    }
  });

  // sign up with notification to admins
  document.getElementById('signupSubmit').addEventListener('click', ()=>{
    const name = document.getElementById('signup-name').value.trim();
    const email = document.getElementById('signup-email').value.trim();
    const password = document.getElementById('signup-password').value.trim();
    const err = document.getElementById('signupError');
    err.classList.add('hidden');
    if(!name || !email || !password){ err.textContent = 'Please fill in all fields.'; err.classList.remove('hidden'); return; }
    const accounts = getAccounts();
    if(accounts.find(a=>a.email === email)){
      err.textContent = 'An account with that email already exists.'; err.classList.remove('hidden'); return;
    }
    const newAcc = {name, email, password, approved:false, status:'Student', bio:'', classes:[], suspended:false, suspendedUntil:null, security:{}};
    accounts.push(newAcc);
    setAccounts(accounts);

    // send notifications to all admins
    const admins = accounts.filter(a=>a.status === 'Admin');
    const notifications = getNotifications();
    const note = {
      id: 'note-'+Date.now(),
      title: 'New Signup Awaiting Approval',
      body: `New signup: ${name} (${email}). Please review and approve.`,
      read:false,
      created_at: new Date().toISOString()
    };
    admins.forEach(adm => {
      const copy = Object.assign({}, note, {to:adm.email});
      notifications.push(copy);
    });
    setNotifications(notifications);

    // mark as awaiting approval UI
    signUpModal.classList.add('hidden');
    authGate.classList.add('hidden');
    showAwaitingApproval();
  });

  function showAwaitingApproval(){
    const html = `\n      <section class="page">\n        <h1>Awaiting Approval</h1>\n        <p>Thank you for signing up! To verify that you are a CPA student/teacher, a mod will check your submission manually. Once you are approved, you will receive an email and are free to explore! You can expect to be approved within a week. Thank you for your patience!</p>\n      </section>`;
    document.getElementById('appContent').innerHTML = html;
  }

  // logout
  document.getElementById('logoutLink').addEventListener('click', (e)=>{
    e.preventDefault();
    if(confirm('Are you sure you would like to logout?')){
      localStorage.removeItem('loggedIn');
      localStorage.removeItem('accountEmail');
      localStorage.removeItem('accountName');
      refreshAuth();
      location.reload();
    }
  });

  // Admin Dashboard rendering and actions
  function renderAdminDashboard(){
    const acc = getCurrentAccount();
    if(!acc || acc.status !== 'Admin'){
      alert('Access denied: Admins only');
      return;
    }
    const accounts = getAccounts();
    const pending = accounts.filter(a=>!a.approved);
    const students = accounts.filter(a=>a.approved && a.status === 'Student');

    let html = `<section class="page"><div class="dashboard-header"><h1 class="page-title">Admin Dashboard</h1></div>`;

    // Pending approvals
    html += `<div class="card"><h3>Pending Approvals</h3>`;
    if(pending.length === 0) html += `<p class="muted">No pending signups.</p>`;
    pending.forEach(p => {
      html += `<div class="user-row"><img src="/assets/default-pfp.svg" alt="pfp"><div style="flex:1"><strong>${p.name}</strong><div class="small">${p.email}</div></div><div style="display:flex;gap:8px;align-items:center"><select data-email="${p.email}" class="status-select"><option>Student</option><option>Teacher</option><option>Admin</option></select><button class="small-btn primary approve-btn" data-email="${p.email}">Approve</button></div></div>`;
    });
    html += `</div>`;

    // Student controls
    html += `<div class="card"><h3>Students</h3>`;
    if(students.length === 0) html += `<p class="muted">No students found.</p>`;
    students.forEach(s => {
      html += `<div class="user-row"><img src="/assets/default-pfp.svg"><div style="flex:1"><a href="#" class="user-link" data-email="${s.email}">${s.name}</a><div class="small">${s.email}</div></div><div style="display:flex;gap:8px"><button class="small-btn ghost edit-btn" data-email="${s.email}">Edit</button><button class="small-btn warn suspend-btn" data-email="${s.email}">${s.suspended? 'Unsuspend':'Suspend'}</button><div class="tag">${s.status}</div></div></div>`;
    });
    html += `</div>`;

    // self actions
    html += `<div class="card"><h3>Your Account</h3><p>You are signed in as <strong>${acc.name}</strong> (${acc.email}).</p><div style="display:flex;gap:10px"><button id="demoteSelf" class="small-btn warn">Demote to Teacher</button></div></div>`;

    html += `</section>`;
    document.getElementById('appContent').innerHTML = html;

    // wire up approve buttons
    document.querySelectorAll('.approve-btn').forEach(btn => btn.addEventListener('click', (e)=>{
      const email = btn.getAttribute('data-email');
      const select = document.querySelector(`.status-select[data-email=\"${email}\"]`);
      const chosen = select.value;
      approveAccount(email, chosen);
    }));

    // edit buttons
    document.querySelectorAll('.edit-btn').forEach(btn => btn.addEventListener('click', ()=>{
      const email = btn.getAttribute('data-email');
      openEditProfileModal(email);
    }));

    // suspend buttons
    document.querySelectorAll('.suspend-btn').forEach(btn => btn.addEventListener('click', ()=>{
      const email = btn.getAttribute('data-email');
      toggleSuspend(email);
    }));

    document.getElementById('demoteSelf').addEventListener('click', ()=>{
      if(!confirm('Are you sure you want to demote yourself to Teacher?')) return;
      changeStatus(acc.email, 'Teacher');
      alert('You have been demoted to Teacher. Refreshing...');
      location.reload();
    });
  }

  function approveAccount(email, status){
    const accounts = getAccounts();
    const idx = accounts.findIndex(a=>a.email===email);
    if(idx === -1) return alert('Account not found');
    accounts[idx].approved = true;
    accounts[idx].status = status;
    setAccounts(accounts);
    // mark related notifications as resolved (delete)
    let notes = getNotifications().filter(n=>n.body && !n.body.includes(email));
    setNotifications(notes);
    alert(`${accounts[idx].name} approved as ${status}`);
    renderAdminDashboard();
  }

  function changeStatus(email, newStatus){
    const accounts = getAccounts();
    const idx = accounts.findIndex(a=>a.email===email);
    if(idx === -1) return;
    accounts[idx].status = newStatus;
    setAccounts(accounts);
  }

  function toggleSuspend(email){
    const accounts = getAccounts();
    const idx = accounts.findIndex(a=>a.email===email);
    if(idx === -1) return;
    const acc = accounts[idx];
    if(acc.suspended){
      acc.suspended = false; acc.suspendedUntil = null;
      setAccounts(accounts);
      alert(`${acc.name} has been unsuspended.`);
      renderAdminDashboard();
      return;
    }
    // open modal to choose suspend length
    openModal(`<h3>Suspend ${acc.name}</h3><label>Until (ISO date or leave blank for indefinite)<input id=\"suspendUntil\" placeholder=\"YYYY-MM-DD or leave blank\"></label><div class=\"modal-actions\"><button id=\"confirmSuspend\" class=\"small-btn warn\">Suspend</button><button id=\"cancelModal\" class=\"small-btn ghost\">Cancel</button></div>`);
    document.getElementById('confirmSuspend').addEventListener('click', ()=>{
      const until = document.getElementById('suspendUntil').value.trim();
      acc.suspended = true; acc.suspendedUntil = until || null;
      setAccounts(accounts);
      closeModal();
      alert(`${acc.name} suspended${until? ` until ${until}`: ' indefinitely'}.`);
      renderAdminDashboard();
    });
    document.getElementById('cancelModal').addEventListener('click', closeModal);
  }

  function openEditProfileModal(email){
    const accounts = getAccounts();
    const acc = accounts.find(a=>a.email===email);
    if(!acc) return alert('User not found');
    const classesText = (acc.classes || []).join(', ');
    openModal(`<h3>Edit Profile: ${acc.name}</h3><label>Full Name<input id=\"editName\" value=\"${acc.name}\"></label><label>Bio<textarea id=\"editBio\">${acc.bio || ''}</textarea></label><label>Classes (comma separated)<input id=\"editClasses\" value=\"${classesText}\"></label><div class=\"modal-actions\"><button id=\"saveEdit\" class=\"small-btn primary\">Save</button><button id=\"cancelEdit\" class=\"small-btn ghost\">Cancel</button></div>`);
    document.getElementById('saveEdit').addEventListener('click', ()=>{
      acc.name = document.getElementById('editName').value.trim();
      acc.bio = document.getElementById('editBio').value.trim();
      const cls = document.getElementById('editClasses').value.trim();
      acc.classes = cls ? cls.split(',').map(s=>s.trim()).filter(Boolean) : [];
      setAccounts(accounts);
      closeModal();
      renderAdminDashboard();
    });
    document.getElementById('cancelEdit').addEventListener('click', closeModal);
  }

  // Teacher Dashboard
  function renderTeacherDashboard(){
    const acc = getCurrentAccount();
    if(!acc || (acc.status !== 'Teacher' && acc.status !== 'Admin')){
      alert('Access denied: Teachers only');
      return;
    }
    const accounts = getAccounts();
    const students = accounts.filter(a=>a.approved && a.status === 'Student');
    let html = `<section class="page"><div class="dashboard-header"><h1 class="page-title">Teacher Dashboard</h1></div>`;
    html += `<div class="card"><h3>Students</h3>`;
    if(students.length === 0) html += `<p class="muted">No students found.</p>`;
    students.forEach(s=>{
      html += `<div class="user-row"><img src="/assets/default-pfp.svg"><div style="flex:1"><strong>${s.name}</strong><div class="small">${s.email}</div></div><div style="display:flex;gap:8px"><button class="small-btn ghost edit-btn" data-email="${s.email}">Edit</button><button class="small-btn warn suspend-btn" data-email="${s.email}">${s.suspended? 'Unsuspend':'Suspend'}</button><div class="tag">${s.status}</div></div></div>`;
    });
    html += `</div>`;

    // self actions
    html += `<div class="card"><h3>Your Account</h3><p>Signed in as <strong>${acc.name}</strong> (${acc.email})</p><div style="display:flex;gap:10px"><button id="promoteSelf" class="small-btn primary">Promote to Admin</button></div></div>`;

    html += `</section>`;
    document.getElementById('appContent').innerHTML = html;

    document.querySelectorAll('.edit-btn').forEach(btn => btn.addEventListener('click', ()=> openEditProfileModal(btn.getAttribute('data-email'))));
    document.querySelectorAll('.suspend-btn').forEach(btn => btn.addEventListener('click', ()=> toggleSuspend(btn.getAttribute('data-email'))));

    document.getElementById('promoteSelf').addEventListener('click', ()=>{
      if(!confirm('Promote yourself to Admin? This grants elevated permissions.')) return;
      changeStatus(acc.email, 'Admin');
      alert('You are now an Admin. Refreshing...');
      location.reload();
    });
  }

  // Modal helpers
  function openModal(html){
    genericModalCard.innerHTML = html;
    genericModal.classList.remove('hidden');
  }
  function closeModal(){ genericModal.classList.add('hidden'); genericModalCard.innerHTML = ''; }

  // seed admin account for testing if no accounts exist
  (function seedAdmin(){
    const accounts = getAccounts();
    if(!accounts.find(a=>a.email === 'athayacraven+admin@gmail.com')){
      accounts.push({
        name:'Admin',
        email:'athayacraven+admin@gmail.com',
        password:'Admin',
        approved:true,
        status:'Admin',
        bio:'',
        classes:[],
        suspended:false,
        security:{firstPet:'Ferb', motherMaiden:'Reza', city:'San Diego', middle:'Joy', oldestSibling:'Hannah', birthday:'August 11'}
      });
      setAccounts(accounts);
    }
  })();

  // initial navigation binding for top icons
  document.getElementById('homeIcon').addEventListener('click', (e)=>{ e.preventDefault(); navigateTo('home'); });
  document.getElementById('gearIcon').addEventListener('click', (e)=>{ e.preventDefault(); navigateTo('settings'); });
  document.getElementById('profilePicWrap').addEventListener('click', (e)=>{ e.preventDefault(); navigateTo('profile'); });

  // on load, ensure sidebar visibility is updated
  document.addEventListener('DOMContentLoaded', refreshAuth);
})();
