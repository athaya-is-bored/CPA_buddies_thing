// script.js - Frontend with cookie-based authentication (HttpOnly cookies)
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

  // API helpers - cookies sent automatically, no need to attach headers
  async function apiFetch(url, options = {}){
    const defaultOptions = {
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include' // send cookies automatically
    };
    const response = await fetch(url, { ...defaultOptions, ...options });
    
    // Handle 401 - try to refresh token
    if(response.status === 401){
      const refreshed = await refreshAccessToken();
      if(refreshed){
        // Retry original request with new token
        return await fetch(url, { ...defaultOptions, ...options });
      } else {
        // Refresh failed, redirect to login
        logout();
        return response;
      }
    }
    return response;
  }

  async function refreshAccessToken(){
    try{
      const res = await fetch('/api/auth/refresh', {
        method: 'POST',
        credentials: 'include'
      });
      return res.ok;
    }catch(err){
      console.error('Token refresh failed', err);
      return false;
    }
  }

  async function apiSignup(name,email,password){
    const res = await fetch('/api/auth/signup', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ name, email, password }),
      credentials: 'include'
    });
    return res;
  }

  async function apiLogin(email,password){
    const res = await fetch('/api/auth/login', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ email, password }),
      credentials: 'include'
    });
    return res;
  }

  async function apiGetCurrentUser(){
    const res = await apiFetch('/api/auth/me');
    if(!res.ok) throw new Error('Failed to fetch current user');
    return res.json();
  }

  async function apiGetUser(email){
    const res = await apiFetch(`/api/users/${encodeURIComponent(email)}`);
    if(!res.ok) throw new Error('User fetch failed');
    return res.json();
  }

  async function apiGetUsers(q){
    const url = q ? `/api/users?q=${encodeURIComponent(q)}` : '/api/users';
    const res = await apiFetch(url);
    if(!res.ok) throw new Error('Users fetch failed');
    return res.json();
  }

  async function apiGetChats(email){
    const res = await apiFetch(`/api/chats?email=${encodeURIComponent(email)}`);
    if(!res.ok) throw new Error('Chats fetch failed');
    return res.json();
  }

  async function apiGetChatMessages(id){
    const res = await apiFetch(`/api/chats/${encodeURIComponent(id)}/messages`);
    if(!res.ok) throw new Error('Messages fetch failed');
    return res.json();
  }

  async function apiSendChatMessage(id, text){
    const res = await apiFetch(`/api/chats/${encodeURIComponent(id)}/messages`, {
      method:'POST',
      body: JSON.stringify({ text })
    });
    return res;
  }

  async function apiCreateChat(payload){
    const res = await apiFetch('/api/chats', {
      method:'POST',
      body: JSON.stringify(payload)
    });
    return res;
  }

  async function apiAccountSetup(email, answers, status){
    const res = await fetch('/api/account-setup', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ email, answers, status }),
      credentials: 'include'
    });
    return res;
  }

  async function apiGetPendingApprovals(){
    const res = await apiFetch('/api/admin/pending-approvals');
    if(!res.ok) throw new Error('Failed to fetch pending approvals');
    return res.json();
  }

  async function apiApproveUser(userEmail){
    const res = await apiFetch('/api/admin/approve-user', {
      method:'POST',
      body: JSON.stringify({ userEmail })
    });
    return res;
  }

  async function apiRejectUser(userEmail){
    const res = await apiFetch('/api/admin/reject-user', {
      method:'POST',
      body: JSON.stringify({ userEmail })
    });
    return res;
  }

  async function apiForgotPassword(email){
    const res = await fetch('/api/auth/forgot-password', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ email }),
      credentials: 'include'
    });
    return res;
  }

  async function apiVerifyRecoveryAnswer(email, questionKey, answer){
    const res = await fetch('/api/auth/verify-recovery-answer', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ email, questionKey, answer }),
      credentials: 'include'
    });
    return res;
  }

  async function apiResetPassword(email, resetToken, newPassword, repeatPassword){
    const res = await fetch('/api/auth/reset-password', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ email, resetToken, newPassword, repeatPassword }),
      credentials: 'include'
    });
    return res;
  }

  async function apiLogout(){
    const res = await apiFetch('/api/auth/logout', { method:'POST' });
    return res;
  }

  // State management
  let currentUser = null;
  const accountNameSpan = document.getElementById('accountName');

  // refreshAuth: fetch current user from API (cookies handle auth)
  function refreshAuth(){
    apiGetCurrentUser().then(data=>{
      currentUser = data.user;
      accountNameSpan.textContent = currentUser.name || 'Guest';
      authGate.classList.add('hidden');
      document.getElementById('homePage').classList.remove('hidden');
      renderSidebarLinksForRole(currentUser.status);
    }).catch(err => {
      console.error('Failed to fetch current user', err);
      // Not logged in
      authGate.classList.remove('hidden');
      document.getElementById('homePage').classList.add('hidden');
      document.querySelectorAll('.admin-link, .teacher-link').forEach(el=>el.classList.add('hidden'));
      currentUser = null;
    });
  }

  // Call refreshAuth on load
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
    } else if(page === 'admin'){
      renderAdminDashboard();
    } else if(page === 'users'){
      renderUsersPage();
    } else if(page === 'messages'){
      renderMessagesPage();
    } else {
      document.getElementById('placeholderPage').classList.remove('hidden');
      document.getElementById('placeholderTitle').textContent = page[0].toUpperCase()+page.slice(1);
    }
  }

  // ===== Auth Actions =====
  document.getElementById('showSignIn').addEventListener('click', ()=>{ signInModal.classList.remove('hidden'); });
  document.getElementById('showSignUp').addEventListener('click', ()=>{ signUpModal.classList.remove('hidden'); });
  document.getElementById('signinCancel').addEventListener('click', ()=>{ signInModal.classList.add('hidden'); });
  document.getElementById('signupCancel').addEventListener('click', ()=>{ signUpModal.classList.add('hidden'); });

  // Sign in: call API and cookies are set automatically
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
      const user = data.user;
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
        signUpModal.classList.add('hidden');
        authGate.classList.add('hidden');
        if(document.getElementById('accountSetupPage')){
          document.getElementById('homePage').classList.add('hidden');
          showAccountSetup(email);
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

  // ===== Account Setup Page =====
  function showAccountSetup(email){
    const page = document.getElementById('accountSetupPage');
    page.classList.remove('hidden');
    
    document.getElementById('submitSetup').addEventListener('click', async ()=>{
      const answers = {};
      let count = 0;
      for(let i=1; i<=10; i++){
        const inp = document.querySelector(`input[name="q${i}"]`);
        if(inp && inp.value.trim()){
          answers[`q${i}`] = inp.value.trim();
          count++;
        }
      }
      const status = document.getElementById('setupStatus').value;
      
      const err = document.getElementById('setupError');
      err.classList.add('hidden');
      
      if(count < 4){
        err.textContent = 'At least 4 security answers are required.';
        err.classList.remove('hidden');
        return;
      }
      
      try{
        const res = await apiAccountSetup(email, answers, status);
        if(res.ok){
          page.classList.add('hidden');
          showAwaitingApproval();
        } else {
          const body = await res.json().catch(()=>{});
          err.textContent = (body && body.error) || 'Account setup failed';
          err.classList.remove('hidden');
        }
      }catch(e){
        console.error(e);
        err.textContent = 'Account setup failed';
        err.classList.remove('hidden');
      }
    }, { once: true });
    
    document.getElementById('whyRequiredToggle').addEventListener('click', (e)=>{
      e.preventDefault();
      const toggle = document.getElementById('whyRequired');
      toggle.classList.toggle('hidden');
    });
  }

  function showAwaitingApproval(){
    const html = `
      <section class="page">
        <h1>Awaiting Approval</h1>
        <p>Thank you for signing up! To verify that you are a CPA student/teacher, a mod will check your submission manually. Once you are approved, you will receive a notification and are free to explore! You can expect to be approved within a week. Thank you for your patience!</p>
      </section>
    `;
    document.getElementById('appContent').innerHTML = html;
  }

  // ===== Password Recovery =====
  document.getElementById('forgotLink').addEventListener('click', (e)=>{
    e.preventDefault();
    signInModal.classList.add('hidden');
    forgotModal.classList.remove('hidden');
  });
  document.getElementById('forgotCancel').addEventListener('click', ()=>{ forgotModal.classList.add('hidden'); });

  let recoveryState = {};
  
  document.getElementById('forgotSubmit').addEventListener('click', async ()=>{
    const email = document.getElementById('forgotEmail').value.trim();
    const err = document.getElementById('forgotError');
    err.classList.add('hidden');
    if(!email){ err.textContent = 'Please enter an email.'; err.classList.remove('hidden'); return; }
    
    try{
      const res = await apiForgotPassword(email);
      if(!res.ok){
        const body = await res.json().catch(()=>{});
        err.textContent = (body && body.error) || 'Email not found. Please check spelling and try again.';
        err.classList.remove('hidden');
        return;
      }
      
      const data = await res.json();
      recoveryState = { email, questionKey: data.questionKey };
      
      forgotModal.classList.add('hidden');
      document.getElementById('recoveryQuestion').textContent = data.question;
      recoveryModal.classList.remove('hidden');
    }catch(e){
      console.error(e);
      err.textContent = 'Error'; err.classList.remove('hidden');
    }
  });

  document.getElementById('recoveryCancel').addEventListener('click', ()=>{ recoveryModal.classList.add('hidden'); });

  document.getElementById('recoverySubmit').addEventListener('click', async ()=>{
    const answer = document.getElementById('recoveryAnswer').value.trim();
    const err = document.getElementById('recoveryError');
    err.classList.add('hidden');
    if(!answer){ err.textContent = 'Please enter an answer.'; err.classList.remove('hidden'); return; }
    
    try{
      const res = await apiVerifyRecoveryAnswer(recoveryState.email, recoveryState.questionKey, answer);
      if(!res.ok){
        const body = await res.json().catch(()=>{});
        err.textContent = (body && body.error) || 'Incorrect. Please try again.';
        err.classList.remove('hidden');
        document.getElementById('recoveryAnswer').value = '';
        return;
      }
      
      const data = await res.json();
      recoveryState.resetToken = data.resetToken;
      
      recoveryModal.classList.add('hidden');
      showResetPassword();
    }catch(e){
      console.error(e);
      err.textContent = 'Error'; err.classList.remove('hidden');
    }
  });

  function showResetPassword(){
    document.getElementById('resetNew').value = '';
    document.getElementById('resetRepeat').value = '';
    document.getElementById('resetError').classList.add('hidden');
    resetModal.classList.remove('hidden');
  }

  document.getElementById('resetCancel').addEventListener('click', ()=>{ resetModal.classList.add('hidden'); });

  document.getElementById('resetSubmit').addEventListener('click', async ()=>{
    const newPassword = document.getElementById('resetNew').value.trim();
    const repeatPassword = document.getElementById('resetRepeat').value.trim();
    const err = document.getElementById('resetError');
    err.classList.add('hidden');
    
    if(!newPassword || !repeatPassword){
      err.textContent = 'Please fill in all fields.'; err.classList.remove('hidden'); return;
    }
    
    try{
      const res = await apiResetPassword(recoveryState.email, recoveryState.resetToken, newPassword, repeatPassword);
      if(!res.ok){
        const body = await res.json().catch(()=>{});
        err.textContent = (body && body.error) || 'Password reset failed';
        err.classList.remove('hidden');
        return;
      }
      
      resetModal.classList.add('hidden');
      alert('Password reset successfully! Please sign in with your new password.');
      recoveryState = {};
      authGate.classList.remove('hidden');
      document.getElementById('appContent').innerHTML = '<section id="homePage" class="page"><h1 class="page-title">Welcome back, <span id="accountName">Guest</span>!</h1></section>';
    }catch(e){
      console.error(e);
      err.textContent = 'Error'; err.classList.remove('hidden');
    }
  });

  // ===== Logout =====
  function logout(){
    apiLogout().then(()=>{
      refreshAuth();
      location.reload();
    }).catch(err=>{
      console.error(err);
      location.reload();
    });
  }

  document.getElementById('logoutLink').addEventListener('click', (e)=>{
    e.preventDefault();
    if(confirm('Are you sure you would like to logout?')){
      logout();
    }
  });

  // ===== Users Page =====
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
        const tag = document.createElement('div'); tag.textContent = u.status; tag.style.marginLeft='auto'; tag.style.background='#bee6ef'; tag.style.padding='4px 8px'; tag.style.borderRadius='8px'; tag.style.fontWeight='700';
        row.appendChild(pfp); row.appendChild(name); row.appendChild(tag);
        list.appendChild(row);
      });
    }catch(err){ console.error(err); }
  }

  function openProfile(email){
    apiGetUser(email).then(data=>{
      const u = data.user;
      const container = document.getElementById('appContent');
      const html = `
        <section class="page">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;">
            <div style="display:flex;align-items:center;gap:20px;">
              <div style="width:80px;height:80px;border-radius:50%;background:#ddd;"></div>
              <div>
                <h1 style="margin:0;">${u.name}</h1>
                <p style="margin:5px 0;color:#666;">${u.status}</p>
              </div>
            </div>
            <button class="btn primary" id="messageBtn">Message</button>
          </div>
          <div class="card"><h3>Bio</h3><p>${u.bio || '(No bio set)'}</p></div>
          <div class="card"><h3>Classes</h3><p>${u.classes.length > 0 ? u.classes.join(', ') : '(No classes set)'}</p></div>
          ${u.email ? `<div class="card"><h3>Email</h3><p>${u.email}</p></div>` : ''}
        </section>
      `;
      container.innerHTML = html;
      document.getElementById('messageBtn').addEventListener('click', ()=>{
        navigateTo('messages');
      });
    }).catch(err=>{ console.error(err); alert('Failed to load profile'); });
  }

  // ===== Messages Page =====
  async function renderMessagesPage(){
    const container = document.getElementById('appContent');
    container.innerHTML = `
      <section class="page">
        <h1>Messages</h1>
        <div style="display:flex;gap:12px;">
          <div id="chatsList" style="width:28%;background:#bee6ef;border-radius:10px;padding:12px;display:flex;flex-direction:column;height:70vh;"></div>
          <div id="chatWindow" style="flex:1;background:#fff;border-radius:10px;padding:12px;height:70vh;"></div>
        </div>
      </section>
    `;
    const email = currentUser ? currentUser.email : null;
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
      const createBtn = document.createElement('button'); createBtn.textContent='Create New'; createBtn.style.marginTop='12px'; createBtn.className='btn primary';
      createBtn.addEventListener('click', ()=>{ openCreateChat(); });
      list.appendChild(createBtn);
    }catch(err){ console.error(err); document.getElementById('chatsList').textContent='Failed to load chats'; }
  }

  async function openChat(id,name){
    const container = document.getElementById('chatWindow'); container.innerHTML = '<div>Loading...</div>';
    try{
      const res = await apiGetChatMessages(id);
      const msgs = res.messages || [];
      const html = ['<div style="display:flex;flex-direction:column;gap:8px;height:100%;overflow:auto;">'];
      msgs.forEach(m=>{
        const isMe = (m.sender === currentUser.email);
        html.push(`<div style="align-self:${isMe ? 'flex-start' : 'flex-end'};background:#bee6ef;padding:8px;border-radius:8px;max-width:70%"><strong>${isMe ? 'You' : m.sender}</strong><br/>${m.text}<br/><small style="color:#666;font-size:11px;">${new Date(m.created_at).toLocaleString()}</small></div>`);
      });
      html.push(`</div>`);
      html.push(`<div style="margin-top:12px;display:flex;gap:8px;"><input id="msgInput" style="flex:1;padding:8px" placeholder="Type a message..." /><button class="btn primary" id="sendMsgBtn">Send</button></div>`);
      container.innerHTML = html.join('\n');
      document.getElementById('sendMsgBtn').addEventListener('click', async ()=>{
        const v = document.getElementById('msgInput').value.trim(); if(!v) return;
        await apiSendChatMessage(id, v);
        openChat(id,name);
      });
    }catch(err){ console.error(err); container.textContent='Failed to load messages'; }
  }

  async function openCreateChat(){
    const email = currentUser ? currentUser.email : null;
    const participant = prompt('Enter the email of the person to message (for demo)');
    if(!participant) return;
    const id = `dm-${[email,participant].sort().join('-')}`;
    await apiCreateChat({ id, type:'dm', participants:[email, participant] });
    renderMessagesPage();
  }

  // ===== Admin Dashboard =====
  async function renderAdminDashboard(){
    const container = document.getElementById('appContent');
    container.innerHTML = '<section class="page"><h1>Admin Dashboard</h1><div id="adminContent">Loading...</div></section>';
    
    try{
      const res = await apiGetPendingApprovals();
      const pending = res.pending || [];
      let html = '<h2>Pending Approvals</h2>';
      
      if(pending.length === 0){
        html += '<p>No pending approvals.</p>';
      } else {
        pending.forEach(u=>{
          html += `
            <div class="card">
              <div style="display:flex;justify-content:space-between;align-items:center;">
                <div><strong>${u.name}</strong><br/>${u.email}</div>
                <div style="display:flex;gap:8px;">
                  <button class="small-btn primary" onclick="window.approveUserFunc('${u.email}')">Approve</button>
                  <button class="small-btn warn" onclick="window.rejectUserFunc('${u.email}')">Reject</button>
                </div>
              </div>
            </div>
          `;
        });
      }
      
      document.getElementById('adminContent').innerHTML = html;
      
      // Expose functions to window for onclick
      window.approveUserFunc = async (email)=>{
        try{
          const res = await apiApproveUser(email);
          if(res.ok){
            alert('User approved!');
            renderAdminDashboard();
          } else {
            alert('Failed to approve user');
          }
        }catch(err){ console.error(err); alert('Error'); }
      };
      
      window.rejectUserFunc = async (email)=>{
        try{
          const res = await apiRejectUser(email);
          if(res.ok){
            alert('User rejected and deleted!');
            renderAdminDashboard();
          } else {
            alert('Failed to reject user');
          }
        }catch(err){ console.error(err); alert('Error'); }
      };
    }catch(err){
      console.error(err);
      document.getElementById('adminContent').innerHTML = '<p>Failed to load admin dashboard</p>';
    }
  }

  // ===== Navigation =====
  document.getElementById('homeIcon').addEventListener('click', (e)=>{ e.preventDefault(); navigateTo('home'); });
  document.getElementById('gearIcon').addEventListener('click', (e)=>{ e.preventDefault(); navigateTo('settings'); });
  document.getElementById('profilePicWrap').addEventListener('click', (e)=>{ e.preventDefault(); navigateTo('profile'); });

  document.addEventListener('DOMContentLoaded', refreshAuth);

})();
