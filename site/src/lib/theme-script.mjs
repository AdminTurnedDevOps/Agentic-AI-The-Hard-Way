// Runs before first paint so a saved theme applies without a flash. Its SHA-256 hash is allowed in the CSP.
export const THEME_SCRIPT =
  "(function(){try{var t=localStorage.getItem('afg:theme');if(t==='dark'||t==='light')document.documentElement.dataset.theme=t;}catch(e){}})();";
