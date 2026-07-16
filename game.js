/**
 * 可愛動物森林：像素堆疊三消 (Cute Animal Forest)
 * Core Game Engine - Cute Animal Firebase & Seeded RNG Edition
 */

// ==========================================
// 🔥 1. FIREBASE 雲端連線設定 (由 config.js 提供，此處僅讀取)
// ==========================================
let db = null;
let auth = null;
let isFirebaseActive = false;

function initFirebase() {
    if (typeof firebase !== 'undefined' && typeof firebaseConfig !== 'undefined' && firebaseConfig.apiKey !== "YOUR_API_KEY") {
        try {
            firebase.initializeApp(firebaseConfig);
            db = firebase.firestore();
            auth = firebase.auth();
            isFirebaseActive = true;
            console.log("🔥 Firebase 成功初始化！已同步連線至雲端資料庫。");
        } catch (error) {
            console.warn("⚠️ Firebase 載入出錯，已啟動本地 LocalStorage 備份模擬機制：", error);
        }
    } else {
        console.log("ℹ️ [本地離線模式] 檢測到未填寫 Firebase Config。已自動啟用本地 LocalStorage 離線模擬系統，遊戲完全可玩！");
    }
}

// ==========================================
// 🧬 2. DETERMINISTIC RNG (全球玩家相同關卡種子系統)
// ==========================================
function mulberry32(a) {
    return function() {
        let t = a += 0x6D2B79F5;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }
}

function getTodayString() {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
}

function getISOWeekString(dateStr) {
    const parts = dateStr.split('-');
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    const day = parseInt(parts[2], 10);
    const date = new Date(Date.UTC(year, month, day));
    const dayNum = date.getUTCDay() || 7;
    date.setUTCDate(date.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
    const mmWeek = String(weekNo).padStart(2, '0');
    return `${date.getUTCFullYear()}-W${mmWeek}`;
}

function getDailySeed() {
    const dateStr = getTodayString();
    let hash = 0;
    for (let i = 0; i < dateStr.length; i++) {
        const char = dateStr.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
    }
    return Math.abs(hash);
}

function seededShuffle(arr, prng) {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(prng() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
}

// ==========================================
// 🎨 3. 可愛馬卡龍粉嫩配色調色盤 & 動物範本
// ==========================================
const PALETTE = {
    'k': '#2b1f1d', // 深色輪廓
    'w': '#ffffff', // 亮白
    'p': '#ffb5a7', // 粉嫩桃紅
    'o': '#fec89a', // 溫暖橘黃
    'y': '#ffd166', // 鵝蛋黃
    'Y': '#ffe5ec', // 粉白
    'g': '#94a3b8', // 考拉大象灰
    'G': '#70e000', // 活潑草綠
    'b': '#e8e0d5', // 溫暖燕麥
    'B': '#f1c0e8', // 浪漫紫
    'c': '#a06a42', // 巧克力褐
    'r': '#ff4d6d', // 愛心紅
};
// ==========================================
// 🖼️ 3.5 載入 gem_assets 中的 12 張真實寶石圖片素材
// ==========================================
const gemImages = {};
let loadedGemsCount = 0;
const TOTAL_GEMS = 12;

for (let i = 1; i <= TOTAL_GEMS; i++) {
    const imgId = i;
    const imgStr = String(i).padStart(2, '0');
    const img = new Image();
    img.onload = () => {
        loadedGemsCount++;
        if (loadedGemsCount === TOTAL_GEMS) {
            console.log('🌸 所有 12 張寶石圖片素材載入成功！重新渲染快取。');
            preRenderTiles();
            if (typeof updateAvatarUI === 'function') {
                updateAvatarUI(currentAvatarId);
            }
            if (typeof renderField === 'function') {
                renderField();
            }
            if (typeof renderCodex === 'function') {
                renderCodex();
            }
            if (typeof renderLeaderboard === 'function') {
                renderLeaderboard();
            }
        }
    };
    img.src = 'gem_assets/' + imgStr + '.png';
    gemImages[imgId] = img;
}

const TILE_TEMPLATES = [
    {
        "id": 0,
        "name": "圓形鑽石",
        "desc": "完美圓形明亮式切工鑽石，擁有 57 個對稱折射面，折射出極致神聖璀璨的銀白與淡藍霓光！",
        "colors": [
            "#ffffff",
            "#cfd8dc",
            "#b0bec5"
        ]
    },
    {
        "id": 1,
        "name": "八角紅寶石",
        "desc": "深紅八角切割紅寶石，散發熾熱火焰般的光澤，象徵勇氣、力量與永恆熱情。",
        "colors": [
            "#ff1744",
            "#ff4d6d",
            "#3e2723"
        ]
    },
    {
        "id": 2,
        "name": "祖母綠",
        "desc": "經典祖母綠切工，晶瑩通透的翠綠折射令人著迷，象徵生命、自然與希望。",
        "colors": [
            "#0d47a1",
            "#29b6f6",
            "#0a1931"
        ]
    },
    {
        "id": 3,
        "name": "紫水晶晶簇",
        "desc": "天然紫水晶晶簇由多支晶柱組成，閃耀高貴紫色光芒，充滿神秘與智慧氣息。",
        "colors": [
            "#00e676",
            "#1b5e20",
            "#ffffff"
        ]
    },
    {
        "id": 4,
        "name": "黃水晶",
        "desc": "金黃色橢圓切割黃水晶，如陽光般溫暖耀眼，被譽為招財與幸運之石。",
        "colors": [
            "#ffea00",
            "#ff9100",
            "#ffffff"
        ]
    },
    {
        "id": 5,
        "name": "愛心粉晶",
        "desc": "愛心造型粉晶散發柔和粉紅光暈，象徵愛情、幸福與溫暖療癒的能量。",
        "colors": [
            "#aa00ff",
            "#e040fb",
            "#1a0033"
        ]
    },
    {
        "id": 6,
        "name": "琥珀",
        "desc": "晶瑩剔透的琥珀呈現金橙色光澤，彷彿封存遠古歲月的溫暖與生命記憶。",
        "colors": [
            "#ff9100",
            "#ffd54f",
            "#ffffff"
        ]
    },
    {
        "id": 7,
        "name": "黑曜石晶柱",
        "desc": "銳利漆黑的黑曜石晶柱散發低調光澤，蘊含強大的守護、防禦與淨化力量。",
        "colors": [
            "#ff80ab",
            "#f8bbd0",
            "#ffffff"
        ]
    },
    {
        "id": 8,
        "name": "蛋白石",
        "desc": "乳白色蛋白石閃耀彩虹變彩效應，在不同角度映照出夢幻般的七彩光芒。",
        "colors": [
            "#00e5ff",
            "#4fc3f7",
            "#01579b"
        ]
    },
    {
        "id": 9,
        "name": "藍水晶",
        "desc": "冰藍色多面切割水晶，宛如凝結的寒冰，散發純淨而深邃的透明光彩。",
        "colors": [
            "#880e4f",
            "#ff1744",
            "#ffffff"
        ]
    },
    {
        "id": 10,
        "name": "比特幣金幣",
        "desc": "象徵去中心化金融的黃金比特幣，鏡面金屬質感搭配閃耀光芒，代表數位財富與未來價值。",
        "colors": [
            "#03a9f4",
            "#81d4fa",
            "#01579b"
        ]
    },
    {
        "id": 11,
        "name": "紫晶菱柱",
        "desc": "修長菱柱切割紫晶展現高雅紫色折射，充滿魔法能量與神秘幻想氛圍。",
        "colors": [
            "#e0f7fa",
            "#90caf9",
            "#b0bec5"
        ]
    }
];

// ==========================================
// 🔊 4. 可愛 8-Bit Q彈音效
// ==========================================
const Sound = {
    ctx: null,
    muted: false,
    init() {
        if (!this.ctx) {
            this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        }
    },
    playClick() {
        if (this.muted) return;
        this.init();
        const ctx = this.ctx;
        if (ctx.state === 'suspended') ctx.resume();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = 'sine';
        osc.frequency.setValueAtTime(550, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(1300, ctx.currentTime + 0.06);
        gain.gain.setValueAtTime(0.12, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.06);
        osc.start();
        osc.stop(ctx.currentTime + 0.06);
    },
    playMatch() {
        if (this.muted) return;
        this.init();
        const ctx = this.ctx;
        if (ctx.state === 'suspended') ctx.resume();
        const now = ctx.currentTime;
        const playTone = (freq, start, duration) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, start);
            gain.gain.setValueAtTime(0.1, start);
            gain.gain.exponentialRampToValueAtTime(0.01, start + duration);
            osc.start(start);
            osc.stop(start + duration);
        };
        playTone(1046.50, now, 0.1);
        playTone(1318.51, now + 0.04, 0.1);
        playTone(1567.98, now + 0.08, 0.1);
        playTone(2093.00, now + 0.12, 0.2);
    },
    playLose() {
        if (this.muted) return;
        this.init();
        const ctx = this.ctx;
        if (ctx.state === 'suspended') ctx.resume();
        const now = ctx.currentTime;
        const playTone = (freq, start, duration) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(freq, start);
            osc.frequency.linearRampToValueAtTime(freq - 80, start + duration);
            gain.gain.setValueAtTime(0.12, start);
            gain.gain.linearRampToValueAtTime(0.01, start + duration);
            osc.start(start);
            osc.stop(start + duration);
        };
        playTone(392.00, now, 0.12);
        playTone(349.23, now + 0.12, 0.12);
        playTone(293.66, now + 0.24, 0.3);
    },
    playWin() {
        if (this.muted) return;
        this.init();
        const ctx = this.ctx;
        if (ctx.state === 'suspended') ctx.resume();
        const now = ctx.currentTime;
        const playTone = (freq, start, duration) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(freq, start);
            gain.gain.setValueAtTime(0.12, start);
            gain.gain.exponentialRampToValueAtTime(0.01, start + duration);
            osc.start(start);
            osc.stop(start + duration);
        };
        playTone(523.25, now, 0.08);
        playTone(587.33, now + 0.1, 0.08);
        playTone(659.25, now + 0.2, 0.08);
        playTone(783.99, now + 0.3, 0.1);
        playTone(659.25, now + 0.4, 0.08);
        playTone(783.99, now + 0.48, 0.25);
    },
    playShuffle() {
        if (this.muted) return;
        this.init();
        const ctx = this.ctx;
        if (ctx.state === 'suspended') ctx.resume();
        const bufferSize = ctx.sampleRate * 0.2;
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }
        const noise = ctx.createBufferSource();
        noise.buffer = buffer;
        const filter = ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(400, ctx.currentTime);
        filter.frequency.exponentialRampToValueAtTime(1600, ctx.currentTime + 0.2);
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.06, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.2);
        noise.connect(filter);
        filter.connect(gain);
        gain.connect(ctx.destination);
        noise.start();
    }
};

// ==========================================
// 🎨 5. 粒子與愛心系統 (曾被遺漏的關鍵組件，現已 100% 圓滿補回！)
// ==========================================
const Particles = {
    canvas: null,
    ctx: null,
    list: [],
    init() {
        this.canvas = document.getElementById('particles-canvas');
        if (this.canvas) {
            this.ctx = this.canvas.getContext('2d');
            this.resize();
            window.addEventListener('resize', () => this.resize());
            this.loop();
        }
    },
    resize() {
        if (this.canvas) {
            this.canvas.width = window.innerWidth;
            this.canvas.height = window.innerHeight;
        }
    },
    spawn(x, y, colors, count = 20) {
        for (let i = 0; i < count; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = 1.5 + Math.random() * 4.5;
            this.list.push({
                x,
                y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed - (1 + Math.random() * 1.5),
                color: colors[Math.floor(Math.random() * colors.length)] || '#ffb5a7',
                size: 4 + Math.random() * 6,
                alpha: 1,
                decay: 0.012 + Math.random() * 0.015,
                spin: Math.random() * 0.15 - 0.075,
                angle: Math.random() * Math.PI,
                gravity: 0.1,
                type: Math.random() > 0.4 ? 'square' : 'heart'
            });
        }
    },
    loop() {
        requestAnimationFrame(() => this.loop());
        this.update();
        this.draw();
    },
    update() {
        for (let i = this.list.length - 1; i >= 0; i--) {
            const p = this.list[i];
            p.x += p.vx;
            p.y += p.vy;
            p.vy += p.gravity;
            p.angle += p.spin;
            p.alpha -= p.decay;
            if (p.alpha <= 0) {
                this.list.splice(i, 1);
            }
        }
    },
    draw() {
        if (!this.ctx) return;
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        for (const p of this.list) {
            this.ctx.save();
            this.ctx.globalAlpha = p.alpha;
            this.ctx.translate(p.x, p.y);
            this.ctx.rotate(p.angle);
            this.ctx.fillStyle = p.color;
            if (p.type === 'heart') {
                const s = p.size / 2;
                this.ctx.fillRect(-s, -s/2, s, s);
                this.ctx.fillRect(0, -s/2, s, s);
                this.ctx.fillRect(-s/2, 0, s, s);
            } else {
                this.ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
            }
            this.ctx.restore();
        }
    }
};

// ==========================================
// 📊 6. 每日三關配置系統 (數學無重合優化版)
// ==========================================
const LEVELS = [
    {
        num: 1,
        title: "第 1 關：晶石集結 🐣",
        badge: "第 1 關：晶石集結",
        tileCount: 36,
        typesCount: 6,
        layers: 4, 
        desc: "聖殿晶石法陣入口處，有 6 種高透晶石正交錯堆疊。重疊加深至 4 層，考驗您的初步引導！"
    },
    {
        num: 2,
        title: "第 2 關：微光漸亮 🌿",
        badge: "第 2 關：微光漸亮",
        tileCount: 54,
        typesCount: 9,
        layers: 5, 
        desc: "9 種璀璨晶石在法陣邊緣匯聚，重疊加深至 5 層，極度考驗靈感共鳴！"
    },
    {
        num: 3,
        title: "第 3 關：繁星晶格 🐱",
        badge: "第 3 關：繁星晶格",
        tileCount: 72,
        typesCount: 11,
        layers: 6, 
        desc: "聖殿主法陣中 11 種晶石緊密堆疊 6 層之深。收納盒空間吃緊，需要極致細心的策略！"
    },
    {
        num: 4,
        title: "第 4 關：聖域奧秘 🏔️",
        badge: "第 4 關：聖域奧秘",
        tileCount: 162,
        typesCount: 12,
        layers: 9, 
        desc: "全部 12 種稀世晶石全面覺醒！高達 162 顆晶石堆疊成 9 層高峰，深海級超高密度，這是一場硬仗！"
    },
    {
        num: 5,
        title: "第 5 關：終極共鳴 🐼",
        badge: "第 5 關：終極共鳴",
        tileCount: 252,
        typesCount: 12,
        layers: 13, 
        desc: "聖域終極大共鳴！252 顆能量晶石如高山般疊加深達 13 層，挑戰地獄級通關率，僅有傳奇大師能通過的終極迷宮！"
    }
];

// ==========================================
// 🎮 7. 遊戲核心狀態變數
// ==========================================
const GameState = {
    tiles: [],
    slots: [],
    out3Storage: [],
    history: [],
    currentLevelIndex: 0,
    skills: { undo: 1, out3: 1, shuffle: 1 },
    status: "playing",
    nextTileId: 0,
    prng: null,
    movesLog: []
};

let currentUser = null;
let dailyTicketsLeft = 3;
let playerStats = {
    wins: 0,
    losses: 0,
    totalGames: 0,
    maxLevelReached: 0
};

let currentLeaderboardType = 'daily';
let leaderboardCache = {
    daily: null,
    weekly: null,
    monthly: null
};

let unlockedCodex = [0]; // 預設解鎖 ID=0 的圓形鑽石！
let shinyCodex = [];
let currentAvatarId = 0; // 新玩家預設設定 ID=0 (圓形鑽石) 的頭像！
let pendingRewards = [];

// Global cache for pre-rendered tiles
const tileCache = {};

// Pre-render all tiles into canvases
function preRenderTiles() {
    console.log("🎨 正在預先渲染卡牌快取...");
    TILE_TEMPLATES.forEach(template => {
        const canvas = document.createElement('canvas');
        canvas.width = 48;
        canvas.height = 48;
        drawTileCanvas(canvas, template);
        tileCache[template.id] = canvas;
    });
    console.log("✅ 卡牌快取渲染完成。");
}

// ==========================================
// 🚀 8. 遊戲載入與生命週期管理 (分段優化版)
// ==========================================
function initAll() {
    console.log("🔮 聖域晶石殿堂啟動：開始階段載入...");
    initFirebase();
    
    // 1. 立即優先處理關鍵資源：卡牌快取 (渲染遊戲必須)
    preRenderTiles();
    
    // 2. 立即初始化 Firebase 監聽與事件 (保證遊戲互動性)
    setupAuthEvents();
    setupFirebaseListeners();
    setupEventListeners();

    // 3. 使用 requestIdleCallback (或 setTimeout) 推遲非關鍵、高耗能任務
    const deferLoad = window.requestIdleCallback || ((cb) => setTimeout(cb, 100));
    
    deferLoad(() => {
        console.log("🔮 聖域晶石殿堂啟動：後台載入非關鍵組件...");
        Particles.init();
        renderCodex();
        resizeGameContainer();
    });

    window.addEventListener('resize', () => {
        resizeGameContainer();
    });
    
    // 確保容器尺寸被計算
    setTimeout(resizeGameContainer, 10);
}

if (document.readyState === 'interactive' || document.readyState === 'complete') {
    initAll();
} else {
    window.addEventListener('DOMContentLoaded', initAll);
}

function setupFirebaseListeners() {
    if (isFirebaseActive && auth) {
        auth.onAuthStateChanged(user => {
            handleUserAuthChange(user);
        });
    } else {
        console.warn("⚠️ Firebase 未啟動，請確認您已正確設定 config.js！");
    }
}

function resizeGameContainer() {
    const field = document.getElementById('game-field');
    const container = document.getElementById('stack-container');
    if (!field || !container) return;
    
    const fieldW = field.clientWidth;
    if (fieldW <= 0) {
        setTimeout(resizeGameContainer, 30);
        return;
    }
    
    const availableW = fieldW - 16; 
    const designW = 500; 
    
    const scale = Math.max(0.2, Math.min(1, availableW / designW));
    
    container.style.transform = `scale(${scale})`;
    container.style.transformOrigin = 'center center';
}

// 處理使用者登入與登出狀態切換
async function handleUserAuthChange(user) {
    const profileEl = document.getElementById('user-profile');
    const loginOverlay = document.getElementById('login-overlay');
    currentUser = user;
    
    if (user) {
        if (profileEl) {
            profileEl.classList.remove('hidden');
            profileEl.classList.add('flex');
        }
        if (loginOverlay) loginOverlay.classList.add('hidden');
        
        const nameEl = document.getElementById('user-name');
        if (nameEl) nameEl.innerText = user.isAnonymous ? "匿名冒險者" : (user.displayName || "冒險者");
        
        const avatarEl = document.getElementById('user-avatar');
        if (avatarEl) avatarEl.src = user.photoURL || `https://api.dicebear.com/7.x/pixel-art/svg?seed=${user.uid}`;
        
        await loadPlayerStats();
        await syncDailyTickets();
    } else {
        if (profileEl) {
            profileEl.classList.remove('flex');
            profileEl.classList.add('hidden');
        }
        if (loginOverlay) loginOverlay.classList.remove('hidden');
        
        dailyTicketsLeft = 3;
        updateTicketsUI();
        
        // 重設生涯統計 UI
        playerStats = {
            wins: 0,
            losses: 0,
            totalGames: 0,
            maxLevelReached: 0
        };
        updateStatsUI();
    }

    // 🧹 [移除啟動 Splash] 雲端狀態已就緒，淡出並銷毀啟動畫面！
    const splash = document.getElementById('app-splash');
    if (splash) {
        splash.style.opacity = '0';
        setTimeout(() => splash.remove(), 400);
    }
}

// 🌐 8.2 後端 API 授權傳輸元件
async function fetchWithAuth(endpoint, options = {}) {
    if (!currentUser || currentUser.isAnonymous) {
        throw new Error("Only fully logged-in non-anonymous users can access the backend server.");
    }
    
    try {
        const idToken = await auth.currentUser.getIdToken(false);
        const headers = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${idToken}`,
            ...(options.headers || {})
        };
        
        const response = await fetch(`${BACKEND_URL}${endpoint}`, {
            ...options,
            headers
        });
        
        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            throw new Error(errData.error || `HTTP 錯誤！狀態碼：${response.status}`);
        }
        
        return await response.json();
    } catch (e) {
        console.error(`❌ 後端 API 傳輸失敗 (${endpoint}): `, e.message);
        throw e;
    }
}

// 📊 8.5 玩家統計數據與生涯紀錄系統
async function loadPlayerStats() {
    playerStats = {
        wins: 0,
        losses: 0,
        totalGames: 0,
        maxLevelReached: 0
    };

    // 1. 先從本地讀取（作為備份或離線進度）
    try {
        const localStatsStr = localStorage.getItem('player_stats');
        if (localStatsStr) {
            const parsed = JSON.parse(localStatsStr);
            if (parsed) {
                playerStats = { ...playerStats, ...parsed };
            }
        }
    } catch (e) {
        console.warn("Failed to load local player stats: ", e);
    }

    // 2. 若有 Firebase 且使用者為實名登入，則透過安全後端讀取並同步
    if (isFirebaseActive && currentUser && !currentUser.isAnonymous) {
        try {
            const res = await fetchWithAuth('/api/load-profile');
            if (res && res.success) {
                if (res.stats) {
                    playerStats = res.stats;
                    localStorage.setItem('player_stats', JSON.stringify(playerStats));
                }
                if (Array.isArray(res.unlockedCodex)) {
                    unlockedCodex = res.unlockedCodex;
                    if (!unlockedCodex.includes(0)) unlockedCodex.push(0);
                }
                if (Array.isArray(res.shinyCodex)) shinyCodex = res.shinyCodex;
                if (res.currentAvatarId !== undefined) {
                    currentAvatarId = res.currentAvatarId;
                    if (currentAvatarId === -1) currentAvatarId = 0;
                }
                if (Array.isArray(res.pendingRewards)) pendingRewards = res.pendingRewards;
                
                // 更新頭像 UI
                updateAvatarUI(currentAvatarId);
                
                // 重新渲染圖鑑 (以便正確加載解鎖狀態)
                renderCodex();
                
                // 檢查是否有待領取排行榜獎勵
                checkPendingRewards();
            }
        } catch (e) {
            console.error("Firestore via backend load profile failed: ", e.message);
        }
    }

    updateStatsUI();
}

async function savePlayerStats(updateCloud = true) {
    // 1. 先儲存至本地
    try {
        localStorage.setItem('player_stats', JSON.stringify(playerStats));
    } catch (e) {
        console.warn("Failed to save local player stats: ", e);
    }

    // 2. 本地/匿名用戶只更新 UI。實名用戶會經由結算 API 與雲端完成同步。
    updateStatsUI();
}

function updateStatsUI() {
    const statsEl = document.getElementById('user-stats');
    if (statsEl) {
        const total = playerStats.totalGames || 0;
        const wins = playerStats.wins || 0;
        const winRate = total > 0 ? Math.round((wins / total) * 100) : 0;
        statsEl.innerText = `🏆 ${wins}勝/${playerStats.losses}敗 (${winRate}%)`;
        statsEl.title = `總局數: ${total} | 解鎖最高關卡: 第 ${playerStats.maxLevelReached + 1} 關`;
    }
}

// 全局每日狀態
let dailySession = {
    ticketsUsed: 0,
    dailyLevelIndex: 0,
    midGameState: null
};

function loadLocalDailySession(dateStr) {
    try {
        const localDataStr = localStorage.getItem(`daily_session_${dateStr}`);
        if (localDataStr) {
            const data = JSON.parse(localDataStr);
            if (data) {
                dailySession.ticketsUsed = data.ticketsUsed || 0;
                dailySession.dailyLevelIndex = data.dailyLevelIndex || 0;
                dailySession.midGameState = data.midGameState || null;
            }
        } else {
            // 向後相容舊的 tickets_used 鍵
            const oldTickets = parseInt(localStorage.getItem(`tickets_used_${dateStr}`) || 0);
            dailySession.ticketsUsed = oldTickets;
        }
    } catch (e) {
        console.warn("Failed to load local daily session: ", e);
    }
}

function saveLocalDailySession(dateStr) {
    try {
        localStorage.setItem(`daily_session_${dateStr}`, JSON.stringify(dailySession));
        localStorage.setItem(`tickets_used_${dateStr}`, dailySession.ticketsUsed);
    } catch (e) {
        console.warn("Failed to save local daily session: ", e);
    }
}

async function restoreMidGameState(state, preloadedTiles = null) {
    const dateStr = getTodayString();
    let allOriginalTiles = [];
    const targetLevelIndex = (state && state.currentLevelIndex !== undefined) ? state.currentLevelIndex : GameState.currentLevelIndex;
    
    if (preloadedTiles && Array.isArray(preloadedTiles) && preloadedTiles.length > 0) {
        // 🚀 極致優化：直接採用 100% 預載好的 preloadedTiles，0 網路成本與延遲！
        allOriginalTiles = preloadedTiles;
    } else {
        // 🔒 雙重防禦性防護
        console.error("❌ 嚴重錯誤：未接收到預載的地圖佈局！");
        alert("資料同步異常，請點擊重新整理網頁 🔄");
        return;
    }
    
    // 恢復 GameState 全局變數
    GameState.currentLevelIndex = targetLevelIndex;
    const curLevel = LEVELS[GameState.currentLevelIndex];
    const dailySeed = getDailySeed();
    const levelSeed = dailySeed + GameState.currentLevelIndex;
    GameState.prng = mulberry32(levelSeed);

    if (!state) {
        // 🚀 如果沒有雲端中途存檔，說明是開始全新一局，直接由後端原始佈局生成卡牌
        GameState.tiles = allOriginalTiles.map(tile => {
            const template = TILE_TEMPLATES.find(temp => temp.id === tile.typeId) || TILE_TEMPLATES[0];
            return {
                ...tile,
                template,
                isLocked: false
            };
        });
        GameState.slots = [];
        GameState.out3Storage = [];
        GameState.history = [];
        GameState.status = "playing";
        GameState.nextTileId = GameState.tiles.length;
        GameState.movesLog = [];
        
        GameState.skills.undo = 1;
        GameState.skills.out3 = 1;
        GameState.skills.shuffle = 1;
    } else {
        // 有中途存檔，利用原始卡牌庫對比輕量化的狀態進行重建
        GameState.status = state.status || "playing";
        GameState.nextTileId = state.nextTileId || 0;
        GameState.skills = state.skills || { undo: 1, out3: 1, shuffle: 1 };
        GameState.history = []; // 歷史復原紀錄極簡化，清空以減少傳輸負擔
        GameState.movesLog = state.movesLog || [];
        
        const mapSavedToFullTile = (saved) => {
            const orig = allOriginalTiles.find(t => t.id === saved.id);
            const template = TILE_TEMPLATES.find(temp => temp.id === saved.typeId) || TILE_TEMPLATES[0];
            if (orig) {
                return {
                    ...orig,
                    typeId: saved.typeId,
                    template,
                    isLocked: false
                };
            }
            // 防禦性 fallback
            return {
                id: saved.id,
                typeId: saved.typeId,
                layer: 0,
                x: 250,
                y: 250,
                isLocked: false,
                template
            };
        };
        
        GameState.tiles = (state.tiles || []).map(mapSavedToFullTile);
        GameState.slots = (state.slots || []).map(mapSavedToFullTile);
        GameState.out3Storage = (state.out3Storage || []).map(mapSavedToFullTile);
    }
    
    // 重新繪製畫面與 UI
    evaluateTileOverlaps();
    renderField();
    updateUI();
    
    // 更新關卡指示器與徽章 UI，避免還原高關卡時 UI 顯示為第一關
    loadLevelWithoutRestart(GameState.currentLevelIndex, true); // 👈 確保傳入 true
    const badge = document.getElementById('level-badge');
    if (badge) badge.innerText = curLevel.badge;
    
    // 如果有移出儲存區的卡牌，更新其顯示狀態
    const out3Container = document.getElementById('out3-storage');
    if (out3Container) {
        if (GameState.out3Storage.length > 0) {
            out3Container.classList.remove('hidden');
        } else {
            out3Container.classList.add('hidden');
        }
    }
}

let saveSessionTimeout = null;

async function saveCurrentGameSession(clearMidGame = false) {
    // 🔒 核心防護：如果遊戲不處於遊玩狀態（例如已勝利結算或客滿失敗），且不是強制清空，一律拒絕進行中途存檔！
    if (GameState.status !== "playing" && !clearMidGame) {
        console.log("🚫 [存檔拒絕] 遊戲不處於遊玩狀態（已勝利或失敗），拒絕排程與同步中途存檔。");
        return;
    }

    const dateStr = getTodayString();
    
    dailySession.dailyLevelIndex = GameState.currentLevelIndex;
    
    if (clearMidGame) {
        dailySession.midGameState = null;
    } else {
        // 極輕量化牌局存檔：僅儲存基本 ID、型態與技能數據，過濾掉巨大的 template 像素網格與坐標等
        dailySession.midGameState = {
            tiles: GameState.tiles.map(t => ({ id: t.id, typeId: t.typeId })),
            slots: GameState.slots.map(t => ({ id: t.id, typeId: t.typeId })),
            out3Storage: GameState.out3Storage.map(t => ({ id: t.id, typeId: t.typeId })),
            skills: GameState.skills,
            status: GameState.status,
            nextTileId: GameState.nextTileId,
            currentLevelIndex: GameState.currentLevelIndex,
            movesLog: GameState.movesLog
        };
    }
    
    // 1. 存入本地 (本地儲存維持 100% 即時，保證極速且安全)
    saveLocalDailySession(dateStr);
    
    // 2. 存入雲端 (使用防抖 Debounce 節流機制，避免頻繁點擊造成大量重複 API 請求)
    if (isFirebaseActive && currentUser && !currentUser.isAnonymous) {
        if (saveSessionTimeout) {
            console.log("⏳ [雲端防抖] 偵測到連續點擊，已清除舊的同步排程。");
            clearTimeout(saveSessionTimeout);
        }
        
        if (clearMidGame) {
            console.log("🧹 [本地清除] 遊戲局已結束或重置，本地中途存檔已清空（雲端已由結算或扣票 API 同步清理）。");
            // 🔒 關閉漏洞防護：不向 /api/save-session 送出空（null）存檔！
            // 因為 /api/end-game 與 /api/consume-ticket 已經在後端安全、原子地將雲端 midGameState 清空為 null，
            // 這樣能徹底杜絕玩家透過發送 null 存檔手動規避門票扣除、無限制重複洗開局的漏洞！
            return;
        } else {
            console.log("⏱️ [同步排程] 已設定 1.5 秒防抖計時，等待停止操作後再行同步...");
            saveSessionTimeout = setTimeout(async () => {
                console.log("☁️ [同步雲端] 玩家已停止點擊達 1.5 秒，正在送出最新中途存檔。");
                await sendSessionToCloud(dateStr, dailySession.midGameState);
            }, 1500);
        }
    }
}

async function sendSessionToCloud(dateStr, midGameState) {
    if (isFirebaseActive && currentUser && !currentUser.isAnonymous) {
        try {
            await fetchWithAuth('/api/save-session', {
                method: 'POST',
                body: JSON.stringify({
                    dateStr,
                    midGameState
                })
            });
        } catch (e) {
            console.error("Backend save game session failed: ", e.message);
        }
    }
}

// 🏆 8.8 展示今日極致共鳴通關畫面並鎖定遊戲
function showGrandSlamOverlay() {
    // 在展示大滿貫覆蓋層時，同步更新頂部關卡指示器為最後一關的進度與徽章
    loadLevelWithoutRestart(LEVELS.length - 1);
    const badge = document.getElementById('level-badge');
    if (badge) badge.innerText = LEVELS[LEVELS.length - 1].badge;

    // 🚀 UX 優化：在主遊戲盤面上，渲染一個精緻、 centered 的「極致共鳴已達成」看板！
    const stackContainer = document.getElementById('stack-container');
    if (stackContainer) {
        stackContainer.innerHTML = `
            <div class="absolute inset-0 flex flex-col items-center justify-center text-center p-6 bg-white/80 backdrop-blur-sm rounded-2xl border-4 border-amber-300 shadow-inner select-none animate-fade-in z-50">
                <span class="text-6xl mb-4 animate-bounce">🏆</span>
                <h2 class="text-xl font-black text-amber-500 font-pixel mb-3">今日極致共鳴已達成！</h2>
                <p class="text-xs text-gray-500 font-bold leading-relaxed max-w-[320px]">
                    太棒了！您今天已經成功喚醒所有璀璨的聖域寶石囉！🌸<br>
                    明天的全新晶石法陣將在午夜重新開啟，期待與您明天見！🔮
                </p>
                <div class="mt-6 p-2 bg-amber-50 border border-amber-200 rounded-lg text-[10px] text-amber-700 font-pixel">
                    🔮 完美像素風美學 • 相同能量相同法陣 🔮
                </div>
            </div>
        `;
    }

    const overlay = document.getElementById('game-overlay');
    const title = document.getElementById('overlay-title');
    const subtitle = document.getElementById('overlay-subtitle');
    const icon = document.getElementById('overlay-icon');
    const actionBtn = document.getElementById('btn-overlay-action');
    const statsEl = document.getElementById('overlay-stats');
    
    if (overlay) overlay.classList.remove('hidden');
    if (icon) icon.innerText = "🏆";
    if (title) {
        title.innerText = "今日極致共鳴通關！";
        title.className = "text-2xl font-black text-pink-500 mb-2 font-pixel";
    }
    if (subtitle) {
        subtitle.innerText = "你今天已經成功喚醒所有璀璨 of the 聖域寶石囉！明天的全新關卡將在午夜重新開啟，明天見！🌸";
    }
    if (actionBtn) {
        actionBtn.innerText = "今日極致共鳴達成！🏆 (點此返回)";
        actionBtn.disabled = false; // 允許點擊以關閉覆蓋層查看盤面
        actionBtn.className = "w-full py-3 bg-amber-400 hover:bg-amber-300 text-white font-black text-base border-b-4 border-amber-600 active:border-b-0 active:mt-1 rounded-xl transition-all font-pixel shadow-md cursor-pointer";
    }
    
    if (statsEl) {
        const total = playerStats.totalGames || 0;
        const wins = playerStats.wins || 0;
        const winRate = total > 0 ? Math.round((wins / total) * 100) : 0;
        statsEl.innerHTML = `
            <div class="font-bold text-center text-pink-500 font-pixel text-base mb-1">🎉 聖域極致共鳴解鎖 🎉</div>
            <div class="text-xs text-center text-gray-500 mb-2">您在今天以最完美的智慧與能流解鎖了所有每日晶石法陣！</div>
            <hr class="my-2 border-dashed border-[#e9decb]">
            <div class="font-bold text-gray-500">🏆 生涯戰績: <strong class="text-pink-500">${wins}勝 / ${playerStats.losses}敗 (${winRate}%)</strong></div>
            <div class="font-bold text-gray-500">🌟 最高解鎖: <strong class="text-indigo-500">第 ${playerStats.maxLevelReached + 1} 關</strong></div>
        `;
    }
}

// 🎫 9. 門票同步與扣除系統
async function syncDailyTickets() {
    const dateStr = getTodayString();
    
    // 🚀 UX 優化：在獲取每日狀態時，主遊戲盤面立即呈現精緻的 8-Bit 載入狀態，提升視覺流暢度！
    const stackContainer = document.getElementById('stack-container');
    if (stackContainer) {
        stackContainer.innerHTML = `
            <div class="absolute inset-0 flex flex-col items-center justify-center text-center p-6 bg-[#fffdf9] rounded-2xl select-none animate-fade-in z-50">
                <span class="text-6xl mb-4 animate-bounce">🔮</span>
                <h2 class="text-base font-black text-[#ff8fa3] font-pixel mb-3">正在共鳴聖域晶石...</h2>
                <p class="text-xs text-gray-400 font-bold leading-relaxed max-w-[320px]">
                    正在引導法陣，同步今天啟動券、通關進度與雲端同步數據... 🔮
                </p>
            </div>
        `;
    }
    
    // 重設每日 session 預設值
    dailySession = {
        ticketsUsed: 0,
        dailyLevelIndex: 0,
        midGameState: null
    };
    
    if (isFirebaseActive && currentUser && !currentUser.isAnonymous) {
        try {
            const res = await fetchWithAuth(`/api/sync-daily-session/${dateStr}`);
            if (res && res.success && res.dailySession) {
                dailySession = res.dailySession;
            }
        } catch (e) {
            console.error("Backend sync ticket failed: ", e.message);
            loadLocalDailySession(dateStr);
        }
    } else {
        loadLocalDailySession(dateStr);
    }
    
    // 同步到本地
    saveLocalDailySession(dateStr);
    
    dailyTicketsLeft = Math.max(0, 3 - dailySession.ticketsUsed);
    updateTicketsUI();
    
    // 將關卡設為今日紀錄的關卡
    GameState.currentLevelIndex = dailySession.dailyLevelIndex;
    
    // 🔒 核心安全防護：如果今日已達成 5 關大滿貫，直接彈出鎖定畫面，不允許載入或重啟！
    if (GameState.currentLevelIndex >= LEVELS.length) {
        showGrandSlamOverlay();
        return;
    }
    
    // 🛡️ [狀態優先] 
    console.log("🔍 [Debug] syncDailyTickets state:", {
        midGameState: dailySession.midGameState,
        ticketsLeft: dailyTicketsLeft
    });

    if (dailySession.midGameState !== null && dailySession.midGameState !== undefined) {
        // 有存檔：直接恢復，強制隱藏票券不足 UI
        console.log("📂 [牌局恢復] 恢復今日未完結之牌局進度：第 " + (GameState.currentLevelIndex + 1) + " 關");
        hideTicketOverlay();
        restoreMidGameState(dailySession.midGameState, dailySession.tiles);
    } else if (dailyTicketsLeft <= 0) {
        // 無存檔且無票：徹底封鎖
        console.log("🚫 [無票局] 無存檔且無票，顯示封鎖畫面。");
        loadLevelWithoutRestart(GameState.currentLevelIndex, false);
        showTicketOverlay(true);
    } else {
        // 有票且無存檔：正常開始
        console.log("✅ [新牌局] 有票且無存檔，開始新遊戲。");
        hideTicketOverlay();
        loadLevelWithoutRestart(GameState.currentLevelIndex, false);
        startGame(true, dailySession.tiles);
    }
}

async function consumeTicket() {
    if (dailyTicketsLeft <= 0) {
        showTicketOverlay(true);
        return false;
    }
    
    dailyTicketsLeft--;
    updateTicketsUI();
    
    const dateStr = getTodayString();
    
    if (isFirebaseActive && currentUser && !currentUser.isAnonymous) {
        try {
            // 🔒 實名帳號：向後端安全 API 請求扣票，後端會在資料庫事務中原子化累加並清除中途存檔！
            const res = await fetchWithAuth('/api/consume-ticket', {
                method: 'POST',
                body: JSON.stringify({ dateStr })
            });
            if (res && res.success) {
                dailySession.ticketsUsed = res.ticketsUsed;
                dailySession.midGameState = res.midGameState; // 🚀 保存後端產生的初始關卡狀態！
                dailySession.tiles = res.tiles; // 🚀 保存後端產生的初始卡牌佈局位置！
                saveLocalDailySession(dateStr);
            }
        } catch (e) {
            console.error("❌ 後端安全扣票失敗，降級本地安全備份：", e.message);
            dailySession.ticketsUsed = 3 - dailyTicketsLeft;
            saveLocalDailySession(dateStr);
        }
    } else {
        // 匿名或離線：直接本地模擬扣除
        dailySession.ticketsUsed = 3 - dailyTicketsLeft;
        saveLocalDailySession(dateStr);
    }
    return true;
}

function updateTicketsUI() {
    const lbl = document.getElementById('lbl-tickets-left');
    if (lbl) lbl.innerText = `🎫 x${dailyTicketsLeft}`;
    
    const hearts = document.getElementById('ticket-visual-hearts');
    if (hearts) {
        hearts.innerHTML = "";
        for (let i = 0; i < 3; i++) {
            hearts.innerHTML += i < dailyTicketsLeft ? "❤️ " : "🖤 ";
        }
    }
}

function showTicketOverlay(canClose = true) {
    const overlay = document.getElementById('ticket-overlay');
    overlay.classList.remove('hidden');
    document.getElementById('info-ticket-date').innerText = getTodayString();
    
    const btnClose = document.getElementById('btn-close-ticket');
    if (btnClose) {
        btnClose.style.display = canClose ? 'block' : 'none';
    }
}

function hideTicketOverlay() {
    const overlay = document.getElementById('ticket-overlay');
    if (overlay) overlay.classList.add('hidden');
}

function loadLevelWithoutRestart(levelIdx, suppressDepletionUI = false) {
    console.log(`🔍 [Debug] loadLevelWithoutRestart: levelIdx=${levelIdx}, suppressDepletionUI=${suppressDepletionUI}, ticketsLeft=${dailyTicketsLeft}`);
    GameState.currentLevelIndex = Math.min(LEVELS.length - 1, Math.max(0, levelIdx));
    
    const progressPercent = ((GameState.currentLevelIndex + 1) / LEVELS.length) * 100;
    const bar = document.getElementById('bar-level-progress');
    if (bar) bar.style.width = `${progressPercent}%`;
    
    const lbl = document.getElementById('lbl-level-num');
    if (lbl) lbl.innerText = `${GameState.currentLevelIndex + 1} / ${LEVELS.length}`;
    
    // 🛡️ [防禦性 UI] 若無票券，且未設定隱藏提示，強制清空並顯示提示
    if (dailyTicketsLeft <= 0 && !suppressDepletionUI) {
        console.log("🚫 [Debug] loadLevelWithoutRestart: Showing depletion UI");
        const stackContainer = document.getElementById('stack-container');
        if (stackContainer) {
            stackContainer.innerHTML = `
                <div class="absolute inset-0 flex flex-col items-center justify-center text-center p-6 bg-[#fffdf9] rounded-2xl select-none animate-fade-in z-50">
                    <span class="text-6xl mb-4">🖤</span>
                    <h2 class="text-lg font-black text-gray-500 font-pixel mb-3">今日啟動券已耗盡</h2>
                    <p class="text-xs text-gray-400 font-bold leading-relaxed">
                        明天的全新晶石法陣將在午夜重新開啟，請明天再來挑戰共鳴吧！🔮
                    </p>
                </div>
            `;
        }
    } else {
        console.log("✅ [Debug] loadLevelWithoutRestart: NOT showing depletion UI");
    }
}

function drawTileCanvas(canvas, template) {
    const ctx = canvas.getContext('2d');
    const size = canvas.width;
    ctx.clearRect(0, 0, size, size);
    
    // 1. 🪟 繪製毛玻璃基底（Glassmorphism Backing）
    ctx.save();
    
    const radius = size * 0.12;
    ctx.beginPath();
    ctx.moveTo(radius, 0);
    ctx.lineTo(size - radius, 0);
    ctx.quadraticCurveTo(size, 0, size, radius);
    ctx.lineTo(size, size - radius);
    ctx.quadraticCurveTo(size, size, size - radius, size);
    ctx.lineTo(radius, size);
    ctx.quadraticCurveTo(0, size, 0, size - radius);
    ctx.lineTo(0, radius);
    ctx.quadraticCurveTo(0, 0, radius, 0);
    ctx.closePath();
    ctx.clip();
    
    // A. 毛玻璃底色（高透晶瑩明亮白，亮度大幅提升！）
    ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.fillRect(0, 0, size, size);
    
    // B. 內部縱向立體漸層，增加玻璃邊緣折射厚度（高亮度透光版）
    const glassGrad = ctx.createLinearGradient(0, 0, 0, size);
    glassGrad.addColorStop(0, 'rgba(255, 255, 255, 0.95)');
    glassGrad.addColorStop(0.3, 'rgba(255, 255, 255, 0.3)');
    glassGrad.addColorStop(1, 'rgba(0, 0, 0, 0.03)');
    ctx.fillStyle = glassGrad;
    ctx.fillRect(0, 0, size, size);
    
    // 2. 💎 繪製真實載入的寶石圖片素材 (等比例縮放且縮減空白邊緣使其更大)
    const imgId = template.id + 1;
    const gemImg = gemImages[imgId];
    if (gemImg && gemImg.complete) {
        const padding = size * 0.04;
        const destSize = size - padding * 2;
        
        const imgW = gemImg.naturalWidth || gemImg.width;
        const imgH = gemImg.naturalHeight || gemImg.height;
        const ratio = imgW / imgH;
        
        let dWidth = destSize;
        let dHeight = destSize;
        
        if (ratio > 1) {
            dHeight = destSize / ratio;
        } else {
            dWidth = destSize * ratio;
        }
        
        // 放大 1.25 倍（25% 縮放），利用 clip 自動裁切圖片四周多餘的透明空白
        const zoom = 1.25;
        const zWidth = dWidth * zoom;
        const zHeight = dHeight * zoom;
        
        const dx = padding + (destSize - zWidth) / 2;
        const dy = padding + (destSize - zHeight) / 2;
        
        ctx.drawImage(gemImg, dx, dy, zWidth, zHeight);
    } else {
        // Fallback placeholder while loading
        ctx.fillStyle = 'rgba(255, 143, 163, 0.5)';
        ctx.beginPath();
        ctx.arc(size/2, size/2, size * 0.3, 0, Math.PI * 2);
        ctx.fill();
    }
    
    // 3. ☄️ 繪製斜角玻璃反光線 (Diagonal Glass Reflection Sweep)
    const sweepGrad = ctx.createLinearGradient(0, 0, size, size);
    sweepGrad.addColorStop(0, 'rgba(255, 255, 255, 0)');
    sweepGrad.addColorStop(0.35, 'rgba(255, 255, 255, 0)');
    sweepGrad.addColorStop(0.4, 'rgba(255, 255, 255, 0.2)');
    sweepGrad.addColorStop(0.45, 'rgba(255, 255, 255, 0.5)');
    sweepGrad.addColorStop(0.5, 'rgba(255, 255, 255, 0.1)');
    sweepGrad.addColorStop(0.55, 'rgba(255, 255, 255, 0)');
    sweepGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
    
    ctx.fillStyle = sweepGrad;
    ctx.fillRect(0, 0, size, size);
    
    ctx.restore();
}

function renderCodex() {
    const container = document.getElementById('codex-container');
    if (!container) return;
    container.innerHTML = "";
    
    TILE_TEMPLATES.forEach(item => {
        const isUnlocked = unlockedCodex.includes(item.id);
        const isShiny = shinyCodex.includes(item.id);
        const isCurrentAvatar = currentAvatarId === item.id;
        
        const itemEl = document.createElement('div');
        
        let borderClass = "border-[#e9decb]";
        if (isShiny) borderClass = "shiny-border";
        else if (isCurrentAvatar) borderClass = "border-green-400 shadow-sm";
        
        itemEl.className = `flex items-start gap-2.5 p-2 bg-[#fffcf8]/70 backdrop-blur-sm rounded-xl border-2 ${borderClass} transition-all text-xs ${
            isUnlocked 
                ? 'cursor-pointer hover:border-pink-300 hover:bg-[#fffbf4]/90' 
                : 'locked-grayscale'
        }`;
        
        itemEl.title = isUnlocked 
            ? (isCurrentAvatar ? "當前選用的個人頭像" : "點擊設定為個人頭像 🐾") 
            : "每週或每月排行前 50 名解鎖此圖鑑 🔒";
        
        const canvas = document.createElement('canvas');
        canvas.width = 36;
        canvas.height = 36;
        canvas.className = "bg-white p-0.5 rounded-lg border border-[#e9decb] flex-shrink-0";
        
        itemEl.appendChild(canvas);
        
        const info = document.createElement('div');
        info.className = "flex-1 min-w-0 text-[#5c4a49]";
        
        const avatarBadge = isCurrentAvatar ? `<span class="text-[8px] bg-green-500 text-white font-black px-1.5 py-0.5 rounded-full ml-1 select-none">使用中</span>` : "";
        const shinyText = isShiny ? `<span class="text-[8.5px] text-amber-500 font-bold ml-1">★閃耀</span>` : "";
        const nameText = isUnlocked ? `${item.name}` : `🔒 未知晶石`;
        const descText = isUnlocked ? item.desc : "達到每週或每月排行榜前 50 名，即可解鎖並收藏此精緻晶石！";
        
        info.innerHTML = `
            <div class="flex justify-between items-center mb-0.5">
                <span class="font-black text-pink-500 font-sans">${nameText}${avatarBadge}${shinyText}</span>
                <span class="text-[9px] text-gray-400 font-pixel">ID: ${String(item.id).padStart(2, '0')}</span>
            </div>
            <p class="text-[10px] text-gray-500 leading-relaxed font-medium mt-1 break-words">${descText}</p>
        `;
        itemEl.appendChild(info);
        container.appendChild(itemEl);
        
        if (isUnlocked) {
            itemEl.addEventListener('click', () => changeAvatar(item.id));
        }
        
        setTimeout(() => drawTileCanvas(canvas, item), 10);
    });
}

function setupEventListeners() {
    document.getElementById('skill-undo').addEventListener('click', useSkillUndo);
    document.getElementById('skill-out3').addEventListener('click', useSkillOut3);
    document.getElementById('skill-shuffle').addEventListener('click', useSkillShuffle);

    // Sidebar Tabs toggling
    const tabCodex = document.getElementById('tab-codex');
    const tabLeaderboard = document.getElementById('tab-leaderboard');
    const panelCodex = document.getElementById('panel-codex');
    const panelLeaderboard = document.getElementById('panel-leaderboard');

    if (tabCodex && tabLeaderboard && panelCodex && panelLeaderboard) {
        tabCodex.addEventListener('click', () => {
            Sound.playClick();
            tabCodex.classList.add('text-[#ff8fa3]', 'border-[#ff8fa3]');
            tabCodex.classList.remove('text-gray-400', 'border-transparent');
            tabLeaderboard.classList.add('text-gray-400', 'border-transparent');
            tabLeaderboard.classList.remove('text-[#ff8fa3]', 'border-[#ff8fa3]');
            panelCodex.classList.remove('hidden');
            panelLeaderboard.classList.add('hidden');
        });

        tabLeaderboard.addEventListener('click', () => {
            Sound.playClick();
            tabLeaderboard.classList.add('text-[#ff8fa3]', 'border-[#ff8fa3]');
            tabLeaderboard.classList.remove('text-gray-400', 'border-transparent');
            tabCodex.classList.add('text-gray-400', 'border-transparent');
            tabCodex.classList.remove('text-[#ff8fa3]', 'border-[#ff8fa3]');
            panelCodex.classList.add('hidden');
            panelLeaderboard.classList.remove('hidden');
            loadLeaderboardData();
        });
    }

    // Leaderboard Sub-Tabs toggling
    const tabLBDaily = document.getElementById('tab-leaderboard-daily');
    const tabLBWeekly = document.getElementById('tab-leaderboard-weekly');
    const tabLBMonthly = document.getElementById('tab-leaderboard-monthly');
    if (tabLBDaily && tabLBWeekly && tabLBMonthly) {
        const resetTabs = () => {
            tabLBDaily.classList.remove('bg-white', 'text-gray-700', 'shadow-sm');
            tabLBDaily.classList.add('text-gray-500');
            tabLBWeekly.classList.remove('bg-white', 'text-gray-700', 'shadow-sm');
            tabLBWeekly.classList.add('text-gray-500');
            tabLBMonthly.classList.remove('bg-white', 'text-gray-700', 'shadow-sm');
            tabLBMonthly.classList.add('text-gray-500');
        };

        tabLBDaily.addEventListener('click', () => {
            Sound.playClick();
            resetTabs();
            tabLBDaily.classList.add('bg-white', 'text-gray-700', 'shadow-sm');
            tabLBDaily.classList.remove('text-gray-500');
            currentLeaderboardType = 'daily';
            renderLeaderboard();
        });

        tabLBWeekly.addEventListener('click', () => {
            Sound.playClick();
            resetTabs();
            tabLBWeekly.classList.add('bg-white', 'text-gray-700', 'shadow-sm');
            tabLBWeekly.classList.remove('text-gray-500');
            currentLeaderboardType = 'weekly';
            renderLeaderboard();
        });

        tabLBMonthly.addEventListener('click', () => {
            Sound.playClick();
            resetTabs();
            tabLBMonthly.classList.add('bg-white', 'text-gray-700', 'shadow-sm');
            tabLBMonthly.classList.remove('text-gray-500');
            currentLeaderboardType = 'monthly';
            renderLeaderboard();
        });
    }

    document.getElementById('btn-overlay-action').addEventListener('click', () => {
        document.getElementById('game-overlay').classList.add('hidden');
        
        // 🔒 如果今日已完成大滿貫，點擊按鈕僅用於「關閉覆蓋層以查看盤面」，不啟動新局！
        if (dailySession.dailyLevelIndex >= LEVELS.length) {
            console.log("🏆 大滿貫挑戰已完成，僅關閉覆蓋層供玩家查看盤面。");
            return;
        }

        if (GameState.status === "victory") {
            if (GameState.currentLevelIndex < LEVELS.length - 1) {
                GameState.currentLevelIndex++;
                loadLevelWithoutRestart(GameState.currentLevelIndex);
                // 🚀 極致優化：進入下一關時，直接傳送後端結算時伴隨下發的全新關卡佈局，0 網路開銷！
                startGame(true, dailySession.tiles);
            } else {
                alert("🎉 恭喜您達成了極致共鳴大滿貫！現在回到第一關重新開始探索，將消耗 1 張啟動券！");
                GameState.currentLevelIndex = 0;
                loadLevelWithoutRestart(0);
                startGame(false);
            }
        } else {
            // 檢查票券後再決定是否開始
            if (dailyTicketsLeft <= 0) {
                // 若無票券，清空場景並強制渲染票券不足提示
                document.getElementById('stack-container').innerHTML = "";
                document.getElementById('slots-container').innerHTML = "";
                document.getElementById('out3-storage').classList.add('hidden');
                document.getElementById('out3-container').innerHTML = "";
                
                // 必須重新呼叫一次以觸發防禦性 UI 渲染
                loadLevelWithoutRestart(GameState.currentLevelIndex, false);
                showTicketOverlay(true);
            } else {
                // 有票，重置畫面以便開始新局
                document.getElementById('stack-container').innerHTML = "";
                document.getElementById('slots-container').innerHTML = "";
                document.getElementById('out3-storage').classList.add('hidden');
                document.getElementById('out3-container').innerHTML = "";
                startGame(false);
            }
        }
    });

    const btnCloseTicket = document.getElementById('btn-close-ticket');
    if (btnCloseTicket) {
        btnCloseTicket.addEventListener('click', () => {
            Sound.playClick();
            hideTicketOverlay();
        });
    }
}

function setupAuthEvents() {
    document.getElementById('btn-login-google').addEventListener('click', async () => {
        Sound.playClick();
        if (isFirebaseActive && auth) {
            const provider = new firebase.auth.GoogleAuthProvider();
            try {
                await auth.signInWithPopup(provider);
            } catch (e) {
                console.error("Google login failed: ", e);
                alert("Google 登入失敗，請重試！");
            }
        } else {
            alert("⚠️ 雲端服務尚未啟用，無法使用 Google 登入！");
        }
    });

    document.getElementById('btn-logout').addEventListener('click', async () => {
        Sound.playClick();
        if (isFirebaseActive && auth) {
            await auth.signOut();
        }
    });
}

// ==========================================
// 🎮 12. 核心遊戲引擎邏輯
// ==========================================
async function startGame(isContinuing = false, preloadedTiles = null) {
    if (!currentUser) {
        document.getElementById('login-overlay').classList.remove('hidden');
        return;
    }

    // 🔒 嚴格安全檢查：不允許無票開始新局
    if (!isContinuing && dailyTicketsLeft <= 0) {
        console.warn("🚫 [安全封鎖] 票券不足，拒絕開始新局。");
        showTicketOverlay();
        return;
    }

    if (!isContinuing) {
        const success = await consumeTicket();
        if (!success) {
            showTicketOverlay();
            return;
        }
        hideTicketOverlay();
        // 🚀 極致優化：扣票成功後，將伴隨下發的初始佈局賦值給 preloadedTiles，避免後續進行任何網路請求！
        preloadedTiles = dailySession.tiles;
    }
    
    // 🚀 核心極簡重構：現在每一關的初始存檔都由伺服器在「扣票」、「通關結算」或「同步」時預先產生並儲存！
    // 所以前端不論是重新挑戰還是繼續，一律直接調用還原函數，完美達成一條線設計！
    await restoreMidGameState(dailySession.midGameState, preloadedTiles);
}

// 15. 核心遮擋演算法 - AABB 完全對齊版
function evaluateTileOverlaps() {
    const tileWidth = 58;
    const tileHeight = 70;

    for (const tileToCheck of GameState.tiles) {
        let isCovered = false;
        const b_left = tileToCheck.x - tileWidth / 2;
        const b_right = tileToCheck.x + tileWidth / 2;
        const b_top = tileToCheck.y - tileHeight / 2;
        const b_bottom = tileToCheck.y + tileHeight / 2;

        for (const otherTile of GameState.tiles) {
            if (otherTile.layer > tileToCheck.layer) {
                const a_left = otherTile.x - tileWidth / 2;
                const a_right = otherTile.x + tileWidth / 2;
                const a_top = otherTile.y - tileHeight / 2;
                const a_bottom = otherTile.y + tileHeight / 2;
                
                const overlapsX = (a_left < b_right && a_right > b_left);
                const overlapsY = (a_top < b_bottom && a_bottom > b_top);

                if (overlapsX && overlapsY) {
                    isCovered = true;
                    break;
                }
            }
        }
        tileToCheck.isLocked = isCovered;
    }
}

// Optimized cached drawing
function drawCachedTile(canvas, tileId) {
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const cachedCanvas = tileCache[tileId];
    if (cachedCanvas) {
        ctx.drawImage(cachedCanvas, 0, 0, canvas.width, canvas.height);
    }
}

// 16. 渲染卡牌到畫面上 (絕對坐標 + translate 居中錨定)
function renderField() {
    const container = document.getElementById('stack-container');
    if (!container) return;
    
    container.innerHTML = "";
    
    evaluateTileOverlaps();
    
    const sortedTiles = [...GameState.tiles].sort((a, b) => a.layer - b.layer);
    
    sortedTiles.forEach(tile => {
        const el = document.createElement('div');
        el.id = `tile-${tile.id}`;
        el.className = `game-tile ${tile.isLocked ? 'is-locked' : ''}`;
        
        el.style.left = `${tile.x}px`;
        el.style.top = `${tile.y}px`;
        el.style.width = '58px';
        el.style.height = '70px';
        el.style.transform = 'translate(-50%, -50%)';
        el.style.zIndex = tile.layer * 10;
        
        const canvas = el.appendChild(document.createElement('canvas'));
        canvas.width = 48;
        canvas.height = 48;
        canvas.className = "w-full h-auto aspect-square pointer-events-none";
        
        el.addEventListener('click', (e) => handleTileClick(tile, e));
        container.appendChild(el);
        drawCachedTile(canvas, tile.template.id);
    });
    
    resizeGameContainer();
}

// 16.5. 高性能增量更新遮擋狀態 (僅切換現有 DOM 的 class，避免銷毀重建，性能飆升數萬倍！)
function updateFieldLockStates() {
    evaluateTileOverlaps();
    for (const tile of GameState.tiles) {
        const el = document.getElementById(`tile-${tile.id}`);
        if (el) {
            if (tile.isLocked) {
                el.classList.add('is-locked');
            } else {
                el.classList.remove('is-locked');
            }
        }
    }
}

// 17. 點擊卡牌處理
async function handleTileClick(tile, event) {
    if (GameState.status !== "playing") return;
    if (tile.isLocked) return;
    
    // 檢查卡牌是否仍在場上，避免快速雙擊產生重複點擊
    if (!GameState.tiles.some(t => t.id === tile.id)) return;
    
    Sound.playClick();
    saveHistoryState();
    
    // 記錄玩家點擊步驟以進行後端防作弊校驗
    GameState.movesLog.push({ a: 'click', id: tile.id });
    
    GameState.tiles = GameState.tiles.filter(t => t.id !== tile.id);
    
    const tileEl = document.getElementById(`tile-${tile.id}`);
    const rect = tileEl ? tileEl.getBoundingClientRect() : { left: 0, top: 0, width: 58, height: 70 };
    const particleX = rect.left + rect.width / 2;
    const particleY = rect.top + rect.height / 2;
    
    if (tileEl) {
        tileEl.remove(); // 🚀 點擊後，立刻將該卡牌從 DOM 樹中完全移除，釋放記憶體！
    }
    
    // BUG FIX: 徹底刪除會自動排序的 .splice + .sort，
    // 改用最單純、最可靠的 push，保證卡牌 100% 依照點擊順序飛入晶石槽末尾，不再亂跳！
    GameState.slots.push(tile);
    
    // 動畫飛入邏輯保持不變，它會自動尋找最後一個空格
    animateTileFly(rect, GameState.slots.length - 1, tile, async () => {
        checkMatchThree(tile.typeId, particleX, particleY);
        updateFieldLockStates(); // 🚀 高性能增量更新：不銷毀 DOM、不重繪 Canvas，0ms 瞬間完成！
        updateUI();
        await saveCurrentGameSession(false);
        await checkGameStatus();
    });
}

// 18. 卡牌飛入動畫 (採用 CSS translate3d + scale 進行 GPU 硬體加速，徹底解決手機端卡頓 Reflow 痛點！)
function animateTileFly(fromRect, targetSlotIdx, tile, onComplete) {
    const slotsContainer = document.getElementById('slots-container');
    const targetSlotEl = slotsContainer.children[targetSlotIdx];
    const targetRect = targetSlotEl.getBoundingClientRect();
    
    const flyEl = document.createElement('div');
    flyEl.className = "mini-tile fixed z-[210] pointer-events-none bg-white flex flex-col items-center justify-center";
    flyEl.style.left = `${fromRect.left}px`;
    flyEl.style.top = `${fromRect.top}px`;
    flyEl.style.width = `${fromRect.width}px`;
    flyEl.style.height = `${fromRect.height}px`;
    flyEl.style.border = 'none';
    flyEl.style.boxShadow = '0 3px 0 #e9decb';
    flyEl.style.transform = 'translate3d(0, 0, 0)';
    flyEl.style.transformOrigin = 'top left';
    
    const canvas = document.createElement('canvas');
    canvas.width = 36;
    canvas.height = 36;
    flyEl.appendChild(canvas);
    
    document.body.appendChild(flyEl);
    drawCachedTile(canvas, tile.template.id);
    
    const deltaX = targetRect.left - fromRect.left;
    const deltaY = targetRect.top - fromRect.top;
    const scaleX = targetRect.width / fromRect.width;
    const scaleY = targetRect.height / fromRect.height;
    
    flyEl.style.transition = "transform 0.22s cubic-bezier(0.215, 0.610, 0.355, 1)";
    flyEl.clientHeight; // reflow
    flyEl.style.transform = `translate3d(${deltaX}px, ${deltaY}px, 0) scale(${scaleX}, ${scaleY})`;
    
    flyEl.addEventListener('transitionend', () => {
        flyEl.remove();
        onComplete();
    });
}

// 19. 三消消除邏輯
function checkMatchThree(typeId, particleX, particleY) {
    const count = GameState.slots.filter(t => t.typeId === typeId).length;
    if (count >= 3) {
        Sound.playMatch();
        let removedCount = 0;
        GameState.slots = GameState.slots.filter(t => {
            if (t.typeId === typeId && removedCount < 3) {
                removedCount++;
                return false;
            }
            return true;
        });
        const matchedTmpl = TILE_TEMPLATES.find(t => t.id === typeId);
        const pColors = matchedTmpl ? matchedTmpl.colors : ['#ffb5a7'];
        Particles.spawn(particleX, particleY, [...pColors, '#ffffff', '#ffd166', '#f1c0e8']);
    }
}

// 20. 輸贏判定
async function checkGameStatus() {
    if (GameState.tiles.length === 0 && GameState.slots.length === 0 && GameState.out3Storage.length === 0) {
        await endGame("victory");
    } else if (GameState.slots.length >= 7) {
        await endGame("defeat");
    }
}

async function endGame(result) {
    if (GameState.status === "victory" || GameState.status === "defeat") {
        // 已經結算過，避免重複觸發或重複計算數據
        return;
    }
    GameState.status = result;
    
    // 🔒 核心防護：一旦進入結算，立刻清除任何待送出的中途存檔計時器！
    if (saveSessionTimeout) {
        console.log("🛑 [結算中斷] 遊戲已進入結算階段，強行取消待送出的中途存檔。");
        clearTimeout(saveSessionTimeout);
        saveSessionTimeout = null;
    }
    
    // 🚀 UX 極致優化：立即彈出結算視窗並呈現 8-Bit 動態同步與安全校驗中狀態，消除任何網路延遲等待感！
    const overlay = document.getElementById('game-overlay');
    const title = document.getElementById('overlay-title');
    const subtitle = document.getElementById('overlay-subtitle');
    const icon = document.getElementById('overlay-icon');
    const actionBtn = document.getElementById('btn-overlay-action');
    const statsEl = document.getElementById('overlay-stats');
    
    if (overlay) overlay.classList.remove('hidden');
    if (icon) icon.innerText = result === "victory" ? "🎉" : "🥺";
    if (title) {
        title.innerText = result === "victory" ? "法陣共鳴大成功！" : "晶石槽客滿了！";
        title.className = `text-2xl font-black mb-2 font-pixel ${result === "victory" ? "text-pink-500" : "text-blue-500"}`;
    }
    if (subtitle) {
        subtitle.innerText = "正在同步聖域晶石雲端數據，並進行安全防作弊重播驗證...";
    }
    if (actionBtn) {
        actionBtn.innerText = "正在共鳴晶能... 🔮";
        actionBtn.disabled = true;
        actionBtn.className = "w-full py-3 bg-gray-300 text-gray-500 border-b-4 border-gray-400 font-pixel text-base rounded-xl transition-all cursor-not-allowed";
    }
    if (statsEl) {
        statsEl.innerHTML = `
            <div class="flex flex-col items-center justify-center py-6 text-gray-500 font-pixel text-[10px]">
                <span class="animate-spin text-xl mb-1">🔮</span>
                <span>正在引導法陣重播驗證...</span>
            </div>
        `;
    }
    
    const dateStr = getTodayString();
    
    if (isFirebaseActive && currentUser && !currentUser.isAnonymous) {
        try {
            // 實名帳號：將結算、戰績統計與每日關卡前進，完全交給安全後端校驗與寫入
            const res = await fetchWithAuth('/api/end-game', {
                method: 'POST',
                body: JSON.stringify({
                    result,
                    currentLevelIndex: GameState.currentLevelIndex,
                    dateStr,
                    movesLog: GameState.movesLog
                })
            });
            
            if (res && res.success && res.stats) {
                playerStats = res.stats;
                dailySession.dailyLevelIndex = res.nextDailyLevel;
                dailySession.midGameState = res.midGameState; // 🚀 保存後端結算時預先產生好的下一關初始中途存檔！
                dailySession.tiles = res.tiles; // 🚀 保存後端結算時伴隨下發的下一關初始卡牌佈局！
                
                // 同步本地備份快取
                localStorage.setItem('player_stats', JSON.stringify(playerStats));
                saveLocalDailySession(dateStr);
            }
        } catch (e) {
            console.error("❌ 後端校驗結算失敗，降級使用本地安全模擬演算：", e.message);
            performLocalEndGameCalculation(result);
        }
    } else {
        // 匿名或離線模式：直接在前端進行本地快取安全演算
        performLocalEndGameCalculation(result);
    }

    // 🚀 當 API 回應完畢，立即用真實數據更新視窗並解鎖互動按鈕！
    const curLevel = LEVELS[GameState.currentLevelIndex];
    if (statsEl) {
        const total = playerStats.totalGames || 0;
        const wins = playerStats.wins || 0;
        const winRate = total > 0 ? Math.round((wins / total) * 100) : 0;
        statsEl.innerHTML = `
            <div class="font-bold">🏞️ 關卡名稱: <strong class="text-pink-500 font-pixel text-[11px]">${curLevel.title}</strong></div>
            <div class="font-bold">✨ 晶石總數: <strong class="text-gray-700">${curLevel.tileCount} 顆</strong></div>
            <div class="font-bold">🧩 晶石種類: <strong class="text-gray-700">${curLevel.typesCount} 種</strong></div>
            <div class="font-bold">🌿 堆疊深度: <strong class="text-blue-500">${curLevel.layers} 層</strong></div>
            <hr class="my-2 border-dashed border-[#e9decb]">
            <div class="font-bold text-gray-500">🏆 生涯戰績: <strong class="text-pink-500">${wins}勝 / ${playerStats.losses}敗 (${winRate}%)</strong></div>
            <div class="font-bold text-gray-500">🌟 最高解鎖: <strong class="text-indigo-500">第 ${playerStats.maxLevelReached + 1} 關</strong></div>
        `;
    }
    
    if (result === "victory") {
        Sound.playWin();
        if (subtitle) subtitle.innerText = "太厲害了！您成功將法陣中所有璀璨晶石完美共鳴！";
        if (actionBtn) {
            actionBtn.disabled = false;
            if (GameState.currentLevelIndex < LEVELS.length - 1) {
                actionBtn.innerText = "共鳴下一關 🔮";
                actionBtn.className = "w-full py-3 bg-pink-400 hover:bg-pink-300 text-white font-black text-base border-b-4 border-pink-600 active:border-b-0 active:mt-1 rounded-xl transition-all font-pixel shadow-md";
            } else {
                actionBtn.innerText = "今日極致共鳴達成！🏆 (點此返回)";
                actionBtn.className = "w-full py-3 bg-amber-400 hover:bg-amber-300 text-white font-black text-base border-b-4 border-amber-600 active:border-b-0 active:mt-1 rounded-xl transition-all font-pixel shadow-md cursor-pointer";
                if (subtitle) {
                    subtitle.innerText = "🏆 太震撼了！您已順利通關今日所有晶石法陣，達成極致共鳴！明天的全新晶石法陣將在午夜開啟，明天見！🔮";
                }
            }
        }
    } else {
        Sound.playLose();
        if (subtitle) subtitle.innerText = dailyTicketsLeft > 0 
            ? "好遺憾！晶石槽已客滿。重試將扣除 1 張今日啟動券（剩餘 " + dailyTicketsLeft + " 張）"
            : "好遺憾！晶石槽已客滿，且今日啟動券已耗盡。";
        if (actionBtn) {
            actionBtn.innerText = dailyTicketsLeft > 0 ? "重新挑戰 🔄" : "知道了 (返回) 🔮";
            actionBtn.disabled = false; // 永遠允許返回主畫面，不管有沒有票
            actionBtn.className = "w-full py-3 bg-blue-400 hover:bg-blue-300 text-white font-black text-base border-b-4 border-blue-600 active:border-b-0 active:mt-1 rounded-xl transition-all font-pixel shadow-md";
        }
    }
}

// 🏆 20.5 降級/離線本地安全模擬結算演算
function performLocalEndGameCalculation(result) {
    const dateStr = getTodayString();
    
    if (result === "victory") {
        playerStats.wins++;
        if (GameState.currentLevelIndex >= playerStats.maxLevelReached) {
            playerStats.maxLevelReached = Math.min(LEVELS.length - 1, GameState.currentLevelIndex + 1);
        }
        
        if (GameState.currentLevelIndex < LEVELS.length - 1) {
            dailySession.dailyLevelIndex = GameState.currentLevelIndex + 1;
        } else {
            dailySession.dailyLevelIndex = 3; // 贏了第三關設為 3 表示今天完成大滿貫！
        }
    } else {
        playerStats.losses++;
        dailySession.dailyLevelIndex = GameState.currentLevelIndex;
    }
    
    playerStats.totalGames = playerStats.wins + playerStats.losses;
    
    savePlayerStats(false);
    
    dailySession.midGameState = null;
    saveLocalDailySession(dateStr);
}

// 21. UI 更新
function updateUI() {
    const curLevel = LEVELS[GameState.currentLevelIndex];
    const totalCount = curLevel.tileCount;
    const remainingField = GameState.tiles.length;
    const inSlots = GameState.slots.length;
    const inOut = GameState.out3Storage.length;
    const totalRemaining = remainingField + inSlots + inOut;
    
    const tileRatioEl = document.getElementById('tile-ratio');
    if (tileRatioEl) tileRatioEl.innerText = `剩餘: ${totalRemaining} / ${totalCount}`;
    
    const slotCountEl = document.getElementById('slot-count-text');
    if (slotCountEl) slotCountEl.innerText = `${inSlots} / 7`;
    
    const infoTypesEl = document.getElementById('info-types');
    if (infoTypesEl) infoTypesEl.innerText = curLevel.typesCount;
    
    const infoLayersEl = document.getElementById('info-layers');
    if (infoLayersEl) infoLayersEl.innerText = curLevel.layers;
    
    const countUndoEl = document.getElementById('count-undo');
    if (countUndoEl) countUndoEl.innerText = GameState.skills.undo;
    
    const countOut3El = document.getElementById('count-out3');
    if (countOut3El) countOut3El.innerText = GameState.skills.out3;
    
    const countShuffleEl = document.getElementById('count-shuffle');
    if (countShuffleEl) countShuffleEl.innerText = GameState.skills.shuffle;
    
    const skillUndoBtn = document.getElementById('skill-undo');
    if (skillUndoBtn) skillUndoBtn.disabled = (GameState.skills.undo <= 0 || GameState.history.length === 0);
    
    const skillOut3Btn = document.getElementById('skill-out3');
    if (skillOut3Btn) skillOut3Btn.disabled = (GameState.skills.out3 <= 0 || GameState.slots.length < 3);
    
    const skillShuffleBtn = document.getElementById('skill-shuffle');
    if (skillShuffleBtn) skillShuffleBtn.disabled = (GameState.skills.shuffle <= 0 || GameState.tiles.length === 0);

    renderSlots();
    renderOut3Storage();
}

function renderSlots() {
    const container = document.getElementById('slots-container');
    if (!container) return;
    container.innerHTML = "";
    
    for (let i = 0; i < 7; i++) {
        const slotEl = document.createElement('div');
        
        if (i < GameState.slots.length) {
            const tile = GameState.slots[i];
            slotEl.className = "flex-1 max-w-[50px] aspect-[5/6] h-[58px] gem-box-slot-filled flex flex-col items-center justify-center flex-shrink-1 transition-all";
            const canvas = document.createElement('canvas');
            canvas.width = 44;
            canvas.height = 44;
            canvas.className = "w-full h-auto aspect-square pointer-events-none";
            slotEl.appendChild(canvas);
            drawCachedTile(canvas, tile.template.id);
        } else {
            slotEl.className = "flex-1 max-w-[50px] aspect-[5/6] h-[58px] gem-box-slot-empty flex-shrink-1";
        }
        
        container.appendChild(slotEl);
    }
}

function renderOut3Storage() {
    const section = document.getElementById('out3-storage');
    const container = document.getElementById('out3-container');
    const countText = document.getElementById('out3-count-text');
    if (!section || !container) return;
    
    if (GameState.out3Storage.length > 0) {
        section.classList.remove('hidden');
        section.classList.add('flex');
        if (countText) countText.innerText = `${GameState.out3Storage.length} / 3`;
        container.innerHTML = "";
        
        GameState.out3Storage.forEach(tile => {
            const el = document.createElement('div');
            el.className = "mini-tile bg-white cursor-pointer hover:border-pink-300 relative group shadow-sm";
            el.title = "點擊將晶石放回消除槽";
            const canvas = document.createElement('canvas');
            canvas.width = 44;
            canvas.height = 44;
            el.appendChild(canvas);
            
            el.addEventListener('click', async () => {
                if (GameState.slots.length >= 7) {
                    alert("晶石槽已滿，請先消除晶石空出位置喔！");
                    return;
                }
                Sound.playClick();
                
                // 記錄玩家將移出區卡牌點擊送回的動作
                GameState.movesLog.push({ a: 'out3_click', id: tile.id });
                
                GameState.out3Storage = GameState.out3Storage.filter(t => t.id !== tile.id);
                
                // 動態直接加入晶石槽末尾，不重排
                GameState.slots.push(tile);
                const rect = el.getBoundingClientRect();
                checkMatchThree(tile.typeId, rect.left + rect.width/2, rect.top + rect.height/2);
                updateUI();
                await saveCurrentGameSession(false);
                await checkGameStatus();
            });
            container.appendChild(el);
            drawCachedTile(canvas, tile.template.id);
        });
    } else {
        section.classList.add('hidden');
        section.classList.remove('flex');
    }
}

// 22. 歷史狀態記錄
function saveHistoryState() {
    const stateBackup = {
        tiles: GameState.tiles.map(t => ({ ...t })),
        slots: GameState.slots.map(t => ({ ...t })),
        out3Storage: GameState.out3Storage.map(t => ({ ...t }))
    };
    GameState.history.push(stateBackup);
    if (GameState.history.length > 5) {
        GameState.history.shift();
    }
}

// 23. 道具功能實現
async function useSkillUndo() {
    if (GameState.skills.undo <= 0 || GameState.history.length === 0) return;
    Sound.playClick();
    
    // 記錄道具復原步驟
    GameState.movesLog.push({ a: 'undo' });
    
    GameState.skills.undo--;
    const prevState = GameState.history.pop();
    GameState.tiles = prevState.tiles;
    GameState.slots = prevState.slots;
    GameState.out3Storage = prevState.out3Storage;
    renderField();
    updateUI();
    await saveCurrentGameSession(false);
}

async function useSkillOut3() {
    if (GameState.skills.out3 <= 0 || GameState.slots.length < 3) return;
    Sound.playClick();
    
    // 記錄道具移出步驟
    GameState.movesLog.push({ a: 'out3' });
    
    GameState.skills.out3--;
    const toMove = GameState.slots.splice(0, 3);
    GameState.out3Storage.push(...toMove);
    renderField();
    updateUI();
    await saveCurrentGameSession(false);
    await checkGameStatus();
}

async function useSkillShuffle() {
    if (GameState.skills.shuffle <= 0 || GameState.tiles.length === 0) return;
    Sound.playShuffle();
    
    // 記錄道具打亂步驟
    GameState.movesLog.push({ a: 'shuffle' });
    
    GameState.skills.shuffle--;
    const activeTemplates = GameState.tiles.map(t => ({
        typeId: t.typeId,
        template: t.template
    }));
    
    // 🔒 安全防護：使用與後端完全一致的確定性 PRNG 隨機生成，確保伺服器模擬洗牌時能完全複現！
    const prngFunc = GameState.prng || Math.random;
    for (let i = activeTemplates.length - 1; i > 0; i--) {
        const j = Math.floor(prngFunc() * (i + 1));
        [activeTemplates[i], activeTemplates[j]] = [activeTemplates[j], activeTemplates[i]];
    }
    GameState.tiles.forEach((tile, index) => {
        tile.typeId = activeTemplates[index].typeId;
        tile.template = activeTemplates[index].template;
    });
    const field = document.getElementById('stack-container');
    if (field) {
        field.classList.add('animate-shake');
        setTimeout(() => field.classList.remove('animate-shake'), 400);
    }
    renderField();
    updateUI();
    await saveCurrentGameSession(false);
}

// ==========================================
// 🏆 24. 排行榜系統 (Leaderboard System)
// ==========================================
async function loadLeaderboardData() {
    const container = document.getElementById('leaderboard-container');
    if (container) {
        container.innerHTML = `
            <div class="flex flex-col items-center justify-center py-8 text-gray-400 font-pixel text-[10px]">
                <span class="animate-spin text-xl mb-1">🔮</span>
                <span>正在共鳴聖域英雄榜...</span>
            </div>
        `;
    }

    const dateStr = getTodayString();
    const weekStr = getISOWeekString(dateStr);
    const monthStr = dateStr.substring(0, 7);

    let fetchedDaily = null;
    let fetchedWeekly = null;
    let fetchedMonthly = null;

    if (isFirebaseActive && currentUser && !currentUser.isAnonymous) {
        try {
            const dailyRes = await fetchWithAuth(`/api/leaderboard/daily/${dateStr}`);
            if (dailyRes && dailyRes.success) {
                fetchedDaily = dailyRes.leaderboard;
            }
        } catch (e) {
            console.warn("載入每日排行失敗，將使用本地模擬：", e.message);
        }

        try {
            const weeklyRes = await fetchWithAuth(`/api/leaderboard/weekly/${weekStr}`);
            if (weeklyRes && weeklyRes.success) {
                fetchedWeekly = weeklyRes.leaderboard;
            }
        } catch (e) {
            console.warn("載入每週排行失敗，將使用本地模擬：", e.message);
        }

        try {
            const monthlyRes = await fetchWithAuth(`/api/leaderboard/monthly/${monthStr}`);
            if (monthlyRes && monthlyRes.success) {
                fetchedMonthly = monthlyRes.leaderboard;
            }
        } catch (e) {
            console.warn("載入每月排行失敗：", e.message);
        }
    }

    // 🚀 頂級優化：排行榜若無伺服器真實數據，則直接呈現乾淨、真實的空狀態 []，不再顯示多餘的本地模擬模擬數據！
    leaderboardCache.daily = fetchedDaily || [];
    leaderboardCache.weekly = fetchedWeekly || [];
    leaderboardCache.monthly = fetchedMonthly || [];

    renderLeaderboard();
}

function renderLeaderboard() {
    const container = document.getElementById('leaderboard-container');
    if (!container) return;

    container.innerHTML = "";
    const list = leaderboardCache[currentLeaderboardType] || [];

    if (list.length === 0) {
        container.innerHTML = `
            <div class="flex flex-col items-center justify-center py-12 text-gray-400 text-xs">
                <span>🔮 聖殿裡目前空空如也 🔮</span>
                <span class="text-[10px] text-gray-400 mt-1">快去引導法陣，成為第一個留下共鳴烙印的冒險者吧！</span>
            </div>
        `;
        return;
    }

    list.forEach((player, index) => {
        const rank = index + 1;
        const isSelf = player.isSelf || (currentUser && player.uid === currentUser.uid);
        
        let rankBadge = `<span class="font-pixel text-[11px] font-black text-gray-400 w-5 text-center">${rank}</span>`;
        if (rank === 1) rankBadge = `<span class="text-lg w-5 text-center">🥇</span>`;
        else if (rank === 2) rankBadge = `<span class="text-lg w-5 text-center">🥈</span>`;
        else if (rank === 3) rankBadge = `<span class="text-lg w-5 text-center">🥉</span>`;

        const winRatePercent = player.totalGames > 0 ? Math.round(player.winRate * 100) : 0;

        let avatarSrc = "";
        const gemId = player.currentAvatarId;
        if (gemId !== undefined && gemId !== null && gemId !== -1 && gemId !== "undefined" && gemId !== "") {
            const gem = TILE_TEMPLATES.find(t => t.id === Number(gemId));
            if (gem) {
                avatarSrc = getPixelArtDataUrl(gem.id);
            }
        }
        if (!avatarSrc) {
            avatarSrc = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='128' height='128'></svg>";
        }

        const isShinyAvatar = player.isAvatarShiny || (isSelf && gemId !== -1 && shinyCodex.includes(Number(gemId)));

        const row = document.createElement('div');
        if (isShinyAvatar) {
            row.className = `flex items-center gap-3 p-2.5 rounded-xl border shiny-leaderboard-row transition-all text-sm cursor-help`;
            if (isSelf) row.className += " border-amber-400/70 shadow-md";
        } else {
            row.className = `flex items-center gap-3 p-2.5 rounded-xl border ${
                isSelf 
                    ? 'bg-pink-100/60 backdrop-blur-sm border-pink-200 shadow-sm' 
                    : 'bg-white/60 backdrop-blur-sm hover:bg-white/80 border-gray-100'
            } transition-all text-sm`;
        }

        const avatarClass = isShinyAvatar 
            ? "w-10 h-10 rounded-full border-2 border-amber-400 bg-amber-50 flex-shrink-0 shiny-avatar-glow shadow-[0_0_8px_rgba(251,191,36,0.6)]"
            : "w-10 h-10 rounded-full border border-gray-200 bg-gray-50 flex-shrink-0";

        const nameStyle = isShinyAvatar
            ? `font-black text-amber-700 truncate flex items-center gap-0.5`
            : `font-black text-gray-700 truncate ${isSelf ? 'text-pink-600 font-bold' : ''}`;

        const starPrefix = isShinyAvatar ? `<span class="text-amber-500 font-bold animate-pulse mr-0.5 select-none">✨</span>` : "";
        const shinyBadge = isShinyAvatar ? `<span class="text-[7.5px] bg-amber-400 text-white font-black px-1.5 py-0.5 rounded-full ml-1 scale-90 inline-block shadow-sm">閃耀</span>` : "";

        row.innerHTML = `
            ${rankBadge}
            <img class="${avatarClass}" src="${avatarSrc}" alt="Avatar">
            <div class="flex-1 min-w-0">
                <div class="${nameStyle}">${starPrefix}${player.playerName}${shinyBadge}</div>
                <div class="text-xs text-gray-400 font-semibold mt-0.5">勝率: ${winRatePercent}% | 總局數: ${player.totalGames || 0}</div>
            </div>
            <div class="text-right flex-shrink-0 font-pixel">
                <span class="text-[#ff8fa3] font-black text-base">${player.wins || 0}</span>
                <span class="text-[11px] text-gray-400 font-bold ml-0.5">勝</span>
            </div>
        `;

        container.appendChild(row);
    });
}

async function changeAvatar(gemId) {
    if (currentAvatarId === gemId) return;
    Sound.playClick();
    
    const gem = TILE_TEMPLATES.find(a => a.id === gemId);
    if (!gem) return;
    
    const confirmSet = confirm(`要將「${gem.name}」設定為您的個人頭像嗎？設定後將在全球排行榜中公開展示！🔮`);
    if (!confirmSet) return;
    
    try {
        const res = await fetchWithAuth('/api/set-avatar', {
            method: 'POST',
            body: JSON.stringify({ gemId })
        });
        
        if (res && res.success) {
            currentAvatarId = gemId;
            updateAvatarUI(currentAvatarId);
            renderCodex();
            
            // 🚀 超強體驗優化：即時更新排行榜快取中玩家自己的頭像，免刷新直接呈現！
            if (currentUser) {
                ['daily', 'weekly', 'monthly'].forEach(type => {
                    const list = leaderboardCache[type];
                    if (Array.isArray(list)) {
                        const selfEntry = list.find(p => p.uid === currentUser.uid);
                        if (selfEntry) {
                            selfEntry.currentAvatarId = gemId;
                        }
                    }
                });
                renderLeaderboard();
            }
            console.log(`👤 個人頭像已更新為: ${gem.name}`);
        }
    } catch (e) {
        console.error("更新頭像失敗:", e);
        alert("更新頭像失敗：" + e.message);
    }
}

function getEmojiSvgDataUrl(emoji) {
    // 🚀 UX & 視覺優化：採用精確的 text-anchor 居中對齊，並將字級擴大至 82px，
    // 同時使用 system-ui 字型家族，確保在 Safari, Chrome 都能渲染出超大、高清、完美的向量圓形萌寵頭像！
    const svgString = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100"><rect width="100" height="100" rx="50" fill="#fff5f7"/><text x="50" y="80" text-anchor="middle" font-size="82" font-family="system-ui, -apple-system, sans-serif">${emoji}</text></svg>`;
    const base64 = btoa(unescape(encodeURIComponent(svgString)));
    return `data:image/svg+xml;base64,${base64}`;
}

function getPixelArtDataUrl(gemId) {
    const gem = TILE_TEMPLATES.find(t => t.id === Number(gemId));
    if (!gem) {
        return "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='128' height='128'></svg>";
    }
    
    const mainCanvas = document.createElement('canvas');
    mainCanvas.width = 128;
    mainCanvas.height = 128;
    const ctx = mainCanvas.getContext('2d');
    
    ctx.save();
    
    // 建立一個粉色圓形底盤
    ctx.fillStyle = '#fff5f7';
    ctx.beginPath();
    ctx.arc(64, 64, 64, 0, Math.PI * 2);
    ctx.fill();
    ctx.clip(); // 採用剪裁路徑，確保超大縮放的圖片不溢出圓盤
    
    const imgId = gem.id + 1;
    const gemImg = gemImages[imgId];
    if (gemImg && gemImg.complete) {
        const destSize = 108; // 增加基礎尺寸（原為 96），使圖片佔比更大
        const imgW = gemImg.naturalWidth || gemImg.width;
        const imgH = gemImg.naturalHeight || gemImg.height;
        const ratio = imgW / imgH;
        
        let dWidth = destSize;
        let dHeight = destSize;
        
        if (ratio > 1) {
            dHeight = destSize / ratio;
        } else {
            dWidth = destSize * ratio;
        }
        
        const zoom = 1.45; // 提高縮放比例（原為 1.25），去除多餘空白
        const zWidth = dWidth * zoom;
        const zHeight = dHeight * zoom;
        
        const dx = 10 + (destSize - zWidth) / 2; // 10 為 (128 - 108) / 2
        const dy = 10 + (destSize - zHeight) / 2;
        
        ctx.drawImage(gemImg, dx, dy, zWidth, zHeight);
    }
    
    ctx.restore();
    
    return mainCanvas.toDataURL('image/png');
}

function getPixelArtDataUrlFromEmoji(emoji) {
    const gem = TILE_TEMPLATES.find(t => t.emoji === emoji || t.name === emoji);
    if (gem) {
        return getPixelArtDataUrl(gem.id);
    }
    return getEmojiSvgDataUrl(emoji);
}

function updateAvatarUI(gemId) {
    const avatarEl = document.getElementById('user-avatar');
    if (!avatarEl) return;
    
    if (gemId === undefined || gemId === null || gemId === -1 || gemId === "undefined" || gemId === "") {
        avatarEl.src = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='128' height='128'></svg>";
        return;
    }
    
    const gem = TILE_TEMPLATES.find(t => t.id === Number(gemId));
    if (gem) {
        avatarEl.src = getPixelArtDataUrl(gem.id);
        
        // 💫 檢查該頭像是否為解鎖的 閃耀 (isShiny) 版本！
        const nameEl = document.getElementById('user-name');
        const isShiny = shinyCodex.includes(gem.id);
        if (isShiny) {
            // 閃耀頭像樣式
            avatarEl.className = "w-11 h-11 rounded-full border-2 border-amber-400 bg-amber-50 flex-shrink-0 shiny-avatar-glow shadow-[0_0_10px_rgba(251,191,36,0.65)]";
            if (nameEl) {
                const baseName = currentUser ? (currentUser.isAnonymous ? "匿名冒險者" : (currentUser.displayName || "冒險者")) : "冒險者";
                nameEl.innerHTML = `<span class="text-amber-500 font-bold select-none mr-0.5 animate-pulse">✨</span>${baseName} <span class="text-[8px] bg-amber-400 text-white font-black px-1.5 py-0.5 rounded-full ml-1 scale-90 inline-block shadow-sm">閃耀</span>`;
                nameEl.className = "text-sm font-black text-amber-600 truncate max-w-[130px] flex items-center";
            }
        } else {
            // 一般頭像樣式
            avatarEl.className = "w-11 h-11 rounded-full border-2 border-pink-300 bg-pink-100 flex-shrink-0";
            if (nameEl) {
                const baseName = currentUser ? (currentUser.isAnonymous ? "匿名冒險者" : (currentUser.displayName || "冒險者")) : "冒險者";
                nameEl.innerHTML = baseName;
                nameEl.className = "text-sm font-black text-gray-700 truncate max-w-[130px]";
            }
        }
    } else {
        avatarEl.src = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='128' height='128'></svg>";
    }
}

async function checkPendingRewards() {
    const unclaimed = pendingRewards.find(r => !r.claimed);
    if (!unclaimed) return;
    
    const gemIdToClaim = (unclaimed.gemId !== undefined) ? unclaimed.gemId : unclaimed.animalId;
    const gem = TILE_TEMPLATES.find(a => a.id === gemIdToClaim);
    if (!gem) return;
    
    // 播放慶祝音效
    Sound.playWin();
    
    // 產生動態彈出禮物盒
    const overlay = document.createElement('div');
    overlay.className = "fixed inset-0 bg-black/70 backdrop-blur-md z-[200] flex items-center justify-center p-4 animate-fade-in";
    
    const shinyText = unclaimed.isShiny ? "✨ 【閃耀限定】 ✨<br>" : "";
    const titleText = unclaimed.type === "weekly" ? "🏆 每週排行榜結算獎勵 🏆" : "🏅 每月排行榜結算獎勵 🏅";
    
    overlay.innerHTML = `
        <div class="bg-white p-8 rounded-3xl border-4 border-pink-300 max-w-sm w-full text-center relative shadow-2xl animate-fade-in flex flex-col items-center">
            <span class="text-6xl mb-4 animate-bounce">🎁</span>
            <h2 class="text-lg font-black text-pink-500 font-pixel mb-1">${titleText}</h2>
            <p class="text-xs text-gray-500 font-bold mb-4">恭喜您榮獲第 ${unclaimed.rank} 名！系統特別為您派發專屬獎勵！</p>
            
            <div class="w-24 h-24 rounded-2xl border-4 ${unclaimed.isShiny ? 'shiny-border' : 'border-pink-100'} bg-pink-50/50 flex items-center justify-center mb-4 shadow-inner relative">
                <img src="${getPixelArtDataUrl(gem.id)}" class="w-16 h-16 object-contain pointer-events-none select-none">
                ${unclaimed.isShiny ? '<span class="absolute -top-2 -right-2 bg-amber-400 text-white text-[8px] px-1.5 py-0.5 rounded-full font-black shadow border border-white">★閃耀</span>' : ''}
            </div>
            
            <h3 class="text-base font-black text-gray-700 font-sans mb-1">${shinyText}${gem.name}</h3>
            <p class="text-[10px] text-gray-400 font-medium leading-relaxed mb-6">${gem.desc}</p>
            
            <button id="btn-claim-reward" class="w-full py-2.5 bg-pink-400 hover:bg-pink-300 text-white font-black text-xs border-b-4 border-pink-600 active:border-b-0 active:mt-1 rounded-xl transition-all font-pixel shadow-md cursor-pointer">
                開心放入圖鑑 🔮
            </button>
        </div>
    `;
    
    document.body.appendChild(overlay);
    
    // 在湖中央噴灑大量愛心與粒子
    Particles.spawn(window.innerWidth / 2, window.innerHeight / 2, ['#ffb5a7', '#ffd166', '#ff4d6d'], 30);
    
    document.getElementById('btn-claim-reward').addEventListener('click', async () => {
        Sound.playClick();
        try {
            const res = await fetchWithAuth('/api/claim-reward', {
                method: 'POST',
                body: JSON.stringify({ rewardId: unclaimed.rewardId })
            });
            
            if (res && res.success) {
                // 更新本機狀態
                unclaimed.claimed = true;
                if (!unlockedCodex.includes(gemIdToClaim)) {
                    unlockedCodex.push(gemIdToClaim);
                }
                if (unclaimed.isShiny && !shinyCodex.includes(gemIdToClaim)) {
                    shinyCodex.push(gemIdToClaim);
                }
                
                // 移除 overlay
                overlay.remove();
                
                // 重新渲染
                renderCodex();
                
                // 遞迴檢查下一項未領取獎勵
                checkPendingRewards();
            }
        } catch (e) {
            console.error("Claim reward failed:", e);
            alert("領取獎勵失敗：" + e.message);
        }
    });
}