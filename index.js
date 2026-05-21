// index.js
const GAS_URL = "https://script.google.com/macros/s/AKfycbyZr7jUDQng4W965XEDJ3DRJNnPXFv_8ucXY9D7yiiz65P7iu2M5ZIiye_ln-TVOuaI/exec";

// ★修正：固定ではなく変数にして、ボタンを押した時に年・月をセットする
let TARGET_YEAR;
let TARGET_MONTH;

// 休業日の設定（YYYY-MM-DD形式）
const holidays = [
  // `${TARGET_YEAR}-05-03`,
  // `${TARGET_YEAR}-05-04`,
  // `${TARGET_YEAR}-05-05`
];

const startRules = {
  12: ["00", "15", "30", "45"], 13: ["00", "15", "30", "45"], 15: ["00", "15", "30", "45"],
  16: ["00", "15", "30"], 17: ["00", "15", "30", "45"], 18: ["00", "15", "30"],
  19: ["00", "15", "30", "45"], 20: ["00", "15", "30", "45"]
};

const endRules = {
  12: ["15", "30", "45"], 13: ["00", "15", "30", "45"], 14: ["00"],
  15: ["15", "30", "45"], 16: ["00", "15", "30", "45"], 17: ["00", "15", "30", "45"],
  18: ["00", "15", "30", "45"], 19: ["00", "15", "30", "45"], 20: ["00", "15", "30", "45"], 21: ["00"]
};

let nationalHolidays = {};

async function loadHolidays() {
  try {
    const res = await fetch("https://holidays-jp.github.io/api/v1/date.json");
    nationalHolidays = await res.json();
  } catch (err) {
    console.error("祝日データの取得に失敗しました", err);
  }
}

window.onload = async function () {
  const resultDiv = document.getElementById("result");
  const monthSelector = document.getElementById("month-selector");
  const btnCurrent = document.getElementById("btn-current-month");
  const btnNext = document.getElementById("btn-next-month");

  try {
    await liff.init({ liffId: "2009569390-K8RpTDye" });

    if (!liff.isLoggedIn()) {
      resultDiv.innerHTML = "LINEログインへ移動します…";
      liff.login({ redirectUri: window.location.origin + window.location.pathname });
      return;
    }

    const idToken = liff.getIDToken();
    if (!idToken) {
      liff.login();
      return;
    }

    // ★追加：今月と来月の年・月を自動計算
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;
    
    let nextYear = currentYear;
    let nextMonth = currentMonth + 1;
    if (nextMonth > 12) {
      nextMonth = 1;
      nextYear += 1;
    }

    // ボタンのテキストを設定
    btnCurrent.textContent = `${currentMonth}月分`;
    btnNext.textContent = `${nextMonth}月分`;
    
    // 月選択ボタンを表示
    monthSelector.style.display = "block";

    // ボタンが押された時の処理
    btnCurrent.onclick = () => fetchAndRenderShifts(currentYear, currentMonth, idToken);
    btnNext.onclick = () => fetchAndRenderShifts(nextYear, nextMonth, idToken);

  } catch (err) {
    console.error(err);
    resultDiv.innerHTML = `<p style="color: red; text-align: center;">初期化エラー: ${err.message}</p>`;
  }
};

// ★追加：選ばれた月をもとにデータを取得して描画する関数
async function fetchAndRenderShifts(year, month, idToken) {
  TARGET_YEAR = year;
  TARGET_MONTH = month;

  const resultDiv = document.getElementById("result");
  const monthSelector = document.getElementById("month-selector");
  const shiftListDiv = document.getElementById("shift-list");
  const submitBtn = document.getElementById("submit-btn");
  const pageTitle = document.getElementById("page-title");
  
  let isFetchError = false;

  // ボタンを隠してローディング表示
  monthSelector.style.display = "none";
  resultDiv.textContent = "更新中...";
  resultDiv.classList.add("kousintyu");

  try {
    await loadHolidays();

    const profile = await liff.getProfile();
    // ★修正：URLに targetYear と targetMonth を追加してGASに送る
    const url = `${GAS_URL}?action=fetch&userId=${encodeURIComponent(profile.userId)}&name=${encodeURIComponent(profile.displayName)}&targetYear=${TARGET_YEAR}&targetMonth=${TARGET_MONTH}&idToken=${encodeURIComponent(idToken)}&t=${Date.now()}`;
    
    const res = await fetch(url);
    const data = await res.json();

    if (!data.success) {
      throw new Error(data.message || "シフト取得に失敗しました");
    }

    renderShifts(data.shifts || {}); // 関数名変更

    pageTitle.textContent = `${TARGET_MONTH}月シフト提出`;
    pageTitle.style.display = "block";
    document.getElementById("notice-text").style.display = "block";
    submitBtn.style.display = "block";
    document.getElementById("back-btn").style.display = "block";

  } catch (err) {
    console.error(err);
    isFetchError = true;

    if (err.message.includes("登録") || err.message.includes("400")) {
      resultDiv.innerHTML = `
        <div style="text-align: center; margin-top: 20px;">
          <p style="color: #ff4d8d; font-weight: bold; margin-bottom: 15px;">
            LINE連携が見つかりません<br>先にメニュー「登録」から自分の名前を登録してください。
          </p>
          <button id="go-register-btn" style="padding: 10px 20px; background-color: #06C755; color: white; border: none; border-radius: 5px; cursor: pointer;">
            登録画面へ進む
          </button>
        </div>
      `;
      document.getElementById("go-register-btn").addEventListener("click", () => {
        liff.openWindow({ url: "https://liff.line.me/2009827198-qvnHhjxl", external: false });
      });
    } else {
      resultDiv.innerHTML = `
        <div style="text-align: center; margin-top: 20px; color: red;">
          <p style="font-weight: bold;">エラーが発生しました</p>
          <p style="font-size: 12px;">${err.message}</p>
        </div>
      `;
    }
  } finally {
    resultDiv.classList.remove("kousintyu");
    if (!isFetchError) resultDiv.textContent = "";
  }
}

// 提出ボタンの処理
document.getElementById("submit-btn").addEventListener("click", async () => {
  const resultDiv = document.getElementById("result");
  const submitBtn = document.getElementById("submit-btn");
  const shiftsToSubmit = [];
  let confirmationMessage = "【入力内容の確認】\n";
  const rows = document.querySelectorAll(".shift-row");
  
  let hasError = false;

  rows.forEach(row => {
    const dateStr = row.dataset.date;
    const shiftId = row.dataset.shiftId || "";
    
    let originalStart = (row.dataset.originalStart || "").trim();
    if (originalStart === "null" || originalStart === "undefined") originalStart = "";
    let originalEnd = (row.dataset.originalEnd || "").trim();
    if (originalEnd === "null" || originalEnd === "undefined") originalEnd = "";

    const startSelect = row.querySelector(".start-time");
    const endSelect = row.querySelector(".end-time");

    if (!startSelect || !endSelect) return;

    const start = startSelect.value;
    const end = endSelect.value;

    const dayDisplay = `${parseInt(dateStr.split("-")[2])}日`;

    if (start && end) {
      confirmationMessage += `${dayDisplay}: ${start} - ${end}\n`;
    } else {
      confirmationMessage += `${dayDisplay}: シフトなし\n`;
    }

    if ((start && !end) || (!start && end)) {
      hasError = true;
      return;
    }
    if (start && end) {
      const startDt = new Date(`${dateStr}T${start}:00`);
      const endDt = new Date(`${dateStr}T${end}:00`);
      if (startDt >= endDt) {
        hasError = true;
        return;
      }
    }

    if (start !== originalStart || end !== originalEnd) {
      shiftsToSubmit.push({
        date: dateStr,
        start: start,
        end: end,
        id: shiftId
      });
    }
  });

  if (hasError) {
    alert("出勤・退勤時間の入力に誤りがある日が含まれています。\n時間を確認してください。");
    return;
  }

  if (shiftsToSubmit.length === 0) {
    alert("変更されたシフトがありません。");
    return;
  }

  confirmationMessage += "\n以上の内容で提出してもよろしいですか？";
  if (!confirm(confirmationMessage)) {
    return;
  }

  try {
    submitBtn.disabled = true;
    resultDiv.textContent = "提出中...";
    resultDiv.classList.add("kousintyu", "teisyutu");

    const profile = await liff.getProfile();
    const idToken = liff.getIDToken();

    // ★修正：送信するデータにも targetYear と targetMonth を含める
    const formBody = new URLSearchParams({
      action: "submitAll",
      userId: profile.userId,
      name: profile.displayName,
      targetYear: TARGET_YEAR,
      targetMonth: TARGET_MONTH,
      idToken: idToken,
      shiftsData: JSON.stringify(shiftsToSubmit)
    });

    const res = await fetch(GAS_URL, {
      method: "POST",
      body: formBody
    });

    const data = await res.json();
    if (!data.success) throw new Error(data.message || "提出に失敗しました");

    alert("シフトの提出が完了しました！\n一度閉じてから再度提出する際は5~10分ほど反映にお待ちください");
    liff.closeWindow();

  } catch (err) {
    console.error(err);
    alert("エラーが発生しました: " + err.message);
  } finally {
    submitBtn.disabled = false;
    resultDiv.textContent = "";
    resultDiv.classList.remove("kousintyu", "teisyutu");
  }
});

function renderShifts(shiftData) { // 関数名をrenderMayShiftsから変更
  const shiftListDiv = document.getElementById("shift-list");
  shiftListDiv.innerHTML = "";

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const lastDay = new Date(TARGET_YEAR, TARGET_MONTH, 0).getDate();

  for (let day = 1; day <= lastDay; day++) {
    const dateStr = `${TARGET_YEAR}-${String(TARGET_MONTH).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const targetDate = new Date(`${dateStr}T00:00:00`);
    
    const existingShift = (shiftData[dateStr] && shiftData[dateStr].length > 0) ? shiftData[dateStr][0] : null;
    const startVal = existingShift ? (existingShift.start || "") : "";
    const endVal = existingShift ? (existingShift.end || "") : "";

    const row = document.createElement("div");
    row.className = "shift-row";
    row.dataset.date = dateStr;
    row.dataset.shiftId = existingShift ? (existingShift.id || "") : "";
    row.dataset.originalStart = startVal;
    row.dataset.originalEnd = endVal;

    const weekNames = ["日", "月", "火", "水", "木", "金", "土"];
    const dayOfWeek = targetDate.getDay();

    const dateLabel = document.createElement("span");
    dateLabel.className = "shift-row_date";
    dateLabel.textContent = `${day}日(${weekNames[dayOfWeek]})`; 
    dateLabel.style.width = "60px";

    if (nationalHolidays[dateStr]) {
      dateLabel.style.color = "#ff4d8d"; 
    } else if (dayOfWeek === 0) {
      dateLabel.style.color = "#ff4d8d"; 
    } else if (dayOfWeek === 6) {
      dateLabel.style.color = "#01b6ff"; 
    }
    
    row.appendChild(dateLabel);

    if (holidays.includes(dateStr)) {
      const holidaySpan = document.createElement("span");
      holidaySpan.className = "holiday-text";
      holidaySpan.textContent = "休業日";
      row.appendChild(holidaySpan);
      row.classList.add("dont");
      shiftListDiv.appendChild(row);
      continue;
    }

    if (targetDate <= today) {
      const pastSpan = document.createElement("span");
      pastSpan.className = "past-text";
      
      // pastSpan.textContent = existingShift ? `${startVal} - ${endVal}` : "入力不可";
      pastSpan.textContent = "入力不可"; 
      
      row.appendChild(pastSpan);
      row.classList.add("dont");
      shiftListDiv.appendChild(row);
      continue;
    }

    const startSelect = createDropdown(startRules, startVal, dateStr);
    startSelect.className = "start-time";
    
    const separator = document.createElement("span");
    separator.className = "separator";

    const endSelect = createDropdown(endRules, endVal, dateStr);
    endSelect.className = "end-time";

    row.appendChild(startSelect);
    row.appendChild(separator);
    row.appendChild(endSelect);

    shiftListDiv.appendChild(row);
  }
}

function createDropdown(rules, selectedValue, dateStr) {
  const select = document.createElement("select");
  
  const defaultOpt = document.createElement("option");
  defaultOpt.value = "";
  defaultOpt.textContent = "選択";
  select.appendChild(defaultOpt);

  const now = new Date();

  for (const h in rules) {
    for (const m of rules[h]) {
      const timeStr = `${String(h).padStart(2, "0")}:${m}`;
      const dt = new Date(`${dateStr}T${timeStr}:00`);
      
      if (dt < now && timeStr !== selectedValue) continue; 
      
      const opt = document.createElement("option");
      opt.value = timeStr;
      opt.textContent = timeStr;
      
      if (timeStr === selectedValue) {
        opt.selected = true;
      }
      select.appendChild(opt);
    }
  }
  return select;
}

document.getElementById("back-btn").addEventListener("click", () => {
  // 1. 今表示されているフォームやタイトルを隠す
  document.getElementById("shift-list").innerHTML = "";
  document.getElementById("page-title").style.display = "none";
  document.getElementById("notice-text").style.display = "none";
  document.getElementById("submit-btn").style.display = "none";
  document.getElementById("back-btn").style.display = "none";
  document.getElementById("result").innerHTML = ""; 

  // 2. 最初のご月選択ボタンをもう一度表示する
  document.getElementById("month-selector").style.display = "block";
});