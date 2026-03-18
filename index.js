const axios = require("axios");
const cheerio = require("cheerio");
const express = require("express");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json({
  strict: false
}));
app.use(express.text()); // 🔥 TAMBAHAN
app.use(express.urlencoded({ extended: true }));

// 🔥 TEMP STORAGE (RAM)
let DATA = {};

// ⏳ AUTO DELETE (TTL 1 jam)
const TTL = 60 * 60 * 1000;

function cleanup() {
  const now = Date.now();

  for (let device in DATA) {
    DATA[device] = DATA[device].filter(item => now - item.time < TTL);

    if (DATA[device].length === 0) {
      delete DATA[device];
    }
  }
}

// cleanup tiap 1 menit
setInterval(cleanup, 60 * 1000);

// ✅ HEALTH CHECK
app.get("/", (req, res) => {
  res.send("Onebot Kuma API is running 🚀");
});


// =====================================
// 🔥 POST DATA (SUPPORT MULTI FORMAT)
// =====================================
app.post("/send", async (req, res) => {
  let uuid = "ONE_01";
  let cookie = "";
  let raw = "";

  console.log("📥 RAW BODY:", req.body);

  // =========================
  // ✅ HANDLE JSON
  // =========================
  if (typeof req.body === "object") {
    uuid = req.body.uuid || "ONE_01";

    // 🔥 kalau dari APK notif
    if (typeof req.body.data === "string") {
      raw = req.body.data;
    }

    // 🔥 kalau dari kumabot lama
    if (req.body?.data?.ALIPAYJSESSIONID) {
      cookie = req.body.data.ALIPAYJSESSIONID;
    }
  }

  // =========================
  // ✅ HANDLE STRING BODY
  // =========================
  if (typeof req.body === "string") {
    raw = req.body;

    const match = req.body.match(/ALIPAYJSESSIONID=([^;]+)/);
    if (match) {
      cookie = match[1];
    }
  }

  // =========================
  // 🔥 MODE BARU (NOTIF)
  // =========================
  if (raw) {
    if (!DATA[uuid]) DATA[uuid] = [];

    DATA[uuid].push({
      raw: raw,
      time: Date.now()
    });

    console.log("📩 NOTIF MASUK:", raw);

    return res.json({
      status: true,
      msg: "notif masuk"
    });
  }

  // =========================
  // 🔥 MODE LAMA (COOKIE)
  // =========================
  if (cookie) {
    const transaksi = await scrapeDana(cookie);

    if (!DATA[uuid]) DATA[uuid] = [];

    DATA[uuid].push({
      transaksi,
      time: Date.now()
    });

    console.log("📊 HASIL:", transaksi);

    return res.json({
      status: true,
      msg: "cookie + transaksi masuk"
    });
  }

  // =========================
  // ❌ TIDAK ADA DATA
  // =========================
  return res.json({
    status: false,
    msg: "data tidak dikenali"
  });
});

// =====================================
// 📊 GET DATA UNTUK PANEL
// =====================================
app.get("/data", (req, res) => {
  let result = [];

  for (let device in DATA) {
    DATA[device].forEach(item => {
      result.push({
        device: device,
        data: item.transaksi || item.raw
        time: item.time
      });
    });
  }

  res.json(result);
});

// =====================================
// 🗑️ CLEAR PER DEVICE
// =====================================
app.delete("/clear/:device", (req, res) => {
  const device = req.params.device;

  if (DATA[device]) {
    delete DATA[device];
  }

  res.json({
    status: true,
    msg: "data dihapus"
  });
});


// =====================================
// 🚀 START SERVER
// =====================================
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("Server jalan di port " + PORT);
});

async function scrapeDana(cookie) {
  try {
    const res = await axios.get("https://kumabot.com/member/mutasi", {
      headers: {
        Cookie: `ALIPAYJSESSIONID=${cookie}`,
        "User-Agent": "Mozilla/5.0"
      }
    });

    const $ = cheerio.load(res.data);

    let hasil = [];

    $("table tbody tr").each((i, el) => {
      const tanggal = $(el).find("td").eq(0).text().trim();
      const nama = $(el).find("td").eq(1).text().trim();
      const nominal = $(el).find("td").eq(3).text().trim();

      if (nama && nominal) {
        hasil.push({
          tanggal,
          nama,
          nominal
        });
      }
    });

    return hasil;

  } catch (err) {
    console.log("SCRAPE ERROR:", err.message);
    return [];
  }
}
