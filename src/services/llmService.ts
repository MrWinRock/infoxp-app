import axios from "axios";
import { PassThrough } from "stream";

const OLLAMA_URL = process.env.OLLAMA_URL || "http://localhost:11434";
const MODEL = process.env.LLM_MODEL || "MrWinRock/infoxp";

export const queryLLM = async (prompt: string): Promise<NodeJS.ReadableStream> => {
  try {
    const response = await axios.post(
      `${OLLAMA_URL}/api/generate`,
      {
        model: MODEL,
        prompt,
        stream: true,
      },
      {
        responseType: "stream",
        timeout: 30000
      }
    );
    return response.data as NodeJS.ReadableStream;
  } catch (error) {
    console.error("Error querying LLM:", error);
    const pt = new PassThrough();
    pt.end(JSON.stringify({ response: "[LLM unavailable] " }) + "\n");
    return pt;
  }
};