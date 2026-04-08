import { ElevenLabsClient, play } from "@elevenlabs/elevenlabs-js";
import "dotenv/config";

const elevenlabs = new ElevenLabsClient();
const audio = await elevenlabs.textToSpeech.convert(
  "JBFqnCBsd6RMkjVDRZzb", // "George" - browse voices at elevenlabs.io/app/voice-library
  {
    text: "The first move is what sets everything in motion.",
    modelId: "eleven_v3",
    outputFormat: "mp3_44100_128",
  },
);

await play(audio);
