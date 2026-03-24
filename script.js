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
const GEMINI_API_KEY = 'AIzaSyD-Z8MSzSDrBItwKnNcimj9xuH3B6nr1Ic';

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
        document.getElementById('login-screen').style.display = 'none';
        document.getElementById('app-screen').style.display = 'flex';
        
        document.getElementById('user-name').innerText = user.displayName || "Student";
        if(user.photoURL) document.getElementById('user-photo').src = user.photoURL;
        
        loadSidebarChats(); 
        createNewChat();    
    } else {
        document.getElementById('app-screen').style.display = 'none';
        document.getElementById('login-screen').style.display = 'flex';
        currentUser = null;
    }
});

document.getElementById('login-btn').addEventListener('click', () => {
    const provider = new firebase.auth.GoogleAuthProvider();
    auth.signInWithPopup(provider).catch(error => {
        alert("Google Sign-In Error: " + error.message);
        console.error(error);
    });
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
              
              // Appending the menu options dynamically
              const li = document.createElement('li');
              li.className = activeClass;
              li.innerHTML = `
                  <span class="chat-title-span" onclick="loadSpecificChat('${doc.id}', '${chat.title}')">💬 ${chat.title}</span>
                  <button class="chat-menu-btn" onclick="toggleMenu(event, '${doc.id}')">⋮</button>
                  
                  <div class="chat-dropdown" id="dropdown-${doc.id}">
                      <button onclick="renameChat(event, '${doc.id}', '${chat.title}')">✏️ Rename</button>
                      <button onclick="deleteChat(event, '${doc.id}')">🗑️ Delete</button>
                  </div>
              `;
              list.appendChild(li);
          });
      });
}

function createNewChat() {
    currentChatId = null; 
    chatContext = [];
    document.getElementById('current-chat-title').innerText = "New Session";
    
    const firstName = currentUser.displayName ? currentUser.displayName.split(' ')[0] : "there";
    document.getElementById('chat-box').innerHTML = `<div class="message bot-message">Hey ${firstName}! Start a new conversation. I'm ready.</div>`;
    
    document.querySelectorAll('#chat-history-list li').forEach(li => li.classList.remove('active-chat'));
}

function loadSpecificChat(chatId, title) {
    currentChatId = chatId;
    chatContext = [];
    document.getElementById('current-chat-title').innerText = title;
    const chatBox = document.getElementById('chat-box');
    chatBox.innerHTML = '';

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
// --- THE AI BRAIN ---
async function fetchAIResponse(userText) {
    // FIX 1: Switched to gemini-2.0-flash (The most stable, widely available model)
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
        
        // FIX 2: If Google rejects the request, Sofia will print the EXACT reason on the screen
        if (!response.ok) {
            console.error("Google API Error:", data);
            return "🚨 GOOGLE ERROR: " + (data.error ? data.error.message : "Unknown API rejection");
        }
        
        return data.candidates[0].content.parts[0].text; 
    } catch (error) {
        console.error("Code Crash Error:", error);
        return "🚨 Internal Error: Check browser console (F12) for details.";
    }
}

// --- SENDING MESSAGES ---
async function sendMessage() {
    const inputField = document.getElementById('user-input');
    const userText = inputField.value.trim();

    if (userText !== "" && currentUser) {
        if (!currentChatId) {
            const newChatRef = db.collection('users').doc(currentUser.uid).collection('chats').doc();
            currentChatId = newChatRef.id;
            
            let chatTitle = userText.substring(0, 25);
            if(userText.length > 25) chatTitle += '...';
            document.getElementById('current-chat-title').innerText = chatTitle;

            await newChatRef.set({
                title: chatTitle,
                updatedAt: Date.now()
            });
        } else {
            db.collection('users').doc(currentUser.uid).collection('chats').doc(currentChatId).update({
                updatedAt: Date.now()
            });
        }

        addMessageToUI('user', userText);
        chatContext.push({ role: 'user', text: userText });
        inputField.value = "";
        
        db.collection('users').doc(currentUser.uid).collection('chats').doc(currentChatId).collection('messages').add({
            text: userText,
            role: 'user',
            timestamp: Date.now()
        });

        const chatBox = document.getElementById("chat-box");
        const typingId = "typing-" + Date.now();
        chatBox.innerHTML += `<div class="message bot-message" id="${typingId}"><i>Sofia is thinking...</i></div>`;
        chatBox.scrollTop = chatBox.scrollHeight;

        const aiResponseText = await fetchAIResponse(userText);

        document.getElementById(typingId).remove();
        addMessageToUI('bot', aiResponseText);
        chatContext.push({ role: 'bot', text: aiResponseText });

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

// --- MENU ACTIONS (Rename & Delete) ---
function toggleMenu(event, chatId) {
    event.stopPropagation(); 
    const dropdowns = document.getElementsByClassName("chat-dropdown");
    for (let i = 0; i < dropdowns.length; i++) {
        if (dropdowns[i].id !== `dropdown-${chatId}`) {
            dropdowns[i].classList.remove('show');
        }
    }
    document.getElementById(`dropdown-${chatId}`).classList.toggle("show");
}

window.onclick = function(event) {
    if (!event.target.matches('.chat-menu-btn')) {
        const dropdowns = document.getElementsByClassName("chat-dropdown");
        for (let i = 0; i < dropdowns.length; i++) {
            dropdowns[i].classList.remove('show');
        }
    }
}

function renameChat(event, chatId, oldTitle) {
    event.stopPropagation();
    document.getElementById(`dropdown-${chatId}`).classList.remove('show'); 
    
    const newTitle = prompt("Rename chat:", oldTitle);
    if (newTitle && newTitle.trim() !== "") {
        db.collection('users').doc(currentUser.uid).collection('chats').doc(chatId).update({
            title: newTitle.trim()
        });
        if (currentChatId === chatId) {
            document.getElementById('current-chat-title').innerText = newTitle.trim();
        }
    }
}

function deleteChat(event, chatId) {
    event.stopPropagation();
    document.getElementById(`dropdown-${chatId}`).classList.remove('show'); 
    
    if (confirm("Are you sure you want to delete this conversation forever?")) {
        db.collection('users').doc(currentUser.uid).collection('chats').doc(chatId).delete();
        if (currentChatId === chatId) {
            createNewChat();
        }
    }
}