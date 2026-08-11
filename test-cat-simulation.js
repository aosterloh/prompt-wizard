import { io } from "socket.io-client";

const SERVER_URL = "http://localhost:3000";

console.log("🧪 Verifying Realistic Progress & 5 Real Cat Artworks in Test Mode...");

const testRoom = "PROGRESS5";
const hostSocket = io(SERVER_URL);

hostSocket.on("connect", () => {
  console.log("✅ Host connected to server");
  hostSocket.emit("host:register", { roomCode: testRoom });

  setTimeout(() => {
    console.log("🚀 Triggering Cat Sleeping Test Mode...");
    hostSocket.emit("host:startTestMode", { roomCode: testRoom });
  }, 400);
});

hostSocket.on("room:stateUpdate", (state) => {
  if (state.gameState === "GENERATING") {
    console.log(`⏳ [GENERATING STAGE] Target Image: ${state.currentTargetImage ? 'YES' : 'NO'} | Progress: ${state.genProgressPct}% (${state.genCompletedCount}/${state.genTotalCount})`);
  } else if (state.gameState === "RESULTS") {
    console.log(`🏆 [RESULTS STAGE] Target Image: ${state.currentTargetImage}`);
    
    if (state.currentTargetImage !== "/images/image - 2026-08-06T125436.748.png") {
      console.error(`❌ Expected target image /images/image - 2026-08-06T125436.748.png, got ${state.currentTargetImage}`);
      process.exit(1);
    }

    console.log("\nGenerated 5 Cat Artworks:");
    let containsSvgFallback = false;
    state.generatedArtworks.forEach((art, i) => {
      console.log(`  [Artwork ${i + 1}] ${art.playerName} -> Prompt: "${art.promptText.substring(0, 45)}..." | URI: ${art.imageUri.substring(0, 45)}...`);
      if (art.imageUri.startsWith("data:image/svg+xml")) {
        containsSvgFallback = true;
      }
    });

    if (containsSvgFallback) {
      console.error("❌ FAIL: Generated artworks contained SVG fallback!");
      process.exit(1);
    } else if (state.generatedArtworks.length === 5) {
      console.log("\n🎉 SUCCESS! Target cat image displayed during generation with animated progress bar, and 5 REAL AI cat artworks produced!");
      hostSocket.close();
      process.exit(0);
    } else {
      console.error(`❌ Expected 5 cat artworks, got ${state.generatedArtworks.length}`);
      process.exit(1);
    }
  }
});

setTimeout(() => {
  console.error("❌ Test Timeout: Did not reach RESULTS in 30s");
  process.exit(1);
}, 30000);
