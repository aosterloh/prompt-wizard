import { io } from "socket.io-client";

const SERVER_URL = "http://localhost:3000";

console.log("🧪 Testing Direct 5-Player Parallel Test Mode...");

const testRoom = "TST5";
const hostSocket = io(SERVER_URL);

hostSocket.on("connect", () => {
  console.log("✅ Host connected");
  hostSocket.emit("host:register", { roomCode: testRoom });

  setTimeout(() => {
    console.log("🚀 Triggering 5-Player Parallel Test Mode...");
    hostSocket.emit("host:startTestMode", { roomCode: testRoom });
  }, 400);
});

hostSocket.on("room:stateUpdate", (state) => {
  console.log(`📡 State: ${state.gameState} | Players: ${state.players.length} | Target Img: ${state.currentTargetImage ? 'YES' : 'NO'} | Artworks: ${state.generatedArtworks.length}`);

  if (state.gameState === "RESULTS") {
    console.log("🏆 RESULTS Phase reached! 5 Parallel Artworks generated:");
    state.generatedArtworks.forEach(art => {
      console.log(`  - ${art.playerName} | Choice ${art.letter} | Prompt: "${art.promptText}" | Image URI: ${art.imageUri ? art.imageUri.substring(0, 30) : 'null'}...`);
    });

    if (state.generatedArtworks.length === 5 && state.currentTargetImage) {
      console.log("🎉 SUCCESS! Target image displayed and exactly 5 new parallel images generated directly to RESULTS!");
      hostSocket.close();
      process.exit(0);
    } else {
      console.error(`❌ Expected 5 artworks and target image, got ${state.generatedArtworks.length} artworks`);
      process.exit(1);
    }
  }
});

setTimeout(() => {
  console.error("❌ Test Timeout: Test mode did not reach RESULTS phase in 20s.");
  process.exit(1);
}, 20000);
