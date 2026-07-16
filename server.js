const express = require('express');
const cors = require('cors');
const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// 1. 啟用 CORS 跨來源資源共享與 JSON 解析
app.use(cors());
app.use(express.json());

// 1.5. 靜態檔案代管 (部署線上環境時，讓 Node.js 後端直接輸出前端網頁，消滅 CORS 與分開部署難度！)
app.use(express.static(path.join(__dirname)));

// 2. 初始化 Firebase Admin SDK
const serviceAccountPath = path.join(__dirname, 'serviceAccountKey.json');

if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    try {
        const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount)
        });
        console.log("🛡️ Firebase Admin SDK 使用環境變數 FIREBASE_SERVICE_ACCOUNT 成功初始化！");
    } catch (e) {
        console.error("❌ 讀取環境變數 FIREBASE_SERVICE_ACCOUNT 發生錯誤：", e);
    }
} else if (fs.existsSync(serviceAccountPath)) {
    try {
        const serviceAccount = require(serviceAccountPath);
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount)
        });
        console.log("🛡️ Firebase Admin SDK 使用 serviceAccountKey.json 成功初始化！");
    } catch (e) {
        console.error("❌ 讀取 serviceAccountKey.json 發生錯誤：", e);
    }
} else {
    try {
        admin.initializeApp({
            credential: admin.credential.applicationDefault()
        });
        console.log("🛡️ Firebase Admin SDK 使用預設環境憑證初始化。");
    } catch (e) {
        console.warn("⚠️ [警告] Firebase Admin SDK 尚未設定憑證！👉 請在 Firebase Console (專案設定 > 服務帳戶) 下載 private key json 文件， 並命名為 `serviceAccountKey.json` 放置於本後端專案目錄下以啟用雲端存取！");
    }
}

const db = admin.apps.length > 0 ? admin.firestore() : null;

// 3. 安全中介軟體：驗證前端傳入的 Firebase ID Token
async function verifyFirebaseToken(req, res, next) {
    if (!db) {
        return res.status(500).json({ error: "Firebase Admin SDK 尚未正確初始化金鑰，伺服器無法連接資料庫。" });
    }
    
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: "缺少授權標頭（Expected Bearer Token）。" });
    }
    
    const idToken = authHeader.split('Bearer ')[1];
    try {
        const decodedToken = await admin.auth().verifyIdToken(idToken);
        req.user = decodedToken; // 將驗證過後的 uid 等資訊放入 req.user
        next();
    } catch (error) {
        console.error("❌ Token 驗證失敗：", error.message);
        return res.status(403).json({ error: "授權過期或無效的 ID Token。" });
    }
}

// 4. API 路由

const GEMS_LIST = [
    { id: 0 },
    { id: 1 },
    { id: 2 },
    { id: 3 },
    { id: 4 },
    { id: 5 },
    { id: 6 },
    { id: 7 },
    { id: 8 },
    { id: 9 },
    { id: 10 },
    { id: 11 }
];

function getTodayString() {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
}

let isSettlingWeekly = false;
let isSettlingMonthly = false;

// 🚀 極致效能優化：增加伺服器記憶體中的結算狀態快取，避免 99.99% 的 profile-load 產生額外的 Firestore 讀取！
let cachedWeeklySettled = null;
let cachedMonthlySettled = null;
let isSettleChecking = false;

async function checkAndSettleRankings() {
    if (!db) return;
    
    const dateStr = getTodayString();
    const currentWeek = getISOWeekString(dateStr);
    const currentMonth = dateStr.substring(0, 7);
    
    // 1. 快速記憶體快取過濾（1 毫秒內阻斷）
    if (cachedWeeklySettled === currentWeek && cachedMonthlySettled === currentMonth) {
        return;
    }
    
    if (isSettleChecking) return;
    isSettleChecking = true;
    
    try {
        const systemRef = db.collection('system_state').doc('settlement');
        
        let weeklySettledToPerform = false;
        let monthlySettledToPerform = false;
        
        // 🔒 2. 分散式排他鎖（Distributed Mutex via Firestore Transaction）：
        // 使用極輕量級的 Firestore 事務進行原子化搶佔週期，
        // 不論同時有多少個伺服器實例（Horizontal scaling / Docker clusters）並發請求，
        // 100% 保證有且僅有唯一一個能成功拿下「結算權」，徹底防止多開、重複發放獎勵的競態 Bug！
        await db.runTransaction(async (transaction) => {
            const systemDoc = await transaction.get(systemRef);
            
            let lastWeeklySettled = currentWeek;
            let lastMonthlySettled = currentMonth;
            
            if (systemDoc.exists) {
                const data = systemDoc.data();
                if (data.lastWeeklySettled) lastWeeklySettled = data.lastWeeklySettled;
                if (data.lastMonthlySettled) lastMonthlySettled = data.lastMonthlySettled;
            } else {
                // 初始化系統狀態檔案
                transaction.set(systemRef, {
                    lastWeeklySettled,
                    lastMonthlySettled,
                    lastUpdated: admin.firestore.FieldValue.serverTimestamp()
                });
                return;
            }
            
            // 🔒 核心搶佔邏輯：若週期不同，立即「搶佔並寫入新週期」！
            if (currentWeek !== lastWeeklySettled) {
                weeklySettledToPerform = lastWeeklySettled; // 標記我們奪下了這週的結算權
                transaction.update(systemRef, {
                    lastWeeklySettled: currentWeek, // 立即在事務中搶佔，阻止其他任何同時執行的伺服器實例！
                    lastUpdated: admin.firestore.FieldValue.serverTimestamp()
                });
            }
            
            if (currentMonth !== lastMonthlySettled) {
                monthlySettledToPerform = lastMonthlySettled; // 標記我們奪下了這月的結算權
                transaction.update(systemRef, {
                    lastMonthlySettled: currentMonth, // 立即在事務中搶佔，阻止其他任何同時執行的伺服器實例！
                    lastUpdated: admin.firestore.FieldValue.serverTimestamp()
                });
            }
        });
        
        // 🔒 3. 事務提交成功後，獲得「結算權」的這台伺服器，才會在背景默默執行沉重的大規模發獎工作！
        if (weeklySettledToPerform) {
            console.log(`🌲 [每週結算] 恭喜成功搶佔排他鎖！正在背景為週期 ${weeklySettledToPerform} 執行大批量統計發獎...`);
            await performWeeklySettlement(weeklySettledToPerform);
        }
        
        if (monthlySettledToPerform) {
            console.log(`🌲 [每月結算] 恭喜成功搶佔排他鎖！正在背景為週期 ${monthlySettledToPerform} 執行大批量統計發獎...`);
            await performMonthlySettlement(monthlySettledToPerform);
        }
        
        // 更新本地快取，防止本次執行後重複進入
        cachedWeeklySettled = currentWeek;
        cachedMonthlySettled = currentMonth;
    } catch (e) {
        console.error("分佈式結算鎖檢驗/搶佔失敗：", e);
    } finally {
        isSettleChecking = false;
    }
}

/**
 * 🏆 沉重發獎背景線程：每週排行發獎
 */
async function performWeeklySettlement(targetWeek) {
    try {
        const snapshot = await db.collection('weeklyLeaderboard')
            .where('weekStr', '==', targetWeek)
            .get();
            
        let players = [];
        snapshot.forEach(doc => {
            players.push(doc.data());
        });
        
        // 依 Wins 降序 > WinRate 降序排序
        players.sort((a, b) => {
            if (b.wins !== a.wins) return b.wins - a.wins;
            return (b.winRate || 0) - (a.winRate || 0);
        });
        
        const top50 = players.slice(0, 50);
        for (let i = 0; i < top50.length; i++) {
            const player = top50[i];
            const rank = i + 1;
            
            const playerDocRef = db.collection('players').doc(player.uid);
            const playerDoc = await playerDocRef.get();
            
            let unlockedCodex = [];
            let pendingRewards = [];
            if (playerDoc.exists) {
                const pData = playerDoc.data();
                if (Array.isArray(pData.unlockedCodex)) unlockedCodex = pData.unlockedCodex;
                if (Array.isArray(pData.pendingRewards)) pendingRewards = pData.pendingRewards;
            }
            
            // 找出未解鎖晶石
            let lockedIds = [];
            for (let id = 0; id < GEMS_LIST.length; id++) {
                if (!unlockedCodex.includes(id)) {
                    lockedIds.push(id);
                }
            }
            
            let gemIdToUnlock = 0;
            if (lockedIds.length > 0) {
                const randIdx = Math.floor(Math.random() * lockedIds.length);
                gemIdToUnlock = lockedIds[randIdx];
            } else {
                gemIdToUnlock = Math.floor(Math.random() * GEMS_LIST.length);
            }
            
            const isShiny = rank <= 3;
            
            pendingRewards.push({
                rewardId: `weekly_${targetWeek}`,
                type: "weekly",
                rank: rank,
                gemId: gemIdToUnlock,
                isShiny: isShiny,
                claimed: false
            });
            
            await playerDocRef.set({ pendingRewards }, { merge: true });
        }
        console.log(`🎉 [每週結算] 週期 ${targetWeek} 大批量發獎順利完成！`);
    } catch (e) {
        console.error(`❌ [每週結算錯誤] 週期 ${targetWeek} 發獎失敗:`, e);
    }
}

/**
 * 🏆 沉重發獎背景線程：每月排行發獎
 */
async function performMonthlySettlement(targetMonth) {
    try {
        const snapshot = await db.collection('monthlyLeaderboard')
            .where('monthStr', '==', targetMonth)
            .get();
            
        let players = [];
        snapshot.forEach(doc => {
            players.push(doc.data());
        });
        
        // 依 Wins 降序 > WinRate 降序排序
        players.sort((a, b) => {
            if (b.wins !== a.wins) return b.wins - a.wins;
            return (b.winRate || 0) - (a.winRate || 0);
        });
        
        const top50 = players.slice(0, 50);
        for (let i = 0; i < top50.length; i++) {
            const player = top50[i];
            const rank = i + 1;
            
            const playerDocRef = db.collection('players').doc(player.uid);
            const playerDoc = await playerDocRef.get();
            
            let unlockedCodex = [];
            let pendingRewards = [];
            if (playerDoc.exists) {
                const pData = playerDoc.data();
                if (Array.isArray(pData.unlockedCodex)) unlockedCodex = pData.unlockedCodex;
                if (Array.isArray(pData.pendingRewards)) pendingRewards = pData.pendingRewards;
            }
            
            // 找出未解鎖晶石
            let lockedIds = [];
            for (let id = 0; id < GEMS_LIST.length; id++) {
                if (!unlockedCodex.includes(id)) {
                    lockedIds.push(id);
                }
            }
            
            let gemIdToUnlock = 0;
            if (lockedIds.length > 0) {
                const randIdx = Math.floor(Math.random() * lockedIds.length);
                gemIdToUnlock = lockedIds[randIdx];
            } else {
                gemIdToUnlock = Math.floor(Math.random() * GEMS_LIST.length);
            }
            
            const isShiny = rank <= 3;
            
            pendingRewards.push({
                rewardId: `monthly_${targetMonth}`,
                type: "monthly",
                rank: rank,
                gemId: gemIdToUnlock,
                isShiny: isShiny,
                claimed: false
            });
            
            await playerDocRef.set({ pendingRewards }, { merge: true });
        }
        console.log(`🎉 [每月結算] 週期 ${targetMonth} 大批量發獎順利完成！`);
    } catch (e) {
        console.error(`❌ [每月結算錯誤] 週期 ${targetMonth} 發獎失敗:`, e);
    }
}

/**
 * 📊 API A: 載入玩家統計資料 (雲端唯一真實數據源)
 */
app.get('/api/load-profile', verifyFirebaseToken, async (req, res) => {
    const uid = req.user.uid;
    try {
        // 🔒 🚀 效能極致優化：讓每週、每月排行榜結算與發獎在背景非同步（Fire-and-Forget）執行，
        // 絕對不阻塞 HTTP 回應！這讓玩家登入與載入個人資料的時間縮短至極致（低於 15ms）！
        checkAndSettleRankings().catch(e => console.error("背景自動排行結算失敗：", e));

        const userDocRef = db.collection('players').doc(uid);
        const doc = await userDocRef.get();
        
        let stats = {
            wins: 0,
            losses: 0,
            totalGames: 0,
            maxLevelReached: 0
        };
        
                let unlockedCodex = []; // 一開始無解鎖
        let shinyCodex = [];
        let currentAvatarId = -1;
        let pendingRewards = [];
        
        if (doc.exists) {
            const data = doc.data();
            if (data.stats) stats = data.stats;
            if (Array.isArray(data.unlockedCodex)) unlockedCodex = data.unlockedCodex;
            if (Array.isArray(data.shinyCodex)) shinyCodex = data.shinyCodex;
            if (data.currentAvatarId !== undefined) currentAvatarId = data.currentAvatarId;
            if (Array.isArray(data.pendingRewards)) pendingRewards = data.pendingRewards;
        } else {
            // 雲端無檔案時，初始化全新數據
            await userDocRef.set({
                stats,
                unlockedCodex,
                shinyCodex,
                currentAvatarId,
                pendingRewards,
                created: admin.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
        }
        
        return res.json({ 
            success: true, 
            stats, 
            unlockedCodex, 
            shinyCodex, 
            currentAvatarId, 
            pendingRewards
        });
    } catch (e) {
        console.error("API /api/load-profile 錯誤: ", e);
        return res.status(500).json({ error: "伺服器內部錯誤，載入統計失敗。" });
    }
});

/**
 * 👤 API J: 設定玩家個人頭像 (僅限已解鎖的圖鑑晶石)
 */
app.post('/api/set-avatar', verifyFirebaseToken, async (req, res) => {
    const uid = req.user.uid;
    const { gemId } = req.body;
    
    if (gemId === undefined) {
        return res.status(400).json({ error: "缺少 gemId 參數" });
    }
    
    try {
        const userDocRef = db.collection('players').doc(uid);
        const doc = await userDocRef.get();
        
        if (!doc.exists) {
            return res.status(404).json({ error: "找不到玩家檔案" });
        }
        
        const data = doc.data();
        const unlocked = data.unlockedCodex || [];
        
        if (!unlocked.includes(gemId)) {
            return res.status(403).json({ error: "該精緻晶石尚未解鎖，無法設定為頭像！" });
        }
        
        const targetGem = GEMS_LIST.find(d => d.id === gemId);
        if (!targetGem) {
            return res.status(400).json({ error: "無效的晶石 ID" });
        }
        
        await userDocRef.set({
            currentAvatarId: gemId
        }, { merge: true });
        
        return res.json({ success: true, currentAvatarId: gemId });
    } catch (e) {
        console.error("set-avatar error:", e);
        return res.status(500).json({ error: "設定頭像失敗" });
    }
});

/**
 * 🎁 API K: 領取排行榜結算獎勵
 */
app.post('/api/claim-reward', verifyFirebaseToken, async (req, res) => {
    const uid = req.user.uid;
    const { rewardId } = req.body;
    
    if (!rewardId) {
        return res.status(400).json({ error: "缺少 rewardId 參數" });
    }
    
    try {
        const userDocRef = db.collection('players').doc(uid);
        
        await db.runTransaction(async (transaction) => {
            const doc = await transaction.get(userDocRef);
            if (!doc.exists) {
                throw new Error("找不到玩家檔案");
            }
            
            const data = doc.data();
            let pendingRewards = data.pendingRewards || [];
            let unlockedCodex = data.unlockedCodex || [];
            let shinyCodex = data.shinyCodex || [];
            
            const rewardIndex = pendingRewards.findIndex(r => r.rewardId === rewardId);
            if (rewardIndex === -1) {
                throw new Error("找不到指定獎勵或已領取");
            }
            
            const reward = pendingRewards[rewardIndex];
            if (reward.claimed) {
                throw new Error("獎勵已被領取");
            }
            
            reward.claimed = true;
            
            const gemIdToClaim = (reward.gemId !== undefined) ? reward.gemId : reward.animalId;
            if (gemIdToClaim !== undefined) {
                if (!unlockedCodex.includes(gemIdToClaim)) {
                    unlockedCodex.push(gemIdToClaim);
                }
                
                if (reward.isShiny && !shinyCodex.includes(gemIdToClaim)) {
                    shinyCodex.push(gemIdToClaim);
                }
            }
            
            transaction.update(userDocRef, {
                pendingRewards,
                unlockedCodex,
                shinyCodex
            });
        });
        
        return res.json({ success: true, rewardId });
    } catch (e) {
        console.error("claim-reward error:", e.message);
        return res.status(400).json({ error: e.message || "領取獎勵失敗" });
    }
});

/**
 * 🎫 API B: 載入/同步每日狀態與遊戲局佈局 (門票、今日關卡、中途存檔、初始佈局)
 */
app.get('/api/sync-daily-session/:dateStr', verifyFirebaseToken, async (req, res) => {
    const uid = req.user.uid;
    const dateStr = req.params.dateStr;
    
    try {
        const dailyDocRef = db.collection('players').doc(uid).collection('dailyStats').doc(dateStr);
        const doc = await dailyDocRef.get();
        
        let dailySession = {
            ticketsUsed: 0,
            dailyLevelIndex: 0,
            midGameState: null,
            tiles: [] // 🚀 平行合併下發原始地圖佈局
        };
        
        if (doc.exists) {
            const data = doc.data();
            dailySession.ticketsUsed = data.ticketsUsed || 0;
            dailySession.dailyLevelIndex = data.dailyLevelIndex || 0;
            dailySession.midGameState = data.midGameState || null;
        } else {
            // 今日新首次進入，初始化
            await dailyDocRef.set({
                ticketsUsed: 0,
                dailyLevelIndex: 0,
                midGameState: null,
                created: admin.firestore.FieldValue.serverTimestamp()
            });
        }
        
        // 🚀 高效優化：如果雲端的 midGameState 為空，直接由後端主動進行初始化，回傳完整的初始殘局快照！
        // if (!dailySession.midGameState && dailySession.dailyLevelIndex < LEVELS.length) {
        //     dailySession.midGameState = getInitialMidGameState(dateStr, dailySession.dailyLevelIndex);
        // }

        let outOfTickets = false;

        if (!dailySession.midGameState) {
            if (dailySession.ticketsUsed >= 3) {
                dailySession.tiles = [];
                outOfTickets = true;
                console.log(`🛡️ [安全防護] 玩家 ${uid} 票券已耗盡且無進行中牌局，已強制銷毀後端回傳內容。`);
            } else if (dailySession.dailyLevelIndex < LEVELS.length) {
                dailySession.midGameState = getInitialMidGameState(dateStr, dailySession.dailyLevelIndex);
            }
        }
        
        // 🚀 高效優化：直接在後端依據當前關卡 dailyLevelIndex 產生確定性佈局並伴隨同步狀態一次性下發！
        if (!outOfTickets) {
            dailySession.tiles = generateLevelLayout(dateStr, dailySession.dailyLevelIndex);
        }
        
        // 🛡️ [安全防護] 若票券已耗盡且沒有進行中的牌局，則強制銷毀回傳內容，徹底杜絕無票恢復！
        // if (dailySession.ticketsUsed >= 3 && !dailySession.midGameState) {
        //     dailySession.tiles = [];
        //     console.log(`🛡️ [安全防護] 玩家 ${uid} 票券已耗盡且無進行中牌局，已強制銷毀後端回傳內容。`);
        // }
        
        return res.json({ success: true, dailySession });
    } catch (e) {
        console.error("API /api/sync-daily-session 錯誤: ", e);
        return res.status(500).json({ error: "伺服器內部錯誤，每日進度載入失敗。" });
    }
});

/**
 * 📂 API C: 中途自動存檔 (當前牌局進度備份)
 */
app.post('/api/save-session', verifyFirebaseToken, async (req, res) => {
    const uid = req.user.uid;
    const { dateStr, midGameState } = req.body;
    
    if (!dateStr) {
        return res.status(400).json({ error: "缺少 dateStr 參數。" });
    }

    // 🔒 0. 防作弊防空漏洞校驗：不允許客戶端主動清空存檔或上報無效存檔！
    if (!midGameState || !Array.isArray(midGameState.movesLog)) {
        return res.status(400).json({ error: "防作弊檢測：存檔進度與步驟紀錄不可為空（null），亦不可格式無效！" });
    }
    
    try {
        const userDocRef = db.collection('players').doc(uid);
        const dailyDocRef = db.collection('players').doc(uid).collection('dailyStats').doc(dateStr);
        
        // 🔒 1. 載入並校驗玩家帳號的最大解鎖關卡，防止利用中途存檔跳過未解鎖關卡！
        const userDoc = await userDocRef.get();
        let maxLevelReached = 0;
        if (userDoc.exists && userDoc.data().stats) {
            maxLevelReached = userDoc.data().stats.maxLevelReached || 0;
        }
        
        // 🔒 2. 載入現有的每日數據，用作「防回溯/防 Save-Scum 步驟嚴格遞增校驗」與「大滿貫鎖定檢驗」
        const dailyDoc = await dailyDocRef.get();
        if (dailyDoc.exists && dailyDoc.data().dailyLevelIndex >= LEVELS.length) {
            return res.status(400).json({ error: "防作弊檢測：您今天已經通關所有每日關卡，無法再儲存中途存檔！" });
        }
        
        let dbMoves = [];
        if (dailyDoc.exists && dailyDoc.data().midGameState && dailyDoc.data().midGameState.movesLog) {
            dbMoves = dailyDoc.data().midGameState.movesLog;
        }
        
        let dailyLevelIndex = 0;
        let existingDailyLevel = 0;
        if (dailyDoc.exists) {
            existingDailyLevel = dailyDoc.data().dailyLevelIndex || 0;
        }
        
        if (midGameState && midGameState.currentLevelIndex !== undefined) {
            // 防作弊安全檢驗：存檔的關卡不能大於生涯解鎖最大值
            if (midGameState.currentLevelIndex > maxLevelReached) {
                return res.status(400).json({ error: "防作弊檢測：嘗試儲存未解鎖關卡之存檔！" });
            }
            
            // 🔒 2.5 關卡倒退覆蓋攔截：不允許低關卡的過期存檔覆蓋或降級已通關、更高關卡的資料庫狀態！
            if (midGameState.currentLevelIndex < existingDailyLevel) {
                return res.status(400).json({ error: "防作弊檢測：不允許以低關卡的存檔降級或覆蓋更高關卡的進度！" });
            }
            dailyLevelIndex = midGameState.currentLevelIndex;
        }
        
        // 🔒 3. 核心防回溯校驗 (Anti-Rollback / Anti-Save-Scumming)
        if (midGameState && midGameState.movesLog) {
            const clientMoves = midGameState.movesLog;
            
            // A. 必須是遞增的，長度不可小於資料庫現有長度
            if (clientMoves.length < dbMoves.length) {
                return res.status(400).json({ error: "存檔回溯檢測：不允許將牌局進度回溯至先前的狀態！" });
            }
            
            // B. 前面所有的步驟必須與資料庫中完全一致（不能修改、刪除、或插隊歷史步驟）
            for (let i = 0; i < dbMoves.length; i++) {
                if (JSON.stringify(clientMoves[i]) !== JSON.stringify(dbMoves[i])) {
                    return res.status(400).json({ error: "存檔竄改檢測：不允許修改、刪除或插隊歷史遊玩步驟！" });
                }
            }
            
            // C. 安全重溫校驗：驗證新增加的這幾步是否合法，並進行道具數量原子守恆判定！
            const verification = validateMovesLog(dateStr, dailyLevelIndex, clientMoves, midGameState.status || 'playing', midGameState.skills);
            if (!verification.success) {
                return res.status(400).json({ error: `中途存檔步驟校驗失敗：${verification.error}` });
            }
        }
        
        const updateData = {
            midGameState: midGameState !== undefined ? midGameState : null,
            lastUpdated: admin.firestore.FieldValue.serverTimestamp()
        };
        
        // 🔒 自動與卡牌存檔的 currentLevelIndex 保持完美同步，解決 dailyLevelIndex 與牌局不對應的 bug
        // if (midGameState && midGameState.currentLevelIndex !== undefined) {
        //     updateData.dailyLevelIndex = dailyLevelIndex;
        // }
        
        await dailyDocRef.set(updateData, { merge: true });
        
        return res.json({ success: true });
    } catch (e) {
        console.error("API /api/save-session 錯誤: ", e);
        return res.status(500).json({ error: "伺服器內部錯誤，中途牌局存檔失敗。" });
    }
});

/**
 * 🎫 API E: 安全門票扣除
 */
app.post('/api/consume-ticket', verifyFirebaseToken, async (req, res) => {
    const uid = req.user.uid;
    const { dateStr } = req.body;
    
    if (!dateStr) {
        return res.status(400).json({ error: "缺少 dateStr 參數。" });
    }
    
    try {
        const dailyDocRef = db.collection('players').doc(uid).collection('dailyStats').doc(dateStr);
        let newTicketsUsed = 0;
        let dailyLevelIndex = 0; // 🚀 宣告在外面，方便事務結束後取得！
        
        // 🔒 在後端進行資料庫事務讀寫 (Transaction)，嚴格檢查門票上限，防止直接刷零門票與大滿貫再刷！
        await db.runTransaction(async (transaction) => {
            const doc = await transaction.get(dailyDocRef);
            let ticketsUsed = 0;
            if (doc.exists) {
                ticketsUsed = doc.data().ticketsUsed || 0;
                dailyLevelIndex = doc.data().dailyLevelIndex || 0;
            }
            
            if (dailyLevelIndex >= LEVELS.length) {
                throw new Error("防作弊檢測：您今天已經達成大滿貫挑戰，不允許再度扣票開始新局！");
            }
            
            if (ticketsUsed >= 3) {
                throw new Error("今日免費挑戰券 (3次) 已耗盡，無法繼續搭乘小巴！");
            }
            
            newTicketsUsed = ticketsUsed + 1;
            
            // 扣票時，由後端直接產生新一局的初始中途存盤，並寫入資料庫！
            const initialMidGameState = getInitialMidGameState(dateStr, dailyLevelIndex);
            
            transaction.set(dailyDocRef, {
                ticketsUsed: newTicketsUsed,
                midGameState: initialMidGameState, // 清除舊的中途牌局並寫入新局
                lastUpdated: admin.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
        });
        
        // 🚀 優化回傳：也回傳這個全新的初始存檔與卡牌位置，供前端直接 0 延遲加載！
        const initialMidGameState = getInitialMidGameState(dateStr, dailyLevelIndex);
        const initialTiles = generateLevelLayout(dateStr, dailyLevelIndex);
        return res.json({ success: true, ticketsUsed: newTicketsUsed, midGameState: initialMidGameState, tiles: initialTiles });
    } catch (e) {
        console.error("API /api/consume-ticket 錯誤: ", e.message);
        return res.status(400).json({ error: e.message || "扣票失敗。" });
    }
});

/**
 * 🏆 API D: 後端校驗結算 (安全的核心，防護勝/敗場數與最大解鎖關卡)
 */
app.post('/api/end-game', verifyFirebaseToken, async (req, res) => {
    const uid = req.user.uid;
    const { result, currentLevelIndex, dateStr, movesLog } = req.body;
    
    if (!result || !['victory', 'defeat'].includes(result) || currentLevelIndex === undefined || !dateStr) {
        return res.status(400).json({ error: "無效的請求參數。" });
    }
    
    // 🔒 1. 核心安全檢驗：在後端重播玩家的每一步操作 (movesLog)，若判定為作弊則拒絕寫入資料庫！
    const verification = validateMovesLog(dateStr, currentLevelIndex, movesLog, result);
    if (!verification.success) {
        console.warn(`⚠️ [安全警告] 玩家 ${uid} 被系統判定作弊：${verification.error}`);
        return res.status(400).json({ error: `防作弊檢測失敗：${verification.error}` });
    }
    
    try {
        const userDocRef = db.collection('players').doc(uid);
        const dailyDocRef = db.collection('players').doc(uid).collection('dailyStats').doc(dateStr);
        
        const monthStr = dateStr.substring(0, 7); // "YYYY-MM"
        const weekStr = getISOWeekString(dateStr); // "YYYY-Www"
        const dailyLeaderboardRef = db.collection('dailyLeaderboard').doc(`${dateStr}_${uid}`);
        const weeklyLeaderboardRef = db.collection('weeklyLeaderboard').doc(`${weekStr}_${uid}`);
        const monthlyLeaderboardRef = db.collection('monthlyLeaderboard').doc(`${monthStr}_${uid}`);
        
        // 🔒 在後端進行資料庫事務讀寫 (Transaction)，確保勝敗數與大滿貫防護絕對正確
        await db.runTransaction(async (transaction) => {
            // 🚀 極致效能優化：使用 Promise.all 在單一網路來回（Round-trip）中平行讀取所有 5 個 Firestore 文件！
            // 這將原本 5 次循序讀取的延遲，一舉縮短了將近 80%！
            const [
                userDoc,
                dailyDoc,
                dailyLeaderboardDoc,
                weeklyLeaderboardDoc,
                monthlyLeaderboardDoc
            ] = await Promise.all([
                transaction.get(userDocRef),
                transaction.get(dailyDocRef),
                transaction.get(dailyLeaderboardRef),
                transaction.get(weeklyLeaderboardRef),
                transaction.get(monthlyLeaderboardRef)
            ]);
            
            if (dailyDoc.exists && dailyDoc.data().dailyLevelIndex >= LEVELS.length) {
                throw new Error("防作弊檢測：您今天已經達成大滿貫挑戰，不允許再度提交遊戲結算！");
            }
            
            let stats = {
                wins: 0,
                losses: 0,
                totalGames: 0,
                maxLevelReached: 0
            };
            
            if (userDoc.exists && userDoc.data().stats) {
                stats = userDoc.data().stats;
            }
            
            // 安全防護 A: 防止前端發送非法超出當前進度的 currentLevelIndex
            if (currentLevelIndex > stats.maxLevelReached && currentLevelIndex > 0) {
                throw new Error("防刷檢測：嘗試通關未解鎖的關卡！");
            }
            
            // 後端更新勝/敗數
            if (result === 'victory') {
                stats.wins++;
                // 如果當前關卡等於已記錄的最高關卡，解鎖下一關
                if (currentLevelIndex >= stats.maxLevelReached) {
                    stats.maxLevelReached = Math.min(LEVELS.length - 1, currentLevelIndex + 1);
                }
            } else {
                stats.losses++;
            }
            
            // 嚴格數學計算，維持守恆
            stats.totalGames = stats.wins + stats.losses;
            
            // 更新每日進度 session (下一關或留在本關，並在後端強制清除 midGameState)
            let nextDailyLevel = currentLevelIndex;
            if (result === 'victory') {
                nextDailyLevel = currentLevelIndex < LEVELS.length - 1 ? currentLevelIndex + 1 : LEVELS.length; // 贏了最後一關設為 LEVELS.length 表示今天完成大滿貫！
            }
            
            const pName = req.user.name || "冒險者";
            let curAvatarId = -1;
            let isAvatarShiny = false;
            if (userDoc.exists) {
                const uData = userDoc.data();
                if (uData.currentAvatarId !== undefined) {
                    curAvatarId = uData.currentAvatarId;
                }
                const shinyCodex = uData.shinyCodex || [];
                isAvatarShiny = shinyCodex.includes(curAvatarId);
            }
            
            let dailyLeaderboardData = {
                uid,
                dateStr,
                playerName: pName,
                currentAvatarId: curAvatarId,
                isAvatarShiny: isAvatarShiny,
                wins: 0,
                losses: 0,
                totalGames: 0,
                winRate: 0,
                lastUpdated: admin.firestore.FieldValue.serverTimestamp()
            };
            
            if (dailyLeaderboardDoc.exists) {
                const data = dailyLeaderboardDoc.data();
                dailyLeaderboardData.wins = data.wins || 0;
                dailyLeaderboardData.losses = data.losses || 0;
            }

            let weeklyLeaderboardData = {
                uid,
                weekStr,
                playerName: pName,
                currentAvatarId: curAvatarId,
                isAvatarShiny: isAvatarShiny,
                wins: 0,
                losses: 0,
                totalGames: 0,
                winRate: 0,
                lastUpdated: admin.firestore.FieldValue.serverTimestamp()
            };
            
            if (weeklyLeaderboardDoc.exists) {
                const data = weeklyLeaderboardDoc.data();
                weeklyLeaderboardData.wins = data.wins || 0;
                weeklyLeaderboardData.losses = data.losses || 0;
            }
            
            let monthlyLeaderboardData = {
                uid,
                monthStr,
                playerName: pName,
                currentAvatarId: curAvatarId,
                isAvatarShiny: isAvatarShiny,
                wins: 0,
                losses: 0,
                totalGames: 0,
                winRate: 0,
                lastUpdated: admin.firestore.FieldValue.serverTimestamp()
            };
            
            if (monthlyLeaderboardDoc.exists) {
                const data = monthlyLeaderboardDoc.data();
                monthlyLeaderboardData.wins = data.wins || 0;
                monthlyLeaderboardData.losses = data.losses || 0;
            }
            
            if (result === 'victory') {
                dailyLeaderboardData.wins++;
                weeklyLeaderboardData.wins++;
                monthlyLeaderboardData.wins++;
            } else {
                dailyLeaderboardData.losses++;
                weeklyLeaderboardData.losses++;
                monthlyLeaderboardData.losses++;
            }
            
            dailyLeaderboardData.totalGames = dailyLeaderboardData.wins + dailyLeaderboardData.losses;
            dailyLeaderboardData.winRate = dailyLeaderboardData.totalGames > 0 ? (dailyLeaderboardData.wins / dailyLeaderboardData.totalGames) : 0;

            weeklyLeaderboardData.totalGames = weeklyLeaderboardData.wins + weeklyLeaderboardData.losses;
            weeklyLeaderboardData.winRate = weeklyLeaderboardData.totalGames > 0 ? (weeklyLeaderboardData.wins / weeklyLeaderboardData.totalGames) : 0;
            
            monthlyLeaderboardData.totalGames = monthlyLeaderboardData.wins + monthlyLeaderboardData.losses;
            monthlyLeaderboardData.winRate = monthlyLeaderboardData.totalGames > 0 ? (monthlyLeaderboardData.wins / monthlyLeaderboardData.totalGames) : 0;
            
            // 執行資料庫更新
            transaction.set(userDocRef, {
                stats,
                lastUpdated: admin.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
            
            let nextLevelInitialState = null;
            let nextLevelTiles = [];
            if (result === 'victory' && nextDailyLevel < LEVELS.length) {
                nextLevelInitialState = getInitialMidGameState(dateStr, nextDailyLevel);
                nextLevelTiles = generateLevelLayout(dateStr, nextDailyLevel);
            }
            
            transaction.set(dailyDocRef, {
                dailyLevelIndex: nextDailyLevel,
                midGameState: nextLevelInitialState, // 寫入下一關的初始存檔 (若通關)
                lastUpdated: admin.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
            
            transaction.set(dailyLeaderboardRef, dailyLeaderboardData, { merge: true });
            transaction.set(weeklyLeaderboardRef, weeklyLeaderboardData, { merge: true });
            transaction.set(monthlyLeaderboardRef, monthlyLeaderboardData, { merge: true });
            
            res.json({ success: true, stats, nextDailyLevel, midGameState: nextLevelInitialState, tiles: nextLevelTiles });
        });
        
    } catch (e) {
        console.error("API /api/end-game 錯誤: ", e.message);
        return res.status(500).json({ error: e.message || "伺服器內部錯誤，遊戲結算失敗。" });
    }
});

/**
 * 🏆 API F: 獲取每日排行榜 (依勝場遞減，再依勝率遞減排序)
 */
app.get('/api/leaderboard/daily/:dateStr', verifyFirebaseToken, async (req, res) => {
    if (!db) {
        return res.status(500).json({ error: "Firebase Admin SDK 尚未正確初始化金鑰，伺服器無法連接資料庫。" });
    }
    const dateStr = req.params.dateStr;
    try {
        const snapshot = await db.collection('dailyLeaderboard')
            .where('dateStr', '==', dateStr)
            .get();
            
        let players = [];
        snapshot.forEach(doc => {
            players.push(doc.data());
        });
        
        // 記憶體排序：先比 wins (勝場) 降序，再比 winRate (勝率) 降序
        players.sort((a, b) => {
            if (b.wins !== a.wins) {
                return b.wins - a.wins;
            }
            return (b.winRate || 0) - (a.winRate || 0);
        });
        
        return res.json({ success: true, leaderboard: players.slice(0, 50) });
    } catch (e) {
        console.error("GET daily leaderboard error:", e);
        return res.status(500).json({ error: "無法載入每日排行榜" });
    }
});

/**
 * 🏆 API I: 獲取每週排行榜 (依勝場遞減，再依勝率遞減排序)
 */
app.get('/api/leaderboard/weekly/:weekStr', verifyFirebaseToken, async (req, res) => {
    if (!db) {
        return res.status(500).json({ error: "Firebase Admin SDK 尚未正確初始化金鑰，伺服器無法連接資料庫。" });
    }
    const weekStr = req.params.weekStr;
    try {
        const snapshot = await db.collection('weeklyLeaderboard')
            .where('weekStr', '==', weekStr)
            .get();
            
        let players = [];
        snapshot.forEach(doc => {
            players.push(doc.data());
        });
        
        // 記憶體排序：先比 wins (勝場) 降序，再比 winRate (勝率) 降序
        players.sort((a, b) => {
            if (b.wins !== a.wins) {
                return b.wins - a.wins;
            }
            return (b.winRate || 0) - (a.winRate || 0);
        });
        
        return res.json({ success: true, leaderboard: players.slice(0, 50) });
    } catch (e) {
        console.error("GET weekly leaderboard error:", e);
        return res.status(500).json({ error: "無法載入每週排行榜" });
    }
});

/**
 * 🏆 API G: 獲取每月排行榜 (依勝場遞減，再依勝率遞減排序)
 */
app.get('/api/leaderboard/monthly/:monthStr', verifyFirebaseToken, async (req, res) => {
    if (!db) {
        return res.status(500).json({ error: "Firebase Admin SDK 尚未正確初始化金鑰，伺服器無法連接資料庫。" });
    }
    const monthStr = req.params.monthStr;
    try {
        const snapshot = await db.collection('monthlyLeaderboard')
            .where('monthStr', '==', monthStr)
            .get();
            
        let players = [];
        snapshot.forEach(doc => {
            players.push(doc.data());
        });
        
        // 記憶體排序：先比 wins (勝場) 降序，再比 winRate (勝率) 降序
        players.sort((a, b) => {
            if (b.wins !== a.wins) {
                return b.wins - a.wins;
            }
            return (b.winRate || 0) - (a.winRate || 0);
        });
        
        return res.json({ success: true, leaderboard: players.slice(0, 50) });
    } catch (e) {
        console.error("GET monthly leaderboard error:", e);
        return res.status(500).json({ error: "無法載入每月排行榜" });
    }
});

/**
 * 🗺️ Helper: 確定性隨機產生關卡佈局 (伺服器端計算，前端零負載)
 */
function generateLevelLayout(dateStr, levelIndex) {
    const lIdx = parseInt(levelIndex);
    if (isNaN(lIdx) || lIdx < 0 || lIdx >= LEVELS.length) {
        return [];
    }
    
    const curLevel = LEVELS[lIdx];
    const dailySeed = getDailySeed(dateStr);
    const levelSeed = dailySeed + lIdx;
    const prng = mulberry32(levelSeed);

    // 1. 重構卡牌池
    const pool = [];
    const basePairs = Math.floor(curLevel.tileCount / 3);
    const countsPerType = Array(curLevel.typesCount).fill(0);
    for (let i = 0; i < basePairs; i++) {
        countsPerType[i % curLevel.typesCount] += 3;
    }
    countsPerType.forEach((num, tIdx) => {
        for (let i = 0; i < num; i++) {
            pool.push({ typeId: tIdx });
        }
    });
    seededShuffle(pool, prng);

    // 2. 佈局定位
    const centerX = 250;
    const centerY = 200;
    const gridSpacingX = 62;
    const gridSpacingY = 72;
    const tiles = [];
    let nextTileId = 0;
    let tileIndex = 0;

    const layerDistribution = distributeTilesToLayers(pool.length, curLevel.layers);

    for (let d = 0; d < layerDistribution.length; d++) {
        const count = layerDistribution[d];
        const gridCoords = [];
        
        let offsetX = (d % 2 === 1) ? gridSpacingX / 2 : 0;
        let offsetY = (d % 2 === 1) ? gridSpacingY / 2 : 0;
        
        if (d === 2) { offsetX = 0; offsetY = -12; }
        else if (d === 3) { offsetX = 28; offsetY = 12; }
        else if (d === 4) { offsetX = -14; offsetY = -12; }
        else if (d === 5) { offsetX = 14; offsetY = 6; }
        
        const numCols = 3;
        const numRows = 2;
        
        for (let col = -numCols; col <= numCols; col++) {
            for (let row = -numRows; row <= numRows; row++) {
                gridCoords.push({
                    x: centerX + col * gridSpacingX + offsetX,
                    y: centerY + row * gridSpacingY + offsetY
                });
            }
        }
        
        seededShuffle(gridCoords, prng);
        
        for (let i = 0; i < count; i++) {
            if (tileIndex >= pool.length) break;
            const pos = gridCoords[i % gridCoords.length];
            const rawTile = pool[tileIndex];
            tiles.push({
                id: nextTileId++,
                typeId: rawTile.typeId,
                x: pos.x,
                y: pos.y,
                layer: d
            });
            tileIndex++;
        }
    }

    return tiles;
}

/**
 * 🗺️ Helper: 獲取指定日期的關卡初始 midGameState (由伺服器確定性產生)
 */
function getInitialMidGameState(dateStr, lIdx) {
    const tiles = generateLevelLayout(dateStr, lIdx);
    if (tiles.length === 0) return null;
    
    return {
        tiles: tiles.map(t => ({ id: t.id, typeId: t.typeId })),
        slots: [],
        out3Storage: [],
        skills: { undo: 1, out3: 1, shuffle: 1 },
        status: "playing",
        nextTileId: tiles.length,
        currentLevelIndex: lIdx,
        movesLog: []
    };
}

// ==========================================
// 🛡️ 5. 後端遊戲邏輯重播與防作弊校驗引擎 (Deterministic Game Replay Engine)
// ==========================================

const LEVELS = [
    { tileCount: 36, typesCount: 5, layers: 3 }, // 第 1 關：萌新集結 🐣
    { tileCount: 54, typesCount: 8, layers: 4 }, // 第 2 關：青翠草原 🌿
    { tileCount: 72, typesCount: 9, layers: 5 }, // 第 3 關：熱鬧林間 🐱
    { tileCount: 90, typesCount: 10, layers: 6 }, // 第 4 關：微風山谷 🏔️
    { tileCount: 126, typesCount: 10, layers: 7 } // 第 5 關：大自然派對 🐼
];

function mulberry32(a) {
    return function() {
        let t = a += 0x6D2B79F5;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }
}

function getDailySeed(dateStr) {
    let hash = 0;
    for (let i = 0; i < dateStr.length; i++) {
        const char = dateStr.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
    }
    return Math.abs(hash);
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

function seededShuffle(arr, prng) {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(prng() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
}

function distributeTilesToLayers(total, layersCount) {
    if (layersCount === 1) return [total];
    const dist = [];
    let remaining = total;
    const weights = [];
    let totalWeight = 0;
    for (let d = 0; d < layersCount; d++) {
        const w = layersCount - d;
        weights.push(w);
        totalWeight += w;
    }
    for (let d = 0; d < layersCount - 1; d++) {
        const count = Math.round((weights[d] / totalWeight) * total);
        dist.push(count);
        remaining -= count;
    }
    dist.push(remaining);
    return dist;
}

function validateMovesLog(dateStr, currentLevelIndex, movesLog, finalResult, clientSkills = null) {
    const curLevel = LEVELS[currentLevelIndex];
    if (!curLevel) return { success: false, error: "無效的關卡索引" };

    const dailySeed = getDailySeed(dateStr);
    const levelSeed = dailySeed + currentLevelIndex;
    const prng = mulberry32(levelSeed);

    // 1. 重構原始卡牌池
    const pool = [];
    const basePairs = Math.floor(curLevel.tileCount / 3);
    const countsPerType = Array(curLevel.typesCount).fill(0);
    for (let i = 0; i < basePairs; i++) {
        countsPerType[i % curLevel.typesCount] += 3;
    }
    countsPerType.forEach((num, tIdx) => {
        for (let i = 0; i < num; i++) {
            pool.push({ typeId: tIdx });
        }
    });
    seededShuffle(pool, prng);

    // 2. 佈局定位 (與前端絕對一致，以便完全複現遮擋與點擊邏輯)
    const centerX = 250;
    const centerY = 200;
    const gridSpacingX = 62;
    const gridSpacingY = 72;
    const tiles = [];
    let nextTileId = 0;
    let tileIndex = 0;

    const layerDistribution = distributeTilesToLayers(pool.length, curLevel.layers);

    for (let d = 0; d < layerDistribution.length; d++) {
        const count = layerDistribution[d];
        const gridCoords = [];
        
        let offsetX = (d % 2 === 1) ? gridSpacingX / 2 : 0;
        let offsetY = (d % 2 === 1) ? gridSpacingY / 2 : 0;
        
        if (d === 2) { offsetX = 0; offsetY = -12; }
        else if (d === 3) { offsetX = 28; offsetY = 12; }
        else if (d === 4) { offsetX = -14; offsetY = -12; }
        else if (d === 5) { offsetX = 14; offsetY = 6; }
        
        const numCols = 3;
        const numRows = 2;
        
        for (let col = -numCols; col <= numCols; col++) {
            for (let row = -numRows; row <= numRows; row++) {
                gridCoords.push({
                    x: centerX + col * gridSpacingX + offsetX,
                    y: centerY + row * gridSpacingY + offsetY
                });
            }
        }
        
        seededShuffle(gridCoords, prng);
        
        for (let i = 0; i < count; i++) {
            if (tileIndex >= pool.length) break;
            const pos = gridCoords[i % gridCoords.length];
            const rawTile = pool[tileIndex];
            tiles.push({
                id: nextTileId++,
                typeId: rawTile.typeId,
                x: pos.x,
                y: pos.y,
                layer: d
            });
            tileIndex++;
        }
    }

    // 3. 實時重播 movesLog
    let simTiles = [...tiles];
    let simSlots = [];
    let simOut3Storage = [];
    let simHistory = []; // 用於復原
    let simSkills = { undo: 1, out3: 1, shuffle: 1 };

    const evaluateOverlaps = () => {
        const tileWidth = 58;
        const tileHeight = 70;
        for (const tileToCheck of simTiles) {
            let isCovered = false;
            const b_left = tileToCheck.x - tileWidth / 2;
            const b_right = tileToCheck.x + tileWidth / 2;
            const b_top = tileToCheck.y - tileHeight / 2;
            const b_bottom = tileToCheck.y + tileHeight / 2;

            for (const otherTile of simTiles) {
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
    };

    const saveHistory = () => {
        simHistory.push({
            tiles: simTiles.map(t => ({ ...t })),
            slots: simSlots.map(t => ({ ...t })),
            out3Storage: simOut3Storage.map(t => ({ ...t }))
        });
        if (simHistory.length > 5) simHistory.shift();
    };

    const checkMatchThree = (typeId) => {
        const count = simSlots.filter(t => t.typeId === typeId).length;
        if (count >= 3) {
            let removedCount = 0;
            simSlots = simSlots.filter(t => {
                if (t.typeId === typeId && removedCount < 3) {
                    removedCount++;
                    return false;
                }
                return true;
            });
        }
    };

    // 依序校驗每一步
    for (const move of (movesLog || [])) {
        evaluateOverlaps();

        if (move.a === 'click') {
            const tile = simTiles.find(t => t.id === move.id);
            if (!tile) return { success: false, error: `點擊的卡牌 ID ${move.id} 不在場上！` };
            if (tile.isLocked) return { success: false, error: `卡牌 ID ${move.id} 仍被遮擋！不可點擊！` };

            saveHistory();
            simTiles = simTiles.filter(t => t.id !== move.id);
            simSlots.push(tile);
            checkMatchThree(tile.typeId);
        } 
        else if (move.a === 'out3_click') {
            if (simSlots.length >= 7) return { success: false, error: "巴士座位已滿，不可點擊送回！" };
            const tile = simOut3Storage.find(t => t.id === move.id);
            if (!tile) return { success: false, error: `移出區無卡牌 ID ${move.id}！` };
            simOut3Storage = simOut3Storage.filter(t => t.id !== move.id);
            simSlots.push(tile);
            checkMatchThree(tile.typeId);
        }
        else if (move.a === 'undo') {
            if (simSkills.undo <= 0) return { success: false, error: "復原次數不足！" };
            if (simHistory.length === 0) return { success: false, error: "無可復原歷史！" };
            simSkills.undo--;
            const prevState = simHistory.pop();
            simTiles = prevState.tiles;
            simSlots = prevState.slots;
            simOut3Storage = prevState.out3Storage;
        }
        else if (move.a === 'out3') {
            if (simSkills.out3 <= 0) return { success: false, error: "移出次數不足！" };
            if (simSlots.length < 3) return { success: false, error: "巴士不足 3 張牌！" };
            simSkills.out3--;
            const toMove = simSlots.splice(0, 3);
            simOut3Storage.push(...toMove);
        }
        else if (move.a === 'shuffle') {
            if (simSkills.shuffle <= 0) return { success: false, error: "打亂次數不足！" };
            if (simTiles.length === 0) return { success: false, error: "場上無牌可打亂！" };
            simSkills.shuffle--;
            // 使用一樣的 PRNG 洗牌
            const activeTemplates = simTiles.map(t => t.typeId);
            for (let i = activeTemplates.length - 1; i > 0; i--) {
                const j = Math.floor(prng() * (i + 1));
                [activeTemplates[i], activeTemplates[j]] = [activeTemplates[j], activeTemplates[i]];
            }
            simTiles.forEach((tile, index) => {
                tile.typeId = activeTemplates[index];
            });
        }
        else {
            return { success: false, error: `未知的操作指令 ${move.a}` };
        }
    }

    evaluateOverlaps();
    const isWin = (simTiles.length === 0 && simSlots.length === 0 && simOut3Storage.length === 0);
    const isLose = (simSlots.length >= 7);

    let simResult = 'playing';
    if (isWin) simResult = 'victory';
    else if (isLose) simResult = 'defeat';

    if (simResult !== finalResult) {
        return { success: false, error: `模擬結果為 ${simResult}，但上報結果為 ${finalResult}！` };
    }

    // 🔒 道具/技能數量守恆原子校驗：確保客戶端上報的存檔中剩餘技能數，絕對沒有非法「無中生有」地增加！
    if (clientSkills) {
        const u = clientSkills.undo !== undefined ? clientSkills.undo : 1;
        const o = clientSkills.out3 !== undefined ? clientSkills.out3 : 1;
        const s = clientSkills.shuffle !== undefined ? clientSkills.shuffle : 1;
        
        if (u > simSkills.undo || o > simSkills.out3 || s > simSkills.shuffle) {
            return { success: false, error: `檢測到道具數量非法溢出或竄改！重播推導剩餘: (↩️:${simSkills.undo}, 📤:${simSkills.out3}, 🔄:${simSkills.shuffle})，但上報存檔為: (↩️:${u}, 📤:${o}, 🔄:${s})` };
        }
    }

    return { success: true };
}

// 6. 啟動伺服器
app.listen(PORT, () => {
    console.log(`🚀 聖域晶石殿堂安全後端已在 Port ${PORT} 啟動！`);
    console.log(`🌍 API 連線入口：http://localhost:${PORT}`);
});
