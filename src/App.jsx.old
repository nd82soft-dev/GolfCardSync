// App.jsx
import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { Camera, Upload, LayoutGrid, BarChart3, Loader2, Users, X, Clock, Eye, TrendingUp, ClipboardList, Menu, RefreshCw, User, List } from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, query, limit, orderBy, onSnapshot, addDoc, serverTimestamp, setLogLevel } from 'firebase/firestore';

// Set Firebase debug logging (helpful for canvas environment)
setLogLevel('debug');

// --- Logo Configuration ---
// Note: You may need to place 'custom-logo.png' in a 'public' folder for Vercel/Vite deployment
const LOGO_SRC = "/uploaded_files/custom-logo.png"; 

// --- VERCEL API CONFIGURATION (Client-Side) ---
// The client calls this secure Serverless Function endpoint, which handles the 
// confidential call to the Gemini API for image analysis.
const VERCEL_API_ENDPOINT = '/api/analyze-scorecard'; 

/**
 * Converts a File object (Blob) to a Base64 data URL string.
 * @param {File} file The file to convert.
 * @returns {Promise<string>} The Base64 string of the file data.
 */
const fileToBase64 = (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]); // Resolve only the base64 part
    reader.onerror = (error) => reject(error);
    reader.readAsDataURL(file);
  });
};


// --- Doughnut Chart Component for Dashboard ---
const DoughnutChart = ({ percent, title, color, unit, value }) => {
    const strokeWidth = 10;
    const radius = 50;
    const circumference = 2 * Math.PI * radius;
    const cleanPercent = Math.min(100, Math.max(0, percent));
    const dashoffset = circumference - (cleanPercent / 100) * circumference;

    return (
        <div className="relative w-full aspect-square max-w-40 flex flex-col items-center justify-center mx-auto">
            <svg viewBox="0 0 120 120" className="w-full h-full transform -rotate-90">
                {/* Background Track */}
                <circle
                    cx="60" cy="60" r={radius} fill="none" stroke="#374151" strokeWidth={strokeWidth}
                />
                {/* Progress Track */}
                <circle
                    cx="60" cy="60" r={radius} fill="none" stroke={color} strokeWidth={strokeWidth}
                    strokeDasharray={circumference}
                    strokeDashoffset={dashoffset}
                    strokeLinecap="round"
                    className="transition-all duration-1000 ease-out"
                />
            </svg>
            <div className="absolute flex flex-col items-center justify-center">
                <p className="text-2xl font-extrabold text-white">{value}</p>
                <p className="text-xs text-gray-400 text-center mt-1">{title}</p>
            </div>
        </div>
    );
};

// --- Selected Round Preview Component ---
const SelectedRoundPreview = ({ selectedRound, onImageClick }) => {
    if (!selectedRound) {
        return (
            <div className="bg-gray-800 p-4 rounded-xl shadow-inner border border-gray-700 h-48 flex flex-col items-center justify-center text-center">
                <Eye className="w-6 h-6 text-gray-500 mb-2" />
                <p className="text-sm text-gray-500">Scorecard image preview.</p>
            </div>
        );
    }
    
    return (
        <div className="bg-gray-800 p-4 rounded-xl shadow-2xl border border-gray-700">
            <h4 className="text-md font-semibold text-green-400 mb-2 truncate flex items-center">
                <Eye className="w-4 h-4 mr-1"/> Latest Scorecard Image
            </h4>
            <div 
                className="relative w-full aspect-[3/4] bg-gray-700 rounded-lg overflow-hidden cursor-pointer hover:opacity-90 transition duration-200 mx-auto"
                onClick={onImageClick}
            >
                {selectedRound.image ? (
                    <img 
                        src={`data:image/jpeg;base64,${selectedRound.image}`} 
                        alt="Selected Scorecard" 
                        className="w-full h-full object-contain"
                    />
                ) : (
                    <div className="w-full h-full flex items-center justify-center text-center text-gray-400 text-sm">
                        No image available.
                    </div>
                )}
                <div className="absolute inset-0 bg-black/10 flex items-center justify-center opacity-0 hover:opacity-100 transition duration-300">
                    <p className="text-white font-bold text-sm bg-black/50 p-2 rounded-lg">Click to Enlarge</p>
                </div>
            </div>
        </div>
    );
};


// --- Image Modal Component ---
const ImageModal = ({ base64Image, onClose }) => {
    if (!base64Image) return null;

    return (
        <div 
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black bg-opacity-90 backdrop-blur-sm" 
            onClick={onClose} // Close on backdrop click
        >
            <div className="relative max-w-full max-h-full" onClick={e => e.stopPropagation()}>
                <button
                    onClick={onClose} // Close button click
                    className="absolute top-4 right-4 p-3 bg-white/20 rounded-full text-white hover:bg-white/40 transition z-50"
                    aria-label="Close"
                >
                    <X className="w-6 h-6" />
                </button>
                <img 
                    src={`data:image/jpeg;base64,${base64Image}`} 
                    alt="Enlarged Scorecard" 
                    className="max-w-[90vw] max-h-[90vh] object-contain rounded-xl shadow-2xl"
                />
            </div>
        </div>
    );
};


// --- Detailed Stats Table Component ---
const DetailedStatsTable = ({ selectedRound }) => {
    if (!selectedRound || !selectedRound.data?.players?.[0]?.stats) {
        return (
            <div className="text-center p-8 bg-gray-800 rounded-xl text-gray-400 border border-gray-700">
                <ClipboardList className="w-8 h-8 mx-auto mb-2"/>
                <p>Select a round to view hole-by-hole details.</p>
            </div>
        );
    }
    
    const player = selectedRound.data.players[0];
    const stats = player.stats;
    const isFullRound = stats.length === 18;

    // Split stats into front 9 and back 9 for display
    const front9 = stats.slice(0, 9);
    const back9 = isFullRound ? stats.slice(9, 18) : [];

    const StatCell = ({ value, label }) => {
        let colorClass = 'text-gray-200';
        let displayValue = value;
        
        if (label === 'Score') {
            colorClass = (value <= 3) ? 'text-green-400 font-bold' : (value >= 6) ? 'text-red-400 font-bold' : 'text-white font-bold';
        } else if (label === 'Putts') {
            colorClass = (value === 1) ? 'text-blue-400' : (value > 2) ? 'text-yellow-400' : 'text-gray-300';
            displayValue = value > 0 ? value : '-';
        } else if (label === 'Fw' || label === 'GiR') {
            if (value === 'Hit') colorClass = 'text-green-500';
            else if (value.includes('Missed')) colorClass = 'text-red-400';
            else displayValue = '-';
        }

        return (
            <td className={`p-2 border border-gray-700 text-center text-sm ${colorClass}`}>
                {displayValue}
            </td>
        );
    };

    const TableSegment = ({ holes, title }) => (
        <div className="overflow-x-auto rounded-lg shadow-inner">
            <h5 className="text-sm font-semibold p-2 bg-gray-700 text-green-400 sticky top-0 border-b border-gray-600">{title}</h5>
            <table className="min-w-full table-fixed border-collapse">
                <thead>
                    <tr className="bg-gray-700 text-gray-400 uppercase text-xs sticky top-8">
                        <th className="w-1/12 p-2 border border-gray-700">Hole</th>
                        <th className="w-1/12 p-2 border border-gray-700">Score</th>
                        <th className="w-1/12 p-2 border border-gray-700">Putts</th>
                        <th className="w-1/12 p-2 border border-gray-700">Fw</th>
                        <th className="w-1/12 p-2 border border-gray-700">GiR</th>
                    </tr>
                </thead>
                <tbody>
                    {holes.map((stat) => (
                        <tr key={stat.hole} className="even:bg-gray-800 odd:bg-gray-900 hover:bg-gray-700 transition duration-150">
                            <td className="p-2 border border-gray-700 text-center font-medium text-gray-300">{stat.hole}</td>
                            <StatCell value={stat.score} label="Score" />
                            <StatCell value={stat.putts} label="Putts" />
                            <StatCell value={stat.fairway} label="Fw" />
                            <StatCell value={stat.greens} label="GiR" />
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );

    return (
        <div className="space-y-4 bg-gray-900 p-4 sm:p-6 rounded-xl shadow-inner border border-gray-800 mt-4">
            <h4 className="text-lg font-semibold text-white border-b border-gray-700 pb-2 flex items-center"><ClipboardList className="w-5 h-5 mr-2"/> Detailed Hole Stats</h4>
            <div className={`grid ${isFullRound ? 'sm:grid-cols-2' : 'grid-cols-1'} gap-4`}>
                <TableSegment holes={front9} title="Front Nine (Holes 1-9)" />
                {isFullRound && (
                    <TableSegment holes={back9} title="Back Nine (Holes 10-18)" />
                )}
            </div>
        </div>
    );
};

// --- Bottom Navigation Component ---
const BottomNav = ({ currentTab, setCurrentTab }) => {
    const navItems = [
        { key: 'dashboard', icon: BarChart3, label: 'Averages' },
        { key: 'upload', icon: Camera, label: 'Upload' },
        { key: 'history', icon: List, label: 'History' },
        { key: 'profile', icon: User, label: 'Profile' },
    ];

    return (
        <div className="fixed bottom-0 left-0 right-0 z-50 bg-gray-800 border-t border-green-800 shadow-2xl">
            <div className="flex justify-around items-center h-16 max-w-lg mx-auto">
                {navItems.map(item => {
                    const isActive = currentTab === item.key;
                    const Icon = item.icon;
                    return (
                        <button
                            key={item.key}
                            onClick={() => setCurrentTab(item.key)}
                            className={`flex flex-col items-center justify-center p-2 transition duration-200 active:scale-95 ${
                                isActive ? 'text-green-400' : 'text-gray-400 hover:text-green-300'
                            }`}
                        >
                            <Icon className="w-6 h-6" />
                            <span className="text-xs font-medium mt-0.5">{item.label}</span>
                        </button>
                    );
                })}
            </div>
        </div>
    );
};


// Main React Component
const App = () => {
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [currentTab, setCurrentTab] = useState('dashboard'); // 'dashboard', 'upload', 'history', 'profile'
  const [showModalImage, setShowModalImage] = useState(false); // State for modal

  // --- Firebase/Auth States ---
  const [db, setDb] = useState(null);
  const [userId, setUserId] = useState(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  
  // --- History States ---
  const [roundHistory, setRoundHistory] = useState([]); // All fetched rounds (max 20)
  const [selectedRound, setSelectedRound] = useState(null); // Round whose details are shown on the dashboard

  // ------------------------------------
  // --- FIREBASE INITIALIZATION & AUTH ---
  // ------------------------------------
  useEffect(() => {
    const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
    const firebaseConfig = JSON.parse(typeof __firebase_config !== 'undefined' ? __firebase_config : '{}');
    if (Object.keys(firebaseConfig).length === 0) {
        console.error("Firebase config is missing.");
        setIsAuthReady(true);
        return;
    }

    const app = initializeApp(firebaseConfig);
    const firestoreDb = getFirestore(app);
    const firebaseAuth = getAuth(app);
    setDb(firestoreDb);

    const token = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;
    
    // Auth listener handles the final state determination
    const unsubscribe = onAuthStateChanged(firebaseAuth, (user) => {
        if (user) {
            setUserId(user.uid);
            setIsAuthReady(true);
        } else {
            signInAnonymously(firebaseAuth)
                .then(credential => {
                    setUserId(credential.user.uid);
                    setIsAuthReady(true);
                })
                .catch(error => {
                    console.error("Anonymous sign-in failed:", error);
                    setIsAuthReady(true);
                });
        }
    });

    if (token) {
        signInWithCustomToken(firebaseAuth, token)
            .catch(error => {
                console.error("Custom token sign-in failed:", error);
            });
    } else if (!firebaseAuth.currentUser) {
         signInAnonymously(firebaseAuth);
    }

    return () => unsubscribe(); // Cleanup auth listener
  }, []);

  // ------------------------------------
  // --- FIREBASE DATA FETCHING (History) ---
  // ------------------------------------
  useEffect(() => {
    // Only proceed if DB is initialized, user is signed in, and auth is settled
    if (!db || !userId || !isAuthReady) return;

    const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
    // Path for private user data: /artifacts/{appId}/users/{userId}/scorecards
    const path = `artifacts/${appId}/users/${userId}/scorecards`;

    // Query for the last 20 rounds (needed for best-8 average)
    const q = query(
        collection(db, path),
        orderBy('timestamp', 'desc'),
        limit(20) 
    );

    // Set up real-time listener
    const unsubscribe = onSnapshot(q, (snapshot) => {
        const rounds = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data(),
            timestamp: doc.data().timestamp?.toDate() || new Date(), // Convert Firestore timestamp
            data: doc.data().data || { players: [] }
        }));
        setRoundHistory(rounds);
        
        // Always select the newest round for the history tab detail view
        if (rounds.length > 0 && (!selectedRound || !rounds.find(r => r.id === selectedRound.id))) { 
            setSelectedRound(rounds[0]);
        } else if (rounds.length === 0) {
            setSelectedRound(null);
        }

    }, (error) => {
        console.error("Error fetching scorecards:", error);
    });

    return () => unsubscribe(); // Cleanup listener on component unmount
  }, [db, userId, isAuthReady]);

  // ------------------------------------
  // --- UI/DASHBOARD CALCULATIONS (useMemo) ---
  // ------------------------------------

  // Calculate overall performance metrics from history
  const dashboardStats = useMemo(() => {
    if (roundHistory.length === 0) return null;

    // We assume the user is Player 1 in all their rounds for simplicity
    const firstPlayerRounds = roundHistory.filter(round => round.data?.players?.length > 0)
                                         .map(round => round.data.players[0]);

    if (firstPlayerRounds.length === 0) return null;

    // 1. Calculate Score Average (Best 8 of 20) - Used for Handi-cap-like tracking
    const sortedScores = firstPlayerRounds
        .map(player => player.totalScore)
        .filter(score => typeof score === 'number' && score > 0)
        .sort((a, b) => a - b); // Sort ascending (lowest scores first)

    const roundsToAverage = 8;
    const bestScores = sortedScores.slice(0, roundsToAverage);

    const avgScore = bestScores.length > 0 
        ? (bestScores.reduce((sum, score) => sum + score, 0) / bestScores.length)
        : null;


    // 2. Calculate Overall Averages (Fairways, GIR, Putts)
    let totalFairwaysHit = 0;
    let totalFairwayOpportunities = 0;
    let totalGreensHit = 0;
    let totalGreenOpportunities = 0;
    let totalPutts = 0;
    let totalHolesPlayed = 0;

    firstPlayerRounds.forEach(player => {
        player.stats.forEach(stat => {
            if (stat.score > 0) {
                totalHolesPlayed++;
                if (stat.putts > 0) totalPutts += stat.putts;

                if (stat.fairway && stat.fairway !== 'N/A') {
                    totalFairwayOpportunities++;
                    if (stat.fairway === 'Hit') totalFairwaysHit++;
                }

                if (stat.greens && stat.greens !== 'N/A') {
                    totalGreenOpportunities++;
                    if (stat.greens === 'Hit') totalGreensHit++;
                }
            }
        });
    });

    const fairwayPct = totalFairwayOpportunities > 0 ? ((totalFairwaysHit / totalFairwayOpportunities) * 100) : 0;
    const greensPct = totalGreenOpportunities > 0 ? ((totalGreensHit / totalGreenOpportunities) * 100) : 0;
    const puttsPerHole = totalHolesPlayed > 0 ? (totalPutts / totalHolesPlayed) : 0;


    return {
        avgScore: avgScore ? avgScore.toFixed(1) : 'N/A',
        fairwayPct: fairwayPct.toFixed(1),
        greensPct: greensPct.toFixed(1),
        puttsPerHole: puttsPerHole.toFixed(2),
        puttTotal: totalPutts,
        totalRounds: firstPlayerRounds.length,
        bestScoresCount: bestScores.length,
    };
  }, [roundHistory]);


  const handleFileChange = (event) => {
    const selectedFile = event.target.files[0];
    if (selectedFile) {
      setFile(selectedFile);
      setError(null);
    }
  };

  // ------------------------------------
  // --- OCR Processing and Saving ---
  // ------------------------------------
  const processScorecard = useCallback(async () => {
    if (!file) {
      setError("Please select a scorecard image first.");
      return;
    }

    setLoading(true);
    setError(null);
    let base64Image = null;

    try {
      base64Image = await fileToBase64(file);

      // Send the image data to the Vercel Serverless Function
      const serverPayload = {
        imageData: base64Image,
        mimeType: file.type,
      };

      // Exponential backoff retry logic for the API call
      let response;
      const maxRetries = 5;
      for (let i = 0; i < maxRetries; i++) {
        try {
          response = await fetch(VERCEL_API_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(serverPayload)
          });
          if (response.status !== 429) break; // Break if not rate limited
          console.log(`Rate limit hit. Retrying in ${2 ** i}s...`);
          await new Promise(resolve => setTimeout(resolve, 1000 * (2 ** i)));
        } catch (fetchError) {
          if (i === maxRetries - 1) throw fetchError;
          console.error(`Fetch attempt ${i + 1} failed:`, fetchError);
          await new Promise(resolve => setTimeout(resolve, 1000 * (2 ** i)));
        }
      }
      
      if (!response) {
          throw new Error("API request failed after all retries.");
      }

      if (!response.ok) {
        // The server returned an error. Attempt to parse the error message.
        const errorText = await response.text();
        try {
          // Try parsing as JSON, which is the expected error format from our function
          const errorJson = JSON.parse(errorText);
          throw new Error(errorJson.error || errorJson.detail || `Server responded with status ${response.status}`);
        } catch (e) {
          // If it's not JSON, it's likely a generic Vercel error page (HTML/text)
          throw new Error(errorText.substring(0, 150) || `Server responded with status ${response.status}`);
        }
      }
      
      const parsedData = await response.json(); // Now it's safe to parse as JSON

      // --- Save data to Firestore (Client-side) ---
      if (db && userId) {
          const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
          // Saves to: /artifacts/{appId}/users/{userId}/scorecards
          const path = `artifacts/${appId}/users/${userId}/scorecards`;
          
          await addDoc(collection(db, path), {
              data: parsedData,
              image: base64Image, // Save the image data alongside the parsed results
              timestamp: serverTimestamp(),
          });
          console.log("Scorecard saved to Firestore.");
      }

      // Navigate to the history tab to see the newly saved round
      setCurrentTab('history');
      setShowModalImage(true); 
      setFile(null); // Clear file input after successful upload

    } catch (e) {
      console.error("OCR or Network Error:", e);
      setError(e.message || "An unknown error occurred. Please check the console for details.");
    } finally {
      setLoading(false);
    }
  }, [file, db, userId]);

  // --- UI Components ---

  const Header = ({ title }) => (
    <div className="flex items-center justify-center p-4 bg-gray-900 shadow-lg sticky top-0 z-20 border-b border-green-800">
      <div className="flex items-center">
        <img 
            src={LOGO_SRC} 
            alt="GolfCardSync Logo" 
            className="h-7 w-auto mr-2 sm:h-8" 
            onError={(e) => { 
                e.target.onerror = null; 
                e.target.src="https://placehold.co/50x50/10B981/ffffff?text=GC"; 
            }}
        />
        <h1 className="text-xl font-bold text-white sm:text-2xl">{title}</h1>
      </div>
    </div>
  );
  
  // Renders the list of rounds and the details of the selected round.
  const renderHistory = () => {
    
    // Extract metadata for display in the summary
    const data = selectedRound?.data;
    const player = data?.players?.[0];
    const score = player?.totalScore || 'N/A';
    const courseName = data?.courseName || 'Unspecified Course';
    const dateStr = selectedRound?.timestamp?.toLocaleDateString('en-US', { year: 'numeric', month: 'numeric', day: 'numeric' }) || 'N/A';
    const playerName = player?.name || 'Player 1';

    return (
        <div className="p-4 space-y-6 pb-20"> {/* pb-20 for bottom nav padding */}
            <h2 className="text-2xl font-bold text-green-400 border-b border-gray-700 pb-2 flex items-center"><List className="w-6 h-6 mr-2"/> Round History</h2>

            {/* 1. Round List */}
            <div className="bg-gray-800 p-4 rounded-xl shadow-2xl border border-gray-700">
                <h3 className="text-md font-semibold text-gray-200 flex items-center mb-4"><Clock className="w-4 h-4 mr-1"/> Select Round</h3>
                
                <div className="flex overflow-x-auto space-x-3 pb-2"> 
                    {roundHistory.length > 0 ? (
                        roundHistory.map((round) => {
                            const player = round.data?.players?.[0];
                            const timestamp = round.timestamp instanceof Date ? round.timestamp.toLocaleDateString() : 'N/A';
                            const isSelected = selectedRound?.id === round.id;

                            return (
                                <div 
                                    key={round.id} 
                                    className={`flex-shrink-0 w-36 p-3 rounded-lg shadow-md border cursor-pointer transition duration-150 active:scale-[0.98] ${
                                        isSelected 
                                            ? 'bg-green-700/50 border-green-600' 
                                            : 'bg-gray-700 border-gray-600 hover:bg-gray-600'
                                    }`}
                                    onClick={() => setSelectedRound(round)}
                                >
                                    <p className="text-xs font-bold text-white truncate">{round.data?.courseName || 'Untitled Round'}</p>
                                    <p className="text-xs text-gray-400">{timestamp}</p>
                                    <span className={`text-lg font-extrabold block text-right mt-1 ${isSelected ? 'text-white' : 'text-green-400'}`}>{player?.totalScore || 'N/A'}</span>
                                </div>
                            );
                        })
                    ) : (
                        <div className="text-center p-4 w-full text-gray-500 bg-gray-700 rounded-lg">
                            No rounds recorded. Upload your first scorecard!
                        </div>
                    )}
                </div>
            </div>

            {selectedRound ? (
                <>
                    {/* 2. Selected Round Summary Block */}
                    <div className="bg-gray-800 p-6 rounded-xl shadow-2xl border border-gray-700 flex flex-col justify-center text-center">
                        <h3 className="text-lg font-semibold text-white mb-4">Round: {courseName}</h3>
                        <p className="text-6xl font-extrabold text-green-400 mb-2">{score}</p>
                        <p className="text-xl font-bold text-white truncate">{playerName}</p>
                        <p className="text-sm text-gray-400 font-medium mt-1">
                            <Clock className="w-3 h-3 inline mr-1"/> {dateStr}
                        </p>
                        {dashboardStats && (
                            <div className="mt-4 pt-3 border-t border-gray-700">
                                <p className="text-sm text-gray-300">Avg. Putts/Hole: <span className="font-bold text-yellow-400">{dashboardStats.puttsPerHole}</span></p>
                            </div>
                        )}
                    </div>
                    
                    {/* 3. Scorecard Image Preview */}
                    <SelectedRoundPreview 
                        selectedRound={selectedRound} 
                        onImageClick={() => selectedRound?.image && setShowModalImage(true)}
                    />
                    
                    {/* 4. Detailed Player Stats Table */}
                    <DetailedStatsTable selectedRound={selectedRound} />
                </>
            ) : (
                 <div className="text-center p-8 bg-gray-800 rounded-xl text-gray-400 border border-gray-700">
                    <TrendingUp className="w-8 h-8 mx-auto mb-2 text-green-400"/>
                    <p>Select a round above to view its details.</p>
                </div>
            )}

            {/* Image Modal Rendering */}
            {showModalImage && selectedRound?.image && (
                <ImageModal 
                base64Image={selectedRound.image} 
                onClose={() => setShowModalImage(false)}
                />
            )}
        </div>
    );
  };

  // Renders the overall averages/charts.
  const renderDashboardAverages = () => {
      return (
        <div className="p-4 space-y-6 pb-20"> {/* pb-20 for bottom nav padding */}
            <h2 className="text-2xl font-bold text-green-400 border-b border-gray-700 pb-2 flex items-center"><BarChart3 className="w-6 h-6 mr-2"/> Overall Averages</h2>

            {dashboardStats ? (
                <div className="bg-gray-800 p-6 rounded-xl shadow-2xl border border-gray-700 h-full space-y-6">
                    <h3 className="text-xl font-bold text-white mb-4 text-center">Performance Tracking (Last {roundHistory.length} Rounds)</h3>
                    
                    <div className="grid grid-cols-2 gap-4">
                        <div className="col-span-2 text-center p-4 bg-gray-700 rounded-lg">
                            <p className="text-sm font-medium text-gray-400">Avg. Score (Best {dashboardStats.bestScoresCount})</p>
                            <p className="text-4xl font-extrabold text-green-400 mt-1">{dashboardStats.avgScore}</p>
                        </div>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4">
                        <DoughnutChart 
                            percent={dashboardStats.fairwayPct} 
                            title="Fairways Hit" 
                            color="#3b82f6"
                            value={`${dashboardStats.fairwayPct}%`}
                        />
                        <DoughnutChart 
                            percent={dashboardStats.greensPct} 
                            title="GIR Hit" 
                            color="#facc15"
                            value={`${dashboardStats.greensPct}%`}
                        />
                    </div>
                    
                    <div className="mt-6 pt-4 border-t border-gray-700 text-center">
                        <p className="text-sm font-medium text-gray-400">Total Rounds Recorded</p>
                        <p className="text-3xl font-bold text-white mt-1">{dashboardStats.totalRounds}</p>
                    </div>
                </div>
            ) : (
                <div className="text-center p-8 bg-gray-800 rounded-xl text-gray-400 border border-gray-700">
                    <TrendingUp className="w-8 h-8 mx-auto mb-2 text-green-400"/>
                    <p>No historical data yet. Upload a scorecard using the **Upload** tab!</p>
                </div>
            )}
        </div>
    );
  };


  const renderUpload = () => (
    <div className="flex flex-col items-center justify-start min-h-screen p-6 sm:p-8 space-y-6 pt-10 pb-20">
      <div className="text-center">
        <h2 className="text-2xl font-bold text-white">Scan Your Scorecard</h2>
        <p className="text-gray-400">Capture the stats, instantly, and track your history.</p>
      </div>

      <div className="w-full max-w-sm">
        <label
          htmlFor="file-upload"
          className={`flex flex-col items-center justify-center w-full h-64 border-4 border-dashed rounded-xl cursor-pointer transition duration-300 active:scale-[0.99] ${
            file ? 'border-green-500 bg-gray-700' : 'border-gray-600 bg-gray-800 hover:bg-gray-700'
          }`}
        >
          {file ? (
            <div className="text-center p-4">
              <RefreshCw className="w-12 h-12 text-green-400 mx-auto mb-2" />
              <p className="text-white font-medium">{file.name}</p>
              <p className="text-sm text-gray-400 mt-1">Tap to select a different image.</p>
            </div>
          ) : (
            <div className="text-center p-4">
              {/* Camera icon is most relevant for mobile upload intent */}
              <Camera className="w-12 h-12 text-gray-400 mx-auto mb-2" />
              <p className="text-white font-medium">Tap to upload or take a picture</p>
              <p className="text-sm text-gray-400 mt-1">Ensure handwriting is clear for best results.</p>
            </div>
          )}
          <input
            id="file-upload"
            type="file"
            accept="image/*"
            onChange={handleFileChange}
            className="hidden"
          />
        </label>
      </div>

      {error && (
        <div className="w-full max-w-sm p-3 bg-red-800 text-white rounded-xl border border-red-600 shadow-lg text-center font-medium">
          Error: {error}
        </div>
      )}

      <button
        onClick={processScorecard}
        disabled={!file || loading || !isAuthReady}
        className={`w-full max-w-sm flex items-center justify-center p-3 text-lg font-bold rounded-xl shadow-lg transition transform active:scale-[0.98] ${
          file && !loading && isAuthReady
            ? 'bg-green-600 hover:bg-green-700 text-white hover:scale-[1.01]'
            : 'bg-gray-600 text-gray-400 cursor-not-allowed'
        }`}
      >
        {!isAuthReady ? (
            <>
                <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                Connecting...
            </>
        ) : loading ? (
          <>
            <Loader2 className="w-5 h-5 mr-2 animate-spin" />
            Analyzing Scorecard...
          </>
        ) : (
          'Analyze & Save Scorecard with AI'
        )}
      </button>
      {isAuthReady && !userId && (
        <p className="text-xs text-gray-500 max-w-sm text-center mt-2">
            Warning: Anonymous session. Data will be saved but tied to a temporary ID.
        </p>
      )}
    </div>
  );

  const renderProfile = () => (
    <div className="p-4 space-y-6 pb-20">
        <h2 className="text-2xl font-bold text-green-400 border-b border-gray-700 pb-2 flex items-center"><User className="w-6 h-6 mr-2"/> User Profile</h2>
        <div className="bg-gray-800 p-6 rounded-xl shadow-2xl border border-gray-700 space-y-4">
            <h3 className="text-xl font-semibold text-white">Account Information</h3>
            <p className="text-gray-400">This section is for future features like user settings, multi-player management, and subscription details.</p>
            <div className="bg-gray-700 p-3 rounded-lg">
                <p className="text-sm text-gray-300 font-medium">Current User ID:</p>
                <p className="text-xs text-green-400 break-all">{userId || "Loading..."}</p>
            </div>
            <p className="text-sm text-gray-500 italic">Thank you for testing the mobile layout!</p>
        </div>
    </div>
  );

  const renderContent = () => {
    switch (currentTab) {
      case 'upload':
        return renderUpload();
      case 'dashboard':
        return renderDashboardAverages();
      case 'history':
        return renderHistory();
      case 'profile':
        return renderProfile();
      default:
        return renderDashboardAverages();
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 font-sans antialiased flex flex-col">
      {/* Header is fixed at the top */}
      <Header title={'GolfCardSync'} />

      {/* Main Content Area: Scrolls and contains the current view */}
      <div className="flex-grow overflow-y-auto w-full max-w-lg mx-auto pb-16">
        {renderContent()}
      </div>

      {/* Bottom Navigation is fixed at the bottom */}
      <BottomNav 
        currentTab={currentTab} 
        setCurrentTab={setCurrentTab}
      />
    </div>
  );
};

export default App;

