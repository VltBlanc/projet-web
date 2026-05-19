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

// ── Feed demo data ──
const feedData=[
  {title:'Match de foot 5v5',sport:'Football',location:'Stade Municipal, Lyon',time:'Aujourd\'hui 18h',participants:4,capacity:10},
  {title:'Sortie running 10km',sport:'Running',location:'Parc de la Tête d\'Or',time:'Demain 7h',participants:8,capacity:12},
  {title:'Session musculation',sport:'Musculation',location:'Basic-Fit Villeurbanne',time:'Mercredi 19h',participants:2,capacity:6},
  {title:'Tennis en double',sport:'Tennis',location:'Club de Tennis, Caluire',time:'Jeudi 17h30',participants:3,capacity:4},
];
const feedGrid=document.getElementById('feed-grid');
feedData.forEach(item=>{
  const card=document.createElement('div');card.className='feed-card';
  card.innerHTML=`
    <div class="feed-image"><span class="feed-badge">${item.sport}</span></div>
    <div class="feed-body">
      <div class="feed-title">${item.title}</div>
      <div class="feed-meta">📍 ${item.location} &nbsp;•&nbsp; 🕐 ${item.time}</div>
      <div class="feed-footer">
        <div class="feed-avatars">
          ${Array.from({length:Math.min(item.participants,4)},(_,i)=>`<div class="avatar">U${i+1}</div>`).join('')}
        </div>
        <button class="join-btn">Rejoindre</button>
      </div>
    </div>`;
  feedGrid.appendChild(card);
});

// ── Events demo data ──
const eventsData=[
  {sport:'Football',title:'Tournoi inter-quartiers',location:'Stade de Gerland, Lyon',date:'15 juin',spots:3,capacity:12},
  {sport:'Basket',title:'Pick-up game du weekend',location:'Gymnase Tony Parker',date:'16 juin',spots:5,capacity:10},
  {sport:'Running',title:'Trail des monts du Lyonnais',location:'Saint-Priest',date:'22 juin',spots:45,capacity:100},
  {sport:'Yoga',title:'Yoga en plein air',location:'Parc de la Tête d\'Or',date:'17 juin',spots:2,capacity:15},
  {sport:'Escalade',title:'Initiation bloc',location:'Salle d\'escalade L\'Orange Bleue',date:'18 juin',spots:6,capacity:8},
  {sport:'Cyclisme',title:'Sortie vélo route 80km',location:'Place Bellecour',date:'20 juin',spots:8,capacity:20},
];
const eventsGrid=document.getElementById('events-grid');
function renderEvents(filter=''){
  eventsGrid.innerHTML='';
  eventsData.filter(e=>e.title.toLowerCase().includes(filter.toLowerCase())||e.sport.toLowerCase().includes(filter.toLowerCase())||e.location.toLowerCase().includes(filter.toLowerCase())).forEach(ev=>{
    const pct=(ev.spots/ev.capacity)*100;
    const div=document.createElement('div');div.className='event-card';
    div.innerHTML=`<div class="event-header"><span class="event-sport">${ev.sport}</span><span class="event-date">${ev.date}</span></div>
      <div class="event-title">${ev.title}</div>
      <div class="event-location">📍 ${ev.location}</div>
      <div class="event-bar"><div style="width:${pct}%"></div></div>
      <div class="event-footer"><span class="event-spots">${ev.spots}/${ev.capacity} inscrits</span><button class="event-btn ${ev.spots>=ev.capacity?'full':''}">${ev.spots>=ev.capacity?'Complet':'Rejoindre'}</button></div>`;
    eventsGrid.appendChild(div);
  });
}
renderEvents();
document.getElementById('event-search').addEventListener('input',e=>renderEvents(e.target.value));
document.getElementById('btn-create-event').addEventListener('click',()=>{
  alert('Création d\'événement – feature à venir');
});

// ── Chat rooms ──
const roomItems=document.querySelectorAll('.room-item');
const chatTitle=document.getElementById('chat-title');
roomItems.forEach(r=>{
  r.addEventListener('click',()=>{
    roomItems.forEach(x=>x.classList.remove('active'));
    r.classList.add('active');
    chatTitle.textContent=r.querySelector('.room-name').textContent;
    chatBox.innerHTML='';
  });
});

// ── WebSocket Chat ──
const sendForm=document.getElementById('send');
const newMessage=document.getElementById('new_message');
const chatBox=document.getElementById('chat-box');
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
