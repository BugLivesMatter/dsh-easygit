/**
 * EasyGit browser half.
 *
 * A single self-contained module: the shared module loader hands it React, the
 * host serves `/easygit/*` next to the page, and the panel renders through the
 * official `main` / `sidebar.panellist` slots. Layout is computed by the host;
 * this file only draws the graph and drives actions.
 */
window.__ModuleLoader__.load({
  id: '@local/easygit',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    // ---------------------------------------------------------------- i18n

    const DICT = {
      en: {
        'title': 'EasyGit',
        'loading': 'Loading repository…',
        'refresh': 'Refresh',
        'settings': 'Settings',
        'repo': 'Repository',
        'addRepo': 'Add folder',
        'pickFolder': 'Pick folder',
        'add': 'Add',
        'cancel': 'Cancel',
        'confirm': 'Confirm',
        'initialize': 'Initialize git repository',
        'initializeConfirm': 'Create a new git repository here? Nothing is committed automatically.',
        'notGit': 'This folder is not a git repository yet.',
        'repoCandidates': 'Repositories in this project folder',
        'openRepo': 'Open',
        'backToRepos': 'Repositories',
        'aheadMain': '↑{n} vs {branch}',
        'behindMain': '↓{n} vs {branch}',
        'noRepos': 'No repositories yet. Add a folder or initialize the workspace.',
        'noSession': 'Select a session to see the repository of its project folder.',
        'project': 'Project',
        'branches': 'Branches',
        'branchName': 'new branch name',
        'create': 'create',
        'branchCreated': 'Branch {name} created',
        'commits': 'Commits',
        'lastCommit': 'Last commit',
        'files': 'Files',
        'noChanges': 'Working tree is clean',
        'changes': 'changes',
        'commit': 'Commit',
        'commitAndPush': 'Commit & Push',
        'push': 'Push',
        'explain': 'Explain',
        'explainConsent': 'Explain sends this commit patch to the configured model provider (code may include secrets). Continue?',
        'explainRemember': 'Do not ask again in this browser',
        'explaining': 'Explaining…',
        'commitMessage': 'Commit message',
        'commitMessagePlaceholder': 'chore: describe the change',
        'commitNeedsMessage': 'Write a commit message first.',
        'selected': '{n} selected',
        'allowSensitive': 'Allow sensitive files',
        'sensitiveWarn': 'Sensitive-looking files are excluded unless you allow them.',
        'sensitiveConfirm': 'Include files that look like secrets in this commit?',
        'clean': 'clean',
        'dirty': '{n} changed',
        'ahead': '↑{n}',
        'behind': '↓{n}',
        'worktree': 'worktree',
        'task': 'task',
        'switchBranch': 'Switch branch',
        'switchConfirm': 'There are uncommitted changes. Checkpoint tracked files and switch?',
        'commitSuccess': 'Committed {hash}',
        'pushSuccess': 'Pushed {branch}',
        'pushNoRemote': 'No git remote is configured.',
        'githubHint': 'GitHub CLI is not signed in. Run `gh auth login` or configure a git credential helper.',
        'repoAdded': 'Folder added',
        'initDone': 'Repository initialized',
        'detached': 'detached HEAD',
        'warnings': 'Warnings',
        'noCommits': 'No commits yet.',
        'noTask': 'no task',
        'settingsSaved': 'Settings saved',
        'autoBranches': 'Create a branch for each team task',
        'autoWorktrees': 'Give each task owner a worktree',
        'autoCheckpoint': 'Checkpoint tracked files before a new task',
        'branchPrefix': 'Branch prefix',
        'close': 'Close',
        'openInPanel': 'EasyGit',
        'guideDescription': 'Branch graph, task branches, commits, Explain and Push — all in this sidebar.',
        'crashTitle': 'EasyGit crashed',
        'retry': 'Retry',
        'explainFailed': 'Explain failed',
        'diffTruncated': 'Patch truncated',
        'selectedCommit': 'Selected commit',
        'noDetail': 'Select a commit in the graph.',
        'error': 'Error',
        'working': 'Working…',
      },
      ru: {
        'title': 'EasyGit',
        'loading': 'Загрузка репозитория…',
        'refresh': 'Обновить',
        'settings': 'Настройки',
        'repo': 'Репозиторий',
        'addRepo': 'Добавить папку',
        'pickFolder': 'Выбрать папку',
        'add': 'Добавить',
        'cancel': 'Отмена',
        'confirm': 'Подтвердить',
        'initialize': 'Инициализировать git-репозиторий',
        'initializeConfirm': 'Создать новый git-репозиторий здесь? Автоматически ничего не коммитится.',
        'notGit': 'Эта папка пока не git-репозиторий.',
        'repoCandidates': 'Репозитории в папке проекта',
        'openRepo': 'Открыть',
        'backToRepos': 'Репозитории',
        'aheadMain': '↑{n} к {branch}',
        'behindMain': '↓{n} к {branch}',
        'noRepos': 'Репозиториев пока нет. Добавьте папку или инициализируйте workspace.',
        'noSession': 'Выберите сессию, чтобы увидеть репозиторий её папки проекта.',
        'project': 'Проект',
        'branches': 'Ветки',
        'branchName': 'имя новой ветки',
        'create': 'создать',
        'branchCreated': 'Ветка {name} создана',
        'commits': 'Коммиты',
        'lastCommit': 'Последний коммит',
        'files': 'Файлы',
        'noChanges': 'Рабочее дерево чистое',
        'changes': 'изменений',
        'commit': 'Коммит',
        'commitAndPush': 'Коммит и Push',
        'push': 'Push',
        'explain': 'Explain',
        'explainConsent': 'Explain отправит патч этого коммита настроенной модели (в коде могут быть секреты). Продолжить?',
        'explainRemember': 'Больше не спрашивать в этом браузере',
        'explaining': 'Объясняю…',
        'commitMessage': 'Сообщение коммита',
        'commitMessagePlaceholder': 'chore: опишите изменение',
        'commitNeedsMessage': 'Сначала напишите сообщение коммита.',
        'selected': 'выбрано: {n}',
        'allowSensitive': 'Разрешить чувствительные файлы',
        'sensitiveWarn': 'Файлы, похожие на секреты, исключены, пока вы их не разрешите.',
        'sensitiveConfirm': 'Включить в коммит файлы, похожие на секреты?',
        'clean': 'чисто',
        'dirty': 'изменено: {n}',
        'ahead': '↑{n}',
        'behind': '↓{n}',
        'worktree': 'worktree',
        'task': 'задача',
        'switchBranch': 'Переключить ветку',
        'switchConfirm': 'Есть незакоммиченные изменения. Сделать контрольный коммит tracked-файлов и переключиться?',
        'commitSuccess': 'Коммит {hash} создан',
        'pushSuccess': 'Ветка {branch} отправлена',
        'pushNoRemote': 'Git remote не настроен.',
        'githubHint': 'GitHub CLI не авторизован. Выполните `gh auth login` или настройте git credential helper.',
        'repoAdded': 'Папка добавлена',
        'initDone': 'Репозиторий инициализирован',
        'detached': 'detached HEAD',
        'warnings': 'Предупреждения',
        'noCommits': 'Коммитов пока нет.',
        'noTask': 'без задачи',
        'settingsSaved': 'Настройки сохранены',
        'autoBranches': 'Создавать ветку для каждой задачи команды',
        'autoWorktrees': 'Давать владельцу задачи отдельный worktree',
        'autoCheckpoint': 'Коммитить tracked-файлы перед новой задачей',
        'branchPrefix': 'Префикс веток',
        'close': 'Закрыть',
        'openInPanel': 'EasyGit',
        'guideDescription': 'Граф веток, задачи, коммиты, Explain и Push — прямо в этой боковой панели.',
        'crashTitle': 'EasyGit упал',
        'retry': 'Повторить',
        'explainFailed': 'Explain не удался',
        'diffTruncated': 'Патч обрезан',
        'selectedCommit': 'Выбранный коммит',
        'noDetail': 'Выберите коммит в графе.',
        'error': 'Ошибка',
        'working': 'Выполняется…',
      },
    }

    let CTX = null
    let fallbackLang = 'en'

    function detectLang() {
      const html = typeof document !== 'undefined' ? document.documentElement.lang : ''
      const value = String(html || (typeof navigator !== 'undefined' ? navigator.language : 'en')).toLowerCase()
      if (value.startsWith('ru')) return 'ru'
      return 'en'
    }

    function activeLang() {
      try {
        const locale = CTX && CTX.get ? CTX.get('locale') : undefined
        const snapshot = locale && typeof locale.getSnapshot === 'function' ? locale.getSnapshot() : undefined
        const id = snapshot && typeof snapshot.active === 'string' ? snapshot.active : undefined
        if (id && id.toLowerCase().startsWith('ru')) return 'ru'
        if (id && id.toLowerCase().startsWith('en')) return 'en'
      } catch {
        /* fall through */
      }
      return fallbackLang
    }

    function translate(key, vars) {
      const dict = DICT[activeLang()] || DICT.en
      let value = dict[key] !== undefined ? dict[key] : DICT.en[key] !== undefined ? DICT.en[key] : key
      if (vars && typeof vars === 'object') {
        value = value.replace(/\{(\w+)\}/g, (match, name) => (vars[name] !== undefined ? String(vars[name]) : match))
      }
      return value
    }

    function useLocaleRevision() {
      const locale = CTX && CTX.get ? CTX.get('locale') : undefined
      const [revision, setRevision] = React.useState(0)
      React.useEffect(() => {
        if (!locale || typeof locale.subscribe !== 'function') return undefined
        let alive = true
        const unsubscribe = locale.subscribe(() => {
          if (alive) setRevision(value => value + 1)
        })
        return () => {
          alive = false
          if (typeof unsubscribe === 'function') unsubscribe()
        }
      }, [locale])
      return revision
    }

    function useT() {
      useLocaleRevision()
      return translate
    }

    // ---------------------------------------------------------------- api

    async function unwrap(response, path) {
      let body
      try {
        body = await response.json()
      } catch {
        throw new Error(`EasyGit: ${path}: empty or invalid response`)
      }
      if (body === null || typeof body !== 'object') throw new Error(`EasyGit: ${path}: invalid response`)
      if (body.ok === true) return body.value
      const message = body.error && typeof body.error.message === 'string' ? body.error.message : `HTTP ${response.status}`
      throw new Error(message)
    }

    const api = {
      async get(path) {
        const response = await fetch(path, { signal: AbortSignal.timeout(30000), headers: { accept: 'application/json' } })
        return unwrap(response, path)
      },
      async post(path, body) {
        const response = await fetch(path, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body || {}),
          signal: AbortSignal.timeout(120000),
        })
        return unwrap(response, path)
      },
    }

    const enc = value => encodeURIComponent(String(value))

    // ---------------------------------------------------------------- format

    const shortHash = hash => (typeof hash === 'string' ? hash.slice(0, 7) : '')

    function relativeTime(seconds) {
      if (!seconds) return ''
      const delta = Math.max(0, Math.floor(Date.now() / 1000) - seconds)
      if (delta < 60) return `${delta}s`
      if (delta < 3600) return `${Math.floor(delta / 60)}m`
      if (delta < 86400) return `${Math.floor(delta / 3600)}h`
      if (delta < 86400 * 30) return `${Math.floor(delta / 86400)}d`
      return new Date(seconds * 1000).toLocaleDateString()
    }

    function ageTitle(seconds) {
      return seconds ? new Date(seconds * 1000).toLocaleString() : ''
    }

    function compactPath(path, limit) {
      const value = String(path)
      const max = limit || 42
      if (value.length <= max) return value
      return `…${value.slice(value.length - max + 1)}`
    }

    // ---------------------------------------------------------------- visuals

    const COLORS = Array.from({ length: 10 }, (_, index) => `var(--eg-c${index})`)
    const ROW_H = 26
    const LANE_W = 20
    const GRAPH_PAD = 12
    const GRAPH_TOP = 0

    function colorOf(index) {
      return COLORS[Math.abs(Number(index) || 0) % COLORS.length]
    }

    function Graph(props) {
      const { payload, selectedHash, onSelect } = props
      const t = useT()
      const rows = payload.commits
      const laneCount = Math.max(1, Math.min(payload.laneCount || 1, 9))
      const mainCol = typeof payload.mainCol === 'number' ? payload.mainCol : 0
      const graphWidth = GRAPH_PAD * 2 + laneCount * LANE_W
      const height = rows.length * ROW_H
      // Columns, not lanes: the integration branch keeps the centre column and
      // every other branch keeps its own, so the picture is stable.
      const x = col => GRAPH_PAD + Math.min(typeof col === 'number' ? col : mainCol, laneCount - 1) * LANE_W
      const y = row => GRAPH_TOP + row * ROW_H + ROW_H / 2

      const edges = (payload.edges || [])
        .filter(edge => edge.fromRow < rows.length && edge.toRow < rows.length)
        .map((edge, index) => {
          const x1 = x(typeof edge.fromCol === 'number' ? edge.fromCol : edge.fromLane)
          const y1 = y(edge.fromRow)
          const x2 = x(typeof edge.toCol === 'number' ? edge.toCol : edge.toLane)
          const y2 = y(edge.toRow)
          const mid = Math.max(10, (y2 - y1) / 2)
          const path = x1 === x2
            ? `M ${x1} ${y1} L ${x2} ${y2}`
            : `M ${x1} ${y1} C ${x1} ${y1 + mid}, ${x2} ${y2 - mid}, ${x2} ${y2}`
          return h('path', {
            key: `e${index}`,
            d: path,
            fill: 'none',
            stroke: colorOf(edge.color),
            strokeWidth: 1.7,
            strokeLinecap: 'round',
            opacity: 0.85,
          })
        })

      const dots = rows.map(row => {
        const cx = x(typeof row.col === 'number' ? row.col : row.lane)
        const cy = y(row.row)
        const isHead = row.hash === payload.repo.head
        return h('g', { key: `d${row.hash}` },
          isHead ? h('circle', { cx, cy, r: 7, fill: 'none', stroke: colorOf(row.color), strokeWidth: 1.2, opacity: 0.55 }) : null,
          h('circle', { cx, cy, r: isHead ? 4.4 : 3.5, fill: colorOf(row.color), stroke: 'var(--dsw-alias-bg-base)', strokeWidth: 1.2 }),
        )
      })

      return h('div', { className: 'eg-graphline' },
        h('svg', {
          className: 'eg-graph-svg',
          width: graphWidth,
          height,
          viewBox: `0 0 ${graphWidth} ${height}`,
          'aria-hidden': true,
        }, h('g', null, edges, dots)),
        h('div', { className: 'eg-commitlist', role: 'list' },
          rows.length === 0
            ? h('div', { className: 'eg-empty' }, t('noCommits'))
            : rows.map(row => {
              const selected = selectedHash === row.hash
              return h('div', {
                key: row.hash,
                role: 'listitem',
                className: `eg-commitrow${selected ? ' is-selected' : ''}`,
                style: { height: ROW_H },
                tabIndex: 0,
                onClick: () => onSelect(row.hash),
                onKeyDown: event => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    onSelect(row.hash)
                  }
                },
              },
              h('span', { className: 'eg-refs' },
                (row.refs || []).map(ref => h('span', {
                  key: `${ref.type}:${ref.name}`,
                  className: `eg-ref eg-ref-${ref.type}${ref.isHead ? ' is-head' : ''}`,
                  style: { '--eg-ref-color': colorOf(ref.color) },
                  title: ref.name,
                }, ref.type === 'remote' ? `↗ ${ref.name}` : ref.type === 'tag' ? `⌂ ${ref.name}` : ref.name)),
                row.task ? h('span', { className: 'eg-taskchip', title: row.task.title }, `◆ ${row.task.title || t('task')}`) : null,
              ),
              h('span', { className: 'eg-subject', title: row.subject }, row.subject),
              h('span', { className: 'eg-meta' }, row.author, h('span', { className: 'eg-dim' }, ' · ', relativeTime(row.time))),
              h('span', { className: 'eg-hash' }, shortHash(row.hash)))
            }),
        ))
    }

    function BranchRail(props) {
      const { payload, onSelectBranch, onSwitch, onPush, busy, branchName, setBranchName, onCreateBranch } = props
      const t = useT()
      return h('aside', { className: 'eg-rail' },
        h('div', { className: 'eg-rail-head' },
          h('span', { className: 'eg-rail-title' }, t('branches')),
          h('input', {
            className: 'eg-input eg-rail-input',
            type: 'text',
            value: branchName || '',
            placeholder: t('branchName'),
            'aria-label': t('branchName'),
            spellCheck: false,
            onChange: event => setBranchName(event.target.value),
            onKeyDown: event => {
              if (event.key === 'Enter') {
                event.preventDefault()
                onCreateBranch()
              }
            },
          }),
          h('button', {
            type: 'button',
            className: 'eg-btn eg-btn-small',
            disabled: busy !== null || String(branchName || '').trim().length === 0,
            onClick: onCreateBranch,
          }, t('create')),
        ),
        payload.branches.length === 0 ? h('div', { className: 'eg-empty' }, t('noCommits')) : null,
        payload.branches.map(branch => {
          const tracking = []
          if (branch.ahead > 0) tracking.push(t('ahead', { n: branch.ahead }))
          if (branch.behind > 0) tracking.push(t('behind', { n: branch.behind }))
          return h('div', { key: branch.name, className: `eg-branchrow${branch.isHead ? ' is-head' : ''}` },
            h('button', {
              type: 'button',
              className: 'eg-branch-select',
              onClick: () => onSelectBranch(branch),
              title: branch.subject || branch.name,
            },
            h('span', { className: 'eg-branchdot', style: { background: colorOf(branch.color) } }),
            h('span', { className: 'eg-branchname' }, branch.name),
            branch.isHead ? h('span', { className: 'eg-badge' }, 'HEAD') : null,
            branch.task ? h('span', { className: 'eg-taskchip', title: branch.task.title }, `◆ ${shortTask(branch.task.key)}`) : null,
            branch.worktreePath ? h('span', { className: 'eg-badge eg-badge-quiet', title: branch.worktreePath }, '⌂') : null,
            tracking.length > 0 ? h('span', { className: 'eg-branchtrack' }, tracking.join(' ')) : null,
            payload.integrationBranch && branch.divergence && (branch.divergence.ahead > 0 || branch.divergence.behind > 0)
              ? h('span', { className: 'eg-branchdiv' },
                [
                  branch.divergence.ahead > 0 ? t('aheadMain', { n: branch.divergence.ahead, branch: payload.integrationBranch }) : null,
                  branch.divergence.behind > 0 ? t('behindMain', { n: branch.divergence.behind, branch: payload.integrationBranch }) : null,
                ].filter(Boolean).join(' '))
              : null,
            ),
            h('span', { className: 'eg-branchactions' },
              branch.isHead ? null : h('button', {
                type: 'button',
                className: 'eg-iconbtn',
                title: t('switchBranch'),
                disabled: busy !== null,
                onClick: event => {
                  event.stopPropagation()
                  onSwitch(branch)
                },
              }, '⇄'),
              h('button', {
                type: 'button',
                className: 'eg-iconbtn',
                title: t('push'),
                disabled: busy !== null,
                onClick: event => {
                  event.stopPropagation()
                  onPush(branch.name)
                },
              }, '↑'),
            ),
          )
        }),
      )
    }

    function shortTask(key) {
      const value = String(key || '')
      const index = value.indexOf('::')
      return index === -1 ? value : value.slice(index + 2)
    }

    function FileBadge(props) {
      const file = props && props.file ? props.file : {}
      const raw = file.untracked ? 'U' : file.index !== ' ' && file.index !== '?' ? file.index : file.worktree
      const letter = typeof raw === 'string' && raw.trim().length > 0 ? raw.trim() : 'M'
      return h('span', { className: `eg-filebadge${file.sensitive ? ' is-sensitive' : ''}`, title: file.originalPath ? `${file.originalPath} → ${file.path}` : file.path }, letter)
    }

    function DetailPanel(props) {
      const { payload, commit, selectedHash, onExplain, onPush, explain, explaining, busy, allowConsent, onConsent } = props
      const t = useT()
      const shown = commit || payload.lastCommit
      const branch = payload.repo.branch
      return h('aside', { className: 'eg-detail' },
        h('div', { className: 'eg-detail-title' }, selectedHash ? t('selectedCommit') : t('lastCommit')),
        shown === null
          ? h('div', { className: 'eg-empty' }, t('noDetail'))
          : h(React.Fragment, null,
            h('div', { className: 'eg-detail-subject' }, shown.subject),
            h('div', { className: 'eg-detail-meta' },
              h('span', null, shown.author),
              h('span', { className: 'eg-dim' }, ' · ', relativeTime(shown.time)),
              h('span', { className: 'eg-hash' }, shortHash(shown.hash))),
            h('div', { className: 'eg-detail-stats' },
              h('span', null, `${t('files')}: ${shown.stats ? shown.stats.files : (shown.files || []).length}`),
              h('span', { className: 'eg-add' }, `+${shown.stats ? shown.stats.additions : 0}`),
              h('span', { className: 'eg-del' }, `−${shown.stats ? shown.stats.deletions : 0}`)),
            shown.files && shown.files.length > 0
              ? h('div', { className: 'eg-filelist' },
                shown.files.slice(0, 20).map(file => h('div', { key: file.path, className: 'eg-filerow', title: file.path },
                  h('span', { className: 'eg-filename' }, compactPath(file.path, 38)),
                  h('span', { className: 'eg-add' }, file.additions ? `+${file.additions}` : ''),
                  h('span', { className: 'eg-del' }, file.deletions ? `−${file.deletions}` : ''),
                )),
                (shown.filesTotal || shown.files.length) > 20
                  ? h('div', { className: 'eg-dim' }, `+${(shown.filesTotal || shown.files.length) - 20}…`)
                  : null,
              )
              : null,
            h('div', { className: 'eg-detail-actions' },
              h('button', { type: 'button', className: 'eg-btn', disabled: busy !== null, onClick: () => onExplain(shown.hash) }, busy === 'explain' ? t('explaining') : t('explain')),
              h('button', { type: 'button', className: 'eg-btn eg-btn-primary', disabled: busy !== null || branch === null, onClick: () => onPush(branch) }, t('push')),
            ),
            payload.repo.github && payload.repo.github.cli === true && payload.repo.github.authenticated !== true
              ? h('div', { className: 'eg-hint' }, t('githubHint'))
              : null,
            explain && explain.hash === shown.hash
              ? h('div', { className: 'eg-explanation', 'aria-live': 'polite' }, explain.text)
              : null,
            allowConsent
              ? h('div', { className: 'eg-consent' },
                h('div', null, t('explainConsent')),
                h('div', { className: 'eg-consent-actions' },
                  h('button', { type: 'button', className: 'eg-btn eg-btn-primary', onClick: () => onConsent(true) }, t('explain')),
                  h('button', { type: 'button', className: 'eg-btn', onClick: () => onConsent(false) }, t('cancel')),
                ))
              : null,
          ),
      )
    }

    function Composer(props) {
      const { payload, message, setMessage, selected, toggleFile, selectedCount, allowSensitive, setAllowSensitive, onCommit, onCommitAndPush, busy, t } = props
      const files = payload.status.files
      const sensitiveSelected = files.some(file => file.sensitive && selected.has(file.path))
      return h('footer', { className: 'eg-composer' },
        h('div', { className: 'eg-composer-head' },
          h('span', { className: 'eg-composer-status' },
            payload.status.clean
              ? t('noChanges')
              : `${payload.status.total} ${t('changes')} · ${payload.status.trackedChanged} tracked · ${payload.status.untracked} new`,
            payload.status.sensitive > 0 ? h('span', { className: 'eg-warn' }, ' ⚠ ', t('sensitiveWarn')) : null),
          h('span', { className: 'eg-dim' }, t('selected', { n: selectedCount })),
        ),
        h('div', { className: 'eg-composer-body' },
          h('div', { className: 'eg-filepicker' },
            files.length === 0 ? h('div', { className: 'eg-empty' }, t('noChanges')) : null,
            files.map(file => {
              const disabled = file.sensitive && !allowSensitive
              return h('label', { key: file.path, className: `eg-filecheck${file.sensitive ? ' is-sensitive' : ''}${disabled ? ' is-disabled' : ''}`, title: file.path },
                h('input', {
                  type: 'checkbox',
                  checked: selected.has(file.path),
                  disabled,
                  onChange: () => toggleFile(file.path),
                }),
                h(FileBadge, { file }),
                h('span', { className: 'eg-filename' }, compactPath(file.path, 46)),
                file.untracked ? h('span', { className: 'eg-badge eg-badge-quiet' }, 'new') : null,
              )
            }),
          ),
          h('div', { className: 'eg-commitbox' },
            h('textarea', {
              className: 'eg-textarea',
              rows: 2,
              value: message,
              placeholder: t('commitMessagePlaceholder'),
              onChange: event => setMessage(event.target.value),
            }),
            h('div', { className: 'eg-commitactions' },
              h('label', { className: 'eg-checkline', title: t('sensitiveWarn') },
                h('input', {
                  type: 'checkbox',
                  checked: allowSensitive,
                  onChange: () => setAllowSensitive(!allowSensitive),
                }),
                t('allowSensitive'),
              ),
              h('div', { className: 'eg-spacer' }),
              h('button', { type: 'button', className: 'eg-btn', disabled: busy !== null || selectedCount === 0, onClick: onCommit }, busy === 'commit' ? t('working') : t('commit')),
              h('button', { type: 'button', className: 'eg-btn eg-btn-primary', disabled: busy !== null || selectedCount === 0, onClick: onCommitAndPush }, busy === 'commitpush' ? t('working') : t('commitAndPush')),
            ),
          ),
        ),
      )
    }

    // ---------------------------------------------------------------- panel

    const CONSENT_KEY = 'easygit:explain-consent-v1'

    function readConsent() {
      try {
        return localStorage.getItem(CONSENT_KEY) === '1'
      } catch {
        return false
      }
    }

    function storeConsent() {
      try {
        localStorage.setItem(CONSENT_KEY, '1')
      } catch {
        /* ignore */
      }
    }

    function Panel(props) {
      const t = useT()
      const sessionId = props && typeof props.sessionId === 'string' ? props.sessionId : null
      const [project, setProject] = React.useState(null)
      const [payload, setPayload] = React.useState(null)
      const [loading, setLoading] = React.useState(true)
      const [error, setError] = React.useState(null)
      const [notice, setNotice] = React.useState(null)
      const [busy, setBusy] = React.useState(null)
      const [message, setMessage] = React.useState('')
      const [selected, setSelected] = React.useState(new Set())
      const [allowSensitive, setAllowSensitive] = React.useState(false)
      const [selectedHash, setSelectedHash] = React.useState(null)
      const [commit, setCommit] = React.useState(null)
      const [explain, setExplain] = React.useState(null)
      const [consentOpen, setConsentOpen] = React.useState(false)
      const [pendingExplainHash, setPendingExplainHash] = React.useState(null)
      const [explainBusy, setExplainBusy] = React.useState(false)
      const [settingsOpen, setSettingsOpen] = React.useState(false)
      const [candidates, setCandidates] = React.useState([])
      const [chosen, setChosen] = React.useState(null)
      const [branchName, setBranchName] = React.useState('')
      const selectionRepo = React.useRef(null)
      const sessionRef = React.useRef(sessionId)
      const noticeTimer = React.useRef(null)
      const projectIsGit = project === null ? undefined : project.isGit

      const showNotice = text => {
        setNotice(text)
        if (noticeTimer.current) clearTimeout(noticeTimer.current)
        noticeTimer.current = setTimeout(() => setNotice(null), 6000)
      }

      const loadState = React.useCallback(async silent => {
        if (!sessionId) {
          setProject(null)
          setPayload(null)
          setLoading(false)
          setError(translate('noSession'))
          return
        }
        if (!silent) setLoading(true)
        try {
          const url = chosen === null
            ? `/easygit/state?session=${enc(sessionId)}`
            : `/easygit/state?repo=${enc(chosen)}`
          const value = await api.get(url)
          if (value.repo) {
            setProject(value.project || { path: value.repo.path, title: value.repo.title, isGit: true, branch: value.repo.branch })
          } else {
            setProject(value.project || null)
          }
          if (value.isGit === false) {
            setCandidates(Array.isArray(value.candidates) ? value.candidates : [])
            setPayload(null)
            setError(null)
            return
          }
          setCandidates([])
          setPayload(value)
          setError(null)
        } catch (failure) {
          if (!silent) setError(failure.message)
        } finally {
          if (!silent) setLoading(false)
        }
      }, [sessionId, chosen])

      React.useEffect(() => {
        if (sessionRef.current !== sessionId) {
          sessionRef.current = sessionId
          setChosen(null)
          setCandidates([])
        }
        selectionRepo.current = null
        setSelectedHash(null)
        setCommit(null)
        setExplain(null)
        setMessage('')
        setPayload(null)
        setLoading(true)
        if (!sessionId) {
          setProject(null)
          setLoading(false)
          return undefined
        }
        void loadState(false)
        const id = setInterval(() => {
          void loadState(true)
        }, 5000)
        return () => {
          clearInterval(id)
          if (noticeTimer.current) clearTimeout(noticeTimer.current)
        }
      }, [sessionId, loadState])

      // Keep the selected file set in sync with the new status.
      React.useEffect(() => {
        if (!payload) return
        const files = payload.status.files
        const valid = new Set(files.map(file => file.path))
        if (selectionRepo.current !== payload.repo.path) {
          selectionRepo.current = payload.repo.path
          const defaults = files.filter(file => !file.untracked && !file.sensitive).map(file => file.path)
          setSelected(new Set(defaults))
          setAllowSensitive(false)
          return
        }
        setSelected(current => {
          const next = new Set([...current].filter(path => valid.has(path)))
          if (next.size === current.size) return current
          return next
        })
      }, [payload])

      React.useEffect(() => {
        if (!payload) return
        if (selectedHash === null) {
          setCommit(null)
          return
        }
        let cancelled = false
        api.get(`/easygit/commit?repo=${enc(payload.repo.path)}&hash=${enc(selectedHash)}`)
          .then(value => {
            if (!cancelled) setCommit(value)
          })
          .catch(failure => {
            if (!cancelled) setError(failure.message)
          })
        return () => {
          cancelled = true
        }
      }, [payload && payload.repo.path, selectedHash])

      const refresh = async () => {
        await loadState(true)
      }

      const run = async (label, action) => {
        setBusy(label)
        setError(null)
        try {
          await action()
        } catch (failure) {
          setError(failure.message || String(failure))
        } finally {
          setBusy(null)
        }
      }

      const commitNow = async (alsoPush) => {
        if (!payload) return
        if (message.trim().length === 0) {
          setError(t('commitNeedsMessage'))
          return
        }
        await run(alsoPush ? 'commitpush' : 'commit', async () => {
          const result = await api.post('/easygit/commit', {
            repo: payload.repo.path,
            message: message.trim(),
            paths: [...selected],
            allowSensitive,
          })
          if (result.noop === true) {
            showNotice(t('noChanges'))
          } else {
            showNotice(t('commitSuccess', { hash: shortHash(result.hash) }))
            setMessage('')
          }
          await loadState(true)
          if (alsoPush && result.noop !== true && payload.repo.branch) {
            await api.post('/easygit/push', { repo: payload.repo.path, branch: payload.repo.branch })
            showNotice(t('pushSuccess', { branch: payload.repo.branch }))
            await loadState(true)
          }
        })
      }

      const push = async branch => {
        if (!payload) return
        await run('push', async () => {
          const target = branch || payload.repo.branch
          if (!target) {
            setError(t('detached'))
            return
          }
          const result = await api.post('/easygit/push', { repo: payload.repo.path, branch: target })
          showNotice(t('pushSuccess', { branch: result.branch || target }))
          await loadState(true)
        })
      }

      const switchBranch = async branch => {
        if (!payload) return
        const dirty = !payload.status.clean
        if (dirty && !window.confirm(t('switchConfirm'))) return
        await run('switch', async () => {
          await api.post('/easygit/switch', { repo: payload.repo.path, name: branch.name, checkpoint: dirty })
          await loadState(true)
        })
      }

      const explainLocal = async hash => {
        if (!payload) return
        if (!readConsent()) {
          setPendingExplainHash(hash)
          setConsentOpen(true)
          return
        }
        await run('explain', async () => {
          setExplainBusy(true)
          try {
            const value = await api.post('/easygit/explain', { repo: payload.repo.path, hash })
            setExplain(value)
          } finally {
            setExplainBusy(false)
          }
        })
      }

      const acceptConsent = async remembered => {
        setConsentOpen(false)
        if (remembered) storeConsent()
        const hash = pendingExplainHash
        setPendingExplainHash(null)
        if (hash) await explainLocal(hash)
      }

      const initialize = async () => {
        const target = project ? project.path : null
        if (!target) return
        if (!window.confirm(t('initializeConfirm'))) return
        await run('init', async () => {
          await api.post('/easygit/init', { repo: target })
          await loadState(false)
          showNotice(t('initDone'))
        })
      }

      const openCandidate = path => {
        setCandidates([])
        setChosen(path)
      }

      const backToCandidates = () => {
        setChosen(null)
        setCandidates([])
      }

      const createBranch = async () => {
        const name = String(branchName || '').trim()
        if (name.length === 0 || !payload) return
        await run('branch', async () => {
          await api.post('/easygit/branch', { repo: payload.repo.path, name })
          setBranchName('')
          await loadState(true)
          showNotice(t('branchCreated', { name }))
        })
      }

      const saveSettings = async patch => {
        await run('settings', async () => {
          const value = await api.post('/easygit/settings', { settings: patch })
          setPayload(current => (current === null ? current : { ...current, settings: value.settings }))
          showNotice(t('settingsSaved'))
        })
      }

      const toggleFile = path => {
        setSelected(current => {
          const next = new Set(current)
          if (next.has(path)) next.delete(path)
          else next.add(path)
          return next
        })
      }

      const selectedCount = selected.size
      const activeRepo = payload ? payload.repo : null
      const settings = payload ? payload.settings : null

      return h('div', { className: 'eg-root' },
        h('style', null, STYLE),
        h('header', { className: 'eg-top' },
          h('span', { className: 'eg-logo' }, h(EasyGitMark, { size: 18 }), h('span', null, t('title'))),
          project
            ? h('span', { className: 'eg-project', title: project.path }, project.title)
            : null,
          chosen !== null
            ? h('button', { type: 'button', className: 'eg-btn eg-btn-quiet', onClick: backToCandidates }, `← ${t('backToRepos')}`)
            : null,
          activeRepo
            ? h('span', { className: 'eg-current' },
              h('span', { className: 'eg-currentdot' }),
              h('span', null, activeRepo.branch || t('detached')),
              payload && payload.branches.find(branch => branch.isHead && branch.ahead > 0)
                ? h('span', { className: 'eg-branchtrack' }, t('ahead', { n: payload.branches.find(branch => branch.isHead).ahead }))
                : null,
              payload && payload.branches.find(branch => branch.isHead && branch.behind > 0)
                ? h('span', { className: 'eg-branchtrack' }, t('behind', { n: payload.branches.find(branch => branch.isHead).behind }))
                : null,
            )
            : null,
          h('div', { className: 'eg-spacer' }),
          payload && !payload.status.clean ? h('span', { className: 'eg-badge eg-badge-warn' }, t('dirty', { n: payload.status.total })) : null,
          h('button', { type: 'button', className: 'eg-btn', disabled: busy !== null, onClick: refresh }, t('refresh')),
          h('button', { type: 'button', className: 'eg-btn', onClick: () => setSettingsOpen(!settingsOpen) }, t('settings')),
        ),
        settingsOpen && settings
          ? h('div', { className: 'eg-settings' },
            h('label', { className: 'eg-checkline' },
              h('input', {
                type: 'checkbox',
                checked: settings.autoBranches,
                onChange: event => saveSettings({ autoBranches: event.target.checked }),
              }),
              t('autoBranches')),
            h('label', { className: 'eg-checkline' },
              h('input', {
                type: 'checkbox',
                checked: settings.autoWorktrees,
                onChange: event => saveSettings({ autoWorktrees: event.target.checked }),
              }),
              t('autoWorktrees')),
            h('label', { className: 'eg-checkline' },
              h('input', {
                type: 'checkbox',
                checked: settings.autoCheckpoint,
                onChange: event => saveSettings({ autoCheckpoint: event.target.checked }),
              }),
              t('autoCheckpoint')),
            h('label', { className: 'eg-checkline' },
              h('span', null, t('branchPrefix')),
              h('input', {
                className: 'eg-input',
                defaultValue: settings.branchPrefix,
                key: `prefix-${settings.branchPrefix}`,
                onBlur: event => {
                  const next = event.target.value
                  if (next !== settings.branchPrefix) void saveSettings({ branchPrefix: next })
                },
              })),
          )
          : null,
        error ? h('div', { className: 'eg-errorbar', role: 'alert' }, h('span', null, `${t('error')}: ${error}`), h('button', { type: 'button', className: 'eg-iconbtn', onClick: () => setError(null) }, '×')) : null,
        notice ? h('div', { className: 'eg-notice', role: 'status' }, notice) : null,
        payload && payload.warnings && payload.warnings.length > 0
          ? h('div', { className: 'eg-warnbar' }, h('strong', null, `${t('warnings')}: `), payload.warnings.join(' · '))
          : null,
        !loading && project === null && error === null
          ? h('div', { className: 'eg-empty-state' }, h('p', null, t('noSession')))
          : null,
        !loading && projectIsGit === false
          ? h('div', { className: 'eg-empty-state' },
            h('p', null, t('notGit')),
            candidates.length > 0
              ? h('div', { className: 'eg-candidates' },
                h('p', { className: 'eg-candidates-title' }, t('repoCandidates')),
                candidates.map(candidate => h('div', { key: candidate.path, className: 'eg-candidate' },
                  h('div', { className: 'eg-candidate-info' },
                    h('span', { className: 'eg-candidate-name' }, candidate.title),
                    candidate.branch ? h('span', { className: 'eg-candidate-branch' }, candidate.branch) : null,
                    h('span', { className: 'eg-candidate-path', title: candidate.path }, candidate.relative || candidate.path)),
                  h('button', { type: 'button', className: 'eg-btn eg-btn-primary', onClick: () => openCandidate(candidate.path) }, t('openRepo')))))
              : null,
            h('button', { type: 'button', className: 'eg-btn', onClick: initialize }, t('initialize')))
          : null,
        payload && !payload.repo.branch && loading === false && payload.commits.length === 0
          ? h('div', { className: 'eg-empty-state' },
            h('p', null, t('noCommits')),
            h('button', { type: 'button', className: 'eg-btn', onClick: initialize }, t('initialize')))
          : null,
        loading && !payload
          ? h('div', { className: 'eg-empty-state' }, h('p', null, t('loading')))
          : null,
        payload
          ? h('div', { className: 'eg-body' },
            h(BranchRail, {
              payload,
              busy,
              branchName,
              setBranchName,
              onCreateBranch: createBranch,
              onSelectBranch: branch => setSelectedHash(branch.hash),
              onSwitch: switchBranch,
              onPush: branch => push(branch),
            }),
            h('section', { className: 'eg-main' },
              h(Graph, {
                payload,
                selectedHash,
                onSelect: setSelectedHash,
              })),
            h(DetailPanel, {
              payload,
              commit,
              selectedHash,
              busy: busy || (explainBusy ? 'explain' : null),
              explain,
              explaining: explainBusy,
              allowConsent: consentOpen,
              onConsent: acceptConsent,
              onExplain: explainLocal,
              onPush: push,
            }),
          )
          : null,
        payload
          ? h(Composer, {
            payload,
            message,
            setMessage,
            selected,
            toggleFile,
            selectedCount,
            allowSensitive,
            setAllowSensitive: next => {
              if (next && !window.confirm(t('sensitiveConfirm'))) return
              setAllowSensitive(next)
            },
            onCommit: () => commitNow(false),
            onCommitAndPush: () => commitNow(true),
            busy,
            t,
          })
          : null,
      )
    }

    /**
     * A crashing panel must show its reason and leave a host-side trace instead of
     * leaving an empty tab. React reports effects and render failures here.
     */
    class PanelBoundary extends React.Component {
      constructor(props) {
        super(props)
        this.state = { error: null, info: null }
        this.retry = this.retry.bind(this)
      }

      static getDerivedStateFromError(error) {
        return { error: error instanceof Error ? error : new Error(String(error)) }
      }

      componentDidCatch(error, info) {
        this.setState({ info: info && info.componentStack ? info.componentStack : null })
        try {
          const message = error instanceof Error ? `${error.name}: ${error.message}\n${error.stack || ''}` : String(error)
          void fetch('/easygit/client-error', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              message,
              componentStack: info && info.componentStack ? info.componentStack : '',
            }),
          }).catch(() => {})
        } catch {
          /* diagnostics must never crash the boundary */
        }
      }

      retry() {
        this.setState({ error: null, info: null })
      }

      render() {
        if (this.state.error === null) return this.props.children
        const text = `${this.state.error.name}: ${this.state.error.message}\n\n${this.state.error.stack || ''}\n\n${this.state.info || ''}`
        return h('div', { className: 'eg-root eg-crash', role: 'alert' },
          h('div', { className: 'eg-crash-card' },
            h('strong', null, translate('crashTitle')),
            h('pre', null, text.trim()),
            h('button', { type: 'button', className: 'eg-btn', onClick: this.retry }, translate('retry'))))
      }
    }

    function EasyGitBody(props) {
      return h(PanelBoundary, null, h(Panel, props))
    }

    // ---------------------------------------------------------------- icon

    function EasyGitMark(props) {      const size = props && typeof props.size === 'number' ? props.size : 16
      return h('svg', {
        width: size,
        height: size,
        viewBox: '0 0 64 64',
        fill: 'none',
        'aria-hidden': true,
      },
      h('rect', { x: 4, y: 4, width: 56, height: 56, rx: 12, stroke: 'currentColor', strokeWidth: 3, opacity: 0.35 }),
      h('path', { d: 'M20 16v32', stroke: 'currentColor', strokeWidth: 4, strokeLinecap: 'round' }),
      h('path', { d: 'M20 27c9 0 11 4 11 10v10', stroke: 'currentColor', strokeWidth: 3.4, strokeLinecap: 'round', opacity: 0.75 }),
      h('circle', { cx: 20, cy: 16, r: 4.6, fill: 'currentColor' }),
      h('circle', { cx: 20, cy: 48, r: 4.2, fill: 'currentColor' }),
      h('circle', { cx: 31, cy: 48, r: 4.2, fill: 'currentColor', opacity: 0.75 }),
      )
    }

    function PanelIcon(props) {
      const size = props && typeof props.size === 'number' ? props.size : 16
      return h('span', { className: 'eg-panel-icon' }, h(EasyGitMark, { size }))
    }

    // ---------------------------------------------------------------- styles

    const STYLE = `
.eg-root {
  --eg-c0:#38bdf8; --eg-c1:#818cf8; --eg-c2:#2dd4bf; --eg-c3:#4ade80;
  --eg-c4:#fbbf24; --eg-c5:#fb923c; --eg-c6:#a78bfa; --eg-c7:#f472b6;
  --eg-c8:#94a3b8; --eg-c9:#f87171;
  display:flex; flex-direction:column; height:100%; min-height:0; max-height:100%; overflow:hidden;
  container-type:inline-size;
  background:var(--dsw-alias-bg-base); color:var(--dsw-alias-label-primary);
  font-family:inherit; font-size:13px;
}
body:not([data-ds-dark-theme]) .eg-root {
  --eg-c0:#0284c7; --eg-c1:#4f46e5; --eg-c2:#0d9488; --eg-c3:#16a34a;
  --eg-c4:#d97706; --eg-c5:#ea580c; --eg-c6:#7c3aed; --eg-c7:#db2777;
  --eg-c8:#64748b; --eg-c9:#dc2626;
}
.eg-top { display:flex; align-items:center; gap:10px; padding:10px 14px; border-bottom:1px solid var(--dsw-alias-border-l1); flex-wrap:wrap; }
.eg-logo { display:inline-flex; align-items:center; gap:7px; font-weight:600; letter-spacing:.01em; }
.eg-repopick { display:flex; align-items:center; gap:7px; min-width:0; }
.eg-select, .eg-input { background:var(--dsw-alias-bg-layer-1); color:inherit; border:1px solid var(--dsw-alias-border-l2); border-radius:var(--dsw-radius-md,6px); padding:5px 8px; font:inherit; font-size:12px; max-width:320px; }
.eg-select { max-width:260px; }
.eg-current { display:inline-flex; align-items:center; gap:6px; padding:3px 9px; border-radius:999px; background:var(--dsw-alias-bg-layer-1); border:1px solid var(--dsw-alias-border-l1); font-size:12px; }
.eg-currentdot { width:7px; height:7px; border-radius:50%; background:var(--eg-c6); box-shadow:0 0 0 2px color-mix(in srgb, var(--eg-c6) 25%, transparent); }
.eg-spacer { flex:1; }
.eg-btn { border:1px solid var(--dsw-alias-border-l2); background:transparent; color:inherit; border-radius:var(--dsw-radius-md,6px); padding:5px 10px; font:inherit; font-size:12px; cursor:pointer; white-space:nowrap; }
.eg-btn:hover:not(:disabled) { background:var(--dsw-alias-interactive-bg-hover); }
.eg-btn:disabled { opacity:.5; cursor:default; }
.eg-btn-primary { background:var(--dsw-alias-brand-primary); border-color:transparent; color:var(--dsw-alias-bg-base); font-weight:500; }
.eg-btn-primary:hover:not(:disabled) { background:var(--dsw-alias-brand-primary); filter:brightness(1.06); }
.eg-btn-quiet { border-color:transparent; color:var(--dsw-alias-label-secondary); padding:4px 8px; }
.eg-btn-quiet:hover:not(:disabled) { color:inherit; }
.eg-iconbtn { border:none; background:transparent; color:var(--dsw-alias-label-secondary); cursor:pointer; width:24px; height:24px; border-radius:var(--dsw-radius-sm,4px); display:inline-flex; align-items:center; justify-content:center; font:inherit; }
.eg-iconbtn:hover:not(:disabled) { background:var(--dsw-alias-interactive-bg-hover); color:var(--dsw-alias-label-primary); }
.eg-addbar, .eg-settings { display:flex; gap:8px; align-items:center; padding:8px 14px; border-bottom:1px solid var(--dsw-alias-border-l1); flex-wrap:wrap; background:var(--dsw-alias-bg-layer-1); }
.eg-settings { flex-direction:column; align-items:flex-start; }
.eg-checkline { display:inline-flex; align-items:center; gap:7px; font-size:12px; color:var(--dsw-alias-label-secondary); cursor:pointer; }
.eg-errorbar { display:flex; align-items:center; gap:8px; padding:7px 14px; background:color-mix(in srgb, var(--dsw-alias-state-error-primary) 14%, transparent); color:var(--dsw-alias-state-error-primary); border-bottom:1px solid var(--dsw-alias-border-l1); }
.eg-notice { padding:7px 14px; background:color-mix(in srgb, var(--dsw-alias-state-success-primary) 14%, transparent); color:var(--dsw-alias-state-success-primary); border-bottom:1px solid var(--dsw-alias-border-l1); }
.eg-warnbar { padding:6px 14px; font-size:12px; color:var(--dsw-alias-state-warn-primary); border-bottom:1px solid var(--dsw-alias-border-l1); }
.eg-empty-state { flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:12px; color:var(--dsw-alias-label-secondary); padding:30px; text-align:center; }
.eg-body { flex:1; display:flex; min-height:0; }
.eg-rail { width:230px; min-width:190px; border-right:1px solid var(--dsw-alias-border-l1); overflow:auto; padding:8px 6px; }
.eg-rail-head { display:flex; align-items:center; gap:5px; padding:4px 6px 8px; }
.eg-rail-title { font-size:11px; text-transform:uppercase; letter-spacing:.06em; color:var(--dsw-alias-label-secondary); padding:0; flex:0 0 auto; }
.eg-rail-input { flex:1 1 auto; min-width:50px; max-width:130px; font-size:11px; padding:3px 6px; }
.eg-btn-small { font-size:11px; padding:3px 7px; }
.eg-branchrow { display:flex; align-items:center; gap:4px; border-radius:var(--dsw-radius-sm,4px); }
.eg-branchrow:hover { background:var(--dsw-alias-interactive-bg-hover); }
.eg-branchrow.is-head { background:color-mix(in srgb, var(--eg-c6) 12%, transparent); }
.eg-branch-select { display:flex; align-items:center; gap:6px; min-width:0; flex:1; border:none; background:transparent; color:inherit; font:inherit; font-size:12px; padding:5px 6px; cursor:pointer; text-align:left; }
.eg-branchdot { width:8px; height:8px; border-radius:50%; flex:0 0 auto; }
.eg-branchname { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:120px; }
.eg-branchtrack { font-size:10px; color:var(--dsw-alias-label-secondary); font-variant-numeric:tabular-nums; }
.eg-branchdiv { font-size:10px; color:var(--dsw-alias-label-tertiary,var(--dsw-alias-label-secondary)); font-variant-numeric:tabular-nums; white-space:nowrap; }
.eg-candidates { width:100%; max-width:520px; display:flex; flex-direction:column; gap:6px; margin:4px 0 8px; text-align:left; }
.eg-candidates-title { margin:0 0 2px; font-size:11px; text-transform:uppercase; letter-spacing:.06em; color:var(--dsw-alias-label-secondary); }
.eg-candidate { display:flex; align-items:center; gap:8px; padding:7px 9px; border:1px solid var(--dsw-alias-border-l1); border-radius:var(--dsw-radius-md,6px); background:var(--dsw-alias-bg-layer-1); }
.eg-candidate-info { display:flex; align-items:baseline; gap:8px; min-width:0; flex:1; flex-wrap:wrap; }
.eg-candidate-name { font-size:12px; font-weight:500; color:var(--dsw-alias-label-primary); }
.eg-candidate-branch { font-size:10px; padding:1px 5px; border-radius:3px; background:color-mix(in srgb, var(--dsw-alias-brand-primary) 14%, transparent); color:var(--dsw-alias-brand-primary); }
.eg-candidate-path { font-size:10px; color:var(--dsw-alias-label-secondary); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:240px; }
.eg-branchactions { display:flex; opacity:0; }
.eg-branchrow:hover .eg-branchactions { opacity:1; }
.eg-badge { font-size:9px; line-height:1; padding:2px 4px; border-radius:3px; background:color-mix(in srgb, var(--eg-c6) 22%, transparent); color:var(--eg-c6); border:1px solid color-mix(in srgb, var(--eg-c6) 30%, transparent); }
.eg-badge-quiet { background:transparent; color:var(--dsw-alias-label-secondary); border-color:var(--dsw-alias-border-l2); }
.eg-badge-warn { color:var(--dsw-alias-state-warn-primary); border-color:color-mix(in srgb, var(--dsw-alias-state-warn-primary) 40%, transparent); background:color-mix(in srgb, var(--dsw-alias-state-warn-primary) 12%, transparent); }
.eg-taskchip { font-size:10px; padding:1px 5px; border-radius:3px; background:color-mix(in srgb, var(--eg-c2) 18%, transparent); color:var(--eg-c2); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:150px; }
.eg-main { flex:1; min-width:0; overflow:auto; }
.eg-graphline { display:flex; align-items:flex-start; min-width:max-content; padding-bottom:20px; }
.eg-graph-svg { flex:0 0 auto; display:block; }
.eg-commitlist { min-width:0; flex:1; }
.eg-commitrow { display:flex; align-items:center; gap:9px; padding:0 12px 0 6px; cursor:pointer; border-left:2px solid transparent; box-sizing:border-box; }
.eg-commitrow:hover { background:var(--dsw-alias-interactive-bg-hover); }
.eg-commitrow.is-selected { background:color-mix(in srgb, var(--dsw-alias-brand-primary) 12%, transparent); border-left-color:var(--dsw-alias-brand-primary); }
.eg-commitrow:focus-visible { outline:1px solid var(--dsw-focus-ring-color); outline-offset:-1px; }
.eg-refs { display:inline-flex; gap:4px; flex:0 0 auto; max-width:46%; overflow:hidden; }
.eg-ref { font-size:10px; line-height:1; padding:2px 5px; border-radius:3px; border:1px solid color-mix(in srgb, var(--eg-ref-color) 40%, transparent); color:var(--eg-ref-color); background:color-mix(in srgb, var(--eg-ref-color) 10%, transparent); white-space:nowrap; max-width:160px; overflow:hidden; text-overflow:ellipsis; }
.eg-ref-tag { color:var(--dsw-alias-label-secondary); border-color:var(--dsw-alias-border-l2); background:transparent; }
.eg-ref.is-head { font-weight:600; }
.eg-subject { flex:1; min-width:80px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:12.5px; }
.eg-meta { font-size:11px; color:var(--dsw-alias-label-secondary); white-space:nowrap; max-width:220px; overflow:hidden; text-overflow:ellipsis; }
.eg-hash { font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace; font-size:11px; color:var(--dsw-alias-label-secondary); }
.eg-dim { color:var(--dsw-alias-label-secondary); }
.eg-detail { width:330px; min-width:260px; border-left:1px solid var(--dsw-alias-border-l1); overflow:auto; padding:12px 14px; }
.eg-detail-title { font-size:11px; text-transform:uppercase; letter-spacing:.06em; color:var(--dsw-alias-label-secondary); margin-bottom:8px; }
.eg-detail-subject { font-size:14px; font-weight:600; line-height:1.35; margin-bottom:6px; }
.eg-detail-meta { display:flex; gap:4px; align-items:baseline; font-size:11.5px; color:var(--dsw-alias-label-secondary); margin-bottom:8px; flex-wrap:wrap; }
.eg-detail-stats { display:flex; gap:10px; font-size:12px; padding:6px 0; border-top:1px solid var(--dsw-alias-border-l1); border-bottom:1px solid var(--dsw-alias-border-l1); margin-bottom:8px; }
.eg-add { color:var(--dsw-alias-state-success-primary); font-variant-numeric:tabular-nums; }
.eg-del { color:var(--dsw-alias-state-error-primary); font-variant-numeric:tabular-nums; }
.eg-filelist { display:flex; flex-direction:column; gap:3px; font-size:11.5px; margin-bottom:10px; }
.eg-filerow { display:flex; gap:8px; align-items:baseline; }
.eg-filename { flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace; font-size:11px; }
.eg-detail-actions { display:flex; gap:8px; margin:10px 0; }
.eg-hint { font-size:11.5px; color:var(--dsw-alias-state-warn-primary); padding:6px 8px; border:1px solid color-mix(in srgb, var(--dsw-alias-state-warn-primary) 35%, transparent); border-radius:var(--dsw-radius-sm,4px); margin-bottom:8px; }
.eg-explanation { white-space:pre-wrap; font-size:12.5px; line-height:1.55; padding:10px; border-radius:var(--dsw-radius-md,6px); background:var(--dsw-alias-bg-layer-1); border:1px solid var(--dsw-alias-border-l1); }
.eg-consent { position:fixed; z-index:20; left:50%; top:50%; transform:translate(-50%,-50%); width:min(440px,90vw); padding:16px; border-radius:var(--dsw-radius-lg,10px); background:var(--dsw-alias-bg-overlay); border:1px solid var(--dsw-alias-border-l2); box-shadow:0 16px 40px rgba(0,0,0,.35); font-size:12.5px; line-height:1.5; }
.eg-consent-actions { display:flex; justify-content:flex-end; gap:8px; margin-top:12px; }
.eg-composer { border-top:1px solid var(--dsw-alias-border-l1); padding:10px 14px 12px; background:var(--dsw-alias-bg-layer-1); }
.eg-composer-head { display:flex; align-items:center; justify-content:space-between; gap:10px; font-size:12px; margin-bottom:8px; }
.eg-composer-status { color:var(--dsw-alias-label-secondary); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.eg-warn { color:var(--dsw-alias-state-warn-primary); }
.eg-composer-body { display:flex; gap:12px; align-items:stretch; }
.eg-filepicker { width:42%; max-height:150px; overflow:auto; border:1px solid var(--dsw-alias-border-l1); border-radius:var(--dsw-radius-md,6px); padding:4px; }
.eg-filecheck { display:flex; align-items:center; gap:6px; padding:3px 5px; border-radius:var(--dsw-radius-sm,4px); cursor:pointer; font-size:11.5px; }
.eg-filecheck:hover { background:var(--dsw-alias-interactive-bg-hover); }
.eg-filecheck.is-disabled { opacity:.5; cursor:not-allowed; }
.eg-filecheck.is-sensitive .eg-filename { color:var(--dsw-alias-state-warn-primary); }
.eg-filebadge { font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace; font-size:10px; width:15px; text-align:center; color:var(--dsw-alias-label-secondary); }
.eg-filebadge.is-sensitive { color:var(--dsw-alias-state-warn-primary); }
.eg-commitbox { flex:1; min-width:0; display:flex; flex-direction:column; gap:8px; }
.eg-textarea { width:100%; box-sizing:border-box; resize:vertical; min-height:52px; max-height:150px; background:var(--dsw-alias-bg-base); color:inherit; border:1px solid var(--dsw-alias-border-l2); border-radius:var(--dsw-radius-md,6px); padding:8px 10px; font:inherit; font-size:12.5px; }
.eg-textarea:focus { outline:1px solid var(--dsw-focus-ring-color); }
.eg-commitactions { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
.eg-empty { color:var(--dsw-alias-label-secondary); padding:14px; font-size:12px; text-align:center; }
.eg-initbar { display:flex; align-items:center; gap:10px; padding:10px 14px; border-top:1px solid var(--dsw-alias-border-l1); background:var(--dsw-alias-bg-layer-1); }
.eg-tabtitle { display:inline-flex; align-items:center; gap:6px; }
.eg-project { max-width:220px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:12px; color:var(--dsw-alias-label-secondary); }
.eg-crash { padding:14px; overflow:auto; }
.eg-crash-card { display:flex; flex-direction:column; gap:10px; }
.eg-crash-card pre { white-space:pre-wrap; word-break:break-word; font-size:10.5px; line-height:1.45; background:var(--dsw-alias-bg-layer-1); border:1px solid var(--dsw-alias-border-l1); border-radius:var(--dsw-radius-md,6px); padding:10px; margin:0; }
@media (max-width: 980px) {
  .eg-detail { width:260px; min-width:220px; }
  .eg-composer-body { flex-direction:column; }
  .eg-filepicker { width:100%; }
}
/* Right sidebar: a narrow, tall column. Stack every section vertically. */
@container (max-width: 680px) {
  .eg-root { overflow-y:auto; }
  .eg-top { padding:8px 10px; gap:6px; }
  .eg-logo { font-size:12px; }
  .eg-repopick { flex:1 1 100%; min-width:0; }
  .eg-select { flex:1; max-width:none; min-width:0; }
  .eg-current { font-size:11px; }
  .eg-body { flex:0 0 auto; flex-direction:column; overflow:visible; }
  .eg-rail { width:auto; min-width:0; max-height:128px; border-right:none; border-bottom:1px solid var(--dsw-alias-border-l1); }
  .eg-branchname { max-width:180px; }
  .eg-main { flex:0 0 auto; min-width:0; max-height:320px; overflow:auto; }
  .eg-detail { width:auto; min-width:0; border-left:none; border-top:1px solid var(--dsw-alias-border-l1); }
  .eg-meta, .eg-hash { display:none; }
  .eg-refs { max-width:58%; }
  .eg-commitrow { gap:6px; padding-right:8px; }
  .eg-composer { position:sticky; bottom:0; z-index:2; padding:8px 10px 10px; }
  .eg-composer-body { flex-direction:column; }
  .eg-filepicker { width:100%; max-height:92px; }
  .eg-detail-actions .eg-btn { flex:1; }
  .eg-detail-actions { position:sticky; bottom:0; }
}
`

    // ---------------------------------------------------------------- mount

    function EasyGitTitle() {
      useLocaleRevision()
      return h('span', { className: 'eg-tabtitle' }, h(EasyGitMark, { size: 14 }), h('span', null, translate('title')))
    }

    function apply(ctx) {
      CTX = ctx
      fallbackLang = detectLang()
      const getService = name => {
        try {
          if (ctx && typeof ctx.get === 'function') return ctx.get(name)
          return ctx ? ctx[name] : undefined
        } catch {
          return undefined
        }
      }
      const slots = (ctx && ctx.slots) || getService('slots')
      if (!slots || typeof slots.register !== 'function') {
        console.error('[easygit] slots service is unavailable; the panel cannot mount')
        return
      }
      const disposers = []
      let mountedInRightbar = false

      // Primary home: one page type in the right sidebar tab system. Its guide
      // entry is the tile the "Start" page lists; picking it opens the tab.
      const tabs = (ctx && ctx.sidebarRightTabs) || getService('sidebarRightTabs')
      if (tabs && typeof tabs.register === 'function') {
        try {
          const definition = {
            id: 'easygit',
            kind: 'easygit',
            title: () => translate('title'),
            guide: [{
              id: 'easygit',
              order: 20,
              title: () => translate('title'),
              description: () => translate('guideDescription'),
              icon: EasyGitMark,
            }],
          }
          if (ctx && typeof ctx.effect === 'function') {
            ctx.effect(() => tabs.register(definition), 'easygit: right sidebar tab type')
          } else {
            disposers.push(tabs.register(definition))
          }
          disposers.push(slots.inject('sidebar.right.pane.tab', () => slots.register({
            name: 'sidebar.right.pane.tab',
            key: definition.id,
          }, EasyGitBody)))
          disposers.push(slots.inject('sidebar.right.pane.tab.title', () => slots.register({
            name: 'sidebar.right.pane.tab.title',
            key: definition.id,
          }, EasyGitTitle)))
          mountedInRightbar = true
        } catch (error) {
          console.error('[easygit] right sidebar tab registration failed:', error)
        }
      }

      // Fallback for profiles without the right Sidebar: keep a main panel and
      // a left rail entry so EasyGit stays reachable.
      if (!mountedInRightbar) {
        try {
          disposers.push(slots.inject('main', () => slots.register({ name: 'main', key: 'easygit' }, EasyGitBody)))
        } catch (error) {
          console.error('[easygit] main panel registration failed:', error)
        }
        try {
          disposers.push(slots.inject('sidebar.panellist', () => slots.register({
            name: 'sidebar.panellist',
            id: 'easygit',
            order: 12,
            label: () => translate('openInPanel'),
          }, PanelIcon)))
        } catch (error) {
          console.error('[easygit] sidebar registration failed:', error)
        }
      }

      if (ctx && typeof ctx.effect === 'function') {
        ctx.effect(() => () => {
          for (const dispose of disposers.splice(0).reverse()) {
            try {
              dispose()
            } catch {
              /* ignore */
            }
          }
          CTX = null
        }, 'easygit: client mount')
      }
    }

    return { inject: ['slots', 'sidebarRightTabs'], apply }
  },
})
