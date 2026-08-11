import express from "express";
import http from "http";
import { Server } from "socket.io";
import QRCode from "qrcode";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import {
  getLocalImages,
  pickStartShowcaseImage,
  pickGameTargetImage,
  checkPromptSafety,
  generateRealAIArt
} from "./public/js/imageGenerator.js";
import { optimizeLargeImages } from "./optimizeImages.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" }
});

const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, "public")));
app.use(express.json());

// In-Memory Multi-Room Store
const roomsMap = new Map();

// Helper to generate a unique 4-character Room Code
function generateRoomCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 4; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// Get existing room or create a fresh room instance
function getOrCreateRoom(code) {
  const cleanCode = (code || "WIZARD").toUpperCase().trim();
  if (!roomsMap.has(cleanCode)) {
    const initialShowcaseImg = pickStartShowcaseImage();
    roomsMap.set(cleanCode, {
      roomCode: cleanCode,
      gameState: "LOBBY",
      startShowcaseImage: initialShowcaseImg,
      currentTargetImage: null,
      players: [],
      timer: 0,
      generatedArtworks: [],
      winningArtworks: [],
      hostSocketId: null,
      playerCounter: 0,
      timerInterval: null,
      genProgressPct: 0,
      genCompletedCount: 0,
      genTotalCount: 5
    });
  }
  return roomsMap.get(cleanCode);
}

// HTTP Routes
app.get("/", (req, res) => res.redirect("/host"));

// Host route: auto-generates a unique room URL if none is provided
app.get("/host", (req, res) => {
  let room = req.query.room;
  if (!room) {
    let newCode = generateRoomCode();
    while (roomsMap.has(newCode)) {
      newCode = generateRoomCode();
    }
    return res.redirect(`/host?room=${newCode}`);
  }
  res.sendFile(path.join(__dirname, "public", "host.html"));
});

// Player route: auto-redirects to a unique room URL matching the active session
app.get("/player", (req, res) => {
  let room = req.query.room;
  if (!room) {
    let activeRooms = Array.from(roomsMap.keys());
    let code = activeRooms.length > 0 ? activeRooms[0] : generateRoomCode();
    return res.redirect(`/player?room=${code}`);
  }
  res.sendFile(path.join(__dirname, "public", "player.html"));
});

app.get("/join", (req, res) => res.redirect("/player"));

// Dynamic QR Code Generator for specific Room Code
app.get("/api/qr", async (req, res) => {
  const code = (req.query.room || "WIZARD").toUpperCase();
  const referer = req.headers.referer || "";
  let playerUrl;
  if (referer) {
    try {
      const refUrl = new URL(referer);
      refUrl.pathname = refUrl.pathname.replace(/\/host(\.html)?$/i, "/player");
      refUrl.searchParams.set("room", code);
      playerUrl = refUrl.href;
    } catch (e) {}
  }
  if (!playerUrl) {
    const hostHeader = req.headers.host || `localhost:${PORT}`;
    const protocol = req.headers["x-forwarded-proto"] || "http";
    playerUrl = `${protocol}://${hostHeader}/player?room=${code}`;
  }

  try {
    const qrUri = await QRCode.toDataURL(playerUrl, {
      margin: 1,
      width: 400,
      color: { dark: "#000000", light: "#ffffff" }
    });
    res.json({ qrUri, playerUrl, roomCode: code });
  } catch (err) {
    console.error("QR Code Error:", err);
    res.status(500).json({ error: "Failed to generate QR code" });
  }
});

// Broadcast Room State to all clients in a specific Room
function broadcastState(roomCode) {
  const room = roomsMap.get(roomCode);
  if (!room) return;

  io.to(roomCode).emit("room:stateUpdate", {
    gameState: room.gameState,
    roomCode: room.roomCode,
    startShowcaseImage: room.startShowcaseImage,
    allLocalImages: getLocalImages(),
    currentTargetImage: room.currentTargetImage,
    players: room.players.map(p => ({
      id: p.id,
      name: p.name,
      number: p.number,
      isSubmitted: p.isSubmitted,
      wordCount: p.wordCount,
      hasVoted: !!p.vote,
      isSafetyBlocked: p.isSafetyBlocked,
      isSimulated: !!p.isSimulated
    })),
    timer: room.timer,
    generatedArtworks: room.gameState === "VOTING" || room.gameState === "RESULTS" 
      ? room.generatedArtworks.map(art => ({
          letter: art.letter,
          imageUri: art.imageUri,
          safe: art.safe,
          safetyReason: art.safetyReason,
          playerName: room.gameState === "RESULTS" ? art.playerName : "Anonymous Wizard",
          promptText: room.gameState === "RESULTS" ? art.promptText : null,
          votesCount: room.gameState === "RESULTS" ? art.votesCount : 0
        }))
      : [],
    winningArtworks: room.winningArtworks,
    aiJudgeResult: room.aiJudgeResult,
    genProgressPct: room.genProgressPct || 0,
    genCompletedCount: room.genCompletedCount || 0,
    genTotalCount: room.genTotalCount || 5
  });
}

function clearTimer(room) {
  if (room && room.timerInterval) {
    clearInterval(room.timerInterval);
    room.timerInterval = null;
  }
}

function startTimer(room, seconds, onComplete) {
  clearTimer(room);
  room.timer = seconds;
  broadcastState(room.roomCode);

  room.timerInterval = setInterval(() => {
    room.timer--;
    io.to(room.roomCode).emit("room:timerUpdate", { timer: room.timer });

    if (room.timer <= 0) {
      clearTimer(room);
      if (onComplete) onComplete();
    }
  }, 1000);
}

function transitionToPrompting(room) {
  room.currentTargetImage = pickGameTargetImage(room.startShowcaseImage);
  room.gameState = "PROMPTING";

  room.players.forEach(p => {
    p.prompt = "";
    p.wordCount = 0;
    p.isSubmitted = false;
    p.vote = null;
    p.isSafetyBlocked = false;
  });
  room.generatedArtworks = [];
  room.winningArtworks = [];

  startTimer(room, 60, () => {
    transitionToGenerating(room);
  });
}

function generateNoPromptPlaceholderSVG() {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
    <rect width="512" height="512" fill="#1e1b4b" rx="24"/>
    <rect x="20" y="20" width="472" height="472" fill="none" stroke="#4338ca" stroke-width="4" stroke-dasharray="12 8" rx="16"/>
    <text x="256" y="220" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="40" font-weight="900" fill="#f43f5e" text-anchor="middle">⚠️ NO PROMPT</text>
    <text x="256" y="280" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="30" font-weight="700" fill="#ffffff" text-anchor="middle">No prompt submitted</text>
    <text x="256" y="340" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="18" font-weight="600" fill="#94a3b8" text-anchor="middle">(Wizard missed the deadline)</text>
  </svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

async function transitionToGenerating(room) {
  clearTimer(room);
  room.gameState = "GENERATING";
  room.timer = 0; // Untimed generation phase
  room.genProgressPct = 0;
  room.genCompletedCount = 0;
  room.genTotalCount = room.players.length || 1;
  broadcastState(room.roomCode);

  const availableLetters = ["A", "B", "C", "D", "E"];
  const generatedArtworks = [];

  for (let idx = 0; idx < room.players.length; idx++) {
    const player = room.players[idx];

    // Auto-use last entered prompt text even if user did not click submit before 60s timer ran out
    let promptText = (player.prompt || "").trim();
    if (!promptText) {
      promptText = "A magical glowing wizard cat creating artwork, vibrant digital art";
    }
    const words = promptText.split(/\s+/).filter(Boolean);

    const safetyCheck = checkPromptSafety(promptText);
    if (!safetyCheck.safe) {
      player.isSafetyBlocked = true;
      generatedArtworks.push({
        letter: null,
        playerId: player.id,
        playerName: player.name,
        promptText: promptText,
        imageUri: null,
        safe: false,
        safetyReason: safetyCheck.reason,
        votesCount: 0,
        aiScore: 0
      });
    } else {
      let result = null;
      try {
        if (player.pendingGenPromise) {
          console.log(`⚡ [Eager Generation - Room ${room.roomCode}] Awaiting pre-generated artwork for ${player.name}...`);
          result = await player.pendingGenPromise;
        } else {
          console.log(`🎨 [Room ${room.roomCode}] Generating live AI image for ${player.name}: "${promptText}"...`);
          result = await generateRealAIArt(promptText, 512, 512);
        }
      } catch (err) {
        console.error(`Live render error for player ${player.name}:`, err);
        result = { success: false, uri: null, reason: err.message };
      }

      if (result && result.success) {
        generatedArtworks.push({
          letter: null,
          playerId: player.id,
          playerName: player.name,
          promptText: promptText,
          imageUri: result.uri,
          safe: true,
          safetyReason: null,
          votesCount: 0,
          aiScore: 0
        });
      } else {
        generatedArtworks.push({
          letter: null,
          playerId: player.id,
          playerName: player.name,
          promptText: promptText,
          imageUri: (result && result.uri) ? result.uri : generateProceduralArt(promptText, "GameArt"),
          safe: true,
          safetyReason: null,
          votesCount: 0,
          aiScore: 0
        });
      }
    }

    room.genCompletedCount = idx + 1;
    room.genProgressPct = Math.round(((idx + 1) / room.players.length) * 100);
    broadcastState(room.roomCode);
  }

  // Randomize voting display order
  generatedArtworks.sort(() => Math.random() - 0.5);

  // Assign letters A, B, C, D, E
  let assignIdx = 0;
  generatedArtworks.forEach(art => {
    if (art.safe) {
      art.letter = availableLetters[assignIdx++] || `Choice ${assignIdx + 1}`;
    }
  });

  room.generatedArtworks = generatedArtworks;

  // Run AI Similarity Scoring (0-100) & AI Judge Evaluation for all generated artworks
  console.log(`🤖 [Room ${room.roomCode}] Evaluating AI similarity scores (0-100) across all generated artworks...`);
  await evaluateAiScoresAndJudge(room);

  transitionToVoting(room);
}

function transitionToVoting(room) {
  clearTimer(room);
  room.gameState = "VOTING";
  room.timer = 0; // Untimed voting phase: waits for all players to submit votes
  broadcastState(room.roomCode);
}

// AI Judge Scoring & Evaluation Logic using Google Gemini 2.5 Flash
async function evaluateAiScoresAndJudge(room) {
  const apiKey = process.env.GEMINI_API_KEY || "";
  
  const safeArts = (room.generatedArtworks || []).filter(a => a.safe);
  if (safeArts.length === 0) return;

  const choices = safeArts.map(c => ({
    letter: c.letter,
    name: c.playerName,
    prompt: c.promptText || "artwork",
    imageUri: c.imageUri
  }));

  const contentsParts = [];

  // 1. Attach Target Benchmark Image as inlineData if available
  let targetDesc = "the Target Benchmark image shown first";
  if (room.currentTargetImage) {
    try {
      const relPath = room.currentTargetImage.replace(/^\//, "");
      const fullPath = path.join(__dirname, "public", relPath);
      if (fs.existsSync(fullPath)) {
        const fileBuffer = fs.readFileSync(fullPath);
        const mimeType = fullPath.endsWith(".png") ? "image/png" : "image/jpeg";
        contentsParts.push({
          inlineData: {
            mimeType: mimeType,
            data: fileBuffer.toString("base64")
          }
        });
      }
    } catch (err) {
      console.error("Error reading target image file for AI Judge:", err);
    }
  }

  // 2. Attach Candidates Data
  for (const choice of choices) {
    if (choice.imageUri && choice.imageUri.startsWith("data:image/")) {
      try {
        const matches = choice.imageUri.match(/^data:(image\/[a-zA-Z+]+);base64,(.+)$/);
        if (matches) {
          contentsParts.push({
            inlineData: {
              mimeType: matches[1],
              data: matches[2]
            }
          });
        }
      } catch (err) {
        console.error(`Error attaching inline image for Choice ${choice.letter}:`, err);
      }
    }
  }

  const judgePrompt = `You are the official AI Judge for the game "Are You a Prompting Wizard?".
Goal: Compare ${targetDesc} against each generated artwork submission:
${choices.map(c => `- Choice ${c.letter} (${c.name}): Prompt = "${c.prompt}"`).join("\n")}

For EVERY candidate choice (A, B, C, etc.):
Assign an AI Similarity Score from 0 to 100 based on how closely its visual art, subject matter, colors, and composition resemble ${targetDesc}.
Also identify which single Choice received the HIGHEST AI Score and provide a concise 1-2 sentence detailed explanation of why the AI selected that image.

Respond strictly in JSON format:
{
  "scores": {
    ${choices.map(c => `"${c.letter}": 85`).join(",\n    ")}
  },
  "winningLetter": "${choices[0].letter}",
  "winnerName": "${choices[0].name}",
  "reasoning": "Choice ${choices[0].letter} scored highest because its subject, colors, and composition matched ${targetDesc} best."
}`;

  contentsParts.push({ text: judgePrompt });

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: contentsParts }],
        generationConfig: { responseMimeType: "application/json" }
      })
    });

    const json = await res.json();
    if (res.ok && json.candidates && json.candidates[0].content) {
      const parsed = JSON.parse(json.candidates[0].content.parts[0].text);
      room.aiJudgeResult = parsed;

      // Assign scores to generated artworks
      if (parsed.scores) {
        room.generatedArtworks.forEach(art => {
          if (art.letter && typeof parsed.scores[art.letter] === "number") {
            art.aiScore = Math.min(100, Math.max(0, Math.round(parsed.scores[art.letter])));
          } else if (art.safe) {
            art.aiScore = Math.floor(Math.random() * 25 + 65);
          }
        });
      }
      return;
    }
  } catch (err) {
    console.error("AI Judge scoring error:", err);
  }

  // Fallback scoring if API call fails
  const fallbackScores = {};
  room.generatedArtworks.forEach(art => {
    if (art.safe && art.letter) {
      art.aiScore = Math.floor(Math.random() * 25 + 70);
      fallbackScores[art.letter] = art.aiScore;
    }
  });

  const topArt = [...room.generatedArtworks].sort((a,b) => (b.aiScore||0) - (a.aiScore||0))[0] || choices[0];
  room.aiJudgeResult = {
    winningLetter: topArt ? topArt.letter : choices[0].letter,
    winnerName: topArt ? topArt.playerName : choices[0].name,
    reasoning: `Choice ${topArt ? topArt.letter : choices[0].letter} received the top AI similarity score!`,
    scores: fallbackScores
  };
}

async function transitionToResults(room) {
  clearTimer(room);

  const voteTallies = {};
  if (Array.isArray(room.players)) {
    room.players.forEach(p => {
      if (p.vote) {
        voteTallies[p.vote] = (voteTallies[p.vote] || 0) + 1;
      }
    });
  }

  let maxVotes = -1;
  const artworks = Array.isArray(room.generatedArtworks) ? room.generatedArtworks : [];
  artworks.forEach(art => {
    art.votesCount = voteTallies[art.letter] || 0;
    if (art.safe && art.votesCount > maxVotes) {
      maxVotes = art.votesCount;
    }
  });

  if (maxVotes > 0) {
    room.winningArtworks = artworks.filter(
      art => art.safe && art.votesCount === maxVotes
    );
  } else if (artworks.length > 0) {
    const safeArts = artworks.filter(a => a.safe);
    room.winningArtworks = safeArts.length > 0 ? [safeArts[0]] : [artworks[0]];
  } else {
    room.winningArtworks = [];
  }

  // Check if there is a TIE for top votes
  const isTie = room.winningArtworks.length > 1 || maxVotes <= 0;

  if (isTie) {
    console.log(`⚖️ [Room ${room.roomCode}] TIE DETECTED! Showing intermediate TIEBREAK screen...`);
    room.gameState = "TIEBREAK";
    broadcastState(room.roomCode);

    // Pick top AI score among tied candidates to break the tie
    if (room.winningArtworks.length > 1) {
      const topTiedArt = [...room.winningArtworks].sort((a,b) => (b.aiScore||0) - (a.aiScore||0))[0];
      if (topTiedArt) {
        room.winningArtworks = [topTiedArt];
      }
    }

    // Pause briefly so users see the tiebreak transition before revealing results
    await new Promise(r => setTimeout(r, 2000));
  } else {
    room.aiJudgeResult = null;
  }

  room.gameState = "RESULTS";
  broadcastState(room.roomCode);
}

function resetGameSession(room) {
  clearTimer(room);
  room.gameState = "LOBBY";
  room.players = [];
  room.playerCounter = 0;
  room.startShowcaseImage = pickStartShowcaseImage();
  room.currentTargetImage = pickGameTargetImage(room.startShowcaseImage);
  room.generatedArtworks = [];
  room.winningArtworks = [];
  room.aiJudgeResult = null;
  broadcastState(room.roomCode);
}

// Multi-Room Socket.IO logic
io.on("connection", (socket) => {

  socket.on("host:register", ({ roomCode }) => {
    const code = (roomCode || "WIZARD").toUpperCase();
    socket.join(code);
    socket.roomCode = code;

    const room = getOrCreateRoom(code);
    room.hostSocketId = socket.id;
    broadcastState(code);
  });

  socket.on("host:rerollTarget", ({ roomCode }) => {
    const code = (roomCode || socket.roomCode || "WIZARD").toUpperCase();
    const room = roomsMap.get(code);
    if (!room || room.gameState !== "LOBBY") return;
    room.startShowcaseImage = pickStartShowcaseImage();
    broadcastState(code);
  });

  socket.on("host:startGame", ({ roomCode }) => {
    const code = (roomCode || socket.roomCode || "WIZARD").toUpperCase();
    const room = roomsMap.get(code);
    if (room && room.gameState === "LOBBY" && room.players.length >= 1) {
      transitionToPrompting(room);
    }
  });

  socket.on("host:forceStart", ({ roomCode }) => {
    const code = (roomCode || socket.roomCode || "WIZARD").toUpperCase();
    const room = roomsMap.get(code);
    if (room && room.gameState === "LOBBY" && room.players.length >= 1) {
      transitionToPrompting(room);
    }
  });

  socket.on("host:forceEndPrompting", ({ roomCode }) => {
    const code = (roomCode || socket.roomCode || "WIZARD").toUpperCase();
    const room = roomsMap.get(code);
    if (room && room.gameState === "PROMPTING") {
      transitionToGenerating(room);
    }
  });

  socket.on("host:forceEndVoting", ({ roomCode }) => {
    const code = (roomCode || socket.roomCode || "WIZARD").toUpperCase();
    const room = roomsMap.get(code);
    if (room && room.gameState === "VOTING") {
      transitionToResults(room).catch(err => console.error("Error in forceEndVoting:", err));
    }
  });

  socket.on("host:askAiJudge", ({ roomCode }) => {
    const code = (roomCode || socket.roomCode || "WIZARD").toUpperCase();
    const room = roomsMap.get(code);
    if (room) {
      runAiJudge(room);
    }
  });

  socket.on("host:resetSession", ({ roomCode }) => {
    const code = (roomCode || socket.roomCode || "WIZARD").toUpperCase();
    const room = roomsMap.get(code);
    if (room) {
      resetGameSession(room);
    }
  });

  socket.on("player:join", ({ roomCode }) => {
    const code = (roomCode || "WIZARD").toUpperCase();
    socket.join(code);
    socket.roomCode = code;

    const room = getOrCreateRoom(code);

    if (room.gameState !== "LOBBY" && room.gameState !== "PROMPTING") {
      socket.emit("player:error", "Game is currently in progress. Please wait for the next round!");
      return;
    }

    if (room.players.length >= 5) {
      socket.emit("player:error", "Room is full (Max 5 players). Please join the next round!");
      return;
    }

    let player = room.players.find(p => p.socketId === socket.id);
    if (!player) {
      room.playerCounter++;
      const assignedName = `Wizard #${room.playerCounter}`;
      player = {
        id: `p-${Date.now()}-${Math.floor(Math.random()*1000)}`,
        socketId: socket.id,
        name: assignedName,
        number: room.playerCounter,
        prompt: "",
        wordCount: 0,
        isSubmitted: false,
        vote: null,
        isSafetyBlocked: false
      };
      room.players.push(player);
    }

    socket.emit("player:joinedSuccess", { playerId: player.id, name: player.name, number: player.number, roomCode: code });
    broadcastState(code);

    // Auto-start game automatically when 5 players have joined!
    if (room.gameState === "LOBBY" && room.players.length >= 5) {
      transitionToPrompting(room);
    }
  });

  socket.on("player:updatePrompt", ({ roomCode, promptText }) => {
    const code = (roomCode || socket.roomCode || "WIZARD").toUpperCase();
    const room = roomsMap.get(code);
    if (!room || room.gameState !== "PROMPTING") return;

    const player = room.players.find(p => p.socketId === socket.id);
    if (!player) return;

    player.prompt = promptText || "";
    const words = player.prompt.trim().split(/\s+/).filter(Boolean);
    player.wordCount = words.length;
    broadcastState(code);
  });

  socket.on("player:submitPrompt", ({ roomCode, promptText, playerId }) => {
    const code = (roomCode || socket.roomCode || "WIZARD").toUpperCase();
    const room = roomsMap.get(code);
    if (!room || room.gameState !== "PROMPTING") return;

    let player = room.players.find(p => p.socketId === socket.id);
    if (!player && playerId) {
      player = room.players.find(p => p.id === playerId);
    }
    if (!player) return;

    const words = (promptText || "").trim().split(/\s+/).filter(Boolean);
    if (words.length < 2) {
      socket.emit("player:error", "⚠️ Prompt must contain at least 2 words!");
      return;
    }

    player.prompt = promptText.trim();
    player.wordCount = words.length;
    player.isSubmitted = true;

    // Eagerly start background image generation as soon as prompt is submitted!
    const safetyCheck = checkPromptSafety(player.prompt);
    if (safetyCheck.safe) {
      console.log(`⚡ [Eager Background Gen - Room ${code}] Pre-generating artwork for ${player.name}: "${player.prompt}"...`);
      player.pendingGenPromise = generateRealAIArt(player.prompt, 512, 512).catch(err => {
        console.error(`Live eager render error for ${player.name}:`, err);
        return { success: false, uri: null, reason: err.message };
      });
    }

    broadcastState(code);

    const allSubmitted = room.players.length > 0 && room.players.every(p => p.isSubmitted);
    if (allSubmitted) {
      transitionToGenerating(room);
    }
  });

  socket.on("player:vote", ({ roomCode, letter, playerId }) => {
    const code = (roomCode || socket.roomCode || "WIZARD").toUpperCase();
    const room = roomsMap.get(code);
    if (!room || room.gameState !== "VOTING") return;

    let player = room.players.find(p => p.socketId === socket.id);
    if (!player && playerId) {
      player = room.players.find(p => p.id === playerId);
    }
    if (!player) return;

    player.vote = letter;
    socket.emit("player:voteRecorded", { letter });

    // Filter active participating players who submitted a prompt this round
    const activePlayers = room.players.filter(p => p.isSubmitted || p.prompt);
    const targetGroup = activePlayers.length > 0 ? activePlayers : room.players;

    broadcastState(code);

    const allVoted = targetGroup.length > 0 && targetGroup.every(p => !!p.vote);
    if (allVoted) {
      transitionToResults(room).catch(err => console.error("Error transitioning to results:", err));
    }
  });

  socket.on("disconnect", () => {
    if (socket.roomCode) {
      const room = roomsMap.get(socket.roomCode);
      if (room && room.gameState === "LOBBY") {
        room.players = room.players.filter(p => p.socketId !== socket.id);
        broadcastState(socket.roomCode);
      }
    }
  });
});

// Start HTTP server
server.listen(PORT, () => {
  console.log(`🧙‍♂️ "Are You a Prompting Wizard?" Server running at http://localhost:${PORT}`);
  console.log(`📺 Unique Host URLs: http://localhost:${PORT}/host?room=XXXX`);
  console.log(`📱 Unique Player URLs: http://localhost:${PORT}/player?room=XXXX`);

  // Run image optimization check asynchronously in background
  optimizeLargeImages().catch(err => console.error("Background image optimization error:", err));
});
