import fs from "fs";
import path from "path";
import sharp from "sharp";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5MB limit
const MAX_DIMENSION = 2048; // 2K resolution limit

export async function optimizeLargeImages() {
  const imagesDir = path.join(__dirname, "public", "images");
  if (!fs.existsSync(imagesDir)) return;

  const files = fs.readdirSync(imagesDir);
  console.log(`🔍 Checking ${files.length} images for optimization (> 5MB limit)...`);

  for (const file of files) {
    if (!file.match(/\.(png|jpg|jpeg|webp)$/i)) continue;
    const filePath = path.join(imagesDir, file);
    const stats = fs.statSync(filePath);

    if (stats.size > MAX_SIZE_BYTES) {
      const sizeMb = (stats.size / (1024 * 1024)).toFixed(2);
      console.log(`⚡ Optimizing ${file} (${sizeMb} MB -> reducing to 2K resolution)...`);
      try {
        const tempPath = filePath + ".tmp.png";
        await sharp(filePath)
          .resize(MAX_DIMENSION, MAX_DIMENSION, {
            fit: "inside",
            withoutEnlargement: true
          })
          .png({ quality: 80, compressionLevel: 8 })
          .toFile(tempPath);

        fs.renameSync(tempPath, filePath);
        const newStats = fs.statSync(filePath);
        const newSizeMb = (newStats.size / (1024 * 1024)).toFixed(2);
        console.log(`✅ ${file} compressed to ${newSizeMb} MB`);
      } catch (err) {
        console.error(`❌ Failed to optimize ${file}:`, err);
      }
    }
  }
}

// Run direct execution if called as CLI script
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  optimizeLargeImages().then(() => console.log("✨ Optimization complete."));
}
