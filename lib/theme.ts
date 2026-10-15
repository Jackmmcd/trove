export const THEME_KEY = 'trove-theme';

/**
 * Runs inline in <head> before first paint, so a stored light choice applies
 * without a dark flash. Kept out of the client component because a server
 * layout cannot read plain values exported from a 'use client' module.
 *
 * Order of precedence:
 *   1. An explicit stored choice — the toggle always wins, in either direction.
 *   2. Installed as an app (iOS home screen, or any standalone launch): light.
 *      The phone app was asked for in light; the website stays dark.
 *   3. Otherwise dark, the original look.
 *
 * `navigator.standalone` is the iOS-only signal and is the one that matters
 * here; `display-mode: standalone` covers every other installed context.
 */
export const THEME_BOOT_SCRIPT = `try{
var s=localStorage.getItem('${THEME_KEY}');
var app=navigator.standalone===true||(window.matchMedia&&window.matchMedia('(display-mode: standalone)').matches);
var t=(s==='light'||s==='dark')?s:(app?'light':'dark');
if(t==='light')document.documentElement.dataset.theme='light';
}catch(e){}`.replace(/\n/g, '');
