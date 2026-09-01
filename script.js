// script.js - handles sidebar, auth gate, and navigation + account setup & recovery
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
    document.getElementById('accountSetupPage').classList.add('hidden');
    if(page === 'home'){
      document.getElementById('homePage').classList.remove('hidden');
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

  // Forgot password flow
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
    const accounts = getAccounts();
    const acc = accounts.find(a=>a.email === email);
    if(!acc){ err.textContent = 'Email not found. Please check spelling and try again.'; err.classList.remove('hidden'); return; }
    // store recovery email and prepare questions
    localStorage.setItem('passwordRecoveryEmail', email);
    forgotModal.classList.add('hidden');
    startRecoveryForAccount(acc);
  });

  function startRecoveryForAccount(acc){
    const security = acc.security || {};
    const keys = Object.keys(security).filter(k=>security[k] && security[k].trim().length>0);
    if(keys.length === 0){
      alert('No security questions set for this account. Please contact support.');
      return;
    }
    // pick random question
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

  document.getElementById('recoveryCancel').addEventListener('click', ()=>{ recoveryModal.classList.add('hidden'); });
  document.getElementById('recoverySubmit').addEventListener('click', ()=>{
    const answer = document.getElementById('recoveryAnswer').value.trim();
    const email = localStorage.getItem('passwordRecoveryEmail');
    const accounts = getAccounts();
    const acc = accounts.find(a=>a.email === email);
    const err = document.getElementById('recoveryError'); err.classList.add('hidden');
    if(!acc){ err.textContent = 'Account not found.'; err.classList.remove('hidden'); return; }
    const key = localStorage.getItem('recoveryQuestionKey');
    const correct = (acc.security && acc.security[key]) || '';
    if(answer.toLowerCase() !== (correct || '').toLowerCase()){
      err.textContent = 'Incorrect. Please try again.'; err.classList.remove('hidden');
      // pick another question (if available)
      const keys = Object.keys(acc.security || {}).filter(k=>acc.security[k] && k !== key);
      if(keys.length === 0){
        // no more questions, keep same
        return;
      }
      const newKey = keys[Math.floor(Math.random()*keys.length)];
      localStorage.setItem('recoveryQuestionKey', newKey);
      // update displayed question after short delay
      setTimeout(()=>{ document.getElementById('recoveryQuestion').textContent = questionKeyToText(newKey); document.getElementById('recoveryAnswer').value = ''; }, 600);
      return;
    }
    // correct answer -> open reset password
    recoveryModal.classList.add('hidden');
    resetModal.classList.remove('hidden');
  });

  document.getElementById('resetCancel').addEventListener('click', ()=>{ resetModal.classList.add('hidden'); });
  document.getElementById('resetSubmit').addEventListener('click', ()=>{
    const p1 = document.getElementById('resetNew').value.trim();
    const p2 = document.getElementById('resetRepeat').value.trim();
    const err = document.getElementById('resetError'); err.classList.add('hidden');
    if(!p1 || !p2){ err.textContent = 'Please fill both password fields.'; err.classList.remove('hidden'); return; }
    if(p1 !== p2){ err.textContent = 'Your password does not match your repeated password. Please check spelling and try again.'; err.classList.remove('hidden'); return; }
    const email = localStorage.getItem('passwordRecoveryEmail');
    const accounts = getAccounts();
    const idx = accounts.findIndex(a=>a.email === email);
    if(idx === -1){ err.textContent = 'Account not found.'; err.classList.remove('hidden'); return; }
    accounts[idx].password = p1;
    setAccounts(accounts);
    resetModal.classList.add('hidden');
    // sign in the user and redirect depending on approval
    localStorage.setItem('loggedIn','true');
    localStorage.setItem('accountEmail', email);
    localStorage.setItem('accountName', accounts[idx].name || '');
    if(!accounts[idx].approved){
      showAwaitingApproval();
    } else {
      refreshAuth();
      navigateTo('home');
    }
  });

  function questionKeyToText(k){
    const map = {
      q1: "What was your first pet's name?",
      q2: "What was your mother's maiden name?",
      q3: "What city were you born in?",
      q4: "What year did you join CPA?",
      q5: "What is your middle name?",
      q6: "What is your oldest sibling's name?",
      q7: "What is your youngest sibling's name?",
      q8: "What time were you born?",
      q9: "When is your birthday?",
      q10: "What is your mother’s father’s name?"
    };
    return map[k] || k;
  }

  // Sign in submission
  document.getElementById('signinSubmit').addEventListener('click', ()=>{
    const name = document.getElementById('signin-name').value.trim();
    const email = document.getElementById('signin-email').value.trim();
    const password = document.getElementById('signin-password').value.trim();
    const err = document.getElementById('signinError');
    err.classList.add('hidden');
    const accounts = getAccounts();
    const match = accounts.find(a=>a.email === email && a.password === password);
    if(match){
      localStorage.setItem('loggedIn','true');
      localStorage.setItem('accountEmail', match.email);
      localStorage.setItem('accountName', match.name);
      signInModal.classList.add('hidden');
      if(!match.approved){
        showAwaitingApproval();
        return;
      }
      refreshAuth();
    } else {
      err.classList.remove('hidden');
    }
  });

  // sign up: create account then go to account setup
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
    localStorage.setItem('pendingSetupEmail', email);
    // hide modal and open account setup
    signUpModal.classList.add('hidden');
    authGate.classList.add('hidden');
    openAccountSetupFor(email);
  });

  // Account setup behaviors
  function openAccountSetupFor(email){
    document.getElementById('homePage').classList.add('hidden');
    document.getElementById('placeholderPage').classList.add('hidden');
    document.getElementById('accountSetupPage').classList.remove('hidden');
    document.getElementById('setupError').classList.add('hidden');
  }

  document.getElementById('cancelSetup').addEventListener('click', ()=>{
    // canceling setup logs the user out of any pending state and returns to sign in/up
    localStorage.removeItem('pendingSetupEmail');
    document.getElementById('accountSetupPage').classList.add('hidden');
    authGate.classList.remove('hidden');
  });

  document.getElementById('whyRequiredToggle').addEventListener('click', (e)=>{ e.preventDefault(); document.getElementById('whyRequired').classList.toggle('hidden'); });

  document.getElementById('submitSetup').addEventListener('click', ()=>{
    const email = localStorage.getItem('pendingSetupEmail');
    if(!email) return alert('No pending signup found.');
    const accounts = getAccounts();
    const idx = accounts.findIndex(a=>a.email === email);
    if(idx === -1) return alert('Account not found.');
    const form = document.getElementById('accountSetupForm');
    const data = new FormData(form);
    // gather answers
    const answers = {};
    for(let i=1;i<=10;i++){
      const key = 'q'+i; const val = (data.get(key) || '').toString().trim();
      if(val) answers[key] = val;
    }
    const filled = Object.keys(answers).length;
    const err = document.getElementById('setupError'); err.classList.add('hidden');
    if(filled < 4){ err.textContent = 'At least 4 Security Questions are required. Please add more, then try again.'; err.classList.remove('hidden'); return; }
    const chosenStatus = document.getElementById('setupStatus').value;
    accounts[idx].security = answers;
    accounts[idx].status = chosenStatus || 'Student';
    setAccounts(accounts);
    // send notification to admins about new signup
    const admins = accounts.filter(a=>a.status === 'Admin');
    const notifications = getNotifications();
    const note = { id: 'note-'+Date.now(), title: 'New Signup Awaiting Approval', body: `New signup: ${accounts[idx].name} (${accounts[idx].email}). Please review and approve.`, read:false, created_at: new Date().toISOString() };
    admins.forEach(adm => { const copy = Object.assign({}, note, {to:adm.email}); notifications.push(copy); });
    setNotifications(notifications);

    // cleanup pending and show awaiting approval
    localStorage.removeItem('pendingSetupEmail');
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
        security:{q1:'Ferb', q2:'Reza', q3:'San Diego', q5:'Joy', q6:'Hannah', q9:'August 11'}
      });
      setAccounts(accounts);
    }
  })();

  // Modal helpers
  function openModal(html){
    genericModalCard.innerHTML = html;
    genericModal.classList.remove('hidden');
  }
  function closeModal(){ genericModal.classList.add('hidden'); genericModalCard.innerHTML = ''; }

  // initial navigation binding for top icons
  document.getElementById('homeIcon').addEventListener('click', (e)=>{ e.preventDefault(); navigateTo('home'); });
  document.getElementById('gearIcon').addEventListener('click', (e)=>{ e.preventDefault(); navigateTo('settings'); });
  document.getElementById('profilePicWrap').addEventListener('click', (e)=>{ e.preventDefault(); navigateTo('profile'); });

  // on load, ensure sidebar visibility is updated
  document.addEventListener('DOMContentLoaded', refreshAuth);
})();
