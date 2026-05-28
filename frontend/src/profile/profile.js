// ══════════════════════════════════════════════════════════
//  SportConnect – Profile Module
// ══════════════════════════════════════════════════════════

const API = (() => {
  const h = location.hostname;
  return h === 'localhost' ? 'http://localhost:8081' : `http://${h}:8081`;
})();

// ── DOM refs ──────────────────────────────────────────────
const $ = id => document.getElementById(id);
const $$ = sel => document.querySelector(sel);

// Profile card
const elAvatar        = $('profile-avatar');
const elUsername      = $('profile-username');
const elBioDisplay    = $('profile-bio-display');
const elStatEvents    = $('stat-events');
const elStatSports    = $('stat-sports');
const elStatUpcoming  = $('stat-upcoming');
const mobileAvatar    = $$('.mobile-avatar');

// Overview
const elOvEvents    = $('ov-events');
const elOvUpcoming  = $('ov-upcoming');
const elOvSports    = $('ov-sports');
const elUpcomingList = $('upcoming-events-list');
const elOverviewSports = $('overview-sports-list');

// Events tab
const elMyEventsList = $('my-events-list');

// Sports tab
const elMySportsList    = $('my-sports-list');
const elSportActivity   = $('sport-activity-list');

// Settings
const elSettingUsername = $('setting-username');
const elSettingBio      = $('setting-bio');

// Modal
const elModalAvatar = $('modal-avatar-preview');
const elEditUsername = $('edit-username-display');
const elEditBio      = $('edit-bio-input');
const elBioCharCurrent = $('bio-char-current');

// State
let allMyEvents = [];        // tous les événements rejoints
let currentFilter = 'upcoming';
let currentBio = '';

const SPORT_ICONS = {
  football: '⚽', basket: '🏀', running: '🏃', tennis: '🎾',
  musculation: '💪', yoga: '🧘', escalade: '🧗', cyclisme: '🚴',
  natation: '🏊', badminton: '🏸',
};

// ── Helpers ───────────────────────────────────────────────
function sportIcon(s) { return SPORT_ICONS[s?.toLowerCase()] || '🏅'; }

function formatDate(dateStr) {
  return new Date(dateStr).toLocaleDateString('fr-FR', {
    day: 'numeric', month: 'short', year: 'numeric'
  });
}

function isUpcoming(event) {
  return new Date(event.event_date) >= new Date();
}

// ── Username & Avatar ─────────────────────────────────────
function initUserDisplay() {
  const name = localStorage.getItem('currentUser') || 'Utilisateur';
  const initials = name.slice(0, 2).toUpperCase();

  if (elUsername) {
    elUsername.textContent = name;
    // Ajouter un badge admin si l'utilisateur est admin
    const userRole = localStorage.getItem('userRole');
    if (userRole === 'admin') {
      const badge = document.createElement('span');
      badge.className = 'admin-badge';
      badge.textContent = 'Admin';
      elUsername.appendChild(badge);
    }
  }
  if (elAvatar)    elAvatar.textContent    = initials;
  if (mobileAvatar) mobileAvatar.textContent = initials;

  // Bio from localStorage
  currentBio = localStorage.getItem('profileBio') || 'Passionné de sport et de rencontres. Rejoins-moi pour une session !';
  if (elBioDisplay) elBioDisplay.textContent = currentBio;
  if (elSettingUsername) elSettingUsername.textContent = name;
  if (elSettingBio)      elSettingBio.textContent = currentBio;
  if (elEditUsername) elEditUsername.value = name;
  if (elModalAvatar)  elModalAvatar.textContent = initials;
}

// ── Load profile data ─────────────────────────────────────
async function loadProfileData() {
  try {
    const name = localStorage.getItem('currentUser') || 'Utilisateur';
    const [evRes, allEvRes, catRes, profileRes] = await Promise.all([
      fetch(`${API}/my-events`,          { credentials: 'include' }),
      fetch(`${API}/events`,             { credentials: 'include' }),
      fetch(`${API}/categories/followed`,{ credentials: 'include' }),
      fetch(`${API}/users/${name}/profile`, { credentials: 'include' }),
    ]);

    if (evRes.status === 401) { window.location.href = 'login.html'; return; }

    const myEventIds      = evRes.ok      ? await evRes.json()   : [];
    const allEvents       = allEvRes.ok   ? await allEvRes.json(): [];
    const followedCats    = catRes.ok     ? await catRes.json()  : [];
    
    if (profileRes.ok) {
      const profileData = await profileRes.json();
      currentBio = profileData.bio || 'Passionné de sport et de rencontres. Rejoins-moi pour une session !';
      localStorage.setItem('profileBio', currentBio);
      if (elBioDisplay) elBioDisplay.textContent = currentBio;
      if (elSettingBio) elSettingBio.textContent = currentBio;
    }

    allMyEvents = allEvents.filter(e => myEventIds.map(Number).includes(Number(e.id)));
    const upcoming = allMyEvents.filter(isUpcoming);
    const sports   = new Set(allMyEvents.map(e => e.sport.toLowerCase()));

    // Header stats
    if (elStatEvents)   elStatEvents.textContent   = allMyEvents.length;
    if (elStatSports)   elStatSports.textContent   = followedCats.length || sports.size;
    if (elStatUpcoming) elStatUpcoming.textContent = upcoming.length;

    // Overview mini-stats
    if (elOvEvents)   elOvEvents.textContent   = allMyEvents.length;
    if (elOvUpcoming) elOvUpcoming.textContent = upcoming.length;
    if (elOvSports)   elOvSports.textContent   = followedCats.length || sports.size;

    // Render sections
    renderUpcomingEvents(upcoming.slice(0, 4));
    renderSportsTags(followedCats, sports, elOverviewSports);
    renderSportsTags(followedCats, sports, elMySportsList);
    renderSportActivity(allMyEvents, followedCats);
    renderFilteredEvents();

  } catch (err) {
    console.error('Erreur profil:', err);
  }
}

// ── Render: upcoming events (overview) ────────────────────
function renderUpcomingEvents(events) {
  if (!elUpcomingList) return;
  if (events.length === 0) {
    elUpcomingList.innerHTML = '<p class="profile-empty">Aucune séance à venir. Rejoins un événement !</p>';
    return;
  }
  elUpcomingList.innerHTML = events.map(ev => {
    const daysLeft = Math.ceil((new Date(ev.event_date) - new Date()) / 86400000);
    const badge = daysLeft === 0 ? "Aujourd'hui" : daysLeft === 1 ? 'Demain' : `Dans ${daysLeft}j`;
    return `
      <div class="profile-event-item">
        <div class="profile-event-sport">${ev.sport}</div>
        <div class="profile-event-info">
          <span class="profile-event-title">${ev.title}</span>
          <span class="profile-event-meta">📍 ${ev.location} &nbsp;·&nbsp; 📅 ${formatDate(ev.event_date)}</span>
        </div>
        <div class="profile-event-date-badge">${badge}</div>
      </div>`;
  }).join('');
}

// ── Render: events tab with filter ────────────────────────
function renderFilteredEvents() {
  if (!elMyEventsList) return;
  let events = [...allMyEvents];
  if (currentFilter === 'upcoming') events = events.filter(isUpcoming);
  if (currentFilter === 'past')     events = events.filter(e => !isUpcoming(e));
  events.sort((a, b) => new Date(a.event_date) - new Date(b.event_date));

  if (events.length === 0) {
    const msgs = {
      upcoming: 'Aucune séance à venir. Rejoins un événement !',
      past:     'Aucun événement passé.',
      all:      'Tu n\'as rejoint aucun événement pour l\'instant.',
    };
    elMyEventsList.innerHTML = `<p class="profile-empty">${msgs[currentFilter]}</p>`;
    return;
  }

  elMyEventsList.innerHTML = events.map(ev => {
    const past = !isUpcoming(ev);
    return `
      <div class="profile-event-item${past ? ' profile-event-past' : ''}">
        <div class="profile-event-sport">${ev.sport}</div>
        <div class="profile-event-info">
          <span class="profile-event-title">${ev.title}</span>
          <span class="profile-event-meta">📍 ${ev.location} &nbsp;·&nbsp; 📅 ${formatDate(ev.event_date)}</span>
        </div>
        <div class="profile-event-date-badge${past ? ' past' : ''}">${past ? 'Terminé' : formatDate(ev.event_date)}</div>
      </div>`;
  }).join('');
}

// ── Render: sports tags ────────────────────────────────────
function renderSportsTags(followed, practiced, container) {
  if (!container) return;
  const all = new Set([...followed.map(s => s.toLowerCase()), ...practiced]);
  if (all.size === 0) {
    container.innerHTML = '<p class="profile-empty">Aucun sport suivi pour l\'instant.</p>';
    return;
  }
  container.innerHTML = '';
  all.forEach(s => {
    const tag = document.createElement('div');
    tag.className = 'profile-sport-tag';
    tag.innerHTML = `<span>${sportIcon(s)}</span> ${s.charAt(0).toUpperCase() + s.slice(1)}`;
    container.appendChild(tag);
  });
}

// ── Render: sport activity bars ────────────────────────────
function renderSportActivity(events, followedCats) {
  if (!elSportActivity) return;
  const counts = {};
  events.forEach(e => {
    const k = e.sport.toLowerCase();
    counts[k] = (counts[k] || 0) + 1;
  });
  // Add followed categories with 0 events
  followedCats.forEach(c => { if (!counts[c]) counts[c] = 0; });
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  if (entries.length === 0) {
    elSportActivity.innerHTML = '<p class="profile-empty">Aucune activité.</p>';
    return;
  }
  const max = Math.max(...entries.map(e => e[1]), 1);
  elSportActivity.innerHTML = entries.map(([sport, count]) => `
    <div class="sport-activity-row">
      <div class="sport-activity-name">${sportIcon(sport)} ${sport.charAt(0).toUpperCase() + sport.slice(1)}</div>
      <div class="sport-activity-bar-wrap">
        <div class="sport-activity-bar" style="width:${Math.max((count / max) * 100, count > 0 ? 8 : 3)}%"></div>
      </div>
      <div class="sport-activity-count">${count}</div>
    </div>`).join('');
}

// ── Profile Tabs ──────────────────────────────────────────
document.querySelectorAll('.profile-tab').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.profile-tab').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.profile-tab-content').forEach(c => c.classList.remove('active'));
    btn.classList.add('active');
    const target = $(`ptab-${btn.dataset.ptab}`);
    if (target) target.classList.add('active');
  });
});

// ── Event filter tabs ─────────────────────────────────────
document.querySelectorAll('.filter-tab').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.filter-tab').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentFilter = btn.dataset.efilter;
    renderFilteredEvents();
  });
});

// ── Edit Profile Modal ────────────────────────────────────
function openEditModal() {
  if (elEditBio) {
    elEditBio.value = currentBio;
    updateCharCount();
  }
  const modal = $('edit-profile-modal');
  if (modal) modal.classList.add('active');
}

function closeEditModal() {
  const modal = $('edit-profile-modal');
  if (modal) modal.classList.remove('active');
}

function updateCharCount() {
  if (elBioCharCurrent && elEditBio) {
    elBioCharCurrent.textContent = elEditBio.value.length;
  }
}

const btnEditProfile  = $('btn-edit-profile');
const btnEditSettings = $('btn-settings-edit-bio');
const btnClose        = $('edit-profile-close');
const btnCancel       = $('edit-profile-cancel');
const btnSave         = $('btn-save-profile');

if (btnEditProfile)  btnEditProfile.addEventListener('click', openEditModal);
if (btnEditSettings) btnEditSettings.addEventListener('click', () => {
  // Switch to settings tab first, then open modal
  openEditModal();
});
if (btnClose)  btnClose.addEventListener('click', closeEditModal);
if (btnCancel) btnCancel.addEventListener('click', closeEditModal);
if (elEditBio) elEditBio.addEventListener('input', updateCharCount);

$('edit-profile-modal')?.addEventListener('click', e => {
  if (e.target === $('edit-profile-modal')) closeEditModal();
});

if (btnSave) {
  btnSave.addEventListener('click', async () => {
    const newBio = elEditBio?.value.trim() || '';
    
    try {
      const res = await fetch(`${API}/profile`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bio: newBio }),
      });
      if (!res.ok) {
        console.error('Erreur lors de la sauvegarde de la biographie sur le serveur');
      }
    } catch (err) {
      console.error('Erreur réseau lors de la sauvegarde de la biographie:', err);
    }

    currentBio = newBio;
    localStorage.setItem('profileBio', newBio);
    if (elBioDisplay)  elBioDisplay.textContent  = newBio || 'Aucune biographie.';
    if (elSettingBio)  elSettingBio.textContent  = newBio || '–';
    closeEditModal();
    showToast('Profil mis à jour !');
  });
}

// ── Toggle password visibility ────────────────────────────
document.querySelectorAll('.toggle-pw').forEach(btn => {
  btn.addEventListener('click', () => {
    const input = document.getElementById(btn.dataset.target);
    if (!input) return;
    input.type = input.type === 'password' ? 'text' : 'password';
    btn.textContent = input.type === 'password' ? '👁' : '🙈';
  });
});

// ── Password strength ─────────────────────────────────────
const cpNewInput = $('cp-new');
const strengthFill  = $('pw-strength-fill');
const strengthLabel = $('pw-strength-label');

function getStrength(pw) {
  let score = 0;
  if (pw.length >= 8)  score++;
  if (pw.length >= 12) score++;
  if (/[A-Z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  return score;
}

const STRENGTH_LEVELS = [
  { label: '', color: 'transparent', pct: 0 },
  { label: 'Très faible', color: '#ef4444', pct: 20 },
  { label: 'Faible',      color: '#f97316', pct: 40 },
  { label: 'Moyen',       color: '#eab308', pct: 60 },
  { label: 'Fort',        color: '#22c55e', pct: 80 },
  { label: 'Très fort',   color: '#16a34a', pct: 100 },
];

if (cpNewInput) {
  cpNewInput.addEventListener('input', () => {
    const s = getStrength(cpNewInput.value);
    const level = cpNewInput.value ? STRENGTH_LEVELS[s] || STRENGTH_LEVELS[5] : STRENGTH_LEVELS[0];
    if (strengthFill)  { strengthFill.style.width = level.pct + '%'; strengthFill.style.background = level.color; }
    if (strengthLabel) { strengthLabel.textContent = level.label; strengthLabel.style.color = level.color; }
  });
}

// ── Change password form ──────────────────────────────────
const cpForm = $('change-password-form');
const cpMsg  = $('cp-msg');

function showCpMsg(text, type) {
  if (!cpMsg) return;
  cpMsg.textContent = text;
  cpMsg.className = `cp-message ${type}`;
  setTimeout(() => { cpMsg.className = 'cp-message'; }, 4000);
}

if (cpForm) {
  cpForm.addEventListener('submit', async e => {
    e.preventDefault();
    const current = $('cp-current')?.value;
    const newPw   = $('cp-new')?.value;
    const confirm = $('cp-confirm')?.value;

    if (!current || !newPw || !confirm) {
      showCpMsg('Veuillez remplir tous les champs.', 'error'); return;
    }
    if (newPw !== confirm) {
      showCpMsg('Les mots de passe ne correspondent pas.', 'error'); return;
    }
    if (newPw.length < 6) {
      showCpMsg('Le mot de passe doit comporter au moins 6 caractères.', 'error'); return;
    }

    const btn = $('btn-change-pw');
    if (btn) { btn.disabled = true; btn.textContent = 'Enregistrement…'; }

    try {
      const res = await fetch(`${API}/change-password`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: current, newPassword: newPw }),
      });
      if (res.ok) {
        showCpMsg('✅ Mot de passe changé avec succès !', 'success');
        cpForm.reset();
        if (strengthFill)  { strengthFill.style.width = '0'; }
        if (strengthLabel) { strengthLabel.textContent = ''; }
      } else {
        const data = await res.json().catch(() => ({}));
        showCpMsg(data.error || 'Mot de passe actuel incorrect.', 'error');
      }
    } catch {
      showCpMsg('Erreur réseau. Vérifie ta connexion.', 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Changer mon mot de passe'; }
    }
  });
}

// ── Logout from profile settings ─────────────────────────
$('btn-logout-profile')?.addEventListener('click', () => {
  fetch(`${API}/logout`, { method: 'POST', credentials: 'include' })
    .finally(() => { window.location.href = 'login.html'; });
});

// ── Toast notification ────────────────────────────────────
function showToast(message) {
  let toast = document.getElementById('profile-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'profile-toast';
    toast.style.cssText = `
      position:fixed; bottom:1.5rem; right:1.5rem; z-index:9999;
      background:var(--primary); color:#fff;
      padding:.75rem 1.25rem; border-radius:12px;
      font-weight:700; font-size:.9rem;
      box-shadow:0 8px 24px rgba(0,0,0,.15);
      transform:translateY(20px); opacity:0;
      transition:all .3s ease;
    `;
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  requestAnimationFrame(() => {
    toast.style.transform = 'translateY(0)';
    toast.style.opacity   = '1';
  });
  setTimeout(() => {
    toast.style.transform = 'translateY(20px)';
    toast.style.opacity   = '0';
  }, 3000);
}

// ── Init ──────────────────────────────────────────────────
initUserDisplay();
loadProfileData();

// Re-load when switching to profile tab
window.loadProfileData = loadProfileData;

// ── Public Profile Modal ──────────────────────────────────
async function showPublicProfile(username) {
  if (!username) return;
  try {
    const res = await fetch(`${API}/users/${username}/profile`, { credentials: 'include' });
    if (!res.ok) {
      console.error('Impossible de charger le profil public de', username);
      return;
    }
    const profile = await res.json();
    
    // Remplir les informations
    const elViewAvatar = $('view-profile-avatar');
    const elViewUsername = $('view-profile-username');
    const elViewRole = $('view-profile-role');
    const elViewBio = $('view-profile-bio');
    const elViewStatEvents = $('view-profile-stat-events');
    const elViewStatSports = $('view-profile-stat-sports');
    
    if (elViewAvatar) {
      elViewAvatar.textContent = username.slice(0, 2).toUpperCase();
    }
    if (elViewUsername) {
      elViewUsername.textContent = username;
    }
    if (elViewRole) {
      elViewRole.textContent = profile.role === 'admin' ? 'Administrateur' : 'Membre SportConnect';
      elViewRole.className = profile.role === 'admin' ? 'profile-role-badge admin' : 'profile-role-badge';
      // Style dynamic badge
      if (profile.role === 'admin') {
        elViewRole.style.background = '#ef4444';
        elViewRole.style.color = '#fff';
      } else {
        elViewRole.style.background = '';
        elViewRole.style.color = '';
      }
    }
    if (elViewBio) {
      elViewBio.textContent = profile.bio || 'Aucune biographie.';
    }
    if (elViewStatEvents) {
      elViewStatEvents.textContent = profile.stats.eventsCount;
    }
    if (elViewStatSports) {
      elViewStatSports.textContent = profile.stats.categoriesCount;
    }
    
    const modal = $('view-profile-modal');
    if (modal) modal.classList.add('active');
  } catch (err) {
    console.error('Erreur lors du chargement du profil public:', err);
  }
}

function closeViewProfileModal() {
  const modal = $('view-profile-modal');
  if (modal) modal.classList.remove('active');
}

// Bind closing events
$('view-profile-close')?.addEventListener('click', closeViewProfileModal);
$('view-profile-close-btn')?.addEventListener('click', closeViewProfileModal);
$('view-profile-modal')?.addEventListener('click', e => {
  if (e.target === $('view-profile-modal')) closeViewProfileModal();
});

// Exposer globalement
window.showPublicProfile = showPublicProfile;