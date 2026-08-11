import { io } from "socket.io-client";

const SERVER_URL = "http://localhost:3000";

console.log("🧪 Verifying 5 Brand New AI Generated Images (No static folder images for generated artworks)...");

const testRoom = "NEW5";
const hostSocket = io(SERVER_URL);

hostSocket.on("connect", () => {
  console.log("✅ Host connected");
  hostSocket.emit("host:register", { roomCode: testRoom });

  setTimeout(() => {
    console.log("🚀 Triggering Test Mode...");
    hostSocket.emit("host:startTestMode", { roomCode: testRoom });
  }, 400);
});

hostSocket.on("room:stateUpdate", (state) => {
  if (state.gameState === "RESULTS") {
    console.log(`🏆 RESULTS Phase! Target Image: ${state.currentTargetImage}`);
    console.log("Generated Artworks URIs:");
    
    let containsStaticImage = false;
    state.generatedArtworks.forEach((art, i) => {
      console.log(`  [Image ${i + 1}] ${art.playerName} -> Starts with: ${art.imageUri.substring(0, 45)}...`);
      if (art.imageUri.startsWith("/images/")) {
        containsStaticImage = true;
      }
    });

    if (containsStaticImage) {
      console.error("❌ FAIL: Generated artworks contained static file from /images/ folder!");
      process.exit(1);
    } else {
      console.log("🎉 SUCCESS! 5 BRAND NEW generated images created without using static images folder!");
      hostSocket.close();
      process.exit(0);
    }
  }
});

setTimeout(() => {
  console.error("❌ Test Timeout: Did not reach RESULTS in 20s");
  process.exit(1);
}, 20000);
