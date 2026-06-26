const db = require('./database');
const bcrypt = require('bcryptjs');

async function runTests() {
  console.log('--- STARTING DATABASE LAYER TEST ---');
  
  try {
    // 1. Init Database
    await db.initDB();
    console.log('✔ Database connection and schemas OK.');

    // 2. Clear table data if any exists (to make tests idempotent)
    // Deleting all users cascades to delete all posts, likes, DMs, follows, notifications.
    const testUsers = ['alice_test', 'bob_test'];
    for (const u of testUsers) {
      const existing = await db.getUserByUsername(u);
      if (existing) {
        await db.deleteUser(existing.id);
        console.log(`Cleared existing test user: ${u}`);
      }
    }

    // 3. User Registration
    const hashed = await bcrypt.hash('secret123', 10);
    const aliceId = await db.createUser('alice_test', hashed);
    const bobId = await db.createUser('bob_test', hashed);
    console.log(`✔ User creation OK. Alice ID: ${aliceId}, Bob ID: ${bobId}`);

    const alice = await db.getUserById(aliceId);
    if (alice.username !== 'alice_test') {
      throw new Error('User retrieval username mismatch.');
    }
    console.log('✔ User retrieval OK.');

    // 4. Update Profile
    await db.updateProfile(aliceId, 'Hello, I am Alice.', '/uploads/avatar-alice.png', 'https://alice.com', 1); // 1 = Private
    const aliceUpdated = await db.getUserById(aliceId);
    if (aliceUpdated.bio !== 'Hello, I am Alice.' || aliceUpdated.is_private !== 1) {
      throw new Error('Profile update validation failed.');
    }
    console.log('✔ Profile update OK.');

    // 5. Follow request (Alice is private, so Bob follows Alice -> should be 'pending')
    await db.followUser(bobId, aliceId, 'pending');
    let followStatus = await db.getFollowStatus(bobId, aliceId);
    if (followStatus !== 'pending') {
      throw new Error(`Expected 'pending' follow request, got: ${followStatus}`);
    }
    console.log('✔ Follow request pending status OK.');

    // Accept Follow request
    await db.acceptFollowRequest(bobId, aliceId);
    followStatus = await db.getFollowStatus(bobId, aliceId);
    if (followStatus !== 'accepted') {
      throw new Error(`Expected 'accepted' follow status, got: ${followStatus}`);
    }
    console.log('✔ Follow request acceptance OK.');

    // 6. Posts (Alice creates a thread)
    const threadId = await db.createPost({
      userId: aliceId,
      content: 'My first thread post!'
    });
    console.log(`✔ Post creation OK. Thread ID: ${threadId}`);

    // Bob likes Alice's thread
    await db.likePost(bobId, threadId);
    
    // Bob comments/replies to Alice's thread
    const replyId = await db.createPost({
      userId: bobId,
      content: 'Awesome thread, Alice!',
      parentId: threadId
    });
    console.log(`✔ Comment creation OK. Reply ID: ${replyId}`);

    // Fetch Feed (Everyone)
    const feed = await db.getFeed(bobId, 'everyone');
    const hasThread = feed.some(p => p.id === threadId);
    if (!hasThread) {
      throw new Error('Feed retrieval did not include Alice\'s post.');
    }
    const threadDetail = feed.find(p => p.id === threadId);
    if (threadDetail.likes_count !== 1 || threadDetail.is_liked !== 1) {
      throw new Error(`Thread details/stats incorrect. Likes count: ${threadDetail.likes_count}`);
    }
    console.log('✔ Feed list & details stats OK.');

    // 7. Direct Messages
    const msgId = await db.sendMessage(bobId, aliceId, 'Hey Alice!');
    const messages = await db.getMessages(aliceId, bobId);
    if (messages.length !== 1 || messages[0].content !== 'Hey Alice!') {
      throw new Error('Message sending or retrieval mismatch.');
    }
    console.log('✔ Direct messages OK.');

    // 8. Notifications
    await db.createNotification(aliceId, bobId, 'like', threadId);
    const notifications = await db.getNotifications(aliceId);
    if (notifications.length === 0 || notifications[0].type !== 'like') {
      throw new Error('Notification creation mismatch.');
    }
    console.log('✔ Notifications OK.');

    // 9. Cascade Delete Test (Delete Bob)
    await db.deleteUser(bobId);
    console.log('Bob user deleted.');

    // Bob should not exist
    const bobCheck = await db.getUserById(bobId);
    if (bobCheck) {
      throw new Error('Bob still exists after deletion.');
    }

    // Bob's follow record to Alice should be gone
    const followCheck = await db.getFollowStatus(bobId, aliceId);
    if (followCheck !== null) {
      throw new Error('Bob follow record still exists.');
    }

    // Bob's reply should be gone (posts ON DELETE CASCADE parent_id, but user_id Bob is deleted anyway)
    const repliesCheck = await db.getReplies(threadId, aliceId);
    const hasBobReply = repliesCheck.some(r => r.user_id === bobId);
    if (hasBobReply) {
      throw new Error('Bob\'s reply still exists after Bob\'s user deletion.');
    }

    // Bob's messages should be gone
    const msgCheck = await db.getMessages(aliceId, bobId);
    if (msgCheck.length !== 0) {
      throw new Error('Bob\'s direct messages still exist after Bob\'s deletion.');
    }

    // Alice's like count on thread should go down to 0 because Bob is deleted (cascade delete on likes!)
    const feedAfterDelete = await db.getFeed(aliceId, 'everyone');
    const threadAfterDelete = feedAfterDelete.find(p => p.id === threadId);
    if (threadAfterDelete.likes_count !== 0) {
      throw new Error(`Likes count should be 0, got: ${threadAfterDelete.likes_count}`);
    }

    console.log('✔ Cascade delete integrity OK.');

    // Clean up Alice as well
    await db.deleteUser(aliceId);
    console.log('Alice user deleted.');

    console.log('\n=========================================');
    console.log('🎉 ALL DATABASE LAYER TESTS PASSED SUCCESSFULLY! 🎉');
    console.log('=========================================');

  } catch (err) {
    console.error('\n❌ TEST FAILED:');
    console.error(err);
    process.exit(1);
  }
}

runTests();
