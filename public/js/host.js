/**
 * Host Main Display JavaScript Logic
 */
const socket = io();

// Extract Room Code from URL query param (e.g. /host?room=K9X2)
const urlParams = new URLSearchParams(window.location.search);
const roomCode = (urlParams.get("room") || "WIZARD").toUpperCase();

// DOM Elements
const phaseBadge = document.getElementById("phaseBadge");
const roomCodeBadge = document.getElementById("roomCodeBadge");
const btnNewRoom = document.getElementById("btnNewRoom");

const timerValue = document.getElementById("timerValue");
const prominentCountdownBox = document.getElementById("prominentCountdownBox");
const prominentTimerValue = document.getElementById("prominentTimerValue");

const qrCodeImg = document.getElementById("qrCodeImg");
const playerJoinUrl = document.getElementById("playerJoinUrl");
const startShowcaseImg = document.getElementById("startShowcaseImg");

const playerCount = document.getElementById("playerCount");
const playerList = document.getElementById("playerList");

const btnRerollShowcase = document.getElementById("btnRerollShowcase");
const btnStartGame = document.getElementById("btnStartGame");
const btnForceEndPrompting = document.getElementById("btnForceEndPrompting");
const btnForceEndVoting = document.getElementById("btnForceEndVoting");
const btnResetSession = document.getElementById("btnResetSession");

const stageLobby = document.getElementById("stageLobby");
const stagePrompting = document.getElementById("stagePrompting");
const stageGenerating = document.getElementById("stageGenerating");
const stageVoting = document.getElementById("stageVoting");
const stageTieBreak = document.getElementById("stageTieBreak");
const stageResults = document.getElementById("stageResults");

const promptingTargetImg = document.getElementById("promptingTargetImg");
const promptProgressBar = document.getElementById("promptProgressBar");
const promptProgressText = document.getElementById("promptProgressText");

const genTargetImg = document.getElementById("genTargetImg");
const genProgressBarFill = document.getElementById("genProgressBarFill");
const genProgressPct = document.getElementById("genProgressPct");
const genProgressCount = document.getElementById("genProgressCount");
const genProgressStatusText = document.getElementById("genProgressStatusText");

const votingTargetImg = document.getElementById("votingTargetImg");
const votingGrid = document.getElementById("votingGrid");

const resultsTargetImg = document.getElementById("resultsTargetImg");
const winnerSpotlight = document.getElementById("winnerSpotlight");
const resultsGrid = document.getElementById("resultsGrid");

let currentGameState = "LOBBY";
let audioCtx = null;
let lastBeepedSec = null;

// Unlocks browser Web Audio API policy on user interaction (click/tap anywhere on host screen)
function initAudio() {
  try {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    const banner = document.getElementById("soundUnlockBanner");
    if (banner) {
      banner.textContent = "🔊 GAME AUDIO ACTIVE — 10S COUNTDOWN MUSIC & SOUND FX READY";
      banner.classList.add("unlocked");
    }
    const btnToggle = document.getElementById("btnToggleSound");
    if (btnToggle) {
      btnToggle.textContent = "🔊 Sound: ACTIVE";
    }
  } catch (e) {}
}
window.addEventListener('click', initAudio);
window.addEventListener('touchstart', initAudio);
window.addEventListener('keydown', initAudio);

// Update Room Badge Display
if (roomCodeBadge) {
  roomCodeBadge.textContent = `ROOM: #${roomCode}`;
}

// "New Game" Button opens a fresh independent room
if (btnNewRoom) {
  btnNewRoom.addEventListener("click", () => {
    window.open("/host", "_blank");
  });
}

const btnAiJudgeVoting = document.getElementById("btnAiJudgeVoting");
const btnAiJudgeResults = document.getElementById("btnAiJudgeResults");
const aiJudgeBanner = document.getElementById("aiJudgeBanner");
const aiJudgeTitle = document.getElementById("aiJudgeTitle");
const aiJudgeReasoning = document.getElementById("aiJudgeReasoning");

let latestAiJudgeResult = null;

// AI Judge Trigger Handlers
const triggerAiJudge = () => {
  if (btnAiJudgeVoting) {
    btnAiJudgeVoting.disabled = true;
    btnAiJudgeVoting.textContent = "🤖 Gemini AI Judge Thinking...";
  }
  if (btnAiJudgeResults) {
    btnAiJudgeResults.disabled = true;
    btnAiJudgeResults.textContent = "🤖 Gemini AI Judge Thinking...";
  }
  socket.emit("host:askAiJudge", { roomCode });
};

if (btnAiJudgeVoting) btnAiJudgeVoting.addEventListener("click", triggerAiJudge);
if (btnAiJudgeResults) btnAiJudgeResults.addEventListener("click", triggerAiJudge);

socket.on("room:aiJudgeResult", (result) => {
  latestAiJudgeResult = result;
  if (btnAiJudgeVoting) {
    btnAiJudgeVoting.disabled = false;
    btnAiJudgeVoting.textContent = "🤖 AI Judge (Gemini Pick)";
  }
  if (btnAiJudgeResults) {
    btnAiJudgeResults.disabled = false;
    btnAiJudgeResults.textContent = "🤖 AI Judge (Gemini Pick)";
  }

  if (aiJudgeBanner && aiJudgeTitle && aiJudgeReasoning && result) {
    aiJudgeTitle.textContent = `Choice ${result.winningLetter} (${result.winnerName})`;
    aiJudgeReasoning.textContent = result.reasoning;
    aiJudgeBanner.classList.remove("hidden");
  }

  // Re-render grids to highlight AI Judge Pick
  if (currentGameState === "VOTING") {
    renderVotingGrid(window.lastGeneratedArtworks);
  } else if (currentGameState === "RESULTS") {
    renderResultsGrid(window.lastGeneratedArtworks, window.lastWinningArtworks);
  }
});

// Register Host for specific Room Code
socket.emit("host:register", { roomCode });

// Derive exact Player Join URL from Host URL by replacing '/host' with '/player'
function getPlayerJoinUrl() {
  let currentUrl = window.location.href;
  let urlObj;
  try {
    urlObj = new URL(currentUrl);
  } catch (e) {
    urlObj = new URL(currentUrl, window.location.origin);
  }
  urlObj.pathname = urlObj.pathname.replace(/\/host(\.html)?$/i, "/player");
  if (!urlObj.searchParams.has("room")) {
    urlObj.searchParams.set("room", roomCode);
  }
  return urlObj.href;
}

// Fetch QR Code & Render URL Display
async function loadQrCode(targetCode) {
  const playerUrl = getPlayerJoinUrl();
  if (playerJoinUrl) {
    playerJoinUrl.textContent = playerUrl;
  }
  if (qrCodeImg) {
    if (typeof window.generateClientQrDataUri === 'function') {
      const clientQrDataUri = window.generateClientQrDataUri(playerUrl);
      if (clientQrDataUri) {
        qrCodeImg.src = clientQrDataUri;
      }
    }
  }
  try {
    const res = await fetch(`/api/qr?room=${encodeURIComponent(targetCode || roomCode)}`);
    const data = await res.json();
    if (data.qrUri && qrCodeImg) {
      qrCodeImg.src = data.qrUri;
    }
  } catch (err) {
    console.error("Failed to load server QR code:", err);
  }
}
loadQrCode(roomCode);

// Socket Listeners
socket.on("room:stateUpdate", (data) => {
  updateUI(data);
});

socket.on("room:timerUpdate", ({ timer }) => {
  if (currentGameState === "GENERATING") {
    if (timerValue) {
      timerValue.textContent = "--";
      timerValue.classList.remove("timer-urgent");
    }
    if (prominentTimerValue) prominentTimerValue.textContent = "--";
    return;
  }

  if (timerValue) {
    timerValue.textContent = timer > 0 ? `${timer}s` : "--";
  }
  if (prominentTimerValue) {
    prominentTimerValue.textContent = timer > 0 ? `${timer}` : "0";
  }

  if (timer > 0 && timer <= 10) {
    if (timerValue) timerValue.classList.add("timer-urgent");
    if (prominentCountdownBox) prominentCountdownBox.classList.add("urgent-prominent");
    if (currentGameState === "PROMPTING" && lastBeepedSec !== timer) {
      lastBeepedSec = timer;
      playCountdownMusic(timer);
    }
  } else {
    if (timerValue) timerValue.classList.remove("timer-urgent");
    if (prominentCountdownBox) prominentCountdownBox.classList.remove("urgent-prominent");
  }
});

let showcaseImagesList = [
  "/images/target_1.png",
  "/images/target_2.png",
  "/images/target_3.png",
  "/images/target_4.png",
  "/images/target_5.png",
  "/images/target_6.png",
  "/images/target_7.png",
  "/images/target_8.png",
  "/images/target_9.png",
  "/images/target_10.png",
  "/images/target_11.png",
  "/images/target_12.png",
  "/images/target_13.png",
  "/images/target_14.png",
  "/images/target_15.png"
];
let showcaseIndex = 0;

// Automated 2-Second Showcase Image Rotation in Lobby
setInterval(() => {
  if (currentGameState === "LOBBY" && showcaseImagesList.length > 0 && startShowcaseImg) {
    showcaseIndex = (showcaseIndex + 1) % showcaseImagesList.length;
    startShowcaseImg.src = encodeURI(showcaseImagesList[showcaseIndex]);
  }
}, 2000);

function fallbackCopyText(textToCopy) {
  const input = document.createElement("input");
  input.value = textToCopy;
  document.body.appendChild(input);
  input.select();
  try {
    document.execCommand("copy");
    if (btnCopyUrl) btnCopyUrl.textContent = "✓ Copied!";
    setTimeout(() => { if (btnCopyUrl) btnCopyUrl.textContent = "📋 Copy"; }, 2000);
  } catch (e) {
    console.error("Fallback copy error:", e);
  }
  document.body.removeChild(input);
}

// Event Listeners for Host Controls with roomCode payload
const btnCopyUrl = document.getElementById("btnCopyUrl");
if (btnCopyUrl && playerJoinUrl) {
  btnCopyUrl.addEventListener("click", () => {
    const textToCopy = playerJoinUrl.textContent;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(textToCopy).then(() => {
        btnCopyUrl.textContent = "✓ Copied!";
        setTimeout(() => { btnCopyUrl.textContent = "📋 Copy"; }, 2000);
      }).catch(err => {
        fallbackCopyText(textToCopy);
      });
    } else {
      fallbackCopyText(textToCopy);
    }
  });
}

if (btnRerollShowcase) {
  btnRerollShowcase.addEventListener("click", () => {
    if (showcaseImagesList.length > 0 && startShowcaseImg) {
      showcaseIndex = (showcaseIndex + 1) % showcaseImagesList.length;
      startShowcaseImg.src = encodeURI(showcaseImagesList[showcaseIndex]);
    } else {
      socket.emit("host:rerollTarget", { roomCode });
    }
  });
}

if (btnStartGame) {
  btnStartGame.addEventListener("click", () => {
    socket.emit("host:startGame", { roomCode });
  });
}

if (btnForceEndPrompting) {
  btnForceEndPrompting.addEventListener("click", () => {
    socket.emit("host:forceEndPrompting", { roomCode });
  });
}

if (btnForceEndVoting) {
  btnForceEndVoting.addEventListener("click", () => {
    socket.emit("host:forceEndVoting", { roomCode });
  });
}

if (btnResetSession) {
  btnResetSession.addEventListener("click", () => {
    socket.emit("host:resetSession", { roomCode });
  });
}

// Update UI
function updateUI(data) {
  const { 
    gameState, 
    startShowcaseImage, 
    allLocalImages = [],
    currentTargetImage, 
    players, 
    generatedArtworks, 
    winningArtworks,
    aiJudgeResult,
    genProgressPct = 0,
    genCompletedCount = 0,
    genTotalCount = 5
  } = data;
  currentGameState = gameState;

  if (data.roomCode) {
    loadQrCode(data.roomCode);
  }

  if (Array.isArray(allLocalImages) && allLocalImages.length > 0) {
    const filtered = allLocalImages.filter(img => /\/target.*\.png$/i.test(img));
    if (filtered.length > 0) {
      showcaseImagesList = filtered;
    }
  }

  if (aiJudgeResult) {
    latestAiJudgeResult = aiJudgeResult;
    if (aiJudgeBanner && aiJudgeTitle && aiJudgeReasoning) {
      const judgeBadge = aiJudgeBanner.querySelector(".ai-judge-badge");
      if (judgeBadge) judgeBadge.textContent = "⚖️ AI TIE-BREAKER PICK";
      aiJudgeTitle.textContent = `Choice ${aiJudgeResult.winningLetter} (${aiJudgeResult.winnerName})`;
      aiJudgeReasoning.textContent = aiJudgeResult.reasoning;
      aiJudgeBanner.classList.remove("hidden");
    }
  } else {
    latestAiJudgeResult = null;
    if (aiJudgeBanner) aiJudgeBanner.classList.add("hidden");
  }

  // Header Phase Badge
  if (phaseBadge) {
    phaseBadge.textContent = gameState;
    phaseBadge.className = `phase-badge badge-${gameState.toLowerCase()}`;
  }

  // Showcase & Target Images
  if (startShowcaseImage && startShowcaseImg && showcaseImagesList.length === 0) {
    const encodedUri = encodeURI(startShowcaseImage);
    const fullUri = new URL(encodedUri, window.location.origin).href;
    if (startShowcaseImg.src !== fullUri) {
      startShowcaseImg.src = encodedUri;
    }
  }
  if (currentTargetImage) {
    const encodedTarget = encodeURI(currentTargetImage);
    const fullTargetUrl = new URL(encodedTarget, window.location.origin).href;

    if (promptingTargetImg && promptingTargetImg.src !== fullTargetUrl) {
      promptingTargetImg.src = encodedTarget;
    }
    if (votingTargetImg && votingTargetImg.src !== fullTargetUrl) {
      votingTargetImg.src = encodedTarget;
    }
    if (resultsTargetImg && resultsTargetImg.src !== fullTargetUrl) {
      resultsTargetImg.src = encodedTarget;
    }
    if (genTargetImg && genTargetImg.src !== fullTargetUrl) {
      genTargetImg.src = encodedTarget;
    }
  }

  // Player Counter
  const count = (players && Array.isArray(players)) ? players.length : 0;
  if (playerCount) playerCount.textContent = `${count}`;

  // Start Button state (Hovering over Gallery Preview)
  if (btnStartGame) {
    btnStartGame.disabled = count < 1;
    if (count === 0) {
      btnStartGame.textContent = "Waiting for Players to Join...";
    } else {
      btnStartGame.textContent = `🚀 Start Game (${count} ${count === 1 ? 'Wizard' : 'Wizards'} Joined)`;
    }
  }

const btnToggleSound = document.getElementById("btnToggleSound");
if (btnToggleSound) {
  btnToggleSound.addEventListener("click", () => {
    initAudio();
    if (audioCtx) {
      const now = audioCtx.currentTime;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(523.25, now);
      osc.frequency.exponentialRampToValueAtTime(1046.50, now + 0.2);
      gain.gain.setValueAtTime(0.35, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(now);
      osc.stop(now + 0.25);
      btnToggleSound.textContent = "🔊 Sound: ACTIVE";
    }
  });
}

// Web Audio API Retro Arcade Game Countdown Music Synthesizer
function playCountdownMusic(secondsLeft) {
  try {
    initAudio();
    if (!audioCtx) return;

    const now = audioCtx.currentTime;

    // 1. Loud Rhythmic Sub-Bass Synth Pulse
    const bassOsc = audioCtx.createOscillator();
    const bassGain = audioCtx.createGain();
    bassOsc.type = 'sawtooth';
    const bassFreq = secondsLeft <= 3 ? 220.00 : (secondsLeft <= 5 ? 164.81 : 130.81);
    bassOsc.frequency.setValueAtTime(bassFreq, now);

    bassGain.gain.setValueAtTime(0.45, now);
    bassGain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);

    bassOsc.connect(bassGain);
    bassGain.connect(audioCtx.destination);
    bassOsc.start(now);
    bassOsc.stop(now + 0.3);

    // 2. High-Energy Arcade Warning Alarm (Square wave)
    const alarmOsc = audioCtx.createOscillator();
    const alarmGain = audioCtx.createGain();
    alarmOsc.type = 'square';
    const alarmFreq = secondsLeft <= 3 ? 880 : (secondsLeft <= 5 ? 660 : 523.25);
    alarmOsc.frequency.setValueAtTime(alarmFreq, now);

    alarmGain.gain.setValueAtTime(0.3, now);
    alarmGain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

    alarmOsc.connect(alarmGain);
    alarmGain.connect(audioCtx.destination);
    alarmOsc.start(now);
    alarmOsc.stop(now + 0.15);

    // 3. Escalating 4-Note Retro Game Arpeggio Melody
    let arpNotes;
    if (secondsLeft <= 3) {
      // Climax high-tension notes (A5, C#6, E6, A6)
      arpNotes = [880.00, 1108.73, 1318.51, 1760.00];
    } else if (secondsLeft <= 5) {
      // Medium pitch escalation (E4, G#4, B4, E5)
      arpNotes = [523.25, 659.25, 783.99, 1046.50];
    } else {
      // Starting game countdown rhythm (A4, C#5, E5, A5)
      arpNotes = [440.00, 554.37, 659.25, 880.00];
    }

    const stepDuration = secondsLeft <= 3 ? 0.05 : (secondsLeft <= 5 ? 0.07 : 0.09);

    arpNotes.forEach((freq, index) => {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now + (index * stepDuration));

      gain.gain.setValueAtTime(0.35, now + (index * stepDuration));
      gain.gain.exponentialRampToValueAtTime(0.001, now + (index * stepDuration) + 0.14);

      osc.connect(gain);
      gain.connect(audioCtx.destination);

      osc.start(now + (index * stepDuration));
      osc.stop(now + (index * stepDuration) + 0.14);
    });

  } catch (err) {
    console.error("Game countdown music error:", err);
  }
}

// Stage View Switching
  [stageLobby, stagePrompting, stageGenerating, stageVoting, stageTieBreak, stageResults].forEach(s => {
    if (s) s.classList.remove("active");
  });

  if (gameState === "LOBBY") {
    lastBeepedSec = null;
    if (stageLobby) stageLobby.classList.add("active");
  } else if (gameState === "PROMPTING") {
    if (stagePrompting) stagePrompting.classList.add("active");
    if (prominentTimerValue && typeof data.timer === "number" && data.timer >= 0) {
      prominentTimerValue.textContent = `${data.timer}`;

      // Play 10-second countdown game music theme
      if (data.timer <= 10 && data.timer > 0 && lastBeepedSec !== data.timer) {
        lastBeepedSec = data.timer;
        playCountdownMusic(data.timer);
      }
    }
    const submittedCount = players.filter(p => p.isSubmitted).length;
    const pct = players.length > 0 ? (submittedCount / players.length) * 100 : 0;
    if (promptProgressBar) promptProgressBar.style.width = `${pct}%`;
    if (promptProgressText) promptProgressText.textContent = `${submittedCount} / ${players.length} Prompts Submitted`;
  } else if (gameState === "GENERATING") {
    lastBeepedSec = null;
    if (stageGenerating) stageGenerating.classList.add("active");
    if (genProgressBarFill) genProgressBarFill.style.width = `${genProgressPct}%`;
    if (genProgressPct) genProgressPct.textContent = `${genProgressPct}% COMPLETE`;
    if (genProgressCount) genProgressCount.textContent = `${genCompletedCount} / ${genTotalCount} Artworks Generated`;
    if (genProgressStatusText) genProgressStatusText.textContent = `Synthesizing ${genTotalCount} AI Artworks using Google Nano Banana 2... (${genCompletedCount}/${genTotalCount} Complete)`;
  } else if (gameState === "VOTING") {
    if (stageVoting) stageVoting.classList.add("active");
    window.lastGeneratedArtworks = generatedArtworks;
    renderVotingGrid(generatedArtworks);
  } else if (gameState === "TIEBREAK") {
    if (stageTieBreak) stageTieBreak.classList.add("active");
  } else if (gameState === "RESULTS") {
    if (stageResults) stageResults.classList.add("active");
    window.lastGeneratedArtworks = generatedArtworks;
    window.lastWinningArtworks = winningArtworks;
    renderResultsGrid(generatedArtworks, winningArtworks, data.isTie);
  }
}

// Render Voting Grid A-E (Unbiased: pure artwork cards without AI badges or scores during voting)
function renderVotingGrid(artworks) {
  if (!artworks || artworks.length === 0) {
    votingGrid.innerHTML = `<p style="color: var(--text-muted);">No artwork submissions to vote on.</p>`;
    return;
  }

  votingGrid.innerHTML = artworks.map(art => {
    if (!art.safe) {
      return `
        <div class="art-card safety-card">
          <div style="font-size: 2rem;">🛡️</div>
          <strong style="color: var(--accent-amber); font-size: 0.9rem;">AI Safety Filter Triggered</strong>
          <p style="font-size: 0.75rem; color: var(--text-muted);">
            A player prompt triggered AI content moderation guidelines. Kept safe for live audience!
          </p>
        </div>
      `;
    }

    return `
      <div class="art-card">
        <div class="art-letter-badge">${art.letter}</div>
        <img src="${art.imageUri}" alt="Choice ${art.letter}" class="art-img" />
      </div>
    `;
  }).join("");
}

// Render Results Grid & Winner Spotlight
function renderResultsGrid(artworks, winners, isTie) {
  const hasAiReasoning = latestAiJudgeResult && latestAiJudgeResult.reasoning;

  if (winners && winners.length > 0) {
    winnerSpotlight.style.display = "flex";
    const winner = winners[0];
    const isTieWinner = isTie || (latestAiJudgeResult && latestAiJudgeResult.winningLetter === winner.letter);

    winnerSpotlight.className = `winner-spotlight ${isTieWinner ? 'tiebreaker-winner-border' : ''}`;
    winnerSpotlight.innerHTML = `
      <img src="${winner.imageUri}" class="winner-art-img ${isTieWinner ? 'tiebreaker-img-border' : ''}" alt="Winning Artwork" />
      <div class="winner-details">
        <div class="winner-crown">${isTieWinner ? '⚖️ AI TIE-BREAKER WINNER!' : '🏆 WINNER!'} (${winner.votesCount} ${winner.votesCount === 1 ? 'Vote' : 'Votes'})</div>
        <div class="winner-name">${winner.playerName}</div>
        <div class="winner-prompt-box">
          "${winner.promptText}"
        </div>
        ${hasAiReasoning ? `
          <div class="ai-explainer-box">
            🤖 <strong>AI Judge Rationale:</strong> ${latestAiJudgeResult.reasoning}
          </div>
        ` : ''}
      </div>
    `;

    if (window.confetti && !winnerSpotlight.dataset.confettiFired) {
      winnerSpotlight.dataset.confettiFired = "true";
      window.confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 }
      });
    }
  } else {
    winnerSpotlight.style.display = "none";
  }

  const maxAiScore = Math.max(...(artworks || []).map(a => a.aiScore || 0));

  resultsGrid.innerHTML = (artworks || []).map(art => {
    const isWinner = winners && winners.some(w => w.letter === art.letter);
    const isAiPick = latestAiJudgeResult && latestAiJudgeResult.winningLetter === art.letter;
    const isTopScore = art.aiScore && art.aiScore === maxAiScore && maxAiScore > 0;

    return `
      <div class="results-card ${isWinner ? (isTie ? 'tiebreaker-card-border' : 'winner-border') : ''} ${isAiPick && isTie ? 'tiebreaker-card-border' : ''}">
        <div class="results-card-header">
          <strong style="color: white; font-size: 1.1rem; font-weight: 800;">${art.playerName}</strong>
          ${isAiPick && isTie ? `<span class="ai-pick-chip-sm">⚖️ AI TIE-BREAKER</span>` : ''}
          ${typeof art.aiScore === 'number' ? `
            <span class="ai-score-badge-sm ${isTopScore ? 'highest-ai-score' : ''}">
              🎯 ${art.aiScore}/100
            </span>
          ` : ''}
          ${art.votesCount > 0 ? `
            <span class="results-vote-badge">
              ${art.votesCount} ${art.votesCount === 1 ? 'Vote' : 'Votes'}
            </span>
          ` : ''}
        </div>
        <img src="${art.imageUri}" alt="${art.playerName}" class="results-img ${(isWinner || isAiPick) && isTie ? 'tiebreaker-img-border' : ''}" />
        <div class="results-prompt-box">
          "${art.promptText || 'No prompt'}"
        </div>
      </div>
    `;
  }).join("");
}
