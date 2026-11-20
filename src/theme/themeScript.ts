export const THEME_COLORS = { light: '#F3F5F1', dark: '#0D1714' } as const

// Inline, render-blocking theme bootstrap — runs in <head> before first paint so
// there's no flash of the wrong theme. Reads the saved choice or the OS
// preference and sets data-theme on <html>, which swaps the token set
// (see src/styles/tokens/colors.css :root[data-theme="dark"]).
export const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem('hb-theme');if(t!=='light'&&t!=='dark'){t=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';}document.documentElement.dataset.theme=t;}catch(e){}})();`
