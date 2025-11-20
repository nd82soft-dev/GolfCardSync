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
          name: { type: "STRING", description: "The player's name. Extract the name that matches the provided name format configuration. If a specific name is provided in the format description, search the entire scorecard for that exact name and use it, regardless of which line it appears on. Do not simply extract the first line of text." },
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
    console.error('Missing Firebase environment variables. Project ID:', process.env.FIREBASE_PROJECT_ID);
    return res.status(500).json({ error: 'Firebase environment variables (FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY) are not set.' });
  }
  console.log('Firebase Project ID being used:', process.env.FIREBASE_PROJECT_ID);

  const { imageData, mimeType, nameFormats, extraStats } = req.body;
  const userId = req.body.userId || 'anonymous'; // Use 'anonymous' if userId is not provided

  if (!imageData || !mimeType) {
    return res.status(400).json({ error: 'Missing imageData or mimeType in request body.' });
  }

  // Build system instruction based on name format configurations
  let nameFormatInstruction = '';
  if (nameFormats && Object.keys(nameFormats).length > 0) {
    const formatDescriptions = Object.entries(nameFormats)
      .filter(([key, value]) => value && value.trim().length > 0)
      .map(([key, value]) => {
        let label = '';
        let positionHint = '';
        if (key === 'blankFirst') {
          label = 'Name 1';
          positionHint = ' (typically on the second line, as the first line is blank)';
        } else if (key === 'firstOnly') {
          label = 'Name 2';
          positionHint = ' (first name only format)';
        } else {
          label = 'Name 3';
          positionHint = ' (first and last name format)';
        }
        return `- ${label}${positionHint}: "${value}"`;
      })
      .join('\\n');
    
    if (formatDescriptions) {
      nameFormatInstruction = `CRITICAL - Player Name Identification Instructions:\\n${formatDescriptions}\\n\\nMANDATORY EXTRACTION RULES:\\n1. If a format description contains a SPECIFIC NAME (e.g., "Nick", "John", "Mike"), you MUST search the ENTIRE scorecard for that exact name and extract it, regardless of which line it appears on.\\n2. DO NOT simply extract the first line of text you see. The name may appear on line 2, line 3, or elsewhere on the scorecard.\\n3. For "Name 1" format: If the description says the first line is blank, the player name will be on the second line. If a specific name is provided (like "Nick"), search for "Nick" anywhere on the scorecard and extract it.\\n4. For "Name 2" format: Look for a first name only (e.g., "John" not "John Smith"). If a specific name is provided, search for that exact name.\\n5. For "Name 3" format: Look for a full name (e.g., "John Smith"). If a specific name is provided, search for that exact name.\\n6. PRIORITY: If a specific name is provided in any format description, that name takes ABSOLUTE PRIORITY over any other text on the scorecard. Search the entire scorecard for that name and use it.\\n7. The player name field in the JSON must contain the actual player name found on the scorecard that matches the format description, NOT just the first line of text.\\n8. If you cannot find the specified name on the scorecard, then and only then should you extract the name from the appropriate line based on the format description (e.g., second line for blank first line format).`;
    }
  }

  // --- Gemini API Payload Construction ---
  const systemInstruction = `You are a specialized OCR AI for golf scorecards. Extract course name, date, ALL player names with their total scores, and hole-by-hole stats (score, fairway, greens, putts) for EACH player.${nameFormatInstruction ? ' ' + nameFormatInstruction : ''} Return JSON matching the schema. Use -1 for missing integers, 'N/A' for missing strings.`;
  const userPrompt = "Extract ALL players and their complete hole-by-hole statistics. Include every player visible on the scorecard with full stats for all 18 or 9 holes.";
  
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
      responseSchema: SCORECARD_SCHEMA,
      temperature: 0.1, // Lower temperature for more consistent/faster responses
      maxOutputTokens: 4096 // Limit output tokens for faster processing
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

// The projectId from the client-side Firebase configuration
const defaultAppId = 'golfcardsync';
const firestorePath = `artifacts/${defaultAppId}/users/${userId}/scorecards`;
console.log('Attempting to save scorecard to Firestore path:', firestorePath);

    // Save the parsed data to Firestore under the user's specific path
    const docRef = await db.collection('artifacts').doc(defaultAppId).collection('users').doc(userId).collection('scorecards').add(parsedData);
    console.log('Scorecard saved to Firestore for user', userId, 'with ID:', docRef.id);

    // Success: Return the parsed, structured data to the client
    return res.status(200).json({ message: 'Scorecard analyzed and saved successfully!', scorecardId: docRef.id, data: parsedData });

  } catch (error) {
    console.error('Server processing error:', error);
    // Return a generic error to the client
    return res.status(500).json({ error: `An unexpected error occurred during processing: ${error.message}` });
  }
}
