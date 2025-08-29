const qs = (sel) => document.querySelector(sel)
const qsa = (sel) => Array.from(document.querySelectorAll(sel))

const statusEl = qs('#status')
const appsSelect = qs('#appsSelect')
const reloadAppsBtn = qs('#reloadApps')
const appInfo = qs('#appInfo')
const releasesSection = qs('#releasesSection')
const releasesEl = qs('#releases')

function setStatus(text, type = 'info') {
  statusEl.textContent = text || ''
  statusEl.className = `status ${type}`
}

async function fetchJSON(url) {
  const res = await fetch(url)
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`${res.status} ${res.statusText} ${body}`)
  }
  return res.json()
}

function renderAppInfo(name) {
  appInfo.classList.remove('hidden')
  appInfo.innerHTML = `
    <h2>App: <code>${name}</code></h2>
    <p>Browse available releases and download assets.</p>
  `
}

function renderReleases(appName, index) {
  releasesSection.classList.remove('hidden')
  const { releases = [], channels = [] } = index || {}
  if (!releases.length) {
    releasesEl.innerHTML = '<p>No releases found.</p>'
    return
  }

  const rows = releases
    .slice()
    .sort((a, b) => (a.version === b.version ? 0 : a.version < b.version ? 1 : -1))
    .map((r) => {
      const assets = Array.isArray(r.assets) ? r.assets : []
      const assetsRows = assets
        .map((a) => `
          <div class="asset">
            <span class="pill">${a.platform}</span>
            <a href="/v1/apps/${encodeURIComponent(appName)}/releases/${encodeURIComponent(r.version)}/download?platform=${encodeURIComponent(a.platform)}" class="btn">Download</a>
            ${a.size ? `<span class="muted">${Number(a.size).toLocaleString()} bytes</span>` : ''}
          </div>
        `)
        .join('')

      return `
        <tr>
          <td class="nowrap">${r.version}</td>
          <td class="nowrap">${r.channel ?? ''}</td>
          <td class="nowrap">${r.pub_date ?? ''}</td>
          <td>${r.notes ?? ''}</td>
          <td>${assetsRows || '<span class="muted">No assets</span>'}</td>
        </tr>
      `
    })
    .join('')

  releasesEl.innerHTML = `
    <div class="meta">
      ${channels.length ? `<div>Channels: ${channels.map((c) => `<span class="pill">${c}</span>`).join(' ')}</div>` : ''}
    </div>
    <div class="table-wrapper">
      <table>
        <thead>
          <tr>
            <th>Version</th>
            <th>Channel</th>
            <th>Published</th>
            <th>Notes</th>
            <th>Assets</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
    </div>
  `
}

async function loadApps() {
  setStatus('Loading apps…')
  try {
    const data = await fetchJSON('/v1/apps')
    const apps = data.apps || []
    appsSelect.innerHTML = apps.map((a) => `<option value="${a}">${a}</option>`).join('')
    setStatus(apps.length ? '' : 'No apps found', apps.length ? 'info' : 'warn')

    if (apps.length) {
      const current = appsSelect.value
      await loadReleases(current)
    }
  } catch (e) {
    console.error(e)
    setStatus(`Failed to load apps: ${e.message}`, 'error')
  }
}

async function loadReleases(appName) {
  setStatus(`Loading releases for ${appName}…`)
  try {
    renderAppInfo(appName)
    const index = await fetchJSON(`/v1/apps/${encodeURIComponent(appName)}/releases`)
    renderReleases(appName, index)
    setStatus('')
  } catch (e) {
    console.error(e)
    releasesEl.innerHTML = ''
    setStatus(`Failed to load releases: ${e.message}`, 'error')
  }
}

appsSelect.addEventListener('change', () => {
  const name = appsSelect.value
  if (name) loadReleases(name)
})

reloadAppsBtn.addEventListener('click', () => loadApps())

// init
loadApps()
