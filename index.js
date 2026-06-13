window.onload = async function () {
  const calendarDiv = document.getElementById("calendar");
  const currentMonthSpan = document.getElementById("currentMonth");
  const resultDiv = document.getElementById("result");
  const monthNavDiv = document.getElementById("monthNav");
  const prevMonthBtn = document.getElementById("prevMonth");
  const nextMonthBtn = document.getElementById("nextMonth");

  // 基本情報
  const summaryDiv = document.getElementById("summary");
  const userNameSpan = document.getElementById("userName");
  const workTimeSpan = document.getElementById("workTime");

  // 詳細画面
  const calendarView = document.getElementById("calendarView");
  const detailView = document.getElementById("detailView");
  const detailDate = document.getElementById("detailDate");
  const detailShift = document.getElementById("detailShift");

  const backButton = document.getElementById("backButton");
  const btnEdit = document.getElementById("btnEdit");
  const btnDelete = document.getElementById("btnDelete");
  const btnMedical = document.getElementById("btnMedical");
  const saveEdit = document.getElementById("saveEdit");
  const editError = document.getElementById("editError");

  const editArea = document.getElementById("editArea");
  const startSelect = document.getElementById("startTime");
  const endSelect = document.getElementById("endTime");

  // 診断書提出関連
  const medicalArea = document.getElementById("medicalArea");
  const medicalFile = document.getElementById("medicalFile");
  const medicalPreviewWrap = document.getElementById("medicalPreviewWrap");
  const medicalPreview = document.getElementById("medicalPreview");
  const medicalError = document.getElementById("medicalError");
  const submitMedical = document.getElementById("submitMedical");

  const GAS_URL =
    "https://script.google.com/macros/s/AKfycbyZr7jUDQng4W965XEDJ3DRJNnPXFv_8ucXY9D7yiiz65P7iu2M5ZIiye_ln-TVOuaI/exec";

  let shiftData = {};
  let currentDate = new Date();

  let fetchedName = "";
  let nationalHolidays = {}; // ★祝日データを保存する変数

  // 選択中シフト情報
  let selectedShiftId = "";
  let selectedDateStr = "";
  let originalStart = "";
  let originalEnd = "";
  let originalState = "";

  // 画面モード
  let detailMode = "view"; // "view" | "add"

  // 診断書画像
  let medicalFileObj = null;
  let medicalImageBase64 = "";
  let medicalPreviewObjectUrl = "";

  // =====================
  // 共通関数
  // =====================
  function normalizeText(value) {
    return String(value || "").trim();
  }

  function normalizeTime(value) {
    const v = normalizeText(value);
    if (!v) return "";

    const match = v.match(/^(\d{1,2}):(\d{2})$/);
    if (!match) return v;

    const hour = String(Number(match[1])).padStart(2, "0");
    const minute = match[2];
    return `${hour}:${minute}`;
  }

  function formatDecimalHours(hours) {
    const num = Number(hours || 0);
    if (!Number.isFinite(num)) return "0";
    return Number.isInteger(num) ? String(num) : String(num);
  }

  function formatMinutesToDecimalHours(minutes) {
    const mins = Number(minutes || 0);
    if (!Number.isFinite(mins) || mins <= 0) return "0";

    const hours = mins / 60;
    return Number.isInteger(hours)
      ? String(hours)
      : String(Math.round(hours * 100) / 100);
  }

  function formatMonthTotalText(targetDate) {
    const totalMinutes = calcMonthlyWorkMinutes(targetDate);
    return `${formatMinutesToDecimalHours(totalMinutes)} h`;
  }

  function updateWorktimeDisplay() {
    if (!workTimeSpan) return;
    workTimeSpan.textContent = formatMonthTotalText(currentDate);
  }

  function formatDateJP(dateStr) {
    const d = new Date(dateStr + "T00:00:00");
    const week = ["日", "月", "火", "水", "木", "金", "土"];
    return `${d.getFullYear()}年 ${d.getMonth() + 1}月 ${d.getDate()}日 (${week[d.getDay()]})`;
  }

  function isAbsentState(state) {
    return normalizeText(state) === "当欠";
  }

  function isMedicalSubmittedState(state) {
    return normalizeText(state) === "診断書提出済み";
  }

  function isDeletedOrOffState(state) {
    const s = normalizeText(state);
    return s === "休み" || s === "削除" || s === "休み / 削除";
  }

  function isSpecialState(state) {
    return (
      isAbsentState(state) ||
      isMedicalSubmittedState(state) ||
      isDeletedOrOffState(state)
    );
  }

  function getShiftDisplayText(shift) {
    const state = normalizeText(shift?.state);
    const start = normalizeTime(shift?.start);
    const end = normalizeTime(shift?.end);

    if (isSpecialState(state)) {
      return state;
    }

    if (start && end) {
      return `${start}-${end}`;
    }

    return "";
  }

  function hasEditableShiftTime(shift) {
    const state = normalizeText(shift?.state);
    const start = normalizeTime(shift?.start);
    const end = normalizeTime(shift?.end);

    return !isSpecialState(state) && !!start && !!end;
  }

  function getDateOnly(date) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  function isTodayOrFuture(dateStr) {
    const target = getDateOnly(new Date(dateStr + "T00:00:00"));
    const today = getDateOnly(new Date());
    return target >= today;
  }

  function hasVisibleShiftOnDay(dayShifts) {
    if (!Array.isArray(dayShifts) || dayShifts.length === 0) return false;
    return dayShifts.some((shift) => !!getShiftDisplayText(shift));
  }

  function hasAnyShiftRecordOnDay(dayShifts) {
    return Array.isArray(dayShifts) && dayShifts.length > 0;
  }

  function clearMedicalPreviewUrl() {
    if (medicalPreviewObjectUrl) {
      URL.revokeObjectURL(medicalPreviewObjectUrl);
      medicalPreviewObjectUrl = "";
    }
  }

  function resetMedicalArea() {
    if (!medicalArea) return;

    medicalArea.style.display = "none";

    if (medicalFile) {
      medicalFile.value = "";
    }

    clearMedicalPreviewUrl();

    if (medicalPreview) {
      medicalPreview.src = "";
    }

    if (medicalPreviewWrap) {
      medicalPreviewWrap.style.display = "none";
    }

    if (medicalError) {
      medicalError.textContent = "";
    }

    medicalFileObj = null;
    medicalImageBase64 = "";
  }

  function resetDetailState() {
    selectedShiftId = "";
    selectedDateStr = "";
    originalStart = "";
    originalEnd = "";
    originalState = "";
    detailMode = "view";

    if (editArea) editArea.style.display = "none";
    if (editError) editError.textContent = "";
    resetMedicalArea();
  }

  function setButtonsDisabled(disabled) {
    if (btnEdit) btnEdit.disabled = disabled;
    if (btnDelete) btnDelete.disabled = disabled;
    if (btnMedical) btnMedical.disabled = disabled;
    if (saveEdit) saveEdit.disabled = disabled;
    if (submitMedical) submitMedical.disabled = disabled;
    if (backButton) backButton.disabled = disabled;
    if (prevMonthBtn) prevMonthBtn.disabled = disabled;
    if (nextMonthBtn) nextMonthBtn.disabled = disabled;

    document.querySelectorAll(".add-shift-button").forEach((btn) => {
      btn.disabled = disabled;
      btn.style.pointerEvents = disabled ? "none" : "auto";
      btn.style.opacity = disabled ? "0.5" : "1";
    });
  }
  // === ★追加：シフトが15日〜22日で、かつ今が15日以降かどうかを判定する関数 ===
  function isLockedPeriod(dateStr) {
    const targetDateObj = new Date(dateStr + "T00:00:00");
    const tYear = targetDateObj.getFullYear();
    const tMonth = targetDateObj.getMonth();
    const tDate = targetDateObj.getDate();
    const now = new Date();

    const lockDeadline = new Date(tYear, tMonth, 15, 0, 0, 0);
    // 今が15日を過ぎていて、かつ対象シフトが15〜22日なら true（ロック中）を返す
    return now >= lockDeadline && tDate >= 15 && tDate <= 22;
  }

  // === ★日本の祝日データを取得する関数 ===
  async function loadHolidays() {
    try {
      const res = await fetch("https://holidays-jp.github.io/api/v1/date.json");
      nationalHolidays = await res.json();
    } catch (err) {
      console.error("祝日データの取得に失敗しました", err);
    }
  }

  function fileToBase64(fileOrBlob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = function () {
        const result = reader.result || "";
        const base64 = String(result).split(",")[1] || "";
        resolve(base64);
      };

      reader.onerror = function () {
        reject(new Error("base64変換に失敗しました"));
      };

      reader.readAsDataURL(fileOrBlob);
    });
  }

  async function resizeImageFile(file, maxWidth = 1200, quality = 0.7) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = function (event) {
        const img = new Image();

        img.onload = function () {
          let width = img.width;
          let height = img.height;

          if (width > maxWidth) {
            height = Math.round(height * (maxWidth / width));
            width = maxWidth;
          }

          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;

          const ctx = canvas.getContext("2d");
          if (!ctx) {
            reject(new Error("画像処理に失敗しました"));
            return;
          }

          ctx.drawImage(img, 0, 0, width, height);

          canvas.toBlob(
            (blob) => {
              if (!blob) {
                reject(new Error("画像圧縮に失敗しました"));
                return;
              }
              resolve(blob);
            },
            "image/jpeg",
            quality
          );
        };

        img.onerror = function () {
          reject(new Error("画像の読み込みに失敗しました"));
        };

        img.src = event.target.result;
      };

      reader.onerror = function () {
        reject(new Error("画像の読み込みに失敗しました"));
      };

      reader.readAsDataURL(file);
    });
  }

  async function prepareCompressedMedicalImage(file) {
    let blob = await resizeImageFile(file, 1200, 0.7);
    let base64 = await fileToBase64(blob);

    if (base64.length > 4000000) {
      blob = await resizeImageFile(file, 1000, 0.6);
      base64 = await fileToBase64(blob);
    }

    if (base64.length > 3000000) {
      blob = await resizeImageFile(file, 800, 0.55);
      base64 = await fileToBase64(blob);
    }

    if (base64.length > 2500000) {
      blob = await resizeImageFile(file, 700, 0.5);
      base64 = await fileToBase64(blob);
    }

    return { blob, base64 };
  }

  async function fetchJson(url, options = {}) {
    const res = await fetch(url, options);
    const text = await res.text();

    try {
      return JSON.parse(text);
    } catch (err) {
      throw new Error(`JSON解析失敗: ${text}`);
    }
  }

  function minutesFromTimeString(timeStr) {
    const normalized = normalizeTime(timeStr);
    const match = normalized.match(/^(\d{2}):(\d{2})$/);
    if (!match) return null;

    const h = Number(match[1]);
    const m = Number(match[2]);
    return h * 60 + m;
  }

  function calcShiftMinutes(dateKey, shift) {
    const state = normalizeText(shift?.state);
    const startStr = normalizeTime(shift?.start);
    const endStr = normalizeTime(shift?.end);

    if (
      isAbsentState(state) ||
      isMedicalSubmittedState(state) ||
      isDeletedOrOffState(state)
    ) {
      return 0;
    }

    if (!startStr || !endStr) return 0;

    const startMinutes = minutesFromTimeString(startStr);
    const endMinutes = minutesFromTimeString(endStr);

    if (startMinutes === null || endMinutes === null) return 0;
    if (endMinutes <= startMinutes) return 0;

    let workedMinutes = endMinutes - startMinutes;

    // 休憩 14:00-15:00 を差し引く
    const breakStart = 14 * 60;
    const breakEnd = 15 * 60;

    const overlapStart = Math.max(startMinutes, breakStart);
    const overlapEnd = Math.min(endMinutes, breakEnd);

    if (overlapEnd > overlapStart) {
      workedMinutes -= overlapEnd - overlapStart;
    }

    return Math.max(0, workedMinutes);
  }

  function calcMonthlyWorkMinutes(targetDate) {
    let totalMinutes = 0;

    const year = targetDate.getFullYear();
    const month = targetDate.getMonth();

    for (const dateKey in shiftData) {
      const d = new Date(dateKey + "T00:00:00");
      if (d.getFullYear() !== year || d.getMonth() !== month) continue;

      const dayShifts = shiftData[dateKey] || [];
      dayShifts.forEach((shift) => {
        totalMinutes += calcShiftMinutes(dateKey, shift);
      });
    }

    return totalMinutes;
  }

  function getDayShifts(dateStr) {
    if (!Array.isArray(shiftData[dateStr])) {
      shiftData[dateStr] = [];
    }
    return shiftData[dateStr];
  }

  function findShiftById(targetShiftId) {
    for (const dateKey in shiftData) {
      const dayShifts = shiftData[dateKey] || [];
      const found = dayShifts.find((s) => s.id === targetShiftId);
      if (found) {
        return {
          date: dateKey,
          shift: found
        };
      }
    }
    return null;
  }

  function rerenderCurrentMonth() {
    generateCalendar(currentDate);
    updateWorktimeDisplay();
  }

  function applyLocalAddShift(dateStr, start, end, serverShiftId = "") {
    const dayShifts = getDayShifts(dateStr);

    const newShift = {
      id: serverShiftId || `local-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      start: normalizeTime(start),
      end: normalizeTime(end),
      state: ""
    };

    dayShifts.push(newShift);

    dayShifts.sort((a, b) => {
      const aStart = minutesFromTimeString(a.start) ?? 9999;
      const bStart = minutesFromTimeString(b.start) ?? 9999;
      return aStart - bStart;
    });

    return newShift;
  }

  function applyLocalUpdateShift(shiftId, dateStr, start, end) {
    const found = findShiftById(shiftId);
    if (!found) return null;

    found.shift.start = normalizeTime(start);
    found.shift.end = normalizeTime(end);
    found.shift.state = "";

    if (found.date !== dateStr) {
      const oldDayShifts = getDayShifts(found.date);
      const idx = oldDayShifts.findIndex((s) => s.id === shiftId);
      if (idx >= 0) {
        const moved = oldDayShifts.splice(idx, 1)[0];
        const newDayShifts = getDayShifts(dateStr);
        newDayShifts.push(moved);
      }
    }

    return found.shift;
  }

  // ===== ★休む日の当日00時判定関数（スマホのタイムゾーンバグ対策済み） =====
  function determineDeleteOrAbsent(dateStr) {
    const [year, month, day] = dateStr.split("-");
    const deadline = new Date(year, month - 1, day, 0, 0, 0);

    const now = new Date();
    // 現在時刻が当日00時より前なら「空白（削除）」、当日00時以降なら「当欠」
    return now < deadline ? "deleted" : "当欠";
  }

  // ===== ★ カレンダーの表記を更新する処理 =====
  function applyLocalDeleteOrAbsent(shiftId, actionType) {
    const found = findShiftById(shiftId);
    if (!found) return null;

    if (actionType === "deleted") {
      // 削除（空白）にする：配列から消去
      const dayShifts = getDayShifts(found.date);
      const idx = dayShifts.findIndex((s) => s.id === shiftId);
      if (idx >= 0) {
        dayShifts.splice(idx, 1);
      }
      return null;
    } else {
      // 当欠にする
      found.shift.state = "当欠";
      found.shift.start = "";
      found.shift.end = "";
      return found.shift;
    }
  }

  function applyLocalMedicalSubmitted(shiftId) {
    const found = findShiftById(shiftId);
    if (!found) return null;

    found.shift.state = "診断書提出済み";
    found.shift.start = "";
    found.shift.end = "";

    return found.shift;
  }

  async function reloadShifts() {
    const profile = await liff.getProfile();
    const idToken = liff.getIDToken();

    if (!idToken) throw new Error("認証トークンが取得できませんでした。再読み込みしてください。");

    const url =
      GAS_URL +
      "?action=fetch" +
      "&userId=" + encodeURIComponent(profile.userId) +
      "&name=" + encodeURIComponent(profile.displayName) +
      "&idToken=" + encodeURIComponent(idToken) +
      "&t=" + Date.now();

    const data = await fetchJson(url);

    if (!data.success) {
      let errorText = data.message || "";
      
      if (!errorText && data.anycrossRaw) {
        try {
          const rawParsed = JSON.parse(data.anycrossRaw);
          errorText = rawParsed.message || rawParsed.body?.message || data.anycrossRaw;
        } catch (e) {
          errorText = data.anycrossRaw;
        }
      }
      
      if (!errorText) errorText = "シフト取得に失敗しました";
      
      if (errorText.includes("セッション切れ") || errorText.includes("認証エラー")) {
        console.error("Security Session Expired");
        liff.logout();
        liff.login();
        return;
      }
      
      throw new Error(errorText);
    }

    shiftData = data.shifts || {};
    fetchedName = data.name || "";

    if (userNameSpan) {
      userNameSpan.textContent = fetchedName;
    }

    if (summaryDiv) {
      summaryDiv.style.display = "block";
    }

    updateWorktimeDisplay();

    monthNavDiv.style.display = "flex";
    generateCalendar(currentDate);
  }

  function updateDetailActionButtons(shift) {
    if (detailMode === "add") {
      if (btnEdit) btnEdit.style.display = "none";
      if (btnDelete) btnDelete.style.display = "none";
      if (btnMedical) btnMedical.style.display = "none";
      return;
    }

    const state = normalizeText(shift?.state);
    let canEditBase = hasEditableShiftTime(shift);

    // === ★追加：15日の0時を過ぎたら、15〜22日のシフト変更・削除をロックする ===
    const targetDateObj = new Date(selectedDateStr + "T00:00:00");
    const tYear = targetDateObj.getFullYear();
    const tMonth = targetDateObj.getMonth();
    const tDate = targetDateObj.getDate();
    const now = new Date();

    // そのシフトがある月の「15日の0時」をデッドラインとする
    const lockDeadline = new Date(tYear, tMonth, 15, 0, 0, 0);
    // 今が締め切りを過ぎていて、かつシフトの日付が15〜22日なら編集不可
    if (now >= lockDeadline && tDate >= 15 && tDate <= 22) {
      canEditBase = false;
    }
    // === ★ここまで ===

    const showEdit = canEditBase && isTodayOrFuture(selectedDateStr);
    const showDelete = canEditBase && isTodayOrFuture(selectedDateStr);

    // === ★変更：当欠の場合のみ診断書提出ボタンを表示する ===
    const showMedical = isAbsentState(state);
    // === ★ここまで ===

    if (btnEdit) {
      btnEdit.style.display = showEdit ? "inline-block" : "none";
    }

    if (btnDelete) {
      btnDelete.style.display = showDelete ? "inline-block" : "none";
    }

    if (btnMedical) {
      btnMedical.style.display = showMedical ? "inline-block" : "none";
    }

    if (!showEdit) {
      if (editArea) {
        editArea.style.display = "none";
      }
      if (editError) {
        editError.textContent = "";
      }
    }

    if (!showMedical) {
      resetMedicalArea();
    }
  }

  function generateTimeOptionsForMode(mode) {
    startSelect.innerHTML = "";
    endSelect.innerHTML = "";

    const startRules = {
      12: ["00", "15", "30", "45"],
      13: ["00", "15", "30", "45"],
      15: ["00", "15", "30", "45"],
      16: ["00", "15", "30"],
      17: ["00", "15", "30", "45"],
      18: ["00", "15", "30"],
      19: ["00", "15", "30", "45"],
      20: ["00", "15", "30", "45"]
    };

    const endRules = {
      12: ["15", "30", "45"],
      13: ["00", "15", "30", "45"],
      14: ["00"],
      15: ["15", "30", "45"],
      16: ["00", "15", "30", "45"],
      17: ["00", "15", "30", "45"],
      18: ["00", "15", "30", "45"],
      19: ["00", "15", "30", "45"],
      20: ["00", "15", "30", "45"],
      21: ["00"]
    };

    const now = new Date();

    let restrictEarlyLeave = false;
    let preventEndChange = false;

    if (mode === "view" && originalStart && originalEnd) {
      const targetDate = new Date(selectedDateStr + "T00:00:00");
      
      const isToday = 
        targetDate.getFullYear() === now.getFullYear() &&
        targetDate.getMonth() === now.getMonth() &&
        targetDate.getDate() === now.getDate();

      if (isToday) {
        const startDt = new Date(`${selectedDateStr}T${originalStart}:00`);
        // 今の時間が、すでに出勤時間を過ぎているか（早退防止）
        if (now > startDt) {
          restrictEarlyLeave = true;
        }
      }

      const originalEndDt = new Date(`${selectedDateStr}T${originalEnd}:00`);
      // 今の時間が、元の退勤時間を過ぎているか（事後変更防止）
      if (now >= originalEndDt) {
        preventEndChange = true;
      }
    }

    if (mode === "view") {
      const defaultStart = document.createElement("option");
      defaultStart.value = originalStart;
      defaultStart.textContent = "変更なし";
      defaultStart.selected = true;
      startSelect.appendChild(defaultStart);

      const defaultEnd = document.createElement("option");
      defaultEnd.value = originalEnd;
      defaultEnd.textContent = "変更なし";
      defaultEnd.selected = true;
      endSelect.appendChild(defaultEnd);
    } else {
      const defaultStart = document.createElement("option");
      defaultStart.value = "";
      defaultStart.textContent = "選択してください";
      defaultStart.selected = true;
      startSelect.appendChild(defaultStart);

      const defaultEnd = document.createElement("option");
      defaultEnd.value = "";
      defaultEnd.textContent = "選択してください";
      defaultEnd.selected = true;
      endSelect.appendChild(defaultEnd);
    }

    // 出勤時間のプルダウン生成
    for (const h in startRules) {
      for (const m of startRules[h]) {
        const time = `${String(h).padStart(2, "0")}:${m}`;
        const dt = new Date(`${selectedDateStr}T${time}:00`);
        if (dt < now) continue;

        const opt = document.createElement("option");
        opt.value = time;
        opt.textContent = time;
        startSelect.appendChild(opt);
      }
    }

    // 退勤時間のプルダウン生成
    if (!preventEndChange) {
      for (const h in endRules) {
        for (const m of endRules[h]) {
          const time = `${String(h).padStart(2, "0")}:${m}`;
          const dt = new Date(`${selectedDateStr}T${time}:00`);
          
          // 過去の時間はスキップ
          if (dt < now) continue;

          // 早退防止（元の退勤時間より前の時間を非表示）
          if (restrictEarlyLeave && originalEnd) {
            const originalEndDt = new Date(`${selectedDateStr}T${originalEnd}:00`);
            if (dt < originalEndDt) {
              continue;
            }
          }

          const opt = document.createElement("option");
          opt.value = time;
          opt.textContent = time;
          endSelect.appendChild(opt);
        }
      }
    }
  }

  function openDetail(date, shift) {
    calendarView.style.display = "none";
    detailView.style.display = "block";

    detailMode = "view";
    selectedDateStr = date;
    selectedShiftId = shift.id || "";
    originalStart = normalizeTime(shift.start);
    originalEnd = normalizeTime(shift.end);
    originalState = normalizeText(shift.state);

    detailDate.textContent = formatDateJP(date);
    detailShift.textContent = getShiftDisplayText(shift) || "表示できる情報がありません";

    editArea.style.display = "none";
    editError.textContent = "";
    resetMedicalArea();
    updateDetailActionButtons(shift);
  }

  function openAddDetail(dateStr) {
    calendarView.style.display = "none";
    detailView.style.display = "block";

    detailMode = "add";
    selectedDateStr = dateStr;
    selectedShiftId = "";
    originalStart = "";
    originalEnd = "";
    originalState = "";

    detailDate.textContent = formatDateJP(dateStr);
    detailShift.textContent = "新規シフトを追加します";

    if (btnEdit) btnEdit.style.display = "none";
    if (btnDelete) btnDelete.style.display = "none";
    if (btnMedical) btnMedical.style.display = "none";

    resetMedicalArea();
    editError.textContent = "";
    editArea.style.display = "grid";
    generateTimeOptionsForMode("add");
  }

  if (backButton) {
    backButton.addEventListener("click", () => {
      detailView.style.display = "none";
      calendarView.style.display = "block";
      resetDetailState();
    });
  }

  // =====================
  // 時間変更ボタン
  // =====================
  if (btnEdit) {
    btnEdit.addEventListener("click", () => {
      const dummyShift = {
        start: originalStart,
        end: originalEnd,
        state: originalState
      };

      if (!hasEditableShiftTime(dummyShift) || !isTodayOrFuture(selectedDateStr)) {
        editArea.style.display = "none";
        editError.textContent = "";
        return;
      }

      resetMedicalArea();

      detailMode = "view";
      editArea.style.display = "grid";
      editError.textContent = "";
      generateTimeOptionsForMode("view");
    });
  }

  // =====================
  // 保存（時間変更 / 新規追加 共通）
  // =====================
  if (saveEdit) {
    saveEdit.addEventListener("click", async () => {
      editError.textContent = "";

      // === ★追加：保存ボタンを押した瞬間のロックチェック ===
      if (isLockedPeriod(selectedDateStr)) {
        editError.textContent = "15日を過ぎたため、15日〜22日のシフトは変更・追加できません。";
        return; // ここで処理を強制終了する
      }

      if (detailMode === "add") {
        const start = normalizeTime(startSelect.value);
        const end = normalizeTime(endSelect.value);

        if (!start || !end) {
          editError.textContent = "出勤時間と退勤時間を選択してください";
          return;
        }

        const now = new Date();
        const startDt = new Date(`${selectedDateStr}T${start}:00`);
        const endDt = new Date(`${selectedDateStr}T${end}:00`);

        if (startDt < now) {
          editError.textContent = "出勤時間は過去に設定できません。公式LINEに相談してください";
          return;
        }

        if (endDt < now) {
          editError.textContent = "退勤時間は過去に設定できません。公式LINEに相談してください";
          return;
        }

        if (startDt >= endDt) {
          editError.textContent = "時間の設定が不正です。公式LINEに相談してください";
          return;
        }

        if (!confirm("この内容でシフト追加してもよろしいですか？")) {
          return;
        }

        try {
          setButtonsDisabled(true);
          resultDiv.textContent = "追加処理中…";
          resultDiv.classList.add("teisyututyu");

          const profile = await liff.getProfile();
          const idToken = liff.getIDToken(); 

          const url =
            GAS_URL +
            "?action=addShift" +
            "&userId=" + encodeURIComponent(profile.userId) +
            "&name=" + encodeURIComponent(profile.displayName) +
            "&idToken=" + encodeURIComponent(idToken) + 
            "&date=" + encodeURIComponent(selectedDateStr) +
            "&start=" + encodeURIComponent(start) +
            "&end=" + encodeURIComponent(end);

          const data = await fetchJson(url);

          if (!data.success) {
            editError.textContent = data.message || "シフト追加に失敗しました";
            resultDiv.textContent = "";
            return;
          }

          applyLocalAddShift(selectedDateStr, start, end, data.shiftId || "");
          rerenderCurrentMonth();

          alert(data.message || "シフト追加が完了しました");

          detailView.style.display = "none";
          calendarView.style.display = "block";
          resetDetailState();
          resultDiv.textContent = "";
        } catch (err) {
          console.error(err);
          editError.textContent = "追加中にエラーが発生しました";
          resultDiv.textContent = "";
        } finally {
          setButtonsDisabled(false);
          resultDiv.classList.remove("teisyututyu");
        }

        return;
      }

      const start = normalizeTime(startSelect.value);
      const end = normalizeTime(endSelect.value);

      const newStart = start === originalStart ? originalStart : start;
      const newEnd = end === originalEnd ? originalEnd : end;

      const now = new Date();
      const startDt = new Date(`${selectedDateStr}T${newStart}:00`);
      const endDt = new Date(`${selectedDateStr}T${newEnd}:00`);
      const originalEndDt = new Date(`${selectedDateStr}T${originalEnd}:00`);

      const startChanged = newStart !== originalStart;
      const endChanged = newEnd !== originalEnd;

      if (startChanged && startDt < now) {
        editError.textContent = "出勤時間は過去に設定できません。公式LINEに相談してください";
        return;
      }

      if (endChanged && (endDt < now || originalEndDt < now)) {
        editError.textContent = "退勤時間は変更できません。公式LINEに相談してください";
        return;
      }

      if (endChanged && now >= originalEndDt) {
        editError.textContent = "本来の退勤時間を過ぎてからの時間変更（事後延長）はできません。公式LINEに相談してください";
        return;
      }

      if (startDt >= endDt) {
        editError.textContent = "時間の設定が不正です。公式LINEに相談してください";
        return;
      }

      if (!confirm("このシフト変更を保存してもよろしいですか？")) {
        return;
      }

      try {
        setButtonsDisabled(true);
        resultDiv.textContent = "保存中…";
        resultDiv.classList.add("teisyututyu");

        const profile = await liff.getProfile();
        const idToken = liff.getIDToken(); 

        const url =
          GAS_URL +
          "?action=update" +
          "&userId=" + encodeURIComponent(profile.userId) +
          "&idToken=" + encodeURIComponent(idToken) + 
          "&shiftId=" + encodeURIComponent(selectedShiftId) +
          "&date=" + encodeURIComponent(selectedDateStr) +
          "&start=" + encodeURIComponent(newStart) +
          "&end=" + encodeURIComponent(newEnd);

        const data = await fetchJson(url);

        if (!data.success) {
          editError.textContent = data.message || "時間変更に失敗しました";
          resultDiv.textContent = "";
          return;
        }

        applyLocalUpdateShift(selectedShiftId, selectedDateStr, newStart, newEnd);
        rerenderCurrentMonth();

        editArea.style.display = "none";
        alert(data.message || "シフトを保存しました");

        resultDiv.textContent = "";
        detailView.style.display = "none";
        calendarView.style.display = "block";
        resetDetailState();
      } catch (err) {
        console.error(err);
        editError.textContent = "保存中にエラーが発生しました";
        resultDiv.textContent = "";
      } finally {
        setButtonsDisabled(false);
        resultDiv.classList.remove("teisyututyu");
      }
    });
  }

  // =====================
  // 休み / 削除
  // =====================
  if (btnDelete) {
    btnDelete.addEventListener("click", async () => {
      const dummyShift = {
        start: originalStart,
        end: originalEnd,
        state: originalState
      };

      if (!hasEditableShiftTime(dummyShift) || !isTodayOrFuture(selectedDateStr)) {
        return;
      }

      // === ★追加：削除ボタンを押した瞬間のロックチェック ===
      if (isLockedPeriod(selectedDateStr)) {
        alert("15日を過ぎたため、15日〜22日のシフトは操作できません。");
        return; // ここで処理を強制終了する
      }
      // === ★ここまで ===

      const actionType = determineDeleteOrAbsent(selectedDateStr);

      const msg = actionType === "deleted"
        ? `下記シフトを削除（空白）にします。\n\n${formatDateJP(selectedDateStr)}\n${originalStart}-${originalEnd}\n\nよろしいですか？`
        : `当日00時以降の申請のため、「当欠」となります。\n\n${formatDateJP(selectedDateStr)}\n${originalStart}-${originalEnd}\n\nよろしいですか？`;

      if (!confirm(msg)) {
        return;
      }

      try {
        setButtonsDisabled(true);
        resultDiv.textContent = "処理中…";
        resultDiv.classList.add("teisyututyu");
        editError.textContent = "";

        const profile = await liff.getProfile();
        const idToken = liff.getIDToken(); 

        const url =
          GAS_URL +
          "?action=deleteOrAbsent" +
          "&userId=" + encodeURIComponent(profile.userId) +
          "&name=" + encodeURIComponent(profile.displayName) +
          "&idToken=" + encodeURIComponent(idToken) + 
          "&shiftId=" + encodeURIComponent(selectedShiftId) +
          "&date=" + encodeURIComponent(selectedDateStr) +
          "&start=" + encodeURIComponent(originalStart) +
          "&end=" + encodeURIComponent(originalEnd) +
          "&actionType=" + encodeURIComponent(actionType);

        const data = await fetchJson(url);

        if (!data.success) {
          alert(data.message || "休み / 削除処理に失敗しました");
          resultDiv.textContent = "";
          return;
        }

        applyLocalDeleteOrAbsent(selectedShiftId, actionType);
        rerenderCurrentMonth();

        detailView.style.display = "none";
        calendarView.style.display = "block";
        resultDiv.textContent = "";
        resetDetailState();

        alert(data.message || "処理が完了しました");
      } catch (err) {
        console.error(err);
        resultDiv.textContent = "";
        alert("休み / 削除処理中にエラーが発生しました");
      } finally {
        setButtonsDisabled(false);
        resultDiv.classList.remove("teisyututyu");
      }
    });
  }

  // =====================
  // 診断書提出エリアを開閉
  // =====================
  if (btnMedical) {
    btnMedical.addEventListener("click", () => {
      // === ★変更：当欠の場合のみ開けるようにする ===
      const canOpenMedical = isAbsentState(originalState);

      if (!canOpenMedical) {
        resetMedicalArea();
        return;
      }

      if (!medicalArea) return;

      if (editArea) {
        editArea.style.display = "none";
        editError.textContent = "";
      }

      const isOpen = medicalArea.style.display === "block";
      medicalArea.style.display = isOpen ? "none" : "block";
      medicalError.textContent = "";
    });
  }

  // =====================
  // 診断書画像選択
  // =====================
  if (medicalFile) {
    medicalFile.addEventListener("change", async (e) => {
      try {
        medicalError.textContent = "";

        const file = e.target.files && e.target.files[0];

        if (!file) {
          medicalFileObj = null;
          medicalImageBase64 = "";
          clearMedicalPreviewUrl();
          if (medicalPreview) medicalPreview.src = "";
          if (medicalPreviewWrap) medicalPreviewWrap.style.display = "none";
          return;
        }

        if (!file.type.startsWith("image/")) {
          medicalError.textContent = "画像ファイルを選択してください";
          medicalFile.value = "";
          medicalFileObj = null;
          medicalImageBase64 = "";
          clearMedicalPreviewUrl();
          if (medicalPreview) medicalPreview.src = "";
          if (medicalPreviewWrap) medicalPreviewWrap.style.display = "none";
          return;
        }

        resultDiv.textContent = "画像を調整中…";

        const { blob, base64 } = await prepareCompressedMedicalImage(file);

        if (!base64) {
          throw new Error("画像データの作成に失敗しました");
        }

        if (base64.length > 4500000) {
          medicalError.textContent =
            "画像サイズが大きすぎます。もう少し小さい画像で試してください。";
          resultDiv.textContent = "";
          medicalFile.value = "";
          medicalFileObj = null;
          medicalImageBase64 = "";
          clearMedicalPreviewUrl();
          if (medicalPreview) medicalPreview.src = "";
          if (medicalPreviewWrap) medicalPreviewWrap.style.display = "none";
          return;
        }

        medicalFileObj = new File([blob], "medical.jpg", {
          type: "image/jpeg"
        });
        medicalImageBase64 = base64;

        clearMedicalPreviewUrl();
        medicalPreviewObjectUrl = URL.createObjectURL(blob);

        if (medicalPreview) {
          medicalPreview.src = medicalPreviewObjectUrl;
        }
        if (medicalPreviewWrap) {
          medicalPreviewWrap.style.display = "block";
        }

        resultDiv.textContent = "";
      } catch (err) {
        console.error(err);
        resultDiv.textContent = "";
        medicalError.textContent = "画像の読み込みに失敗しました";
      }
    });
  }

  // =====================
  // 診断書提出
  // =====================
  if (submitMedical) {
    submitMedical.addEventListener("click", async () => {
      medicalError.textContent = "";

      if (!medicalFileObj || !medicalImageBase64) {
        medicalError.textContent = "診断書の写真をアップロードしてください";
        return;
      }

      if (medicalImageBase64.length > 4500000) {
        medicalError.textContent =
          "画像サイズが大きすぎます。もう少し小さい画像で試してください。";
        return;
      }

      const confirmMsg =
        "名前漢字フルネームと、日付が書いていますか？\n\n" +
        "問題なければ、この内容で提出します。";

      if (!confirm(confirmMsg)) {
        return;
      }

      setButtonsDisabled(true);
      resultDiv.textContent = "提出中…";
      resultDiv.classList.add("teisyututyu");

      try {
        const profile = await liff.getProfile();
        const idToken = liff.getIDToken();

        const formBody = new URLSearchParams({
          action: "submitMedical",
          userId: profile.userId,
          name: profile.displayName,
          idToken: idToken,
          shiftId: selectedShiftId,
          date: selectedDateStr,
          start: originalStart,
          end: originalEnd,
          fileName: medicalFileObj.name,
          mimeType: medicalFileObj.type,
          imageBase64: medicalImageBase64
        });

        const data = await fetchJson(GAS_URL, {
          method: "POST",
          body: formBody
        });

        if (!data.success) {
          medicalError.textContent = data.message || "診断書の提出に失敗しました";
          resultDiv.textContent = "";
          return;
        }

        applyLocalMedicalSubmitted(selectedShiftId);
        rerenderCurrentMonth();

        alert(
          data.message ||
            "診断書の提出が完了しました。\n提出された画像は目視で確認をしています。ルールに反する場合はいかなる場合も当日欠勤に戻ります。"
        );
      } catch (err) {
        console.error("submitMedical送信エラー:", err);
        resultDiv.textContent = "";
        medicalError.textContent =
          "診断書の提出に失敗しました: " + (err.message || err);
        return;
      } finally {
        resultDiv.textContent = "";
        resetMedicalArea();
        detailView.style.display = "none";
        calendarView.style.display = "block";
        resetDetailState();
        setButtonsDisabled(false);
        resultDiv.classList.remove("teisyututyu");
      }
    });
  }

  // =====================
  // 月移動
  // =====================
  if (prevMonthBtn) {
    prevMonthBtn.addEventListener("click", () => {
      currentDate.setMonth(currentDate.getMonth() - 1);
      generateCalendar(currentDate);
      updateWorktimeDisplay();
    });
  }

  if (nextMonthBtn) {
    nextMonthBtn.addEventListener("click", () => {
      currentDate.setMonth(currentDate.getMonth() + 1);
      generateCalendar(currentDate);
      updateWorktimeDisplay();
    });
  }

  // =====================
  // LIFF初期化と自動取得
  // =====================
  try {
    // 1. LIFFの初期化
    await liff.init({ liffId: "2009569390-ToBfmkCN" });

    // 2. ログインチェック
    if (!liff.isLoggedIn()) {
      resultDiv.innerHTML = "LINEログインへ移動します…";
      liff.login({ redirectUri: window.location.origin + window.location.pathname });
      return;
    }

    // 3. IDトークンの取得確認
    const idToken = liff.getIDToken();
    if (!idToken) {
      console.warn("ID Token is missing. Re-logging in...");
      liff.login();
      return;
    }

    // 4. データ取得開始
    try {
      setButtonsDisabled(true);
      resultDiv.textContent = "更新中...";
      resultDiv.classList.add("kousintyu");
      
      await loadHolidays();
      await reloadShifts();
      
      // 5. データ取得成功後にURLを綺麗にする
      const url = new URL(window.location.href);
      if (url.searchParams.has('code') || url.searchParams.has('state')) {
        window.history.replaceState(null, null, window.location.pathname);
      }
      
      resultDiv.textContent = "";
    } catch (err) {
      console.log("★ERR:", JSON.stringify(err.message));
      console.log("★INCLUDES登録:", String(err.message).includes("登録"));
      console.error("Fetch Error:", err);
      
      const calView = document.getElementById("calendarView");
      if (calView) calView.style.display = "none";

      resultDiv.innerHTML = "";

      if (err.message && err.message.includes("登録")) {
        const wrap = document.createElement("div");
        wrap.style.cssText = "text-align: center; margin-top: 30px; padding: 0 20px;";

        const msg1 = document.createElement("p");
        msg1.style.cssText = "color: #ff4d8d; font-size: 16px; font-weight: bold; margin-bottom: 15px;";
        msg1.textContent = err.message;

        const msg2 = document.createElement("p");
        msg2.style.cssText = "font-size: 12px; color: #555; margin-bottom: 25px;";
        msg2.textContent = "※登録完了後、再度メニューからこの画面を開き直してください。";

        const btn = document.createElement("button");
        btn.id = "go-register-btn";
        btn.style.cssText = "display: inline-block !important; padding: 14px 20px !important; background-color: #06C755 !important; color: #ffffff !important; border: none !important; border-radius: 8px !important; font-size: 15px !important; font-weight: bold !important; cursor: pointer !important; width: 80% !important; max-width: 300px !important; box-shadow: 0 4px 6px rgba(0,0,0,0.1) !important; visibility: visible !important; opacity: 1 !important;";
        btn.textContent = "登録画面へ進む";

        btn.addEventListener("click", () => {
          liff.openWindow({
            url: "https://liff.line.me/2009827198-qvnHhjxl",
            external: false
          });
        });

        wrap.appendChild(msg1);
        wrap.appendChild(msg2);
        wrap.appendChild(btn);
        resultDiv.appendChild(wrap);

      } else {
        resultDiv.innerHTML = `
          <div style="text-align: center; margin-top: 30px; padding: 0 20px;">
            <p style="color: #ff4d8d; font-weight: bold; margin-bottom: 15px;">
              取得エラーが発生しました<br>
              <span style="font-size: 14px; font-weight: normal; color: #333;">${err.message}</span>
            </p>
            <p style="font-size: 12px; margin-bottom: 15px; color: #666;">
              時間をおいて再度お試しいただくか、管理者へお問い合わせください。
            </p>
          </div>
        `;
      }
      
    } finally {
      resultDiv.classList.remove("kousintyu");
      if (!document.getElementById("go-register-btn")) {
        setButtonsDisabled(false);
      } else {
        setButtonsDisabled(false);
      }
    }

  } catch (err) {
    console.error("LIFF Init Error:", err);
    resultDiv.textContent = "LIFF初期化エラー: " + err.message;
  }

  // =====================
  // カレンダー生成
  // =====================
  function generateCalendar(date) {
    calendarDiv.innerHTML = "";

    const weekHeader = document.createElement("div");
    weekHeader.className = "week-header";

    const weekList = ["日", "月", "火", "水", "木", "金", "土"];

    weekList.forEach((w, index) => {
      const cell = document.createElement("div");
      cell.className = "week-cell";
      cell.textContent = w;

      if (index === 0) cell.style.color = "#ff4d8d";
      if (index === 6) cell.style.color = "#01b6ff";

      weekHeader.appendChild(cell);
    });

    calendarDiv.appendChild(weekHeader);

    const year = date.getFullYear();
    const month = date.getMonth();

    currentMonthSpan.textContent = `${year}年 ${month + 1}月`;

    const now = new Date();
    const diffMonths = (year - now.getFullYear()) * 12 + (month - now.getMonth());

    if (prevMonthBtn) {
      prevMonthBtn.disabled = diffMonths <= -1;
      prevMonthBtn.style.opacity = diffMonths <= -1 ? "0.3" : "1";
    }
    if (nextMonthBtn) {
      nextMonthBtn.disabled = diffMonths >= 1;
      nextMonthBtn.style.opacity = diffMonths >= 1 ? "0.3" : "1";
    }

    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startDay = firstDay.getDay();

    for (let i = 0; i < startDay; i++) {
      const emptyDiv = document.createElement("div");
      emptyDiv.className = "day";
      calendarDiv.appendChild(emptyDiv);
    }

    for (let day = 1; day <= lastDay.getDate(); day++) {
      const fullDateStr =
        `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

      const dayDiv = document.createElement("div");
      dayDiv.className = "day";

      const dateSpan = document.createElement("span");
      dateSpan.className = "date";
      dateSpan.textContent = day;

      const dayOfWeek = new Date(year, month, day).getDay();
      
      // === ★追加：15日〜22日のシフト追加（+ボタン）もロックする ===
      const lockDeadlineCalendar = new Date(year, month, 15, 0, 0, 0);
      const isLocked = now >= lockDeadlineCalendar && day >= 15 && day <= 22;
      // ==========================================================

      if (nationalHolidays[fullDateStr]) {
        dateSpan.style.color = "#ff4d8d"; // 祝日
      } else if (dayOfWeek === 0) {
        dateSpan.style.color = "#ff4d8d"; // 日曜日
      } else if (dayOfWeek === 6) {
        dateSpan.style.color = "#01b6ff"; // 土曜日
      }

      dayDiv.appendChild(dateSpan);

      const dayShifts = shiftData[fullDateStr] || [];
      const hasShift = hasVisibleShiftOnDay(dayShifts) || hasAnyShiftRecordOnDay(dayShifts);

      // ロック期間中(!isLocked)は + ボタンを出さない
      if (!hasShift && isTodayOrFuture(fullDateStr) && !isLocked) {
        const addBtn = document.createElement("button");
        addBtn.type = "button";
        addBtn.className = "add-shift-button";
        addBtn.textContent = "+";
        addBtn.style.display = "block";

        addBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          openAddDetail(fullDateStr);
        });

        dayDiv.appendChild(addBtn);
      }

      dayShifts.forEach((shift) => {
        const displayText = getShiftDisplayText(shift);
        if (!displayText) return;

        const shiftSpan = document.createElement("div");
        shiftSpan.className = "shift-time";
        shiftSpan.textContent = displayText;

        const state = normalizeText(shift.state);
        if (isAbsentState(state)) {
          shiftSpan.classList.add("state-absent");
        } else if (isMedicalSubmittedState(state)) {
          shiftSpan.classList.add("state-medical");
        }

        shiftSpan.addEventListener("click", (e) => {
          e.stopPropagation();
          openDetail(fullDateStr, shift);
        });

        dayDiv.appendChild(shiftSpan);
      });

      calendarDiv.appendChild(dayDiv);
    }
  }
};