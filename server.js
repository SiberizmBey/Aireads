const express = require('express');
const session = require('express-session');
const http = require('http');
const { Server } = require('socket.io');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const db = require('./database');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

// Setup directories
const uploadsDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Multer configurations for file upload
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});
const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Express Session configuration
app.use(
  session({
    secret: 'threads-clone-super-secret-key-987654321',
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 1000 * 60 * 60 * 24 * 7, // 1 week
      secure: false
    }
  })
);

// Require Authentication Middleware
function requireAuth(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Lütfen önce giriş yapın.' });
  }
  next();
}

// Socket.io User Management
const onlineUsers = new Map(); // userId -> socket.id

io.on('connection', (socket) => {
  socket.on('register', (userId) => {
    onlineUsers.set(Number(userId), socket.id);
  });

  socket.on('disconnect', () => {
    for (const [userId, socketId] of onlineUsers.entries()) {
      if (socketId === socket.id) {
        onlineUsers.delete(userId);
        break;
      }
    }
  });
});

// Real-time helper utilities
function sendRealtimeNotification(receiverId, notification) {
  const socketId = onlineUsers.get(Number(receiverId));
  if (socketId) {
    io.to(socketId).emit('new_notification', notification);
  }
}

function sendRealtimeMessage(receiverId, message) {
  const socketId = onlineUsers.get(Number(receiverId));
  if (socketId) {
    io.to(socketId).emit('new_message', message);
  }
}

// ================= AUTH API =================

// Register
app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Kullanıcı adı ve şifre gereklidir.' });
    }
    if (username.length < 3) {
      return res.status(400).json({ error: 'Kullanıcı adı en az 3 karakter olmalıdır.' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Şifre en az 6 karakter olmalıdır.' });
    }

    const existingUser = await db.getUserByUsername(username);
    if (existingUser) {
      return res.status(400).json({ error: 'Bu kullanıcı adı zaten alınmış.' });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const userId = await db.createUser(username, hashedPassword);
    req.session.userId = userId;
    req.session.username = username.toLowerCase().trim();

    return res.status(201).json({ message: 'Kayıt başarılı.', userId });
  } catch (error) {
    console.error('Register error:', error);
    return res.status(500).json({ error: 'Sunucu hatası.' });
  }
});

// Login
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Kullanıcı adı ve şifre gereklidir.' });
    }

    const user = await db.getUserByUsername(username);
    if (!user) {
      return res.status(400).json({ error: 'Hatalı kullanıcı adı veya şifre.' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ error: 'Hatalı kullanıcı adı veya şifre.' });
    }

    req.session.userId = user.id;
    req.session.username = user.username;

    return res.json({ message: 'Giriş başarılı.', userId: user.id });
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({ error: 'Sunucu hatası.' });
  }
});

// Logout
app.post('/api/auth/logout', requireAuth, (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ error: 'Çıkış yapılamadı.' });
    }
    res.clearCookie('connect.sid');
    return res.json({ message: 'Çıkış başarılı.' });
  });
});

// Get Current User Info
app.get('/api/auth/me', async (req, res) => {
  if (!req.session.userId) {
    return res.json({ user: null });
  }
  try {
    const user = await db.getUserById(req.session.userId);
    return res.json({ user });
  } catch (error) {
    return res.status(500).json({ error: 'Sunucu hatası.' });
  }
});

// Delete Account
app.delete('/api/auth/delete', requireAuth, async (req, res) => {
  try {
    const userId = req.session.userId;
    // Get user info to delete avatar from filesystem if exists
    const user = await db.getUserById(userId);
    if (user && user.avatar && user.avatar.startsWith('/uploads/')) {
      const avatarPath = path.join(__dirname, 'public', user.avatar);
      if (fs.existsSync(avatarPath)) {
        fs.unlinkSync(avatarPath);
      }
    }
    
    // SQLite ON DELETE CASCADE handles deleting posts, follows, DMs, likes, notifications
    await db.deleteUser(userId);
    
    req.session.destroy((err) => {
      if (err) {
        return res.status(500).json({ error: 'Hesap silindi ancak oturum kapatılamadı.' });
      }
      res.clearCookie('connect.sid');
      return res.json({ message: 'Hesabınız başarıyla tamamen silindi.' });
    });
  } catch (error) {
    console.error('Delete account error:', error);
    return res.status(500).json({ error: 'Sunucu hatası.' });
  }
});


// ================= PROFILE & USERS API =================

// Search Users
app.get('/api/users/search', requireAuth, async (req, res) => {
  try {
    const query = req.query.q || '';
    const users = await db.searchUsers(query, req.session.userId);
    return res.json({ users });
  } catch (error) {
    return res.status(500).json({ error: 'Sunucu hatası.' });
  }
});

// Fetch Profile detail
app.get('/api/profile/:id', requireAuth, async (req, res) => {
  try {
    const profileId = Number(req.params.id);
    const currentUserId = req.session.userId;

    const user = await db.getUserById(profileId);
    if (!user) {
      return res.status(404).json({ error: 'Kullanıcı bulunamadı.' });
    }

    const followStatus = await db.getFollowStatus(currentUserId, profileId);
    
    // Count Followers and Following
    const followers = await db.getFollowers(profileId);
    const following = await db.getFollowing(profileId);

    return res.json({
      user,
      followStatus,
      followersCount: followers.length,
      followingCount: following.length
    });
  } catch (error) {
    return res.status(500).json({ error: 'Sunucu hatası.' });
  }
});

// Update Profile
app.post('/api/profile/update', requireAuth, upload.single('avatar'), async (req, res) => {
  try {
    const userId = req.session.userId;
    const { bio, link, is_private } = req.body;
    
    const user = await db.getUserById(userId);
    let avatarPath = user.avatar || '';

    // If new avatar uploaded
    if (req.file) {
      // Delete old avatar if exists
      if (user.avatar && user.avatar.startsWith('/uploads/')) {
        const oldAvatarPath = path.join(__dirname, 'public', user.avatar);
        if (fs.existsSync(oldAvatarPath)) {
          fs.unlinkSync(oldAvatarPath);
        }
      }
      avatarPath = `/uploads/${req.file.filename}`;
    }

    const isPrivateInt = Number(is_private) === 1 ? 1 : 0;
    await db.updateProfile(userId, bio || '', avatarPath, link || '', isPrivateInt);
    
    return res.json({ message: 'Profil başarıyla güncellendi.', avatar: avatarPath });
  } catch (error) {
    console.error('Update profile error:', error);
    return res.status(500).json({ error: 'Sunucu hatası.' });
  }
});


// ================= FOLLOWS API =================

// Follow / Request Follow
app.post('/api/follows/request/:id', requireAuth, async (req, res) => {
  try {
    const followerId = req.session.userId;
    const followingId = Number(req.params.id);

    if (followerId === followingId) {
      return res.status(400).json({ error: 'Kendinizi takip edemezsiniz.' });
    }

    const targetUser = await db.getUserById(followingId);
    if (!targetUser) {
      return res.status(404).json({ error: 'Kullanıcı bulunamadı.' });
    }

    // Determine status (pending if private, accepted if public)
    const status = targetUser.is_private === 1 ? 'pending' : 'accepted';
    await db.followUser(followerId, followingId, status);

    // Create Notification
    const notifType = status === 'pending' ? 'follow_request' : 'follow';
    await db.createNotification(followingId, followerId, notifType, null);

    // Send real-time notification
    sendRealtimeNotification(followingId, {
      type: notifType,
      sender_username: req.session.username,
      sender_avatar: (await db.getUserById(followerId)).avatar,
      post_id: null,
      created_at: new Date()
    });

    return res.json({ status });
  } catch (error) {
    console.error('Follow error:', error);
    return res.status(500).json({ error: 'Sunucu hatası.' });
  }
});

// Unfollow
app.post('/api/follows/unfollow/:id', requireAuth, async (req, res) => {
  try {
    const followerId = req.session.userId;
    const followingId = Number(req.params.id);

    await db.unfollowUser(followerId, followingId);
    // Delete follow notifications
    await db.deleteNotification(followingId, followerId, 'follow', null);
    await db.deleteNotification(followingId, followerId, 'follow_request', null);

    return res.json({ message: 'Takipten çıkıldı.' });
  } catch (error) {
    return res.status(500).json({ error: 'Sunucu hatası.' });
  }
});

// Accept Follow Request
app.post('/api/follows/accept/:id', requireAuth, async (req, res) => {
  try {
    const followingId = req.session.userId; // target of request
    const followerId = Number(req.params.id); // user who requested to follow

    await db.acceptFollowRequest(followerId, followingId);
    // Update notification
    await db.deleteNotification(followingId, followerId, 'follow_request', null);
    await db.createNotification(followerId, followingId, 'follow_accept', null);

    sendRealtimeNotification(followerId, {
      type: 'follow_accept',
      sender_username: req.session.username,
      sender_avatar: (await db.getUserById(followingId)).avatar,
      post_id: null,
      created_at: new Date()
    });

    return res.json({ message: 'Takip isteği kabul edildi.' });
  } catch (error) {
    return res.status(500).json({ error: 'Sunucu hatası.' });
  }
});

// Reject/Cancel Follow Request
app.post('/api/follows/reject/:id', requireAuth, async (req, res) => {
  try {
    const followingId = req.session.userId;
    const followerId = Number(req.params.id);

    await db.unfollowUser(followerId, followingId);
    await db.deleteNotification(followingId, followerId, 'follow_request', null);

    return res.json({ message: 'Takip isteği reddedildi.' });
  } catch (error) {
    return res.status(500).json({ error: 'Sunucu hatası.' });
  }
});

// Get Pending Follow Requests
app.get('/api/follows/pending', requireAuth, async (req, res) => {
  try {
    const requests = await db.getPendingFollowRequests(req.session.userId);
    return res.json({ requests });
  } catch (error) {
    return res.status(500).json({ error: 'Sunucu hatası.' });
  }
});


// ================= POSTS (THREADS) API =================

// Create Post / Reply / Repost / Quote
app.post('/api/posts', requireAuth, upload.single('image'), async (req, res) => {
  try {
    const userId = req.session.userId;
    const { content, parent_id, repost_of, quote_of } = req.body;

    let imageUrl = '';
    if (req.file) {
      imageUrl = `/uploads/${req.file.filename}`;
    }

    const parentId = parent_id ? Number(parent_id) : null;
    const repostOf = repost_of ? Number(repost_of) : null;
    const quoteOf = quote_of ? Number(quote_of) : null;

    // Repost check: cannot repost if user already reposted this thread
    if (repostOf) {
      // Find if repost already exists
      const existingReposts = await db.getFeed(userId, 'everyone');
      const alreadyReposted = existingReposts.some(p => p.user_id === userId && p.repost_of === repostOf);
      if (alreadyReposted) {
        return res.status(400).json({ error: 'Bu gönderiyi zaten yeniden paylaştınız.' });
      }
    }

    const postId = await db.createPost({
      userId,
      content: content || '',
      imageUrl,
      parentId,
      repostOf,
      quoteOf
    });

    // --- NOTIFICATIONS & REAL-TIME Gateways ---
    
    // 1. Comment Notification
    if (parentId) {
      const parentPost = await db.getPostDetail(parentId, userId);
      if (parentPost && parentPost.user_id !== userId) {
        await db.createNotification(parentPost.user_id, userId, 'comment', postId);
        sendRealtimeNotification(parentPost.user_id, {
          type: 'comment',
          sender_username: req.session.username,
          sender_avatar: (await db.getUserById(userId)).avatar,
          post_id: postId,
          created_at: new Date()
        });
      }
    }

    // 2. Repost Notification
    if (repostOf) {
      const originalPost = await db.getPostDetail(repostOf, userId);
      if (originalPost && originalPost.user_id !== userId) {
        await db.createNotification(originalPost.user_id, userId, 'repost', postId);
        sendRealtimeNotification(originalPost.user_id, {
          type: 'repost',
          sender_username: req.session.username,
          sender_avatar: (await db.getUserById(userId)).avatar,
          post_id: postId,
          created_at: new Date()
        });
      }
    }

    // 3. Quote Notification
    if (quoteOf) {
      const originalPost = await db.getPostDetail(quoteOf, userId);
      if (originalPost && originalPost.user_id !== userId) {
        await db.createNotification(originalPost.user_id, userId, 'quote', postId);
        sendRealtimeNotification(originalPost.user_id, {
          type: 'quote',
          sender_username: req.session.username,
          sender_avatar: (await db.getUserById(userId)).avatar,
          post_id: postId,
          created_at: new Date()
        });
      }
    }

    return res.status(201).json({ message: 'Paylaşıldı.', postId });
  } catch (error) {
    console.error('Create post error:', error);
    return res.status(500).json({ error: 'Gönderi paylaşılamadı.' });
  }
});

// Delete Post
app.delete('/api/posts/:id', requireAuth, async (req, res) => {
  try {
    const postId = Number(req.params.id);
    const userId = req.session.userId;

    const post = await db.getPostDetail(postId, userId);
    if (!post) {
      return res.status(404).json({ error: 'Gönderi bulunamadı.' });
    }

    // Delete image if exists
    if (post.image_url && post.image_url.startsWith('/uploads/')) {
      const imgPath = path.join(__dirname, 'public', post.image_url);
      if (fs.existsSync(imgPath)) {
        fs.unlinkSync(imgPath);
      }
    }

    await db.deletePost(postId, userId);
    return res.json({ message: 'Gönderi silindi.' });
  } catch (error) {
    return res.status(500).json({ error: 'Sunucu hatası.' });
  }
});

// Get Feed (Everyone / Following)
app.get('/api/posts/feed', requireAuth, async (req, res) => {
  try {
    const type = req.query.type || 'everyone'; // 'everyone' or 'following'
    const posts = await db.getFeed(req.session.userId, type);
    return res.json({ posts });
  } catch (error) {
    console.error('Feed error:', error);
    return res.status(500).json({ error: 'Feed yüklenemedi.' });
  }
});

// Get Post details with replies
app.get('/api/posts/:id', requireAuth, async (req, res) => {
  try {
    const postId = Number(req.params.id);
    const userId = req.session.userId;

    const post = await db.getPostDetail(postId, userId);
    if (!post) {
      return res.status(404).json({ error: 'Gönderi bulunamadı.' });
    }

    // Check privacy
    if (post.is_private === 1 && post.user_id !== userId) {
      const followStatus = await db.getFollowStatus(userId, post.user_id);
      if (followStatus !== 'accepted') {
        return res.status(403).json({ error: 'Bu hesap gizli.' });
      }
    }

    const replies = await db.getReplies(postId, userId);

    return res.json({ post, replies });
  } catch (error) {
    console.error('Get post details error:', error);
    return res.status(500).json({ error: 'Detaylar yüklenemedi.' });
  }
});

// Like / Unlike Toggle
app.post('/api/posts/:id/like', requireAuth, async (req, res) => {
  try {
    const postId = Number(req.params.id);
    const userId = req.session.userId;

    const post = await db.getPostDetail(postId, userId);
    if (!post) {
      return res.status(404).json({ error: 'Gönderi bulunamadı.' });
    }

    if (post.is_liked > 0) {
      // Already liked, so unlike
      await db.unlikePost(userId, postId);
      await db.deleteNotification(post.user_id, userId, 'like', postId);
      return res.json({ liked: false });
    } else {
      // Like it
      await db.likePost(userId, postId);
      
      // Create notification for like
      if (post.user_id !== userId) {
        await db.createNotification(post.user_id, userId, 'like', postId);
        sendRealtimeNotification(post.user_id, {
          type: 'like',
          sender_username: req.session.username,
          sender_avatar: (await db.getUserById(userId)).avatar,
          post_id: postId,
          created_at: new Date()
        });
      }

      return res.json({ liked: true });
    }
  } catch (error) {
    console.error('Like toggle error:', error);
    return res.status(500).json({ error: 'Sunucu hatası.' });
  }
});

// Fetch Profile Threads & Replies & Reposts/Quotes
app.get('/api/profile/:id/posts', requireAuth, async (req, res) => {
  try {
    const profileId = Number(req.params.id);
    const currentUserId = req.session.userId;

    const profileUser = await db.getUserById(profileId);
    if (!profileUser) {
      return res.status(404).json({ error: 'Kullanıcı bulunamadı.' });
    }

    // Privacy check
    if (profileUser.is_private === 1 && profileId !== currentUserId) {
      const followStatus = await db.getFollowStatus(currentUserId, profileId);
      if (followStatus !== 'accepted') {
        return res.status(403).json({ error: 'Bu hesap gizli.', user: profileUser });
      }
    }

    const type = req.query.type || 'threads'; // 'threads', 'replies'
    let posts = [];

    if (type === 'replies') {
      posts = await db.getUserReplies(profileId, currentUserId);
    } else {
      posts = await db.getUserThreads(profileId, currentUserId);
    }

    return res.json({ posts });
  } catch (error) {
    console.error('Profile posts error:', error);
    return res.status(500).json({ error: 'Paylaşımlar yüklenemedi.' });
  }
});


// ================= DIRECT MESSAGES (DMs) API =================

// Get Conversations List
app.get('/api/messages/conversations', requireAuth, async (req, res) => {
  try {
    const conversations = await db.getConversations(req.session.userId);
    return res.json({ conversations });
  } catch (error) {
    return res.status(500).json({ error: 'Mesaj listesi yüklenemedi.' });
  }
});

// Get Messages History with userId
app.get('/api/messages/:id', requireAuth, async (req, res) => {
  try {
    const receiverId = Number(req.params.id);
    const userId = req.session.userId;

    const messages = await db.getMessages(userId, receiverId);
    const targetUser = await db.getUserById(receiverId);

    return res.json({ messages, targetUser });
  } catch (error) {
    return res.status(500).json({ error: 'Mesaj geçmişi yüklenemedi.' });
  }
});

// Send Message
app.post('/api/messages/:id', requireAuth, async (req, res) => {
  try {
    const receiverId = Number(req.params.id);
    const senderId = req.session.userId;
    const { content } = req.body;

    if (!content || content.trim() === '') {
      return res.status(400).json({ error: 'Boş mesaj gönderilemez.' });
    }

    const messageId = await db.sendMessage(senderId, receiverId, content.trim());
    const sender = await db.getUserById(senderId);

    const messageObj = {
      id: messageId,
      sender_id: senderId,
      receiver_id: receiverId,
      content: content.trim(),
      sender_username: sender.username,
      created_at: new Date()
    };

    // Real-time broadcasting
    sendRealtimeMessage(receiverId, messageObj);

    return res.status(201).json({ message: messageObj });
  } catch (error) {
    console.error('Send message error:', error);
    return res.status(500).json({ error: 'Mesaj gönderilemedi.' });
  }
});


// ================= NOTIFICATIONS API =================

// Get User Notifications
app.get('/api/notifications', requireAuth, async (req, res) => {
  try {
    const notifications = await db.getNotifications(req.session.userId);
    return res.json({ notifications });
  } catch (error) {
    return res.status(500).json({ error: 'Bildirimler yüklenemedi.' });
  }
});

// Mark Notifications as Read
app.post('/api/notifications/read', requireAuth, async (req, res) => {
  try {
    await db.markNotificationsRead(req.session.userId);
    return res.json({ message: 'Bildirimler okundu olarak işaretlendi.' });
  } catch (error) {
    return res.status(500).json({ error: 'Sunucu hatası.' });
  }
});


// Start server and initialize db
db.initDB()
  .then(() => {
    server.listen(PORT, () => {
      console.log(`Threads Clone Server running on http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error('Failed to initialize database and server:', err);
  });
