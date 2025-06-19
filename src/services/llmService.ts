import axios from "axios";

export const queryLLM = async (prompt: string): Promise<any> => {
  try {
    const response = await axios.post(
      "http://localhost:11434/api/generate",
      {
        model: "llama3",
        prompt,
        stream: true,
      },
      {
        responseType: "stream",
      }
    );
    return response.data;
  } catch (error) {
    console.error("Error querying LLM:", error);
    return "An error occurred while processing your request.";
  }
};
