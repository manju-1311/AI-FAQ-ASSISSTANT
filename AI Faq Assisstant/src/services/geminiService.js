const { GoogleGenAI } = require('@google/genai');

// Initialize the GoogleGenAI client
// If the key is not found, we will log a warning, but won't crash until a request is made.
const getClient = () => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'your_google_gemini_api_key_here') {
    throw new Error('Gemini API key is not configured. Please add GEMINI_API_KEY to your .env file.');
  }
  return new GoogleGenAI({ apiKey });
};

const getModel = () => process.env.GEMINI_MODEL || 'gemini-3.6-flash';
const getModels = () => [...new Set([getModel(), process.env.GEMINI_FALLBACK_MODEL].filter(Boolean))];

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

const isRetryableError = (error) => {
  const status = error?.status || error?.code;
  return status === 429 || status === 500 || status === 503
    || error?.message?.includes('UNAVAILABLE');
};

const generateContentWithRetry = async (request) => {
  const maxAttempts = 3;

  for (const model of getModels()) {
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        return await getClient().models.generateContent({ ...request, model });
      } catch (error) {
        if (!isRetryableError(error) || attempt === maxAttempts) {
          if (model === getModels().at(-1) || !isRetryableError(error)) throw error;
          break;
        }

        await delay(500 * (2 ** (attempt - 1)));
      }
    }
  }
};

/**
 * Generates a concise answer for a user's question.
 * @param {string} question 
 * @returns {Promise<string>}
 */
const generateAnswer = async (question) => {
  try {
    const ai = getClient();
    const response = await generateContentWithRetry({
      model: getModel(),
      contents: `You are a helpful assistant. Provide a clear, concise, and direct answer to the following question. Do not include introductory text like "Sure, here is the answer" or markdown formatting. Just return the answer itself.

Question: ${question}`,
    });

    if (!response || !response.text) {
      throw new Error('No response text received from Gemini API');
    }

    return response.text.trim();
  } catch (error) {
    console.error('Error in geminiService.generateAnswer:', error);
    const wrappedError = new Error(`AI Answer Generation failed: ${error.message}`);
    wrappedError.status = error.status || error.code;
    throw wrappedError;
  }
};

/**
 * Generates a single FAQ question and answer pair for a topic.
 * @param {string} topic 
 * @returns {Promise<{question: string, answer: string}>}
 */
const generateFAQ = async (topic) => {
  try {
    const response = await generateContentWithRetry({
      model: getModel(),
      contents: `Generate a single frequently asked question (FAQ) and its comprehensive answer regarding the topic: "${topic}".`,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: 'OBJECT',
          properties: {
            question: { 
              type: 'STRING', 
              description: 'A clear, common question that a user would ask about the topic.' 
            },
            answer: { 
              type: 'STRING', 
              description: 'A detailed, helpful, and accurate answer explaining the question.' 
            }
          },
          required: ['question', 'answer'],
        },
      },
    });

    if (!response || !response.text) {
      throw new Error('No response received from Gemini API');
    }

    // Parse the structured JSON response
    const faqPair = JSON.parse(response.text);
    return faqPair;
  } catch (error) {
    console.error('Error in geminiService.generateFAQ:', error);
    const wrappedError = new Error(`AI FAQ Generation failed: ${error.message}`);
    wrappedError.status = error.status || error.code;
    throw wrappedError;
  }
};

module.exports = {
  generateAnswer,
  generateFAQ,
};
