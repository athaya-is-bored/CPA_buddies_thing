// script.js - updated to use JWT authentication and wire Users + Messages to API
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

  // API helpers (include Authorization if token present)
  function authHeaders(){
    const token = localStorage.getItem('token');
    return token ? { 'Authorization': 'Bearer '+token } : {};
  }
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
    const res = await fetch(`/api/users/${encodeURIComponent(email)}`, { headers: { ...authHeaders() } });
    if(!res.ok) throw new Error('User fetch failed');
    return res.json();
  }
  async function apiGetUsers(q){
    const url = q ? `/api/users?q=${encodeURIComponent(q)}` : '/api/users';
    const res = await fetch(url, { headers: { ...authHeaders() } });
    if(!res.ok) throw new Error('Users fetch failed');
    return res.json();
  }
  async function apiGetChats(email){
    const res = await fetch(`/api/chats?email=${encodeURIComponent(email)}`, { headers: { ...authHeaders() } });
    if(!res.ok) throw new Error('Chats fetch failed');
    return res.json();
  }
  async function apiGetChatMessages(id){
    const res = await fetch(`/api/chats/${encodeURIComponent(id)}/messages`, { headers:{ ...authHeaders() } });
    if(!res.ok) throw new Error('Messages fetch failed');
    return res.json();
  }
  async function apiSendChatMessage(id, text){
    const res = await fetch(`/api/chats/${encodeURIComponent(id)}/messages`, { method:'POST', headers:{ 'Content-Type':'application/json', ...authHeaders() }, body: JSON.stringify({ text }) });
    return res;
  }
  async function apiCreateChat(payload){
    const res = await fetch('/api/chats', { method:'POST', headers:{ 'Content-Type':'application/json', ...authHeaders() }, body: JSON.stringify(payload) });
    return res;
  }

  // initial auth helpers
  function isLoggedIn(){ return !!localStorage.getItem('token'); }
  function getToken(){ return localStorage.getItem('token'); }
  function getAccountEmail(){ return localStorage.getItem('accountEmail') || null; }

  const accountNameSpan = document.getElementById('accountName');

  // refreshAuth: if token stored, fetch their user record from API to get up-to-date status/role
  function refreshAuth(){
    const token = getToken();
    if(!token){
      authGate.classList.remove('hidden');
      document.getElementById('homePage').classList.add('hidden');
      document.querySelectorAll('.admin-link, .teacher-link').forEach(el=>el.classList.add('hidden'));
      return;
    }
    const email = localStorage.getItem('accountEmail');
    if(!email){ authGate.classList.remove('hidden'); return; }
    apiGetUser(email).then(data=>{
      const acc = data.user;
      localStorage.setItem('currentUser', JSON.stringify(acc));
      accountNameSpan.textContent = acc.name || 'Guest';
      authGate.classList.add('hidden');
      document.getElementById('homePage').classList.remove('hidden');
      renderSidebarLinksForRole(acc.status);
    }).catch(err => {
      console.error('Failed to fetch current user', err);
      // token might be invalid
      localStorage.removeItem('token');
      localStorage.removeItem('accountEmail');
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

  // Navigation dispatcher
  function navigateTo(page){
    document.getElementById('homePage').classList.add('hidden');
    document.getElementById('placeholderPage').classList.add('hidden');
    if(document.getElementById('usersPage')) document.getElementById('usersPage').classList.add('hidden');
    if(document.getElementById('messagesPage')) document.getElementById('messagesPage').classList.add('hidden');
    if(page === 'home'){
      document.getElementById('homePage').classList.remove('hidden');
    } else if(page === 'users'){
      renderUsersPage();
    } else if(page === 'messages'){
      renderMessagesPage();
    } else {
      document.getElementById('placeholderPage').classList.remove('hidden');
      document.getElementById('placeholderTitle').textContent = page[0].toUpperCase()+page.slice(1);
    }
  }

  // auth actions
  document.getElementById('showSignIn').addEventListener('click', ()=>{ signInModal.classList.remove('hidden'); });
  document.getElementById('showSignUp').addEventListener('click', ()=>{ signUpModal.classList.remove('hidden'); });
  document.getElementById('signinCancel').addEventListener('click', ()=>{ signInModal.classList.add('hidden'); });
  document.getElementById('signupCancel').addEventListener('click', ()=>{ signUpModal.classList.add('hidden'); });

  // Sign in: call API and store JWT
  document.getElementById('signinSubmit').addEventListener('click', async ()=>{
    const email = document.getElementById('signin-email').value.trim();
    const password = document.getElementById('signin-password').value.trim();
    const err = document.getElementById('signinError');
    err.classList.add('hidden');
    if(!email || !password){ err.classList.remove('hidden'); return; }
    try{
      const res = await apiLogin(email,password);
      if(!res.ok){
        const body = await res.json().catch(()=>{});
        err.textContent = (body && body.error) || 'One or more of your sign-in credentials are incorrect. Please check spelling and try again.';
        err.classList.remove('hidden');
        return;
      }
      const data = await res.json();
      const token = data.token;
      const user = data.user;
      // store token and email
      localStorage.setItem('token', token);
      localStorage.setItem('accountEmail', user.email);
      localStorage.setItem('accountName', user.name || '');
      signInModal.classList.add('hidden');
      if(!user.approved){
        showAwaitingApproval();
        return;
      }
      refreshAuth();
    }catch(e){
      console.error(e);
      err.classList.remove('hidden');
    }
  });

  // Sign up: call API then go to account setup
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
        localStorage.setItem('pendingSetupEmail', email);
        signUpModal.classList.add('hidden');
        authGate.classList.add('hidden');
        if(document.getElementById('accountSetupPage')){
          document.getElementById('homePage').classList.add('hidden');
          document.getElementById('accountSetupPage').classList.remove('hidden');
        } else {
          showAwaitingApproval();
        }
      } else {
        const body = await res.json().catch(()=>{});
        err.textContent = (body && body.error) || 'Sign up failed';
        err.classList.remove('hidden');
      }
    }catch(e){
      console.error(e);
      err.textContent = 'Sign up failed'; err.classList.remove('hidden');
    }
  });

  // Forgot password flow - remains client-assisted until server recovery endpoints added
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
    fetch(`/api/users/${encodeURIComponent(email)}`, { headers: {...authHeaders()} }).then(r=>{
      if(!r.ok) throw new Error('not found');
      return r.json();
    }).then(data=>{
      localStorage.setItem('passwordRecoveryEmail', email);
      forgotModal.classList.add('hidden');
      alert('Server-side recovery flow is not finished yet; please contact an admin for now.');
    }).catch(()=>{
      document.getElementById('forgotError').textContent = 'Email not found. Please check spelling and try again.'; document.getElementById('forgotError').classList.remove('hidden');
    });
  });

  function showAwaitingApproval(){
    const html = `\n      <section class="page">\n        <h1>Awaiting Approval</h1>\n        <p>Thank you for signing up! To verify that you are a CPA student/teacher, a mod will check your submission manually. Once you are approved, you will receive an email and are free to explore! You can expect to be approved within a week. Thank you for your patience!</p>\n      </section>`;
    document.getElementById('appContent').innerHTML = html;
  }

  // logout
  document.getElementById('logoutLink').addEventListener('click', (e)=>{
    e.preventDefault();
    if(confirm('Are you sure you would like to logout?')){
      localStorage.removeItem('token');
      localStorage.removeItem('accountEmail');
      localStorage.removeItem('accountName');
      localStorage.removeItem('currentUser');
      refreshAuth();
      location.reload();
    }
  });

  // Users page wiring
  async function renderUsersPage(){
    try{
      const container = document.getElementById('appContent');
      container.innerHTML = '<section class="page"><h1>Users</h1><input id="userSearch" placeholder="Search users" style="width:100%;padding:8px;margin-bottom:12px;" /><div id="usersList"></div></section>';
      document.getElementById('userSearch').addEventListener('input', async (e)=>{
        await loadUsers(e.target.value);
      });
      await loadUsers();
    }catch(err){ console.error(err); }
  }
  async function loadUsers(q=''){
    try{
      const res = await apiGetUsers(q);
      const users = res.users || [];
      const list = document.getElementById('usersList');
      list.innerHTML = '';
      users.forEach(u=>{
        const row = document.createElement('div');
        row.style.display='flex'; row.style.alignItems='center'; row.style.padding='8px 0'; row.style.borderBottom='1px solid #e1e1e1';
        const pfp = document.createElement('div'); pfp.style.width='40px'; pfp.style.height='40px'; pfp.style.borderRadius='50%'; pfp.style.background='#ddd'; pfp.style.marginRight='12px';
        const name = document.createElement('a'); name.href='#'; name.textContent = u.name; name.style.color='#333333'; name.style.textDecoration='none';
        name.addEventListener('mouseover', ()=>{ name.style.opacity = '0.9' }); name.addEventListener('mouseout', ()=>{ name.style.opacity = '1' });
        name.addEventListener('click', (ev)=>{ ev.preventDefault(); openProfile(u.email); });
        const tag = document.createElement('div'); tag.textContent = u.status; tag.style.marginLeft='auto'; tag.style.background='#bee6ef'; tag.style.padding='4px 8px'; tag.style.borderRadius='8px'; tag.style.fontSize='12px';
        row.appendChild(pfp); row.appendChild(name); row.appendChild(tag);
        list.appendChild(row);
      });
    }catch(err){ console.error(err); }
  }

  function openProfile(email){
    // fetch user and render a simple profile view
    apiGetUser(email).then(data=>{
      const u = data.user;
      const container = document.getElementById('appContent');
      const html = `\n        <section class="page">\n          <div style=\"display:flex;align-items:center;justify-content:space-between;\">\n            <div style=\"display:flex;align-items:center\">\n              <div style=\"width:80px;height:80px;border-radius:50%;background:#e1e1e1;margin-right:16px\"></div>\n              <div>\n                <h2>${u.name}</h2>\n                <div style=\"color:#666\">${u.status}</div>\n              </div>\n            </div>\n            <div>\n              ${ u.email ? `<div style=\"color:#333\">${u.email}</div>` : '' }\n            </div>\n          </div>\n          <div style=\"margin-top:16px;padding:12px;border-radius:8px;background:#fff;\">\n            <div>${u.bio || ''}</div>\n            <div style=\"margin-top:12px\"><strong>Classes</strong><div>${(u.classes||[]).join(', ')}</div></div>\n          </div>\n        </section>`;
      container.innerHTML = html;
    }).catch(err=>{ console.error(err); alert('Failed to load profile'); });
  }

  // Messages page wiring (basic)
  async function renderMessagesPage(){
    const container = document.getElementById('appContent');
    container.innerHTML = `\n      <section class=\"page\">\n        <h1>Messages</h1>\n        <div style=\"display:flex;gap:12px;\">\n          <div id=\"chatsList\" style=\"width:28%;background:#bee6ef;padding:12px;border-radius:8px;\">Loading...</div>\n          <div id=\"chatWindow\" style=\"flex:1;min-height:300px;padding:12px;background:#fff;border-radius:8px;\">Select a chat</div>\n        </div>\n      </section>`;
    const email = localStorage.getItem('accountEmail');
    if(!email){ container.querySelector('#chatsList').textContent='Sign in first'; return; }
    try{
      const res = await apiGetChats(email);
      const chats = res.chats || [];
      const list = document.getElementById('chatsList'); list.innerHTML='';
      chats.forEach(c=>{
        const row = document.createElement('div'); row.style.padding='8px'; row.style.borderBottom='1px solid rgba(0,0,0,0.06)'; row.style.cursor='pointer';
        row.textContent = c.name || c.participants.filter(p=>p!==email).join(', ');
        row.addEventListener('click', ()=>{ openChat(c.id, c.name||''); });
        list.appendChild(row);
      });
      const createBtn = document.createElement('button'); createBtn.textContent='Create New'; createBtn.style.marginTop='12px';
      createBtn.addEventListener('click', ()=>{ openCreateChat(); });
      list.appendChild(createBtn);
    }catch(err){ console.error(err); document.getElementById('chatsList').textContent='Failed to load chats'; }
  }

  async function openChat(id,name){
    const container = document.getElementById('chatWindow'); container.innerHTML = '<div>Loading...</div>';
    try{
      const res = await apiGetChatMessages(id);
      const msgs = res.messages || [];
      const html = ['<div style="display:flex;flex-direction:column;gap:8px;">'];
      msgs.forEach(m=>{
        const isMe = (m.sender === localStorage.getItem('accountEmail'));
        html.push(`<div style="align-self:${isMe ? 'flex-start' : 'flex-end'};background:#bee6ef;padding:8px;border-radius:8px;max-width:70%">${isMe ? 'You' : m.sender}<div style="font-size:12px;color:#333">${m.text}</div><div style="font-size:10px;color:#666">${m.created_at}</div></div>`);
      });
      html.push(`</div>`);
      html.push(`<div style="margin-top:12px;display:flex;gap:8px;"><input id="msgInput" style="flex:1;padding:8px" /><button id="sendMsgBtn">Send</button></div>`);
      container.innerHTML = html.join('\n');
      document.getElementById('sendMsgBtn').addEventListener('click', async ()=>{
        const v = document.getElementById('msgInput').value.trim(); if(!v) return;
        await apiSendChatMessage(id, v);
        openChat(id,name);
      });
    }catch(err){ console.error(err); container.textContent='Failed to load messages'; }
  }

  async function openCreateChat(){
    const email = localStorage.getItem('accountEmail');
    const participant = prompt('Enter the email of the person to message (for demo)');
    if(!participant) return;
    const id = `dm-${[email,participant].sort().join('-')}`;
    await apiCreateChat({ id, type:'dm', participants:[email, participant] });
    renderMessagesPage();
  }

  // initial navigation binding for top icons
  document.getElementById('homeIcon').addEventListener('click', (e)=>{ e.preventDefault(); navigateTo('home'); });
  document.getElementById('gearIcon').addEventListener('click', (e)=>{ e.preventDefault(); navigateTo('settings'); });
  document.getElementById('profilePicWrap').addEventListener('click', (e)=>{ e.preventDefault(); navigateTo('profile'); });

  document.addEventListener('DOMContentLoaded', refreshAuth);

})();
