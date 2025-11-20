// App.jsx
import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { Camera, Upload, LayoutGrid, BarChart3, Loader2, Users, X, Clock, Eye, TrendingUp, ClipboardList, Menu, RefreshCw, User, List } from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator, collection, query, limit, orderBy, onSnapshot, addDoc, serverTimestamp, setLogLevel } from 'firebase/firestore';

// Set Firebase debug logging (helpful for canvas environment)
setLogLevel('debug');

// --- Logo Configuration ---
// Note: Place 'custom-logo.png' in the 'public/uploaded_files' folder
// In Vite, files in 'public' are served at the root, so this path works
const LOGO_SRC = "/uploaded_files/custom-logo.png"; 

// --- API ENDPOINT CONFIGURATION (Client-Side) ---
// In development (Vite dev server), use relative path (proxied by Vite)
// In production/preview, use full URL to API server
const getApiEndpoint = () => {
  // Check if we're in development mode (Vite dev server)
  if (import.meta.env.DEV) {
    // Vite dev server proxies /api to http://localhost:3001
    return '/api/analyze-scorecard';
  }
  // In production/preview, use full URL to API server
  // Default to localhost:3001, but can be overridden via environment variable
  const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001';
  return `${apiUrl}/api/analyze-scorecard`;
};
const VERCEL_API_ENDPOINT = getApiEndpoint(); 

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
    const strokeWidth = 12;
    const radius = 55;
    const circumference = 2 * Math.PI * radius;
    const cleanPercent = Math.min(100, Math.max(0, percent));
    const dashoffset = circumference - (cleanPercent / 100) * circumference;

    return (
        <div className="relative w-full aspect-square max-w-48 flex flex-col items-center justify-center mx-auto">
            <svg viewBox="0 0 130 130" className="w-full h-full transform -rotate-90" preserveAspectRatio="xMidYMid meet">
                {/* Background Track */}
                <circle
                    cx="65" cy="65" r={radius} fill="none" stroke="#374151" strokeWidth={strokeWidth}
                />
                {/* Progress Track */}
                <circle
                    cx="65" cy="65" r={radius} fill="none" stroke={color} strokeWidth={strokeWidth}
                    strokeDasharray={circumference}
                    strokeDashoffset={dashoffset}
                    strokeLinecap="round"
                    className="transition-all duration-1000 ease-out"
                />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <p className="text-lg sm:text-xl lg:text-2xl font-extrabold text-white leading-tight">{value}</p>
                <p className="text-[10px] sm:text-xs text-gray-400 text-center mt-0.5 sm:mt-1 leading-tight px-1">{title}</p>
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
        <div className="bg-gray-800 rounded-xl shadow-2xl border border-gray-700 overflow-hidden">
            <div 
                className="relative w-full aspect-[3/4] bg-gray-700 cursor-pointer hover:opacity-90 transition duration-200"
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
const DetailedStatsTable = ({ selectedRound, markingConfig }) => {
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
        } else if (label === 'U/D') {
            if (value === 'Yes' || value === 'Y' || value === 'y' || value === '✓' || value === '1') {
                colorClass = 'text-green-500';
                displayValue = '✓';
            } else if (value === 'No' || value === 'N' || value === 'n' || value === 'X' || value === 'x' || value === '0') {
                colorClass = 'text-red-400';
                displayValue = '✗';
            } else {
                displayValue = '-';
            }
        }

        return (
            <td className={`p-2 border border-gray-700 text-center text-sm ${colorClass}`}>
                {displayValue}
            </td>
        );
    };

    // Check if any extra stats are available in the data
    const hasUpDown = stats.some(s => s.upDown && s.upDown !== 'N/A');
    const hasTeeClub = stats.some(s => s.teeClub && s.teeClub !== 'N/A');
    const hasApproachClub = stats.some(s => s.approachClub && s.approachClub !== 'N/A');
    const hasChip = stats.some(s => s.chip && s.chip !== 'N/A');
    
    // Check for custom fields - detect from stats data (all fields starting with custom_)
    const allKeys = new Set();
    stats.forEach(s => {
        Object.keys(s).forEach(key => {
            if (key.startsWith('custom_') && s[key] && s[key] !== 'N/A') {
                allKeys.add(key);
            }
        });
    });
    
    const customFieldKeys = Array.from(allKeys).map(key => {
        // Extract readable name from custom_field_name format
        const displayName = key.replace('custom_', '').replace(/_/g, ' ').split(' ').map(w => 
            w.charAt(0).toUpperCase() + w.slice(1)
        ).join(' ');
        return {
            key,
            name: displayName,
            displayName: displayName.length > 8 ? displayName.substring(0, 7) + '...' : displayName
        };
    });
    const hasCustomFields = customFieldKeys.length > 0;

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
                        {hasUpDown && <th className="w-1/12 p-2 border border-gray-700">U/D</th>}
                        {hasTeeClub && <th className="w-1/12 p-2 border border-gray-700">Tee</th>}
                        {hasApproachClub && <th className="w-1/12 p-2 border border-gray-700">App</th>}
                        {hasChip && <th className="w-1/12 p-2 border border-gray-700">Chip</th>}
                        {customFieldKeys.map(({ key, displayName }) => (
                            <th key={key} className="w-1/12 p-2 border border-gray-700" title={displayName}>{displayName}</th>
                        ))}
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
                            {hasUpDown && <StatCell value={stat.upDown || 'N/A'} label="U/D" />}
                            {hasTeeClub && <td className="p-2 border border-gray-700 text-center text-sm text-gray-300">{stat.teeClub && stat.teeClub !== 'N/A' ? stat.teeClub : '-'}</td>}
                            {hasApproachClub && <td className="p-2 border border-gray-700 text-center text-sm text-gray-300">{stat.approachClub && stat.approachClub !== 'N/A' ? stat.approachClub : '-'}</td>}
                            {hasChip && <td className="p-2 border border-gray-700 text-center text-sm text-gray-300">{stat.chip && stat.chip !== 'N/A' ? stat.chip : '-'}</td>}
                            {customFieldKeys.map(({ key }) => (
                                <td key={key} className="p-2 border border-gray-700 text-center text-sm text-gray-300">
                                    {stat[key] && stat[key] !== 'N/A' ? stat[key] : '-'}
                                </td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );

    return (
        <div className="space-y-4 bg-gray-900 p-2 sm:p-4 rounded-xl shadow-inner border border-gray-800 mt-4">
            <h4 className="text-lg font-semibold text-white border-b border-gray-700 pb-2 flex items-center px-2"><ClipboardList className="w-5 h-5 mr-2"/> Detailed Hole Stats</h4>
            <div className={`grid ${isFullRound ? 'sm:grid-cols-2' : 'grid-cols-1'} gap-4`}>
                <div className="overflow-x-auto -mx-2 sm:mx-0">
                    <div className="min-w-full px-2 sm:px-0">
                        <TableSegment holes={front9} title="Front Nine (Holes 1-9)" />
                    </div>
                </div>
                {isFullRound && (
                    <div className="overflow-x-auto -mx-2 sm:mx-0">
                        <div className="min-w-full px-2 sm:px-0">
                            <TableSegment holes={back9} title="Back Nine (Holes 10-18)" />
                        </div>
                    </div>
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
  const [firebaseAuth, setFirebaseAuth] = useState(null);
  const [showAuth, setShowAuth] = useState(false); // Show auth screen if not logged in
  const [authMode, setAuthMode] = useState('signin'); // 'signin' or 'signup'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState(null);
  const [authLoading, setAuthLoading] = useState(false);
  const [selectedCustomStat, setSelectedCustomStat] = useState(null); // Selected custom statistic to display
  
  // --- History States ---
  const [roundHistory, setRoundHistory] = useState([]); // All fetched rounds (max 20)
  const [selectedRound, setSelectedRound] = useState(null); // Round whose details are shown on the dashboard
  
  // --- Marking Configuration States ---
  const [markingConfig, setMarkingConfig] = useState(() => {
    // Load from localStorage or use defaults
    const saved = localStorage.getItem('golfCardSync_markingConfig');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error('Failed to parse marking config:', e);
      }
    }
    // Default configuration
    return {
      nameFormats: {
        blankFirst: 'Blank first line',
        firstOnly: 'First name only',
        firstAndLast: 'First and last name'
      },
      fairway: {
        hit: ['F', 'f', 'Hit', 'HIT', 'hit', '-', '—', '–', 'Yes', 'yes', 'Y', 'y', '✓', '✔'],
        missed: ['No', 'no', 'N', 'n', 'X', 'x'],
        missedLeft: ['L', 'l', '←', 'Left', 'LEFT', 'left', 'Missed Left', 'MISSED LEFT'],
        missedRight: ['R', 'r', '→', 'Right', 'RIGHT', 'right', 'Missed Right', 'MISSED RIGHT']
      },
      greens: {
        hit: ['Hit', 'HIT', 'hit', 'G', 'g'],
        missed: ['Missed', 'MISSED', 'missed', 'Missed Long', 'Missed Short', 'Missed Left', 'Missed Right']
      },
      extraStats: {
        upDown: false,
        teeClub: false,
        approachClub: false,
        chip: false,
        customFields: [] // Array of { id, name, enabled, description, type }
      }
    };
  });

  // ------------------------------------
  // --- FIREBASE INITIALIZATION & AUTH ---
  // ------------------------------------
  useEffect(() => {
    // Import Firebase config from the config file
    import('./firebase-config.js').then(({ getFirebaseConfig, getAppId, getInitialAuthToken }) => {
      const appId = getAppId();
      const firebaseConfig = getFirebaseConfig();
      const token = getInitialAuthToken();
      
      if (Object.keys(firebaseConfig).length === 0 || !firebaseConfig.apiKey) {
          console.error("Firebase config is missing. Please set VITE_FIREBASE_* environment variables.");
          setIsAuthReady(true);
          return;
      }

      const app = initializeApp(firebaseConfig);
      const firestoreDb = getFirestore(app);
      
      // Connect to Firestore emulator if enabled (works in both dev and preview/production)
      // Check if we should use emulator (default to true unless explicitly disabled)
      const useEmulator = import.meta.env.VITE_USE_FIREBASE_EMULATOR !== 'false';
      
      if (useEmulator) {
        try {
          connectFirestoreEmulator(firestoreDb, 'localhost', 8080);
          console.log('✓ Connected to Firestore emulator at localhost:8080');
        } catch (error) {
          // Emulator already connected, ignore error
          if (!error.message?.includes('has already been called') && !error.message?.includes('Cannot call connectFirestoreEmulator')) {
            console.warn('Failed to connect to Firestore emulator:', error);
          }
        }
      }
      
      const firebaseAuth = getAuth(app);
      setDb(firestoreDb);
      setFirebaseAuth(firebaseAuth);
      
      // Auth listener handles the final state determination
      const unsubscribe = onAuthStateChanged(firebaseAuth, (user) => {
          if (user) {
              setUserId(user.uid);
              setIsAuthReady(true);
              setShowAuth(false);
          } else {
              setIsAuthReady(true);
              setShowAuth(true);
          }
      });

      if (token) {
          signInWithCustomToken(firebaseAuth, token)
              .catch(error => {
                  console.error("Custom token sign-in failed:", error);
              });
      }

      return () => unsubscribe(); // Cleanup auth listener
    }).catch(error => {
      console.error("Failed to load Firebase config:", error);
      setIsAuthReady(true);
    });
  }, []);

  // ------------------------------------
  // --- FIREBASE DATA FETCHING (History) ---
  // ------------------------------------
  useEffect(() => {
    // Only proceed if DB is initialized, user is signed in, and auth is settled
    if (!db || !userId || !isAuthReady) return;

    // Get appId from config
    import('./firebase-config.js').then(({ getAppId }) => {
      const appId = getAppId();
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
    }).catch(error => {
      console.error("Failed to load app config:", error);
    });
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


    // Helper function to check if a value matches any in an array (case-insensitive)
    const matchesAny = (value, array) => {
      if (!value || typeof value !== 'string') return false;
      return array.some(mark => value.toString().toLowerCase() === mark.toLowerCase());
    };

    // 2. Calculate Overall Averages (Fairways, GIR, Putts, Extra Stats)
    // Filter rounds: only include rounds that have at least one of PUTTS, FW, or GIR data
    // Score average will still use all rounds
    const roundsWithStats = firstPlayerRounds.filter(player => {
        // Check if this round has any PUTTS, FW, or GIR data
        return player.stats.some(stat => {
            const hasPutts = stat.putts && stat.putts > 0 && stat.putts !== -1;
            const hasFairway = stat.fairway && stat.fairway !== 'N/A';
            const hasGreens = stat.greens && stat.greens !== 'N/A';
            return hasPutts || hasFairway || hasGreens;
        });
    });

    let totalFairwaysHit = 0;
    let totalFairwaysMissedLeft = 0;
    let totalFairwaysMissedRight = 0;
    let totalFairwayOpportunities = 0;
    let totalGreensHit = 0;
    let totalGreenOpportunities = 0;
    let totalPutts = 0;
    let totalHolesPlayed = 0;
    
    // Extra stats tracking
    let totalUpDownMade = 0;
    let totalUpDownOpportunities = 0;
    let teeClubCounts = {};
    let approachClubCounts = {};
    let chipClubCounts = {};
    let customFieldCounts = {}; // Track custom field counts: { fieldKey: { value: count } }

    // Only process PUTTS, FW, GIR stats for rounds that have at least one of these stats
    roundsWithStats.forEach(player => {
        player.stats.forEach(stat => {
            if (stat.score > 0) {
                totalHolesPlayed++;
                if (stat.putts > 0 && stat.putts !== -1) totalPutts += stat.putts;

                // Fairway calculation using configurable marks
                if (stat.fairway && stat.fairway !== 'N/A') {
                    totalFairwayOpportunities++;
                    if (matchesAny(stat.fairway, markingConfig.fairway.hit)) {
                        totalFairwaysHit++;
                    } else if (matchesAny(stat.fairway, markingConfig.fairway.missedLeft || [])) {
                        totalFairwaysMissedLeft++;
                    } else if (matchesAny(stat.fairway, markingConfig.fairway.missedRight || [])) {
                        totalFairwaysMissedRight++;
                    }
                    // Note: fairway.missed (No, N, X) doesn't count as hit or directional miss, just as a missed opportunity
                }

                // Greens calculation using configurable marks
                if (stat.greens && stat.greens !== 'N/A') {
                    totalGreenOpportunities++;
                    if (matchesAny(stat.greens, markingConfig.greens.hit)) {
                        totalGreensHit++;
                    }
                }
                
                // Extra stats tracking
                if (stat.upDown && stat.upDown !== 'N/A') {
                    totalUpDownOpportunities++;
                    if (matchesAny(stat.upDown, ['Yes', 'yes', 'Y', 'y', '✓', '✔', '1'])) {
                        totalUpDownMade++;
                    }
                }
                
                if (stat.teeClub && stat.teeClub !== 'N/A') {
                    const club = stat.teeClub.trim();
                    teeClubCounts[club] = (teeClubCounts[club] || 0) + 1;
                }
                
                if (stat.approachClub && stat.approachClub !== 'N/A') {
                    const club = stat.approachClub.trim();
                    approachClubCounts[club] = (approachClubCounts[club] || 0) + 1;
                }
                
                if (stat.chip && stat.chip !== 'N/A') {
                    const club = stat.chip.trim();
                    chipClubCounts[club] = (chipClubCounts[club] || 0) + 1;
                }
                
                // Custom fields tracking
                if (markingConfig.extraStats?.customFields && Array.isArray(markingConfig.extraStats.customFields)) {
                    markingConfig.extraStats.customFields.forEach((field) => {
                        if (field.enabled && field.name) {
                            // Create the key as it would appear in the API response (custom_fieldname)
                            const fieldKey = `custom_${field.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')}`;
                            if (stat[fieldKey] && stat[fieldKey] !== 'N/A') {
                                const value = stat[fieldKey].trim();
                                if (!customFieldCounts[fieldKey]) customFieldCounts[fieldKey] = {};
                                customFieldCounts[fieldKey][value] = (customFieldCounts[fieldKey][value] || 0) + 1;
                            }
                        }
                    });
                }
            }
        });
    });

    const fairwayPct = totalFairwayOpportunities > 0 ? ((totalFairwaysHit / totalFairwayOpportunities) * 100) : 0;
    const fairwayMissedLeftPct = totalFairwayOpportunities > 0 ? ((totalFairwaysMissedLeft / totalFairwayOpportunities) * 100) : 0;
    const fairwayMissedRightPct = totalFairwayOpportunities > 0 ? ((totalFairwaysMissedRight / totalFairwayOpportunities) * 100) : 0;
    const greensPct = totalGreenOpportunities > 0 ? ((totalGreensHit / totalGreenOpportunities) * 100) : 0;
    const puttsPerHole = totalHolesPlayed > 0 ? (totalPutts / totalHolesPlayed) : 0;
    const upDownPct = totalUpDownOpportunities > 0 ? ((totalUpDownMade / totalUpDownOpportunities) * 100) : 0;
    
    // Get most common clubs
    const mostCommonTeeClub = Object.keys(teeClubCounts).length > 0 
        ? Object.entries(teeClubCounts).sort((a, b) => b[1] - a[1])[0][0]
        : null;
    const mostCommonApproachClub = Object.keys(approachClubCounts).length > 0
        ? Object.entries(approachClubCounts).sort((a, b) => b[1] - a[1])[0][0]
        : null;
    const mostCommonChipClub = Object.keys(chipClubCounts).length > 0
        ? Object.entries(chipClubCounts).sort((a, b) => b[1] - a[1])[0][0]
        : null;


    // Normalize putts for donut chart (lower is better)
    // Scale: 1.0 putt = 100%, 2.0 putts = 50%, 3.0 putts = 0%
    const puttsPercent = puttsPerHole > 0 ? Math.max(0, Math.min(100, ((3 - puttsPerHole) / 2) * 100)) : 0;
    
    // Normalize score for donut chart (lower is better)
    // Scale: 60 = 100%, 72 (par) = 70%, 90 = 25%, 100 = 0%
    const scoreValue = avgScore && avgScore !== 'N/A' ? parseFloat(avgScore) : 72;
    const scorePercent = Math.max(0, Math.min(100, ((100 - scoreValue) / 40) * 100));

    return {
        avgScore: avgScore ? avgScore.toFixed(1) : 'N/A',
        scorePercent: scorePercent.toFixed(1),
        fairwayPct: fairwayPct.toFixed(1),
        fairwayMissedLeftPct: fairwayMissedLeftPct.toFixed(1),
        fairwayMissedRightPct: fairwayMissedRightPct.toFixed(1),
        greensPct: greensPct.toFixed(1),
        puttsPerHole: puttsPerHole.toFixed(2),
        puttsPercent: puttsPercent.toFixed(1),
        puttTotal: totalPutts,
        totalRounds: firstPlayerRounds.length,
        bestScoresCount: bestScores.length,
        // Extra stats
        upDownPct: upDownPct.toFixed(1),
        upDownMade: totalUpDownMade,
        upDownOpportunities: totalUpDownOpportunities,
        mostCommonTeeClub,
        mostCommonApproachClub,
        mostCommonChipClub,
        teeClubCounts,
        approachClubCounts,
        chipClubCounts,
        customFields: markingConfig.extraStats?.customFields || [],
        customFieldCounts,
    };
  }, [roundHistory, markingConfig]);


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
        nameFormats: markingConfig.nameFormats || {}, // Include name format configuration
        extraStats: markingConfig.extraStats || {}, // Include extra stats configuration
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

      // Check if response is HTML (indicates wrong endpoint or proxy issue)
      const contentType = response.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        const text = await response.text();
        if (text.trim().startsWith('<!doctype') || text.trim().startsWith('<!DOCTYPE') || text.trim().startsWith('<html')) {
          throw new Error('Received HTML instead of JSON. The API server may not be running or the proxy is not configured correctly. Make sure to access the app via the Vite dev server (http://localhost:5173) or ensure the API server is running on port 3001.');
        }
      }

      if (!response.ok) {
        // The server returned an error. Attempt to parse the error message.
        const errorText = await response.text();
        try {
          // Try parsing as JSON, which is the expected error format from our function
          const errorJson = JSON.parse(errorText);
          throw new Error(errorJson.error || errorJson.detail || `Server responded with status ${response.status}`);
        } catch (e) {
          // If it's not JSON, it's likely a generic error page (HTML/text)
          throw new Error(errorText.substring(0, 150) || `Server responded with status ${response.status}`);
        }
      }
      
      // Verify we can parse as JSON before attempting
      let parsedData;
      try {
        parsedData = await response.json();
      } catch (jsonError) {
        const text = await response.text();
        if (text.trim().startsWith('<!doctype') || text.trim().startsWith('<!DOCTYPE') || text.trim().startsWith('<html')) {
          throw new Error('Received HTML instead of JSON. The API endpoint may not be accessible. Make sure the API server is running on port 3001 and you are accessing the app via the Vite dev server.');
        }
        throw new Error(`Failed to parse JSON response: ${jsonError.message}`);
      }
      console.log("Parsed data from API (client-side):", parsedData); // Log parsed data on client

      // --- Save data to Firestore (Client-side) ---
      if (db && userId) {
          const { getAppId } = await import('./firebase-config.js');
          const appId = getAppId();
          // Saves to: /artifacts/{appId}/users/{userId}/scorecards
          const path = `artifacts/${appId}/users/${userId}/scorecards`;
          
          await addDoc(collection(db, path), {
              data: parsedData.data || parsedData, // Handle both response formats
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

  const Header = ({ title }) => {
    const [logoLoaded, setLogoLoaded] = useState(false);
    
    return (
      <div className="flex items-center justify-center p-4 bg-gray-900 shadow-lg sticky top-0 z-20 border-b border-green-800">
        <div className="flex items-center space-x-3">
          <img 
              src={LOGO_SRC} 
              alt="GolfCardSync Logo" 
              className={`h-8 w-auto sm:h-10 object-contain ${logoLoaded ? '' : 'hidden'}`}
              onLoad={() => setLogoLoaded(true)}
              onError={(e) => { 
                  console.warn('Logo image not found at:', LOGO_SRC);
                  console.warn('Please place your logo at: public/uploaded_files/custom-logo.png');
                  e.target.style.display = 'none';
              }}
          />
          <h1 className="text-xl font-bold text-white sm:text-2xl">{title}</h1>
        </div>
      </div>
    );
  };
  
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
      // Get last 8 rounds for Recent Rounds section
      const recentRounds = roundHistory.slice(0, 8);
      
      // Get enabled custom statistics
      const enabledCustomStats = (markingConfig.extraStats?.customFields || []).filter(field => field.enabled && field.name);
      
      return (
        <div className="p-4 space-y-6 pb-20"> {/* pb-20 for bottom nav padding */}
            <h2 className="text-2xl font-bold text-green-400 border-b border-gray-700 pb-2 flex items-center"><BarChart3 className="w-6 h-6 mr-2"/> Overall Averages</h2>

            {dashboardStats ? (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6">
                    {/* Performance Tracking Section */}
                    <div className="bg-gray-800 p-4 sm:p-6 rounded-xl shadow-2xl border border-gray-700 space-y-4 sm:space-y-6 min-h-[600px]">
                        <h3 className="text-lg sm:text-xl font-bold text-white mb-3 sm:mb-4 text-center">Performance Tracking (Last {roundHistory.length} Rounds)</h3>
                        
                        {/* Custom Statistics Radio Buttons */}
                        {enabledCustomStats.length > 0 && (
                            <div className="mb-4 p-3 bg-gray-700 rounded-lg border border-gray-600">
                                <p className="text-sm font-medium text-gray-300 mb-2">Display Custom Statistic:</p>
                                <div className="space-y-2">
                                    <label className="flex items-center space-x-2 cursor-pointer">
                                        <input
                                            type="radio"
                                            name="customStat"
                                            checked={selectedCustomStat === null}
                                            onChange={() => setSelectedCustomStat(null)}
                                            className="w-4 h-4 text-green-500 bg-gray-800 border-gray-600 focus:ring-green-500"
                                        />
                                        <span className="text-sm text-gray-300">None</span>
                                    </label>
                                    {enabledCustomStats.map((field) => {
                                        const fieldKey = `custom_${field.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')}`;
                                        const counts = dashboardStats.customFieldCounts?.[fieldKey];
                                        const hasData = counts && Object.keys(counts).length > 0;
                                        
                                        return (
                                            <label key={field.id || field.name} className="flex items-center space-x-2 cursor-pointer">
                                                <input
                                                    type="radio"
                                                    name="customStat"
                                                    checked={selectedCustomStat === fieldKey}
                                                    onChange={() => setSelectedCustomStat(fieldKey)}
                                                    className="w-4 h-4 text-green-500 bg-gray-800 border-gray-600 focus:ring-green-500"
                                                    disabled={!hasData}
                                                />
                                                <span className={`text-sm ${hasData ? 'text-gray-300' : 'text-gray-500'}`}>
                                                    {field.name} {!hasData && '(No data)'}
                                                </span>
                                            </label>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                    
                    {/* Avg Score Box */}
                    <div className="text-center p-4 sm:p-6 bg-gray-700 rounded-xl border border-gray-600">
                        <p className="text-sm sm:text-base font-medium text-gray-400 mb-2">Avg. Score (Best {dashboardStats.bestScoresCount})</p>
                        <p className="text-4xl sm:text-5xl font-extrabold text-green-400">{dashboardStats.avgScore}</p>
                    </div>
                    
                    {/* Row 1: GIR Hit, Avg Putt */}
                    <div className="grid grid-cols-2 gap-3 sm:gap-4">
                        <DoughnutChart 
                            percent={parseFloat(dashboardStats.greensPct)} 
                            title="GIR Hit" 
                            color="#facc15"
                            value={`${dashboardStats.greensPct}%`}
                        />
                        <DoughnutChart 
                            percent={parseFloat(dashboardStats.puttsPercent)} 
                            title="Avg. Putts/Hole" 
                            color="#eab308"
                            value={dashboardStats.puttsPerHole}
                        />
                    </div>
                    
                    {/* Row 2: Fairway Hit */}
                    <div className="grid grid-cols-2 gap-3 sm:gap-4">
                        <DoughnutChart 
                            percent={parseFloat(dashboardStats.fairwayPct)} 
                            title="Fairways Hit" 
                            color="#3b82f6"
                            value={`${dashboardStats.fairwayPct}%`}
                        />
                    </div>
                    
                    {/* Row 3: Fairways Left, Fairways Right OR Custom Stat */}
                    <div className="grid grid-cols-2 gap-3 sm:gap-4">
                        {selectedCustomStat && dashboardStats.customFieldCounts?.[selectedCustomStat] ? (
                            <>
                                <DoughnutChart 
                                    percent={50} 
                                    title={enabledCustomStats.find(f => {
                                        const fieldKey = `custom_${f.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')}`;
                                        return fieldKey === selectedCustomStat;
                                    })?.name || 'Custom Stat'} 
                                    color="#8b5cf6"
                                    value={(() => {
                                        const counts = dashboardStats.customFieldCounts[selectedCustomStat];
                                        const mostCommon = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
                                        return mostCommon ? mostCommon[0] : 'N/A';
                                    })()}
                                />
                                <DoughnutChart 
                                    percent={parseFloat(dashboardStats.fairwayMissedLeftPct)} 
                                    title="Fairways Missed Left" 
                                    color="#f97316"
                                    value={`${dashboardStats.fairwayMissedLeftPct}%`}
                                />
                            </>
                        ) : (
                            <>
                                <DoughnutChart 
                                    percent={parseFloat(dashboardStats.fairwayMissedLeftPct)} 
                                    title="Fairways Missed Left" 
                                    color="#f97316"
                                    value={`${dashboardStats.fairwayMissedLeftPct}%`}
                                />
                                <DoughnutChart 
                                    percent={parseFloat(dashboardStats.fairwayMissedRightPct)} 
                                    title="Fairways Missed Right" 
                                    color="#ef4444"
                                    value={`${dashboardStats.fairwayMissedRightPct}%`}
                                />
                            </>
                        )}
                    </div>
                    
                    {/* Custom Stat Display Box */}
                    {selectedCustomStat && dashboardStats.customFieldCounts?.[selectedCustomStat] && (
                        <div className="p-4 bg-gray-700 rounded-xl border border-gray-600">
                            <p className="text-sm font-medium text-gray-400 mb-2 text-center">
                                {enabledCustomStats.find(f => {
                                    const fieldKey = `custom_${f.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')}`;
                                    return fieldKey === selectedCustomStat;
                                })?.name || 'Custom Stat'} - Distribution
                            </p>
                            <div className="space-y-2">
                                {Object.entries(dashboardStats.customFieldCounts[selectedCustomStat])
                                    .sort((a, b) => b[1] - a[1])
                                    .map(([value, count]) => (
                                        <div key={value} className="flex items-center justify-between text-sm">
                                            <span className="text-gray-300">{value}</span>
                                            <span className="text-green-400 font-bold">{count} times</span>
                                        </div>
                                    ))}
                            </div>
                        </div>
                    )}
                    
                    <div className="mt-4 sm:mt-6 pt-4 border-t border-gray-700 text-center">
                        <p className="text-xs sm:text-sm font-medium text-gray-400">Total Rounds Recorded</p>
                        <p className="text-2xl sm:text-3xl font-bold text-white mt-1">{dashboardStats.totalRounds}</p>
                    </div>
                    </div>
                    
                    {/* Recent Rounds Section */}
                    <div className="bg-gray-800 p-4 sm:p-6 rounded-xl shadow-2xl border border-gray-700 min-h-[600px] flex flex-col lg:sticky lg:top-4 lg:self-start">
                        <h3 className="text-lg sm:text-xl font-bold text-white mb-3 sm:mb-4 text-center flex items-center justify-center">
                            <Clock className="w-5 h-5 mr-2"/> Recent Rounds
                        </h3>
                        
                        {recentRounds.length > 0 ? (
                            <div className="space-y-2 sm:space-y-3 flex-grow overflow-y-auto max-h-[calc(100vh-200px)]">
                                {recentRounds.map((round) => {
                                    const player = round.data?.players?.[0];
                                    const score = player?.totalScore || 'N/A';
                                    const courseName = round.data?.courseName || 'Unknown Course';
                                    const dateStr = round.timestamp instanceof Date 
                                        ? round.timestamp.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                                        : round.timestamp?.toDate 
                                        ? round.timestamp.toDate().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                                        : 'N/A';
                                    
                                    return (
                                        <div
                                            key={round.id}
                                            onClick={() => {
                                                setSelectedRound(round);
                                                setCurrentTab('history');
                                            }}
                                            className="flex items-center gap-3 p-3 bg-gray-700 rounded-lg cursor-pointer hover:bg-gray-600 transition duration-200 active:scale-[0.98] border border-gray-600"
                                        >
                                            {/* Small Image Preview */}
                                            <div className="flex-shrink-0 w-16 h-20 bg-gray-800 rounded border border-gray-600 overflow-hidden">
                                                {round.image ? (
                                                    <img
                                                        src={`data:image/jpeg;base64,${round.image}`}
                                                        alt={courseName}
                                                        className="w-full h-full object-cover"
                                                    />
                                                ) : (
                                                    <div className="w-full h-full flex items-center justify-center text-gray-500 text-xs">
                                                        No Image
                                                    </div>
                                                )}
                                            </div>
                                            
                                            {/* Score and Info */}
                                            <div className="flex-grow min-w-0">
                                                <div className="flex items-center justify-between mb-1">
                                                    <span className="text-2xl font-bold text-green-400">{score}</span>
                                                    <span className="text-xs text-gray-400">{dateStr}</span>
                                                </div>
                                                <p className="text-sm text-gray-300 truncate">{courseName}</p>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        ) : (
                            <div className="text-center p-8 text-gray-400">
                                <Clock className="w-8 h-8 mx-auto mb-2 text-gray-500"/>
                                <p>No rounds recorded yet.</p>
                                <p className="text-sm mt-1">Upload a scorecard to get started!</p>
                            </div>
                        )}
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

  // Authentication handlers
  const handleSignUp = async (e) => {
    e.preventDefault();
    if (!firebaseAuth) return;
    
    setAuthLoading(true);
    setAuthError(null);
    
    try {
      await createUserWithEmailAndPassword(firebaseAuth, email, password);
      setEmail('');
      setPassword('');
      setAuthMode('signin');
    } catch (error) {
      setAuthError(error.message || 'Failed to create account. Please try again.');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleSignIn = async (e) => {
    e.preventDefault();
    if (!firebaseAuth) return;
    
    setAuthLoading(true);
    setAuthError(null);
    
    try {
      await signInWithEmailAndPassword(firebaseAuth, email, password);
      setEmail('');
      setPassword('');
    } catch (error) {
      setAuthError(error.message || 'Failed to sign in. Please check your credentials.');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleSignOut = async () => {
    if (!firebaseAuth) return;
    try {
      await signOut(firebaseAuth);
      setShowAuth(true);
    } catch (error) {
      console.error('Sign out error:', error);
    }
  };

  const renderAuth = () => {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-gray-900">
        <div className="w-full max-w-md bg-gray-800 rounded-xl shadow-2xl border border-gray-700 p-6 sm:p-8">
          <div className="text-center mb-6">
            <h1 className="text-3xl font-bold text-green-400 mb-2">GolfCardSync</h1>
            <p className="text-gray-400">Track and analyze your golf scores</p>
          </div>
          
          <div className="flex mb-6 bg-gray-700 rounded-lg p-1">
            <button
              onClick={() => {
                setAuthMode('signin');
                setAuthError(null);
              }}
              className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition ${
                authMode === 'signin'
                  ? 'bg-green-600 text-white'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              Sign In
            </button>
            <button
              onClick={() => {
                setAuthMode('signup');
                setAuthError(null);
              }}
              className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition ${
                authMode === 'signup'
                  ? 'bg-green-600 text-white'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              Sign Up
            </button>
          </div>

          <form onSubmit={authMode === 'signup' ? handleSignUp : handleSignIn} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full p-3 bg-gray-700 text-white rounded-lg border border-gray-600 focus:border-green-500 focus:outline-none"
                placeholder="your@email.com"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                className="w-full p-3 bg-gray-700 text-white rounded-lg border border-gray-600 focus:border-green-500 focus:outline-none"
                placeholder="••••••••"
              />
            </div>

            {authError && (
              <div className="p-3 bg-red-900/50 border border-red-700 rounded-lg text-red-400 text-sm">
                {authError}
              </div>
            )}

            <button
              type="submit"
              disabled={authLoading || !email || !password}
              className={`w-full p-3 rounded-lg font-bold transition ${
                authLoading || !email || !password
                  ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
                  : 'bg-green-600 hover:bg-green-700 text-white'
              }`}
            >
              {authLoading ? (
                <span className="flex items-center justify-center">
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                  {authMode === 'signup' ? 'Creating Account...' : 'Signing In...'}
                </span>
              ) : (
                authMode === 'signup' ? 'Create Account' : 'Sign In'
              )}
            </button>
          </form>
        </div>
      </div>
    );
  };

  const renderProfile = () => {
    const handleConfigChange = (category, type, value) => {
      const newConfig = {
        ...markingConfig,
        [category]: {
          ...markingConfig[category],
          [type]: value.split(',').map(s => s.trim()).filter(s => s.length > 0)
        }
      };
      setMarkingConfig(newConfig);
      localStorage.setItem('golfCardSync_markingConfig', JSON.stringify(newConfig));
    };

    return (
      <div className="p-4 space-y-6 pb-20">
          <h2 className="text-2xl font-bold text-green-400 border-b border-gray-700 pb-2 flex items-center"><User className="w-6 h-6 mr-2"/> User Profile</h2>
          
          {/* Marking Configuration Section */}
          <div className="bg-gray-800 p-6 rounded-xl shadow-2xl border border-gray-700 space-y-6">
              <h3 className="text-xl font-semibold text-white">Scorecard Marking Configuration</h3>
              <p className="text-sm text-gray-400">Configure how your scorecard is read and what marks mean.</p>
              
              {/* Name Format Configuration */}
              <div className="space-y-4 pb-4 border-b border-gray-700">
                  <h4 className="text-lg font-semibold text-green-400">Player Name Format</h4>
                  <p className="text-sm text-gray-400">Configure how player names appear on your scorecard. These descriptions help the AI identify and extract player names correctly.</p>
                  
                  <div className="space-y-3">
                      <div>
                          <label className="block text-sm font-medium text-gray-300 mb-1">Name 1</label>
                          <input
                              type="text"
                              value={markingConfig.nameFormats?.blankFirst || ''}
                              onChange={(e) => {
                                  const newConfig = {
                                      ...markingConfig,
                                      nameFormats: {
                                          ...markingConfig.nameFormats,
                                          blankFirst: e.target.value
                                      }
                                  };
                                  setMarkingConfig(newConfig);
                                  localStorage.setItem('golfCardSync_markingConfig', JSON.stringify(newConfig));
                              }}
                              className="w-full p-2 bg-gray-700 text-white rounded-lg border border-gray-600 focus:border-green-500 focus:outline-none"
                              placeholder="The first line on the scorecard is blank, player name is on the second line"
                          />
                      </div>
                      
                      <div>
                          <label className="block text-sm font-medium text-gray-300 mb-1">Name 2</label>
                          <input
                              type="text"
                              value={markingConfig.nameFormats?.firstOnly || ''}
                              onChange={(e) => {
                                  const newConfig = {
                                      ...markingConfig,
                                      nameFormats: {
                                          ...markingConfig.nameFormats,
                                          firstOnly: e.target.value
                                      }
                                  };
                                  setMarkingConfig(newConfig);
                                  localStorage.setItem('golfCardSync_markingConfig', JSON.stringify(newConfig));
                              }}
                              className="w-full p-2 bg-gray-700 text-white rounded-lg border border-gray-600 focus:border-green-500 focus:outline-none"
                              placeholder="Player name appears as first name only (e.g., 'John')"
                          />
                      </div>
                      
                      <div>
                          <label className="block text-sm font-medium text-gray-300 mb-1">Name 3</label>
                          <input
                              type="text"
                              value={markingConfig.nameFormats?.firstAndLast || ''}
                              onChange={(e) => {
                                  const newConfig = {
                                      ...markingConfig,
                                      nameFormats: {
                                          ...markingConfig.nameFormats,
                                          firstAndLast: e.target.value
                                      }
                                  };
                                  setMarkingConfig(newConfig);
                                  localStorage.setItem('golfCardSync_markingConfig', JSON.stringify(newConfig));
                              }}
                              className="w-full p-2 bg-gray-700 text-white rounded-lg border border-gray-600 focus:border-green-500 focus:outline-none"
                              placeholder="Player name appears as full name (e.g., 'John Smith')"
                          />
                      </div>
                  </div>
              </div>
              
              {/* Fairway Marks */}
              <div className="space-y-4">
                  <h4 className="text-lg font-semibold text-green-400 border-b border-gray-700 pb-2">Fairway Marks</h4>
                  
                  <div className="space-y-3">
                      <div>
                          <label className="block text-sm font-medium text-gray-300 mb-1">Fairway Hit (e.g., F, Hit, -, Yes, ✓)</label>
                          <input
                              type="text"
                              value={markingConfig.fairway.hit.join(', ')}
                              onChange={(e) => handleConfigChange('fairway', 'hit', e.target.value)}
                              className="w-full p-2 bg-gray-700 text-white rounded-lg border border-gray-600 focus:border-green-500 focus:outline-none"
                              placeholder="F, f, Hit, HIT, -, —, Yes, y, ✓"
                          />
                      </div>
                      
                      <div>
                          <label className="block text-sm font-medium text-gray-300 mb-1">Fairway Missed (e.g., No, N, X)</label>
                          <input
                              type="text"
                              value={(markingConfig.fairway.missed || []).join(', ')}
                              onChange={(e) => handleConfigChange('fairway', 'missed', e.target.value)}
                              className="w-full p-2 bg-gray-700 text-white rounded-lg border border-gray-600 focus:border-green-500 focus:outline-none"
                              placeholder="No, no, N, n, X, x"
                          />
                      </div>
                      
                      <div>
                          <label className="block text-sm font-medium text-gray-300 mb-1">Missed Left (e.g., L, ←, Left)</label>
                          <input
                              type="text"
                              value={markingConfig.fairway.missedLeft.join(', ')}
                              onChange={(e) => handleConfigChange('fairway', 'missedLeft', e.target.value)}
                              className="w-full p-2 bg-gray-700 text-white rounded-lg border border-gray-600 focus:border-green-500 focus:outline-none"
                              placeholder="L, l, ←, Left, Missed Left"
                          />
                      </div>
                      
                      <div>
                          <label className="block text-sm font-medium text-gray-300 mb-1">Missed Right (e.g., R, →, Right)</label>
                          <input
                              type="text"
                              value={markingConfig.fairway.missedRight.join(', ')}
                              onChange={(e) => handleConfigChange('fairway', 'missedRight', e.target.value)}
                              className="w-full p-2 bg-gray-700 text-white rounded-lg border border-gray-600 focus:border-green-500 focus:outline-none"
                              placeholder="R, r, →, Right, Missed Right"
                          />
                      </div>
                  </div>
              </div>
              
              {/* Greens Marks */}
              <div className="space-y-4 pt-4 border-t border-gray-700">
                  <h4 className="text-lg font-semibold text-green-400 border-b border-gray-700 pb-2">Greens in Regulation (GIR) Marks</h4>
                  
                  <div className="space-y-3">
                      <div>
                          <label className="block text-sm font-medium text-gray-300 mb-1">Green Hit (e.g., Hit, G)</label>
                          <input
                              type="text"
                              value={markingConfig.greens.hit.join(', ')}
                              onChange={(e) => handleConfigChange('greens', 'hit', e.target.value)}
                              className="w-full p-2 bg-gray-700 text-white rounded-lg border border-gray-600 focus:border-green-500 focus:outline-none"
                              placeholder="Hit, HIT, G, g"
                          />
                      </div>
                      
                      <div>
                          <label className="block text-sm font-medium text-gray-300 mb-1">Green Missed (e.g., Missed, Missed Long)</label>
                          <input
                              type="text"
                              value={markingConfig.greens.missed.join(', ')}
                              onChange={(e) => handleConfigChange('greens', 'missed', e.target.value)}
                              className="w-full p-2 bg-gray-700 text-white rounded-lg border border-gray-600 focus:border-green-500 focus:outline-none"
                              placeholder="Missed, Missed Long, Missed Short, Missed Left, Missed Right"
                          />
                      </div>
                  </div>
              </div>
              
              {/* Custom Statistics */}
              <div className="space-y-4 pt-4 border-t border-gray-700">
                  <h4 className="text-lg font-semibold text-green-400 border-b border-gray-700 pb-2">Custom Statistics</h4>
                  <p className="text-sm text-gray-400">Add custom fields to track additional statistics from your scorecard.</p>
                  
                  {/* Custom Fields */}
                  <div className="space-y-3">
                      {(markingConfig.extraStats?.customFields || []).map((field, index) => (
                          <div key={field.id || index} className="p-3 bg-gray-700 rounded-lg border border-gray-600">
                              <div className="flex items-start space-x-3">
                                  <input
                                      type="checkbox"
                                      checked={field.enabled || false}
                                      onChange={(e) => {
                                          const updatedFields = [...(markingConfig.extraStats?.customFields || [])];
                                          updatedFields[index] = { ...field, enabled: e.target.checked };
                                          const updatedConfig = {
                                              ...markingConfig,
                                              extraStats: {
                                                  ...(markingConfig.extraStats || {}),
                                                  customFields: updatedFields
                                              }
                                          };
                                          setMarkingConfig(updatedConfig);
                                          localStorage.setItem('golfCardSync_markingConfig', JSON.stringify(updatedConfig));
                                      }}
                                      className="w-5 h-5 rounded border-gray-600 bg-gray-800 text-green-500 focus:ring-green-500 focus:ring-2 mt-1 flex-shrink-0"
                                  />
                                  <div className="flex-grow space-y-2">
                                      <input
                                          type="text"
                                          value={field.name || ''}
                                          onChange={(e) => {
                                              const updatedFields = [...(markingConfig.extraStats?.customFields || [])];
                                              updatedFields[index] = { ...field, name: e.target.value };
                                              const updatedConfig = {
                                                  ...markingConfig,
                                                  extraStats: {
                                                      ...(markingConfig.extraStats || {}),
                                                      customFields: updatedFields
                                                  }
                                              };
                                              setMarkingConfig(updatedConfig);
                                              localStorage.setItem('golfCardSync_markingConfig', JSON.stringify(updatedConfig));
                                          }}
                                          className="w-full p-2 bg-gray-800 text-white rounded-lg border border-gray-600 focus:border-green-500 focus:outline-none"
                                          placeholder="Field name (e.g., Sand Save, Penalty, Distance)"
                                      />
                                      <input
                                          type="text"
                                          value={field.description || ''}
                                          onChange={(e) => {
                                              const updatedFields = [...(markingConfig.extraStats?.customFields || [])];
                                              updatedFields[index] = { ...field, description: e.target.value };
                                              const updatedConfig = {
                                                  ...markingConfig,
                                                  extraStats: {
                                                      ...(markingConfig.extraStats || {}),
                                                      customFields: updatedFields
                                                  }
                                              };
                                              setMarkingConfig(updatedConfig);
                                              localStorage.setItem('golfCardSync_markingConfig', JSON.stringify(updatedConfig));
                                          }}
                                          className="w-full p-2 bg-gray-800 text-white rounded-lg border border-gray-600 focus:border-green-500 focus:outline-none text-sm"
                                          placeholder="Description for AI (e.g., 'Sand save attempts and success')"
                                      />
                                  </div>
                                  <button
                                      onClick={() => {
                                          const updatedFields = (markingConfig.extraStats?.customFields || []).filter((_, i) => i !== index);
                                          const updatedConfig = {
                                              ...markingConfig,
                                              extraStats: {
                                                  ...(markingConfig.extraStats || {}),
                                                  customFields: updatedFields
                                              }
                                          };
                                          setMarkingConfig(updatedConfig);
                                          localStorage.setItem('golfCardSync_markingConfig', JSON.stringify(updatedConfig));
                                      }}
                                      className="p-2 text-red-400 hover:text-red-300 hover:bg-gray-600 rounded transition duration-200 flex-shrink-0"
                                      title="Remove field"
                                  >
                                      <X className="w-5 h-5" />
                                  </button>
                              </div>
                          </div>
                      ))}
                      
                      <button
                          onClick={() => {
                              const newField = {
                                  id: Date.now().toString(),
                                  name: '',
                                  enabled: true,
                                  description: '',
                                  type: 'string'
                              };
                              const updatedFields = [...(markingConfig.extraStats?.customFields || []), newField];
                              const updatedConfig = {
                                  ...markingConfig,
                                  extraStats: {
                                      ...(markingConfig.extraStats || {}),
                                      customFields: updatedFields
                                  }
                              };
                              setMarkingConfig(updatedConfig);
                              localStorage.setItem('golfCardSync_markingConfig', JSON.stringify(updatedConfig));
                          }}
                          className="w-full p-2 bg-gray-700 hover:bg-gray-600 text-green-400 rounded-lg border border-gray-600 transition duration-200 flex items-center justify-center space-x-2"
                      >
                          <span>+</span>
                          <span>Add Custom Field</span>
                      </button>
                  </div>
              </div>
              
              <div className="pt-4 border-t border-gray-700">
                  <button
                      onClick={() => {
                          const defaultConfig = {
                              nameFormats: {
                                  blankFirst: 'Blank first line',
                                  firstOnly: 'First name only',
                                  firstAndLast: 'First and last name'
                              },
                              fairway: {
                                  hit: ['F', 'f', 'Hit', 'HIT', 'hit', '-', '—', '–', 'Yes', 'yes', 'Y', 'y', '✓', '✔'],
                                  missed: ['No', 'no', 'N', 'n', 'X', 'x'],
                                  missedLeft: ['L', 'l', '←', 'Left', 'LEFT', 'left', 'Missed Left', 'MISSED LEFT'],
                                  missedRight: ['R', 'r', '→', 'Right', 'RIGHT', 'right', 'Missed Right', 'MISSED RIGHT']
                              },
                              greens: {
                                  hit: ['Hit', 'HIT', 'hit', 'G', 'g'],
                                  missed: ['Missed', 'MISSED', 'missed', 'Missed Long', 'Missed Short', 'Missed Left', 'Missed Right']
                              },
                              extraStats: {
                                  upDown: false,
                                  teeClub: false,
                                  approachClub: false,
                                  chip: false,
                                  customFields: []
                              }
                          };
                          setMarkingConfig(defaultConfig);
                          localStorage.setItem('golfCardSync_markingConfig', JSON.stringify(defaultConfig));
                      }}
                      className="w-full p-3 bg-gray-700 hover:bg-gray-600 text-white rounded-lg border border-gray-600 transition duration-200"
                  >
                      Reset to Defaults
                  </button>
              </div>
          </div>
          
          {/* Account Information */}
          <div className="bg-gray-800 p-6 rounded-xl shadow-2xl border border-gray-700 space-y-4">
              <h3 className="text-xl font-semibold text-white">Account Information</h3>
              
              {firebaseAuth?.currentUser && (
                  <div className="space-y-3">
                      <div>
                          <p className="text-sm text-gray-400">Email</p>
                          <p className="text-white font-medium">{firebaseAuth.currentUser.email}</p>
                      </div>
                      
                      <button
                          onClick={handleSignOut}
                          className="w-full p-3 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium transition duration-200"
                      >
                          Sign Out
                      </button>
                  </div>
              )}
              <div className="bg-gray-700 p-3 rounded-lg">
                  <p className="text-sm text-gray-300 font-medium">Current User ID:</p>
                  <p className="text-xs text-green-400 break-all">{userId || "Loading..."}</p>
              </div>
          </div>
      </div>
    );
  };

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

  // Show auth screen if not authenticated
  if (showAuth && isAuthReady) {
    return renderAuth();
  }

  // Show loading state while auth initializes
  if (!isAuthReady) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900">
        <Loader2 className="w-8 h-8 text-green-400 animate-spin" />
      </div>
    );
  }

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
