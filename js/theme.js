/* ============ 主题切换 ============ */
document.addEventListener("DOMContentLoaded", () => {
    const toggleButton = document.querySelector("#theme-toggle");
    const profileAvatar = document.querySelector("#profile-avatar");
    const root = document.documentElement;

    function updateAvatar(isDark) {
        profileAvatar.src = isDark
            ? profileAvatar.dataset.darkSrc
            : profileAvatar.dataset.lightSrc;
    }

    /* LocalStorage */
    const savedTheme = localStorage.getItem("theme");
    const isDark = savedTheme === "dark";

    /* 加载主题与对应头像 */
    root.classList.toggle("dark", isDark);
    updateAvatar(isDark);

    /* 切换主题与对应头像 */
    toggleButton.addEventListener("click", () => {
        const nextIsDark = root.classList.toggle("dark");

        updateAvatar(nextIsDark);
        localStorage.setItem("theme", nextIsDark ? "dark" : "light");
    });
});