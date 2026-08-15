/*theme - toggle*/
const toggleButton = document.querySelector("#theme-toggle");
const root = document.documentElement;

toggleButton.addEventListener("click", () => {
    root.classList.toggle("dark");
});

/* loaclstorage - theme */
const toggleButton = document.querySelector("#theme-toggle");
const root = document.documentElement;

const savedTheme = localStorage.getItem("theme");

if (savedTheme === "dark") {
    root.classList.add("dark");
}

toggleButton.addEventListener("click", () => {
    const isDark = root.classList.toggle("dark");

    localStorage.setItem("theme", isDark ? "dark" : "light");
});