const LIFF_ID = "2009827198-UQgt92rl"; // ★テスト用のLIFF_ID
const WEBHOOK_URL = "https://syukkin-test.kadowaki-universal-prime.workers.dev/"; // ★Cloudflare WorkersのURL

// 誘導先のLIFF URLを定義 (※必要に応じてテスト用のURLに変更してください)
const REGISTER_LIFF_URL = "https://liff.line.me/2009827198-qvnHhjxl"; // 登録用
const ADD_SHIFT_LIFF_URL = "https://liff.line.me/2009827198-LyTrVRFv"; // シフト追加用

function updateStatus(text) {
  document.getElementById("status-text").innerHTML = text; 
}

function showError(text, btnText = null, redirectUrl = null) {
  document.getElementById("spinner").style.display = "none";
  document.getElementById("status-text").innerText = "エラーが発生しました";
  document.getElementById("error-message").innerText = text;
  
  const actionContainer = document.getElementById("action-container");
  const actionBtn = document.getElementById("action-btn");
  if (btnText && redirectUrl) {
    actionBtn.innerText = btnText;
    actionBtn.onclick = function() {
      window.location.href = redirectUrl;
    };
    actionContainer.style.display = "block";
  } else {
    actionContainer.style.display = "none";
  }
}

// ==========================================
// 自動リトライ機能（Cloudflare向け）
// ==========================================
async function fetchWithRetry(url, params, maxRetries, statusTextPrefix) {
  for (let i = 0; i < maxRetries; i++) {
    params.set('t', Date.now()); 
    const fetchUrl = `${url}?${params.toString()}`;
    
    if (i > 0) {
      updateStatus(`${statusTextPrefix}<br><span style="font-size:0.85em; color:#ff9900;">(混雑を検知... 再接続中 ${i+1}/${maxRetries})</span>`);
    } else {
      updateStatus(`${statusTextPrefix}<br>このままお待ちください`);
    }
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000); 
    
    try {
      const response = await fetch(fetchUrl, {
        method: "GET",
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      
      // 500系のエラー（Workers側やAnycross側の一時的なサーバーエラー）の場合はエラーを投げてリトライさせる
      if (response.status >= 500) {
        throw new Error("ServerError");
      }
      
      const responseText = await response.text();
      const resultJson = JSON.parse(responseText);
      return resultJson; 
      
    } catch (error) {
      clearTimeout(timeoutId);
      console.warn(`通信アタック ${i + 1}回目 失敗:`, error);
      
      if (i === maxRetries - 1) {
        if (error.name === 'AbortError') {
          throw new Error("アクセスが集中し、通信がタイムアウトしました。");
        } else if (error.message === "ServerError" || error instanceof SyntaxError) {
          throw new Error("システムが大変混み合っています。少し時間をおいてお試しください。");
        } else {
          throw new Error("予期せぬ通信エラーが発生しました。");
        }
      }
      
      await new Promise(resolve => setTimeout(resolve, 1500));
    }
  }
}

window.onload = async function() {
  try {
    await liff.init({ liffId: LIFF_ID });
    if (!liff.isLoggedIn()) {
      liff.login();
      return;
    }
    if (window.confirm("本当に出勤しますか？\n打刻できているかの確認は社員へ直接聞いてください。")) {
      main();
    } else {
      updateStatus("キャンセルしました");
      document.getElementById("spinner").style.display = "none";
      setTimeout(() => { liff.closeWindow(); }, 2000);
    }
  } catch (error) {
    showError("LIFFの読み込みに失敗しました。\n詳細: " + (error.message || error));
    console.error(error);
  }
};

async function main() {
  try {
    updateStatus("ユーザー情報を取得中...");
    const profile = await liff.getProfile();
    const userId = profile.userId;

    // ==========================================
    // 位置情報の取得
    // ==========================================
    updateStatus("位置情報を取得中...<br>お待ちください");
    const position = await new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: false, 
        timeout: 30000,            
        maximumAge: 60000          
      });
    });
    const latitude = position.coords.latitude;
    const longitude = position.coords.longitude;
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    
    const timestamp = `${year}-${month}-${day} ${hours}:${minutes}`;

    // ==========================================
    // 打刻データの送信
    // ==========================================
    const submitParams = new URLSearchParams({
      userId: userId,
      timestamp: timestamp,
      location: `${longitude},${latitude}`,
      action: "clock_in" 
    });
    let resultJson;
    try {
      // 最大4回アタックする
      resultJson = await fetchWithRetry(WEBHOOK_URL, submitParams, 4, "データを送信中...");
    } catch (e) {
      throw new Error(`${e.message}\n電波の良い環境で再度お試しいただくか、打刻できているか社員に確認してください。`);
    }

    // ▼▼▼ ステータスコードごとの条件分岐 ▼▼▼
    const resultStatus = resultJson.status;
    if (resultStatus === 400) {
      document.getElementById("spinner").style.display = "none";
      updateStatus("すでに打刻しています。<br>退勤の場合は再度メニューから<br>退勤を押してください。");
      document.getElementById("status-text").style.color = "#ff334b";
      return; 
    } 
    else if (resultStatus === 403) {
      showError("先に登録をしてください", "登録画面へ進む", REGISTER_LIFF_URL);
      return;
    } 
    else if (resultStatus === 406) {
      showError("先にシフトを追加してください", "シフト追加画面へ進む", ADD_SHIFT_LIFF_URL);
      return;
    } 
    else if (resultStatus !== 200 && resultStatus !== undefined) {
      showError("処理エラーが発生しました。（ステータス: " + resultStatus + "）");
      return;
    }

    // 打刻完了時の処理
    document.getElementById("spinner").style.display = "none";
    updateStatus("打刻完了！<br>画面左上の「×」ボタンで閉じてください。");
  } catch (error) {
    console.error("Error:", error);
    
    if (error.code === 1) {
      showError("位置情報の取得が許可されていません。スマホの設定からLINEへの位置情報アクセスを許可してください。");
    } else if (error.code === 3) {
      showError("位置情報の取得に時間がかかりすぎました。\n建物の奥にいるとGPSが届きません。窓際に移動するか、Wi-Fiをオンにしてから再度お試しください。");
    } else if (error.code === 2) {
      showError("現在地を特定できませんでした。通信環境の良い場所で再度お試しください。");
    } else {
      showError(error.message || "予期せぬ通信エラーが発生しました。");
    }
  }
}