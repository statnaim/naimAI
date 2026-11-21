const API = "/api";
let currentChatId = null;
let busy = false;

const $ = id => document.getElementById(id);
const chatList = $("chatList");
const messages = $("messages");
const welcome = $("welcome");
const input = $("messageInput");
const sendBtn = $("sendBtn");
const chatArea = $("chatArea");

async function request(url, options = {}) {
  const response = await fetch(API + url, {
    ...options,
    headers: { "Content-Type": "application/json", ...options.headers }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Request failed");
  return data;
}

function toast(message) {
  const el = $("toast");
  el.textContent = message;
  el.classList.add("show");
  window.setTimeout(() => el.classList.remove("show"), 2800);
}

function scrollBottom() {
  chatArea.scrollTop = chatArea.scrollHeight;
}

function addMessage(role, content, className = "") {
  welcome.style.display = "none";
  const wrapper = document.createElement("div");
  wrapper.className = `message ${role} ${className}`.trim();

  const avatar = document.createElement("div");
  avatar.className = "message-avatar";
  avatar.textContent = role === "user" ? "N" : "AI";

  const body = document.createElement("div");
  body.className = "message-content";
  // Use textContent so model output is never interpreted as executable HTML.
  body.textContent = content;

  wrapper.append(avatar, body);
  messages.appendChild(wrapper);
  scrollBottom();
  return wrapper;
}

function clearMessages() {
  messages.replaceChildren();
  welcome.style.display = "block";
}

async function loadChats() {
  const chats = await request("/chats");
  chatList.replaceChildren();

  chats.forEach(chat => {
    const item = document.createElement("div");
    item.className = "history-item" + (chat.id === currentChatId ? " active" : "");

    const name = document.createElement("span");
    name.className = "history-name";
    name.textContent = chat.title;
    name.addEventListener("click", () => openChat(chat.id));

    const del = document.createElement("button");
    del.className = "delete-chat";
    del.type = "button";
    del.textContent = "×";
    del.title = "Delete chat";
    del.setAttribute("aria-label", `Delete ${chat.title}`);
    del.addEventListener("click", async event => {
      event.stopPropagation();
      if (!window.confirm("Delete this conversation?")) return;
      try {
        await request(`/chats/${chat.id}`, { method: "DELETE" });
        if (currentChatId === chat.id) {
          currentChatId = null;
          clearMessages();
        }
        await loadChats();
        if (!currentChatId && chats.length > 1) {
          const remaining = chats.find(c => c.id !== chat.id);
          if (remaining) await openChat(remaining.id);
        }
      } catch (error) {
        toast(error.message);
      }
    });

    item.append(name, del);
    chatList.appendChild(item);
  });
}

async function newChat() {
  try {
    const chat = await request("/chats", {
      method: "POST",
      body: JSON.stringify({})
    });
    currentChatId = chat.id;
    clearMessages();
    await loadChats();
    closeSidebar();
    input.focus();
  } catch (error) {
    toast(error.message);
  }
}

async function openChat(id) {
  try {
    currentChatId = id;
    clearMessages();
    const history = await request(`/chats/${encodeURIComponent(id)}/messages`);
    history.forEach(message => addMessage(message.role, message.content));
    if (!history.length) welcome.style.display = "block";
    await loadChats();
    closeSidebar();
  } catch (error) {
    toast(error.message);
  }
}

async function sendMessage(text) {
  if (busy || !text.trim()) return;
  if (!currentChatId) await newChat();
  if (!currentChatId) return;

  busy = true;
  sendBtn.disabled = true;
  addMessage("user", text);
  const typing = addMessage("assistant", "Naim AI is thinking...", "typing");

  try {
    const data = await request("/chat", {
      method: "POST",
      body: JSON.stringify({ chatId: currentChatId, message: text })
    });
    typing.remove();
    addMessage("assistant", data.answer);
    await loadChats();
  } catch (error) {
    typing.remove();
    addMessage("assistant", `Sorry, ${error.message}`);
  } finally {
    busy = false;
    sendBtn.disabled = false;
    input.focus();
  }
}

$("chatForm").addEventListener("submit", async event => {
  event.preventDefault();
  const text = input.value.trim();
  if (!text || busy) return;
  input.value = "";
  input.style.height = "auto";
  await sendMessage(text);
});

input.addEventListener("keydown", event => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    $("chatForm").requestSubmit();
  }
});

input.addEventListener("input", () => {
  input.style.height = "auto";
  input.style.height = `${Math.min(input.scrollHeight, 160)}px`;
});

document.querySelectorAll(".suggestion").forEach(button => {
  button.addEventListener("click", () => {
    input.value = button.dataset.prompt || "";
    $("chatForm").requestSubmit();
  });
});

$("newChat").addEventListener("click", newChat);
$("menuBtn").addEventListener("click", () => $("sidebar").classList.add("open"));
$("closeSidebar").addEventListener("click", closeSidebar);

function closeSidebar() {
  $("sidebar").classList.remove("open");
}

$("themeBtn").addEventListener("click", () => {
  document.body.classList.toggle("dark");
  localStorage.setItem("naim-theme",
    document.body.classList.contains("dark") ? "dark" : "light");
});

if (localStorage.getItem("naim-theme") === "dark") {
  document.body.classList.add("dark");
}

async function loadMemories() {
  const memories = await request("/memories");
  const container = $("savedMemories");
  container.replaceChildren();

  if (!memories.length) {
    container.textContent = "No saved memories yet.";
    return;
  }

  memories.forEach(memory => {
    const item = document.createElement("div");
    item.className = "memory-item";
    const content = document.createElement("span");
    content.textContent = memory.content;

    const del = document.createElement("button");
    del.type = "button";
    del.textContent = "×";
    del.setAttribute("aria-label", "Delete memory");
    del.addEventListener("click", async () => {
      try {
        await request(`/memories/${memory.id}`, { method: "DELETE" });
        await loadMemories();
        toast("Memory deleted");
      } catch (error) {
        toast(error.message);
      }
    });

    item.append(content, del);
    container.appendChild(item);
  });
}

$("memoryBtn").addEventListener("click", async () => {
  $("memoryModal").classList.add("show");
  try {
    await loadMemories();
  } catch (error) {
    toast(error.message);
  }
});

$("closeMemory").addEventListener("click", () =>
  $("memoryModal").classList.remove("show")
);

$("memoryModal").addEventListener("click", event => {
  if (event.target === $("memoryModal")) {
    $("memoryModal").classList.remove("show");
  }
});

$("memoryForm").addEventListener("submit", async event => {
  event.preventDefault();
  const content = $("memoryInput").value.trim();
  if (!content) return;

  try {
    await request("/memories", {
      method: "POST",
      body: JSON.stringify({ content })
    });
    $("memoryInput").value = "";
    await loadMemories();
    toast("Memory saved!");
  } catch (error) {
    toast(error.message);
  }
});

async function init() {
  try {
    await request("/health");
    const chats = await request("/chats");
    if (chats.length) await openChat(chats[0].id);
    else await newChat();
  } catch (error) {
    console.error(error);
    toast("Cannot connect. Check server and API configuration.");
  }
}

init();
