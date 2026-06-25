const API = "https://smc-trading-bot-14.onrender.com";
console.log("VERSION 24 JUNE 2026");
let widget;
let lastTrade = null;


// =========================
// SIDEBAR
// =========================
function toggleSidebar() {

    const bar = document.getElementById("sidebar");

    if (bar.style.transform === "translateX(0px)") {
        bar.style.transform = "translateX(-260px)";
    } else {
        bar.style.transform = "translateX(0px)";
    }
}
function toggleMenu(event, index) {

    event.stopPropagation();

    const menu = document.getElementById(`menu-${index}`);

    if (!menu) return;

    // close other menus
    document.querySelectorAll("[id^='menu-']").forEach(m => {
        if (m.id !== `menu-${index}`) {
            m.style.display = "none";
        }
    });

    // toggle safely
    if (menu.style.display === "block") {
        menu.style.display = "none";
    } else {
        menu.style.display = "block";
    }
}

// =========================
// PAGE SWITCH
// =========================
function showPage(page) {

    const pages = document.querySelectorAll(".page");

    pages.forEach(p => {
        p.style.display = "none";
        p.classList.remove("active");
    });

    const selectedPage = document.getElementById(page);

    if (selectedPage) {
        selectedPage.style.display = "block";
        selectedPage.classList.add("active");
    }

    document.getElementById("sidebar").style.transform = "translateX(-260px)";

    if (page === "journal") loadJournal();

    if (page === "chart") {

        const pairSelect = document.getElementById("pair");

        const tvSymbol = pairSelect.options[pairSelect.selectedIndex].getAttribute("data-tv");

        loadChart(tvSymbol);
    }
}


// =========================
// HOME LOAD
// =========================
window.onload = () => showPage("home");


// =========================
// CHART
// =========================
function loadChart(symbol) {

    fetch(`${API}/analyze_chart`, {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({ images: [] })
    })
    .then(res => res.json())
    .then(data => {

        document.getElementById("chartResult").innerHTML = `
            <h2>📊 SMC Vision (PRO MODE)</h2>

            <hr>

            <p><b>Bias:</b> ${data.bias}</p>
            <p><b>Structure:</b> ${data.structure}</p>
            <p><b>Advice:</b> ${data.advice}</p>
        `;
    });

    if (window.TradingView) {
    widget = new TradingView.widget({
        container_id: "tradingview_chart",
        width: "100%",
        height: 500,
        symbol: symbol,
        interval: "15",
        theme: "dark",
        style: "1",
        locale: "en"
    });
}
}

async function generateSetup() {

    const btn = document.getElementById("generateBtn");

    btn.innerHTML = "Analyzing...";
    btn.disabled = true;

    const pair = document.getElementById("pair").value;
    const balance = parseFloat(document.getElementById("balance").value);
    const riskPercent = parseFloat(document.getElementById("risk").value || 1);

    let data = null;

    // =========================
    // RETRY LOGIC (FIX FIRST CLICK ISSUE)
    // =========================
    for (let i = 0; i < 2; i++) {
        try {
            const response = await fetch(`${API}/generate_setup`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ pair, balance })
            });

            if (!response.ok) throw new Error("Server error");

            data = await response.json();

            if (data && data.entry) break;

        } catch (err) {
            console.log("retrying...", err);
        }
    }

    btn.innerHTML = "Generate Setup";
    btn.disabled = false;

    if (!data || !data.entry) {
        document.getElementById("result").innerHTML =
            "<h3 style='color:red'>Server warming up... try again</h3>";
        return;
    }

    // =========================
    // ORIGINAL LOGIC (UNCHANGED)
    // =========================

    const rr = (
        Math.abs(data.take_profit - data.entry) /
        Math.abs(data.entry - data.stop_loss)
    ).toFixed(2);

    let label = "POSSIBLE";
    let color = "orange";

    if (data.status === "GOOD") {
        label = "GOOD";
        color = "lime";
    }

    if (data.status === "BAD") {
        label = "BAD";
        color = "red";
    }

    const riskMoney = (balance * riskPercent / 100).toFixed(2);
    const estimatedProfit = (riskMoney * rr).toFixed(2);
    const balanceAfterTP =
    (parseFloat(balance) + parseFloat(estimatedProfit)).toFixed(2);

const balanceAfterSL =
    (parseFloat(balance) - parseFloat(riskMoney)).toFixed(2);

    const stopDistance = Math.abs(data.entry - data.stop_loss);

    const lotSize = stopDistance
        ? (riskMoney / (stopDistance * 10000)).toFixed(2)
        : "0.00";

    let score = 50;
    let quality = "LOW";

    if (rr >= 2 && data.confidence > 75) {
        score = 85;
        quality = "HIGH";
    } else if (rr >= 1.5) {
        score = 70;
        quality = "MEDIUM";
    }

    let feedback = "";
    let marketDirection = "CONSOLIDATION";

if (data.take_profit > data.entry) {
    marketDirection = "BULLISH";
} else if (data.take_profit < data.entry) {
    marketDirection = "BEARISH";
}

    if (label === "GOOD") {
        feedback = "Strong market alignment. Structure supports continuation move.";
    } else if (label === "POSSIBLE") {
        feedback = "Setup exists but confirmation is weak. Wait for better entry.";
    } else {
        feedback = "Market conditions are not favorable. Avoid this trade.";
    }

    lastTrade = {
        pair: data.pair,
        status: label,
        entry: data.entry,
        sl: data.stop_loss,
        tp: data.take_profit,
        rr: rr,
        time: new Date().toLocaleString()
    };

    document.getElementById("result").innerHTML = `
        <h2>${data.pair}</h2>
        <h3 style="color:${color}">${label} SETUP</h3>
        <p><b>Current Price:</b> ${data.entry}</p>
        <p><b>Market State:</b> ${data.status}</p>
        <p><b>Score:</b> ${score}/100</p>
        <p><b>Quality:</b> ${quality}</p>
        <hr>
        <p><b>Risk/Reward:</b> ${rr}</p>
        <p><b>Entry:</b> ${data.entry}</p>
        <p><b>Stop Loss:</b> ${data.stop_loss}</p>
        <p><b>Take Profit:</b> ${data.take_profit}</p>
        <p><b>Risk Money:</b> $${riskMoney}</p>
<p><b>Lot Size:</b> ${lotSize}</p>

<hr>

<p><b>Market Direction:</b> ${marketDirection}</p>

<p><b>Balance After TP:</b>
<span style="color:lime">
$${balanceAfterTP}
</span>
</p>

<p><b>Balance After SL:</b>
<span style="color:red">
$${balanceAfterSL}
</span>
</p>
        
        <hr>
        <h3>🧠 Coach Feedback</h3>
        <p>${feedback}</p>
        <button onclick="saveTrade()" style="margin-top:10px">
            💾 Save Trade
        </button>
    `;
}

// =========================
// SAVE TRADE
// =========================
function saveTrade() {

    if (!lastTrade) return;

    let journal = JSON.parse(localStorage.getItem("journal")) || [];

    lastTrade.status = "RUNNING";

    journal.push(lastTrade);

    localStorage.setItem("journal", JSON.stringify(journal));

    loadJournal();
}
// other functions above...

function saveNotes() {
    const notes = document.getElementById("notesBox").value;
    localStorage.setItem("forexNotes", notes);
    alert("Notes saved successfully!");
}
// =========================
// LOAD JOURNAL
// =========================
function loadJournal() {

    let journal = JSON.parse(localStorage.getItem("journal")) || [];

    let html = "";

    journal.slice().reverse().forEach((t, index) => {

        const realIndex = journal.length - 1 - index;

        const { state, color } = getTradeColor(t);

        html += `
            <div style="
                width:240px;
                margin:10px;
                padding:12px;
                border-radius:12px;
                background:${color};
                color:white;
                flex:0 0 auto;
                box-shadow:0 6px 16px rgba(0,0,0,0.35);
            ">

                <h3>${t.pair} - ${state}</h3>

                <p>Entry: ${t.entry}</p>
                <p>SL: ${t.sl}</p>
                <p>TP: ${t.tp}</p>

                <button onclick="setTradeStatus(${realIndex}, 'TP')">TP</button>
                <button onclick="setTradeStatus(${realIndex}, 'SL')">SL</button>
                <button onclick="deleteTrade(${realIndex})">Delete</button>

            </div>
        `;
    });

    document.getElementById("journalList").innerHTML =
        journal.length
            ? `<div style="display:flex;flex-wrap:wrap;">${html}</div>`
            : "<p>No saved trades yet.</p>";
}
function deleteTrade(index) {

    let journal = JSON.parse(localStorage.getItem("journal")) || [];

    journal.splice(index, 1);

    localStorage.setItem("journal", JSON.stringify(journal));

    loadJournal();
}
function setTradeStatus(index, status) {

    let journal = JSON.parse(localStorage.getItem("journal")) || [];

    journal[index].status = status;

    localStorage.setItem("journal", JSON.stringify(journal));

    loadJournal();
}
// =========================
// UPLOAD + ANALYZE CHART IMAGES
// =========================
function analyzeChartImages() {

    const files = document.getElementById("chartImages").files;
    const resultBox = document.getElementById("chartResult");
    const btn = document.getElementById("analyzeBtn");

    if (!files.length) {
        alert("Please upload at least one chart image");
        return;
    }

    // =========================
    // LOADING STATE START
    // =========================
    btn.disabled = true;
    btn.innerHTML = "⏳ Analyzing SMC Structure...";
    
    resultBox.innerHTML = `
        <div style="padding:20px;">
            <h2>🧠 SMC Vision Engine Running...</h2>
            <p>Analyzing Market Structure (HTF → LTF)...</p>
            <p>Detecting Liquidity Zones...</p>
            <p>Finding Order Blocks & FVG...</p>
            <p>Confirming Entry Model...</p>

            <div style="
                margin-top:20px;
                height:6px;
                width:100%;
                background:#1f2937;
                border-radius:10px;
                overflow:hidden;
            ">
                <div id="loaderBar" style="
                    height:100%;
                    width:0%;
                    background:#00ff99;
                    transition:0.3s;
                "></div>
            </div>
        </div>
    `;

    // fake progress animation
    let progress = 0;
    const interval = setInterval(() => {
        progress += 10;
        const bar = document.getElementById("loaderBar");
        if (bar) bar.style.width = progress + "%";

        if (progress >= 90) clearInterval(interval);
    }, 200);

    // =========================
    // READ IMAGES
    // =========================
    const readerPromises = [];

    for (let i = 0; i < files.length; i++) {

        readerPromises.push(new Promise((resolve) => {

            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.readAsDataURL(files[i]);
        }));
    }

    Promise.all(readerPromises).then(images => {

        fetch(`${API}/analyze_chart`, {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify({ images })
        })
        .then(res => res.json())
        .then(data => {

            clearInterval(interval);

            // reset button
            btn.disabled = false;
            btn.innerHTML = "🚀 Analyze Chart";

            resultBox.innerHTML = `
                <h2>📊 SMC Vision Analysis Complete</h2>
                     <img style="width:100%;border-radius:12px;margin-bottom:15px;"
         src="data:image/png;base64,${data.annotated_image}" />
                <p><b>Bias:</b> ${data.bias}</p>
                <p><b>Structure:</b> ${data.structure}</p>

                <hr>

                <p><b>Liquidity:</b> ${data.liquidity}</p>
                <p><b>Order Blocks:</b> ${data.order_blocks}</p>
                <p><b>FVG:</b> ${data.fvg}</p>

                <hr>

                <p><b>Entry:</b> ${data.entry}</p>
                <p><b>SL:</b> ${data.sl}</p>
                <p><b>TP:</b> ${data.tp}</p>

                <hr>

                <p><b>Advice:</b> ${data.advice}</p>
            `;
        })
        .catch(err => {

            clearInterval(interval);

            btn.disabled = false;
            btn.innerHTML = "🚀 Analyze Chart";

            resultBox.innerHTML = `
                <h2>❌ Error</h2>
                <p>Failed to analyze chart. Check backend connection.</p>
            `;
        });
    });
}
function showSMCLoading() {

    const resultBox = document.getElementById("chartResult");
    const bar = document.getElementById("loaderFill");

    let steps = [
        "🧠 AI is reading your chart...",
        "📸 Detecting candlestick patterns...",
        "🔍 Scanning liquidity zones...",
        "📊 Identifying market structure (HH/HL/LH/LL)...",
        "💧 Mapping equal highs & lows...",
        "📦 Detecting order blocks...",
        "⚡ Finding fair value gaps...",
        "🎯 Building entry model...",
        "🚀 Finalizing SMC setup..."
    ];

    let i = 0;
    let progress = 0;

    resultBox.innerHTML = `<p id="smcLoader">⏳ ${steps[0]}</p>`;

    const interval = setInterval(() => {

        i++;

        if (i < steps.length) {
            document.getElementById("smcLoader").innerText = "⏳ " + steps[i];
        } else {
            clearInterval(interval);
        }

    }, 800);

    const progressInterval = setInterval(() => {

        progress += 12;

        if (bar) bar.style.width = progress + "%";

        if (progress >= 100) clearInterval(progressInterval);

    }, 800);
}
function getTradeColor(t) {

    let state = "RUNNING";
    let color = "#3b82f6";

    if (t.status === "TP") {
        state = "TP HIT";
        color = "#22c55e";
    }

    if (t.status === "SL") {
        state = "SL HIT";
        color = "#ef4444";
    }

    return { state, color };
}
async function updateTradeStates() {

    let journal = JSON.parse(localStorage.getItem("journal")) || [];
    if (!journal.length) return;

    for (let t of journal) {

        // ❗ skip if manually set (DO NOT overwrite)
        if (t.status === "TP" || t.status === "SL") {
            continue;
        }

        try {
            const res = await fetch(`${API}/live_price?pair=${t.pair}`);
            const data = await res.json();

            const price = data.price || data.current_price || data.data?.price;

            const entry = parseFloat(t.entry);
            const sl = parseFloat(t.sl);
            const tp = parseFloat(t.tp);

            if (price >= tp && entry < tp) {
                t.status = "TP";
            }

            if (price <= sl && entry > sl) {
                t.status = "SL";
            }

        } catch (err) {
            console.log("price fetch error", err);
        }
    }

    localStorage.setItem("journal", JSON.stringify(journal));

    // smoother refresh
    requestAnimationFrame(loadJournal);
}
window.addEventListener("load", () => {
    const savedNotes = localStorage.getItem("forexNotes");
    if (savedNotes) {
        document.getElementById("notesBox").value = savedNotes;
    }
});
document.addEventListener("input", (e) => {
    if (e.target.id === "notesBox") {
        localStorage.setItem("forexNotes", e.target.value);
    }
});
setInterval(updateTradeStates, 10000);
