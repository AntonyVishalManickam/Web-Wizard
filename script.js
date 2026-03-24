// 1. YOUR EXACT FIREBASE CONFIGURATION
const firebaseConfig = {
    apiKey: "AIzaSyDs7hiZ-QU2-yRB4D5m4eQowCrZyS9xx0o",
    authDomain: "sofiaai-67841.firebaseapp.com",
    projectId: "sofiaai-67841",
    storageBucket: "sofiaai-67841.firebasestorage.app",
    messagingSenderId: "459323261731",
    appId: "1:459323261731:web:2b8588cd4fd1caa49bc296"
};

// 2. YOUR GOOGLE GEMINI API KEY
const GEMINI_API_KEY = 'AIzaSyC1Q_UleqB5c3EUay76e198knsmjY30Js4';

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

let currentUser = null;
let currentChatId = null; 
let chatContext = []; 

// --- AUTHENTICATION ---
auth.onAuthStateChanged(user => {
    if (user) {
        currentUser = user;
        document.getElementById('login-screen').classList.remove('active');
        document.getElementById('app-screen').classList.add('active');
        
        document.getElementById('user-name').innerText = user.displayName || "Student";
        if(user.photoURL) document.getElementById('user-photo').src = user.photoURL;
        
        loadSidebarChats(); // Load all old chats on the left
        createNewChat();    // Start a fresh chat window on the right
    } else {
        document.getElementById('app-screen').classList.remove('active');
        document.getElementById('login-screen').classList.add('active');
        currentUser = null;
    }
});

document.getElementById('login-btn').addEventListener('click', () => {
    const provider = new firebase.auth.GoogleAuthProvider();
    auth.signInWithPopup(provider).catch(error => console.error(error));
});

document.getElementById('logout-btn').addEventListener('click', () => {
    auth.signOut();
});

// --- SIDEBAR & CHAT MANAGEMENT ---
function loadSidebarChats() {
    db.collection('users').doc(currentUser.uid).collection('chats')
      .orderBy('updatedAt', 'desc')
      .onSnapshot(snapshot => {
          const list = document.getElementById('chat-history-list');
          list.innerHTML = '';
          snapshot.forEach(doc => {
              const chat = doc.data();
              const activeClass = (doc.id === currentChatId) ? 'active-chat' : '';
              list.innerHTML += `<li class="${activeClass}" onclick="loadSpecificChat('${doc.id}', '${chat.title}')">💬 ${chat.title}</li>`;
          });
      });
}

function createNewChat() {
    currentChatId = null; // Reset ID so next message creates a new database room
    chatContext = [];
    document.getElementById('current-chat-title').innerText = "New Session";
    
    const firstName = currentUser.displayName ? currentUser.displayName.split(' ')[0] : "there";
    document.getElementById('chat-box').innerHTML = `<div class="message bot-message">Hey ${firstName}! Start a new conversation. I'm ready.</div>`;
    
    // Remove active highlight from sidebar
    document.querySelectorAll('#chat-history-list li').forEach(li => li.classList.remove('active-chat'));
}

function loadSpecificChat(chatId, title) {
    currentChatId = chatId;
    chatContext = [];
    document.getElementById('current-chat-title').innerText = title;
    const chatBox = document.getElementById('chat-box');
    chatBox.innerHTML = '';

    // Load messages for this specific chat
    db.collection('users').doc(currentUser.uid).collection('chats').doc(chatId).collection('messages')
      .orderBy('timestamp', 'asc')
      .get().then(snapshot => {
          snapshot.forEach(doc => {
              const msg = doc.data();
              addMessageToUI(msg.role, msg.text);
              chatContext.push({ role: msg.role, text: msg.text });
          });
          chatBox.scrollTop = chatBox.scrollHeight;
      });
}

// --- THE AI BRAIN ---
async function fetchAIResponse(userText) {
    const apiUrl = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=' + GEMINI_API_KEY;
    const firstName = currentUser.displayName ? currentUser.displayName.split(' ')[0] : "my friend";
    let memoryString = chatContext.map(msg => `${msg.role === 'user' ? firstName : 'Sofia'}: ${msg.text}`).join('\n');

    const systemPrompt = `You are Sofia, a loyal, fun AI best friend. You are talking to ${firstName}, a student. 
    Help them with studies, exams, or just chat. Be warm, supportive, and brilliant. Keep answers under 4 sentences.
    Memory:\n${memoryString}\nRespond to newest message: ${userText}`;

    try {
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: systemPrompt }] }] })
        });
        const data = await response.json();
        return data.candidates[0].content.parts[0].text; 
    } catch (error) {
        return "🚨 Network Error. Could not reach the AI servers.";
    }
}

// --- SENDING MESSAGES ---
async function sendMessage() {
    const inputField = document.getElementById('user-input');
    const userText = inputField.value.trim();

    if (userText !== "" && currentUser) {
        // 1. If this is a brand new chat, create a document for it first
        if (!currentChatId) {
            const newChatRef = db.collection('users').doc(currentUser.uid).collection('chats').doc();
            currentChatId = newChatRef.id;
            
            // Generate a title based on the first few words
            let chatTitle = userText.substring(0, 25);
            if(userText.length > 25) chatTitle += '...';
            document.getElementById('current-chat-title').innerText = chatTitle;

            await newChatRef.set({
                title: chatTitle,
                updatedAt: Date.now()
            });
        } else {
            // Update the "last active" time so it moves to the top of the sidebar
            db.collection('users').doc(currentUser.uid).collection('chats').doc(currentChatId).update({
                updatedAt: Date.now()
            });
        }

        // 2. Update UI & Local Memory
        addMessageToUI('user', userText);
        chatContext.push({ role: 'user', text: userText });
        inputField.value = "";
        
        // 3. Save User Message to Sub-collection
        db.collection('users').doc(currentUser.uid).collection('chats').doc(currentChatId).collection('messages').add({
            text: userText,
            role: 'user',
            timestamp: Date.now()
        });

        // 4. Show Loading
        const chatBox = document.getElementById("chat-box");
        const typingId = "typing-" + Date.now();
        chatBox.innerHTML += `<div class="message bot-message" id="${typingId}"><i>Sofia is thinking...</i></div>`;
        chatBox.scrollTop = chatBox.scrollHeight;

        // 5. Fetch AI Response
        const aiResponseText = await fetchAIResponse(userText);

        // 6. Remove Loading & Update UI
        document.getElementById(typingId).remove();
        addMessageToUI('bot', aiResponseText);
        chatContext.push({ role: 'bot', text: aiResponseText });

        // 7. Save AI Message
        db.collection('users').doc(currentUser.uid).collection('chats').doc(currentChatId).collection('messages').add({
            text: aiResponseText,
            role: 'bot',
            timestamp: Date.now()
        });
    }
}

function addMessageToUI(role, text) {
    const chatBox = document.getElementById('chat-box');
    const formattedText = text.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>'); 
    chatBox.innerHTML += `<div class="message ${role}-message">${formattedText}</div>`;
    chatBox.scrollTop = chatBox.scrollHeight;
}

document.getElementById("user-input").addEventListener("keypress", function(event) {
    if (event.key === "Enter") sendMessage();
});