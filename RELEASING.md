# Выпуск версий

Репозиторий исходников и публичных обновлений: https://github.com/maga17mm-hub/alim-launcher.

## Автоматический выпуск

1. Проверьте изменения: `npm ci`, `npm run assets`, `npm run typecheck`, `npm test`, `npm run build`, `npm run test:ui`.
2. Выполните реальные интеграционные проверки при изменении игрового ядра.
3. Обновите `PROGRESS.md` и `CHANGELOG.md`.
4. `npm version patch` (обновляет package.json/lock и создаёт тег).
5. `git push origin main --follow-tags`.

Workflow `.github/workflows/release.yml` собирает Windows x64 и публикует EXE, `.blockmap`, `latest.yml` через `GITHUB_TOKEN` с `contents: write`. Версия тега обязана совпадать с package.json. PAT в исходниках и EXE отсутствует.

Если GitHub CLI сообщает о недостаточном scope для отправки workflow, выполните `gh auth refresh -h github.com -s workflow` в своей интерактивной консоли и завершите авторизацию в браузере; затем повторите `git push`. Не вставляйте токены в чат.

## Локальный выпуск

```powershell
npm run dist
gh release create v1.0.0 dist/Alim-Launcher-Setup-1.0.0.exe dist/Alim-Launcher-Setup-1.0.0.exe.blockmap dist/latest.yml --title 'Alim Launcher 1.0.0' --notes-file work/release-notes.md
```

Используйте текущий номер версии вместо примера. Каждый релиз должен содержать все три файла. Не редактируйте `latest.yml` вручную: SHA-512 в нём генерирует electron-builder. `app-update.yml` внутри EXE фиксирует репозиторий; после переименования репозитория старым клиентам нужен доступный прежний адрес обновлений.

## Подпись Windows

Сейчас сборки неподписанные. При получении сертификата добавьте GitHub Actions secrets `WINDOWS_CERTIFICATE` (base64 PFX или защищённый URL) и `WINDOWS_CERTIFICATE_PASSWORD`. Локально используйте `CSC_LINK` и `CSC_KEY_PASSWORD` как переменные окружения. Приватный сертификат не коммитьте. После смены издателя проверьте обновление с предыдущей версии на Windows.

## Приёмка обновления

Установите предыдущий EXE в отдельную папку и запустите с отдельным `ALIM_USER_DATA`. Опубликуйте следующую стабильную версию с EXE/blockmap/latest.yml. В настройках клиента проверьте найденную версию, скачивание, нажатие «Перезапустить и установить», версию после перезапуска и сохранность профилей. Отдельно проверяйте возврат игры после скрытия окна. Работа только с локальным `latest.yml` не подтверждает GitHub Releases.
