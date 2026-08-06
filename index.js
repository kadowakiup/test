// 1. WEBHOOK_URL を Cloudflare Workers で発行されたURLに変更する
const WEBHOOK_URL = "https://syukkin-test.kadowaki-universal-prime.workers.dev/"; 

// 2. 自動リトライ機能（fetchWithRetry）の中身をCloudflare向けに修正
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