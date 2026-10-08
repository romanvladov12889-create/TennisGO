// Ordinary website visits do not depend on Telegram's SDK or network.
const launch = location.hash.includes('tgWebApp') || location.search.includes('tgWebApp') || !!window.Telegram?.WebApp?.initData;
window.__tennisGoTelegramLaunch=launch;
if (launch && !window.Telegram?.WebApp) {
  await new Promise(resolve => {
    const script = document.createElement('script');
    script.src = 'https://telegram.org/js/telegram-web-app.js';
    script.onload = script.onerror = resolve;
    document.head.append(script);
  });
}
if(launch&&!window.Telegram?.WebApp?.initData){for(let i=0;i<20&&!window.Telegram?.WebApp?.initData;i++)await new Promise(resolve=>setTimeout(resolve,50));}
await import('./app.js?v=0322');
