import axios from "axios";

export const queryLLM = async (prompt: string): Promise<string> => {
  try {
    const response = await axios.post("http://localhost:11434/api/generate", {
      model: "llama3",
      prompt,
      stream: false,
    });
    return response.data.response;
  } catch (error) {
    console.error("Error querying LLM:", error);
    return "An error occurred while processing your request.";
  }
};
