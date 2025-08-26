import axios from "axios";
import { PassThrough } from "stream";

export const queryLLM = async (prompt: string): Promise<NodeJS.ReadableStream> => {
  try {
    const response = await axios.post(
      "http://localhost:11434/api/generate",
      {
        model: "llama3.2",
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