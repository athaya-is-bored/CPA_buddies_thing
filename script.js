// script.js - handles sidebar, auth gate, navigation, account setup, recovery, users page, and messages
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
  function getChats(){ return JSON.parse(localStorage.getItem('chats') || '[]'); }
  function setChats(c){ localStorage.setItem('chats', JSON.stringify(c)); }

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
    } else if(page === 'users'){
      renderUsersPage();
    } else if(page === 'messages'){
      renderMessagesPage();
    } else {
      document.getElementById('placeholderPage').classList.remove('hidden');
      document.getElementById('placeholderTitle').textContent = page[0].toUpperCase()+page.slice(1);
    }
  }

  // Sign in/up and account setup/recovery logic (existing) - omitted here for brevity but present above
  // For brevity in this file we assume previous account setup and recovery code remains unchanged.

  // --- Users page implementation ---
  function renderUsersPage(){
    const acc = getCurrentAccount();
    if(!acc){ alert('Please sign in to view users.'); return; }
    const accounts = getAccounts().slice();
    // sort: Admins first, then Teachers, then Students; within each alphabetically
    const groups = {Admin:[], Teacher:[], Student:[]};
    accounts.forEach(a=>{ const s = a.status || 'Student'; if(!groups[s]) groups[s]=[]; groups[s].push(a); });
    Object.keys(groups).forEach(k=> groups[k].sort((x,y)=> x.name.localeCompare(y.name)));

    let html = `<section class="page"><h1 class="page-title">Users</h1><div class="users-search"><input id="usersSearchInput" placeholder="Search users by name or profile..." style=\"width:100%;padding:10px;border-radius:8px;border:1px solid #ddd\"></div><div class=\"users-list\">`;
    ['Admin','Teacher','Student'].forEach(role=>{
      const list = groups[role] || [];
      if(list.length === 0) return;
      list.forEach(u=>{
        html += `<div class=\"users-item\"><img src=\"/assets/default-pfp.svg\" alt=\"pfp\"><a href=\"#\" class=\"user-link\" data-email=\"${u.email}\">${u.name}</a><div class=\"role-tag\">${role}</div></div>`;
      });
    });
    html += `</div></section>`;
    document.getElementById('appContent').innerHTML = html;

    // wire search
    document.getElementById('usersSearchInput').addEventListener('input', (e)=>{
      const q = e.target.value.toLowerCase();
      document.querySelectorAll('.users-item').forEach(item=>{
        const name = item.querySelector('.user-link').textContent.toLowerCase();
        const email = item.querySelector('.user-link').getAttribute('data-email');
        const accounts = getAccounts();
        const u = accounts.find(a=>a.email===email);
        const bio = (u && u.bio || '').toLowerCase();
        const classes = (u && (u.classes||[]).join(' ')) .toLowerCase();
        if(name.includes(q) || bio.includes(q) || classes.includes(q)) item.style.display = ''; else item.style.display = 'none';
      });
    });

    // wire profile links to open profile view
    document.querySelectorAll('.user-link').forEach(link=> link.addEventListener('click', (ev)=>{ ev.preventDefault(); const email = link.getAttribute('data-email'); renderProfilePage(email); }));
  }

  // profile page (basic) - show pfp, name, bio, classes, email if visibility on
  function renderProfilePage(email){
    const accounts = getAccounts();
    const acc = accounts.find(a=>a.email===email);
    if(!acc) return alert('User not found');
    const current = getCurrentAccount();

    let html = `<section class=\"page\"><div style=\"display:flex;gap:12px;align-items:center;justify-content:space-between\"><div style=\"display:flex;gap:12px;align-items:center\"><img src=\"/assets/default-pfp.svg\" style=\"width:80px;height:80px;border-radius:50%\"><div><h2 style=\"margin:0\">${acc.name}</h2><div class=\"small\">${acc.status}</div></div></div>`;
    // message or edit button
    if(current && current.email === acc.email){
      html += `<div><button id=\"editProfileBtn\" class=\"small-btn primary\">Edit Profile</button></div>`;
    } else {
      html += `<div><button id=\"messageProfileBtn\" class=\"small-btn primary\">Message</button></div>`;
    }
    html += `</div>`;

    html += `<div class=\"card\" style=\"margin-top:12px\"><p>${acc.bio || ''}</p><h4>Classes</h4><ul>`;
    (acc.classes || []).forEach(c=> html += `<li>${c}</li>`);
    html += `</ul>`;
    if(acc.settings && acc.settings.emailPublic){ html += `<p>Email: ${acc.email}</p>`; }
    html += `</div></section>`;

    document.getElementById('appContent').innerHTML = html;

    if(document.getElementById('messageProfileBtn')) document.getElementById('messageProfileBtn').addEventListener('click', ()=>{ openOrCreateDM(acc.email); });
    if(document.getElementById('editProfileBtn')) document.getElementById('editProfileBtn').addEventListener('click', ()=>{ alert('Edit profile not implemented here. Use My Profile > Edit.'); });
  }

  // --- Messages implementation ---
  function renderMessagesPage(){
    const current = getCurrentAccount();
    if(!current){ alert('Please sign in to view messages.'); return; }
    const chats = getChats();
    const accounts = getAccounts();

    let html = `<section class=\"page\"><h1 class=\"page-title\">Messages</h1><div class=\"messages-container\">`;
    // left column
    html += `<div class=\"dm-list\"><div style=\"font-weight:700;margin-bottom:8px\">Direct Messages</div><div class=\"dm-section\" id=\"dmSection\">`;
    // list DMs
    const dmChats = chats.filter(c=>c.type==='dm' && c.participants.includes(current.email));
    dmChats.forEach(c=>{
      const otherEmail = c.participants.find(p=>p !== current.email);
      const other = accounts.find(a=>a.email===otherEmail) || {name:otherEmail};
      html += `<div class=\"dm-item\" data-chatid=\"${c.id}\"><img src=\"/assets/default-pfp.svg\"><div><div style=\"font-weight:700\">${other.name}</div><div class=\"small\">${other.email}</div></div></div>`;
    });
    html += `</div><div style=\"height:1px;background:#ccc;margin:8px 0\"></div><div style=\"font-weight:700;margin-bottom:8px\">Group Chats</div><div class=\"dm-section\" id=\"groupSection\">`;
    const groupChats = chats.filter(c=>c.type==='group' && c.participants.includes(current.email));
    groupChats.forEach(c=>{
      const title = c.title || ('Group: '+c.participants.length);
      html += `<div class=\"dm-item\" data-chatid=\"${c.id}\"><img src=\"/assets/default-pfp.svg\"><div><div style=\"font-weight:700\">${title}</div><div class=\"small\">${c.participants.length} members</div></div></div>`;
    });
    html += `</div><button class=\"create-chat-btn\" id=\"createChatBtn\">Create New</button></div>`;

    // chat view
    html += `<div class=\"chat-view\" id=\"chatView\"><div id=\"chatHeader\" style=\"font-weight:700;margin-bottom:8px\">Select a chat</div><div class=\"chat-messages\" id=\"chatMessages\"></div><div class=\"input-row\"><textarea id=\"chatInput\" placeholder=\"Type your message...\"></textarea><button id=\"sendChatBtn\">Send</button></div></div>`;

    html += `</div></section>`;
    document.getElementById('appContent').innerHTML = html;

    // wire chat item clicks
    document.querySelectorAll('.dm-item').forEach(item=> item.addEventListener('click', ()=>{ const id = item.getAttribute('data-chatid'); openChatById(id); }));
    document.getElementById('createChatBtn').addEventListener('click', createNewChatFlow);
    document.getElementById('sendChatBtn').addEventListener('click', sendChatMessage);
  }

  function openChatById(id){
    const chats = getChats();
    const chat = chats.find(c=>c.id===id);
    if(!chat) return;
    const current = getCurrentAccount();
    const accounts = getAccounts();
    const chatHeader = document.getElementById('chatHeader');
    const chatMessages = document.getElementById('chatMessages');
    if(chat.type === 'dm'){
      const otherEmail = chat.participants.find(p=>p !== current.email);
      const other = accounts.find(a=>a.email===otherEmail) || {name:otherEmail};
      chatHeader.textContent = other.name;
    } else {
      chatHeader.textContent = chat.title || 'Group Chat';
    }
    // render messages
    chatMessages.innerHTML = '';
    chat.messages = chat.messages || [];
    chat.messages.forEach(m=>{
      const isSelf = m.sender === current.email;
      const row = document.createElement('div'); row.className = 'message-row '+(isSelf? 'self':'other');
      if(!isSelf){ const name = accounts.find(a=>a.email===m.sender); const el = document.createElement('div'); el.className='message-from'; el.textContent = name ? name.name : m.sender; row.appendChild(el); }
      const bub = document.createElement('div'); bub.className='bubble'; bub.textContent = m.text; row.appendChild(bub);
      const meta = document.createElement('div'); meta.className='message-meta'; meta.textContent = new Date(m.ts).toLocaleString(); row.appendChild(meta);
      chatMessages.appendChild(row);
    });
    // mark messages read? (not implemented)

    // store current open chat id
    localStorage.setItem('openChatId', id);
    // scroll to bottom
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  function sendChatMessage(){
    const input = document.getElementById('chatInput');
    const text = input.value.trim(); if(!text) return;
    const openId = localStorage.getItem('openChatId'); if(!openId) return alert('Select a chat first');
    const chats = getChats(); const idx = chats.findIndex(c=>c.id===openId); if(idx===-1) return;
    const current = getCurrentAccount();
    const msg = { sender: current.email, text, ts: new Date().toISOString() };
    chats[idx].messages = chats[idx].messages || []; chats[idx].messages.push(msg); setChats(chats);
    input.value = '';
    openChatById(openId);
    // send notification to other participants
    const otherEmails = chats[idx].participants.filter(p=>p !== current.email);
    const notifBase = { title:`New Message from ${current.name}`, body:`You have received a new message from ${current.name}.`, read:false, created_at:new Date().toISOString() };
    const notifications = getNotifications();
    otherEmails.forEach(email=>{ const n = Object.assign({}, notifBase, {to:email}); notifications.push(n); });
    setNotifications(notifications);
  }

  function createNewChatFlow(){
    const accounts = getAccounts().filter(a=>a.email !== getAccountEmail());
    // open modal to choose type
    openModal(`<h3>Create Chat</h3><div style=\"margin-bottom:8px\"><button id=\"createDM\" class=\"small-btn primary\">Direct Message</button> <button id=\"createGroup\" class=\"small-btn ghost\">Group Chat</button></div><div id=\"createArea\"></div>`);
    document.getElementById('createDM').addEventListener('click', ()=>{
      const area = document.getElementById('createArea');
      area.innerHTML = '<p>Select one user to DM:</p><div style=\"max-height:200px;overflow:auto\">'+accounts.map(a=>`<div><input type=\"radio\" name=\"dmUser\" value=\"${a.email}\"> ${a.name} (${a.email})</div>`).join('')+'</div><div style=\"margin-top:8px\"><button id=\"confirmDM\" class=\"small-btn primary\">Start DM</button></div>';
      document.getElementById('confirmDM').addEventListener('click', ()=>{
        const sel = document.querySelector('input[name="dmUser"]:checked'); if(!sel) return alert('Pick someone');
        const target = sel.value; closeModal(); openOrCreateDM(target);
      });
    });
    document.getElementById('createGroup').addEventListener('click', ()=>{
      const area = document.getElementById('createArea');
      area.innerHTML = '<p>Select users to add:</p><div style=\"max-height:220px;overflow:auto\">'+accounts.map(a=>`<div><input type=\"checkbox\" name=\"groupUser\" value=\"${a.email}\"> ${a.name} (${a.email})</div>`).join('')+'</div><label>Group title<input id=\"groupTitle\"></label><div style=\"margin-top:8px\"><button id=\"confirmGroup\" class=\"small-btn primary\">Create Group</button></div>';
      document.getElementById('confirmGroup').addEventListener('click', ()=>{
        const checks = Array.from(document.querySelectorAll('input[name="groupUser"]:checked')).map(i=>i.value);
        const title = document.getElementById('groupTitle').value.trim() || 'Group Chat';
        if(checks.length === 0) return alert('Select at least one member');
        const participants = [getAccountEmail(), ...checks];
        const chats = getChats();
        const id = 'chat-'+Date.now();
        chats.push({ id, type:'group', participants, title, messages:[] }); setChats(chats); closeModal(); renderMessagesPage(); openChatById(id);
      });
    });
  }

  function openOrCreateDM(otherEmail){
    const current = getCurrentAccount(); if(!current) return alert('Sign in first');
    const chats = getChats();
    let chat = chats.find(c=> c.type==='dm' && c.participants.includes(current.email) && c.participants.includes(otherEmail));
    if(!chat){ const id = 'chat-'+Date.now(); chat = { id, type:'dm', participants:[current.email, otherEmail], messages:[] }; chats.push(chat); setChats(chats); }
    renderMessagesPage(); // ensures list is updated
    // wait for DOM then open
    setTimeout(()=>{ openChatById(chat.id); }, 150);
  }

  // Modal helpers
  function openModal(html){
    genericModalCard.innerHTML = html;
    genericModal.classList.remove('hidden');
  }
  function closeModal(){ genericModal.classList.add('hidden'); genericModalCard.innerHTML = ''; }

  // seed admin account for testing if no accounts exist (and some other test users)
  (function seed(){
    const accounts = getAccounts();
    if(!accounts.find(a=>a.email === 'athayacraven+admin@gmail.com')){
      accounts.push({ name:'Admin', email:'athayacraven+admin@gmail.com', password:'Admin', approved:true, status:'Admin', bio:'', classes:[], suspended:false, security:{q1:'Ferb', q2:'Reza', q3:'San Diego', q5:'Joy', q6:'Hannah', q9:'August 11'}, settings:{emailPublic:false} });
      accounts.push({ name:'Teacher Tina', email:'tina@example.com', password:'teach', approved:true, status:'Teacher', bio:'High school teacher', classes:['Algebra 2 A'], suspended:false, security:{}, settings:{emailPublic:false} });
      accounts.push({ name:'Student Sam', email:'sam@example.com', password:'student', approved:true, status:'Student', bio:'I like biology', classes:['Biology A'], suspended:false, security:{}, settings:{emailPublic:false} });
      setAccounts(accounts);
    }
    const chats = getChats();
    if(chats.length === 0){
      // create a sample DM between Admin and Sam
      chats.push({ id:'chat-1', type:'dm', participants:['athayacraven+admin@gmail.com','sam@example.com'], messages:[{sender:'sam@example.com', text:'Hey, want to study biology?', ts:new Date().toISOString()}] });
      setChats(chats);
    }
  })();

  // initial navigation binding for top icons
  document.getElementById('homeIcon').addEventListener('click', (e)=>{ e.preventDefault(); navigateTo('home'); });
  document.getElementById('gearIcon').addEventListener('click', (e)=>{ e.preventDefault(); navigateTo('settings'); });
  document.getElementById('profilePicWrap').addEventListener('click', (e)=>{ e.preventDefault(); navigateTo('profile'); });

  // on load, ensure sidebar visibility is updated
  document.addEventListener('DOMContentLoaded', refreshAuth);
})();
