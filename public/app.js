const form = document.getElementById("activation-form");
const formMessage = document.getElementById("form-message");
const parkSelect = document.getElementById("park");
const globalProgressEl = document.getElementById("global-progress");
const countyProgressEl = document.getElementById("county-progress");
const callsignTallyEl = document.getElementById("callsign-tally");
const unactivatedListEl = document.getElementById("unactivated-list");
const activationLogEl = document.getElementById("activation-log");

let state = {
  parks: [],
  activations: [],
  totals: {
    allParks: 0,
    activatedParks: 0,
    huntedParks: 0,
    activationEntries: 0,
    huntedEntries: 0,
  },
};

function sanitize(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function byCountyThenName(a, b) {
  return a.county.localeCompare(b.county) || a.name.localeCompare(b.name);
}

async function fetchData() {
  const response = await fetch("/api/parks");
  if (!response.ok) {
    throw new Error("Failed to load park data");
  }
  const payload = await response.json();
  state.parks = payload.parks;
  state.activations = payload.activations;
  state.totals = payload.totals || state.totals;
}

function renderParkSelector() {
  const sorted = [...state.parks].sort(byCountyThenName);

  const placeholder = '<option value="" disabled selected>Pick a Park</option>';
  const parkOptions = sorted
    .map((park) => {
      let statusLabel = "";
      if (park.activated && park.hunted) {
        statusLabel = " ACTIVATED & HUNTED";
      } else if (park.activated) {
        statusLabel = " ACTIVATED";
      } else if (park.hunted) {
        statusLabel = " HUNTED";
      }

      const isLocked = park.activated && park.hunted;
      const disabledAttr = isLocked ? " disabled" : "";
      return `<option value="${park.id}"${disabledAttr}>${sanitize(park.name)} (${sanitize(park.county)})${statusLabel}</option>`;
    })
    .join("");

  parkSelect.innerHTML = `${placeholder}${parkOptions}`;
}

function computeCountyStats(parks) {
  const grouped = new Map();

  for (const park of parks) {
    if (!grouped.has(park.county)) {
      grouped.set(park.county, { total: 0, activated: 0, hunted: 0 });
    }

    const county = grouped.get(park.county);
    county.total += 1;
    if (park.activated) {
      county.activated += 1;
    }
    if (park.hunted) {
      county.hunted += 1;
    }
  }

  return [...grouped.entries()].map(([county, stats]) => ({ county, ...stats }));
}

function renderProgress() {
  const all = state.totals.allParks;
  const activated = state.totals.activatedParks;
  const hunted = state.totals.huntedParks;
  const activationEntries = state.totals.activationEntries;
  const huntedEntries = state.totals.huntedEntries;
  const pctActivated = all === 0 ? 0 : Math.round((activated / all) * 100);
  const pctHunted = all === 0 ? 0 : Math.round((hunted / all) * 100);

  globalProgressEl.innerHTML = `
    <strong>Club Progress:</strong>
    <div>${activated} of ${all} parks activated (${pctActivated}%)</div>
    <div>${hunted} of ${all} parks hunted (${pctHunted}%)</div>
    <div class="meta">Total activation logs: ${activationEntries} | Total hunted logs: ${huntedEntries}</div>
    <div class="progress-bar"><div class="progress-fill" style="width: ${pctActivated}%;"></div></div>
    <div class="progress-bar secondary"><div class="progress-fill" style="width: ${pctHunted}%;"></div></div>
  `;

  const countyStats = computeCountyStats(state.parks);
  countyProgressEl.innerHTML = countyStats
    .map((county) => {
      const pctCounty = county.total === 0 ? 0 : Math.round((county.activated / county.total) * 100);
      return `
        <article class="county-card">
          <strong>${sanitize(county.county)} County</strong>
          <div>${county.activated} / ${county.total} activated (${pctCounty}%)</div>
          <div>${county.hunted} / ${county.total} hunted</div>
          <div class="progress-bar"><div class="progress-fill" style="width: ${pctCounty}%;"></div></div>
        </article>
      `;
    })
    .join("");
}

function renderParkLists() {
  const allParks = [...state.parks].sort(byCountyThenName);

  unactivatedListEl.innerHTML =
    allParks.length === 0
      ? '<p class="empty">No parks available.</p>'
      : `
        <div class="status-table-wrap">
          <table class="status-table">
            <thead>
              <tr>
                <th>Park</th>
                <th>County</th>
                <th>Activated</th>
                <th>Hunted</th>
              </tr>
            </thead>
            <tbody>
              ${allParks
                .map(
                  (park) => `
                <tr>
                  <td>
                    <strong>${sanitize(park.name)}</strong>
                    <div class="meta">${sanitize(park.id)}</div>
                  </td>
                  <td>${sanitize(park.county)}</td>
                  <td class="status-cell">${park.activated ? '<span class="status-mark is-checked">&#10003;</span>' : '<span class="status-mark">&nbsp;</span>'}</td>
                  <td class="status-cell">${park.hunted ? '<span class="status-mark is-checked">&#10003;</span>' : '<span class="status-mark">&nbsp;</span>'}</td>
                </tr>
              `,
                )
                .join("")}
            </tbody>
          </table>
        </div>
      `;
}

function renderActivationLog() {
  const parksById = new Map(state.parks.map((p) => [p.id, p]));
  const sortedLog = [...state.activations].sort((a, b) => b.loggedAt.localeCompare(a.loggedAt));

  activationLogEl.innerHTML =
    sortedLog.length === 0
      ? '<p class="empty">No activations logged yet.</p>'
      : sortedLog
          .map((entry) => {
            const park = parksById.get(entry.parkId);
            const isHunted = entry.logType === "hunted";
            const actionWord = isHunted ? "hunted" : "activated";
            return `
              <article class="log-item">
                <div class="log-main">
                  <strong>${sanitize(entry.callsign)}</strong> ${actionWord}
                  <strong>${sanitize(park ? park.name : entry.parkId)}</strong>
                  on ${sanitize(entry.date)}
                </div>
                <button class="delete-activation" type="button" data-activation-id="${sanitize(entry.id)}">Delete</button>
              </article>
            `;
          })
          .join("");
}

function renderCallsignTallies() {
  const byCallsign = new Map();

  for (const entry of state.activations) {
    if (!byCallsign.has(entry.callsign)) {
      byCallsign.set(entry.callsign, {
        activatedParks: new Set(),
        huntedParks: new Set(),
      });
    }

    const callsignStats = byCallsign.get(entry.callsign);
    if (entry.logType === "hunted") {
      callsignStats.huntedParks.add(entry.parkId);
    } else {
      callsignStats.activatedParks.add(entry.parkId);
    }
  }

  const rows = [...byCallsign.entries()]
    .map(([callsign, stats]) => ({
      callsign,
      activatedParks: stats.activatedParks.size,
      huntedParks: stats.huntedParks.size,
      totalParks: stats.activatedParks.size + stats.huntedParks.size,
    }))
    .sort((a, b) => b.totalParks - a.totalParks || a.callsign.localeCompare(b.callsign));

  callsignTallyEl.innerHTML =
    rows.length === 0
      ? '<p class="empty">No callsign activity logged yet.</p>'
      : `
        <table class="tally-table">
          <thead>
            <tr>
              <th>Callsign</th>
              <th>Activated Parks</th>
              <th>Hunted Parks</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            ${rows
              .map(
                (row) => `
              <tr>
                <td><strong>${sanitize(row.callsign)}</strong></td>
                <td>${row.activatedParks}</td>
                <td>${row.huntedParks}</td>
                <td>${row.totalParks}</td>
              </tr>
            `,
              )
              .join("")}
          </tbody>
        </table>
      `;
}

function renderAll() {
  renderParkSelector();
  renderProgress();
  renderCallsignTallies();
  renderParkLists();
  renderActivationLog();
}

async function refresh() {
  await fetchData();
  renderAll();
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  formMessage.classList.remove("error");
  formMessage.textContent = "";

  const formData = new FormData(form);
  const payload = {
    callsign: formData.get("callsign"),
    parkId: formData.get("parkId"),
    date: formData.get("date") || undefined,
    logType: formData.get("logType") || "activation",
  };

  try {
    const response = await fetch("/api/activations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || "Unable to save activation");
    }

    form.reset();
    document.getElementById("date").valueAsDate = new Date();
    const savedAs = payload.logType === "hunted" ? "Hunted park saved." : "Activation saved.";
    formMessage.textContent = savedAs;

    await refresh();
  } catch (error) {
    formMessage.classList.add("error");
    formMessage.textContent = error.message;
  }
});

activationLogEl.addEventListener("click", async (event) => {
  const button = event.target.closest(".delete-activation");
  if (!button) {
    return;
  }

  const activationId = button.dataset.activationId;
  if (!activationId) {
    return;
  }

  if (!window.confirm("Delete this activation entry?")) {
    return;
  }

  formMessage.classList.remove("error");
  formMessage.textContent = "";

  try {
    const response = await fetch(`/api/activations/${encodeURIComponent(activationId)}`, {
      method: "DELETE",
    });

    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.error || "Unable to delete activation");
    }

    formMessage.textContent = "Activation deleted.";
    await refresh();
  } catch (error) {
    formMessage.classList.add("error");
    formMessage.textContent = error.message;
  }
});

(async function init() {
  document.getElementById("date").valueAsDate = new Date();
  try {
    await refresh();
  } catch (error) {
    formMessage.classList.add("error");
    formMessage.textContent = "Could not load park data. Check server status.";
  }
})();
