require("dotenv").config();

const TelegramBot = require("node-telegram-bot-api");
const { ethers } = require("ethers");

// =======================
// TELEGRAM TOKEN
// =======================
const TOKEN = process.env.TOKEN;

if (!TOKEN) {
  console.error("TOKEN not found in .env file");
  process.exit(1);
}

const bot = new TelegramBot(TOKEN, {
  polling: true
});

// =======================
// RPC LIST
// =======================
const RPCS = [
  "https://bsc-dataseed.binance.org/",
  "https://rpc.ankr.com/bsc",
  "https://bsc.publicnode.com"
];

let provider;
let contract;
let rpcIndex = 0;

// =======================
// CONTRACT
// =======================
const CONTRACT_ADDRESS = "0x6bD7671Ec2B11Dc32F204641d67084977E5C81f9";

const abi = [
  "function ownerInfo(address owner) view returns(uint64,uint32,uint32,uint32,uint32,uint8,bool,address,address,address)"
];

// =======================
// CACHE
// =======================
const ownerCache = new Map();

// =======================
// TIMEOUT
// =======================
function withTimeout(promise, ms = 1000) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Timeout")), ms)
    )
  ]);
}

// =======================
// RPC CONNECT
// =======================
async function connect() {
  for (let i = 0; i < RPCS.length; i++) {
    try {
      const p = new ethers.JsonRpcProvider(RPCS[i]);

      await p.getBlockNumber();

      provider = p;
      rpcIndex = i;

      console.log("CONNECTED:", RPCS[i]);
      return;

    } catch (e) {
      console.log("RPC FAILED:", RPCS[i]);
    }
  }

  throw new Error("ALL RPC FAILED");
}

async function switchRPC() {
  rpcIndex++;

  if (rpcIndex >= RPCS.length) {
    rpcIndex = 0;
  }

  provider = new ethers.JsonRpcProvider(
    RPCS[rpcIndex]
  );

  contract = new ethers.Contract(
    CONTRACT_ADDRESS,
    abi,
    provider
  );

  console.log("SWITCHED RPC:", RPCS[rpcIndex]);
}

// =======================
// INIT
// =======================
async function init() {
  await connect();

  contract = new ethers.Contract(
    CONTRACT_ADDRESS,
    abi,
    provider
  );

  console.log("BOT RUNNING...");
}

init();

// =======================
// OWNER INFO
// =======================
async function getOwnerInfo(address) {

  if (ownerCache.has(address)) {
    return ownerCache.get(address);
  }

  let lastError;

  for (let attempt = 0; attempt < 3; attempt++) {

    try {

      const data = await withTimeout(
        contract.ownerInfo(address),
        5000
      );

      ownerCache.set(address, data);

      return data;

    } catch (e) {

      lastError = e;

      console.log(
        "Retry:",
        attempt + 1,
        address
      );

      await switchRPC();
    }
  }

  throw lastError;
}

// =======================
// MAIN CHECK
// =======================
async function checkUser(userAddress) {

  let current = userAddress;

  const visited = new Set();

  const balancedMap = new Map();

  while (
    current &&
    current !== ethers.ZeroAddress
  ) {

    if (visited.has(current)) {
      break;
    }

    visited.add(current);

    try {

      const info =
        await getOwnerInfo(current);

      const parent = info[7];

      if (
        !parent ||
        parent === ethers.ZeroAddress
      ) {
        break;
      }

      const parentInfo =
        await getOwnerInfo(parent);

      let left = Number(parentInfo[3]);
      let right = Number(parentInfo[4]);

      const isRight = info[6];

      if (isRight) {
        right++;
      } else {
        left++;
      }

      const before = Math.min(
        Number(parentInfo[3]),
        Number(parentInfo[4])
      );

      const after = Math.min(
        left,
        right
      );

      if (after > before) {

        balancedMap.set(
          parent,
          (balancedMap.get(parent) || 0) + 1
        );
      }

      current = parent;

    } catch (e) {

      console.log(
        "CHECK ERROR:",
        e.message
      );

      break;
    }
  }

  return balancedMap;
}

// =======================
// TELEGRAM
// =======================
bot.on("message", async (msg) => {

  const chatId = msg.chat.id;

  const text =
    (msg.text || "").trim();

  if (!ethers.isAddress(text)) {

    bot.sendMessage(
      chatId,
      " آدرس بفرست"
    );

    return;
  }

  bot.sendMessage(
    chatId,
    " در حال بررسی..."
  );

  try {

    const result =
      await checkUser(text);

    if (result.size === 0) {

      bot.sendMessage(
        chatId,
        "هیچ یوزری پیدا نشد"
      );

      return;
    }

    let output =
      "BALANCED USERS SUMMARY\n\n";

    let i = 1;

    for (const [address, count]
      of result.entries()) {

      output +=
        `${i}. ${address}\n`;

      output +=
        `Count: ${count}\n`;

      output +=
        "------------------\n";

      i++;
    }

    output +=
      `\nTOTAL USERS: ${result.size}`;

    if (output.length > 3900) {
      output =
        output.slice(0, 3900);
    }

    bot.sendMessage(
      chatId,
      output
    );

  } catch (err) {

    bot.sendMessage(
      chatId,
      "Error: " + err.message
    );
  }
});