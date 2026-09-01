// script.js - handles sidebar, auth gate, and basic navigation
(function(){
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebarOverlay');
  const hamburger = document.getElementById('hamburger');
  const authGate = document.getElementById('authGate');
  const signInModal = document.getElementById('signInModal');
  const signUpModal = document.getElementById('signUpModal');

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
      showPlaceholder(page);
      closeSidebar();
    })
  });

  // initial auth gate: simple localStorage flag
  function isLoggedIn(){ return localStorage.getItem('loggedIn') === 'true'; }
  function getAccountName(){ return localStorage.getItem('accountName') || 'Guest'; }

  const accountNameSpan = document.getElementById('accountName');
  function refreshAuth(){
    if(!isLoggedIn()){
      authGate.classList.remove('hidden');
      document.getElementById('homePage').classList.add('hidden');
    } else {
      authGate.classList.add('hidden');
      document.getElementById('homePage').classList.remove('hidden');
      accountNameSpan.textContent = getAccountName();
    }
  }
  refreshAuth();

  // auth actions
  document.getElementById('showSignIn').addEventListener('click', ()=>{ signInModal.classList.remove('hidden'); });
  document.getElementById('showSignUp').addEventListener('click', ()=>{ signUpModal.classList.remove('hidden'); });
  document.getElementById('signinCancel').addEventListener('click', ()=>{ signInModal.classList.add('hidden'); });
  document.getElementById('signupCancel').addEventListener('click', ()=>{ signUpModal.classList.add('hidden'); });

  // stub sign in behavior: accept any non-empty fields and set loggedIn
  document.getElementById('signinSubmit').addEventListener('click', ()=>{
    const name = document.getElementById('signin-name').value.trim();
    const email = document.getElementById('signin-email').value.trim();
    const password = document.getElementById('signin-password').value.trim();

    const err = document.getElementById('signinError');
    if(name && email && password){
      // NOTE: This is a placeholder. Real auth will be implemented server-side later.
      localStorage.setItem('loggedIn','true');
      localStorage.setItem('accountName', name);
      signInModal.classList.add('hidden');
      authGate.classList.add('hidden');
      refreshAuth();
    } else {
      err.classList.remove('hidden');
    }
  });

  // stub sign up: do basic validation and open account setup next (not implemented yet)
  document.getElementById('signupSubmit').addEventListener('click', ()=>{
    const name = document.getElementById('signup-name').value.trim();
    const email = document.getElementById('signup-email').value.trim();
    const password = document.getElementById('signup-password').value.trim();
    const err = document.getElementById('signupError');
    if(!name || !email || !password){ err.textContent = 'Please fill in all fields.'; err.classList.remove('hidden'); return; }
    // placeholder: store minimal account info in localStorage
    const accounts = JSON.parse(localStorage.getItem('accounts') || '[]');
    if(accounts.find(a=>a.email === email)){
      err.textContent = 'An account with that email already exists.'; err.classList.remove('hidden'); return;
    }
    accounts.push({name, email, password, approved:false, status:'Student'});
    localStorage.setItem('accounts', JSON.stringify(accounts));

    // mark as awaiting approval UI
    localStorage.setItem('pendingSignUpName', name);
    signUpModal.classList.add('hidden');
    authGate.classList.add('hidden');
    showAwaitingApproval();
  });

  function showAwaitingApproval(){
    // simple overlay page
    const html = `\n      <section class="page">\n        <h1>Awaiting Approval</h1>\n        <p>Thank you for signing up! To verify that you are a CPA student/teacher, a mod will check your submission manually. Once you are approved, you will receive an email and are free to explore! You can expect to be approved within a week. Thank you for your patience!</p>\n      </section>`;
    document.getElementById('appContent').innerHTML = html;
  }

  // placeholder for logout
  document.getElementById('logoutLink').addEventListener('click', (e)=>{
    e.preventDefault();
    if(confirm('Are you sure you would like to logout?')){
      localStorage.removeItem('loggedIn');
      localStorage.removeItem('accountName');
      // return to sign in/up
      refreshAuth();
    }
  });

  // placeholder nav show
  function showPlaceholder(page){
    const title = page[0].toUpperCase() + page.slice(1);
    document.getElementById('homePage').classList.add('hidden');
    const ph = document.getElementById('placeholderPage');
    ph.classList.remove('hidden');
    document.getElementById('placeholderTitle').textContent = title;
  }

  // seed admin account for testing if no accounts exist
  (function seedAdmin(){
    const accounts = JSON.parse(localStorage.getItem('accounts') || '[]');
    if(!accounts.find(a=>a.email === 'athayacraven+admin@gmail.com')){
      accounts.push({
        name:'Admin',
        email:'athayacraven+admin@gmail.com',
        password:'Admin',
        approved:true,
        status:'Admin',
        security:{firstPet:'Ferb', motherMaiden:'Reza', city:'San Diego', middle:'Joy', oldestSibling:'Hannah', birthday:'August 11'}
      });
      localStorage.setItem('accounts', JSON.stringify(accounts));
    }
  })();

})();
