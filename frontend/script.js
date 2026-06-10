const API = "http://127.0.0.1:5000";

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

function generateSetup() {

    const btn = document.getElementById("generateBtn");

    btn.innerHTML = "Analyzing...";
    btn.disabled = true;

    const pair = document.getElementById("pair").value;
    const balance = parseFloat(document.getElementById("balance").value);
    const riskPercent = parseFloat(document.getElementById("risk").value || 1);

    fetch(`${API}/generate_setup`, {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({ pair, balance })
    })
    .then(res => res.json())
    .then(data => {

        const rr = (Math.abs(data.take_profit - data.entry) /
                   Math.abs(data.entry - data.stop_loss)).toFixed(2);

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
        const stopDistance = Math.abs(data.entry - data.stop_loss);
        const lotSize = (riskMoney / (stopDistance * 10000)).toFixed(2);

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

            <h3>🧠 Coach Feedback</h3>
            <p>${feedback}</p>

            <button onclick="saveTrade()" style="margin-top:10px">
                💾 Save Trade
            </button>

        `;

        btn.innerHTML = "Generate Setup";
        btn.disabled = false;
    })
    .catch(error => {

        console.error(error);

        document.getElementById("result").innerHTML =
            "<h3 style='color:red'>Failed to connect to backend.</h3>";

        btn.innerHTML = "Generate Setup";
        btn.disabled = false;
    });
}


// =========================
// SAVE TRADE
// =========================
function saveTrade() {
    if (!lastTrade) return;

    let journal = JSON.parse(localStorage.getItem("journal")) || [];

    journal.push(lastTrade);

    localStorage.setItem("journal", JSON.stringify(journal));

    alert("Trade saved ✔");
}


// =========================
// LOAD JOURNAL
// =========================
function loadJournal() {

    let journal = JSON.parse(localStorage.getItem("journal")) || [];

    let html = "";

    journal.reverse().forEach(t => {

        html += `
            <div class="trade-box">
                <h3>${t.pair} - ${t.status}</h3>
                <p>Entry: ${t.entry} | SL: ${t.sl} | TP: ${t.tp}</p>
                <p>R/R: ${t.rr}</p>
                <p>Time: ${t.time}</p>
            </div>
        `;
    });

    document.getElementById("journalList").innerHTML =
        journal.length ? html : "<p>No saved trades yet.</p>";
}

function getAdvice() {

    fetch(`${API}/get_advice`, {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({
            entry: document.getElementById("entry").value,
            sl: document.getElementById("sl").value,
            tp: document.getElementById("tp").value
        })
    })
    .then(res => res.json())
    .then(data => {
        alert(`${data.status} - ${data.message}`);
    })
    .catch(error => {
        console.error(error);
        alert("Failed to analyze setup.");
    });
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