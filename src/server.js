// Local development server for API endpoints
// This wraps the Vercel serverless function for local development
import 'dotenv/config'; // Load environment variables from .env file
import express from 'express';
import cors from 'cors';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import admin from 'firebase-admin';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Configure Firestore emulator connection (must be set before Admin SDK initialization)
// Set this environment variable to use the Firestore emulator
if (!process.env.FIRESTORE_EMULATOR_HOST && process.env.USE_FIREBASE_EMULATOR !== 'false') {
  // Default to using emulator if not explicitly disabled
  process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8080';
  console.log('Using Firestore emulator at localhost:8080');
}

// Initialize Firebase Admin SDK once at startup (not on every request)
if (!admin.apps.length) {
  // Prioritize emulator mode if FIRESTORE_EMULATOR_HOST is set
  if (process.env.FIRESTORE_EMULATOR_HOST) {
    // Emulator mode - initialize without credentials
    try {
      admin.initializeApp({
        projectId: process.env.FIREBASE_PROJECT_ID || 'demo-project',
      });
      console.log(`✓ Firebase Admin initialized with Firestore emulator at ${process.env.FIRESTORE_EMULATOR_HOST}`);
    } catch (initError) {
      console.error('Firebase Admin initialization error (emulator):', initError);
    }
  } else {
    // Production mode - use credentials
    const serviceAccount = {
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    };
    
    if (serviceAccount.projectId && serviceAccount.clientEmail && serviceAccount.privateKey) {
      try {
        admin.initializeApp({
          credential: admin.credential.cert(serviceAccount),
        });
        console.log('✓ Firebase Admin initialized successfully at startup (production)');
      } catch (initError) {
        console.error('Firebase Admin initialization error:', initError);
      }
    } else {
      console.warn('Firebase Admin credentials not found and emulator not configured - will initialize on first request');
    }
  }
}

// Get Firestore instance once at startup
// Note: Firebase Admin SDK connects to the default database by default
// If you have a named database, you may need to specify it differently
let db;
try {
  if (admin.apps.length > 0) {
    // Get Firestore instance
    // When FIRESTORE_EMULATOR_HOST is set, Admin SDK automatically uses the emulator
    db = admin.firestore();
    
    // Verify emulator connection
    if (process.env.FIRESTORE_EMULATOR_HOST) {
      console.log('Firestore database instance created');
      console.log('✓ Using Firestore emulator at:', process.env.FIRESTORE_EMULATOR_HOST);
      console.log('Firestore project ID:', process.env.FIREBASE_PROJECT_ID || 'demo-project');
    } else {
      console.log('Firestore database instance created');
      console.log('Firestore project ID:', process.env.FIREBASE_PROJECT_ID);
      console.log('Note: Using production Firestore');
    }
    
    // Test the connection asynchronously (non-blocking)
    setTimeout(async () => {
      try {
        // Try a simple operation to verify the database exists
        const testRef = db.collection('_test_connection');
        await testRef.limit(1).get();
        console.log('✓ Firestore connection verified - default database is accessible');
      } catch (testError) {
        console.error('⚠ Firestore connection test failed:', testError.message);
        console.error('  Error code:', testError.code);
        if (testError.code === 5) {
          console.error('  NOT_FOUND error - The database may not exist or be accessible.');
          console.error('  Troubleshooting steps:');
          console.error('    1. Go to Firebase Console > Firestore Database');
          console.error('    2. Ensure the default database exists and is active');
          console.error('    3. If you only have a named database (like "gcsd"), you may need to:');
          console.error('       - Create a default database, OR');
          console.error('       - Use a different method to access the named database');
          console.error('    4. Check service account permissions in IAM');
        }
      }
    }, 1000);
  } else {
    console.warn('Firebase Admin not initialized - Firestore will be unavailable');
  }
} catch (dbError) {
  console.error('Failed to create Firestore instance:', dbError);
  console.error('Firestore will not be available until Firebase Admin is properly initialized');
}

// Import the analyze-scorecard handler
// Note: We need to adapt it for Express instead of Vercel's req/res format
const app = express();
const PORT = process.env.API_PORT || 3001;

app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Import and adapt the analyze-scorecard function
async function analyzeScorecardHandler(req, res) {
  try {
    // This is adapted from api/analyze-scorecard.js for Express
    const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent';
    
    // Check if Firebase Admin is initialized
    if (!admin.apps.length) {
      return res.status(500).json({ 
        error: 'Firebase Admin SDK not initialized. Please check your environment variables.' 
      });
    }
    
    // Use the global db instance created at startup
    if (!db) {
      return res.status(500).json({ 
        error: 'Firestore database instance not available.' 
      });
    }
    
    // Build schema dynamically based on enabled extra stats
    const statsProperties = {
      hole: { 
        type: "integer" 
      },
      score: { 
        type: "integer", 
        description: "The gross score on this hole." 
      },
      fairway: { 
        type: "string", 
        description: "Fairway status: 'Hit', 'Missed Left', 'Missed Right', or 'N/A' (for Par 3s or unrecorded)." 
      },
      greens: { 
        type: "string", 
        description: "GiR status: 'Hit', 'Missed Long', 'Missed Short', 'Missed Left', 'Missed Right'. Use 'Missed Long', 'Missed Short', 'Missed Left', 'Missed Right' for missed shots. Use 'N/A' (for unrecorded)." 
      },
      putts: { 
        type: "integer", 
        description: "Number of putts on this hole, -1 if not recorded." 
      }
    };

    // Add extra stats fields if enabled
    if (extraStats) {
      if (extraStats.upDown) {
        statsProperties.upDown = { 
          type: "string", 
          description: "Up/Down status: 'Yes', 'No', 'Y', 'N', or 'N/A' if not recorded." 
        };
      }
      if (extraStats.teeClub) {
        statsProperties.teeClub = { 
          type: "string", 
          description: "Club used for tee shot (e.g., 'D' for driver, '3w' for 3-wood, '5i' for 5-iron). Use 'N/A' if not recorded." 
        };
      }
      if (extraStats.approachClub) {
        statsProperties.approachClub = { 
          type: "string", 
          description: "Club used for approach shot (e.g., 'Pw' for pitching wedge, '7i' for 7-iron, 'Aw' for approach wedge). Use 'N/A' if not recorded." 
        };
      }
      if (extraStats.chip) {
        statsProperties.chip = { 
          type: "string", 
          description: "Club used for chip shot (e.g., 'Lw' for lob wedge, 'P' for putter, 'Sw' for sand wedge). Use 'N/A' if no chip shot was taken on this hole." 
        };
      }
      
      // Add custom fields if enabled
      if (extraStats.customFields && Array.isArray(extraStats.customFields)) {
        extraStats.customFields.forEach((field) => {
          if (field.enabled && field.name && field.name.trim()) {
            // Create a field name by converting to camelCase and removing special chars
            const fieldKey = field.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
            if (fieldKey) {
              statsProperties[`custom_${fieldKey}`] = { 
                type: "string", 
                description: `${field.description || field.name}: Extract this statistic from the scorecard. Use 'N/A' if not recorded.` 
              };
            }
          }
        });
      }
    }

    const SCORECARD_SCHEMA = {
      type: "object",
      properties: {
        courseName: { 
          type: "string", 
          description: "The name of the golf course." 
        },
        date: { 
          type: "string", 
          description: "The date the round was played (e.g., YYYY-MM-DD)." 
        },
        players: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { 
                type: "string", 
                description: "The player's name." 
              },
              totalScore: { 
                type: "integer", 
                description: "The player's total gross score for 18 holes (or 9 if only 9 holes are present)." 
              },
              stats: {
                type: "array",
                description: "An array of 18 or 9 hole-by-hole statistics.",
                items: {
                  type: "object",
                  properties: statsProperties,
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

    const API_KEY = process.env.GEMINI_API_KEY;
    if (!API_KEY || API_KEY === 'your-gemini-api-key-here') {
      return res.status(500).json({ error: 'GEMINI_API_KEY environment variable is not set or is still a placeholder. Please set it in your .env file.' });
    }

    const { imageData, mimeType, nameFormats, extraStats } = req.body;
    const userId = req.body.userId || 'anonymous';

    if (!imageData || !mimeType) {
      return res.status(400).json({ error: 'Missing imageData or mimeType in request body.' });
    }

    // Build system instruction based on name format configurations
    let nameFormatInstruction = '';
    if (nameFormats && Object.keys(nameFormats).length > 0) {
      const formatDescriptions = Object.entries(nameFormats)
        .filter(([key, value]) => value && value.trim().length > 0)
        .map(([key, value]) => `- ${key === 'blankFirst' ? 'Blank First Line' : key === 'firstOnly' ? 'First Name Only' : 'First and Last Name'}: ${value}`)
        .join('\\n');
      
      if (formatDescriptions) {
        nameFormatInstruction = `IMPORTANT - Player Name Format Configuration:\\n${formatDescriptions}\\n\\nUse these descriptions to correctly identify and extract player names from the scorecard.`;
      }
    }

    // Build extra stats instruction
    const enabledExtraStats = [];
    if (extraStats) {
      if (extraStats.upDown) enabledExtraStats.push('up/down (whether they got up and down with their chip)');
      if (extraStats.teeClub) enabledExtraStats.push('tee club (which club was used for the tee shot)');
      if (extraStats.approachClub) enabledExtraStats.push('approach club (which club was used for the approach shot)');
      if (extraStats.chip) enabledExtraStats.push('chip (chip shots)');
      
      // Add custom fields
      if (extraStats.customFields && Array.isArray(extraStats.customFields)) {
        extraStats.customFields.forEach((field) => {
          if (field.enabled && field.name && field.description) {
            enabledExtraStats.push(`${field.name}: ${field.description}`);
          } else if (field.enabled && field.name) {
            enabledExtraStats.push(`${field.name}: Extract this statistic from the scorecard`);
          }
        });
      }
    }
    
    let extraStatsInstruction = '';
    if (enabledExtraStats.length > 0) {
      extraStatsInstruction = `\\n\\nIMPORTANT - Additional Statistics to Extract:\\n${enabledExtraStats.map(stat => `- ${stat}`).join('\\n')}\\n\\nPlease extract these additional statistics if they are present on the scorecard.`;
    }

    const systemInstruction = `You are a specialized AI designed to perform Optical Character Recognition (OCR) on golf scorecard images. Extract all specified data, including course name, date, player names, total scores, and individual hole statistics (score, fairway status, greens in regulation (GiR) status, and putts).${extraStatsInstruction} ${nameFormatInstruction} Output the result strictly as a JSON object matching the provided schema. If a specific stat (like putts) is missing or illegible, use -1 for integers or 'N/A' for strings. Always prioritize the data for the player in the first available slot.`;
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
        const errorText = await response.text();
        console.error("Gemini API Error:", errorText);
        return res.status(response.status).json({ error: `Gemini API call failed: ${response.statusText}`, detail: errorText });
      }

      const result = await response.json();
      const jsonText = result.candidates?.[0]?.content?.parts?.[0]?.text;

      if (!jsonText) {
        return res.status(500).json({ error: 'Model response was empty or malformed.' });
      }
      
      const parsedData = JSON.parse(jsonText);

      const defaultAppId = 'golfcardsync';
      const firestorePath = `artifacts/${defaultAppId}/users/${userId}/scorecards`;
      console.log('Attempting to save scorecard to Firestore path:', firestorePath);
      console.log('User ID:', userId);
      console.log('App ID:', defaultAppId);
      console.log('Firestore database instance:', db ? 'created' : 'not created');

      // Use simple collection/document syntax for Firestore Admin SDK
      // Parent documents don't need to exist - Firestore creates them implicitly
      // Admin SDK bypasses security rules, so writes should work
      console.log('Starting Firestore write operation...');
      console.log('Data to save:', JSON.stringify(parsedData).substring(0, 200) + '...');
      
      // Use the simpler format: collection().doc().collection().doc().collection().add()
      const scorecardsRef = db
        .collection('artifacts')
        .doc(defaultAppId)
        .collection('users')
        .doc(userId)
        .collection('scorecards');
      
      const docRef = await scorecardsRef.add(parsedData);
      
      console.log('✓ Scorecard saved to Firestore successfully!');
      console.log('  - User ID:', userId);
      console.log('  - Document ID:', docRef.id);
      console.log('  - Path: artifacts/' + defaultAppId + '/users/' + userId + '/scorecards/' + docRef.id);
      
      // Verify the write by reading it back
      try {
        const verifyDoc = await scorecardsRef.doc(docRef.id).get();
        if (verifyDoc.exists) {
          console.log('✓ Write verified - document exists in Firestore');
          console.log('  - Document data keys:', Object.keys(verifyDoc.data()));
        } else {
          console.warn('⚠ Warning: Document was not found after write');
        }
      } catch (verifyError) {
        console.error('Error verifying write:', verifyError);
      }

      return res.status(200).json({ message: 'Scorecard analyzed and saved successfully!', scorecardId: docRef.id, data: parsedData });

    } catch (error) {
      console.error('Server processing error:', error);
      console.error('Error code:', error.code);
      console.error('Error message:', error.message);
      console.error('Error stack:', error.stack);
      
      // Provide more specific error messages
      if (error.code === 5 || error.message?.includes('NOT_FOUND')) {
        return res.status(500).json({ 
          error: `Firestore error: Database or collection not found. Please ensure Firestore is enabled in your Firebase project and the database exists.`,
          details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
      }
      
      return res.status(500).json({ 
        error: `An unexpected error occurred during processing: ${error.message}`,
        details: process.env.NODE_ENV === 'development' ? error.stack : undefined
      });
    }
  } catch (error) {
    // Catch errors from the outer try block (Firebase initialization, etc.)
    console.error('Handler initialization error:', error);
    console.error('Error stack:', error.stack);
    return res.status(500).json({ 
      error: `Server initialization error: ${error.message}`,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}

// API route
app.post('/api/analyze-scorecard', analyzeScorecardHandler);

// Test endpoint to verify Firestore read/write operations
app.get('/api/test-firestore', async (req, res) => {
  try {
    if (!admin.apps.length) {
      return res.status(500).json({ 
        error: 'Firebase Admin not initialized',
        details: 'Check that FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY are set in .env'
      });
    }
    
    if (!db) {
      return res.status(500).json({ 
        error: 'Firestore database instance not available',
        details: 'Firestore instance creation failed at startup'
      });
    }
    
    console.log('Testing Firestore connection...');
    console.log('Project ID:', process.env.FIREBASE_PROJECT_ID);
    console.log('Database instance:', db ? 'exists' : 'missing');
    
    // First, try a simple read to see if the database is accessible
    try {
      console.log('Attempting to list collections (read test)...');
      // Try to access a collection - this will fail if database doesn't exist
      const testCollection = db.collection('_connection_test');
      const testSnapshot = await testCollection.limit(1).get();
      console.log('✓ Database is accessible (read test passed)');
    } catch (readTestError) {
      console.error('✗ Database read test failed:', readTestError.message);
      console.error('  Error code:', readTestError.code);
      if (readTestError.code === 5) {
        return res.status(500).json({
          error: 'Firestore database not found',
          code: 5,
          message: 'The database does not exist or is not accessible',
          details: {
            projectId: process.env.FIREBASE_PROJECT_ID,
            suggestion: 'Please ensure the default Firestore database exists in Firebase Console. If you have a named database, we may need to configure it differently.'
          }
        });
      }
      throw readTestError;
    }
    
    // Test write
    const testData = {
      test: true,
      timestamp: new Date().toISOString(),
      message: 'Test write from API server'
    };
    
    console.log('Testing Firestore write...');
    const writeRef = await db.collection('test').add(testData);
    console.log('✓ Test write successful, document ID:', writeRef.id);
    
    // Test read
    console.log('Testing Firestore read...');
    const readSnapshot = await db.collection('test').get();
    const documents = [];
    readSnapshot.forEach((doc) => {
      documents.push({
        id: doc.id,
        data: doc.data()
      });
    });
    
    console.log('✓ Test read successful, found', documents.length, 'documents');
    
    return res.status(200).json({
      success: true,
      message: 'Firestore read/write test successful',
      writeId: writeRef.id,
      readCount: documents.length,
      documents: documents
    });
  } catch (error) {
    console.error('Firestore test error:', error);
    console.error('Error code:', error.code);
    console.error('Error message:', error.message);
    return res.status(500).json({
      error: 'Firestore test failed',
      message: error.message,
      code: error.code,
      details: error.code === 5 ? 'Database not found. Please ensure Firestore is enabled and the database exists.' : undefined
    });
  }
});

app.listen(PORT, () => {
  console.log(`API server running on http://localhost:${PORT}`);
  console.log(`Test endpoint available at http://localhost:${PORT}/api/test-firestore`);
});

