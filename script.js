// script.js - updated to use backend API for Sign Up and Sign In, rest remains client-side
(function(){
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebarOverlay');
  const hamburger = document.getElementById('hamburger');
  const authGate = document.getElementById('authGate');
  const signInModal = document.getElementById('signInModal');
  const signUpModal = document.getElementById('signUpModal');
  const forgotModal = document.getElementById('forgotModal');
  const recoveryModal = document.getElementById('recoveryModal');
  const resetModal = document.getElementById('resetModal');
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

  // Local storage helpers (still used for some client-only pieces)
  function getAccounts(){ return JSON.parse(localStorage.getItem('accounts') || '[]'); }
  function setAccounts(a){ localStorage.setItem('accounts', JSON.stringify(a)); }
  function getNotifications(){ return JSON.parse(localStorage.getItem('notifications') || '[]'); }
  function setNotifications(n){ localStorage.setItem('notifications', JSON.stringify(n)); }
  function getChats(){ return JSON.parse(localStorage.getItem('chats') || '[]'); }
  function setChats(c){ localStorage.setItem('chats', JSON.stringify(c)); }

  // API helpers
  async function apiSignup(name,email,password){
    const res = await fetch('/api/auth/signup', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ name, email, password })
    });
    return res;
  }
  async function apiLogin(email,password){
    const res = await fetch('/api/auth/login', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ email, password })
    });
    return res;
  }
  async function apiGetUser(email){
    const res = await fetch(`/api/users/${encodeURIComponent(email)}`);
    if(!res.ok) throw new Error('User fetch failed');
    return res.json();
  }

  // initial auth helpers
  function isLoggedIn(){ return localStorage.getItem('loggedIn') === 'true'; }
  function getAccountEmail(){ return localStorage.getItem('accountEmail') || null; }
  function getCurrentAccountLocal(){ const email = getAccountEmail(); if(!email) return null; return JSON.parse(localStorage.getItem('currentUser') || 'null'); }

  const accountNameSpan = document.getElementById('accountName');

  // refreshAuth: if user email stored, fetch their user record from API to get up-to-date status/role
  function refreshAuth(){
    const email = getAccountEmail();
    if(!isLoggedIn() || !email){
      authGate.classList.remove('hidden');
      document.getElementById('homePage').classList.add('hidden');
      document.querySelectorAll('.admin-link, .teacher-link').forEach(el=>el.classList.add('hidden'));
      return;
    }
    // fetch user
    apiGetUser(email).then(data=>{
      const acc = data.user;
      localStorage.setItem('currentUser', JSON.stringify(acc));
      accountNameSpan.textContent = acc.name || 'Guest';
      authGate.classList.add('hidden');
      document.getElementById('homePage').classList.remove('hidden');
      renderSidebarLinksForRole(acc.status);
    }).catch(err => {
      console.error('Failed to fetch current user', err);
      // fallback to showing auth gate
      authGate.classList.remove('hidden');
    });
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

  // Navigation dispatcher (keeps pages as before)
  function navigateTo(page){
    document.getElementById('homePage').classList.add('hidden');
    document.getElementById('placeholderPage').classList.add('hidden');
    document.getElementById('accountSetupPage') && document.getElementById('accountSetupPage').classList.add('hidden');
    if(page === 'home'){
      document.getElementById('homePage').classList.remove('hidden');
    } else if(page === 'users'){
      // users rendering still client-side until we wire fully
      renderUsersPage && renderUsersPage();
    } else if(page === 'messages'){
      renderMessagesPage && renderMessagesPage();
    } else {
      document.getElementById('placeholderPage').classList.remove('hidden');
      document.getElementById('placeholderTitle').textContent = page[0].toUpperCase()+page.slice(1);
    }
  }

  // auth actions: use API for signup and signin
  document.getElementById('showSignIn').addEventListener('click', ()=>{ signInModal.classList.remove('hidden'); });
  document.getElementById('showSignUp').addEventListener('click', ()=>{ signUpModal.classList.remove('hidden'); });
  document.getElementById('signinCancel').addEventListener('click', ()=>{ signInModal.classList.add('hidden'); });
  document.getElementById('signupCancel').addEventListener('click', ()=>{ signUpModal.classList.add('hidden'); });

  // Sign in: call API
  document.getElementById('signinSubmit').addEventListener('click', async ()=>{
    const name = document.getElementById('signin-name').value.trim();
    const email = document.getElementById('signin-email').value.trim();
    const password = document.getElementById('signin-password').value.trim();
    const err = document.getElementById('signinError');
    err.classList.add('hidden');
    if(!email || !password){ err.classList.remove('hidden'); return; }
    try{
      const res = await apiLogin(email,password);
      if(!res.ok){
        err.classList.remove('hidden');
        return;
      }
      const data = await res.json();
      const user = data.user;
      // store minimal session info client-side
      localStorage.setItem('loggedIn','true');
      localStorage.setItem('accountEmail', user.email);
      localStorage.setItem('accountName', user.name || '');
      localStorage.setItem('currentUser', JSON.stringify(user));
      signInModal.classList.add('hidden');
      if(!user.approved){
        // if not approved, show awaiting approval screen
        showAwaitingApproval();
        return;
      }
      refreshAuth();
    }catch(e){
      console.error(e);
      err.classList.remove('hidden');
    }
  });

  // Sign up: call API then go to account setup (client still handles security answers until server endpoint added)
  document.getElementById('signupSubmit').addEventListener('click', async ()=>{
    const name = document.getElementById('signup-name').value.trim();
    const email = document.getElementById('signup-email').value.trim();
    const password = document.getElementById('signup-password').value.trim();
    const err = document.getElementById('signupError');
    err.classList.add('hidden');
    if(!name || !email || !password){ err.textContent = 'Please fill in all fields.'; err.classList.remove('hidden'); return; }
    try{
      const res = await apiSignup(name,email,password);
      if(res.status === 201){
        // server created user; store pending setup email locally and open account setup
        localStorage.setItem('pendingSetupEmail', email);
        signUpModal.classList.add('hidden');
        authGate.classList.add('hidden');
        // show account setup section (same client flow as before)
        if(document.getElementById('accountSetupPage')){
          document.getElementById('homePage').classList.add('hidden');
          document.getElementById('accountSetupPage').classList.remove('hidden');
        } else {
          showAwaitingApproval();
        }
      } else {
        const body = await res.json();
        err.textContent = (body && body.error) || 'Sign up failed';
        err.classList.remove('hidden');
      }
    }catch(e){
      console.error(e);
      err.textContent = 'Sign up failed'; err.classList.remove('hidden');
    }
  });

  // The rest of account setup / recovery flows still use client-side behavior until server endpoints are added

  // Forgot password flow still relies on client-side account info; keep existing handlers
  document.getElementById('forgotLink').addEventListener('click', (e)=>{
    e.preventDefault();
    signInModal.classList.add('hidden');
    forgotModal.classList.remove('hidden');
  });
  document.getElementById('forgotCancel').addEventListener('click', ()=>{ forgotModal.classList.add('hidden'); });

  document.getElementById('forgotSubmit').addEventListener('click', ()=>{
    const email = document.getElementById('forgotEmail').value.trim();
    const err = document.getElementById('forgotError'); err.classList.add('hidden');
    if(!email){ err.textContent = 'Please enter an email.'; err.classList.remove('hidden'); return; }
    // For now, try to fetch user from API to verify existence
    fetch(`/api/users/${encodeURIComponent(email)}`).then(r=>{
      if(!r.ok) throw new Error('not found');
      return r.json();
    }).then(data=>{
      // continue with client-side recovery using stored security (if present client-side) or inform user to contact admin
      localStorage.setItem('passwordRecoveryEmail', email);
      forgotModal.classList.add('hidden');
      // attempt to start recovery using account data from server
      // server currently doesn't expose security answers; full server-side recovery endpoint will be implemented later.
      startRecoveryForAccountClientSide(email);
    }).catch(()=>{
      document.getElementById('forgotError').textContent = 'Email not found. Please check spelling and try again.'; document.getElementById('forgotError').classList.remove('hidden');
    });
  });

  // Minimal client-side recovery helper (uses localStorage fallback from older client-only data)
  function startRecoveryForAccountClientSide(email){
    const accounts = getAccounts();
    const acc = accounts.find(a=>a.email === email);
    if(acc && acc.security){
      startRecoveryForAccount(acc);
    } else {
      alert('Recovery requires security answers stored on this browser or server-side flow is not implemented yet. Please contact an admin.');
    }
  }

  // The rest of the original client-side admin/users/messages code remains unchanged and will be wired to API next

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
      localStorage.removeItem('currentUser');
      refreshAuth();
      location.reload();
    }
  });

  // seed localstorage for legacy client-only features (does not affect server)
  (function seedLocal(){
    const accounts = getAccounts();
    if(accounts.length === 0){
      accounts.push({ name:'Local Sam', email:'sam@example.com', password:'student', approved:true, status:'Student', bio:'Local sample user', classes:['Biology A'], suspended:false, security:{}, settings:{emailPublic:false} });
      setAccounts(accounts);
    }
  })();

  // initial navigation binding for top icons
  document.getElementById('homeIcon').addEventListener('click', (e)=>{ e.preventDefault(); navigateTo('home'); });
  document.getElementById('gearIcon').addEventListener('click', (e)=>{ e.preventDefault(); navigateTo('settings'); });
  document.getElementById('profilePicWrap').addEventListener('click', (e)=>{ e.preventDefault(); navigateTo('profile'); });

  // on load, ensure sidebar visibility is updated
  document.addEventListener('DOMContentLoaded', refreshAuth);

  // small helpers copied from previous implementation used by recovery flow
  function startRecoveryForAccount(acc){
    const security = acc.security || {};
    const keys = Object.keys(security).filter(k=>security[k] && security[k].trim().length>0);
    if(keys.length === 0){
      alert('No security questions set for this account. Please contact support.');
      return;
    }
    const picked = keys[Math.floor(Math.random()*keys.length)];
    localStorage.setItem('recoveryQuestionKey', picked);
    renderRecoveryQuestion(picked, security[picked]);
  }
  function renderRecoveryQuestion(key, expected){
    document.getElementById('recoveryQuestion').textContent = questionKeyToText(key);
    document.getElementById('recoveryAnswer').value = '';
    document.getElementById('recoveryError').classList.add('hidden');
    recoveryModal.classList.remove('hidden');
  }
  function questionKeyToText(k){
    const map = { q1: "What was your first pet's name?", q2: "What was your mother's maiden name?", q3: "What city were you born in?", q4: "What year did you join CPA?", q5: "What is your middle name?", q6: "What is your oldest sibling's name?", q7: "What is your youngest sibling's name?", q8: "What time were you born?", q9: "When is your birthday?", q10: "What is your mother’s father’s name?" };
    return map[k] || k;
  }

})();
