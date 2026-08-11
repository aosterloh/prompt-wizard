/**
 * Mobile Player Controller Client Logic
 */
const socket = io();

// Extract Room Code from URL query param (e.g. /player?room=K9X2)
const urlParams = new URLSearchParams(window.location.search);
const roomCode = (urlParams.get("room") || "WIZARD").toUpperCase();

// DOM Elements
const playerTimer = document.getElementById("playerTimer");
const playerBadgeName = document.getElementById("playerBadgeName");
const playerRoomBadge = document.getElementById("playerRoomBadge");
const toastAlert = document.getElementById("toastAlert");

if (playerRoomBadge) {
  playerRoomBadge.textContent = `ROOM: #${roomCode}`;
}

const mobilePromptTimer = document.getElementById("mobilePromptTimer");
const mobileProminentBox = document.getElementById("mobileProminentBox");

const viewJoin = document.getElementById("viewJoin");
const viewLobby = document.getElementById("viewLobby");
const viewPrompting = document.getElementById("viewPrompting");
const viewGenerating = document.getElementById("viewGenerating");
const viewVoting = document.getElementById("viewVoting");
const viewResults = document.getElementById("viewResults");

const btnJoin = document.getElementById("btnJoin");
const welcomeName = document.getElementById("welcomeName");

const promptInput = document.getElementById("promptInput");
const wordCountBadge = document.getElementById("wordCountBadge");
const btnSubmitPrompt = document.getElementById("btnSubmitPrompt");
const submittedNotice = document.getElementById("submittedNotice");

const voteButtonsGrid = document.getElementById("voteButtonsGrid");
const voteRecordedNotice = document.getElementById("voteRecordedNotice");

let myPlayerId = null;
let myPlayerName = "";
let hasSubmittedPrompt = false;
let myVote = null;

// Socket Listeners
socket.on("connect", () => {
  console.log(`Connected to Wizard server for Room #${roomCode}`);
  // Auto-join room on connection so host detects players immediately
  socket.emit("player:join", { roomCode });
});

socket.on("player:error", (msg) => {
  showToast(msg);
});

// Joined Success handler
socket.on("player:joinedSuccess", ({ playerId, name, number, roomCode: joinedRoom }) => {
  myPlayerId = playerId;
  myPlayerName = name;
  playerBadgeName.textContent = `${name} • #${joinedRoom || roomCode}`;
  welcomeName.textContent = `You are ${name}!`;
  switchView(viewLobby);
});

socket.on("room:timerUpdate", ({ timer }) => {
  playerTimer.textContent = timer > 0 ? `${timer}s` : "--s";
  if (mobilePromptTimer) {
    mobilePromptTimer.textContent = timer > 0 ? timer : "0";
  }

  if (mobileProminentBox) {
    if (timer > 0 && timer <= 10) {
      mobileProminentBox.classList.add("urgent-mobile");
    } else {
      mobileProminentBox.classList.remove("urgent-mobile");
    }
  }

  if (promptInput) {
    if (timer > 0 && timer <= 10) {
      promptInput.classList.add("urgent-prompt-border");
    } else {
      promptInput.classList.remove("urgent-prompt-border");
    }
  }
});

socket.on("room:stateUpdate", (data) => {
  const { gameState, generatedArtworks } = data;

  if (gameState === "LOBBY") {
    switchView(viewLobby);
  } else if (gameState === "PROMPTING") {
    switchView(viewPrompting);
    if (!hasSubmittedPrompt) {
      btnSubmitPrompt.disabled = false;
      promptInput.disabled = false;
      submittedNotice.classList.add("hidden");
    }
  } else if (gameState === "GENERATING") {
    switchView(viewGenerating);
  } else if (gameState === "VOTING") {
    switchView(viewVoting);
    renderVoteButtons(generatedArtworks);
  } else if (gameState === "RESULTS") {
    switchView(viewResults);
  }
});

socket.on("player:voteRecorded", ({ letter }) => {
  myVote = letter;
  voteRecordedNotice.classList.remove("hidden");
  showToast(`Vote for Choice ${letter} recorded!`);
});

// UI Event Listeners with roomCode payload
btnJoin.addEventListener("click", () => {
  socket.emit("player:join", { roomCode });
});

promptInput.addEventListener("input", () => {
  const text = promptInput.value;
  const words = text.trim().split(/\s+/).filter(Boolean);

  if (words.length < 3) {
    wordCountBadge.textContent = `${words.length} / 3 Min Words`;
    wordCountBadge.style.color = "var(--g-red)";
    btnSubmitPrompt.disabled = true;
  } else {
    wordCountBadge.textContent = `✓ ${words.length} Words`;
    wordCountBadge.style.color = "var(--g-green)";
    btnSubmitPrompt.disabled = false;
  }

  socket.emit("player:updatePrompt", { roomCode, promptText: text });
});

btnSubmitPrompt.addEventListener("click", () => {
  const text = promptInput.value.trim();
  const words = text.split(/\s+/).filter(Boolean);

  if (words.length < 3) {
    showToast("⚠️ Prompt must contain at least 3 words!");
    return;
  }

  hasSubmittedPrompt = true;
  btnSubmitPrompt.disabled = true;
  promptInput.disabled = true;
  submittedNotice.classList.remove("hidden");

  socket.emit("player:submitPrompt", { roomCode, promptText: text });
});

// Switch Active View
function switchView(targetView) {
  [viewJoin, viewLobby, viewPrompting, viewGenerating, viewVoting, viewResults].forEach(v => v.classList.remove("active"));
  targetView.classList.add("active");
}

// Render Voting Buttons A-E
function renderVoteButtons(artworks) {
  const safeArtworks = (artworks || []).filter(a => a.safe && a.letter);

  if (safeArtworks.length === 0) {
    voteButtonsGrid.innerHTML = `<p style="color: var(--text-muted);">No artwork available to vote on.</p>`;
    return;
  }

  voteButtonsGrid.innerHTML = safeArtworks.map(art => `
    <button class="btn-vote ${myVote === art.letter ? 'selected' : ''}" data-letter="${art.letter}">
      ${art.letter}
    </button>
  `).join("");

  document.querySelectorAll(".btn-vote").forEach(btn => {
    btn.addEventListener("click", () => {
      const letter = btn.getAttribute("data-letter");
      document.querySelectorAll(".btn-vote").forEach(b => b.classList.remove("selected"));
      btn.classList.add("selected");
      socket.emit("player:vote", { roomCode, letter });
    });
  });
}

// Show Toast Alert
function showToast(msg) {
  toastAlert.textContent = msg;
  toastAlert.classList.remove("hidden");
  setTimeout(() => {
    toastAlert.classList.add("hidden");
  }, 3500);
}
