// Threads Clone SPA Client Engine

let socket;
let currentUser = null;
let currentView = 'feed';
let activeFeedType = 'everyone'; // 'everyone' or 'following'
let profileFeedType = 'threads'; // 'threads' or 'replies'
let activeChatUserId = null;
let activeProfileUserId = null;
let activeDetailPostId = null;

// Media Upload Temporary References
let selectedFiles = {
  feed: null,
  quote: null,
  global: null
};

// SVG Icons for Post Card Actions
const ICONS = {
  like: '<img class="post-action-icon" style="width: 22px; height: 22px;" src="./img/icons/heart-dark.svg" alt="Like" />',
  liked: '<img class="post-action-icon" style="width: 22px; height: 22px;" src="./img/icons/heart-liked.svg" alt="Liked" />',
  comment: '<img class="post-action-icon" style="width: 22px; height: 22px;" src="./img/icons/comment-dark.svg" alt="Comment" />',
  repost: '<img class="post-action-icon" style="width: 22px; height: 22px;" src="./img/icons/repost-dark.svg" alt="Repost" />',
  quote: '<img class="post-action-icon" style="width: 22px; height: 22px;" src="./img/icons/quote-dark.svg" alt="Quote" />'
};

// ================= INITIALIZATION & AUTH =================

document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  checkSession();

  // Setup Auth View Event Listeners
  document.getElementById('go-to-register').addEventListener('click', () => {
    document.getElementById('login-card').style.display = 'none';
    document.getElementById('register-card').style.display = 'block';
  });

  document.getElementById('go-to-login').addEventListener('click', () => {
    document.getElementById('register-card').style.display = 'none';
    document.getElementById('login-card').style.display = 'block';
  });

  document.getElementById('login-form').addEventListener('submit', handleLoginSubmit);
  document.getElementById('register-form').addEventListener('submit', handleRegisterSubmit);
});

// ================= THEME HANDLING =================

function initTheme() {
  const saved = localStorage.getItem('theme') || 'system';
  applyTheme(saved);
  updateThemeButtons(saved);

  // If user prefers system and system setting changes, the CSS media query handles colors.
  // Still keep buttons in sync when storage changes from other tabs.
  window.addEventListener('storage', (e) => {
    if (e.key === 'theme') {
      const t = e.newValue || 'system';
      applyTheme(t);
      updateThemeButtons(t);
    }
  });

  // Listen for system theme changes to update icons if 'system' is selected
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    const currentTheme = localStorage.getItem('theme') || 'system';
    if (currentTheme === 'system') {
      updateIcons('system');
    }
  });
}

function applyTheme(theme) {
  if (theme === 'light') {
    document.documentElement.setAttribute('data-theme', 'light');
  } else if (theme === 'dark') {
    document.documentElement.setAttribute('data-theme', 'dark');
  } else {
    // system: remove explicit attribute to let media query decide
    document.documentElement.removeAttribute('data-theme');
  }
  updateIcons(theme);
}

function updateIcons(theme) {
  let resolvedTheme = theme;
  if (theme === 'system') {
    resolvedTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  
  const images = document.querySelectorAll('img.icon-nav, img.icon-bar, img.logo-bar, img.post-action-icon');
  images.forEach(img => {
    let src = img.getAttribute('src');
    if (src && (src.includes('-dark.svg') || src.includes('-light.svg'))) {
      img.setAttribute('src', src.replace(/-dark\.svg|-light\.svg/, `-${resolvedTheme}.svg`));
    }
  });
}

function setTheme(theme) {
  try {
    if (!['light', 'dark', 'system'].includes(theme)) theme = 'system';
    localStorage.setItem('theme', theme);
  } catch (e) {
    // ignore storage errors
  }
  applyTheme(theme);
  updateThemeButtons(theme);
}

function updateThemeButtons(theme) {
  ['light', 'dark', 'system'].forEach(t => {
    const el = document.getElementById(`theme-${t}-btn`);
    if (el) el.classList.toggle('selected', t === theme);
  });
}

async function checkSession() {
  try {
    const res = await fetch('/api/auth/me');
    const data = await res.json();
    if (data.user) {
      currentUser = data.user;
      showApp();
    } else {
      showAuth();
    }
  } catch (err) {
    showAuth();
  }
}

function showAuth() {
  document.getElementById('app-wrapper').style.display = 'none';
  document.getElementById('auth-container').style.display = 'flex';
}

function showApp() {
  document.getElementById('auth-container').style.display = 'none';
  document.getElementById('app-wrapper').style.display = 'flex';
  
  // Set User Avatars in composer placeholder fields
  const avatars = document.querySelectorAll('.user-avatar-placeholder');
  avatars.forEach(el => {
    el.src = currentUser.avatar || '/uploads/default-avatar.png';
  });

  initSocket();
  switchView('feed');
}

// ================= MOBILE MENU HANDLING =================

function openMobileMenu() {
  document.getElementById('mobile-side-menu').classList.add('show');
  document.getElementById('mobile-menu-overlay').classList.add('show');
  document.body.classList.add('menu-open');
}

function closeMobileMenu() {
  document.getElementById('mobile-side-menu').classList.remove('show');
  document.getElementById('mobile-menu-overlay').classList.remove('show');
  document.body.classList.remove('menu-open');
}

function initSocket() {
  if (socket) return;
  socket = io();

  // Register user ID on socket connection
  socket.emit('register', currentUser.id);

  socket.on('new_notification', (notification) => {
    // If activity view is currently open, refresh notifications list
    if (currentView === 'activity') {
      loadNotifications();
    } else {
      // Increment notification badge
      const badge = document.getElementById('activity-badge');
      const currentCount = parseInt(badge.textContent) || 0;
      badge.textContent = currentCount + 1;
      badge.style.display = 'flex';
    }
  });

  socket.on('new_message', (message) => {
    // If currently chatting with the sender
    if (currentView === 'messages' && activeChatUserId === message.sender_id) {
      appendChatMessage(message);
      scrollToChatBottom();
    } else {
      // Increment messages badge
      const badge = document.getElementById('messages-badge');
      const currentCount = parseInt(badge.textContent) || 0;
      badge.textContent = currentCount + 1;
      badge.style.display = 'flex';

      // Reload conversations list in background if in messages view
      if (currentView === 'messages') {
        loadConversations();
      }
    }
  });
}

// Handle Login
async function handleLoginSubmit(e) {
  e.preventDefault();
  const errorEl = document.getElementById('login-error');
  errorEl.style.display = 'none';

  const username = document.getElementById('login-username').value;
  const password = document.getElementById('login-password').value;

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();
    if (res.ok) {
      checkSession();
    } else {
      errorEl.textContent = data.error || 'Giriş yapılamadı.';
      errorEl.style.display = 'block';
    }
  } catch (err) {
    errorEl.textContent = 'Bağlantı hatası oluştu.';
    errorEl.style.display = 'block';
  }
}

// Handle Register
async function handleRegisterSubmit(e) {
  e.preventDefault();
  const errorEl = document.getElementById('register-error');
  errorEl.style.display = 'none';

  const username = document.getElementById('register-username').value;
  const password = document.getElementById('register-password').value;

  try {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();
    if (res.ok) {
      checkSession();
    } else {
      errorEl.textContent = data.error || 'Kayıt olunamadı.';
      errorEl.style.display = 'block';
    }
  } catch (err) {
    errorEl.textContent = 'Bağlantı hatası oluştu.';
    errorEl.style.display = 'block';
  }
}

// Handle Logout
async function handleLogout() {
  try {
    await fetch('/api/auth/logout', { method: 'POST' });
    currentUser = null;
    if (socket) {
      socket.disconnect();
      socket = null;
    }
    showAuth();
  } catch (err) {
    alert('Çıkış yapılırken bir hata oluştu.');
  }
}


// ================= SPA VIEW ROUTER =================

function switchView(viewName, params = {}) {
  currentView = viewName;

  // Update navigation items active status
  const navItems = document.querySelectorAll('.nav-item');
  navItems.forEach(el => el.classList.remove('active'));
  
  const activeNav = document.getElementById(`nav-${viewName}`);
  if (activeNav) activeNav.classList.add('active');

  // Hide all view containers and show active one
  const containers = document.querySelectorAll('.view-container');
  containers.forEach(el => el.classList.remove('active'));

  const activeContainer = document.getElementById(`view-${viewName}`);
  if (activeContainer) activeContainer.classList.add('active');

  // Clear page/view specific badges
  if (viewName === 'activity') {
    document.getElementById('activity-badge').style.display = 'none';
    document.getElementById('activity-badge').textContent = '0';
  } else if (viewName === 'messages' && !activeChatUserId) {
    document.getElementById('messages-badge').style.display = 'none';
    document.getElementById('messages-badge').textContent = '0';
  }

  // Trigger loading functions
  if (viewName === 'feed') {
    loadFeed();
  } else if (viewName === 'search') {
    executeSearch();
  } else if (viewName === 'messages') {
    loadConversations();
    if (params.chatWithUserId) {
      openChat(params.chatWithUserId);
    } else {
      closeChatWindow();
    }
  } else if (viewName === 'activity') {
    loadNotifications();
  } else if (viewName === 'profile') {
    loadProfile(params.userId || currentUser.id);
  } else if (viewName === 'thread-detail') {
    loadThreadDetail(params.postId);
  }

  closeProfileMenu();
}

// Helper to open profile
function openSelfProfile() {
  switchView('profile', { userId: currentUser.id });
}

function toggleProfileMenu() {
  const dropdown = document.getElementById('profile-menu-dropdown');
  if (!dropdown) return;
  dropdown.classList.toggle('show');
}

function closeProfileMenu() {
  const dropdown = document.getElementById('profile-menu-dropdown');
  if (!dropdown) return;
  dropdown.classList.remove('show');
}

document.addEventListener('click', (event) => {
  if (!event.target.closest('#profile-menu-wrapper')) {
    closeProfileMenu();
  }
});


// ================= FEED MODULE =================

function setFeedType(type) {
  activeFeedType = type;
  document.getElementById('tab-everyone').classList.toggle('active', type === 'everyone');
  document.getElementById('tab-following').classList.toggle('active', type === 'following');
  document.getElementById('tab-everyone-mobile').classList.toggle('active', type === 'everyone');
  document.getElementById('tab-following-mobile').classList.toggle('active', type === 'following');
  closeMobileMenu();
  loadFeed();
}

async function loadFeed() {
  const container = document.getElementById('feed-threads-list');
  container.innerHTML = '<div style="text-align:center; padding: 20px; color: var(--text-secondary);">Yükleniyor...</div>';

  try {
    const res = await fetch(`/api/posts/feed?type=${activeFeedType}`);
    const data = await res.json();
    
    if (res.ok) {
      renderPosts(data.posts, container);
    } else {
      container.innerHTML = `<div style="color:var(--accent-red); padding:20px;">Hata: ${data.error}</div>`;
    }
  } catch (err) {
    container.innerHTML = '<div style="color:var(--accent-red); padding:20px;">Feed yüklenirken hata oluştu.</div>';
  }
}


// ================= POST RENDERER =================

function renderPosts(posts, targetContainer) {
  targetContainer.innerHTML = '';
  if (posts.length === 0) {
    targetContainer.innerHTML = '<div style="text-align:center; padding: 40px; color: var(--text-secondary);">Görüntülenecek thread bulunamadı.</div>';
    return;
  }

  posts.forEach(post => {
    targetContainer.appendChild(createPostCard(post));
  });
  
  updateIcons(localStorage.getItem('theme') || 'system');
}

function createPostCard(post, isDetailMode = false) {
  const card = document.createElement('div');
  card.className = 'post-card';
  card.id = `post-${post.id}`;

  const isAuthor = post.user_id === currentUser.id;
  const isLiked = post.is_liked > 0;

  // Format Time representation
  const dateStr = formatTime(post.created_at);

  let repostBadgeHTML = '';
  let repostHeaderHTML = '';
  let embeddedHTML = '';

  // 1. Repost rendering logic
  if (post.repost_of) {
    repostBadgeHTML = `
      <div class="repost-indicator">
        ${ICONS.repost}
        <span>${post.username} yeniden paylaştı</span>
      </div>
    `;
    
    repostHeaderHTML = `
      <span class="post-author-username" onclick="switchView('profile', { userId: ${post.rp_user_id} })">${post.rp_username}</span>
      <span class="post-time">${formatTime(post.rp_created_at)}</span>
    `;

    embeddedHTML = `
      <div class="post-content">${escapeHTML(post.rp_content)}</div>
      ${post.rp_image_url ? `<div class="post-image"><img src="${post.rp_image_url}" alt="Attachment"></div>` : ''}
    `;
  } 
  // 2. Quote rendering logic
  else if (post.quote_of) {
    repostHeaderHTML = `
      <span class="post-author-username" onclick="switchView('profile', { userId: ${post.user_id} })">${post.username}</span>
      <span class="post-time">${dateStr}</span>
    `;

    embeddedHTML = `
      <div class="post-content">${escapeHTML(post.content)}</div>
      ${post.image_url ? `<div class="post-image"><img src="${post.image_url}" alt="Attachment"></div>` : ''}
      <div class="embedded-post" onclick="event.stopPropagation(); switchView('thread-detail', { postId: ${post.quote_of} })" style="cursor:pointer;">
        <div class="embedded-header">
          <img class="avatar avatar-xs" src="${post.qp_avatar || '/uploads/default-avatar.png'}" alt="Avatar">
          <span class="username">${post.qp_username}</span>
          <span class="post-time" style="margin-left:auto; font-size:11px;">${formatTime(post.qp_created_at)}</span>
        </div>
        <div class="embedded-content">${escapeHTML(post.qp_content)}</div>
        ${post.qp_image_url ? `<div class="post-image" style="margin-top:8px; max-height:150px;"><img src="${post.qp_image_url}" alt="Quote attachment"></div>` : ''}
      </div>
    `;
  }
  // 3. Standard post rendering
  else {
    repostHeaderHTML = `
      <span class="post-author-username" onclick="switchView('profile', { userId: ${post.user_id} })">${post.username}</span>
      ${post.is_private ? `<svg class="post-badge-private" viewBox="0 0 24 24" title="Gizli Hesap"><path fill="currentColor" d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z"/></svg>` : ''}
      <span class="post-time">${dateStr}</span>
    `;

    embeddedHTML = `
      <div class="post-content">${escapeHTML(post.content)}</div>
      ${post.image_url ? `<div class="post-image"><img src="${post.image_url}" alt="Attachment"></div>` : ''}
    `;
  }

  // Author can delete post
  const deleteBtnHTML = isAuthor ? `<button class="delete-post-btn" onclick="event.stopPropagation(); deletePost(${post.id})" title="Sil">&times;</button>` : '';

  // Avatar path resolution
  const avatarPath = post.repost_of ? (post.rp_avatar || '/uploads/default-avatar.png') : (post.avatar || '/uploads/default-avatar.png');

  card.innerHTML = `
    ${deleteBtnHTML}
    <div class="post-left">
      <img class="avatar avatar-md" src="${avatarPath}" alt="Avatar" onclick="event.stopPropagation(); switchView('profile', { userId: ${post.repost_of ? post.rp_user_id : post.user_id} })">
      ${!isDetailMode ? '<div class="thread-line"></div>' : ''}
    </div>
    <div class="post-main">
      ${repostBadgeHTML}
      <div class="post-header">
        <div class="post-author-info">
          ${repostHeaderHTML}
        </div>
      </div>
      
      ${embeddedHTML}

      <div class="post-actions" onclick="event.stopPropagation();">
        <button class="action-btn ${isLiked ? 'liked' : ''}" id="like-btn-${post.id}" onclick="toggleLike(${post.id})">
          ${isLiked ? ICONS.liked : ICONS.like}
        </button>
        <button class="action-btn" onclick="openCommentFromPost(${post.id})">
          ${ICONS.comment}
        </button>
        <button class="action-btn" onclick="triggerRepost(${post.id})" title="Yeniden Paylaş">
          ${ICONS.repost}
        </button>
        <button class="action-btn" onclick="openQuoteModal(${post.id})" title="Alıntı Yap">
          ${ICONS.quote}
        </button>
      </div>

      <div class="post-stats">
        <span id="likes-count-${post.id}"><strong>${post.likes_count || 0}</strong> beğenme</span>
        <span>•</span>
        <span onclick="switchView('thread-detail', { postId: ${post.repost_of || post.id} })" style="cursor:pointer;"><strong>${post.replies_count || 0}</strong> yanıt</span>
      </div>
    </div>
  `;

  // Navigate to post detail when clicked on the card (outside action buttons)
  card.addEventListener('click', (e) => {
    // Avoid double navigation on clicks to user links
    if (e.target.closest('button') || e.target.closest('a') || e.target.closest('.avatar') || e.target.closest('.post-author-username')) return;
    switchView('thread-detail', { postId: post.repost_of || post.id });
  });

  return card;
}


// ================= POST ACTIONS =================

async function toggleLike(postId) {
  try {
    const res = await fetch(`/api/posts/${postId}/like`, { method: 'POST' });
    const data = await res.json();
    if (res.ok) {
      const btn = document.getElementById(`like-btn-${postId}`);
      const likesCountEl = document.getElementById(`likes-count-${postId}`);
      
      // Update UI elements instantly
      if (btn && likesCountEl) {
        btn.classList.toggle('liked', data.liked);
        const img = btn.querySelector('img');
        if (img) {
          if (data.liked) {
            img.src = './img/icons/heart-liked.svg';
          } else {
            let t = localStorage.getItem('theme') || 'system';
            if (t === 'system') {
              t = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
            }
            img.src = `./img/icons/heart-${t}.svg`;
          }
        }
        let count = parseInt(likesCountEl.querySelector('strong').textContent) || 0;
        count = data.liked ? count + 1 : Math.max(0, count - 1);
        likesCountEl.innerHTML = `<strong>${count}</strong> beğenme`;
      }
    }
  } catch (err) {
    console.error('Like toggle error:', err);
  }
}

// Ask user whether to do a direct Repost or Quote post
function triggerRepost(postId) {
  const confirmRepost = confirm("Bu gönderiyi profilinizde yeniden paylaşmak istiyor musunuz?");
  if (confirmRepost) {
    submitDirectRepost(postId);
  }
}

async function submitDirectRepost(postId) {
  try {
    const res = await fetch('/api/posts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ repost_of: postId })
    });
    const data = await res.json();
    if (res.ok) {
      alert('Başarıyla yeniden paylaşıldı!');
      loadFeed();
    } else {
      alert(data.error || 'Yeniden paylaşma hatası.');
    }
  } catch (err) {
    alert('Sunucuyla bağlantı kurulamadı.');
  }
}

async function deletePost(postId) {
  const confirmDel = confirm('Bu gönderiyi tamamen silmek istediğinizden emin misiniz?');
  if (!confirmDel) return;

  try {
    const res = await fetch(`/api/posts/${postId}`, { method: 'DELETE' });
    const data = await res.json();
    if (res.ok) {
      // Remove element from UI
      const card = document.getElementById(`post-${postId}`);
      if (card) card.remove();
      
      if (currentView === 'thread-detail' && activeDetailPostId === postId) {
        switchView('feed');
      }
    } else {
      alert(data.error || 'Silinemedi.');
    }
  } catch (err) {
    alert('Sunucuyla bağlantı kurulamadı.');
  }
}


// ================= THREAD DETAIL MODULE =================

async function loadThreadDetail(postId) {
  activeDetailPostId = postId;
  const parentContainer = document.getElementById('detail-parent-post-container');
  const repliesContainer = document.getElementById('detail-replies-list');

  parentContainer.innerHTML = '<div style="text-align:center; padding: 20px; color: var(--text-secondary);">Thread yükleniyor...</div>';
  repliesContainer.innerHTML = '';

  try {
    const res = await fetch(`/api/posts/${postId}`);
    const data = await res.json();

    if (res.ok) {
      parentContainer.innerHTML = '';
      parentContainer.appendChild(createPostCard(data.post, true));

      repliesContainer.innerHTML = '';
      if (data.replies.length === 0) {
        repliesContainer.innerHTML = '<div style="text-align:center; padding: 25px; color: var(--text-secondary); border-top: 1px solid var(--border-color);">İlk yanıtı sen yaz...</div>';
      } else {
        data.replies.forEach(reply => {
          const replyCard = createPostCard(reply, true);
          replyCard.classList.add('child-post');
          repliesContainer.appendChild(replyCard);
        });
      }
      updateIcons(localStorage.getItem('theme') || 'system');
    } else {
      parentContainer.innerHTML = `<div style="color:var(--accent-red); padding:20px;">Hata: ${data.error}</div>`;
    }
  } catch (err) {
    parentContainer.innerHTML = '<div style="color:var(--accent-red); padding:20px;">Detaylar yüklenirken hata oluştu.</div>';
  }
}

async function submitDetailReply() {
  const contentInput = document.getElementById('detail-reply-content');
  const content = contentInput.value.trim();

  if (!content) return;

  try {
    const res = await fetch('/api/posts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content,
        parent_id: activeDetailPostId
      })
    });
    if (res.ok) {
      contentInput.value = '';
      loadThreadDetail(activeDetailPostId);
    } else {
      const data = await res.json();
      alert(data.error || 'Yorum paylaşılamadı.');
    }
  } catch (err) {
    alert('Sunucuyla bağlantı kurulamadı.');
  }
}

function openCommentFromPost(postId) {
  switchView('thread-detail', { postId });
  setTimeout(() => {
    document.getElementById('detail-reply-content').focus();
  }, 300);
}


// ================= CREATION MODALS & FILE HANDLERS =================

function openCreateModal() {
  switchView('create');
}

function openModal(id) {
  document.getElementById(id).style.display = 'flex';
}

function closeModal(id) {
  document.getElementById(id).style.display = 'none';
}

// Preview file inside Composer block before uploading
function handleMediaSelect(input, composerKey) {
  const file = input.files[0];
  if (!file) return;

  if (file.size > 5 * 1024 * 1024) {
    alert('Resim boyutu en fazla 5MB olabilir.');
    input.value = '';
    return;
  }

  selectedFiles[composerKey] = file;

  const reader = new FileReader();
  reader.onload = (e) => {
    const container = document.getElementById(`${composerKey}-media-preview-container`);
    const img = document.getElementById(`${composerKey}-media-preview`);
    img.src = e.target.result;
    container.style.display = 'block';
  };
  reader.readAsDataURL(file);
}

function clearMediaPreview(composerKey) {
  selectedFiles[composerKey] = null;
  const input = document.getElementById(`${composerKey}-post-file`);
  if (input) input.value = '';

  const container = document.getElementById(`${composerKey}-media-preview-container`);
  if (container) container.style.display = 'none';
}

// Upload and submit thread (for feed quick post, and modal create thread)
async function submitPost(composerKey) {
  const textEl = document.getElementById(composerKey === 'feed' ? 'feed-post-content' : 'global-post-content');
  const text = textEl.value.trim();
  const file = selectedFiles[composerKey];

  if (!text && !file) {
    alert('Paylaşım yapabilmek için metin veya resim ekleyin.');
    return;
  }

  const formData = new FormData();
  formData.append('content', text);
  if (file) {
    formData.append('image', file);
  }

  try {
    const res = await fetch('/api/posts', {
      method: 'POST',
      body: formData
    });
    
    if (res.ok) {
      textEl.value = '';
      clearMediaPreview(composerKey);
      
      if (composerKey === 'global') {
        switchView('feed');
      }
      
      loadFeed();
    } else {
      const data = await res.json();
      alert(data.error || 'Paylaşım yapılamadı.');
    }
  } catch (err) {
    alert('Bağlantı hatası oluştu.');
  }
}


// ================= ALINTILAMA (QUOTE) MODULE =================

let activeQuotePostId = null;

async function openQuoteModal(postId) {
  activeQuotePostId = postId;
  const previewContainer = document.getElementById('quote-post-preview');
  previewContainer.innerHTML = '<span style="color:var(--text-secondary);">Yükleniyor...</span>';

  openModal('quote-modal');

  try {
    const res = await fetch(`/api/posts/${postId}`);
    const data = await res.json();
    if (res.ok) {
      previewContainer.innerHTML = `
        <div class="embedded-header">
          <img class="avatar avatar-xs" src="${data.post.avatar || '/uploads/default-avatar.png'}" alt="Avatar">
          <span class="username">${data.post.username}</span>
        </div>
        <div class="embedded-content">${escapeHTML(data.post.content)}</div>
      `;
    } else {
      previewContainer.innerHTML = '<span style="color:var(--accent-red);">Orijinal gönderi yüklenemedi.</span>';
    }
  } catch (err) {
    previewContainer.innerHTML = '<span style="color:var(--accent-red);">Bağlantı hatası.</span>';
  }
}

async function submitQuotePost() {
  const textEl = document.getElementById('quote-composer-content');
  const text = textEl.value.trim();
  const file = selectedFiles.quote;

  const formData = new FormData();
  formData.append('content', text);
  formData.append('quote_of', activeQuotePostId);
  if (file) {
    formData.append('image', file);
  }

  try {
    const res = await fetch('/api/posts', {
      method: 'POST',
      body: formData
    });

    if (res.ok) {
      textEl.value = '';
      clearMediaPreview('quote');
      closeModal('quote-modal');
      loadFeed();
    } else {
      const data = await res.json();
      alert(data.error || 'Alıntı paylaşılamadı.');
    }
  } catch (err) {
    alert('Sunucuyla bağlantı kurulamadı.');
  }
}


// ================= SEARCH MODULE =================

async function executeSearch() {
  if (currentView !== 'search') return;
  const query = document.getElementById('search-input').value;
  const resultsContainer = document.getElementById('search-results-list');

  try {
    const res = await fetch(`/api/users/search?q=${encodeURIComponent(query)}`);
    const data = await res.json();
    if (res.ok) {
      resultsContainer.innerHTML = '';
      if (data.users.length === 0) {
        resultsContainer.innerHTML = '<div style="text-align:center; padding:30px; color:var(--text-secondary);">Kullanıcı bulunamadı.</div>';
        return;
      }

      data.users.forEach(user => {
        const row = document.createElement('div');
        row.className = 'user-row';
        
        let followBtnText = 'Takip Et';
        let followBtnClass = '';
        if (user.follow_status === 'accepted') {
          followBtnText = 'Takip Ediliyor';
          followBtnClass = 'following';
        } else if (user.follow_status === 'pending') {
          followBtnText = 'İstek Gönderildi';
          followBtnClass = 'pending';
        }

        row.innerHTML = `
          <div class="user-row-left" onclick="switchView('profile', { userId: ${user.id} })">
            <img class="avatar avatar-md" src="${user.avatar || '/uploads/default-avatar.png'}" alt="Avatar">
            <div class="user-row-info">
              <span class="user-row-username">${user.username}</span>
              <span class="user-row-bio">${escapeHTML(user.bio) || 'Biyografi bulunmuyor.'}</span>
            </div>
          </div>
          <button class="btn-follow ${followBtnClass}" onclick="handleFollowToggle(${user.id}, this)">${followBtnText}</button>
        `;
        resultsContainer.appendChild(row);
      });
    }
  } catch (err) {
    console.error('Search error:', err);
  }
}

async function handleFollowToggle(targetUserId, buttonElement) {
  const isFollowing = buttonElement.classList.contains('following');
  const isPending = buttonElement.classList.contains('pending');

  try {
    if (isFollowing || isPending) {
      // Unfollow API call
      const res = await fetch(`/api/follows/unfollow/${targetUserId}`, { method: 'POST' });
      if (res.ok) {
        buttonElement.textContent = 'Takip Et';
        buttonElement.className = 'btn-follow';
      }
    } else {
      // Follow API call
      const res = await fetch(`/api/follows/request/${targetUserId}`, { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        if (data.status === 'pending') {
          buttonElement.textContent = 'İstek Gönderildi';
          buttonElement.className = 'btn-follow pending';
        } else {
          buttonElement.textContent = 'Takip Ediliyor';
          buttonElement.className = 'btn-follow following';
        }
      }
    }
  } catch (err) {
    console.error('Follow request error:', err);
  }
}


// ================= ACTIVITY / NOTIFICATIONS MODULE =================

async function loadNotifications() {
  const container = document.getElementById('notifications-list-container');
  container.innerHTML = '<div style="text-align:center; padding:20px; color:var(--text-secondary);">Yükleniyor...</div>';

  try {
    const res = await fetch('/api/notifications');
    const data = await res.json();
    if (res.ok) {
      container.innerHTML = '';
      if (data.notifications.length === 0) {
        container.innerHTML = '<div style="text-align:center; padding:40px; color:var(--text-secondary);">Henüz bir aktivite yok.</div>';
        return;
      }

      data.notifications.forEach(notif => {
        const row = document.createElement('div');
        row.className = 'notif-row';
        if (notif.is_read === 0) {
          row.style.borderLeft = '3px solid var(--accent-blue)';
        }

        let actionText = '';
        let showButtons = false;

        switch (notif.type) {
          case 'like':
            actionText = 'senin thread\'ini beğendi.';
            break;
          case 'comment':
            actionText = 'senin thread\'ine yanıt verdi.';
            break;
          case 'repost':
            actionText = 'senin thread\'ini yeniden paylaştı.';
            break;
          case 'quote':
            actionText = 'senin thread\'ini alıntıladı.';
            break;
          case 'follow':
            actionText = 'seni takip etmeye başladı.';
            break;
          case 'follow_request':
            actionText = 'seni takip etmek istiyor.';
            showButtons = true;
            break;
          case 'follow_accept':
            actionText = 'takip isteğini kabul etti.';
            break;
        }

        let actionButtonsHTML = '';
        if (showButtons) {
          actionButtonsHTML = `
            <div class="notif-actions">
              <button class="btn-accept-request" onclick="acceptRequest(${notif.sender_id}, ${notif.id})">Onayla</button>
              <button class="btn-reject-request" onclick="rejectRequest(${notif.sender_id}, ${notif.id})">Sil</button>
            </div>
          `;
        }

        const previewHTML = notif.post_content ? `<div class="notif-post-preview">"${escapeHTML(notif.post_content)}"</div>` : '';

        row.innerHTML = `
          <div class="notif-left">
            <img class="avatar avatar-md" src="${notif.sender_avatar || '/uploads/default-avatar.png'}" alt="Avatar" onclick="switchView('profile', { userId: ${notif.sender_id} })">
            <div class="notif-text">
              <span class="username" onclick="switchView('profile', { userId: ${notif.sender_id} })">${notif.sender_username}</span>
              <span class="body">${actionText}</span>
              ${previewHTML}
            </div>
          </div>
          ${actionButtonsHTML}
        `;
        
        // Mark individual notification route click if it points to a post
        if (notif.post_id && !showButtons) {
          row.style.cursor = 'pointer';
          row.addEventListener('click', (e) => {
            if (e.target.closest('.avatar') || e.target.closest('.username')) return;
            switchView('thread-detail', { postId: notif.post_id });
          });
        }

        container.appendChild(row);
      });
    }
  } catch (err) {
    container.innerHTML = '<div style="color:var(--accent-red); padding:20px;">Yükleme hatası.</div>';
  }
}

async function markAllNotificationsRead() {
  try {
    await fetch('/api/notifications/read', { method: 'POST' });
    loadNotifications();
  } catch (err) {
    console.error('Mark read error:', err);
  }
}

async function acceptRequest(senderId, notificationId) {
  try {
    const res = await fetch(`/api/follows/accept/${senderId}`, { method: 'POST' });
    if (res.ok) {
      loadNotifications();
    }
  } catch (err) {
    alert('Onaylama hatası.');
  }
}

async function rejectRequest(senderId, notificationId) {
  try {
    const res = await fetch(`/api/follows/reject/${senderId}`, { method: 'POST' });
    if (res.ok) {
      loadNotifications();
    }
  } catch (err) {
    alert('Reddetme hatası.');
  }
}


// ================= PROFILE MODULE =================

function setProfileFeedType(type) {
  profileFeedType = type;
  document.getElementById('profile-tab-threads').classList.toggle('active', type === 'threads');
  document.getElementById('profile-tab-replies').classList.toggle('active', type === 'replies');
  loadProfilePosts();
}

async function loadProfile(userId) {
  activeProfileUserId = userId;
  
  // Hide details/actions elements until user detail is fetched
  document.getElementById('profile-self-actions').style.display = 'none';
  document.getElementById('profile-other-actions').style.display = 'none';
  document.getElementById('profile-private-lock').style.display = 'none';
  document.getElementById('profile-display-link-wrapper').style.display = 'none';

  try {
    const res = await fetch(`/api/profile/${userId}`);
    const data = await res.json();
    
    if (res.ok) {
      const u = data.user;
      document.getElementById('profile-display-name').innerHTML = `${u.username} ${u.is_private === 1 ? `<svg id="profile-private-lock" class="post-badge-private" viewBox="0 0 24 24" title="Gizli Hesap"><path fill="currentColor" d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z"/></svg>` : ''}`;
      document.getElementById('profile-display-username').textContent = `@${u.username}`;
      document.getElementById('profile-display-bio').textContent = u.bio || 'Biyografi yok.';
      document.getElementById('profile-display-avatar').src = u.avatar || '/uploads/default-avatar.png';
      
      if (u.link) {
        const linkAnchor = document.getElementById('profile-display-link');
        linkAnchor.href = u.link.startsWith('http') ? u.link : `https://${u.link}`;
        linkAnchor.textContent = u.link.replace(/^https?:\/\//, '');
        document.getElementById('profile-display-link-wrapper').style.display = 'flex';
      }

      document.getElementById('profile-followers-count').innerHTML = `<strong>${data.followersCount}</strong> takipçi`;
      document.getElementById('profile-following-count').innerHTML = `<strong>${data.followingCount}</strong> takip edilen`;

      // Set options (if current user viewing own profile)
      if (u.id === currentUser.id) {
        document.getElementById('profile-self-actions').style.display = 'block';
        document.getElementById('profile-menu-wrapper').style.display = 'block';
      } else {
        document.getElementById('profile-other-actions').style.display = 'flex';
        document.getElementById('profile-menu-wrapper').style.display = 'none';
        
        // Render follow button text
        const followBtn = document.getElementById('profile-follow-btn');
        if (data.followStatus === 'accepted') {
          followBtn.textContent = 'Takip Ediliyor';
          followBtn.className = 'btn-follow following';
        } else if (data.followStatus === 'pending') {
          followBtn.textContent = 'İstek Gönderildi';
          followBtn.className = 'btn-follow pending';
        } else {
          followBtn.textContent = 'Takip Et';
          followBtn.className = 'btn-follow';
        }
      }

      loadProfilePosts();
    } else {
      alert(data.error || 'Profil yüklenemedi.');
    }
  } catch (err) {
    console.error('Load profile error:', err);
  }
}

async function loadProfilePosts() {
  const container = document.getElementById('profile-threads-list');
  container.innerHTML = '<div style="text-align:center; padding:20px; color:var(--text-secondary);">Threadler yükleniyor...</div>';

  try {
    const res = await fetch(`/api/profile/${activeProfileUserId}/posts?type=${profileFeedType}`);
    const data = await res.json();
    
    if (res.ok) {
      renderPosts(data.posts, container);
    } else {
      if (res.status === 403) {
        container.innerHTML = `
          <div style="text-align:center; padding: 50px 20px; color:var(--text-secondary);">
            <svg style="width:48px; height:48px; fill:currentColor; margin-bottom:12px;" viewBox="0 0 24 24"><path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z"/></svg>
            <h3>Bu Hesap Gizli</h3>
            <p style="font-size:13px; margin-top:5px;">Paylaşımları görebilmek için kullanıcıyı takip etmelisin.</p>
          </div>
        `;
      } else {
        container.innerHTML = `<div style="color:var(--accent-red); padding:20px;">Hata: ${data.error}</div>`;
      }
    }
  } catch (err) {
    container.innerHTML = '<div style="color:var(--accent-red); padding:20px;">Paylaşımlar yüklenirken hata oluştu.</div>';
  }
}

async function toggleFollow() {
  const followBtn = document.getElementById('profile-follow-btn');
  await handleFollowToggle(activeProfileUserId, followBtn);
  
  // Reload profile statistics
  loadProfile(activeProfileUserId);
}

// Profile Modal Actions
function openEditProfileModal() {
  document.getElementById('edit-profile-avatar-preview').src = currentUser.avatar || '/uploads/default-avatar.png';
  document.getElementById('edit-profile-bio').value = currentUser.bio || '';
  document.getElementById('edit-profile-link').value = currentUser.link || '';
  document.getElementById('edit-profile-privacy').checked = currentUser.is_private === 1;

  document.getElementById('edit-profile-error').style.display = 'none';
  openModal('edit-profile-modal');
}

function handleAvatarPreview(input) {
  const file = input.files[0];
  if (!file) return;

  if (file.size > 5 * 1024 * 1024) {
    alert('Resim boyutu en fazla 5MB olabilir.');
    input.value = '';
    return;
  }

  const reader = new FileReader();
  reader.onload = (e) => {
    document.getElementById('edit-profile-avatar-preview').src = e.target.result;
  };
  reader.readAsDataURL(file);
}

async function saveProfileChanges() {
  const bio = document.getElementById('edit-profile-bio').value.trim();
  const link = document.getElementById('edit-profile-link').value.trim();
  const isPrivate = document.getElementById('edit-profile-privacy').checked ? 1 : 0;
  const avatarFile = document.getElementById('edit-profile-file').files[0];

  const formData = new FormData();
  formData.append('bio', bio);
  formData.append('link', link);
  formData.append('is_private', isPrivate);
  if (avatarFile) {
    formData.append('avatar', avatarFile);
  }

  try {
    const res = await fetch('/api/profile/update', {
      method: 'POST',
      body: formData
    });
    const data = await res.json();
    if (res.ok) {
      closeModal('edit-profile-modal');
      
      // Update global user object
      currentUser.bio = bio;
      currentUser.link = link;
      currentUser.is_private = isPrivate;
      if (data.avatar) {
        currentUser.avatar = data.avatar;
      }
      
      // Refresh current view
      showApp();
    } else {
      const errorEl = document.getElementById('edit-profile-error');
      errorEl.textContent = data.error || 'Profil güncellenemedi.';
      errorEl.style.display = 'block';
    }
  } catch (err) {
    alert('Sunucuyla bağlantı kurulamadı.');
  }
}

// Danger Zone Delete Account Handler
async function confirmDeleteAccount() {
  const verificationText = prompt('Lütfen hesabınızı silmek için kullanıcı adınızı yazın:');
  if (!verificationText) return;
  
  if (verificationText.toLowerCase().trim() !== currentUser.username) {
    alert('Girilen kullanıcı adı yanlış. Hesap silme iptal edildi.');
    return;
  }

  const secondaryConfirm = confirm('UYARI: Hesabınız kalıcı olarak silinecektir! Onaylıyor musunuz?');
  if (!secondaryConfirm) return;

  try {
    const res = await fetch('/api/auth/delete', { method: 'DELETE' });
    const data = await res.json();
    if (res.ok) {
      alert(data.message);
      currentUser = null;
      if (socket) {
        socket.disconnect();
        socket = null;
      }
      closeModal('edit-profile-modal');
      showAuth();
    } else {
      alert(data.error || 'Hesap silinirken hata oluştu.');
    }
  } catch (err) {
    alert('Sunucuyla bağlantı kurulamadı.');
  }
}


// ================= DIRECT MESSAGES (DMs) MODULE =================

async function loadConversations() {
  const container = document.getElementById('chats-list-container');
  container.innerHTML = '<div style="text-align:center; padding:20px; color:var(--text-secondary);">Sohbetler yükleniyor...</div>';

  try {
    const res = await fetch('/api/messages/conversations');
    const data = await res.json();
    if (res.ok) {
      container.innerHTML = '';
      if (data.conversations.length === 0) {
        container.innerHTML = '<div style="text-align:center; padding:30px; color:var(--text-secondary); font-size:13px;">Başlamış sohbet yok.</div>';
        return;
      }

      data.conversations.forEach(conv => {
        const item = document.createElement('div');
        item.className = `chat-item ${activeChatUserId === conv.id ? 'active' : ''}`;
        item.onclick = () => openChat(conv.id);

        item.innerHTML = `
          <img class="avatar avatar-sm" src="${conv.avatar || '/uploads/default-avatar.png'}" alt="Avatar">
          <div class="chat-item-right">
            <div class="chat-item-username">${conv.username}</div>
            <div class="chat-item-lastmsg">${escapeHTML(conv.last_message || 'Metin yok.')}</div>
          </div>
        `;
        container.appendChild(item);
      });
    }
  } catch (err) {
    console.error('Conversations error:', err);
  }
}

async function openChat(userId) {
  activeChatUserId = userId;
  
  // Highlight conversation item in list
  const chatItems = document.querySelectorAll('.chat-item');
  chatItems.forEach(el => el.classList.remove('active'));
  
  // Mark messages badge clear
  document.getElementById('messages-badge').style.display = 'none';
  document.getElementById('messages-badge').textContent = '0';

  document.getElementById('empty-chat-state').style.display = 'none';
  document.getElementById('chat-conversation-ui').style.display = 'flex';

  const messagesContainer = document.getElementById('chat-messages-container');
  messagesContainer.innerHTML = '<div style="text-align:center; padding:20px; color:var(--text-secondary);">Mesajlar yükleniyor...</div>';

  try {
    const res = await fetch(`/api/messages/${userId}`);
    const data = await res.json();
    if (res.ok) {
      document.getElementById('chat-window-avatar').src = data.targetUser.avatar || '/uploads/default-avatar.png';
      document.getElementById('chat-window-username').textContent = data.targetUser.username;

      messagesContainer.innerHTML = '';
      if (data.messages.length === 0) {
        messagesContainer.innerHTML = '<div style="text-align:center; color:var(--text-secondary); margin-top:auto; padding:20px;">Sohbetin başlangıcı. İlk mesajı gönder!</div>';
      } else {
        data.messages.forEach(msg => {
          appendChatMessage(msg);
        });
      }
      scrollToChatBottom();
      loadConversations(); // refresh sidebar status
    }
  } catch (err) {
    messagesContainer.innerHTML = '<div style="color:var(--accent-red); padding:20px;">Mesajlar yüklenemedi.</div>';
  }
}

function appendChatMessage(msg) {
  const container = document.getElementById('chat-messages-container');
  
  // Remove empty conversation placeholder if present
  const placeholder = container.querySelector('div[style*="text-align:center"]');
  if (placeholder) placeholder.remove();

  const bubble = document.createElement('div');
  const isOutgoing = msg.sender_id === currentUser.id;
  bubble.className = `msg-bubble ${isOutgoing ? 'outgoing' : 'incoming'}`;
  bubble.textContent = msg.content;
  container.appendChild(bubble);
}

async function sendDirectMessage() {
  const input = document.getElementById('chat-message-input');
  const content = input.value.trim();
  if (!content) return;

  try {
    const res = await fetch(`/api/messages/${activeChatUserId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content })
    });
    const data = await res.json();
    if (res.ok) {
      input.value = '';
      appendChatMessage(data.message);
      scrollToChatBottom();
      loadConversations(); // refresh last message preview
    } else {
      alert(data.error || 'Mesaj gönderilemedi.');
    }
  } catch (err) {
    alert('Sunucuyla bağlantı kurulamadı.');
  }
}

function closeChatWindow() {
  activeChatUserId = null;
  document.getElementById('chat-conversation-ui').style.display = 'none';
  document.getElementById('empty-chat-state').style.display = 'flex';
}

function startDirectMessageFromProfile() {
  switchView('messages', { chatWithUserId: activeProfileUserId });
}

function scrollToChatBottom() {
  const container = document.getElementById('chat-messages-container');
  container.scrollTop = container.scrollHeight;
}

function filterChats() {
  const query = document.getElementById('chat-search-input').value.toLowerCase().trim();
  const items = document.querySelectorAll('.chat-item');
  items.forEach(item => {
    const username = item.querySelector('.chat-item-username').textContent.toLowerCase();
    if (username.includes(query)) {
      item.style.display = 'flex';
    } else {
      item.style.display = 'none';
    }
  });
}


// ================= UTILITIES =================

function escapeHTML(str) {
  if (!str) return '';
  return str.replace(/[&<>'"]/g, 
    tag => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;'
    }[tag] || tag)
  );
}

// Convert DB timestamps to user friendly time difference e.g., '5d', '2h', '1m', 'Şimdi'
function formatTime(timestamp) {
  if (!timestamp) return '';
  
  // Replace UTC space divider for cross browser standard compatibility
  const normalizedString = timestamp.replace(' ', 'T');
  const postDate = new Date(normalizedString);
  const now = new Date();
  
  // Calculate difference in seconds
  const diffSec = Math.floor((now - postDate) / 1000);
  
  if (diffSec < 60) return 'Şimdi';
  
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}d`;
  
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}s`;
  
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}g`;
  
  return postDate.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });
}
