const express = require("express");
const fs = require("fs/promises");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3100;

const dataDir = path.join(__dirname, "data");
const parksFile = path.join(dataDir, "parks.json");
const activationsFile = path.join(dataDir, "activations.json");

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

async function readJson(filePath, fallback) {
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    return JSON.parse(raw);
  } catch (error) {
    if (error.code === "ENOENT") {
      return fallback;
    }
    throw error;
  }
}

async function writeJson(filePath, value) {
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf-8");
}

function normalizeCallsign(callsign) {
  return callsign.trim().toUpperCase();
}

function normalizeLogType(logType) {
  return logType === "hunted" ? "hunted" : "activation";
}

function byCountyThenName(a, b) {
  return a.county.localeCompare(b.county) || a.name.localeCompare(b.name);
}

app.get("/api/parks", async (req, res) => {
  try {
    const [parks, activations] = await Promise.all([
      readJson(parksFile, []),
      readJson(activationsFile, []),
    ]);

    const parkLogMap = new Map();

    for (const entry of activations) {
      const normalizedEntry = {
        ...entry,
        logType: normalizeLogType(entry.logType),
      };

      if (!parkLogMap.has(normalizedEntry.parkId)) {
        parkLogMap.set(normalizedEntry.parkId, []);
      }
      parkLogMap.get(normalizedEntry.parkId).push(normalizedEntry);
    }

    const parksWithStatus = parks
      .map((park) => {
        const parkLogs = parkLogMap.get(park.id) || [];
        const parkActivations = parkLogs.filter((a) => a.logType === "activation");
        const parkHunts = parkLogs.filter((a) => a.logType === "hunted");
        const uniqueActivators = [...new Set(parkActivations.map((a) => a.callsign))];
        const uniqueHunters = [...new Set(parkHunts.map((a) => a.callsign))];

        return {
          ...park,
          activated: parkActivations.length > 0,
          hunted: parkHunts.length > 0,
          activators: uniqueActivators,
          hunters: uniqueHunters,
          activationCount: parkActivations.length,
          huntedCount: parkHunts.length,
        };
      })
      .sort(byCountyThenName);

    const normalizedActivations = activations.map((entry) => ({
      ...entry,
      logType: normalizeLogType(entry.logType),
    }));

    const activationEntries = normalizedActivations.filter((e) => e.logType === "activation").length;
    const huntedEntries = normalizedActivations.filter((e) => e.logType === "hunted").length;

    res.json({
      parks: parksWithStatus,
      activations: normalizedActivations,
      totals: {
        allParks: parksWithStatus.length,
        activatedParks: parksWithStatus.filter((p) => p.activated).length,
        huntedParks: parksWithStatus.filter((p) => p.hunted).length,
        activationEntries,
        huntedEntries,
      },
    });
  } catch (error) {
    res.status(500).json({ error: "Unable to load parks" });
  }
});

app.post("/api/activations", async (req, res) => {
  try {
    const { parkId, callsign, date, logType } = req.body;

    if (!parkId || typeof parkId !== "string") {
      return res.status(400).json({ error: "parkId is required" });
    }

    if (!callsign || typeof callsign !== "string" || !callsign.trim()) {
      return res.status(400).json({ error: "callsign is required" });
    }

    const [parks, activations] = await Promise.all([
      readJson(parksFile, []),
      readJson(activationsFile, []),
    ]);

    const park = parks.find((p) => p.id === parkId);
    if (!park) {
      return res.status(404).json({ error: "Park not found" });
    }

    const activationDate = date || new Date().toISOString().slice(0, 10);
    const entry = {
      id: `${Date.now()}-${Math.floor(Math.random() * 10000)}`,
      parkId,
      callsign: normalizeCallsign(callsign),
      logType: normalizeLogType(logType),
      date: activationDate,
      loggedAt: new Date().toISOString(),
    };

    activations.push(entry);
    await writeJson(activationsFile, activations);

    res.status(201).json({ message: "Entry logged", activation: entry, park });
  } catch (error) {
    res.status(500).json({ error: "Unable to log activation" });
  }
});

app.delete("/api/activations/:id", async (req, res) => {
  try {
    const id = req.params.id;
    const activations = await readJson(activationsFile, []);

    const filtered = activations.filter((a) => a.id !== id);
    if (filtered.length === activations.length) {
      return res.status(404).json({ error: "Activation not found" });
    }

    await writeJson(activationsFile, filtered);
    res.json({ message: "Activation removed" });
  } catch (error) {
    res.status(500).json({ error: "Unable to remove activation" });
  }
});

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`POTA contest site running at http://localhost:${PORT}`);
});
