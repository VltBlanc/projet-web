// ── Navigation ──
const navItems = document.querySelectorAll('.nav-item');
const sections = document.querySelectorAll('.content-section');
const sidebar = document.getElementById('sidebar');
const menuToggle = document.getElementById('menu-toggle');

function showSection(id){
  sections.forEach(s=>s.classList.remove('active'));
  navItems.forEach(n=>n.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  document.querySelector(`.nav-item[data-section="${id}"]`).classList.add('active');
  if(window.innerWidth<=768) sidebar.classList.remove('open');
}

navItems.forEach(btn=>{
  btn.addEventListener('click',()=>showSection(btn.dataset.section));
});

if(menuToggle){
  menuToggle.addEventListener('click',()=>{
    sidebar.classList.toggle('open');
  });
}

// ── Chat rooms (event delegation for dynamic rooms) ──
const chatRoomsList = document.getElementById('chat-rooms');
const chatTitle = document.getElementById('chat-title');
const chatBox = document.getElementById('chat-box');

if(chatRoomsList){
  chatRoomsList.addEventListener('click',(e)=>{
    const roomItem = e.target.closest('.room-item');
    if(!roomItem) return;
    chatRoomsList.querySelectorAll('.room-item').forEach(x=>x.classList.remove('active'));
    roomItem.classList.add('active');
    chatTitle.textContent = roomItem.querySelector('.room-name').textContent;
    chatBox.innerHTML = '';
  });
}

// ── WebSocket Chat ──
const sendForm=document.getElementById('send');
const newMessage=document.getElementById('new_message');
let currentUser='Moi';

const ws=new WebSocket(`ws://localhost:8081/ws`);

ws.onopen=function(){ console.log('WebSocket connected'); };

ws.onmessage=function(event){
  let data;
  try{ data=JSON.parse(event.data); }
  catch{ console.error('Malformed message'); return; }
  if('go_to_login' in data){ window.location.href='login.html'; return; }
  if(data.message && data.owner){
    appendMessage(data.owner,data.message,data.owner===currentUser);
  }
};

ws.onerror=function(){ window.location.href='login.html'; };
ws.onclose=function(){ window.location.href='login.html'; };

function appendMessage(author,text,isOwn){
  const div=document.createElement('div');
  div.className='message '+(isOwn?'own':'other');
  const time=new Date().toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'});
  div.innerHTML=`<div class="msg-author">${author}</div><div>${text}</div><div class="msg-time">${time}</div>`;
  chatBox.appendChild(div);
  chatBox.scrollTop=chatBox.scrollHeight;
}

sendForm.addEventListener('submit',function(e){
  e.preventDefault();
  if(!newMessage.value.trim()) return;
  const payload={ message: newMessage.value };
  ws.send(JSON.stringify(payload));
  newMessage.value='';
});

// ── Logout ──
document.getElementById('logout').addEventListener('click',()=>{
  window.location.href='login.html';
});
