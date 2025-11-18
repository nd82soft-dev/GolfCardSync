// This function securely calls the Gemini API for structured scorecard analysis.

// NOTE: The API key must be set as an environment variable in your Vercel project settings.
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent';

// --- JSON Schema for Structured Output ---
// This schema guides the model to return a predictable, parseable JSON object.
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const API_KEY = process.env.GEMINI_API_KEY;
  if (!API_KEY) {
    console.error('GEMINI_API_KEY environment variable is not set.');
    return res.status(500).json({ error: 'Server configuration error: API key is missing.' });
  }

  const { imageData, mimeType } = req.body;
  };

  try {
    const geminiResponse = await fetch(`${GEMINI_API_URL}?key=${API_KEY}`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json' 
      },
      body: JSON.stringify(payload)
    });

    if (!geminiResponse.ok) {
      const errorText = await geminiResponse.text();
      console.error(`Gemini API Error (${geminiResponse.status}):`, errorText);
      try {
        const errorJson = JSON.parse(errorText);
        const detail = errorJson.error?.message || errorText;
        return res.status(geminiResponse.status).json({ error: `Gemini API call failed: ${detail}` });
      } catch (e) {
        return res.status(geminiResponse.status).json({ error: `Gemini API call failed with status ${geminiResponse.status}`, detail: errorText });
      }
    }

    const result = await geminiResponse.json();

    // Check for prompt blocking first (e.g., safety reasons on the input image)
    if (result.promptFeedback?.blockReason) {
        console.error('Gemini request blocked:', result.promptFeedback);
        return res.status(400).json({ error: `Request blocked due to ${result.promptFeedback.blockReason}. Your image may have been flagged.` });
    }

    const candidate = result.candidates?.[0];
    if (!candidate) {
        console.error('No candidates returned from Gemini:', result);
        return res.status(500).json({ error: 'Model returned an empty response.' });
    }

    // Check for other finish reasons like SAFETY on the output
    if (candidate.finishReason && candidate.finishReason !== 'STOP') {
        console.error('Gemini response finished with reason:', candidate.finishReason, candidate.safetyRatings);
        return res.status(500).json({ error: `Model stopped generating for reason: ${candidate.finishReason}.` });
    }

    const rawText = candidate.content?.parts?.[0]?.text;
    if (!rawText) {
        console.error('Model response content is empty or malformed:', candidate);
        return res.status(500).json({ error: 'Model response was empty or malformed.' });
    }

    let parsedData;
    try {
        // Even with `application/json` type, cleaning markdown is a robust fallback.
        const cleanedText = rawText.replace(/^```json\s*/, '').replace(/```$/, '');
        parsedData = JSON.parse(cleanedText);
    } catch (parseError) {
        console.error('Failed to parse JSON from model response:', parseError);
        console.error('Raw text from model was:', rawText);
        return res.status(500).json({ error: 'Failed to parse scorecard data from AI response.' });
    }

    // Success: Return the parsed, structured data to the client
    return res.status(200).json(parsedData);

  } catch (error) {
    console.error('Server processing error:', error);
    return res.status(500).json({ error: `An unexpected server error occurred: ${error.message}` });
  }
}
