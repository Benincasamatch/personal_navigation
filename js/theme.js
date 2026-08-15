/* ============ 主题切换 ============ */
document.addEventListener("DOMContentLoaded", () => {
    const toggleButton = document.querySelector("#theme-toggle");
    const profileAvatar = document.querySelector("#profile-avatar");
    const root = document.documentElement;
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

    function updateButton(isDark) {
        toggleButton.textContent = isDark ? "浅色模式" : "深色模式";
        toggleButton.setAttribute("aria-label", isDark ? "切换到浅色模式" : "切换到深色模式");
        toggleButton.setAttribute("aria-pressed", String(isDark));
    }

    /* LocalStorage */
    const savedTheme = localStorage.getItem("theme");
    const isDark = savedTheme === "dark";

    /* 加载主题与对应头像 */
    root.classList.toggle("dark", isDark);
    updateAvatar(isDark);
    updateButton(isDark);

    /* 切换主题与对应头像 */
    toggleButton.addEventListener("click", () => {
        const nextIsDark = root.classList.toggle("dark");

        updateAvatar(nextIsDark, true);
        updateButton(nextIsDark);
        localStorage.setItem("theme", nextIsDark ? "dark" : "light");
    });
});