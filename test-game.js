import { io } from "socket.io-client";

const SERVER_URL = "http://localhost:3000";

console.log("🧪 Testing Parallel Independent Multi-Room Game Sessions...");

const room1Code = "RM01";
const room2Code = "RM02";

async function runRoomTest(roomCode) {
  return new Promise((resolve, reject) => {
    console.log(`[Room #${roomCode}] Initializing host socket...`);
    const hostSocket = io(SERVER_URL);
    let p1Socket = null;
    let p2Socket = null;
    let currentPhase = null;

    hostSocket.on("connect", () => {
      console.log(`[Room #${roomCode}] ✅ Host connected`);
      hostSocket.emit("host:register", { roomCode });

      setTimeout(() => {
        p1Socket = io(SERVER_URL);
        p2Socket = io(SERVER_URL);

        p1Socket.on("connect", () => p1Socket.emit("player:join", { roomCode }));
        p2Socket.on("connect", () => p2Socket.emit("player:join", { roomCode }));
      }, 300);
    });

    hostSocket.on("room:stateUpdate", (state) => {
      if (currentPhase !== state.gameState) {
        currentPhase = state.gameState;
        console.log(`[Room #${roomCode}] 📡 Phase: ${state.gameState} | Players: ${state.players.length} | Artworks: ${state.generatedArtworks.length}`);
      }

      if (state.gameState === "LOBBY" && state.players.length === 2 && !state.gameStarted) {
        state.gameStarted = true;
        console.log(`[Room #${roomCode}] 🚀 2 Players registered! Starting game...`);
        setTimeout(() => hostSocket.emit("host:startGame", { roomCode }), 400);
      }

      if (state.gameState === "PROMPTING" && !state.promptSubmitted) {
        state.promptSubmitted = true;
        console.log(`[Room #${roomCode}] ✍️ Submitting prompts...`);
        setTimeout(() => {
          if (p1Socket) p1Socket.emit("player:submitPrompt", { roomCode, promptText: `Neon wizard casting spell in ${roomCode}` });
          if (p2Socket) p2Socket.emit("player:submitPrompt", { roomCode, promptText: `Gold dragon sitting on obsidian in ${roomCode}` });
        }, 500);
      }

      if (state.gameState === "VOTING" && !state.votesSubmitted) {
        state.votesSubmitted = true;
        console.log(`[Room #${roomCode}] 🗳️ Artworks generated: ${state.generatedArtworks.length}`);
        const safeChoice = state.generatedArtworks.find(a => a.safe && a.letter);
        if (safeChoice) {
          if (p1Socket) p1Socket.emit("player:vote", { roomCode, letter: safeChoice.letter });
          if (p2Socket) p2Socket.emit("player:vote", { roomCode, letter: safeChoice.letter });
        }
      }

      if (state.gameState === "RESULTS") {
        console.log(`[Room #${roomCode}] 🏆 Game Finished! Winners:`, state.winningArtworks.map(w => w.playerName));
        hostSocket.close();
        if (p1Socket) p1Socket.close();
        if (p2Socket) p2Socket.close();
        resolve(true);
      }
    });

    setTimeout(() => {
      reject(new Error(`Timeout on room #${roomCode}`));
    }, 25000);
  });
}

async function testParallelRooms() {
  try {
    const res = await Promise.all([
      runRoomTest(room1Code),
      runRoomTest(room2Code)
    ]);
    console.log("🎉 PARALLEL MULTI-ROOM TESTS PASSED SUCCESSFULLY!");
    process.exit(0);
  } catch (err) {
    console.error("❌ Multi-room test failed:", err.message);
    process.exit(1);
  }
}

testParallelRooms();
