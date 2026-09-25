# Публикация Tennis GO Mini App на Railway

## Что понадобится

- Аккаунт GitHub и аккаунт Railway.
- Собственный Telegram-бот, созданный через @BotFather. Токен храните только в настройках Railway.
- Текущий архив Tennis GO, распакованный на компьютере.

## 1. Загрузите код на GitHub

Создайте новый **private** репозиторий на GitHub. Откройте его → **Add file → Upload files** и загрузите **содержимое** папки `tennis-go-miniapp`, чтобы `Dockerfile`, `server.mjs`, `package.json` и папка `public` оказались в корне репозитория. Не загружайте сам ZIP-файл. Папки `data`, `test` и файл `OPEN_DEMO.html` можно не загружать: для серверной версии они не нужны. Токен бота, файл `.env` и файлы `*.sqlite` не загружайте.

## 2. Создайте сервис

На [Railway](https://railway.com/) нажмите **New Project → Deploy from GitHub repo**, подключите GitHub и выберите репозиторий. Railway найдёт `Dockerfile` в корне и соберёт образ с Node 24. Начальное развёртывание может запуститься без базы и токена; дальнейшие настройки сделайте до передачи ссылки другим людям.

## 3. Подключите постоянную базу

В сервисе откройте **Volumes → Add Volume** (или **Settings → Volumes** — расположение зависит от интерфейса), прикрепите том к этому сервису и укажите **Mount Path** `/var/data`. В **Variables** добавьте `DB_PATH` со значением `/var/data/tennis-go.sqlite`. База создастся автоматически при запуске. Не кладите базу в GitHub. Используйте один экземпляр сервиса для этой SQLite базы.

## 4. Добавьте переменные бота

В **Variables** добавьте:

```text
BOT_TOKEN=токен_из_BotFather
BOT_USERNAME=имя_бота_без_символа_@
DB_PATH=/var/data/tennis-go.sqlite
```

`PORT` вручную задавать не надо: сервер читает его из окружения Railway и слушает `0.0.0.0`. После изменения переменных примените их развёртыванием сервиса. При `BOT_TOKEN` сервер выключает демо-доступ и проверяет `initData` Telegram; при открытии HTTPS-сайта в обычном браузере появится сообщение «Откройте приложение через Telegram» — это ожидаемо.

## 5. Получите HTTPS адрес

В сервисе откройте **Settings → Networking → Public Networking → Generate Domain**. Railway выдаст адрес вида `https://tennis-go-....up.railway.app` с автоматическим TLS сертификатом. Откройте `https://ВАШ_АДРЕС/api/config`: должен вернуться JSON с `"demo":false` и именем бота.

## 6. Настройте запуск из Telegram

В @BotFather выберите бота → **Bot Settings → Menu Button** (или команда `/setmenubutton`) → задайте полный HTTPS адрес сайта. Затем в **Bot Settings → Configure Mini App / Main Mini App** укажите тот же адрес — это нужно для пригласительных ссылок `https://t.me/ВАШ_БОТ?startapp=game_UUID`. Названия пунктов могут немного отличаться в версии BotFather. Откройте бота в Telegram и нажмите кнопку меню.

## Если возникла ошибка

- **Build failed**: проверьте, что `Dockerfile` лежит в корне репозитория, а не внутри дополнительной папки.
- **Application failed to respond**: откройте Railway → Deployments → Logs. Проверьте `DB_PATH=/var/data/tennis-go.sqlite` и путь подключения тома `/var/data`.
- **«Откройте приложение через Telegram» в обычном браузере**: при заданном `BOT_TOKEN` это ожидаемо; проверяйте через кнопку бота.
- **«Неверная подпись Telegram»**: убедитесь, что `BOT_TOKEN` получен именно для бота, из которого открываете приложение. Если в GitHub осталась версия `server.mjs` до исправления проверки поля `signature`, замените этот файл и дождитесь нового деплоя: кнопка Redeploy повторно запускает старый код.
- **Ссылка на игру не открывается**: настройте Main Mini App у бота и проверьте `BOT_USERNAME`.

## Обновление работающего приложения

Для версии 0.12.0 замените в GitHub файлы `server.mjs`, `public/app.js`, `public/style.css` и добавьте `public/cities.json` из нового архива. Файл `cities.json` нужен серверу при запуске. Если аватарки версии 0.5.0 ещё не загружены, добавьте `public/assets/tennis-avatars-v2.png`. Остальные файлы нужны для локального демо и проверок. После коммита дождитесь нового развёртывания из GitHub; **Redeploy** старого развёртывания не забирает новые файлы. База на подключённом Volume сохранится.

Справка: [Dockerfile](https://docs.railway.com/builds/dockerfiles), [Volumes](https://docs.railway.com/volumes), [Public Networking](https://docs.railway.com/networking/public-networking), [Telegram Mini Apps](https://core.telegram.org/bots/webapps).
