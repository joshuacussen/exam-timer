// ─── State ────────────────────────────────────────────────────────────────────
const state = {
    startTime:          undefined,
    endTime:            undefined,
    extraEndTime:       undefined,
    extraTimeEnabled:   false,
    startTimeFlag:      false,
    endTimeFinFlag:     false,
    extraEndTimeFinFlag: false,
    timerRunning:       false,
    duration:           null,
};

let shiftHeld = false;

// ─── Time helpers ─────────────────────────────────────────────────────────────
function getCurrentTime() {
    return new Date();
}

function addMinutes(date, minutes) {
    return new Date(date.getTime() + minutes * 60000);
}

function padWithLeadingZero(i) {
    return i < 10 ? '0' + i : i;
}

function timeToStr(time) {
    return [time.getHours(), time.getMinutes(), time.getSeconds()]
        .map(padWithLeadingZero)
        .join(':');
}

function calculateNextNearestMinute(date) {
    const coefficient = 1000 * 60;
    return new Date(Math.ceil(date.getTime() / coefficient) * coefficient);
}

// ─── localStorage ─────────────────────────────────────────────────────────────
const STORAGE_KEYS = {
    duration:    'examTimer_duration',
    timerState:  'examTimer_state',
};

function saveDuration(duration) {
    localStorage.setItem(STORAGE_KEYS.duration, duration);
}

function loadDuration() {
    return localStorage.getItem(STORAGE_KEYS.duration) || '60';
}

function saveTimerState() {
    localStorage.setItem(STORAGE_KEYS.timerState, JSON.stringify({
        startTime:        state.startTime?.getTime(),
        endTime:          state.endTime?.getTime(),
        extraEndTime:     state.extraEndTime?.getTime(),
        extraTimeEnabled: state.extraTimeEnabled,
        duration:         state.duration,
    }));
}

function clearTimerState() {
    localStorage.removeItem(STORAGE_KEYS.timerState);
}

// ─── Audio ────────────────────────────────────────────────────────────────────
// 1 chime = start, 2 = normal end, 3 = extra time end
const CHIME_FREQS = {
    1: [523],           // C5
    2: [523, 659],      // C5 → E5
    3: [523, 659, 784], // C5 → E5 → G5
};

function playChime(count) {
    try {
        const ctx   = new (window.AudioContext || window.webkitAudioContext)();
        const freqs = CHIME_FREQS[count] || CHIME_FREQS[1];
        freqs.forEach((freq, i) => {
            const osc  = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.type           = 'sine';
            osc.frequency.value = freq;
            const t = ctx.currentTime + i * 0.22;
            gain.gain.setValueAtTime(0, t);
            gain.gain.linearRampToValueAtTime(0.35, t + 0.04);
            gain.gain.exponentialRampToValueAtTime(0.001, t + 0.55);
            osc.start(t);
            osc.stop(t + 0.6);
        });
    } catch (e) {}
}

// ─── DOM helpers ──────────────────────────────────────────────────────────────
function setTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
}

function checkExtraTime() {
    return document.getElementById('extraTimeToggle').checked;
}

// Fade out a time value, swap its text, then fade back in
function fadeInValue(id, text) {
    const el = document.getElementById(id);
    el.classList.add('blank');
    setTimeout(() => {
        el.textContent = text;
        el.classList.remove('blank');
    }, 200);
}

function clearTimesAndStatuses() {
    ['startTime', 'endTime', 'extraEndTime'].forEach(id =>
        document.getElementById(id).classList.add('blank')
    );
    ['endTimeStatus', 'extraEndTimeStatus'].forEach(id =>
        document.getElementById(id).classList.remove('visible')
    );
}

function showFinStatus(id) {
    const el = document.getElementById(id);
    el.textContent = 'Fin';
    el.classList.add('visible');
}

function hideExtraTimeInfo(instant = false) {
    ['extraTimeInfo', 'extraTimeDivider'].forEach(id => {
        const el = document.getElementById(id);
        if (instant) {
            el.style.display = 'none';
        } else {
            el.classList.add('fading');
            el.classList.remove('fading-in');
            setTimeout(() => {
                el.classList.remove('fading');
                el.style.display = 'none';
            }, 500);
        }
    });
}

function showExtraTimeInfo() {
    ['extraTimeInfo', 'extraTimeDivider'].forEach(id => {
        const el = document.getElementById(id);
        el.style.display = id === 'extraTimeDivider' ? 'block' : 'flex';
        el.classList.add('fading');
        el.classList.remove('fading-in');
        void el.offsetWidth; // force reflow so transition fires
        el.classList.add('fading-in');
        setTimeout(() => el.classList.remove('fading', 'fading-in'), 500);
    });
}

function showSettingsMenu() {
    const menu = document.querySelector('.settings');
    menu.style.transform = 'translateY(0)';
    menu.style.opacity   = '1';
}

function setStartButtonVisible(visible) {
    document.getElementById('start').style.display = visible ? '' : 'none';
}

function setApplyButtonVisible(visible) {
    const btn = document.getElementById('applyExtraTime');
    if (!btn) return;
    if (visible) {
        btn.textContent  = checkExtraTime() ? 'Apply extra time' : 'Remove extra time';
        btn.style.display = '';
    } else {
        btn.style.display = 'none';
    }
}

function showWaitingLabel(startTime) {
    const el = document.getElementById('waitingLabel');
    el.textContent = 'Starting at ' + timeToStr(startTime);
    el.classList.add('visible');
}

function hideWaitingLabel() {
    const el = document.getElementById('waitingLabel');
    el.classList.remove('visible');
    el.textContent = '';
}

// ─── Reset ────────────────────────────────────────────────────────────────────
function resetGlobals() {
    state.startTime           = undefined;
    state.endTime             = undefined;
    state.extraEndTime        = undefined;
    state.startTimeFlag       = false;
    state.endTimeFinFlag      = false;
    state.extraEndTimeFinFlag = false;
    state.timerRunning        = false;
}

function resetClock(event) {
    event.preventDefault();
    setTheme('light');
    hideExtraTimeInfo(true);
    clearTimesAndStatuses();
    resetGlobals();
    clearTimerState();
    setApplyButtonVisible(false);
    setStartButtonVisible(true);
    hideWaitingLabel();
}

// ─── Timer events ─────────────────────────────────────────────────────────────
function startTimeStatusSwitch() {
    setTheme('dark');
    state.startTimeFlag = true;
    hideWaitingLabel();
    playChime(1);
}

function endTimeStatusSwitch() {
    showFinStatus('endTimeStatus');
    state.endTimeFinFlag = true;
    if (state.extraTimeEnabled) {
        setTheme('extra');
    } else {
        setTheme('light');
        clearTimerState();
    }
    playChime(2);
}

function extraEndTimeStatusSwitch() {
    showFinStatus('extraEndTimeStatus');
    state.extraEndTimeFinFlag = true;
    setTheme('light');
    playChime(3);
    clearTimerState();
}

// ─── Clock loop ───────────────────────────────────────────────────────────────
function updateTime() {
    const now = getCurrentTime();

    if (state.startTime && now >= state.startTime && !state.startTimeFlag) {
        startTimeStatusSwitch();
    }

    if (state.endTime && now >= state.endTime && !state.endTimeFinFlag) {
        endTimeStatusSwitch();
        if (!state.extraTimeEnabled) {
            state.timerRunning = false;
            setStartButtonVisible(true);
            showSettingsMenu();
        }
    } else if (state.extraTimeEnabled && state.extraEndTime && now >= state.extraEndTime && !state.extraEndTimeFinFlag) {
        extraEndTimeStatusSwitch();
        state.timerRunning = false;
        setStartButtonVisible(true);
        showSettingsMenu();
    }

    document.getElementById('clock').textContent = timeToStr(now);
    setTimeout(updateTime, 100);
}

// ─── Validation & start ───────────────────────────────────────────────────────
function validateSettings() {
    const duration = document.forms['timerSettings'].duration.value;
    if (!duration || duration <= 0) {
        alert(`Invalid duration: "${duration}"\nDuration must be greater than 0`);
        return false;
    }
    state.duration = duration;
    return true;
}

function startTimer() {
    const extraTimeMultiplier = 1.25;
    state.extraTimeEnabled = checkExtraTime();
    setApplyButtonVisible(false);

    state.startTime    = shiftHeld ? getCurrentTime() : calculateNextNearestMinute(getCurrentTime());
    state.endTime      = addMinutes(state.startTime, state.duration);
    state.extraEndTime = addMinutes(state.startTime, state.duration * extraTimeMultiplier);

    fadeInValue('startTime', timeToStr(state.startTime));
    fadeInValue('endTime',   timeToStr(state.endTime));

    if (state.extraTimeEnabled) {
        showExtraTimeInfo();
        fadeInValue('extraEndTime', timeToStr(state.extraEndTime));
    } else {
        hideExtraTimeInfo();
    }

    state.timerRunning = true;
    setStartButtonVisible(false);
    showWaitingLabel(state.startTime);
    saveDuration(state.duration);
    saveTimerState();
}

function preflightChecks(event) {
    event.preventDefault();
    resetClock(event);
    if (validateSettings()) {
        startTimer();
    }
}

// ─── Extra time toggle (mid-exam) ─────────────────────────────────────────────
function onExtraTimeToggleChange() {
    if (!state.timerRunning || state.endTimeFinFlag) return;
    setApplyButtonVisible(checkExtraTime() !== state.extraTimeEnabled);
}

function applyExtraTimeChange() {
    if (!state.timerRunning || state.endTimeFinFlag) return;
    const enable = checkExtraTime();
    state.extraTimeEnabled = enable;
    if (enable) {
        showExtraTimeInfo();
        fadeInValue('extraEndTime', timeToStr(state.extraEndTime));
        document.getElementById('extraEndTimeStatus').classList.remove('visible');
        state.extraEndTimeFinFlag = false;
    } else {
        hideExtraTimeInfo();
        document.getElementById('extraEndTimeStatus').classList.remove('visible');
        state.extraEndTimeFinFlag = false;
    }
    setApplyButtonVisible(false);
    saveTimerState();
}

// ─── Restore from localStorage ────────────────────────────────────────────────
// Called inside DOMContentLoaded — DOM is guaranteed ready.
function restoreTimerState() {
    const raw = localStorage.getItem(STORAGE_KEYS.timerState);
    if (!raw) return false;

    let saved;
    try { saved = JSON.parse(raw); }
    catch { clearTimerState(); return false; }

    const now          = getCurrentTime();
    const startTime    = new Date(saved.startTime);
    const endTime      = new Date(saved.endTime);
    const extraEndTime = new Date(saved.extraEndTime);
    const finalEndTime = saved.extraTimeEnabled ? extraEndTime : endTime;

    if (now >= finalEndTime) {
        clearTimerState();
        return false;
    }

    // Restore state
    Object.assign(state, {
        startTime,
        endTime,
        extraEndTime,
        extraTimeEnabled:    saved.extraTimeEnabled,
        duration:            saved.duration,
        timerRunning:        true,
        startTimeFlag:       now >= startTime,
        endTimeFinFlag:      now >= endTime,
        extraEndTimeFinFlag: now >= extraEndTime,
    });

    // Restore DOM
    document.forms['timerSettings'].duration.value = saved.duration;
    fadeInValue('startTime', timeToStr(startTime));
    fadeInValue('endTime',   timeToStr(endTime));

    if (now < startTime) showWaitingLabel(startTime);

    if (saved.extraTimeEnabled) {
        showExtraTimeInfo();
        fadeInValue('extraEndTime', timeToStr(extraEndTime));
        if (state.endTimeFinFlag) showFinStatus('endTimeStatus');
    }

    // Restore theme
    if (state.startTimeFlag && !state.endTimeFinFlag) {
        setTheme('dark');
    } else if (state.endTimeFinFlag && saved.extraTimeEnabled && !state.extraEndTimeFinFlag) {
        setTheme('extra');
        showFinStatus('endTimeStatus');
    }

    return true;
}

// ─── DOMContentLoaded ────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    const settingsMenu = document.querySelector('.settings');
    let isSettingsVisible = true;

    // Restore persisted preferences and state
    document.forms['timerSettings'].duration.value = loadDuration();
    if (restoreTimerState()) setStartButtonVisible(false);

    // Form submit (button click or Enter key)
    document.getElementById('timerSettings').addEventListener('submit', preflightChecks);

    // Extra time toggle
    document.getElementById('extraTimeToggle').addEventListener('change', onExtraTimeToggleChange);
    document.getElementById('applyExtraTime').addEventListener('click', applyExtraTimeChange);

    // Shift key for instant start
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Shift') {
            shiftHeld = true;
            document.getElementById('start').classList.add('shift-held');
        }
        if (e.key === 'Escape') {
            settingsMenu.style.transform = 'translateY(0)';
            settingsMenu.style.opacity   = '1';
            isSettingsVisible = true;
        }
    });
    document.addEventListener('keyup', (e) => {
        if (e.key === 'Shift') {
            shiftHeld = false;
            document.getElementById('start').classList.remove('shift-held');
        }
    });

    // Scroll wheel on duration field
    document.getElementById('duration').addEventListener('wheel', (e) => {
        e.preventDefault();
        const current = parseInt(e.currentTarget.value, 10) || 60;
        e.currentTarget.value = Math.max(1, Math.min(600, current + (e.deltaY < 0 ? 1 : -1)));
    }, { passive: false });

    // Auto-hide settings bar while timer is running
    document.addEventListener('mousemove', (e) => {
        if (state.timerRunning) {
            if (e.clientY <= 60 && !isSettingsVisible) {
                settingsMenu.style.transform = 'translateY(0)';
                settingsMenu.style.opacity   = '1';
                isSettingsVisible = true;
            } else if (e.clientY > 60 && isSettingsVisible) {
                settingsMenu.style.transform = 'translateY(-100%)';
                settingsMenu.style.opacity   = '0';
                isSettingsVisible = false;
            }
        } else {
            settingsMenu.style.transform = 'translateY(0)';
            settingsMenu.style.opacity   = '1';
            isSettingsVisible = true;
        }
    });

    // Cursor hide after inactivity
    let inactivityTimeout;
    function hideCursor() { document.body.classList.add('cursor-hidden'); }
    function showCursor()  { document.body.classList.remove('cursor-hidden'); }
    function resetInactivityTimer() {
        showCursor();
        clearTimeout(inactivityTimeout);
        inactivityTimeout = setTimeout(hideCursor, 3000);
    }
    ['mousemove', 'keypress', 'mousedown', 'scroll'].forEach(evt =>
        document.addEventListener(evt, resetInactivityTimer)
    );
    resetInactivityTimer();

    // Fullscreen button
    document.getElementById('fullscreenBtn').addEventListener('click', () => {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen();
        } else {
            document.exitFullscreen();
        }
    });
    document.addEventListener('fullscreenchange', () => {
        document.getElementById('fullscreenBtn').title =
            document.fullscreenElement ? 'Exit fullscreen' : 'Fullscreen';
    });

    // Start clock
    updateTime();
});
