// Ordinary website visits do not depend on Telegram's SDK or network.
const launch = location.hash.includes('tgWebApp') || location.search.includes('tgWebApp');
if (launch && !window.Telegram?.WebApp) {
  await new Promise(resolve => {
    const script = document.createElement('script');
    script.src = 'https://telegram.org/js/telegram-web-app.js';
    script.onload = script.onerror = resolve;
    document.head.append(script);
  });
}
await import('./app.js?v=0320');
