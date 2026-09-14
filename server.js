const express = require('express');
const bodyParser = require('body-parser');
const session = require('express-session');
const path = require('path');
const fetch = require('node-fetch');

const app = express();
const port = 1000;

// JSONBin Configuration
const JSONBIN_API_KEY = '$2a$10$rCMZ5BGigbU.r61CyfSSMuDVGGKbVun2m0Q/crGUa4hM8vmfP81g2';
const USERS_BIN_ID = '6aa7ef35ffd5d16053050110';
const MESSAGES_BIN_ID = '6936fb2e43b1c97be9e003e2';

const JSONBIN_BASE_URL = 'https://api.jsonbin.io/v3/b';

// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(session({
  secret: 'western_union_secure_secret_key_2026',
  resave: false,
  saveUninitialized: true,
  cookie: { maxAge: 24 * 60 * 60 * 1000 }
}));
app.use(express.static(path.join(__dirname, 'public')));

// ============================================
// JSONBin Database Functions
// ============================================

async function loadUserData() {
  try {
    const response = await fetch(`${JSONBIN_BASE_URL}/${USERS_BIN_ID}/latest`, {
      headers: {
        'X-Master-Key': JSONBIN_API_KEY,
        'Content-Type': 'application/json'
      }
    });
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    const data = await response.json();
    return data.record || {};
  } catch (error) {
    console.error('Error loading user data:', error);
    return {};
  }
}

async function saveUserData(data) {
  try {
    const response = await fetch(`${JSONBIN_BASE_URL}/${USERS_BIN_ID}`, {
      method: 'PUT',
      headers: {
        'X-Master-Key': JSONBIN_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(data)
    });
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    return await response.json();
  } catch (error) {
    console.error('Error saving user data:', error);
  }
}

async function loadMessages() {
  try {
    const response = await fetch(`${JSONBIN_BASE_URL}/${MESSAGES_BIN_ID}/latest`, {
      headers: {
        'X-Master-Key': JSONBIN_API_KEY,
        'Content-Type': 'application/json'
      }
    });
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    const data = await response.json();
    return data.record || { conversations: [] };
  } catch (error) {
    console.error('Error loading messages:', error);
    return { conversations: [] };
  }
}

async function saveMessages(data) {
  try {
    const response = await fetch(`${JSONBIN_BASE_URL}/${MESSAGES_BIN_ID}`, {
      method: 'PUT',
      headers: {
        'X-Master-Key': JSONBIN_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(data)
    });
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    return await response.json();
  } catch (error) {
    console.error('Error saving messages:', error);
  }
}

// ============================================
// Helper Functions
// ============================================

function generateAccountNumber() {
  return 'WU' + Math.floor(1000000000 + Math.random() * 9000000000);
}

function generateNtfyTopic(email) {
  return 'wu_chat_' + email.toLowerCase().replace(/[^a-z0-9]/g, '_');
}

function isAdmin(email) {
  return email === 'admin@wuwallet.com';
}

async function sendNtfyNotification(topic, title, message, priority = 3) {
  const url = `https://ntfy.sh/${topic}`;
  try {
    await fetch(url, {
      method: 'POST',
      body: JSON.stringify({
        topic: topic,
        title: title,
        message: message,
        timestamp: new Date().toISOString(),
        priority: priority
      }),
      headers: {
        'Content-Type': 'application/json',
        'Title': title,
        'Priority': priority.toString(),
        'Tags': 'bell'
      }
    });
    return true;
  } catch (error) {
    console.error('Error sending ntfy notification:', error);
    return false;
  }
}

async function notifyUser(userEmail, title, message, notificationType = 'system') {
  const users = await loadUserData();
  const user = users[userEmail];
  if (user) {
    const notificationId = `notif_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    user.history = user.history || [];
    user.history.push({
      type: 'notification',
      notificationType: notificationType,
      title: title,
      message: message,
      date: new Date().toISOString(),
      notificationId: notificationId,
      read: false
    });
    await saveUserData(users);
    const userTopic = generateNtfyTopic(userEmail);
    await sendNtfyNotification(userTopic, title, message, 3);
  }
}

// Pick the best identifier from the request body for any payment type
function pickRecipientAccount(body) {
  return body.accountNumber 
      || body.identifier 
      || body.nubanCode 
      || body.account_number 
      || '';
}

function pickRecipientName(body) {
  return body.recipientName 
      || body.accountName 
      || body.account_name 
      || body.fullName 
      || body.full_name 
      || body.name 
      || 'Recipient';
}

function pickBank(body) {
  return body.bankName || body.bank || body.bank_name || '';
}

function pickSenderCountry(body) {
  return body.senderCountry || body.sender_country || 'Nigeria';
}

// ============================================
// Routes
// ============================================

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.post('/login', async (req, res) => {
  const { email, password } = req.body;
  const users = await loadUserData();

  if (isAdmin(email) && password === 'Admin@123') {
    req.session.email = email;
    req.session.isAdmin = true;
    return res.json({ success: true, redirect: '/admin', isAdmin: true });
  }

  if (users[email] && users[email].password === password && users[email].active !== false) {
    req.session.email = email;
    req.session.isAdmin = false;
    return res.json({ success: true, redirect: '/dashboard', isAdmin: false });
  }

  if (users[email] && users[email].active === false) {
    return res.json({ success: false, message: 'Account deactivated. Contact admin.' });
  }

  res.json({ success: false, message: 'Invalid email or password' });
});

app.get('/register', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'register.html'));
});

app.post('/register', async (req, res) => {
  const { fullname, email, password, phone } = req.body;
  const users = await loadUserData();

  if (users[email]) {
    return res.json({ success: false, message: 'User already exists' });
  }

  const accountNumber = generateAccountNumber();
  const ntfyTopic = generateNtfyTopic(email);

  users[email] = {
    fullname,
    password,
    phone,
    account_number: accountNumber,
    balance: 0,
    history: [],
    ntfy_topic: ntfyTopic,
    role: 'user',
    active: true,
    created_at: new Date().toISOString(),
    last_login: null
  };

  await saveUserData(users);
  await sendNtfyNotification('new_chat_wu', 'New User Registered', `${fullname} (${email}) just registered. Account: ${accountNumber}`, 4);

  res.json({ success: true, message: 'Registration successful', accountNumber });
});

app.post('/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

app.get('/dashboard', (req, res) => {
  if (!req.session.email || isAdmin(req.session.email)) {
    return res.redirect('/login');
  }
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

app.get('/admin', async (req, res) => {
  if (!req.session.email || !isAdmin(req.session.email)) {
    return res.redirect('/login');
  }
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.get('/chat', (req, res) => {
  if (!req.session.email) {
    return res.redirect('/login');
  }
  res.sendFile(path.join(__dirname, 'public', 'chat.html'));
});

app.get('/deposit', (req, res) => {
  if (!req.session.email) {
    return res.redirect('/login');
  }
  res.sendFile(path.join(__dirname, 'public', 'deposit.html'));
});

app.get('/data', async (req, res) => {
  if (!req.session.email) {
    return res.status(401).json({ error: 'Not logged in' });
  }
  const users = await loadUserData();
  const user = users[req.session.email];

  if (user) {
    res.json({
      fullname: user.fullname,
      email: req.session.email,
      account_number: user.account_number,
      balance: user.balance,
      ntfy_topic: user.ntfy_topic,
      active: user.active
    });
  } else {
    res.status(404).json({ error: 'User not found' });
  }
});

app.get('/history', async (req, res) => {
  if (!req.session.email) {
    return res.status(401).json({ error: 'Not logged in' });
  }
  const users = await loadUserData();
  const user = users[req.session.email];

  if (user) {
    res.json(user.history || []);
  } else {
    res.status(404).json({ error: 'User not found' });
  }
});

// ============================================
// Admin API Routes
// ============================================

app.get('/api/admin/users', async (req, res) => {
  if (!req.session.email || !isAdmin(req.session.email)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const users = await loadUserData();
  const userList = Object.keys(users).map(email => ({
    email: email,
    fullname: users[email].fullname,
    account_number: users[email].account_number,
    balance: users[email].balance,
    phone: users[email].phone,
    ntfy_topic: users[email].ntfy_topic,
    active: users[email].active !== false,
    created_at: users[email].created_at,
    role: users[email].role || 'user'
  }));
  res.json(userList);
});

app.post('/api/admin/credit', async (req, res) => {
  if (!req.session.email || !isAdmin(req.session.email)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const { userEmail, amount, description } = req.body;
  const users = await loadUserData();

  if (!users[userEmail]) {
    return res.status(404).json({ error: 'User not found' });
  }

  const creditAmount = parseFloat(amount);
  users[userEmail].balance += creditAmount;

  const transactionId = `ADMIN_CREDIT_${Date.now()}_${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

  users[userEmail].history = users[userEmail].history || [];
  users[userEmail].history.push({
    type: 'credit',
    amount: creditAmount,
    from: 'Admin',
    description: description || 'Admin credit',
    transactionId: transactionId,
    date: new Date().toISOString(),
    newBalance: users[userEmail].balance
  });

  await saveUserData(users);
  await notifyUser(userEmail, '💰 Account Credited', `$${creditAmount} has been added to your account. New balance: $${users[userEmail].balance}\nDescription: ${description || 'Admin credit'}`, 'admin_credit');
  await sendNtfyNotification('new_chat_wu', 'Admin Credit', `Credited $${creditAmount} to ${users[userEmail].fullname} (${userEmail})`, 3);

  res.json({ success: true, message: `$${creditAmount} credited to ${users[userEmail].fullname}`, newBalance: users[userEmail].balance });
});

app.post('/api/admin/debit', async (req, res) => {
  if (!req.session.email || !isAdmin(req.session.email)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const { userEmail, amount, description } = req.body;
  const users = await loadUserData();

  if (!users[userEmail]) {
    return res.status(404).json({ error: 'User not found' });
  }

  const debitAmount = parseFloat(amount);
  if (users[userEmail].balance < debitAmount) {
    return res.status(400).json({ error: 'Insufficient funds' });
  }

  users[userEmail].balance -= debitAmount;
  const transactionId = `ADMIN_DEBIT_${Date.now()}_${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

  users[userEmail].history = users[userEmail].history || [];
  users[userEmail].history.push({
    type: 'debit',
    amount: debitAmount,
    to: 'Admin',
    description: description || 'Admin debit',
    transactionId: transactionId,
    date: new Date().toISOString(),
    newBalance: users[userEmail].balance
  });

  await saveUserData(users);
  await notifyUser(userEmail, '💸 Account Debited', `$${debitAmount} has been deducted from your account. New balance: $${users[userEmail].balance}\nDescription: ${description || 'Admin debit'}`, 'admin_debit');
  await sendNtfyNotification('new_chat_wu', 'Admin Debit', `Debited $${debitAmount} from ${users[userEmail].fullname} (${userEmail})`, 3);

  res.json({ success: true, message: `$${debitAmount} debited from ${users[userEmail].fullname}`, newBalance: users[userEmail].balance });
});

app.post('/api/admin/toggle-status', async (req, res) => {
  if (!req.session.email || !isAdmin(req.session.email)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const { userEmail } = req.body;
  const users = await loadUserData();

  if (!users[userEmail]) {
    return res.status(404).json({ error: 'User not found' });
  }

  users[userEmail].active = users[userEmail].active === false ? true : false;
  await saveUserData(users);

  const status = users[userEmail].active ? 'activated' : 'deactivated';
  await notifyUser(userEmail, '🔐 Account Status Update', `Your account has been ${status} by admin.`, 'account_status');
  await sendNtfyNotification('new_chat_wu', 'Account Status Changed', `${users[userEmail].fullname} (${userEmail}) account ${status}`, 3);

  res.json({ success: true, message: `Account ${status}`, active: users[userEmail].active });
});

app.post('/api/admin/change-password', async (req, res) => {
  if (!req.session.email || !isAdmin(req.session.email)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const { userEmail, newPassword } = req.body;
  const users = await loadUserData();

  if (!users[userEmail]) {
    return res.status(404).json({ error: 'User not found' });
  }

  users[userEmail].password = newPassword;
  await saveUserData(users);
  await notifyUser(userEmail, '🔑 Password Changed', 'Your password has been changed by admin. Please use your new password to login.', 'password_change');
  await sendNtfyNotification('new_chat_wu', 'Password Changed', `Password changed for ${users[userEmail].fullname} (${userEmail})`, 4);

  res.json({ success: true, message: 'Password changed successfully' });
});

app.post('/api/admin/send-message', async (req, res) => {
  if (!req.session.email || !isAdmin(req.session.email)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const { userEmail, subject, message } = req.body;
  const users = await loadUserData();

  if (!users[userEmail]) {
    return res.status(404).json({ error: 'User not found' });
  }

  await notifyUser(userEmail, subject || '📨 Message from Admin', message, 'admin_message');

  const messages = await loadMessages();
  const conversationId = `conv_${Date.now()}_${userEmail.replace(/[^a-z0-9]/g, '_')}`;

  messages.conversations = messages.conversations || [];
  messages.conversations.push({
    id: conversationId,
    participants: ['admin@wuwallet.com', userEmail],
    messages: [{
      id: `msg_${Date.now()}`,
      senderEmail: 'admin@wuwallet.com',
      receiverEmail: userEmail,
      message: message,
      subject: subject,
      timestamp: new Date().toISOString(),
      read: false
    }],
    lastUpdated: new Date().toISOString()
  });

  await saveMessages(messages);
  await sendNtfyNotification('new_chat_wu', 'Admin Message Sent', `Message sent to ${users[userEmail].fullname} (${userEmail}): ${message.substring(0, 100)}...`, 3);

  res.json({ success: true, message: 'Message sent successfully' });
});

app.post('/api/admin/add-balance', async (req, res) => {
  if (!req.session.email || !isAdmin(req.session.email)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const { userEmail, amount, description } = req.body;
  const users = await loadUserData();

  if (!users[userEmail]) {
    return res.status(404).json({ error: 'User not found' });
  }

  const addAmount = parseFloat(amount);
  users[userEmail].balance += addAmount;

  const transactionId = `ADMIN_ADD_${Date.now()}_${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

  users[userEmail].history = users[userEmail].history || [];
  users[userEmail].history.push({
    type: 'credit',
    amount: addAmount,
    from: 'Admin',
    description: description || 'Balance addition',
    transactionId: transactionId,
    date: new Date().toISOString(),
    newBalance: users[userEmail].balance
  });

  await saveUserData(users);
  await notifyUser(userEmail, '💰 Balance Updated', `$${addAmount} has been added to your balance. New balance: $${users[userEmail].balance}\nDescription: ${description || 'Balance addition'}`, 'balance_update');
  await sendNtfyNotification('new_chat_wu', 'Balance Added', `Added $${addAmount} to ${users[userEmail].fullname} (${userEmail})`, 3);

  res.json({ success: true, message: `$${addAmount} added to ${users[userEmail].fullname}`, newBalance: users[userEmail].balance });
});

app.get('/api/user/ntfy-topic', async (req, res) => {
  if (!req.session.email) {
    return res.status(401).json({ error: 'Not logged in' });
  }
  const users = await loadUserData();
  const user = users[req.session.email];
  if (user) {
    res.json({ ntfy_topic: user.ntfy_topic });
  } else {
    res.status(404).json({ error: 'User not found' });
  }
});

// ============================================
// Chat & Message Routes
// ============================================

app.post('/api/chat/send', async (req, res) => {
  if (!req.session.email) {
    return res.status(401).json({ error: 'Not logged in' });
  }
  const { message } = req.body;
  const userEmail = req.session.email;
  const users = await loadUserData();
  const user = users[userEmail];

  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  const messages = await loadMessages();
  const adminEmail = 'admin@wuwallet.com';
  let conversation = messages.conversations.find(conv =>
    conv.participants.includes(userEmail) && conv.participants.includes(adminEmail)
  );

  if (!conversation) {
    conversation = {
      id: `conv_${Date.now()}_${userEmail.replace(/[^a-z0-9]/g, '_')}`,
      participants: [userEmail, adminEmail],
      messages: [],
      lastUpdated: new Date().toISOString()
    };
    messages.conversations.push(conversation);
  }

  conversation.messages.push({
    id: `msg_${Date.now()}`,
    senderEmail: userEmail,
    receiverEmail: adminEmail,
    message: message,
    timestamp: new Date().toISOString(),
    read: false
  });
  conversation.lastUpdated = new Date().toISOString();

  await saveMessages(messages);
  await sendNtfyNotification('new_chat_wu', `New Message from ${user.fullname}`, message.substring(0, 200), 4);

  res.json({ success: true, message: 'Message sent to admin' });
});

app.get('/api/chat/messages', async (req, res) => {
  if (!req.session.email) {
    return res.status(401).json({ error: 'Not logged in' });
  }
  const messages = await loadMessages();
  const userEmail = req.session.email;
  const adminEmail = 'admin@wuwallet.com';
  const conversation = messages.conversations.find(conv =>
    conv.participants.includes(userEmail) && conv.participants.includes(adminEmail)
  );
  res.json(conversation ? conversation.messages : []);
});

app.get('/api/admin/chat/conversations', async (req, res) => {
  if (!req.session.email || !isAdmin(req.session.email)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const messages = await loadMessages();
  const users = await loadUserData();
  const adminEmail = 'admin@wuwallet.com';

  const conversations = messages.conversations
    .filter(conv => conv.participants.includes(adminEmail))
    .map(conv => {
      const userEmail = conv.participants.find(p => p !== adminEmail);
      const user = users[userEmail];
      const unreadCount = conv.messages.filter(m => m.receiverEmail === adminEmail && !m.read).length;
      const lastMessage = conv.messages[conv.messages.length - 1];

      return {
        id: conv.id,
        userEmail: userEmail,
        userName: user ? user.fullname : userEmail,
        userAvatar: user ? user.fullname.charAt(0).toUpperCase() : 'U',
        lastMessage: lastMessage ? lastMessage.message.substring(0, 100) : 'No messages',
        lastMessageTime: lastMessage ? lastMessage.timestamp : conv.lastUpdated,
        unreadCount: unreadCount,
        userActive: user ? user.active !== false : false
      };
    })
    .sort((a, b) => new Date(b.lastMessageTime) - new Date(a.lastMessageTime));

  res.json(conversations);
});

app.get('/api/admin/chat/messages/:userEmail', async (req, res) => {
  if (!req.session.email || !isAdmin(req.session.email)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const { userEmail } = req.params;
  const messages = await loadMessages();
  const adminEmail = 'admin@wuwallet.com';

  const conversation = messages.conversations.find(conv =>
    conv.participants.includes(userEmail) && conv.participants.includes(adminEmail)
  );

  if (conversation) {
    conversation.messages.forEach(msg => {
      if (msg.receiverEmail === adminEmail && !msg.read) {
        msg.read = true;
      }
    });
    await saveMessages(messages);
  }

  res.json(conversation ? conversation.messages : []);
});

app.post('/api/admin/chat/reply', async (req, res) => {
  if (!req.session.email || !isAdmin(req.session.email)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const { userEmail, message } = req.body;
  const users = await loadUserData();
  const user = users[userEmail];

  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  const messages = await loadMessages();
  const adminEmail = 'admin@wuwallet.com';
  let conversation = messages.conversations.find(conv =>
    conv.participants.includes(userEmail) && conv.participants.includes(adminEmail)
  );

  if (!conversation) {
    conversation = {
      id: `conv_${Date.now()}_${userEmail.replace(/[^a-z0-9]/g, '_')}`,
      participants: [userEmail, adminEmail],
      messages: [],
      lastUpdated: new Date().toISOString()
    };
    messages.conversations.push(conversation);
  }

  conversation.messages.push({
    id: `msg_${Date.now()}`,
    senderEmail: adminEmail,
    receiverEmail: userEmail,
    message: message,
    timestamp: new Date().toISOString(),
    read: false
  });
  conversation.lastUpdated = new Date().toISOString();

  await saveMessages(messages);
  await notifyUser(userEmail, '📨 New Message from Admin', message, 'admin_reply');

  res.json({ success: true, message: 'Reply sent' });
});

// ============================================
// TRANSFER ROUTE — FIXED
// ============================================

app.post('/api/transfer', async (req, res) => {
  if (!req.session.email) {
    return res.status(401).json({ success: false, message: 'Not logged in. Please login again.' });
  }

  const body = req.body || {};

  // Extract fields that work across ALL payment types
  const recipientAccount = pickRecipientAccount(body);
  const recipientName = pickRecipientName(body);
  const bankName = pickBank(body);
  const senderCountry = pickSenderCountry(body);
  const amount = parseFloat(body.amount);
  const description = body.description || '';

  // Validation
  if (!amount || isNaN(amount) || amount <= 0) {
    return res.status(400).json({ success: false, message: 'Invalid transfer amount.' });
  }

  const users = await loadUserData();
  const senderEmail = req.session.email;
  const sender = users[senderEmail];

  if (!sender) {
    return res.status(404).json({ success: false, message: 'Sender account not found.' });
  }

  if (parseFloat(sender.balance) < amount) {
    return res.status(400).json({ success: false, message: 'Insufficient funds for this transfer.' });
  }

  // Find recipient — try to match by account number for internal transfers
  let recipientFound = false;
  let recipientEmail = null;

  if (recipientAccount) {
    for (const email in users) {
      if (users[email].account_number === recipientAccount) {
        recipientFound = true;
        recipientEmail = email;
        break;
      }
    }
  }

  const transferAmount = amount;
  const transactionId = `TXN_${Date.now()}_${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
  const now = new Date().toISOString();

  // Deduct from sender
  sender.balance = parseFloat(sender.balance) - transferAmount;
  sender.history = sender.history || [];
  sender.history.push({
    type: 'debit',
    amount: transferAmount,
    to: recipientFound ? users[recipientEmail].fullname : recipientName,
    recipientAccount: recipientAccount || 'External',
    bank: bankName,
    account: sender.account_number,
    transactionId: transactionId,
    date: now,
    senderName: sender.fullname,
    senderCountry: senderCountry,
    description: description || `Transfer to ${recipientName}`,
    status: recipientFound ? 'completed' : 'pending',
    note: recipientFound ? '' : 'Contact support if you do not receive this payment within 3 working days.'
  });

  // Credit recipient if internal account found
  if (recipientFound) {
    users[recipientEmail].balance = parseFloat(users[recipientEmail].balance) + transferAmount;
    users[recipientEmail].history = users[recipientEmail].history || [];
    users[recipientEmail].history.push({
      type: 'credit',
      amount: transferAmount,
      from: sender.fullname,
      account: users[recipientEmail].account_number,
      transactionId: transactionId,
      date: now,
      senderName: sender.fullname,
      senderCountry: senderCountry,
      description: `Transfer from ${sender.fullname}`
    });
  }

  await saveUserData(users);

  // Notify sender
  await notifyUser(
    senderEmail,
    '💸 Transfer Submitted',
    `$${transferAmount.toFixed(2)} transfer to ${recipientName} has been submitted.\nTransaction ID: ${transactionId}\n` +
    (recipientFound
      ? 'Status: Completed ✅'
      : 'Status: Pending ⏳\n\n⚠️ Contact support if you do not receive this payment within 3 working days.'),
    'transaction_sent'
  );

  // Notify recipient if internal
  if (recipientFound) {
    await notifyUser(
      recipientEmail,
      '💰 Transfer Received',
      `$${transferAmount.toFixed(2)} received from ${sender.fullname}\nTransaction ID: ${transactionId}`,
      'transaction_received'
    );
  }

  // Notify admin monitor
  await sendNtfyNotification(
    'new_chat_wu',
    'New Transfer',
    `${sender.fullname} sent $${transferAmount.toFixed(2)} to ${recipientName}${bankName ? ' (' + bankName + ')' : ''}\nTXN: ${transactionId}`,
    3
  );

  // IMPORTANT: message matches frontend check "Transfer successful!" exactly
  return res.json({
    success: true,
    message: 'Transfer successful!',
    transactionId: transactionId,
    amount: transferAmount,
    recipient: recipientName,
    status: recipientFound ? 'completed' : 'pending',
    supportNote: recipientFound ? '' : 'Contact support if you do not receive this payment within 3 working days.'
  });
});

app.listen(port, () => {
  console.log(`🚀 Server running on http://0.0.0.0:${port}`);
  console.log(`📊 JSONBin Connected`);
  console.log(`👑 Admin Login: admin@wuwallet.com / Admin@123`);
  console.log(`🔔 Ntfy Topics: each user has unique topic, admin monitors "new_chat_wu"`);
});
