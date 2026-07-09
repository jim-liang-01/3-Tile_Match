/**
 * 可愛動物森林：Firebase 雲端連線設定檔 (config.js)
 * ------------------------------------------
 * 請在此處填寫您在 Firebase Console 申請的專案 API 金鑰。
 * 將此處設定與遊戲主邏輯分開，能確保以後即使升級遊戲引擎 (game.js)，
 * 您的金鑰設定也絕對不會被覆蓋，安全可靠！
 * ------------------------------------------
 */
const firebaseConfig = {
    apiKey: "AIzaSyCG0gwxzWTIhy3nuscuPUkd1BVH7tuvhWw",
    authDomain: "tile-match-6581b.firebaseapp.com",
    projectId: "tile-match-6581b",
    storageBucket: "tile-match-6581b.firebasestorage.app",
    messagingSenderId: "282378159212",
    appId: "1:282378159212:web:8accbdcad96dbdc5ee8449"
};

// 🌐 後端安全驗證系統 API 路由器網址 (自動適配本地開發與線上部署生產環境)
const BACKEND_URL = window.location.origin.includes("localhost") || window.location.origin.includes("127.0.0.1") || window.location.origin.includes("172.16")
    ? "http://172.16.110.82:3000" 
    : window.location.origin;
