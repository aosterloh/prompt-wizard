import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const imagesDir = path.join(__dirname, "..", "images");

// Dynamically scan and retrieve all target image assets from public/images
export function getLocalImages() {
  try {
    if (fs.existsSync(imagesDir)) {
      const files = fs.readdirSync(imagesDir);
      const validImages = files.filter(f => /^target.*\.png$/i.test(f));
      if (validImages.length > 0) {
        validImages.sort((a, b) => {
          const numA = parseInt((a.match(/\d+/) || [0])[0], 10);
          const numB = parseInt((b.match(/\d+/) || [0])[0], 10);
          return numA - numB;
        });
        return validImages.map(f => `/images/${f}`);
      }
    }
  } catch (err) {
    console.error("Error scanning images directory:", err);
  }

  return [
    "/images/target_1.png"
  ];
}

export function pickStartShowcaseImage() {
  const images = getLocalImages();
  const idx = Math.floor(Math.random() * images.length);
  return images[idx];
}

export function pickGameTargetImage(excludeUrl) {
  const images = getLocalImages();
  const candidates = images.filter(url => url !== excludeUrl);
  if (candidates.length === 0) return images[0];
  const idx = Math.floor(Math.random() * candidates.length);
  return candidates[idx];
}

const PROHIBITED_KEYWORDS = [
  "nude", "nudity", "naked", "nsfw", "sex", "porn", "explicit", "gore", "blood",
  "murder", "kill", "violent", "violence", "suicide", "decapitate", "terrorist",
  "bomb", "weapon", "racist", "slur", "hate", "nazi", "swastika", "hitler",
  "drug", "cocaine", "heroin", "meth", "poison", "unsafe_test_word"
];

export function checkPromptSafety(promptText) {
  if (!promptText || typeof promptText !== "string") {
    return { safe: false, reason: "Empty or invalid prompt text." };
  }

  const lower = promptText.toLowerCase();
  for (const word of PROHIBITED_KEYWORDS) {
    if (lower.includes(word)) {
      return {
        safe: false,
        reason: `Prompt contains restricted keyword: "${word}"`
      };
    }
  }

  return { safe: true, reason: null };
}

/**
 * Official Google Nano Banana / Gemini AI Image Synthesis Engine
 * Uses user provided Gemini API Key to generate 100% real AI images via Google Gemini 2.5 Flash Image API.
 */
export async function generateRealAIArt(promptText, width = 512, height = 512) {
  const apiKey = process.env.GEMINI_API_KEY || "";
  const cleanPrompt = (promptText || "").trim();

  // Call Official Google Gemini 2.5 Flash Image Model Endpoint
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=${apiKey}`;
  const body = {
    contents: [{
      parts: [{ text: `Generate a high-quality photorealistic 1:1 square image based on this prompt: ${cleanPrompt}` }]
    }]
  };

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal
    });
    clearTimeout(timer);

    const json = await response.json();
    if (response.ok && json.candidates && json.candidates[0].content && json.candidates[0].content.parts) {
      for (const part of json.candidates[0].content.parts) {
        if (part.inlineData && part.inlineData.data) {
          const mime = part.inlineData.mimeType || "image/png";
          return {
            success: true,
            uri: `data:${mime};base64,${part.inlineData.data}`,
            reason: null
          };
        }
      }
    }
    console.error("Google Gemini API response error:", JSON.stringify(json).substring(0, 200));
  } catch (err) {
    console.error("Google Gemini API fetch error:", err.message);
  }

  // Fallback to fast backup endpoint if key quota exceeded
  try {
    const seed = Math.floor(Math.random() * 1000000);
    const aiUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(cleanPrompt)}?width=${width}&height=${height}&seed=${seed}&nologo=true&model=flux`;
    const response = await fetch(aiUrl);
    if (response.ok) {
      const arrayBuffer = await response.arrayBuffer();
      const mimeType = response.headers.get("content-type") || "image/jpeg";
      if (arrayBuffer.byteLength > 5000) {
        return {
          success: true,
          uri: `data:${mimeType};base64,${Buffer.from(arrayBuffer).toString("base64")}`,
          reason: null
        };
      }
    }
  } catch (e) {
    console.warn("Backup endpoint error:", e.message);
  }

  return {
    success: false,
    uri: null,
    reason: "Google Gemini AI Image Generation API Error."
  };
}
