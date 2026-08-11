import localtunnel from "localtunnel";

(async () => {
  try {
    const tunnel = await localtunnel({ port: 3000 });
    console.log(`🌐 Public Tunnel URL: ${tunnel.url}`);
    console.log(`📺 Main Display (Host): ${tunnel.url}/host`);
    console.log(`📱 Mobile Controller (Player): ${tunnel.url}/player`);

    tunnel.on("close", () => {
      console.log("Tunnel closed");
    });
  } catch (err) {
    console.error("Tunnel error:", err);
  }
})();
