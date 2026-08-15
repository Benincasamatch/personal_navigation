/* ============ 主题切换 ============ */
document.addEventListener("DOMContentLoaded", () => {
    const systemQuery = window.matchMedia("(prefers-color-scheme: dark)");
    // systemQuery.matches === true 表示系统当前是深色
    const toggleButton = document.querySelector("#theme-toggle");
    const profileAvatar = document.querySelector("#profile-avatar");
    const root = document.documentElement;
    const LABELS = { system: "自动", light: "浅色", dark: "深色" };
    let avatarTimer;

    function updateAvatar(isDark, animate = false) {
        const nextSrc = isDark
            ? profileAvatar.dataset.darkSrc
            : profileAvatar.dataset.lightSrc;

        if (!animate) {
            profileAvatar.src = nextSrc;
            return;
        }

        window.clearTimeout(avatarTimer);
        profileAvatar.classList.add("avatar-changing");

        avatarTimer = window.setTimeout(() => {
            profileAvatar.src = nextSrc;
            profileAvatar.classList.remove("avatar-changing");
        }, 180);
    }

    function updateButton(mode) {
        toggleButton.textContent = LABELS[mode];              // 显示"当前"模式
        toggleButton.dataset.themeMode = mode;                // 给 CSS 用
        toggleButton.setAttribute("aria-label", `主题：${LABELS[mode]}，点击切换`);
    }

    /* 根据 localStorage 或系统主题判断当前是否为深色模式 */
    const MODES = ["system", "light", "dark"];

    function getMode() {
        const saved = localStorage.getItem("theme");
        return MODES.includes(saved) ? saved : "system";   // 脏值/null 一律回落 system
    }

    function isDarkFor(mode) {
        if (mode === "dark") return true;
        if (mode === "light") return false;
        return systemQuery.matches;
    }

    function applyMode(mode, animate = false) {
        const dark = isDarkFor(mode);
        root.classList.toggle("dark", dark);
        updateAvatar(dark, animate);
        updateButton(mode);
    }

    /* 加载主题与对应头像 */
    applyMode(getMode());

    /* 切换主题与对应头像 */
    toggleButton.addEventListener("click", () => {
        const nextMode = MODES[(MODES.indexOf(getMode()) + 1) % MODES.length];
        localStorage.setItem("theme", nextMode);
        applyMode(nextMode, true);   // 内部：算 isDark → toggle class → 更新头像/按钮
    });

    /* 系统主题切换 */
    systemQuery.addEventListener("change", () => {
        if (getMode() !== "system") return;
        applyMode("system", true);
    });
});