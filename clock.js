// ===================== 即時時鐘程式 =====================
(function () {
    // 1. 抓取網頁上的元素
    const clockEl    = document.getElementById('clock');
    const dateEl     = document.getElementById('dateDisplay');
    const secondBar  = document.getElementById('secondBar');
    const weekdays   = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];

    // 2. 補零函數 (例如把 5 變成 05)
    function padZero(num) {
        return String(num).padStart(2, '0');
    }

    // 3. 更新時鐘畫面的核心函數
    function updateClock() {
        const now = new Date();

        // 處理時間
        const hours   = padZero(now.getHours());
        const minutes = padZero(now.getMinutes());
        const seconds = padZero(now.getSeconds());
        clockEl.textContent = `${hours}:${minutes}:${seconds}`;

        // 處理日期
        const year    = now.getFullYear();
        const month   = padZero(now.getMonth() + 1);
        const day     = padZero(now.getDate());
        const weekday = weekdays[now.getDay()];
        dateEl.textContent = `${year}年${month}月${day}日 ${weekday}`;

        // 處理進度條 (0% ~ 100%)
        secondBar.style.width = (now.getSeconds() / 60 * 100) + '%';
    }

    // 4. 精準定時器 (對齊整數秒，避免時間越跑越慢)
    function tick() {
        updateClock();
        const now = new Date();
        const delay = 1000 - now.getMilliseconds(); // 算出距離下一整秒還差多少毫秒
        setTimeout(tick, delay);
    }

    // 5. 網頁載入後立刻啟動
    tick();
})();