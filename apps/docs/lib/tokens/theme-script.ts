/* What runs ahead of any bundle. Kept apart from the page store, because the
   layout renders on the server. */

export const STORAGE_KEY = 'primitree-theme-overrides'
export const HUE_KEY = 'primitree-theme-hue'
export const COMPILED_KEY = 'primitree-compiled'

/** Runs before first paint: mirrors reduced motion to the root, replays the
 * stored color overrides and the hue the dial points at, and starts the first
 * compile of a session on the homepage. A timer ends the compile if the bundle
 * never arrives; the engine cancels it as soon as it runs. */
export const themeReplayScript = `(function(){try{var r=document.documentElement,reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;if(reduced)r.dataset.motion='reduced';var s=sessionStorage.getItem('${STORAGE_KEY}');if(s){JSON.parse(s).forEach(function(e){if(e[0].indexOf('--primitives-color-')===0||e[0]==='--semantic-accent-solid'||e[0]==='--semantic-accent-solidHover'||e[0]==='--semantic-text-onAccent')r.style.setProperty(e[0],e[1])})}var h=sessionStorage.getItem('${HUE_KEY}');if(h&&/^\\d+$/.test(h)&&Number(h)<360){r.dataset.hue=h;r.style.setProperty('--page-hue',h)}if(!reduced&&location.pathname==='/'&&!sessionStorage.getItem('${COMPILED_KEY}')){r.classList.add('is-compiling');r.dataset.compileTimer=setTimeout(function(){delete r.dataset.compileTimer;r.classList.remove('is-compiling','show-primitives','show-semantic','show-component')},4000)}}catch(e){}})()`
