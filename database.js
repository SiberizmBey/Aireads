const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const path = require('path');

let db;

async function initDB() {
  db = await open({
    filename: path.join(__dirname, 'database.sqlite'),
    driver: sqlite3.Database
  });

  // Enable Foreign Keys in SQLite
  await db.exec('PRAGMA foreign_keys = ON;');

  // Create Users Table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      bio TEXT DEFAULT '',
      avatar TEXT DEFAULT '',
      link TEXT DEFAULT '',
      is_private INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Create Posts Table (Threads, Replies, Reposts, Quotes)
  await db.exec(`
    CREATE TABLE IF NOT EXISTS posts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      content TEXT DEFAULT '',
      image_url TEXT DEFAULT '',
      parent_id INTEGER DEFAULT NULL,
      repost_of INTEGER DEFAULT NULL,
      quote_of INTEGER DEFAULT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
      FOREIGN KEY (parent_id) REFERENCES posts (id) ON DELETE CASCADE,
      FOREIGN KEY (repost_of) REFERENCES posts (id) ON DELETE CASCADE,
      FOREIGN KEY (quote_of) REFERENCES posts (id) ON DELETE CASCADE
    );
  `);

  // Create Likes Table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS likes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      post_id INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
      FOREIGN KEY (post_id) REFERENCES posts (id) ON DELETE CASCADE,
      UNIQUE(user_id, post_id)
    );
  `);

  // Create Follows Table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS follows (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      follower_id INTEGER NOT NULL,
      following_id INTEGER NOT NULL,
      status TEXT DEFAULT 'accepted', -- 'pending' or 'accepted'
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (follower_id) REFERENCES users (id) ON DELETE CASCADE,
      FOREIGN KEY (following_id) REFERENCES users (id) ON DELETE CASCADE,
      UNIQUE(follower_id, following_id)
    );
  `);

  // Create Messages Table (Direct Messages)
  await db.exec(`
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sender_id INTEGER NOT NULL,
      receiver_id INTEGER NOT NULL,
      content TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (sender_id) REFERENCES users (id) ON DELETE CASCADE,
      FOREIGN KEY (receiver_id) REFERENCES users (id) ON DELETE CASCADE
    );
  `);

  // Create Notifications Table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      sender_id INTEGER NOT NULL,
      type TEXT NOT NULL, -- 'like', 'comment', 'repost', 'quote', 'follow_request', 'follow_accept', 'follow'
      post_id INTEGER DEFAULT NULL,
      is_read INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
      FOREIGN KEY (sender_id) REFERENCES users (id) ON DELETE CASCADE,
      FOREIGN KEY (post_id) REFERENCES posts (id) ON DELETE CASCADE
    );
  `);

  console.log('SQLite Database Initialized Successfully.');
}

// User Helpers
async function createUser(username, hashedPassword) {
  const result = await db.run(
    'INSERT INTO users (username, password) VALUES (?, ?)',
    [username.toLowerCase().trim(), hashedPassword]
  );
  return result.lastID;
}

async function getUserByUsername(username) {
  return await db.get('SELECT * FROM users WHERE username = ?', [username.toLowerCase().trim()]);
}

async function getUserById(id) {
  return await db.get('SELECT id, username, bio, avatar, link, is_private, created_at FROM users WHERE id = ?', [id]);
}

async function deleteUser(id) {
  return await db.run('DELETE FROM users WHERE id = ?', [id]);
}

async function updateProfile(userId, bio, avatar, link, isPrivate) {
  return await db.run(
    'UPDATE users SET bio = ?, avatar = ?, link = ?, is_private = ? WHERE id = ?',
    [bio, avatar, link, isPrivate, userId]
  );
}

async function searchUsers(query, currentUserId) {
  return await db.all(
    `SELECT id, username, bio, avatar, is_private,
     (SELECT status FROM follows WHERE follower_id = ? AND following_id = users.id) AS follow_status
     FROM users WHERE username LIKE ? AND id != ? LIMIT 30`,
    [currentUserId, `%${query.toLowerCase().trim()}%`, currentUserId]
  );
}

// Follow Helpers
async function followUser(followerId, followingId, status = 'accepted') {
  return await db.run(
    'INSERT OR REPLACE INTO follows (follower_id, following_id, status) VALUES (?, ?, ?)',
    [followerId, followingId, status]
  );
}

async function unfollowUser(followerId, followingId) {
  return await db.run(
    'DELETE FROM follows WHERE follower_id = ? AND following_id = ?',
    [followerId, followingId]
  );
}

async function acceptFollowRequest(followerId, followingId) {
  return await db.run(
    "UPDATE follows SET status = 'accepted' WHERE follower_id = ? AND following_id = ?",
    [followerId, followingId]
  );
}

async function getFollowStatus(followerId, followingId) {
  const row = await db.get(
    'SELECT status FROM follows WHERE follower_id = ? AND following_id = ?',
    [followerId, followingId]
  );
  return row ? row.status : null;
}

async function getFollowers(userId) {
  return await db.all(
    `SELECT u.id, u.username, u.avatar, u.bio
     FROM follows f
     JOIN users u ON f.follower_id = u.id
     WHERE f.following_id = ? AND f.status = 'accepted'`,
    [userId]
  );
}

async function getFollowing(userId) {
  return await db.all(
    `SELECT u.id, u.username, u.avatar, u.bio
     FROM follows f
     JOIN users u ON f.following_id = u.id
     WHERE f.follower_id = ? AND f.status = 'accepted'`,
    [userId]
  );
}

async function getPendingFollowRequests(userId) {
  return await db.all(
    `SELECT u.id, u.username, u.avatar
     FROM follows f
     JOIN users u ON f.follower_id = u.id
     WHERE f.following_id = ? AND f.status = 'pending'`,
    [userId]
  );
}

// Post Helpers
async function createPost({ userId, content = '', imageUrl = '', parentId = null, repostOf = null, quoteOf = null }) {
  const result = await db.run(
    'INSERT INTO posts (user_id, content, image_url, parent_id, repost_of, quote_of) VALUES (?, ?, ?, ?, ?, ?)',
    [userId, content, imageUrl, parentId, repostOf, quoteOf]
  );
  return result.lastID;
}

async function deletePost(postId, userId) {
  return await db.run('DELETE FROM posts WHERE id = ? AND user_id = ?', [postId, userId]);
}

async function getPostDetail(postId, currentUserId) {
  return await db.get(
    `SELECT p.*, u.username, u.avatar, u.is_private,
     (SELECT COUNT(*) FROM likes WHERE post_id = p.id) AS likes_count,
     (SELECT COUNT(*) FROM likes WHERE post_id = p.id AND user_id = ?) AS is_liked,
     (SELECT COUNT(*) FROM posts WHERE parent_id = p.id) AS replies_count,
     (SELECT COUNT(*) FROM posts WHERE repost_of = p.id) AS reposts_count,
     -- Details of original post if this is a Repost
     rp.content AS rp_content, rp.image_url AS rp_image_url, rp.created_at AS rp_created_at,
     ru.username AS rp_username, ru.avatar AS rp_avatar, ru.id AS rp_user_id,
     -- Details of original post if this is a Quote
     qp.content AS qp_content, qp.image_url AS qp_image_url, qp.created_at AS qp_created_at,
     qu.username AS qp_username, qu.avatar AS qp_avatar, qu.id AS qp_user_id
     FROM posts p
     JOIN users u ON p.user_id = u.id
     LEFT JOIN posts rp ON p.repost_of = rp.id
     LEFT JOIN users ru ON rp.user_id = ru.id
     LEFT JOIN posts qp ON p.quote_of = qp.id
     LEFT JOIN users qu ON qp.user_id = qu.id
     WHERE p.id = ?`,
    [currentUserId, postId]
  );
}

async function getReplies(postId, currentUserId) {
  return await db.all(
    `SELECT p.*, u.username, u.avatar,
     (SELECT COUNT(*) FROM likes WHERE post_id = p.id) AS likes_count,
     (SELECT COUNT(*) FROM likes WHERE post_id = p.id AND user_id = ?) AS is_liked,
     (SELECT COUNT(*) FROM posts WHERE parent_id = p.id) AS replies_count
     FROM posts p
     JOIN users u ON p.user_id = u.id
     WHERE p.parent_id = ?
     ORDER BY p.created_at ASC`,
    [currentUserId, postId]
  );
}

async function getFeed(currentUserId, type = 'everyone') {
  let query = '';
  let params = [];

  if (type === 'following') {
    // Show posts from users the current user follows (status = 'accepted') + user's own posts
    query = `
      SELECT p.*, u.username, u.avatar, u.is_private,
      (SELECT COUNT(*) FROM likes WHERE post_id = p.id) AS likes_count,
      (SELECT COUNT(*) FROM likes WHERE post_id = p.id AND user_id = ?) AS is_liked,
      (SELECT COUNT(*) FROM posts WHERE parent_id = p.id) AS replies_count,
      (SELECT COUNT(*) FROM posts WHERE repost_of = p.id) AS reposts_count,
      rp.content AS rp_content, rp.image_url AS rp_image_url, rp.created_at AS rp_created_at,
      ru.username AS rp_username, ru.avatar AS rp_avatar, ru.id AS rp_user_id,
      qp.content AS qp_content, qp.image_url AS qp_image_url, qp.created_at AS qp_created_at,
      qu.username AS qp_username, qu.avatar AS qp_avatar, qu.id AS qp_user_id
      FROM posts p
      JOIN users u ON p.user_id = u.id
      LEFT JOIN posts rp ON p.repost_of = rp.id
      LEFT JOIN users ru ON rp.user_id = ru.id
      LEFT JOIN posts qp ON p.quote_of = qp.id
      LEFT JOIN users qu ON qp.user_id = qu.id
      WHERE (p.user_id = ? OR p.user_id IN (
        SELECT following_id FROM follows WHERE follower_id = ? AND status = 'accepted'
      )) AND p.parent_id IS NULL
      ORDER BY p.created_at DESC
    `;
    params = [currentUserId, currentUserId, currentUserId];
  } else {
    // type = 'everyone'
    // Show posts from public accounts OR accounts followed by current user OR current user's own posts
    query = `
      SELECT p.*, u.username, u.avatar, u.is_private,
      (SELECT COUNT(*) FROM likes WHERE post_id = p.id) AS likes_count,
      (SELECT COUNT(*) FROM likes WHERE post_id = p.id AND user_id = ?) AS is_liked,
      (SELECT COUNT(*) FROM posts WHERE parent_id = p.id) AS replies_count,
      (SELECT COUNT(*) FROM posts WHERE repost_of = p.id) AS reposts_count,
      rp.content AS rp_content, rp.image_url AS rp_image_url, rp.created_at AS rp_created_at,
      ru.username AS rp_username, ru.avatar AS rp_avatar, ru.id AS rp_user_id,
      qp.content AS qp_content, qp.image_url AS qp_image_url, qp.created_at AS qp_created_at,
      qu.username AS qp_username, qu.avatar AS qp_avatar, qu.id AS qp_user_id
      FROM posts p
      JOIN users u ON p.user_id = u.id
      LEFT JOIN posts rp ON p.repost_of = rp.id
      LEFT JOIN users ru ON rp.user_id = ru.id
      LEFT JOIN posts qp ON p.quote_of = qp.id
      LEFT JOIN users qu ON qp.user_id = qu.id
      WHERE (u.is_private = 0 OR p.user_id = ? OR p.user_id IN (
        SELECT following_id FROM follows WHERE follower_id = ? AND status = 'accepted'
      )) AND p.parent_id IS NULL
      ORDER BY p.created_at DESC
    `;
    params = [currentUserId, currentUserId, currentUserId];
  }

  return await db.all(query, params);
}

async function getUserThreads(profileUserId, currentUserId) {
  // Return threads belonging to profileUserId (only if public OR current user is follower/self)
  return await db.all(
    `SELECT p.*, u.username, u.avatar, u.is_private,
     (SELECT COUNT(*) FROM likes WHERE post_id = p.id) AS likes_count,
     (SELECT COUNT(*) FROM likes WHERE post_id = p.id AND user_id = ?) AS is_liked,
     (SELECT COUNT(*) FROM posts WHERE parent_id = p.id) AS replies_count,
     (SELECT COUNT(*) FROM posts WHERE repost_of = p.id) AS reposts_count,
     rp.content AS rp_content, rp.image_url AS rp_image_url, rp.created_at AS rp_created_at,
     ru.username AS rp_username, ru.avatar AS rp_avatar, ru.id AS rp_user_id,
     qp.content AS qp_content, qp.image_url AS qp_image_url, qp.created_at AS qp_created_at,
     qu.username AS qp_username, qu.avatar AS qp_avatar, qu.id AS qp_user_id
     FROM posts p
     JOIN users u ON p.user_id = u.id
     LEFT JOIN posts rp ON p.repost_of = rp.id
     LEFT JOIN users ru ON rp.user_id = ru.id
     LEFT JOIN posts qp ON p.quote_of = qp.id
     LEFT JOIN users qu ON qp.user_id = qu.id
     WHERE p.user_id = ? AND p.parent_id IS NULL
     ORDER BY p.created_at DESC`,
    [currentUserId, profileUserId]
  );
}

async function getUserReplies(profileUserId, currentUserId) {
  // Returns replies made by this profileUserId
  return await db.all(
    `SELECT p.*, u.username, u.avatar,
     parent.content AS parent_content, pu.username AS parent_username,
     (SELECT COUNT(*) FROM likes WHERE post_id = p.id) AS likes_count,
     (SELECT COUNT(*) FROM likes WHERE post_id = p.id AND user_id = ?) AS is_liked,
     (SELECT COUNT(*) FROM posts WHERE parent_id = p.id) AS replies_count
     FROM posts p
     JOIN users u ON p.user_id = u.id
     JOIN posts parent ON p.parent_id = parent.id
     JOIN users pu ON parent.user_id = pu.id
     WHERE p.user_id = ? AND p.parent_id IS NOT NULL
     ORDER BY p.created_at DESC`,
    [currentUserId, profileUserId]
  );
}

// Likes Helpers
async function likePost(userId, postId) {
  return await db.run('INSERT OR IGNORE INTO likes (user_id, post_id) VALUES (?, ?)', [userId, postId]);
}

async function unlikePost(userId, postId) {
  return await db.run('DELETE FROM likes WHERE user_id = ? AND post_id = ?', [userId, postId]);
}

// Messages (DMs) Helpers
async function sendMessage(senderId, receiverId, content) {
  const result = await db.run(
    'INSERT INTO messages (sender_id, receiver_id, content) VALUES (?, ?, ?)',
    [senderId, receiverId, content]
  );
  return result.lastID;
}

async function getMessages(userId1, userId2) {
  return await db.all(
    `SELECT m.*, s.username AS sender_username, r.username AS receiver_username
     FROM messages m
     JOIN users s ON m.sender_id = s.id
     JOIN users r ON m.receiver_id = r.id
     WHERE (m.sender_id = ? AND m.receiver_id = ?)
        OR (m.sender_id = ? AND m.receiver_id = ?)
     ORDER BY m.created_at ASC`,
    [userId1, userId2, userId2, userId1]
  );
}

async function getConversations(userId) {
  // Returns list of users the current user has chatted with, along with the last message
  return await db.all(
    `SELECT u.id, u.username, u.avatar,
     (SELECT content FROM messages
      WHERE (sender_id = u.id AND receiver_id = ?) OR (sender_id = ? AND receiver_id = u.id)
      ORDER BY created_at DESC LIMIT 1) AS last_message,
     (SELECT created_at FROM messages
      WHERE (sender_id = u.id AND receiver_id = ?) OR (sender_id = ? AND receiver_id = u.id)
      ORDER BY created_at DESC LIMIT 1) AS last_message_time
     FROM users u
     WHERE u.id IN (
       SELECT DISTINCT sender_id FROM messages WHERE receiver_id = ?
       UNION
       SELECT DISTINCT receiver_id FROM messages WHERE sender_id = ?
     )
     ORDER BY last_message_time DESC`,
    [userId, userId, userId, userId, userId, userId]
  );
}

// Notifications Helpers
async function createNotification(userId, senderId, type, postId = null) {
  // Don't notify self
  if (userId === senderId) return null;
  
  const result = await db.run(
    'INSERT INTO notifications (user_id, sender_id, type, post_id) VALUES (?, ?, ?, ?)',
    [userId, senderId, type, postId]
  );
  return result.lastID;
}

async function deleteNotification(userId, senderId, type, postId = null) {
  return await db.run(
    'DELETE FROM notifications WHERE user_id = ? AND sender_id = ? AND type = ? AND (post_id = ? OR (post_id IS NULL AND ? IS NULL))',
    [userId, senderId, type, postId, postId]
  );
}

async function getNotifications(userId) {
  return await db.all(
    `SELECT n.*, u.username AS sender_username, u.avatar AS sender_avatar, p.content AS post_content
     FROM notifications n
     JOIN users u ON n.sender_id = u.id
     LEFT JOIN posts p ON n.post_id = p.id
     WHERE n.user_id = ?
     ORDER BY n.created_at DESC LIMIT 50`,
    [userId]
  );
}

async function markNotificationsRead(userId) {
  return await db.run('UPDATE notifications SET is_read = 1 WHERE user_id = ?', [userId]);
}

module.exports = {
  initDB,
  createUser,
  getUserByUsername,
  getUserById,
  deleteUser,
  updateProfile,
  searchUsers,
  followUser,
  unfollowUser,
  acceptFollowRequest,
  getFollowStatus,
  getFollowers,
  getFollowing,
  getPendingFollowRequests,
  createPost,
  deletePost,
  getPostDetail,
  getReplies,
  getFeed,
  getUserThreads,
  getUserReplies,
  likePost,
  unlikePost,
  sendMessage,
  getMessages,
  getConversations,
  createNotification,
  deleteNotification,
  getNotifications,
  markNotificationsRead
};
