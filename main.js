(function(){
  // Random helpers
  const rnd = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
  const chance = (p) => Math.random() < p;

  // Canonical ports and goods (as commonly documented) [Wikipedia]
  const PORTS = ["Hong Kong", "Nagasaki", "Shanghai", "Saigon", "Manila", "Singapore", "Batavia",];
  const PORT_COORDS = {
    [PORTS[0]]: [22.300, 114.167],
    [PORTS[1]]: [32.750, 129.877],
    [PORTS[2]]: [31.230, 121.473],
    [PORTS[3]]: [10.775, 106.700],   // Ho Chi Minh City area (historic Saigon)
    [PORTS[4]]: [14.599, 120.984],
    [PORTS[5]]: [1.290, 103.851],
    [PORTS[6]]: [-6.175, 106.827],  // Jakarta
  };
  const PORT_FEES = {
    [PORTS[0]]: 0.85, // Established as a free port to counter restrictive Chinese trade.
    [PORTS[1]]: 1.30, // Under Tokugawa/early Meiji, trade was extremely limited and controlled.
    [PORTS[2]]: 1.10, // Major international hub but more expensive than crown colony free ports.
    [PORTS[3]]: 1.50, // French colonial port, focused on French economic benefit.
    [PORTS[4]]: 1.70, // Spanish colonial port, known for bureaucracy and less efficient than British ports.
    [PORTS[5]]: 0.80, // The quintessential free port, designed for maximum trade flow.
    [PORTS[6]]: 2.00, // Dutch hub, highly regulated with monopolies (Dutch Cultivation System).
  }
  const GOODS = [
    { key:"opium",      name:"Opium",   base:1000, vol:1, icon:"⚗️" },
    { key:"silk",       name:"Silk",    base: 450, vol:1, icon:"🧵" },
    { key:"arms",       name:"Arms",    base: 200, vol:1, icon:"🗡️" },
    { key:"rice",       name:"Rice",    base: 20, vol:1, icon:"🍚" },
    { key:"tea",        name:"Tea",       base: 55, vol:1, icon:"🍃" },
    { key:"spices",     name:"Spices",    base: 65, vol:1, icon:"🫚" },
    { key:"porcelain",  name:"Porcelain", base: 120, vol:1, icon:"🍶" },
    { key:"glassware",  name:"Glassware", base: 90, vol:1, icon:"🔮" },
    { key:"general",    name:"General",   base:  30, vol:1, icon:"📦" },
  ];

  // Game state
  const initialState = () => ({
    turn: 1,
    port: "Hong Kong",
    cash: 2000,
    bank: 0,
    debt: 0,
    protection: false,
    protectionTimer: 0,
    shipHP: 100,
    shipMaxHP: 100,
    guns: 5,
    holdCap: 100,
    cargo: { opium:0, silk:0, arms:0, rice: 0, tea: 0, spices: 0, porcelain: 0, glassware: 0, general:0 },
    priceMap: {},      // per-good current prices
    scarcity: {},      // per-good event modifiers
    rngSeedless: true, // using Math.random
    gameOver: false,
    retired: false,
  });

  let S = initialState();
  let selectedDest = selectNextPort();

  function selectNextPort() {
    const index = PORTS.indexOf(S.port);
    return index < PORTS.length ? PORTS[index + 1] : PORTS[index - 1];
  }
  function formatMoney(n) {
    const sign = n < 0 ? "-" : "";
    return sign + "$" + Math.abs(Math.round(n)).toLocaleString();
  }
  function log(msg, cls) {
    const el = document.getElementById("log");
    const p = document.createElement("p");
    if (cls) p.className = cls;
    p.textContent = msg;
    el.appendChild(p);
    el.scrollTop = el.scrollHeight;
  }

  function calcNetWorth() {
    let cargoVal = 0;
    for (const g of GOODS) {
      const qty = S.cargo[g.key] || 0;
      const price = S.priceMap[g.key] || g.base;
      cargoVal += qty * price * 0.5; // liquidation estimate
    }
    return S.cash + S.bank + cargoVal - S.debt;
  }

  function holdUsed() {
    let used = 0;
    for (const g of GOODS) used += (S.cargo[g.key] || 0) * g.vol;
    return used;
  }

  function setPricesForPort(port) {
    // Base prices with port influence and scarcity/glut events
    const pm = {};
    for (const g of GOODS) {
      let price = g.base;
      // port influence: simple modifiers
      const pi = {
        "Hong Kong": 1.00, "Shanghai": 0.95, "Saigon": 1.05,
        "Manila": 0.98, "Singapore": 1.02, "Nagasaki": 1.07, "Batavia": 1.0
      }[port] || 1.0;

      // Random walk around base
      const vol = { opium:0.45, silk:0.35, arms:0.30, general:0.20 }[g.key] || 0.25;
      const noise = (Math.random() * 2 - 1) * vol; // -vol..+vol
      price = Math.max(1, Math.round(price * (pi[port] || 1.0) * (1 + noise)));

      // Scarcity/glut events
      if (!S.scarcity[g.key]) S.scarcity[g.key] = { type:"none", turns:0 };
      // chance to trigger or end events
      if (S.scarcity[g.key].turns <= 0 && chance(0.07)) {
        // new event
        const type = chance(0.5) ? "scarcity" : "glut";
        const turns = rnd(1, 3);
        S.scarcity[g.key] = { type, turns };
        log(`${g.name} ${type === "scarcity" ? "is scarce" : "glut in supply"} in ${port}!`, type==="scarcity"?"warn":"ok");
      } else if (S.scarcity[g.key].turns > 0) {
        S.scarcity[g.key].turns--;
      }
      // apply event modifier
      const sc = S.scarcity[g.key];
      if (sc.type === "scarcity") price = Math.round(price * 1.6);
      if (sc.type === "glut")     price = Math.round(price * 0.6);

      pm[g.key] = Math.max(1, price);
    }
    S.priceMap = pm;
  }

  function refreshUI() {
    // Top stats
    document.getElementById("port").textContent = S.port;
    document.getElementById("turn").textContent = `${S.turn}`;
    document.getElementById("cash").textContent = formatMoney(S.cash);
    document.getElementById("bank").textContent = formatMoney(S.bank);
    document.getElementById("debt").textContent = formatMoney(S.debt);
    document.getElementById("protection").innerHTML = S.protection ? `Yes (${S.protectionTimer} voyages)` : "No";
    document.getElementById("hp").textContent = `${S.shipHP}/${S.shipMaxHP}`;
    document.getElementById("guns").textContent = `${S.guns}`;
    document.getElementById("hold").textContent = `${holdUsed()}/${S.holdCap}`;
    document.getElementById("networth").textContent = formatMoney(calcNetWorth());

    // Ports dropdown
    const sailSel = document.getElementById("sailTo");
    sailSel.innerHTML = "";
    for (const p of PORTS) {
      if (p === S.port) continue;
      const opt = document.createElement("option");
      opt.value = p; opt.textContent = p; opt.selected = p === selectedDest;
      sailSel.appendChild(opt);
    }

    // Goods table
    const goodsEl = document.getElementById("goods");
    // clear rows except header
    // remove only data rows, keep the header row
    goodsEl.querySelectorAll(".row:not(.header)").forEach(el => el.remove());
    for (const g of GOODS) {
      const row = document.createElement("div"); row.className="row goods";
      const price = S.priceMap[g.key] || g.base;
      const have = S.cargo[g.key] || 0;

      const nameCell = document.createElement("div");
      nameCell.textContent = `${g.icon} ${g.name}`;
      const priceCell = document.createElement("div");
      priceCell.textContent = formatMoney(price);
      const haveCell = document.createElement("div");
      haveCell.textContent = `${have}`;
      const qtyCell = document.createElement("div");
      const qtyInput = document.createElement("input");
      qtyInput.type = "number";
      qtyInput.min = "0"; qtyInput.step = "1"; qtyInput.placeholder = "Qty";
      qtyInput.style.width = "100%";
      qtyCell.appendChild(qtyInput);

      const actionCell = document.createElement("div"); actionCell.className="flex";
      const maxBtn = document.createElement("button"); maxBtn.textContent = "Max";
      const buyBtn = document.createElement("button"); buyBtn.textContent = "Buy";
      const sellBtn = document.createElement("button"); sellBtn.textContent = "Sell";
      maxBtn.addEventListener("click", () => {
        let fee = 0;
        if (selectedDest) {
          ({ fee } = voyageMetrics(S.port, selectedDest));
        }
        // Max by cash
        const maxByCash = Math.floor((S.cash - fee) / price);

        // Also respect remaining hold capacity so Buy will succeed
        const freeHold = S.holdCap - holdUsed();
        const maxByHold = Math.floor(freeHold / g.vol);

        // If you want strictly cash-only, use: const q = Math.max(0, maxByCash);
        const q = Math.max(0, Math.min(maxByCash, maxByHold));

        qtyInput.value = q;
      });
      buyBtn.addEventListener("click", () => {
        const q = Math.max(0, Math.floor(+qtyInput.value || 0));
        buyGood(g.key, q);
      });
      sellBtn.addEventListener("click", () => {
        const q = Math.max(0, Math.floor(+qtyInput.value || 0));
        sellGood(g.key, q);
      });
      actionCell.appendChild(maxBtn); actionCell.appendChild(buyBtn); actionCell.appendChild(sellBtn);

      row.appendChild(nameCell);
      row.appendChild(priceCell);
      row.appendChild(haveCell);
      row.appendChild(qtyCell);
      row.appendChild(actionCell);
      goodsEl.appendChild(row);
    }

    // Event area refresh (contextual tips)
    const eventArea = document.getElementById("eventArea");
    eventArea.innerHTML = "";

    function updateVoyageInfoPanel() {
      eventArea.innerHTML = "";
      const tip = document.createElement("div");
      tip.className = "muted";
      tip.textContent = (S.port === "Hong Kong")
        ? "You can access the bank in Hong Kong. Consider depositing surplus cash to reduce theft risk."
        : "Sail safely. Paying protection reduces pirate encounters for a few voyages.";
      eventArea.appendChild(tip);

      const dest = document.getElementById("sailTo").value;
      selectedDest = dest;
      if (dest) {
        const { km, nm, fee } = voyageMetrics(S.port, dest);
        const pChance = computePirateChance();
        const panel = document.createElement("div");
        panel.className = "panel";
        panel.style.padding = "8px";
        panel.innerHTML = [
          `<strong>Voyage estimates to ${dest}:</strong>`,
          `- Distance: ~${nm.toLocaleString()} nm (${km.toLocaleString()} km)`,
          `- Sailing fee: ${formatMoney(fee)}`,
          `- Pirate encounter chance: ${(pChance * 100).toFixed(1)}%`,
        ].join("<br/>");
        eventArea.appendChild(panel);
      }
    }

    // Update estimates now and whenever destination changes
    document.getElementById("sailTo").addEventListener("change", updateVoyageInfoPanel);
    updateVoyageInfoPanel();
  }

  function newGame() {
    S = initialState();
    setPricesForPort(S.port);
    document.getElementById("log").innerHTML = "";
    log("A new venture begins in Hong Kong.", "ok");
    refreshUI();
  }

  // Trading
  function buyGood(key, q) {
    if (S.gameOver) return;
    const g = GOODS.find(x => x.key === key);
    const price = S.priceMap[key];
    const cost = price * q;
    const vol = g.vol * q;
    if (q <= 0) return;
    if (S.cash < cost) { log("Not enough cash.", "bad"); return; }
    if (holdUsed() + vol > S.holdCap) { log("Not enough hold space.", "bad"); return; }
    S.cash -= cost;
    S.cargo[key] = (S.cargo[key] || 0) + q;
    log(`Bought ${q} ${g.name} for ${formatMoney(cost)}.`);
    refreshUI();
  }
  function sellGood(key, q) {
    if (S.gameOver) return;
    const g = GOODS.find(x => x.key === key);
    const price = S.priceMap[key];
    const have = S.cargo[key] || 0;
    if (q <= 0) return;
    if (q > have) { log("You don't have that much.", "bad"); return; }
    const revenue = price * q;
    S.cargo[key] = have - q;
    S.cash += revenue;
    log(`Sold ${q} ${g.name} for ${formatMoney(revenue)}.`, "ok");
    refreshUI();
  }

  // Bank & debt
  function deposit(amount) {
    if (S.port !== "Hong Kong") { log("Bank is only in Hong Kong.", "bad"); return; }
    if (amount <= 0) return;
    if (S.cash < amount) { log("Not enough cash.", "bad"); return; }
    S.cash -= amount; S.bank += amount;
    log(`Deposited ${formatMoney(amount)}.`, "ok");
    refreshUI();
  }
  function withdraw(amount) {
    if (S.port !== "Hong Kong") { log("Bank is only in Hong Kong.", "bad"); return; }
    if (amount <= 0) return;
    if (S.bank < amount) { log("Insufficient bank balance.", "bad"); return; }
    S.bank -= amount; S.cash += amount;
    log(`Withdrew ${formatMoney(amount)}.`, "ok");
    refreshUI();
  }
  function borrow(amount) {
    if (amount <= 0) return;
    S.debt += amount; S.cash += amount;
    log(`Borrowed ${formatMoney(amount)} from Jia.`, "warn");
    refreshUI();
  }
  function repay(amount) {
    if (amount <= 0) return;
    if (S.cash < amount) { log("Not enough cash.", "bad"); return; }
    amount = Math.min(amount, S.debt);
    S.debt -= amount; S.cash -= amount;
    log(`Repaid ${formatMoney(amount)} to Jia.`, "ok");
    refreshUI();
  }

  // Distance helpers (Haversine)
  function toRad(deg) { return deg * Math.PI / 180; }
  function haversineKm([lat1, lon1], [lat2, lon2]) {
    const R = 6371; // km
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat/2)**2 +
              Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
              Math.sin(dLon/2)**2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  }
  function distanceKm(fromPort, toPort) {
    const a = PORT_COORDS[fromPort], b = PORT_COORDS[toPort];
    if (!a || !b) return 0;
    return haversineKm(a, b);
  }

  // Voyage metrics: km, nautical miles, and fee (deterministic)
  function voyageMetrics(fromPort, toPort) {
    const km = Math.round(distanceKm(fromPort, toPort));
    const nm = Math.round(km * 0.5399568); // 1 km ≈ 0.5399568 nm
    // Tweakable fee model: modest base + rate per km
    const baseFee = 20 * PORT_FEES[toPort];          // flat cost
    const ratePerKm = 0.1;      // cost per km
    const fee = baseFee + Math.round(km * ratePerKm);
    return { km, nm, fee };
  }

  // Wear-and-tear based on voyage length with some randomness
  function applyWearAndTear(km) {
    // 1 HP every ~600 km, plus a small random factor 0..3
    const baseWear = Math.floor(km / 600);
    const randWear = rnd(0, 3);
    const wear = Math.max(0, baseWear + randWear);
    if (wear > 0) {
      S.shipHP = Math.max(0, S.shipHP - wear);
      log(`Voyage wear-and-tear: hull loses ${wear} HP.`, "warn");
      if (S.shipHP <= 0) {
        gameOver("Your ship fell apart upon arrival due to cumulative damage.");
        return true; // game over
      }
    }
    return false;
  }

  // Current pirate-chance logic exposed as a function (for UI and checks)
  function computePirateChance() {
    const basePirateChance = 0.28;
    return S.protection ? basePirateChance * 0.33 : basePirateChance;
  }

  // Protection and repairs
  function payProtection() {
    const fee = 500 + Math.max(0, Math.floor(S.turn * 10)); // scales modestly
    if (S.cash < fee) { log("Not enough cash to pay Zheng.", "bad"); return; }
    S.cash -= fee; S.protection = true; S.protectionTimer = 3; // 3 voyages of protection
    log(`Paid ${formatMoney(fee)} to Zheng for protection (3 voyages).`, "ok");
    refreshUI();
  }
  function repairShip() {
    const dmg = S.shipMaxHP - S.shipHP;
    if (dmg <= 0) { log("Ship is already in top shape."); return; }
    const costPerHP = 5;
    const cost = dmg * costPerHP;
    if (S.cash < cost) { log("Not enough cash to repair fully.", "bad"); return; }
    S.cash -= cost; S.shipHP = S.shipMaxHP;
    log(`Ship fully repaired for ${formatMoney(cost)}.`, "ok");
    refreshUI();
  }

  // Sailing, interest, encounters
  function applyInterest() {
    // Approximate 10% monthly interest per voyage if you assume a voyage ~ one month.
    const rate = 0.10;
    if (S.debt > 0) {
      const inc = Math.ceil(S.debt * rate);
      S.debt += inc;
      log(`Interest accrued on debt: ${formatMoney(inc)} (10%).`, "warn");
    }
  }

  function sailTo(dest) {
    if (S.gameOver) return;
    if (!PORTS.includes(dest) || dest === S.port) return;

    // Compute voyage metrics up-front
    const { km, nm, fee } = voyageMetrics(S.port, dest);

    // Require cash for sailing fee
    if (S.cash < fee) {
      log(`You need ${formatMoney(fee)} to cover sailing costs to ${dest}.`, "bad");
      return;
    }

    // Advance the voyage (turn) and apply interest
    S.turn += 1;
    applyInterest();

    // Deduct sailing fee at departure
    S.cash -= fee;
    log(`Paid ${formatMoney(fee)} in sailing costs to ${dest} (${nm} nm).`, "muted");

    // Protection decay
    if (S.protection) {
      S.protectionTimer -= 1;
      if (S.protectionTimer <= 0) {
        S.protection = false; S.protectionTimer = 0;
        log("Zheng’s protection has expired.", "warn");
      }
    }

    // Encounter check — same logic as before
    const pChance = computePirateChance();
    const encounter = chance(pChance);

    if (encounter) {
      pirateEncounter(dest);
      if (S.gameOver) return;
    } else {
      log(`Uneventful seas en route to ${dest}.`);
    }

    S.port = dest;
    selectedDest = selectNextPort()

    // Wear-and-tear on arrival
    if (applyWearAndTear(km)) return; // may end the game

    setPricesForPort(dest);
    refreshUI();
  }

  function pirateEncounter(dest) {
    log("Pirates sighted on the horizon!", "warn");

    // Simple combat loop
    let pirateHP = rnd(30, 90);
    let pirateGuns = rnd(3, 12);

    while (pirateHP > 0 && S.shipHP > 0) {
      // Player's turn: choose auto-strategy — if outgunned try to flee occasionally
      const fleeBias = (pirateGuns > S.guns * 1.5) ? 0.5 : 0.15;
      const tryFlee = chance(fleeBias);

      if (tryFlee) {
        if (chance(0.6)) {
          log("You slipped away from the pirates!", "ok");
          return;
        } else {
          log("Failed to escape!", "bad");
        }
      }

      // Fire!
      const playerDmg = Math.max(0, Math.round((S.guns * (0.8 + Math.random()*0.6)) - rnd(0,5)));
      pirateHP -= playerDmg;
      log(`Your guns deal ${playerDmg} damage to pirates.`);
      if (pirateHP <= 0) break;

      // Pirates fire back
      const pirateDmg = Math.max(0, Math.round((pirateGuns * (0.6 + Math.random()*0.7)) - rnd(0,5)));
      S.shipHP -= pirateDmg;
      log(`Pirates hit you for ${pirateDmg} damage.`, pirateDmg > 0 ? "bad" : "");

      if (S.shipHP <= 0) {
        gameOver("Your ship was sunk by pirates!");
        return;
      }
    }

    log("Pirates defeated! The sea is yours.", "ok");

    // Loot
    const lootCash = rnd(50, 500);
    S.cash += lootCash;
    log(`You loot ${formatMoney(lootCash)} from the pirate wreckage.`, "ok");
  }

  function retire() {
    const target = 1000000; // configurable goal
    const fortune = S.cash + S.bank;
    if (fortune < target) {
      log(`You consider retiring, but ${formatMoney(target)} in liquid assets is the traditional goal.`, "warn");
      return;
    }
    S.retired = true; S.gameOver = true;
    const score = calcNetWorth();
    log(`You retire in splendor with a fortune of ${formatMoney(fortune)} (net worth ${formatMoney(score)}).`, "ok");
    log("Game over — congratulations!");
  }

  function gameOver(reason) {
    S.gameOver = true;
    log(reason, "bad");
    const nw = calcNetWorth();
    log(`Final net worth: ${formatMoney(nw)}.`, "muted");
  }

  // Bankruptcy check (called periodically)
  function checkBankruptcy() {
    if (calcNetWorth() < -1000) {
      gameOver("Bankrupted — your creditors have taken everything.");
    }
  }

  // Hook up controls
  document.getElementById("sailBtn").addEventListener("click", () => {
    const dest = document.getElementById("sailTo").value;
    sailTo(dest);
    checkBankruptcy();
  });
  document.getElementById("depositBtn").addEventListener("click", () => {
    deposit(Math.floor(+document.getElementById("bankAmt").value || 0));
  });
  document.getElementById("withdrawBtn").addEventListener("click", () => {
    withdraw(Math.floor(+document.getElementById("bankAmt").value || 0));
  });
  document.getElementById("borrowBtn").addEventListener("click", () => {
    borrow(Math.floor(+document.getElementById("debtAmt").value || 0));
    checkBankruptcy();
  });
  document.getElementById("repayBtn").addEventListener("click", () => {
    repay(Math.floor(+document.getElementById("debtAmt").value || 0));
  });
  document.getElementById("payProtectionBtn").addEventListener("click", payProtection);
  document.getElementById("repairBtn").addEventListener("click", repairShip);
  document.getElementById("retireBtn").addEventListener("click", retire);

  // Save/load/reset
  document.getElementById("saveBtn").addEventListener("click", () => {
    localStorage.setItem("tycoon-web-save", JSON.stringify(S));
    log("Game saved.", "ok");
  });
  document.getElementById("loadBtn").addEventListener("click", () => {
    const raw = localStorage.getItem("tycoon-web-save");
    if (!raw) { log("No save found.", "bad"); return; }
    try {
      const obj = JSON.parse(raw);
      // sanity check
      if (!obj || !obj.port || !obj.cargo) throw new Error("invalid");
      S = Object.assign(initialState(), obj);
      setPricesForPort(S.port);
      log("Game loaded.", "ok");
      refreshUI();
    } catch (e) {
      log("Failed to load save.", "bad");
    }
  });
  document.getElementById("resetBtn").addEventListener("click", () => {
    if (confirm("Start a new game? Current progress will be lost (unless saved).")) {
      newGame();
    }
  });
  document.getElementById("helpBtn").addEventListener("click", () => {
    alert([
      "Sea Tycoon — 🌊 Rule the Waves, Command the Trade!",
      "",
      "- Buy low, sell high among ports.",
      "- Bank is in Hong Kong; borrow from Jia (debt incurs interest per voyage).",
      "- Pay Zheng for temporary protection to reduce pirate encounters.",
      "- Guns help in combat; repair ship damage in port.",
      "- Retire once you’ve amassed enough fortune.",
      "",
      "This version approximates classic mechanics based on public descriptions."
    ].join("\n"));
  });

  // Init
  newGame();

})();