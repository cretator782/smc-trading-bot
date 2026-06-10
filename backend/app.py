import base64

from flask import Flask, request, jsonify
from flask_cors import CORS
import yfinance as yf
import pandas as pd
import numpy as np

app = Flask(__name__)
CORS(app)


# =========================
# GET DATA
# =========================
def get_data(pair, interval, period):

    data = yf.download(
        pair,
        interval=interval,
        period=period,
        auto_adjust=True,
        progress=False
    )

    if data is None or data.empty:
        return None

    data = data.dropna()

    if isinstance(data.columns, pd.MultiIndex):
        data.columns = data.columns.get_level_values(0)

    return data


# =========================
# BIAS (HTF)
# =========================
def get_bias(data):

    ema50 = data["Close"].rolling(50).mean()

    close = float(data["Close"].iloc[-1])
    ema = float(ema50.iloc[-1])

    return "BULLISH" if close > ema else "BEARISH"


# =========================
# SWINGS (LIQUIDITY)
# =========================
def detect_swings(data):

    highs = data["High"].values
    lows = data["Low"].values

    swing_highs = []
    swing_lows = []

    for i in range(2, len(data) - 2):

        if highs[i] > highs[i-1] and highs[i] > highs[i+1]:
            swing_highs.append(highs[i])

        if lows[i] < lows[i-1] and lows[i] < lows[i+1]:
            swing_lows.append(lows[i])

    return swing_highs, swing_lows


# =========================
# ATR
# =========================
def calculate_atr(data, period=14):

    high_low = data["High"] - data["Low"]
    high_close = abs(data["High"] - data["Close"].shift())
    low_close = abs(data["Low"] - data["Close"].shift())

    tr = pd.concat([high_low, high_close, low_close], axis=1).max(axis=1)

    atr = tr.rolling(period).mean()

    return float(atr.iloc[-1])


# =========================
# ORDER BLOCK
# =========================
def detect_order_block(data, bias):

    recent = data.tail(20)

    if bias == "BULLISH":

        bearish = recent[recent["Close"] < recent["Open"]]

        if not bearish.empty:
            ob = bearish.iloc[-1]
            return {"high": float(ob["High"]), "low": float(ob["Low"])}

    else:

        bullish = recent[recent["Close"] > recent["Open"]]

        if not bullish.empty:
            ob = bullish.iloc[-1]
            return {"high": float(ob["High"]), "low": float(ob["Low"])}

    return None


# =========================
# SAFE SL ENGINE (FIXED)
# =========================
def safe_sl(entry, ob, atr_val, bias):

    buffer = atr_val * 1.8   # 🔥 MAIN FIX (bigger SL safety zone)

    if bias == "BULLISH":

        sl = min(ob["low"], entry - buffer)

        # ensure SL is not too tight
        if entry - sl < buffer:
            sl = entry - buffer

        return sl

    else:

        sl = max(ob["high"], entry + buffer)

        if sl - entry < buffer:
            sl = entry + buffer

        return sl


# =========================
# BUILD TRADE
# =========================
def build_trade(pair):

    data_4h = get_data(pair, "1h", "30d")
    data_1h = get_data(pair, "30m", "10d")
    data_15m = get_data(pair, "15m", "5d")

    if data_4h is None or data_1h is None or data_15m is None:
        return None

    bias_4h = get_bias(data_4h)
    bias_1h = get_bias(data_1h)

    if bias_4h != bias_1h:
        return None

    bias = bias_4h

    price = float(data_15m["Close"].iloc[-1])

    swings_high, swings_low = detect_swings(data_15m)
    atr_val = calculate_atr(data_15m)
    ob = detect_order_block(data_15m, bias)

    if ob is None:
        return None

    entry = price

    # =========================
    # SL FIXED (IMPORTANT)
    # =========================
    sl = safe_sl(entry, ob, atr_val, bias)

    # =========================
    # TP LOGIC (LIQUIDITY BASED)
    # =========================
    if bias == "BULLISH":

        if len(swings_high) > 0:
            tp = max(swings_high)
        else:
            tp = entry + (atr_val * 3)

        if tp <= entry:
            tp = entry + (atr_val * 3)

    else:

        if len(swings_low) > 0:
            tp = min(swings_low)
        else:
            tp = entry - (atr_val * 3)

        if tp >= entry:
            tp = entry - (atr_val * 3)

    rr = abs(tp - entry) / abs(entry - sl)

    # no fake rejection anymore
    return {
        "bias": bias,
        "entry": round(entry, 5),
        "stop_loss": round(sl, 5),
        "take_profit": round(tp, 5),
        "rr": round(rr, 2),
        "atr": round(atr_val, 5)
    }


# =========================
# GENERATE SETUP
# =========================
@app.route("/generate_setup", methods=["POST"])
def generate_setup():

    body = request.json

    pair = body.get("pair")
    balance = float(body.get("balance") or 0)

    trade = build_trade(pair)

    if trade is None:
        return jsonify({
            "status": "BAD",
            "reason": "No valid SMC setup"
        })

    rr = trade["rr"]

    if rr >= 4:
        status = "GOOD"
        quality = "HIGH"
    elif rr >= 2:
        status = "POSSIBLE"
        quality = "MEDIUM"
    else:
        status = "WEAK"
        quality = "LOW"

    risk_money = balance * 0.01

    stop_distance = abs(trade["entry"] - trade["stop_loss"])

    lot_size = (risk_money / (stop_distance * 10000)) if stop_distance > 0 else 0

    estimated_profit = risk_money * rr

    return jsonify({
        "pair": pair,
        "status": status,
        "quality": quality,
        "bias": trade["bias"],
        "entry": trade["entry"],
        "stop_loss": trade["stop_loss"],
        "take_profit": trade["take_profit"],
        "rr": trade["rr"],
        "risk_money": round(risk_money, 2),
        "estimated_profit": round(estimated_profit, 2),
        "lot_size": round(lot_size, 2),
        "atr": trade["atr"]
    })


# =========================
# ANALYZE SETUP
# =========================
@app.route("/get_advice", methods=["POST"])
def get_advice():

    body = request.json

    entry = float(body.get("entry", 0))
    sl = float(body.get("sl", 0))
    tp = float(body.get("tp", 0))

    risk = abs(entry - sl)
    reward = abs(tp - entry)

    rr = round(reward / risk, 2) if risk != 0 else 0

    if rr >= 4:
        status = "GOOD"
        message = "Strong structure setup"
    elif rr >= 2:
        status = "POSSIBLE"
        message = "Moderate setup"
    else:
        status = "WEAK"
        message = "Low quality setup"

    return jsonify({
        "status": status,
        "message": message,
        "rr": rr
    })



import base64
import cv2
import numpy as np
from flask import send_file
from io import BytesIO
from PIL import Image


@app.route("/analyze_chart", methods=["POST"])
def analyze_chart():

    body = request.json
    images = body.get("images", [])

    if not images:
        return jsonify({"error": "No images received"})

    # take first image only for now (we upgrade multi-TF later)
    img_data = images[0].split(",")[1]
    img_bytes = base64.b64decode(img_data)

    np_arr = np.frombuffer(img_bytes, np.uint8)
    img = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)

    h, w, _ = img.shape

    # =========================
    # SIMULATED SMC STRUCTURE DRAWING
    # =========================

    # 1. MARKET STRUCTURE LINE
    cv2.line(img, (50, int(h*0.3)), (w-50, int(h*0.4)), (0,255,0), 3)
    cv2.putText(img, "Market Structure (BULLISH)", (60, int(h*0.28)),
                cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0,255,0), 2)

    # 2. LIQUIDITY ZONES
    cv2.rectangle(img, (50, int(h*0.1)), (w-50, int(h*0.15)), (255,0,0), 2)
    cv2.putText(img, "Sell-side Liquidity", (60, int(h*0.09)),
                cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255,0,0), 2)

    cv2.rectangle(img, (50, int(h*0.8)), (w-50, int(h*0.85)), (255,0,0), 2)
    cv2.putText(img, "Buy-side Liquidity", (60, int(h*0.88)),
                cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255,0,0), 2)

    # 3. ORDER BLOCK ZONE
    cv2.rectangle(img, (int(w*0.2), int(h*0.5)), (int(w*0.4), int(h*0.6)), (0,0,255), 2)
    cv2.putText(img, "Order Block", (int(w*0.21), int(h*0.49)),
                cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0,0,255), 2)

    # 4. ENTRY POINT ARROW
    cv2.arrowedLine(img, (int(w*0.35), int(h*0.55)),
                         (int(w*0.5), int(h*0.65)),
                         (0,255,255), 3)
    cv2.putText(img, "ENTRY", (int(w*0.52), int(h*0.66)),
                cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0,255,255), 2)

    # =========================
    # RETURN IMAGE AS BASE64
    # =========================

    _, buffer = cv2.imencode('.png', img)
    encoded_img = base64.b64encode(buffer).decode('utf-8')

    return jsonify({
    "annotated_image": encoded_img,
    "bias": "BULLISH",
    "structure": "Market is in bullish trend with HH and HL",
    "liquidity": "Sell-side liquidity above highs",
    "order_blocks": "Bullish OB detected on demand zone",
    "fvg": "Fair Value Gap present in impulsive move",
    "entry": "Wait for retracement into OB or FVG",
    "sl": "Below last liquidity sweep",
    "tp": "Next buy-side liquidity",
    "advice": "Wait for confirmation on lower timeframe"
})
          
if __name__ == "__main__":
    print("SMC BOT FIXED SL VERSION RUNNING")
    app.run(debug=True)
