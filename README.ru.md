# EasyGit

[![test](https://github.com/BugLivesMatter/dsh-easygit/actions/workflows/test.yml/badge.svg)](https://github.com/BugLivesMatter/dsh-easygit/actions/workflows/test.yml)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

Плагин Web GUI DeepSeek Harness: граф веток в стиле GitLens **в правой
боковой панели**, автоматические ветки и worktree для задач Agent Teams,
безопасные контрольные коммиты, быстрый commit, push в GitHub и объяснение
коммита моделью.

Без зависимостей: host-часть — обычный ESM, браузерная часть — один бандл,
который отдаёт Loader.

## Установка

Требования:

- сборка DSH с `plugin_manager` и поддержкой слотов у клиента (плагин
  объявляет `dsh.bundle.patch` + `dsh.client`);
- Node.js 22 или новее — для разработки и тестов;
- `git` в `PATH` (плагин вызывает его как процесс).

```bash
git clone https://github.com/BugLivesMatter/dsh-easygit.git
```

```
plugin_manager action=install_bundle target="<абсолютный путь>/dsh-easygit"
```

Результат должен содержать `application: applied`. Ручной вариант — строка в
Cordis-композиции:

```yaml
- id: easygit
  name: '@local/easygit'
  config:
    autoBranches: true
    autoWorktrees: true
    autoCheckpoint: true
    branchPrefix: easygit/
    graphLimit: 300
    promptSection: true
```

Отключается в Settings → Plugins (или `plugin_manager action=set_plugin`):
панель, инструменты и маршруты `/easygit` исчезают полностью.

## Первый запуск

Откройте справочник **Start** правой панели, нажмите `＋` в полосе вкладок и
выберите **EasyGit**. Секции панели складываются вертикально под ширину
сайдбара.

Выбора папки нет: панель всегда работает с **папкой проекта** текущей сессии
(workspace DSH или git-репозиторий в cwd сессии). Если папка — репозиторий, граф
открывается сразу. Если нет — EasyGit перечисляет репозитории внутри неё (два
уровня, служебные папки пропускаются) и открывает выбранный по клику; кнопка
**Initialize git repository** появляется только когда репозиториев нет вовсе.

## Что умеет

- **Граф веток** — DAG коммитов с лейнами, изогнутыми рёбрами мержей,
  стабильными цветами веток, отметкой HEAD, бейджами задач, маркерами worktree и
  рейлом веток. Каждая ветка показывает расхождение с интеграционной веткой
  (`↑2 vs main`), потому что у локальной ветки обычно нет upstream. Лейны
  закреплены за ветками: интеграционная ветка владеет центральной колонкой,
  остальные держат свою колонку и цвет, поэтому переключение checkout не
  перетасовывает граф.
- **Ветки задач** — на каждое событие `team/task` создаётся `easygit/task-<id>`
  для репозитория задачи. Перед этим снимается контрольный коммит tracked-файлов.
- **Worktree задач** — если у задачи есть владелец, он получает
  `<repo>/.agents/worktrees/easygit/<branch>`, а его рабочий каталог
  переключается туда, так что параллельные ветки задач реальны.
- **Безопасные коммиты** — автоматически только tracked-файлы. Новые файлы
  входят в коммит лишь по явному списку путей. `.env`, ключи, `credentials*` и
  похожие пути исключаются, если пользователь не разрешил их из панели.
- **Блок последнего коммита** — subject, автор, статистика +/- по файлам,
  кнопки **Explain** и **Push**.
- **Explain** — один ограниченный вызов модели по патчу коммита; первый запуск
  спрашивает согласие, потому что патч покидает машину.
- **Push** — `git push` в настроенный remote (никогда не force); GitHub CLI
  используется только для отчёта о статусе логина.

## Playground и проверка веток

`scripts/playground-setup.sh` создаёт одноразовый репозиторий с реалистичной
историей: `main`, влитая `feature/lane-colors`, открытые `feature/graph-tooltip`
и `fix/status-parse`, ветка задачи `easygit/task-a1b2c3`.

```bash
bash scripts/playground-setup.sh ../easygit-playground --force
node scripts/verify-branches.mjs ../easygit-playground --report docs/branch-verification.md
```

Верификатор гоняет те же host-модули, что и панель, и проверяет поиск
репозиториев, модель веток, раскладку графа, безопасность контрольных коммитов
(включая фильтрацию секретов), создание и checkout веток, worktree задач, отказ
push без remote и детали коммита. Повторный запуск безопасен. Пример прогона
(`53/53 checks passed`) лежит в
[`docs/branch-verification.md`](./docs/branch-verification.md) — это
сгенерированный отчёт, а не ручной текст.

## Host API (`/easygit/*`)

| Маршрут | Назначение |
|---|---|
| `GET /repos` | Репозитории workspace и добавленные папки (диагностика; панель работает с папкой проекта) |
| `GET /state?session=` | Состояние репозитория папки проекта сессии |
| `GET /state?repo=` | Состояние явного репозитория |
| `GET /commit?repo=&hash=` | Детали коммита и патч |
| `POST /commit` | `{repo, message, paths?, allowSensitive?}` |
| `POST /checkpoint` | То же ядро без обязательного сообщения |
| `POST /branch` | `{repo, name, from?}` |
| `POST /switch` | `{repo, name, checkpoint?}` |
| `POST /push` | `{repo, branch?}` |
| `POST /explain` | `{repo, hash?}` |
| `POST /init`, `POST /repos/add`, `POST /repos/remove`, `POST /pick` | Управление репозиториями |
| `POST /settings` | Сохранение настроек EasyGit |
| `POST /worktree/remove` | Удаление чистого worktree задачи |

## Инструменты агента

`easygit_status`, `easygit_checkpoint`, `easygit_commit`, `easygit_branch`,
`easygit_push`, `easygit_explain`. Все они вызывают то же ядро, что и панель,
поэтому правила безопасности у панели и агента не разъезжаются.

## Правила безопасности

1. Автоматические контрольные коммиты выполняют `git add -u`: только tracked.
2. Новые файлы попадают в коммит, только если перечислены путями.
3. Подозрительные на секреты пути отбрасываются автоматически и запрещены для
   коммитов агента. Включить их может только панель, после подтверждения.
4. Push никогда не использует `--force`; git работает неинтерактивно
   (`GIT_TERMINAL_PROMPT=0`).
5. Агенту доступны только корни workspace и папки, которые добавил пользователь.

## Настройка

Строка плагина принимает обычные поля конфигурации; значения по умолчанию
безопасны:

```yaml
- id: easygit
  name: '@local/easygit'
  config:
    autoBranches: true
    autoWorktrees: true
    autoCheckpoint: true
    branchPrefix: easygit/
    graphLimit: 300
    promptSection: true
```

Runtime-настройки (переключатели, префикс веток, добавленные папки, привязка
задач) хранятся в `~/.dsh/easygit/state.json` и редактируются из панели.

## Архитектура

| Путь | Ответственность |
|---|---|
| `index.js` | Host-вход: state → git → repos → explainer → tools → секция промпта → маршруты → автоматизация задач |
| `lib/host/git.js` | Неинтерактивная обёртка git (таймауты, без запросов ввода) |
| `lib/host/checkpoint.js` | Ядро контрольных коммитов и фильтр секретов |
| `lib/host/repo.js` | Поиск репозиториев и read-model |
| `lib/host/graph.js` | Раскладка лейнов и рёбра мержей |
| `lib/host/worktrees.js` | Создание и удаление worktree задач |
| `lib/host/tasks.js` | Автоматизация `team/task` (ветка, коммит, worktree) |
| `lib/host/routes.js` | HTTP-поверхность `/easygit/*` |
| `lib/host/tools.js` | Регистрация инструментов агента |
| `lib/host/state.js` | Долговременные настройки и привязка задач |
| `client.js` | Браузерная часть: панель, отрисовка графа, действия |

## Разработка

```bash
cd dsh-easygit
node --test
node --check index.js && node --check client.js
```

Тесты используют настоящие временные репозитории, локальный bare-remote и
заглушки сервисов DSH; установка зависимостей не нужна. CI гоняет те же
команды на Linux с Node 22 и 24.

## Совместимость

- Проверено на Web GUI DSH той сборки, под которую плагин разрабатывался.
- Граф опирается только на публичные поверхности плагинов
  (`dsh.bundle.patch`, `dsh.client`, host-сервисы); если релиз DSH переименует
  id host-сервисов, нужно будет поправить проводку в `index.js`.
- Windows, macOS и Linux: единственная платформенная зависимость — git.

## Лицензия

MIT — см. [LICENSE](./LICENSE). English version: [README.md](./README.md).
