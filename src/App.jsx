// App.jsx
import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { Camera, Upload, LayoutGrid, BarChart3, Loader2, Users, X, Clock, Eye, TrendingUp, ClipboardList, Menu, RefreshCw, User, List, Filter, Calendar } from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator, collection, query, limit, orderBy, onSnapshot, addDoc, serverTimestamp, setLogLevel, deleteDoc, doc } from 'firebase/firestore';

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
                className="relative w-full aspect-[3/4] sm:aspect-[3/4] max-h-[25vh] sm:max-h-none bg-gray-700 cursor-pointer hover:opacity-90 transition duration-200"
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
            className="fixed inset-0 z-[250] flex items-center justify-center p-4 bg-black bg-opacity-90 backdrop-blur-sm" 
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
    
    // Get the selected player from the round, or default to first player
    const players = selectedRound.data.players || [];
    const selectedPlayerName = selectedRound.selectedPlayerName;
    const selectedPlayerIndex = selectedRound.selectedPlayerIndex;
    let player = players[0]; // Default to first player
    
    if (selectedPlayerName && players.length > 0) {
        const foundPlayer = players.find(p => p.name === selectedPlayerName);
        if (foundPlayer) player = foundPlayer;
    } else if (selectedPlayerIndex !== null && selectedPlayerIndex !== undefined && players[selectedPlayerIndex]) {
        player = players[selectedPlayerIndex];
    }
    
    const stats = player?.stats || [];
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
        } else if (label === 'Fw') {
            // Use markingConfig to properly classify fairway values
            const fairwayHitMarkers = markingConfig?.fairway?.hit || ['F', 'f', 'Hit', 'HIT', 'hit', '-', '—', '–', 'Yes', 'yes', 'Y', 'y', '✓', '✔', 'checkmark', 'Checkmark'];
            const fairwayMissedLeftMarkers = markingConfig?.fairway?.missedLeft || ['L', 'l', '←', 'Left', 'LEFT', 'left', 'Missed Left', 'MISSED LEFT'];
            const fairwayMissedRightMarkers = markingConfig?.fairway?.missedRight || ['R', 'r', '→', 'Right', 'RIGHT', 'right', 'Missed Right', 'MISSED RIGHT'];
            const fairwayMissedMarkers = markingConfig?.fairway?.missed || ['No', 'no', 'N', 'n', 'X', 'x'];
            
            const fwValue = String(value || '').trim();
            
            // Check if it's a hit (check for checkmarks, dashes, etc.)
            if (fairwayHitMarkers.some(marker => {
                const markerStr = String(marker).toLowerCase();
                const fwLower = fwValue.toLowerCase();
                return fwLower === markerStr || fwValue === marker || 
                       (markerStr.includes('check') && (fwLower.includes('check') || fwValue === '✓' || fwValue === '✔'));
            })) {
                colorClass = 'text-green-500';
                displayValue = 'Hit';
            } 
            // Check if it's missed left - show just "Left" in red
            else if (fairwayMissedLeftMarkers.some(marker => 
                fwValue.toLowerCase() === String(marker).toLowerCase() || fwValue === marker
            )) {
                colorClass = 'text-red-400';
                displayValue = 'Left';
            }
            // Check if it's missed right - show just "Right" in red
            else if (fairwayMissedRightMarkers.some(marker => 
                fwValue.toLowerCase() === String(marker).toLowerCase() || fwValue === marker
            )) {
                colorClass = 'text-red-400';
                displayValue = 'Right';
            }
            // Check if it's missed (no direction)
            else if (fairwayMissedMarkers.some(marker => 
                fwValue.toLowerCase() === String(marker).toLowerCase() || fwValue === marker
            )) {
                colorClass = 'text-red-400';
                displayValue = 'Missed';
            }
            else {
                displayValue = value || '-';
            }
        } else if (label === 'GiR') {
            if (value === 'Hit') colorClass = 'text-green-500';
            else if (value && String(value).includes('Missed')) colorClass = 'text-red-400';
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
            <td className={`p-1 sm:p-2 border border-gray-700 text-center text-xs sm:text-sm ${colorClass}`}>
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
        <div className="overflow-x-auto rounded-lg shadow-inner [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] w-full">
            <h5 className="text-[9px] sm:text-xs font-semibold p-0.5 sm:p-1.5 bg-gray-700 text-green-400 sticky top-0 border-b border-gray-600">{title}</h5>
            <table className="w-full table-fixed border-collapse" style={{ tableLayout: 'fixed', width: '100%' }}>
                <thead>
                    <tr className="bg-gray-700 text-gray-400 uppercase text-[9px] sm:text-[10px] sticky top-6">
                        <th className="p-0.5 sm:p-1 border border-gray-700" style={{ width: '8%' }}>Hole</th>
                        <th className="p-0.5 sm:p-1 border border-gray-700" style={{ width: '10%' }}>Par</th>
                        <th className="p-0.5 sm:p-1 border border-gray-700" style={{ width: '12%' }}>Score</th>
                        <th className="p-0.5 sm:p-1 border border-gray-700" style={{ width: '12%' }}>Putts</th>
                        <th className="p-0.5 sm:p-1 border border-gray-700" style={{ width: '18%' }}>Fw</th>
                        <th className="p-0.5 sm:p-1 border border-gray-700" style={{ width: '18%' }}>GiR</th>
                        {hasUpDown && <th className="p-0.5 sm:p-1 border border-gray-700" style={{ width: `${22 / (6 + (hasUpDown ? 1 : 0) + (hasTeeClub ? 1 : 0) + (hasApproachClub ? 1 : 0) + (hasChip ? 1 : 0) + customFieldKeys.length)}%` }}>U/D</th>}
                        {hasTeeClub && <th className="p-0.5 sm:p-1 border border-gray-700" style={{ width: `${22 / (6 + (hasUpDown ? 1 : 0) + (hasTeeClub ? 1 : 0) + (hasApproachClub ? 1 : 0) + (hasChip ? 1 : 0) + customFieldKeys.length)}%` }}>Tee</th>}
                        {hasApproachClub && <th className="p-0.5 sm:p-1 border border-gray-700" style={{ width: `${22 / (6 + (hasUpDown ? 1 : 0) + (hasTeeClub ? 1 : 0) + (hasApproachClub ? 1 : 0) + (hasChip ? 1 : 0) + customFieldKeys.length)}%` }}>App</th>}
                        {hasChip && <th className="p-0.5 sm:p-1 border border-gray-700" style={{ width: `${22 / (6 + (hasUpDown ? 1 : 0) + (hasTeeClub ? 1 : 0) + (hasApproachClub ? 1 : 0) + (hasChip ? 1 : 0) + customFieldKeys.length)}%` }}>Chip</th>}
                        {customFieldKeys.map(({ key, displayName }) => (
                            <th key={key} className="p-0.5 sm:p-1 border border-gray-700" style={{ width: `${22 / (6 + (hasUpDown ? 1 : 0) + (hasTeeClub ? 1 : 0) + (hasApproachClub ? 1 : 0) + (hasChip ? 1 : 0) + customFieldKeys.length)}%` }} title={displayName}>{displayName}</th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {holes.map((stat) => (
                        <tr key={stat.hole} className="even:bg-gray-800 odd:bg-gray-900 hover:bg-gray-700 transition duration-150">
                            <td className="p-0.5 sm:p-1 border border-gray-700 text-center font-medium text-[9px] sm:text-xs text-gray-300">{stat.hole}</td>
                            <td className="p-0.5 sm:p-1 border border-gray-700 text-center text-[9px] sm:text-xs text-gray-300">{stat.par || '-'}</td>
                            <StatCell value={stat.score} label="Score" />
                            <StatCell value={stat.putts} label="Putts" />
                            <StatCell value={stat.fairway} label="Fw" />
                            <StatCell value={stat.greens} label="GiR" />
                            {hasUpDown && <StatCell value={stat.upDown || 'N/A'} label="U/D" />}
                            {hasTeeClub && <td className="p-0.5 sm:p-1 border border-gray-700 text-center text-[9px] sm:text-xs text-gray-300">{stat.teeClub && stat.teeClub !== 'N/A' ? stat.teeClub : '-'}</td>}
                            {hasApproachClub && <td className="p-0.5 sm:p-1 border border-gray-700 text-center text-[9px] sm:text-xs text-gray-300">{stat.approachClub && stat.approachClub !== 'N/A' ? stat.approachClub : '-'}</td>}
                            {hasChip && <td className="p-0.5 sm:p-1 border border-gray-700 text-center text-[9px] sm:text-xs text-gray-300">{stat.chip && stat.chip !== 'N/A' ? stat.chip : '-'}</td>}
                            {customFieldKeys.map(({ key }) => (
                                <td key={key} className="p-0.5 sm:p-1 border border-gray-700 text-center text-[9px] sm:text-xs text-gray-300">
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
        <div className="space-y-1.5 sm:space-y-3 bg-gray-900 p-1 sm:p-3 rounded-xl shadow-inner border border-gray-800">
            <h4 className="text-[10px] sm:text-base font-semibold text-white border-b border-gray-700 pb-0.5 sm:pb-1.5 flex items-center px-1 sm:px-2"><ClipboardList className="w-2.5 h-2.5 sm:w-4 sm:h-4 mr-1 sm:mr-2"/> Detailed Hole Stats</h4>
            <div className={`grid ${isFullRound ? 'sm:grid-cols-2' : 'grid-cols-1'} gap-1 sm:gap-3 max-h-[30vh] sm:max-h-none overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]`} style={isFullRound ? { gridTemplateColumns: '1fr 1fr' } : {}}>
                <div className="overflow-x-auto -mx-2 sm:mx-0 w-full min-w-0">
                    <div className="w-full px-2 sm:px-0">
                        <TableSegment holes={front9} title="Front Nine (Holes 1-9)" />
                    </div>
                </div>
                {isFullRound && (
                    <div className="overflow-x-auto -mx-2 sm:mx-0 w-full min-w-0">
                        <div className="w-full px-2 sm:px-0">
                            <TableSegment holes={back9} title="Back Nine (Holes 10-18)" />
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

// --- Bottom Navigation Component ---
const BottomNav = ({ currentTab, setCurrentTab, setSelectedRound }) => {
    const navItems = [
        { key: 'dashboard', icon: BarChart3, label: 'Averages' },
        { key: 'history', icon: List, label: 'History' },
        { key: 'upload', icon: Camera, label: 'Upload' },
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
                            onClick={() => {
                                setCurrentTab(item.key);
                                // Clear selected round when switching to History tab
                                if (item.key === 'history') {
                                    setSelectedRound(null);
                                }
                            }}
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
  
  // --- History States ---
  const [roundHistory, setRoundHistory] = useState([]); // All fetched rounds (max 20)
  const [selectedRound, setSelectedRound] = useState(null); // Round whose details are shown on the dashboard
  const [showPlayerSelection, setShowPlayerSelection] = useState(false); // Show player selection modal
  const [uploadedRoundData, setUploadedRoundData] = useState(null); // Store parsed data after upload
  const [uploadedRoundImage, setUploadedRoundImage] = useState(null); // Store image data after upload
  
  // --- Date Filter States ---
  const [showDateFilter, setShowDateFilter] = useState(false);
  const [dateFilterType, setDateFilterType] = useState('all'); // 'all', 'year', 'range'
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [dateRangeStart, setDateRangeStart] = useState('');
  const [dateRangeEnd, setDateRangeEnd] = useState('');
  
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
        
        // Only auto-select first round on dashboard tab, not on history tab
        // On history tab, user must click a round to see details
        if (currentTab === 'dashboard' && rounds.length > 0 && (!selectedRound || !rounds.find(r => r.id === selectedRound.id))) { 
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

    // Get the selected player from each round (or default to first player if not selected)
    const selectedPlayerRounds = roundHistory
        .filter(round => round.data?.players?.length > 0)
        .map(round => {
            const players = round.data.players;
            let selectedPlayer;
            // Use selected player if available, otherwise default to first player
            if (round.selectedPlayerName) {
                selectedPlayer = players.find(p => p.name === round.selectedPlayerName);
            } else if (round.selectedPlayerIndex !== null && round.selectedPlayerIndex !== undefined) {
                selectedPlayer = players[round.selectedPlayerIndex];
            }
            return {
                ...(selectedPlayer || players[0]),
                _roundId: round.id,
                _roundIndex: roundHistory.indexOf(round)
            };
        });

    if (selectedPlayerRounds.length === 0) return null;

    // Apply date filter to rounds
    const filteredRounds = selectedPlayerRounds.filter((player) => {
        if (dateFilterType === 'all') return true;
        
        // Find the original round from roundHistory using the stored index
        const originalRound = roundHistory[player._roundIndex];
        if (!originalRound) return true;
        
        let roundDate;
        if (originalRound.timestamp instanceof Date) {
            roundDate = originalRound.timestamp;
        } else if (originalRound.timestamp?.toDate && typeof originalRound.timestamp.toDate === 'function') {
            roundDate = originalRound.timestamp.toDate();
        } else if (originalRound.timestamp) {
            roundDate = new Date(originalRound.timestamp);
        } else {
            return true; // If no timestamp, include it
        }
        
        if (!(roundDate instanceof Date) || isNaN(roundDate.getTime())) {
            return true; // Invalid date, include it
        }
        
        if (dateFilterType === 'year') {
            return roundDate.getFullYear() === selectedYear;
        }
        
        if (dateFilterType === 'range') {
            if (!dateRangeStart || !dateRangeEnd) return true;
            const startDate = new Date(dateRangeStart);
            startDate.setHours(0, 0, 0, 0);
            const endDate = new Date(dateRangeEnd);
            endDate.setHours(23, 59, 59, 999); // Include entire end date
            return roundDate >= startDate && roundDate <= endDate;
        }
        
        return true;
    });

    // 1. Calculate Score Average (Best 8 of 20) - Used for Handi-cap-like tracking
    const sortedScores = filteredRounds
        .map(player => player.totalScore)
        .filter(score => typeof score === 'number' && score > 0)
        .sort((a, b) => a - b); // Sort ascending (lowest scores first)

    const roundsToAverage = 8;
    const bestScores = sortedScores.slice(0, Math.min(roundsToAverage, sortedScores.length));

    const avgScore = bestScores.length > 0 
        ? (bestScores.reduce((sum, score) => sum + score, 0) / bestScores.length)
        : null;
    
    // Calculate USGA Handicap Estimate
    // USGA formula: (Score - Course Rating) × 113 / Slope Rating
    // Since we don't have course rating/slope, we'll use a simplified version:
    // Assume average course rating of 72 and slope of 113 (standard)
    // For better accuracy, we'll use the best 8 of last 20 rounds
    const courseRating = 72; // Default assumption
    const slopeRating = 113; // Standard slope
    
    const handicapDifferentials = filteredRounds
        .map(player => {
            const score = player.totalScore;
            if (typeof score !== 'number' || score <= 0) return null;
            // Handicap differential = (Score - Course Rating) × 113 / Slope Rating
            return ((score - courseRating) * 113) / slopeRating;
        })
        .filter(diff => diff !== null)
        .sort((a, b) => a - b); // Sort ascending (lowest differentials first)
    
    const best8Differentials = handicapDifferentials.slice(0, Math.min(8, handicapDifferentials.length));
    const avgDifferential = best8Differentials.length > 0
        ? best8Differentials.reduce((sum, diff) => sum + diff, 0) / best8Differentials.length
        : null;
    
    // Multiply by 0.96 (handicap factor) and round to nearest tenth
    const usgaHandicap = avgDifferential !== null
        ? Math.round((avgDifferential * 0.96) * 10) / 10
        : null;

    // Helper function to check if a value matches any in an array (case-insensitive)
    const matchesAny = (value, array) => {
      if (!value || typeof value !== 'string') return false;
      return array.some(mark => value.toString().toLowerCase() === mark.toLowerCase());
    };

    // 2. Calculate Overall Averages (Fairways, GIR, Putts, Extra Stats)
    // Filter rounds: only include rounds that have at least one of PUTTS, FW, or GIR data
    // Score average will still use all rounds
    const roundsWithStats = filteredRounds.filter(player => {
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
    
    // Calculate custom donut chart stats
    const customDonutStats = {};
    if (markingConfig.extraStats?.customFields && Array.isArray(markingConfig.extraStats.customFields)) {
        markingConfig.extraStats.customFields.forEach((field) => {
            if (field.enabled && field.showAsDonut && field.name) {
                const fieldKey = `custom_${field.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')}`;
                const counts = customFieldCounts[fieldKey];
                
                if (counts && Object.keys(counts).length > 0) {
                    const totalCount = Object.values(counts).reduce((sum, count) => sum + count, 0);
                    
                    if (field.statType === 'successRate' && field.successValues && field.successValues.length > 0) {
                        // Calculate success rate based on success values
                        const successCount = Object.entries(counts)
                            .filter(([value]) => field.successValues.some(sv => value.toString().toLowerCase() === sv.toLowerCase()))
                            .reduce((sum, [, count]) => sum + count, 0);
                        const successRate = totalCount > 0 ? (successCount / totalCount) * 100 : 0;
                        customDonutStats[fieldKey] = {
                            percent: successRate,
                            value: `${successRate.toFixed(1)}%`,
                            title: field.name,
                            color: '#8b5cf6',
                            total: totalCount,
                            success: successCount
                        };
                    } else if (field.statType === 'percentage') {
                        // Use the most common value as percentage
                        const mostCommon = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
                        const percent = mostCommon ? parseFloat(mostCommon[0]) || 0 : 0;
                        customDonutStats[fieldKey] = {
                            percent: Math.min(100, Math.max(0, percent)),
                            value: `${percent.toFixed(1)}%`,
                            title: field.name,
                            color: '#8b5cf6',
                            total: totalCount
                        };
                    } else if (field.statType === 'average') {
                        // Calculate average of numeric values
                        const numericValues = Object.entries(counts)
                            .map(([value, count]) => {
                                const num = parseFloat(value);
                                return isNaN(num) ? null : { value: num, count };
                            })
                            .filter(v => v !== null);
                        
                        if (numericValues.length > 0) {
                            const sum = numericValues.reduce((s, v) => s + (v.value * v.count), 0);
                            const avg = sum / totalCount;
                            customDonutStats[fieldKey] = {
                                percent: Math.min(100, Math.max(0, (avg / 100) * 100)), // Normalize to 0-100
                                value: avg.toFixed(1),
                                title: field.name,
                                color: '#8b5cf6',
                                total: totalCount
                            };
                        }
                    } else if (field.statType === 'count') {
                        // Show total count
                        customDonutStats[fieldKey] = {
                            percent: Math.min(100, (totalCount / 100) * 100), // Scale based on count
                            value: totalCount.toString(),
                            title: field.name,
                            color: '#8b5cf6',
                            total: totalCount
                        };
                    }
                }
            }
        });
    }
    
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
        totalRounds: filteredRounds.length,
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
        customDonutStats,
        filteredRoundsCount: filteredRounds.length,
        usgaHandicap,
    };
  }, [roundHistory, markingConfig, dateFilterType, selectedYear, dateRangeStart, dateRangeEnd]);


  const handleFileChange = (event) => {
    const selectedFile = event.target.files[0];
    if (selectedFile) {
      setFile(selectedFile);
      setError(null);
    }
  };

  // Delete a scorecard round
  const handleDeleteRound = useCallback(async (roundId) => {
    if (!db || !userId || !roundId) return;
    
    if (!window.confirm('Are you sure you want to delete this scorecard? This action cannot be undone.')) {
      return;
    }

    try {
      // Get appId from config
      const { getAppId } = await import('./firebase-config.js');
      const appId = getAppId();
      const path = `artifacts/${appId}/users/${userId}/scorecards`;
      
      // Delete the document
      const docRef = doc(db, path, roundId);
      await deleteDoc(docRef);
      
      // If the deleted round was selected, clear the selection
      if (selectedRound?.id === roundId) {
        setSelectedRound(null);
      }
      
      console.log('Scorecard deleted successfully');
    } catch (error) {
      console.error('Error deleting scorecard:', error);
      setError('Failed to delete scorecard. Please try again.');
    }
  }, [db, userId, selectedRound]);

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
          
          // Handle both response formats: {data: {...}} or direct object
          const scorecardData = parsedData.data || parsedData;
          const players = scorecardData?.players || [];
          
          console.log("Players found:", players.length, players.map(p => p.name)); // Debug log
          
          // Check if multiple players exist
          if (players && players.length > 1) {
              // Store the data temporarily and show player selection modal
              console.log("Multiple players detected, showing selection modal");
              setUploadedRoundData(scorecardData);
              setUploadedRoundImage(base64Image);
              setShowPlayerSelection(true);
              setFile(null); // Clear file input
              setLoading(false); // Stop loading state
              return; // Don't navigate yet, wait for player selection
          }
          
          // Single player or no players - save directly with first player selected (or null if no players)
          await addDoc(collection(db, path), {
              data: scorecardData,
              image: base64Image, // Save the image data alongside the parsed results
              timestamp: serverTimestamp(),
              selectedPlayerName: players.length > 0 ? players[0].name : null, // Store selected player name
              selectedPlayerIndex: players.length > 0 ? 0 : null,
          });
          
          console.log("Scorecard saved to Firestore.");
          
          // Only navigate if we didn't show player selection modal
          if (!showPlayerSelection) {
            // Navigate to the history tab to see the newly saved round
            setCurrentTab('history');
            setShowModalImage(true); 
          }
      }

      setFile(null); // Clear file input after successful upload

    } catch (e) {
      console.error("OCR or Network Error:", e);
      setError(e.message || "An unknown error occurred. Please check the console for details.");
    } finally {
      setLoading(false);
    }
  }, [file, db, userId, markingConfig]);

  // Handler for saving selected player
  const handleSaveSelectedPlayer = useCallback(async (playerName, playerIndex) => {
    if (!db || !userId || !uploadedRoundData) {
      setError("Cannot save: Missing database connection or user ID.");
      return;
    }
    
    setLoading(true);
    setError(null);
    
    try {
      const { getAppId } = await import('./firebase-config.js');
      const appId = getAppId();
      const path = `artifacts/${appId}/users/${userId}/scorecards`;
      
      await addDoc(collection(db, path), {
        data: uploadedRoundData,
        image: uploadedRoundImage,
        timestamp: serverTimestamp(),
        selectedPlayerName: playerName,
        selectedPlayerIndex: playerIndex,
      });
      
      console.log("Scorecard saved to Firestore with selected player:", playerName);
      
      // Close modal and navigate to history
      setShowPlayerSelection(false);
      setUploadedRoundData(null);
      setUploadedRoundImage(null);
      setCurrentTab('history');
      setShowModalImage(true);
    } catch (e) {
      console.error("Error saving scorecard with selected player:", e);
      setError(e.message || "Failed to save scorecard. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [db, userId, uploadedRoundData, uploadedRoundImage]);

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
    const players = data?.players || [];
    
    // Get the selected player from the round, or default to first player
    const selectedPlayerName = selectedRound?.selectedPlayerName;
    const selectedPlayerIndex = selectedRound?.selectedPlayerIndex;
    let player = players[0]; // Default to first player
    
    if (selectedPlayerName && players.length > 0) {
        const foundPlayer = players.find(p => p.name === selectedPlayerName);
        if (foundPlayer) player = foundPlayer;
    } else if (selectedPlayerIndex !== null && selectedPlayerIndex !== undefined && players[selectedPlayerIndex]) {
        player = players[selectedPlayerIndex];
    }
    
    const score = player?.totalScore || 'N/A';
    const courseName = data?.courseName || 'Unspecified Course';
    const dateStr = selectedRound?.timestamp?.toLocaleDateString('en-US', { year: 'numeric', month: 'numeric', day: 'numeric' }) || 'N/A';
    const playerName = player?.name || 'Player 1';

    return (
        <div className="p-2 sm:p-4 space-y-3 sm:space-y-4 pb-20"> {/* pb-20 for bottom nav padding */}
            <h2 className="text-lg sm:text-2xl font-bold text-green-400 border-b border-gray-700 pb-1.5 sm:pb-2 flex items-center"><List className="w-4 h-4 sm:w-6 sm:h-6 mr-1 sm:mr-2"/> Round History</h2>

            {/* Recent Rounds List */}
            <div className="bg-gray-800 p-2 sm:p-4 rounded-xl shadow-2xl border border-gray-700">
                <h3 className="text-xs sm:text-md font-semibold text-gray-200 flex items-center mb-2 sm:mb-3"><Clock className="w-3 h-3 sm:w-4 sm:h-4 mr-1"/> Recent Rounds</h3>
                
                {roundHistory.length > 0 ? (
                    <div className="space-y-2">
                        {roundHistory.map((round) => {
                            // Get the selected player from the round, or default to first player
                            const players = round.data?.players || [];
                            const selectedPlayerName = round.selectedPlayerName;
                            const selectedPlayerIndex = round.selectedPlayerIndex;
                            let player = players[0]; // Default to first player
                            
                            if (selectedPlayerName && players.length > 0) {
                                const foundPlayer = players.find(p => p.name === selectedPlayerName);
                                if (foundPlayer) player = foundPlayer;
                            } else if (selectedPlayerIndex !== null && selectedPlayerIndex !== undefined && players[selectedPlayerIndex]) {
                                player = players[selectedPlayerIndex];
                            }
                            
                            const score = player?.totalScore || 'N/A';
                            const courseName = round.data?.courseName || 'Unknown Course';
                            const dateStr = round.timestamp instanceof Date 
                                ? round.timestamp.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                                : round.timestamp?.toDate 
                                ? round.timestamp.toDate().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                                : 'N/A';
                            const isSelected = selectedRound?.id === round.id;
                            
                            return (
                                <div
                                    key={round.id}
                                    className={`flex items-center gap-2 sm:gap-3 p-2 sm:p-3 rounded-lg transition duration-200 border relative group ${
                                        isSelected 
                                            ? 'bg-green-700/50 border-green-600' 
                                            : 'bg-gray-700 border-gray-600 hover:bg-gray-600'
                                    }`}
                                >
                                    <div
                                        onClick={() => setSelectedRound(round)}
                                        className="flex items-center gap-2 sm:gap-3 flex-grow cursor-pointer active:scale-[0.98]"
                                    >
                                        {/* Small Image Preview */}
                                        <div className="flex-shrink-0 w-12 h-16 sm:w-16 sm:h-20 bg-gray-800 rounded border border-gray-600 overflow-hidden">
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
                                            <div className="flex items-center justify-between mb-0.5 sm:mb-1">
                                                <span className="text-xl sm:text-2xl font-bold text-green-400">{score}</span>
                                                <span className="text-[10px] sm:text-xs text-gray-400">{dateStr}</span>
                                            </div>
                                            <p className="text-xs sm:text-sm text-gray-300 truncate">{courseName}</p>
                                        </div>
                                    </div>
                                    
                                    {/* Delete Button */}
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleDeleteRound(round.id);
                                        }}
                                        className="flex-shrink-0 p-1.5 sm:p-2 text-red-400 hover:text-red-300 hover:bg-red-900/20 rounded transition duration-200 opacity-0 group-hover:opacity-100"
                                        aria-label="Delete round"
                                    >
                                        <X className="w-4 h-4 sm:w-5 sm:h-5" />
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    <div className="text-center p-4 sm:p-8 text-gray-400">
                        <Clock className="w-6 h-6 sm:w-8 sm:h-8 mx-auto mb-2 text-gray-500"/>
                        <p className="text-sm sm:text-base">No rounds recorded yet.</p>
                        <p className="text-xs sm:text-sm mt-1">Upload a scorecard to get started!</p>
                    </div>
                )}
            </div>

            {/* Round Details Modal - Opens when a round is clicked */}
            {selectedRound && (
                <div 
                    className="fixed inset-0 bg-black bg-opacity-90 z-[150] flex items-center justify-center p-2 sm:p-4 overflow-y-auto"
                    onClick={() => setSelectedRound(null)}
                >
                    <div 
                        className="bg-gray-900 rounded-xl shadow-2xl border border-gray-700 w-full max-w-4xl max-h-[95vh] overflow-y-auto space-y-3 sm:space-y-4 p-3 sm:p-4"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Close Button */}
                        <div className="flex justify-between items-center mb-2">
                            <h3 className="text-lg sm:text-xl font-bold text-green-400">Round Details</h3>
                            <button
                                onClick={() => setSelectedRound(null)}
                                className="text-gray-400 hover:text-white transition duration-200 p-2 hover:bg-gray-800 rounded-lg"
                                aria-label="Close"
                            >
                                <X className="w-5 h-5 sm:w-6 sm:h-6" />
                            </button>
                        </div>

                        {/* Scorecard Image */}
                        <div className="flex justify-center">
                            <div 
                                className="relative w-full max-w-xs cursor-pointer hover:opacity-90 transition duration-200"
                                onClick={() => selectedRound?.image && setShowModalImage(true)}
                            >
                                {selectedRound.image ? (
                                    <img 
                                        src={`data:image/jpeg;base64,${selectedRound.image}`} 
                                        alt="Selected Scorecard" 
                                        className="w-full h-auto object-contain rounded-lg"
                                    />
                                ) : (
                                    <div className="w-full h-32 flex items-center justify-center text-center text-gray-400 text-xs bg-gray-800 rounded-lg">
                                        No image available.
                                    </div>
                                )}
                                <div className="absolute inset-0 bg-black/10 flex items-center justify-center opacity-0 hover:opacity-100 transition duration-300 rounded-lg">
                                    <p className="text-white font-bold text-xs bg-black/50 p-1.5 rounded-lg">Click to Enlarge</p>
                                </div>
                            </div>
                        </div>

                        {/* Round Analysis Section */}
                        {selectedRound?.data?.players?.[0]?.stats && (() => {
                            const players = selectedRound.data.players || [];
                            const selectedPlayerName = selectedRound.selectedPlayerName;
                            const selectedPlayerIndex = selectedRound.selectedPlayerIndex;
                            let player = players[0];
                            
                            // Prioritize selectedPlayerName if available, then selectedPlayerIndex
                            if (selectedPlayerName && players.length > 0) {
                                const foundPlayer = players.find(p => p.name === selectedPlayerName);
                                if (foundPlayer) {
                                    player = foundPlayer;
                                } else {
                                    // If name not found, try index
                                    if (selectedPlayerIndex !== null && selectedPlayerIndex !== undefined && players[selectedPlayerIndex]) {
                                        player = players[selectedPlayerIndex];
                                    }
                                }
                            } else if (selectedPlayerIndex !== null && selectedPlayerIndex !== undefined && players[selectedPlayerIndex]) {
                                player = players[selectedPlayerIndex];
                            }
                            
                            // Debug: Log which player is being used
                            console.log('Round Details Modal - Player Selection:', {
                                totalPlayers: players.length,
                                selectedPlayerName,
                                selectedPlayerIndex,
                                playerUsed: player?.name,
                                playerTotalScore: player?.totalScore
                            });
                            
                            const stats = player?.stats || [];
                            if (stats.length === 0) return null;
                            
                            // Calculate statistics
                            const scores = stats.map(s => s.score || 0).filter(s => s > 0);
                            const putts = stats.map(s => s.putts || 0).filter(p => p > 0);
                            const maxScore = Math.max(...scores, 0);
                            const minScore = Math.min(...scores.filter(s => s > 0), 0);
                            const avgScore = scores.length > 0 ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1) : 0;
                            const avgPutts = putts.length > 0 ? (putts.reduce((a, b) => a + b, 0) / putts.length).toFixed(1) : 0;
                            
                            // Count fairways and greens - use markingConfig to properly detect hits
                            // IMPORTANT: Par 3s don't count as fairway opportunities
                            const fairwayHitMarkers = markingConfig?.fairway?.hit || ['F', 'f', 'Hit', 'HIT', 'hit', '-', '—', '–', 'Yes', 'yes', 'Y', 'y', '✓', '✔', 'checkmark', 'Checkmark'];
                            const fairwayMissedLeftMarkers = markingConfig?.fairway?.missedLeft || ['L', 'l', '←', 'Left', 'LEFT', 'left', 'Missed Left', 'MISSED LEFT'];
                            const fairwayMissedRightMarkers = markingConfig?.fairway?.missedRight || ['R', 'r', '→', 'Right', 'RIGHT', 'right', 'Missed Right', 'MISSED RIGHT'];
                            const fairwayMissedMarkers = markingConfig?.fairway?.missed || ['No', 'no', 'N', 'n', 'X', 'x'];
                            
                            // Only count holes that are NOT par 3 as fairway opportunities
                            const fairwayOpportunities = stats.filter(s => {
                                const par = typeof s.par === 'number' ? s.par : (typeof s.par === 'string' ? parseInt(s.par) : 0) || 4;
                                return par !== 3 && s.fairway && s.fairway !== 'N/A';
                            }).length;
                            
                            const fairwaysHit = stats.filter(s => {
                                const par = typeof s.par === 'number' ? s.par : (typeof s.par === 'string' ? parseInt(s.par) : 0) || 4;
                                if (par === 3) return false; // Par 3s don't count
                                if (!s.fairway || s.fairway === 'N/A') return false;
                                const fwValue = String(s.fairway).trim();
                                // Check if it matches any hit marker (case-insensitive)
                                return fairwayHitMarkers.some(marker => 
                                    fwValue.toLowerCase() === String(marker).toLowerCase() ||
                                    fwValue === marker
                                );
                            }).length;
                            const greensHit = stats.filter(s => s.greens && (s.greens === 'Hit' || s.greens === 'HIT' || s.greens === 'hit' || s.greens === 'G' || s.greens === 'g')).length;
                            const greenOpportunities = stats.filter(s => s.greens && s.greens !== 'N/A').length;
                            
                            // Score progression data for line graph (relative to par)
                            // IMPORTANT: Sort stats by hole number first to ensure correct order
                            const sortedStats = [...stats].sort((a, b) => {
                                const holeA = typeof a.hole === 'number' ? a.hole : (typeof a.hole === 'string' ? parseInt(a.hole) : 0) || 0;
                                const holeB = typeof b.hole === 'number' ? b.hole : (typeof b.hole === 'string' ? parseInt(b.hole) : 0) || 0;
                                return holeA - holeB;
                            });
                            
                            const scoreProgression = [];
                            let cumulativeToPar = 0;
                            
                            // Process ALL holes in order - don't skip any to maintain correct cumulative
                            sortedStats.forEach((stat, index) => {
                                const holeNumber = typeof stat.hole === 'number' ? stat.hole : (typeof stat.hole === 'string' ? parseInt(stat.hole) : null) || (index + 1);
                                const score = typeof stat.score === 'number' ? stat.score : (typeof stat.score === 'string' ? parseInt(stat.score) : 0) || 0;
                                const par = typeof stat.par === 'number' ? stat.par : (typeof stat.par === 'string' ? parseInt(stat.par) : 0) || 4; // Default par to 4
                                
                                // Calculate toPar and cumulative, but still include all holes
                                if (score > 0) {
                                    const toPar = score - par;
                                    cumulativeToPar += toPar;
                                    scoreProgression.push({
                                        hole: holeNumber,
                                        score: score,
                                        par: par,
                                        toPar: toPar,
                                        cumulativeToPar: cumulativeToPar
                                    });
                                } else {
                                    // For invalid scores, still maintain cumulative (don't change it)
                                    scoreProgression.push({
                                        hole: holeNumber,
                                        score: 0,
                                        par: par,
                                        toPar: 0,
                                        cumulativeToPar: cumulativeToPar
                                    });
                                }
                            });
                            
                            // Find min and max for scaling (with some padding)
                            const allValues = scoreProgression.map(s => s.cumulativeToPar);
                            const maxToPar = allValues.length > 0 ? Math.max(...allValues, 2) : 2;
                            const minToPar = allValues.length > 0 ? Math.min(...allValues, -2) : -2;
                            const range = Math.max(maxToPar - minToPar, 4) || 4; // Ensure minimum range of 4
                            const padding = range * 0.1; // 10% padding
                            const graphMin = minToPar - padding;
                            const graphMax = maxToPar + padding;
                            const graphRange = graphMax - graphMin;
                            
                            // Debug logging
                            console.log('Score Progression Debug:', {
                                scoreProgression: scoreProgression.map(s => ({
                                    hole: s.hole,
                                    score: s.score,
                                    par: s.par,
                                    toPar: s.toPar,
                                    cumulativeToPar: s.cumulativeToPar
                                })),
                                graphMin,
                                graphMax,
                                graphRange
                            });
                            
                            return (
                                <div className="bg-gray-800 p-2 sm:p-4 rounded-xl shadow-2xl border border-gray-700 space-y-3 sm:space-y-4">
                                    <h4 className="text-sm sm:text-lg font-bold text-green-400 border-b border-gray-700 pb-2 flex items-center">
                                        <BarChart3 className="w-4 h-4 sm:w-5 sm:h-5 mr-2"/> Round Analysis
                                    </h4>
                                    
                                    {/* Summary Stats */}
                                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-4">
                                        <div className="bg-gray-900 p-2 sm:p-3 rounded-lg border border-gray-700">
                                            <p className="text-[10px] sm:text-xs text-gray-400 mb-1">Total Score</p>
                                            <p className="text-lg sm:text-2xl font-bold text-green-400">{player?.totalScore || 'N/A'}</p>
                                        </div>
                                        <div className="bg-gray-900 p-2 sm:p-3 rounded-lg border border-gray-700">
                                            <p className="text-[10px] sm:text-xs text-gray-400 mb-1">Avg Score</p>
                                            <p className="text-lg sm:text-2xl font-bold text-white">{avgScore}</p>
                                        </div>
                                        <div className="bg-gray-900 p-2 sm:p-3 rounded-lg border border-gray-700">
                                            <p className="text-[10px] sm:text-xs text-gray-400 mb-1">Avg Putts</p>
                                            <p className="text-lg sm:text-2xl font-bold text-blue-400">{avgPutts}</p>
                                        </div>
                                        <div className="bg-gray-900 p-2 sm:p-3 rounded-lg border border-gray-700">
                                            <p className="text-[10px] sm:text-xs text-gray-400 mb-1">Putts Total</p>
                                            <p className="text-lg sm:text-2xl font-bold text-blue-400">{putts.reduce((a, b) => a + b, 0)}</p>
                                        </div>
                                    </div>
                                    
                                    {/* Fairway and Green Stats */}
                                    <div className="grid grid-cols-2 gap-2 sm:gap-4">
                                        <div className="bg-gray-900 p-2 sm:p-3 rounded-lg border border-gray-700">
                                            <p className="text-[10px] sm:text-xs text-gray-400 mb-1">Fairways Hit</p>
                                            <p className="text-base sm:text-xl font-bold text-white">
                                                {fairwayOpportunities > 0 ? `${fairwaysHit}/${fairwayOpportunities}` : 'N/A'}
                                                {fairwayOpportunities > 0 && (
                                                    <span className="text-xs sm:text-sm text-gray-400 ml-1">
                                                        ({((fairwaysHit / fairwayOpportunities) * 100).toFixed(0)}%)
                                                    </span>
                                                )}
                                            </p>
                                        </div>
                                        <div className="bg-gray-900 p-2 sm:p-3 rounded-lg border border-gray-700">
                                            <p className="text-[10px] sm:text-xs text-gray-400 mb-1">Greens in Regulation</p>
                                            <p className="text-base sm:text-xl font-bold text-white">
                                                {greenOpportunities > 0 ? `${greensHit}/${greenOpportunities}` : 'N/A'}
                                                {greenOpportunities > 0 && (
                                                    <span className="text-xs sm:text-sm text-gray-400 ml-1">
                                                        ({((greensHit / greenOpportunities) * 100).toFixed(0)}%)
                                                    </span>
                                                )}
                                            </p>
                                        </div>
                                    </div>
                                    
                                    {/* Score Progression Line Graph (Relative to Par) */}
                                    <div className="bg-gray-900 p-2 sm:p-4 rounded-lg border border-gray-700">
                                        <h5 className="text-xs sm:text-sm font-semibold text-white mb-2 sm:mb-3">Score Progression (vs Par)</h5>
                                        <div className="relative h-32 sm:h-48 w-full">
                                            <svg className="w-full h-full" viewBox={`0 0 ${scoreProgression.length * 20} 200`} preserveAspectRatio="none">
                                                {/* Par line (horizontal baseline at 0) */}
                                                {(() => {
                                                    const parLineY = 200 - ((0 - graphMin) / graphRange) * 200;
                                                    return (
                                                        <>
                                                            <line
                                                                x1="0"
                                                                y1={parLineY}
                                                                x2={scoreProgression.length * 20}
                                                                y2={parLineY}
                                                                stroke="#6b7280"
                                                                strokeWidth="1.5"
                                                                strokeDasharray="4,4"
                                                            />
                                                            <text
                                                                x="2"
                                                                y={parLineY - 2}
                                                                className="text-[7px] fill-gray-400"
                                                                fontSize="7"
                                                            >
                                                                Par
                                                            </text>
                                                        </>
                                                    );
                                                })()}
                                                
                                                {/* Grid lines */}
                                                {[0, 25, 50, 75, 100].map((y) => (
                                                    <line
                                                        key={y}
                                                        x1="0"
                                                        y1={y * 2}
                                                        x2={scoreProgression.length * 20}
                                                        y2={y * 2}
                                                        stroke="#374151"
                                                        strokeWidth="0.5"
                                                    />
                                                ))}
                                                
                                                {/* Score line (relative to par) */}
                                                <polyline
                                                    points={scoreProgression.map((s, i) => {
                                                        const yPos = 200 - ((s.cumulativeToPar - graphMin) / graphRange) * 200;
                                                        return `${i * 20 + 10},${yPos}`;
                                                    }).join(' ')}
                                                    fill="none"
                                                    stroke="#10b981"
                                                    strokeWidth="2"
                                                    strokeLinecap="round"
                                                    strokeLinejoin="round"
                                                />
                                                
                                                {/* Data points */}
                                                {scoreProgression.map((s, i) => {
                                                    const yPos = 200 - ((s.cumulativeToPar - graphMin) / graphRange) * 200;
                                                    const isAbovePar = s.cumulativeToPar > 0;
                                                    const isBelowPar = s.cumulativeToPar < 0;
                                                    return (
                                                        <g key={i}>
                                                            <circle
                                                                cx={i * 20 + 10}
                                                                cy={yPos}
                                                                r="3"
                                                                fill={isAbovePar ? "#ef4444" : isBelowPar ? "#10b981" : "#6b7280"}
                                                            />
                                                            <text
                                                                x={i * 20 + 10}
                                                                y={yPos - 8}
                                                                textAnchor="middle"
                                                                className="text-[8px] fill-white"
                                                                fontSize="8"
                                                            >
                                                                {s.score}
                                                            </text>
                                                            <text
                                                                x={i * 20 + 10}
                                                                y={yPos + 12}
                                                                textAnchor="middle"
                                                                className="text-[7px] fill-gray-500"
                                                                fontSize="7"
                                                            >
                                                                {s.toPar > 0 ? `+${s.toPar}` : s.toPar === 0 ? 'E' : s.toPar}
                                                            </text>
                                                        </g>
                                                    );
                                                })}
                                                
                                                {/* Hole labels */}
                                                {scoreProgression.map((s, i) => (
                                                    <text
                                                        key={i}
                                                        x={i * 20 + 10}
                                                        y="195"
                                                        textAnchor="middle"
                                                        className="text-[8px] fill-gray-400"
                                                        fontSize="8"
                                                    >
                                                        {s.hole}
                                                    </text>
                                                ))}
                                            </svg>
                                        </div>
                                        <div className="flex justify-between mt-1 text-[8px] sm:text-[10px] text-gray-400">
                                            <span>Hole 1</span>
                                            <span className="text-green-400">Below Par</span>
                                            <span className="text-red-400">Above Par</span>
                                            <span>Hole {scoreProgression.length}</span>
                                        </div>
                                    </div>
                                </div>
                            );
                        })()}

                        {/* Detailed Hole Stats */}
                        <DetailedStatsTable selectedRound={selectedRound} markingConfig={markingConfig} />
                    </div>
                </div>
            )}

            {/* Image Modal Rendering (for enlarged image) */}
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
                <div className="space-y-4 sm:space-y-6">
                    {/* Performance Tracking Section */}
                    <div className="bg-gray-800 p-4 sm:p-6 rounded-xl shadow-2xl border border-gray-700 space-y-4 sm:space-y-6">
                        <h3 className="text-lg sm:text-xl font-bold text-white mb-3 sm:mb-4 text-center">Performance Tracking (Last {roundHistory.length} Rounds)</h3>
                        
                    {/* Avg Score Box with Filter */}
                    <div className="text-center p-4 sm:p-6 bg-gray-700 rounded-xl border border-gray-600 relative">
                        <div className="absolute top-3 right-3">
                            <button
                                onClick={() => setShowDateFilter(true)}
                                className="text-gray-400 hover:text-green-400 transition duration-200 p-1 hover:bg-gray-600 rounded"
                                aria-label="Filter by date"
                            >
                                <Filter className="w-4 h-4 sm:w-5 sm:h-5" />
                            </button>
                        </div>
                        <p className="text-sm sm:text-base font-medium text-gray-400 mb-2">Avg. Score (Best {dashboardStats.bestScoresCount})</p>
                        <p className="text-4xl sm:text-5xl font-extrabold text-green-400">{dashboardStats.avgScore}</p>
                        {dateFilterType !== 'all' && (
                            <p className="text-xs text-gray-500 mt-1">
                                {dateFilterType === 'year' ? `Filtered: ${selectedYear}` : 'Filtered by date range'}
                            </p>
                        )}
                    </div>
                    
                    {/* USGA Handicap Estimate Box */}
                    <div className="text-center p-4 sm:p-6 bg-gray-700 rounded-xl border border-gray-600">
                        <p className="text-sm sm:text-base font-medium text-gray-400 mb-2">USGA Handicap</p>
                        <p className="text-4xl sm:text-5xl font-extrabold text-blue-400">
                            {dashboardStats?.usgaHandicap !== null && dashboardStats?.usgaHandicap !== undefined 
                                ? dashboardStats.usgaHandicap.toFixed(1) 
                                : 'N/A'}
                        </p>
                        <p className="text-xs sm:text-sm text-gray-500 mt-1">Estimate (Best 8 of 20)</p>
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
                    
                    {/* Row 3: Fairways Left, Fairways Right */}
                    <div className="grid grid-cols-2 gap-3 sm:gap-4">
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
                    </div>
                    
                    {/* Custom Donut Charts */}
                    {Object.keys(dashboardStats.customDonutStats || {}).length > 0 && (
                        <div className="grid grid-cols-2 gap-3 sm:gap-4">
                            {Object.entries(dashboardStats.customDonutStats).map(([fieldKey, donutStat]) => (
                                <DoughnutChart 
                                    key={fieldKey}
                                    percent={parseFloat(donutStat.percent)} 
                                    title={donutStat.title} 
                                    color={donutStat.color}
                                    value={donutStat.value}
                                />
                            ))}
                        </div>
                    )}
                    
                    <div className="mt-4 sm:mt-6 pt-4 border-t border-gray-700 text-center">
                        <p className="text-xs sm:text-sm font-medium text-gray-400">Total Rounds Recorded</p>
                        <p className="text-2xl sm:text-3xl font-bold text-white mt-1">{dashboardStats.totalRounds}</p>
                    </div>
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
        <p className="text-gray-400">Track and analyze your golf scores</p>
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
          'Analyze & Save Scorecard'
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
                  <p className="text-sm text-gray-400">Configure how player names appear on your scorecard. These descriptions help identify and extract player names correctly.</p>
                  
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
                                          placeholder="Value used e.g yes, no, x, checkmark"
                                      />
                                      
                                      {/* Show as Donut Chart Option */}
                                      <label className="flex items-center space-x-2 cursor-pointer">
                                          <input
                                              type="checkbox"
                                              checked={field.showAsDonut || false}
                                              onChange={(e) => {
                                                  const updatedFields = [...(markingConfig.extraStats?.customFields || [])];
                                                  updatedFields[index] = { ...field, showAsDonut: e.target.checked };
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
                                              className="w-4 h-4 rounded border-gray-600 bg-gray-800 text-green-500 focus:ring-green-500 focus:ring-2"
                                          />
                                          <span className="text-xs text-gray-300">Display as donut chart on dashboard</span>
                                      </label>
                                      
                                      {/* Stat Type for Donut Calculation */}
                                      {field.showAsDonut && (
                                          <select
                                              value={field.statType || 'successRate'}
                                              onChange={(e) => {
                                                  const updatedFields = [...(markingConfig.extraStats?.customFields || [])];
                                                  updatedFields[index] = { ...field, statType: e.target.value };
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
                                          >
                                              <option value="successRate">Success Rate (Yes/No, Hit/Miss, etc.)</option>
                                              <option value="percentage">Percentage</option>
                                              <option value="average">Average Value</option>
                                              <option value="count">Total Count</option>
                                          </select>
                                      )}
                                      
                                      {/* Success Values for Success Rate Type */}
                                      {field.showAsDonut && field.statType === 'successRate' && (
                                          <input
                                              type="text"
                                              value={(field.successValues || []).join(', ')}
                                              onChange={(e) => {
                                                  const updatedFields = [...(markingConfig.extraStats?.customFields || [])];
                                                  updatedFields[index] = { 
                                                      ...field, 
                                                      successValues: e.target.value.split(',').map(s => s.trim()).filter(s => s.length > 0)
                                                  };
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
                                              placeholder="Success values (e.g., Yes, Y, ✓, 1, Hit, Success)"
                                          />
                                      )}
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
                                  type: 'string',
                                  showAsDonut: false,
                                  statType: 'successRate',
                                  successValues: []
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
        setSelectedRound={setSelectedRound}
      />
      
      {/* Date Filter Modal */}
      {showDateFilter && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-[200] p-4"
          onClick={() => setShowDateFilter(false)}
        >
          <div 
            className="bg-gray-800 rounded-xl shadow-2xl border border-gray-700 p-6 max-w-md w-full relative z-[201]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-bold text-white flex items-center">
                <Filter className="w-5 h-5 mr-2 text-green-400" />
                Filter Rounds
              </h3>
              <button
                onClick={() => setShowDateFilter(false)}
                className="text-gray-400 hover:text-white transition duration-200"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="space-y-4">
              {/* Filter Type Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Filter Type</label>
                <div className="space-y-2">
                  <label className="flex items-center">
                    <input
                      type="radio"
                      name="filterType"
                      value="all"
                      checked={dateFilterType === 'all'}
                      onChange={(e) => setDateFilterType(e.target.value)}
                      className="mr-2"
                    />
                    <span className="text-gray-300">All Rounds</span>
                  </label>
                  <label className="flex items-center">
                    <input
                      type="radio"
                      name="filterType"
                      value="year"
                      checked={dateFilterType === 'year'}
                      onChange={(e) => setDateFilterType(e.target.value)}
                      className="mr-2"
                    />
                    <span className="text-gray-300">By Year</span>
                  </label>
                  <label className="flex items-center">
                    <input
                      type="radio"
                      name="filterType"
                      value="range"
                      checked={dateFilterType === 'range'}
                      onChange={(e) => setDateFilterType(e.target.value)}
                      className="mr-2"
                    />
                    <span className="text-gray-300">Date Range</span>
                  </label>
                </div>
              </div>
              
              {/* Year Selection */}
              {dateFilterType === 'year' && (
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Select Year</label>
                  <select
                    value={selectedYear}
                    onChange={(e) => setSelectedYear(parseInt(e.target.value))}
                    className="w-full bg-gray-700 text-white border border-gray-600 rounded-lg px-3 py-2 focus:outline-none focus:border-green-400"
                  >
                    {Array.from({ length: 10 }, (_, i) => new Date().getFullYear() - i).map(year => (
                      <option key={year} value={year}>{year}</option>
                    ))}
                  </select>
                </div>
              )}
              
              {/* Date Range Selection */}
              {dateFilterType === 'range' && (
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">Start Date</label>
                    <input
                      type="date"
                      value={dateRangeStart}
                      onChange={(e) => setDateRangeStart(e.target.value)}
                      className="w-full bg-gray-700 text-white border border-gray-600 rounded-lg px-3 py-2 focus:outline-none focus:border-green-400"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">End Date</label>
                    <input
                      type="date"
                      value={dateRangeEnd}
                      onChange={(e) => setDateRangeEnd(e.target.value)}
                      className="w-full bg-gray-700 text-white border border-gray-600 rounded-lg px-3 py-2 focus:outline-none focus:border-green-400"
                    />
                  </div>
                </div>
              )}
              
              {/* Action Buttons */}
              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => {
                    setDateFilterType('all');
                    setDateRangeStart('');
                    setDateRangeEnd('');
                    setShowDateFilter(false);
                  }}
                  className="flex-1 bg-gray-700 hover:bg-gray-600 text-white font-medium py-2 px-4 rounded-lg transition duration-200"
                >
                  Clear Filter
                </button>
                <button
                  onClick={() => setShowDateFilter(false)}
                  className="flex-1 bg-green-600 hover:bg-green-700 text-white font-medium py-2 px-4 rounded-lg transition duration-200"
                >
                  Apply Filter
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* Player Selection Modal */}
      {showPlayerSelection && uploadedRoundData && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-[100] p-4"
          onClick={(e) => {
            // Prevent closing when clicking on the backdrop
            e.stopPropagation();
          }}
        >
          <div 
            className="bg-gray-800 rounded-xl shadow-2xl border border-gray-700 p-6 max-w-md w-full relative z-[101]"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-xl font-bold text-white mb-2 flex items-center">
              <Users className="w-6 h-6 mr-2 text-green-400" />
              Select Your Name
            </h3>
            <p className="text-sm text-gray-400 mb-4">
              Multiple players were found on this scorecard. Please select which player you are:
            </p>
            
            <div className="space-y-3 mb-4">
              {uploadedRoundData.players?.map((player, index) => (
                <button
                  key={`player-${index}-${player.name}`}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    console.log("Player selected:", player.name, "Index:", index);
                    handleSaveSelectedPlayer(player.name, index);
                  }}
                  disabled={loading}
                  className="w-full p-4 bg-gray-700 hover:bg-gray-600 active:bg-gray-500 rounded-lg border border-gray-600 transition duration-200 text-left disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                  type="button"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-white font-semibold text-lg">{player.name}</p>
                      <p className="text-gray-400 text-sm">Score: {player.totalScore || 'N/A'}</p>
                    </div>
                    {loading && (
                      <Loader2 className="w-5 h-5 text-green-400 animate-spin" />
                    )}
                  </div>
                </button>
              ))}
            </div>
            
            {error && (
              <div className="p-3 bg-red-800 text-white rounded-lg border border-red-600 text-sm mb-4">
                {error}
              </div>
            )}
            
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setShowPlayerSelection(false);
                setUploadedRoundData(null);
                setUploadedRoundImage(null);
              }}
              className="w-full p-3 bg-gray-700 hover:bg-gray-600 text-white rounded-lg border border-gray-600 transition duration-200"
              type="button"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
