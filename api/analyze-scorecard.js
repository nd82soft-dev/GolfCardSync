// analyze-scorecard.js
// Vercel Serverless Function: /api/analyze-scorecard
// This function securely calls the Gemini API for structured scorecard analysis.

// NOTE: The API key must be set as an environment variable in your Vercel project settings.
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent';

// Initialize Firebase Admin SDK
import admin from 'firebase-admin';

// Check if Firebase app is already initialized to prevent multiple initializations
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY,
    }),
  });
}

const db = admin.firestore();

// --- JSON Schema for Structured Output ---
// This schema guides the model to return a predictable, parseable JSON object.
const SCORECARD_SCHEMA = {
  type: "OBJECT",
  properties: {
    courseName: { type: "STRING", description: "The name of the golf course." },
    date: { type: "STRING", description: "The date the round was played (e.g., YYYY-MM-DD)." },
    players: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          name: { type: "STRING", description: "The player's name." },
          totalScore: { type: "INTEGER", description: "The player's total gross score for 18 holes (or 9 if only 9 holes are present)." },
          stats: {
            type: "ARRAY",
            description: "An array of 18 or 9 hole-by-hole statistics.",
            items: {
              type: "OBJECT",
              properties: {
                hole: { type: "INTEGER" },
                score: { type: "INTEGER", description: "The gross score on this hole." },
                fairway: { type: "STRING", description: "Fairway status: 'Hit', 'Missed Left', 'Missed Right', or 'N\\/A' (for Par 3s or unrecorded)." },
                greens: { type: "STRING", description: "GiR status: 'Hit', 'Missed Long', 'Missed Short', 'Missed Left', 'Missed Right'. Use 'Missed Long', 'Missed Short', 'Missed Left', 'Missed Right' for missed shots. Use 'N\\/A' (for unrecorded)." },
                putts: { type: "INTEGER", description: "Number of putts on this hole, -1 if not recorded." }
              },
              required: ["hole", "score"]
            }
          }
        },
        required: ["name", "totalScore", "stats"]
      }
    }
  },
  required: ["courseName", "players"]
};


/**
 * Core handler function for the Vercel Serverless route.
 * @param {object} req - Vercel request object.
 * @param {object} res - Vercel response object.
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const API_KEY = process.env.GEMINI_API_KEY;
  if (!API_KEY) {
    return res.status(500).json({ error: 'GEMINI_API_KEY environment variable is not set.' });
  }

  // Ensure Firebase environment variables are set
  if (!process.env.FIREBASE_PROJECT_ID || !process.env.FIREBASE_CLIENT_EMAIL || !process.env.FIREBASE_PRIVATE_KEY) {
    return res.status(500).json({ error: 'Firebase environment variables (FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY) are not set.' });
  }

  const { imageData, mimeType } = req.body;

  if (!imageData || !mimeType) {
    return res.status(400).json({ error: 'Missing imageData or mimeType in request body.' });
  }

  // --- Gemini API Payload Construction ---
  const systemInstruction = "You are a specialized AI designed to perform Optical Character Recognition (OCR) on golf scorecard images. Extract all specified data, including course name, date, player names, total scores, and individual hole statistics (score, fairway status, greens in regulation (GiR) status, and putts). Output the result strictly as a JSON object matching the provided schema. If a specific stat (like putts) is missing or illegible, use -1 for integers or 'N/A' for strings. Always prioritize the data for the player in the first available slot.";
  const userPrompt = "Analyze this golf scorecard image and extract all player data according to the schema. If multiple players are present, prioritize the first player listed for detailed hole-by-hole stats. Ensure all 18 or 9 holes present on the card are accounted for.";
  
  const payload = {
    contents: [
      {
        role: "user",
        parts: [
          { text: userPrompt },
          {
            inlineData: {
              mimeType: mimeType,
              data: imageData
            }
          }
        ]
      }
    ],
    systemInstruction: {
        parts: [{ text: systemInstruction }]
    },
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: SCORECARD_SCHEMA
    }
  };

  try {
    const response = await fetch(`${GEMINI_API_URL}?key=${API_KEY}`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json' 
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
        // Handle non-200 responses from the Gemini API
        const errorText = await response.text();
        console.error("Gemini API Error:", errorText);
        return res.status(response.status).json({ error: `Gemini API call failed: ${response.statusText}`, detail: errorText });
    }

    const result = await response.json();
    
    // Extract the raw JSON text from the model's response
    const jsonText = result.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!jsonText) {
        return res.status(500).json({ error: 'Model response was empty or malformed.' });
    }
    
    // Parse the JSON text into a clean JavaScript object
    const parsedData = JSON.parse(jsonText);

    // Save the parsed data to Firestore
    const docRef = await db.collection('scorecards').add(parsedData);
    console.log('Scorecard saved to Firestore with ID:', docRef.id);

    // Success: Return the parsed, structured data to the client
    return res.status(200).json({ message: 'Scorecard analyzed and saved successfully!', scorecardId: docRef.id, data: parsedData });

  } catch (error) {
    console.error('Server processing error:', error);
    // Return a generic error to the client
    return res.status(500).json({ error: `An unexpected error occurred during processing: ${error.message}` });
  }
}
