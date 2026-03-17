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
  let uuid = "KUMA_01";
  let cookie = "";

  console.log("📥 RAW BODY:", req.body);

  // ✅ 1. Kalau JSON (Postman / APK proper)
  if (typeof req.body === "object") {
    uuid = req.body.uuid || "KUMA_01";
    cookie = req.body?.data?.ALIPAYJSESSIONID || "";
  }

  // ✅ 2. Kalau STRING (APK asli / kumabot)
  if (typeof req.body === "string") {
    const match = req.body.match(/ALIPAYJSESSIONID=([^;]+)/);
    if (match) {
      cookie = match[1];
    }
  }

  // ❌ Kalau tidak dapat cookie
  if (!cookie) {
    return res.json({
      status: false,
      msg: "cookie tidak ditemukan"
    });
  }

  console.log("🍪 COOKIE:", cookie);

  // 🔥 JALANKAN BOT
  const transaksi = await scrapeDana(cookie);

  if (!DATA[uuid]) {
    DATA[uuid] = [];
  }

  DATA[uuid].push({
    transaksi,
    time: Date.now()
  });

  console.log("📊 HASIL:", transaksi);

  res.json({
    status: true,
    msg: "data + transaksi masuk",
    total: transaksi.length
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
        data: item.transaksi, // 🔥 FIX DI SINI
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