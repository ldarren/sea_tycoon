(function(){
  // Random helpers
  const rnd = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
  const chance = (p) => Math.random() < p;

  // Canonical ports and goods (as commonly documented) [Wikipedia]
  const PORTS = ["Hong Kong", "Shanghai", "Saigon", "Manila", "Singapore", "Nagasaki"];
  const GOODS = [
    { key:"opium",   name:"Opium",   base:1000, vol:1, icon:"⚗️" },
    { key:"silk",    name:"Silk",    base: 250, vol:1, icon:"🧵" },
    { key:"arms",    name:"Arms",    base: 150, vol:1, icon:"🗡️" },
    { key:"general", name:"General", base:  30, vol:1, icon:"📦" },
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
    cargo: { opium:0, silk:0, arms:0, general:0 },
    priceMap: {},      // per-good current prices
    scarcity: {},      // per-good event modifiers
    rngSeedless: true, // using Math.random
    gameOver: false,
    retired: false,
  });

  let S = initialState();

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
        "Manila": 0.98, "Singapore": 1.02, "Nagasaki": 1.07
      }[port] || 1.0;

      // Random walk around base
      const vol = { opium:0.45, silk:0.35, arms:0.30, general:0.20 }[g.key] || 0.25;
      const noise = (Math.random() * 2 - 1) * vol; // -vol..+vol
      price = Math.max(1, Math.round(price * pi * (1 + noise)));

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
    document.getElementById("protection").innerHTML = S.protection
      ? `Yes (${S.protectionTimer} voyages)` : "No";
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
      opt.value = p; opt.textContent = p;
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
      const buyBtn = document.createElement("button"); buyBtn.textContent = "Buy";
      const sellBtn = document.createElement("button"); sellBtn.textContent = "Sell";
      buyBtn.addEventListener("click", () => {
        const q = Math.max(0, Math.floor(+qtyInput.value || 0));
        buyGood(g.key, q);
      });
      sellBtn.addEventListener("click", () => {
        const q = Math.max(0, Math.floor(+qtyInput.value || 0));
        sellGood(g.key, q);
      });
      actionCell.appendChild(buyBtn); actionCell.appendChild(sellBtn);

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
    const tip = document.createElement("div");
    tip.className = "muted";
    tip.textContent = (S.port === "Hong Kong")
      ? "You can access the bank in Hong Kong. Consider depositing surplus cash to reduce theft risk."
      : "Sail safely. Paying protection reduces pirate encounters for a few voyages.";
    eventArea.appendChild(tip);
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
    S.turn += 1;
    applyInterest();

    // Protection decay
    if (S.protection) {
      S.protectionTimer -= 1;
      if (S.protectionTimer <= 0) {
        S.protection = false; S.protectionTimer = 0;
        log("Zheng’s protection has expired.", "warn");
      }
    }

    // Encounter check
    const basePirateChance = 0.28; // tweakable
    const encounter = chance(S.protection ? basePirateChance * 0.33 : basePirateChance);

    if (encounter) {
      pirateEncounter(dest);
      if (S.gameOver) return;
    } else {
      log(`Uneventful seas en route to ${dest}.`);
    }

    S.port = dest;
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